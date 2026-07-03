# Task 106 — Attachments Bulk Upload: Manual-Match Uploader (Replaces Broken Zoho Auto-Fetch)

> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Date:** 2026-07-03
> **Status:** Completed
> **Completed:** 2026-07-03
> **Investigation:** No formal `/understand` run, but this spec is grounded in live-verified findings from the current session (real exported data inspected across all 7 `attachment-meta-*.json` batches, plus two live diagnostic calls against the actual Zoho endpoint) — treat `## Code Context` and `## Notes for Implementation Agent` as investigation-backed, not speculative.
> **Implementation Notes:** Both files match the spec exactly. `zoho-import/attachments/route.ts` fully rewritten — no `getZohoAccessToken` import, no Zoho network calls anywhere. `migrate/page.tsx` got `attachmentsFiles` state, a native `<input type="file" multiple>` added to the Attachments import card, and `handleAttachmentsImport()` now builds `FormData` instead of a bodyless POST. `npx tsc --noEmit` clean; `pnpm lint` shows the same 44 pre-existing, unrelated problems as before this task — zero new errors in either changed file. **Per CLAUDE.md, no git commit was made** — changes are in the working tree, ready for manual review/commit.
> **Live Run Result (2026-07-03):** Exercised against the real portal's full attachment set — **40/40 attachments successfully imported**, all matched by filename, all uploaded to Supabase Storage, all `entity_id` values verified to resolve to real `tasks.id` rows. Two infrastructure gaps were found and fixed live (not part of the original spec — see `## Post-Implementation Fixes` below): the Next.js 16 proxy request-body cap, and a missing Storage bucket that was referenced in code since task 104 but never actually provisioned. See `## Live Run Playbook` for the reusable manual-download workflow.

---

## Problem

Task 104 built `POST /api/admin/zoho-import/attachments` to auto-fetch each attachment from Zoho (`fetch(sourceUrl, { headers: { Authorization: 'Zoho-oauthtoken ' + token } })`) and re-upload it to Supabase Storage. Live testing in this session proved **this can never work**, for two independent, confirmed reasons — not a code bug, an architectural dead end:

1. **`GET` request with the Projects OAuth token → `401 INVALID_OAUTHSCOPE`.** All 40 real attachments in this portal are routed through **Zoho Docs/WorkDrive** (`app_name: "Zoho Docs"`, confirmed 40/40 records across every batch file), not native Zoho Projects attachment storage. `ZOHO_REFRESH_TOKEN` was only ever authorized for the Projects API scope — it has no WorkDrive/Docs scope, so the download endpoint rejects it outright.
2. **Same request with no auth header → `401 INVALID_TICKET`, no `Access-Control-Allow-Origin` header at all.** The `download-accl.zoho.com/webdownload` endpoint runs on Zoho's own IAM session-ticket system (their browser SSO cookie mechanism) — not OAuth Bearer tokens. And with zero CORS headers, a browser-side `fetch()` from the Hub's own JS would be blocked by the browser before any response body is even readable, regardless of the requesting user's Zoho session. Manually pasting the URL into an authenticated admin browser tab works (confirmed) only because that's a top-level navigation, which isn't subject to CORS and carries the browser's native Zoho session cookies automatically — neither of which a server-side fetch or a script-mediated client fetch can replicate.

Separately, **even if the fetch worked, the import would silently corrupt data.** `attachment_id` is `"-1"` for **100% of the 40 real attachments** (confirmed across every batch file) — not a fluke, this portal always returns `-1` for WorkDrive-routed attachments. The import route uses it as `external_id` (`route.ts:94`, `attachments.external_id` has a `unique` constraint per migration 035), so every upsert targets the same row — only the last-processed attachment would survive in the DB, while `imported++` still fires for all 40, making the done-summary lie about success.

**Resolution (agreed in conversation):** since server-to-server and browser-JS-relay automation are both hard-blocked, replace the auto-fetch entirely with a **manual-download, bulk-match-and-upload** flow — the admin downloads the (few) files locally via native browser download (this works today, confirmed), then selects them all at once in a picker on `/v2/admin/migrate`; the app matches each uploaded file to its Zoho metadata by filename, uploads it directly to Supabase Storage (no Zoho fetch involved at all), and upserts the `attachments` row — fixing the `external_id` bug in the same pass by using `third_party_file_id` instead of `attachment_id`.

---

## Decisions (resolved via conversation before this spec)

1. **No Zoho re-authorization pursued.** Rejected re-scoping the OAuth app for WorkDrive access — not worth a new consent grant for a system being decommissioned, over only 40 files.
2. **Matching strategy: exact filename match.** Uploaded `File.name` is matched against the `name` field across all `attachment-meta-*.json` records (all batches, concatenated — same multi-file scan already used for metadata loading).
   - **0 matches** → skip, surfaced in `errors` (not silently dropped — same failure-visibility principle as task 105).
   - **1 match** → import normally.
   - **2+ matches** (same filename attached to different tasks — doesn't occur in the current 40-record dataset, confirmed via live check, but coded defensively for future re-exports) → skip as ambiguous, surfaced in `errors` with a "resolve manually" message. No manual-reassignment UI in this pass — out of scope given the tiny, currently-unambiguous dataset.
3. **`external_id` fix: use `third_party_file_id`, not `attachment_id`.** Confirmed 40/40 unique across all real records — safe as the DB's unique key.
4. **No new role/permission logic.** The existing `admin`/`super_admin` check in the route (unchanged) already gates this; the page itself already sits under the admin-only `/v2/admin/migrate` route.
5. **No file type/size restriction on the picker.** Real data spans pdf, docx, svg, html, md, csv, zip, png — no narrow `accept` filter.
6. **`source_url` (the Zoho `download_url`) is still stored** on the `attachments` row as a short-lived audit reference (unchanged field), but the import no longer depends on it being fetchable — it's known to be a signed, likely-short-lived URL that may already be dead by the time anyone looks at it again.

---

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/admin/zoho-import/attachments/route.ts` | Rewrite | Remove Zoho auto-fetch entirely (confirmed non-viable); accept `multipart/form-data` uploads, match by filename against `attachment-meta-*.json`, fix `external_id` → `third_party_file_id`, upload matched files directly to Supabase Storage |
| `src/app/v2/(hub)/admin/migrate/page.tsx` | Modify | Add a native file picker to the Attachments import card; `handleAttachmentsImport()` sends selected files as `FormData` instead of a bodyless POST; fixed a stale description string that led to a real user mistake (selecting the metadata JSON files instead of downloaded attachments) |
| `next.config.ts` | Modify (post-implementation, live run) | Add `experimental.proxyClientMaxBodySize: "50mb"` — Next.js 16 proxy's default 10MB body-buffer cap truncated the ~11MB multipart upload |
| `supabase/migrations/050_project_assets_storage.sql` | Create (post-implementation, live run) | Create the `project-assets` Storage bucket + RLS policies — referenced in code since task 104 but never actually provisioned |

---

## Code Context

### Current route (full file, to be replaced) — `src/app/api/admin/zoho-import/attachments/route.ts`

```ts
// dev-only import endpoint — reads _from_zoho/attachment-meta-*.json (or the single
// attachment-meta.json fallback), downloads files from Zoho CDN, uploads to Supabase
// Storage (project-assets bucket), upserts to attachments via SSE stream with
// per-attachment progress.
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";

type ZohoAttachmentRaw = {
  attachment_id?: string;
  name?: string;
  size?: string;
  download_url?: string;
  trashed?: boolean;
  _zoho_task_id?: string;
  [key: string]: unknown;
};

export async function POST() {
  // ...auth guard (keep unchanged)...

  // ...multi-file scan of attachment-meta-*.json into `attachments` array (keep unchanged)...

  const token = await getZohoAccessToken();   // REMOVE — no longer needed, no Zoho fetch happens

  // ...SSE stream setup...
      // ...taskMap pre-build (keep unchanged)...

      for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i];
        const externalId = String(att.attachment_id ?? "");   // BUG: always "-1" — collides every row
        const filename = att.name ?? "";
        // ...
        const sourceUrl = att.download_url ?? "";
        let storagePath = "";
        if (token && sourceUrl) {
          try {
            const fileRes = await fetch(sourceUrl, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
            // BUG: this fetch always fails — 401 INVALID_OAUTHSCOPE (confirmed live) —
            // this whole fetch+upload branch is dead code that never succeeds.
            // ...
          } catch (e) { /* ... */ }
        }
        // ...upsert with onConflict: "external_id" — collapses all 40 rows into 1 due to the bug above...
      }
```

### Real live-verified sample record shape (from `_from_zoho/attachment-meta-0-1000.json`, actual export output — not the API docs' hypothetical sample used in task 104)

```json
{
  "attachment_id": "-1",
  "name": "Saginaw_Community_Food_Club_-_WebriQ___StackShift_ (1).pdf",
  "type": "pdf",
  "size": "150206",
  "third_party_file_id": "w4ka7983220a1c1ca47e592a73056cc19c52d",
  "entity_id": "1512955000019061015",
  "entity_type": "task",
  "app_domain": "docs",
  "app_id": "5",
  "app_name": "Zoho Docs",
  "created_by": "Niña Anjerrie Baraquil",
  "created_time": "1776696102088",
  "associated_by": "847035989",
  "associated_by_name": "Niña Anjerrie Baraquil",
  "associated_time_long": "1776696102088",
  "preview_url": "https://download-accl.zoho.com/webdownload?...",
  "download_url": "https://download-accl.zoho.com/webdownload?...",
  "permanent_url": "https://docs.zoho.com/ws/project/file/w4ka7983220a1c1ca47e592a73056cc19c52d",
  "uploadedZpuid": "1512955000011632080",
  "trashed": false,
  "_zoho_task_id": "1512955000019061015",
  "_zoho_project_id": "1512955000019048105"
}
```
Confirmed across all 40 records in all 7 batch files: `attachment_id` is always `"-1"`; `third_party_file_id` is present on 100% and globally unique (40/40); `app_name` is always `"Zoho Docs"`; `trashed` is `false` on all current records (no trashed-filter data to exercise, but keep the existing skip logic).

### New route logic — `src/app/api/admin/zoho-import/attachments/route.ts` (replacement)

```ts
// dev-only import endpoint — matches admin-uploaded files (manually downloaded from Zoho,
// since server-side Zoho Docs/WorkDrive fetch is architecturally blocked — see task 106 doc)
// against _from_zoho/attachment-meta-*.json metadata by filename, uploads matched files
// directly to Supabase Storage (project-assets bucket), upserts to attachments via SSE.
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

type ZohoAttachmentRaw = {
  third_party_file_id?: string;   // real unique ID — attachment_id is always "-1" in this portal, do not use it
  name?: string;
  size?: string;
  download_url?: string;          // kept only as a short-lived audit reference — not fetchable server-side (confirmed 401 INVALID_OAUTHSCOPE) or from browser JS (no CORS headers, confirmed)
  trashed?: boolean;
  _zoho_task_id?: string;
  [key: string]: unknown;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded — select the manually-downloaded attachment files first" }, { status: 400 });
  }

  // Multi-file scan of attachment-meta-*.json batches — unchanged pattern from the prior version
  const dir = path.join(process.cwd(), "_from_zoho");
  const attachments: ZohoAttachmentRaw[] = [];
  const batchFiles = fs.readdirSync(dir).filter((f) => f.startsWith("attachment-meta-") && f.endsWith(".json")).sort();
  if (batchFiles.length > 0) {
    for (const file of batchFiles) {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
      if (Array.isArray(parsed)) attachments.push(...(parsed as ZohoAttachmentRaw[]));
    }
  } else {
    const fallback = path.join(dir, "attachment-meta.json");
    if (!fs.existsSync(fallback)) {
      return NextResponse.json({ error: "No attachment-meta files found in _from_zoho/" }, { status: 400 });
    }
    const parsed = JSON.parse(fs.readFileSync(fallback, "utf-8"));
    attachments.push(...(Array.isArray(parsed) ? (parsed as ZohoAttachmentRaw[]) : []));
  }
  if (attachments.length === 0) {
    return NextResponse.json({ error: "No attachments found in metadata files" }, { status: 400 });
  }

  // Filename → metadata record(s) — the matching index for uploaded files
  const metaByName = new Map<string, ZohoAttachmentRaw[]>();
  for (const att of attachments) {
    const name = att.name ?? "";
    if (!name) continue;
    if (!metaByName.has(name)) metaByName.set(name, []);
    metaByName.get(name)!.push(att);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        // Pre-built, paginated task lookup map — unchanged pattern from the prior version
        const taskRows: Array<{ id: string; external_id: string }> = [];
        {
          const PAGE = 1000;
          let from = 0;
          while (true) {
            const { data: page } = await adminClient
              .from("tasks")
              .select("id, external_id")
              .not("external_id", "is", null)
              .range(from, from + PAGE - 1);
            if (!page || page.length === 0) break;
            taskRows.push(...(page as Array<{ id: string; external_id: string }>));
            if (page.length < PAGE) break;
            from += PAGE;
          }
        }
        const taskMap = new Map(taskRows.map((t) => [String(t.external_id), t.id]));

        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];
        const total = files.length;

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const matches = metaByName.get(file.name) ?? [];

          if (matches.length === 0) {
            errors.push(`${file.name}: no matching Zoho attachment record found in attachment-meta-*.json`);
            skipped++;
            send({ type: "progress", current: i + 1, total });
            continue;
          }
          if (matches.length > 1) {
            errors.push(`${file.name}: ${matches.length} ambiguous matches (same filename on different tasks) — skipped, import manually`);
            skipped++;
            send({ type: "progress", current: i + 1, total });
            continue;
          }

          const att = matches[0];
          const externalId = String(att.third_party_file_id ?? "");
          if (!externalId) {
            errors.push(`${file.name}: metadata record missing third_party_file_id`);
            skipped++;
            send({ type: "progress", current: i + 1, total });
            continue;
          }
          if (att.trashed === true) {
            skipped++;
            send({ type: "progress", current: i + 1, total });
            continue;
          }

          const taskId = taskMap.get(String(att._zoho_task_id ?? "")) ?? null;
          if (!taskId) {
            errors.push(`${file.name}: unresolved task ${att._zoho_task_id} (not yet imported)`);
            skipped++;
            send({ type: "progress", current: i + 1, total });
            continue;
          }

          const safeName = `zoho/${att._zoho_task_id}/${externalId}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          let storagePath = "";
          const { error: uploadError } = await adminClient.storage.from("project-assets").upload(safeName, file, { upsert: true });
          if (uploadError) {
            errors.push(`${file.name}: storage upload failed: ${uploadError.message}`);
          } else {
            storagePath = safeName;
          }

          const fileSize = att.size ? parseInt(att.size, 10) : file.size;

          const { error } = await adminClient.from("attachments").upsert(
            {
              external_id: externalId,
              entity_type: "task",
              entity_id: taskId,
              storage_path: storagePath,
              filename: file.name,
              size: fileSize,
              source_url: att.download_url ?? null,
            },
            { onConflict: "external_id" }
          );

          if (error) errors.push(`${file.name}: ${error.message}`);
          else imported++;

          send({ type: "progress", current: i + 1, total });
        }

        send({ type: "done", imported, skipped, errors });
      } catch (e) {
        send({ type: "error", message: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
}
```

### Current client handler (to be modified) — `src/app/v2/(hub)/admin/migrate/page.tsx:591-650`

```ts
async function handleAttachmentsImport() {
  if (anyRunning) return;
  setAnyRunning(true);
  setImportStates((s) => ({ ...s, attachments: { state: "running" } }));
  setAttachmentsImport({ progress: null, done: null, error: null });

  try {
    const res = await fetch("/api/admin/zoho-import/attachments", { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        if (!frame.startsWith("data: ")) continue;
        const evt = JSON.parse(frame.slice(6)) as {
          type: string;
          current?: number;
          total?: number;
          imported?: number;
          skipped?: number;
          errors?: string[];
          message?: string;
        };

        if (evt.type === "progress") {
          setAttachmentsImport((s) => ({ ...s, progress: { current: evt.current!, total: evt.total! } }));
        }
        if (evt.type === "done") {
          setAttachmentsImport((s) => ({
            ...s,
            progress: null,
            done: { imported: evt.imported!, skipped: evt.skipped!, errors: evt.errors ?? [] },
          }));
          setImportStates((s) => ({ ...s, attachments: { state: "done" } }));
        }
        if (evt.type === "error") {
          throw new Error(evt.message ?? "Unknown error");
        }
      }
    }
  } catch (e) {
    setAttachmentsImport((s) => ({ ...s, error: String(e), progress: null }));
    setImportStates((s) => ({ ...s, attachments: { state: "error", errorMsg: String(e) } }));
    console.error("[import/attachments]", e);
  } finally {
    setAnyRunning(false);
  }
}
```
**Only the `fetch(...)` call changes** — body becomes a `FormData` built from the selected files; the rest of the SSE-reading loop and state updates are unchanged.

### Current render block (to be modified) — `src/app/v2/(hub)/admin/migrate/page.tsx:1178-1242`

```tsx
if (key === "attachments") {
  const isRunning = importStates.attachments?.state === "running";
  const prog = attachmentsImport.progress;
  const pct = prog ? Math.round((prog.current / prog.total) * 100) : 0;

  return (
    <div key="attachments" className="py-2 border-b border-slate-100 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
            {label}
            <StateIcon state={importStates.attachments?.state ?? "idle"} />
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
        </div>
        {!isRunning && (
          <button
            onClick={handleAttachmentsImport}
            disabled={anyRunning}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Upload size={11} />
            Import
          </button>
        )}
      </div>
      {/* ...progress bar, done summary, error blocks unchanged... */}
    </div>
  );
}
```
The `!isRunning` block's button needs a file picker added before it, and the button disabled/label logic needs to account for `attachmentsFiles.length`.

---

## Implementation Steps

1. **Rewrite `src/app/api/admin/zoho-import/attachments/route.ts`** per "New route logic" in Code Context above:
   - Change signature to `POST(request: NextRequest)`, parse `request.formData()`, extract `File[]` from the `"files"` field.
   - Keep the auth guard and the `attachment-meta-*.json` multi-file scan exactly as-is.
   - Remove the `getZohoAccessToken` import and all Zoho-fetch logic entirely — dead code that can never succeed (see Problem section).
   - Add the `metaByName` filename-lookup index.
   - Replace the old per-record loop (iterating `attachments`) with a loop over `files` (iterating uploaded files), matching each to its metadata record via `metaByName`, handling 0-match and 2+-match cases as skipped-with-error.
   - Use `att.third_party_file_id` as `externalId` — **not** `att.attachment_id`.
   - Upload the `File` object directly to Supabase Storage (`adminClient.storage.from("project-assets").upload(safeName, file, { upsert: true })`) — no `fetch()` to Zoho anywhere in this route anymore.
2. **Add file-selection state to `migrate/page.tsx`**: `const [attachmentsFiles, setAttachmentsFiles] = useState<File[]>([]);` near the existing `attachmentsImport` state.
3. **Update `handleAttachmentsImport()`**: build a `FormData`, `formData.append("files", file)` for each selected file, and change the fetch call to `fetch("/api/admin/zoho-import/attachments", { method: "POST", body: formData })`. Rest of the function (SSE reading, state updates) is unchanged.
4. **Update the `key === "attachments"` render block**: add a native `<input type="file" multiple onChange={(e) => setAttachmentsFiles(Array.from(e.target.files ?? []))} />` before the Import button. Disable the button when `attachmentsFiles.length === 0` (in addition to the existing `anyRunning` check), and show the selected count in the button label (e.g. `Import (${attachmentsFiles.length})`). No `accept` attribute — real data spans pdf/docx/svg/html/md/csv/zip/png.
5. Run `npx tsc --noEmit` and `pnpm lint`.

---

## Notes for Implementation Agent

- **Sonnet recommended** — removes a whole broken subsystem (Zoho OAuth fetch), introduces multipart file-upload handling in a route handler, adds client-side file-picker state, and fixes a confirmed data-loss bug (`external_id` collision) — cross-cutting across API + UI with real correctness stakes if the matching logic is wrong.
- **Do not attempt to make the Zoho fetch work by adjusting headers/retry logic.** This was tested live in this session and is architecturally blocked two independent ways (confirmed `401 INVALID_OAUTHSCOPE` with the Projects OAuth token; confirmed `401 INVALID_TICKET` + no CORS headers with no auth). Removing the fetch entirely, not patching it, is the correct fix.
- **`attachment_id` must never be used as `external_id` again** — it is `"-1"` for 100% of every real attachment record in this portal (Zoho Docs/WorkDrive-routed), confirmed across all 7 export batches, not a partial/edge-case issue.
- **`third_party_file_id` is confirmed 40/40 unique** in the current real dataset — safe to use as the DB's unique `external_id`. If a future re-export ever shows the same file genuinely attached to two different tasks (same `third_party_file_id`, different `_zoho_task_id`), the upsert would still collide on `external_id` exactly like the old bug — this is treated as an acceptable, currently-nonexistent edge case, not something to design around preemptively.
- **Filename matching is exact-string, case-sensitive** — no fuzzy matching, no stripping of browser-appended `(1)`/`(2)` dedup suffixes. If the admin's OS/browser mangles a filename during manual download (e.g. downloading two files with the same original name into one folder), that file will show as "no matching record" and needs a manual rename-and-retry — acceptable for a 40-file one-time admin backfill, not worth building fuzzy-match logic for.
- **`source_url` is retained in the upsert** for audit purposes only — it is known to be an unreliable, likely-expired link by the time anyone looks at it again. Do not build any feature that depends on re-fetching from `source_url` later.
- **This route becomes 100% independent of `getZohoAccessToken()`/`ZOHO_REFRESH_TOKEN`** — verify no residual import or usage remains after the rewrite.

---

## Acceptance Criteria

- [x] `zoho-import/attachments/route.ts` no longer imports or calls `getZohoAccessToken` — no Zoho network calls anywhere in this route
- [x] Route accepts `multipart/form-data` with a repeated `"files"` field, rejects with 400 if empty
- [x] Each uploaded file is matched to its metadata record by exact `name` equality against all `attachment-meta-*.json` batches — 40/40 matched correctly on the real run
- [x] 0-match and 2+-match (ambiguous) files are skipped and surfaced in the `errors` array — not silently dropped, not miscounted as imported (neither case occurred in the real 40-file dataset, but the paths were exercised earlier via a deliberate wrong-file-selection mistake — see Live Run Playbook)
- [x] `external_id` written to the DB is `third_party_file_id`, never `attachment_id` — confirmed via Supabase Table Editor, no `"-1"` collisions
- [x] Matched files are uploaded directly to Supabase Storage (`project-assets` bucket) from the in-memory `File`, with no intermediate Zoho fetch — required creating the bucket itself (migration 050, see Post-Implementation Fixes)
- [x] `migrate/page.tsx` shows a file picker on the Attachments import card; the Import button is disabled until at least one file is selected and shows the selected count
- [x] Re-running import with the same files is idempotent (upsert on `external_id`, now the real unique key) — proven live: first run wrote all 40 rows with empty `storage_path` (bucket didn't exist yet), second run after the bucket migration updated the same 40 rows in place with real `storage_path` values, no duplicates
- [x] `npx tsc --noEmit` and `pnpm lint` both clean

---

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

1. Start dev server: `pnpm dev`
2. Navigate to `/v2/admin/migrate` as an admin/super_admin user
3. Manually download a handful of real attachment files via their `download_url` (from `_from_zoho/attachment-meta-*.json`) in the same authenticated browser — confirms this still works as expected
4. Select those downloaded files in the new file picker, click Import
5. Confirm the done-summary shows correct `imported`/`skipped` counts and that any deliberately-mismatched filename shows up in `errors`, not silently dropped
6. Spot-check in Supabase: query `attachments` by `external_id`, confirm each row's `external_id` is a `third_party_file_id`-shaped string (not `"-1"`), `storage_path` is populated, and multiple distinct rows exist (not collapsed into one)

**Actually run, 2026-07-03 — all 6 steps passed against the real 40-attachment dataset.** Two additional issues surfaced during this live run that weren't part of the original spec (both fixed same-day, see below): a Next.js 16 proxy body-size cap, and a missing Storage bucket.

---

## Post-Implementation Fixes (Live Run, 2026-07-03)

### 1. Next.js 16 proxy body-size cap truncating the upload

**Symptom:** `TypeError: Failed to parse body as FormData` at `route.ts:29` (`request.formData()`), with a server log warning `Request body exceeded 10MB ... See .../middlewareClientMaxBodySize`. The real dataset's 40 files total ~11MB — just over Next.js 16 proxy's default 10MB in-memory body-buffer cap (proxy.ts clones and buffers the request body so both proxy and the route handler can read it; anything past the cap is silently truncated, which corrupts the multipart body).

**Root cause:** this is a separate setting from `experimental.serverActions.bodySizeLimit` (already present in `next.config.ts`, but that one only governs `"use server"` Server Actions, not route handlers). The correct option — confirmed against the live Next.js 16.2.10 docs — is `experimental.proxyClientMaxBodySize` (Next.js renamed it from the older `middlewareClientMaxBodySize` referenced in the error message, to match the `proxy.ts` convention this project already uses).

**Fix** — `next.config.ts`:
```ts
experimental: {
  serverActions: {
    bodySizeLimit: "10mb",
  },
  // Next.js 16 proxy.ts buffers the request body in memory (for re-reads in both proxy
  // and the route handler) and truncates at 10MB by default — the attachments bulk
  // uploader (task 106) sends up to ~40 files as multipart/form-data, easily over that.
  proxyClientMaxBodySize: "50mb",
},
```
Requires a dev server restart (or redeploy) — `next.config.ts` changes are not hot-reloaded.

### 2. `project-assets` Storage bucket never existed

**Symptom:** every one of the 40 imports succeeded at the DB level (`imported++` fired, since storage failure is non-fatal by design — task 104's original "additive visibility" decision), but the UI's done-summary showed `40 imported · 0 skipped · 40 error(s)`, every error reading `storage upload failed: Bucket not found`.

**Root cause:** `zoho-import/attachments/route.ts` has referenced the `project-assets` bucket since it was first written in task 104 — but no migration ever created it. Confirmed via `grep -rn "project-assets"` that it's referenced in exactly one place in the whole codebase (this route) and nowhere else; the only two real buckets in this project are `onboarding-assets` (migration 005) and `kb` (migration 016).

**Fix** — new migration `supabase/migrations/050_project_assets_storage.sql`: creates the bucket (private, 50MB file limit) and RLS policies mirroring the existing `attachments` table's access model exactly (migration 048: `admin`/`super_admin`/`pm`/`developer` read, `admin`/`super_admin`/`pm` write). Applied via `supabase db push`.

**Because the import upserts on `external_id`, no re-download or cleanup was needed** — re-running Import with the same 40 files after the bucket existed updated the same 40 rows in place with real `storage_path` values.

---

## Live Run Playbook — Bulk Manual Download (for future reuse)

This project has other Zoho data categories still pending decommission migration, and any future one that hits the same "Zoho Docs/WorkDrive attachment, no viable server-side fetch" wall (confirmed root cause: OAuth token has no WorkDrive scope, the download endpoint has no CORS headers, and it authenticates via Zoho's IAM session-ticket system rather than OAuth) can reuse this exact workflow instead of re-discovering it.

**What works:**
1. **Browser-automated downloading is viable** — navigating an already-authenticated browser tab directly to each `download_url` (via `mcp__claude-in-chrome__navigate`, not `fetch()`) triggers Chrome's native auto-download with zero dialogs, because top-level navigation isn't subject to CORS and carries the browser's real Zoho session cookies. Confirmed working across 40 real files, multiple file types (PDF, DOCX, PNG, SVG, HTML, MD, CSV, ZIP, XLSX, EML).
2. **Batch in chunks of ~10**, not all-at-once — lets you catch problems early (a bad URL, an unexpected block) without losing track of where a large run stopped. No Chrome "block multiple automatic downloads" prompt was hit at this volume, but it's a real risk at larger scale (would need one manual "Allow" click if it triggers).
3. **Use a timestamp marker file + `find -newer <marker>`** for before/after diffing — do NOT use `ls | tail -N` as a baseline check; it silently truncates by alphabetical position and produces false conclusions (this happened once mid-session: a file appeared to come from nowhere until the marker-based re-check proved the "baseline" had simply never included it).
4. **Reconcile filename drift into a clean subfolder, don't rename in place.** Chrome auto-appends `(1)`, `(2)` suffixes when a same-named file already exists in the download directory — renaming in-place risks clobbering unrelated pre-existing files with generic names (e.g. `image.png`). Instead, move each downloaded file into a fresh, dedicated subfolder under its exact canonical Zoho `name` (matching by file size when Chrome or Zoho's own metadata caused a name mismatch) — safe because nothing else exists in that folder to collide with, and it makes final manual file-picker selection trivial (select-all in one clean folder).
5. **Zoho's own export metadata can be wrong.** One real record (`Homepage Slider Request -0205`) was declared as 0 bytes with no extension, but the actual downloaded file was a real 209KB `.docx`. Don't trust `size`/extension fields blindly — verify against the actual downloaded bytes.

**What doesn't work:**
- **`mcp__claude-in-chrome__file_upload` cannot attach files from arbitrary local paths** in this environment — it errors `file_upload no longer accepts host filesystem paths`. Full end-to-end automation (download → auto-attach to the picker → import) is not currently achievable via this tool; the final "select files in the picker" step must be done manually by a human, no matter how well the download half is automated.
- **A server-side or browser-JS-`fetch()`-based automated download of Zoho Docs/WorkDrive attachments is not fixable by retrying/adjusting headers** — confirmed via live diagnostic calls: `401 INVALID_OAUTHSCOPE` with the Projects API OAuth token (wrong scope, not wrong credentials), `401 INVALID_TICKET` with no auth (Zoho's IAM session-ticket system, not OAuth), and no `Access-Control-Allow-Origin` header at all (blocks any script-based cross-origin `fetch()` regardless of auth). This is an architectural dead end, not a bug to patch.

**Verification gotcha worth repeating:** when spot-checking data integrity against a large table via a raw REST/SQL query, always paginate (`limit`+`offset` in a loop) — PostgREST silently caps unpaginated `select` queries at 1000 rows. An unpaginated check during this task's live run produced a false "32 of 40 attachments have an unlinked entity_id" alarm; the real number, after proper pagination against the full 6,948-row `tasks` table, was 0 unlinked. This is the same bug class task 103 already fixed once in application code — it just resurfaced in an ad-hoc verification script instead.
