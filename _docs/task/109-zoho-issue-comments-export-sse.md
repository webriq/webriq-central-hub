# Task 109 — Zoho Issue Comments Export: Per-Issue SSE Streaming

> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Date:** 2026-07-06
> **Status:** Completed
> **Completed:** 2026-07-06
> **Implementation Notes:** Both planned file changes made exactly as specced, no deviations. `src/app/api/admin/zoho-export/issue-comments/route.ts` created verbatim from Code Context — SSE stream, multi-file `issues-*.json` scan (fallback `issues.json`), per-issue pagination via `fetchZohoWithRetry`, `failed_issue_ids` threaded through the `done` event. `src/app/v2/(hub)/admin/migrate/page.tsx` got all 5 additions verbatim: `IssueCommentsExportState` interface (after `CommentsExportState`), `EXPORT_LEVELS` entry (after `comments`, before `timelogs`), `issueCommentsExport` state hook (after `commentsExport`), `handleIssueCommentsExport()` (after `handleCommentsExport()` closes), and the `key === "issue-comments"` JSX block (after the `comments` block, before `timelogs`) — all hyphenated-key state access uses bracket notation (`exportStates["issue-comments"]`) per the doc's explicit note and the existing `attachment-meta` precedent. `IMPORT_LEVELS` was not touched — export-only scope confirmed, no new table/import route/migration created. `npx tsc --noEmit` clean. `pnpm lint` reports 8 pre-existing errors/36 warnings in unrelated files (`_list-view.tsx`, `theme-toggle.tsx`, `sanity/index.ts`, etc.) — confirmed via `pnpm lint | grep` that zero of them touch `issue-comments` or `migrate/page`; both changed files are lint-clean. **Per CLAUDE.md, no git commit was made** (user manages all version control manually) and this implementation ran directly on `main`, no worktree.
>
> **Bug found on first live run and fixed:** the first real run against the portal tripped Zoho's `URL_ROLLING_THROTTLES_LIMIT_EXCEEDED` throttle right at **issue 200 of 1049** — an exact match for Zoho's documented ~200-requests-per-2-minutes rolling limit on a given endpoint pattern. Root cause: this route's inter-issue pacing (`sleep(200)`) was copied directly from the older Task Comments export (`comments/route.ts`), which predates this failure mode being discovered. Tasks 104/105 already hit this exact throttle on `timelogs`/`attachment-meta` and calibrated a proven-safe cadence — `sleep(700)` between requests, documented inline as `// stay under Zoho's 200 req/2 min rolling limit — same calibration as timelogs export` — which this route's original `sleep(100)` (inter-page) and `sleep(200)` (inter-issue) delays did not follow. Fixed by raising both to `sleep(700)` with the same inline comment, matching the established convention exactly. `fetchZohoWithRetry`'s reactive backoff (9/12/15 min) was already working as designed and is what surfaced the problem cleanly instead of silently failing — the fix here is proactive pacing, not the retry logic itself. `npx tsc --noEmit` clean after the fix.
> **Re-run at `sleep(700)` also tripped at issue 200 of 1049 — the "2 min" window assumption was wrong for this endpoint.** The `sleep(100)`→`sleep(700)` fix (3.5x slower pacing) made **no difference** to the trip point: both the original `sleep(200)` run and the fixed `sleep(700)` run stopped at the identical issue count (200), despite the slower run taking ~3.5x longer in wall-clock time (~140s vs ~40s) to get there. This proved the `// stay under Zoho's 200 req/2 min rolling limit` comment inherited from `timelogs`/`attachment-meta` (tasks 104/105) is an inaccurate approximation for *this* endpoint (`issues/{id}/comments`) — the real rolling window here is longer than 2 minutes, since both a ~40s and a ~140s run landed inside it equally.
> **Resolution: no further pacing change was needed — `fetchZohoWithRetry`'s existing bounded backoff carried the run through on its own.** Rather than guess a third sleep value blind, the live test was left to run its course through the built-in retry (9min → 12min → 15min escalating backoff, up to 3 attempts per throttled request). The export **completed successfully end-to-end** after riding through the throttle pause(s) — final live result: **2285 comments downloaded**, no restart required, confirming the reactive retry-and-continue mechanism (not proactive pacing) is what actually makes this route reliable against Zoho's real-world throttle behavior on this endpoint. The `sleep(700)` pacing is kept as a reasonable baseline (better than the original `sleep(200)`) but is not what resolved the throttle — the bounded backoff in `fetchZohoWithRetry` is the load-bearing safety net here, exactly as task 105 designed it to be. No code changes beyond the earlier `sleep(700)` fix were required to reach a successful full run.
> **Live Run Result (2026-07-06):** **2285 issue comments exported and downloaded successfully** (`issue-comments.json`), full 1049-issue portal set, surviving at least one rolling-throttle backoff cycle mid-run without manual intervention. `npx tsc --noEmit` clean throughout.
> **Investigation:** No formal `/understand` run. Spec is grounded in reading the real implementation of both source patterns in full: `zoho-export/comments/route.ts`, `zoho-import/comments/route.ts`, `zoho-export/issues/route.ts` (task 107), `zoho-import/issues/route.ts` (task 108), `src/lib/zoho/index.ts` (`fetchZohoWithRetry`), and the relevant slices of `migrate/page.tsx` (state interfaces, `EXPORT_LEVELS`, `handleCommentsExport`, and the per-key JSX render blocks). Treat `## Code Context` as grounded, not speculative.

---

## Overview

Add a new export endpoint that pulls **Issue Comments** from Zoho Projects, using the exact same mechanism as the existing Task Comments export (`zoho-export/comments/route.ts`, task 101) — an SSE stream, iterated per-entity, paginated with `page_info.has_next_page` — but scoped to **issues** instead of **tasks**, and sourced from the issues data already exported by task 107 (`_from_zoho/issues-*.json`).

Zoho endpoint (per the official API docs, confirmed via screenshots supplied by the user):

```
GET /api/v3/portal/{portalId}/projects/{projectId}/issues/{issueId}/comments
```

Query params used: `page`, `per_page` (matches how the existing Task Comments export calls the equivalent Task endpoint — no `sort_by`/`filter` params are used there either, so none are added here for consistency).

**Scope is export-only**, mirroring how this codebase already split Issues into two separate tasks — export (107) then import (108). A follow-up **Issue Comments Import** task (new `issue_comments` table + import route + a `resolveIssueId` helper) is natural future work once this export is verified live, but is out of scope here. See Notes for Implementation Agent.

**Decisions made during scoping:**

1. **Source data is `_from_zoho/issues-*.json` (multi-file scan), not a single `issues.json`.** Task 107's Issues export supports `from`/`to`/`since` slicing and can produce multiple files (e.g. `issues-0-50-2025.json`). This route must scan and concatenate all `issues-*.json` files (falling back to a single `issues.json`), using the exact same filter/scan logic task 108's Issues import already established (`f.startsWith("issues-") && f.endsWith(".json")`, `.sort()` for deterministic order).
2. **Use `fetchZohoWithRetry` instead of the older inline 429-only retry that Task Comments export still uses.** Task Comments export (`comments/route.ts`) predates the shared retry helper and only handles a single 429 retry. CLAUDE.md documents `fetchZohoWithRetry` as the current standard for `zoho-export` routes ("used by attachment-meta, timelogs, and issues routes") — it adds bounded rolling-throttle backoff and 401 token-refresh, both of which task 105 added after a real failure in the Attachments export. A brand-new route should use the current best practice, not reproduce the gap that hasn't been backported to Comments export yet. This also means picking up `throttleExhausted` → a `failed_issue_ids` list in the `done` event, mirroring task 107's `failed_project_ids`.
3. **No `from`/`to`/`since` slicing on this route itself.** Task Comments export has none (a single unified SSE run over every task, downloading one `comments.json`), and the real portal only has ~1049 issues total (per task 108's live run) — an even smaller volume than the ~6,946 tasks Task Comments export already handles unsliced. Slicing input (`issues-0-50-2025.json`, `issues-50-100-2025.json`, etc.) already exists at the issues-export layer if a partial run is ever needed; this route just consumes whatever issue files are present.
4. **Tag each comment with `_zoho_issue_id` and `_zoho_project_id`**, exactly as Task Comments export tags `_zoho_task_id`/`_zoho_project_id` — required by a future import route to resolve the `issue_id` FK, same pattern `resolveTaskId` relies on today.
5. **Response field name difference is a known, deliberately unhandled quirk for this task:** Zoho's Issue Comments response uses `added_by`/`last_modified_by` (per the user-supplied sample response), where Task Comments' response uses `created_by`. This export route does not need to touch comment fields at all (it passes the whole object through via `{ ...c, _zoho_issue_id, _zoho_project_id }`), so this doesn't affect this task — but flag it for whoever writes the import route later, since `zoho-import/comments/route.ts` reads `c.created_by` and a naive copy-paste would silently read `undefined`.

---

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/admin/zoho-export/issue-comments/route.ts` | Create | New SSE export route — per-issue comment pagination, `fetchZohoWithRetry` |
| `src/app/v2/(hub)/admin/migrate/page.tsx` | Modify | Add `IssueCommentsExportState` interface, `EXPORT_LEVELS` entry, `issueCommentsExport` state, `handleIssueCommentsExport()`, and a `key === "issue-comments"` JSX render block |

---

## Code Context

### New route — `src/app/api/admin/zoho-export/issue-comments/route.ts` (full file, new)

```ts
// dev-only export endpoint — SSE stream of comments per issue from issues-*.json.
// Requires issues to be exported first (task 107). Paginates per issue using page_info.has_next_page.
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken, fetchZohoWithRetry } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type RawIssue = { id?: string; id_string?: string; _zoho_project_id?: string; [key: string]: unknown };

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  let token = await getZohoAccessToken();
  if (!token) return new Response(JSON.stringify({ error: "No Zoho token" }), { status: 502 });

  // Multi-file scan: pick up all issues-*.json batch files (task 107's export can slice by from/to),
  // sorted for deterministic order; falls back to a single issues.json.
  const fromZoho = path.join(process.cwd(), "_from_zoho");
  const allFiles = fs.existsSync(fromZoho) ? fs.readdirSync(fromZoho) : [];
  const issueFiles = allFiles
    .filter((f) => (f.startsWith("issues-") && f.endsWith(".json")) || f === "issues.json")
    .sort()
    .map((f) => path.join(fromZoho, f));

  if (issueFiles.length === 0) {
    return new Response(
      JSON.stringify({ error: "No issues files found in _from_zoho/ — export issues first" }),
      { status: 400 }
    );
  }

  const issues = issueFiles.flatMap(
    (f) => JSON.parse(fs.readFileSync(f, "utf-8")) as RawIssue[]
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let totalComments = 0;
      const failedIssueIds: string[] = [];

      for (let i = 0; i < issues.length; i++) {
        const issue = issues[i];
        const issueId = String(issue.id_string ?? issue.id);
        const projectId = String(issue._zoho_project_id ?? "");
        if (!issueId || !projectId) continue;

        const issueComments: Array<Record<string, unknown>> = [];
        let page = 1;

        while (true) {
          const qp = new URLSearchParams({ page: String(page), per_page: "100" });
          const url = `${BASE}/projects/${projectId}/issues/${issueId}/comments?${qp}`;
          const { res, token: newToken, throttleExhausted } = await fetchZohoWithRetry(url, token, { label: "issue-comments" });
          token = newToken;

          if (throttleExhausted) {
            failedIssueIds.push(issueId);
            console.log(`[issue-comments] Giving up on issue=${issueId} — rolling-throttle retries exhausted`);
            break;
          }
          if (!res.ok) break;

          const json = await res.json() as {
            comments?: Array<Record<string, unknown>>;
            page_info?: { has_next_page?: boolean };
          };

          const rawBatch = json.comments ?? [];
          issueComments.push(
            ...rawBatch.map((c) => ({ ...c, _zoho_issue_id: issueId, _zoho_project_id: projectId }))
          );

          if (!json.page_info?.has_next_page || rawBatch.length < 100) break;
          page++;
          await sleep(100);
        }

        totalComments += issueComments.length;
        send({ type: "progress", current: i + 1, total: issues.length, issueId });
        send({ type: "comments", comments: issueComments });
        await sleep(200);
      }

      send({ type: "done", total_comments: totalComments, failed_issue_ids: failedIssueIds });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

This is a near-literal mirror of `zoho-export/comments/route.ts` (task/project → issue/project), with two intentional deltas: `fetchZohoWithRetry` replaces the inline 429-only retry (decision #2), and `failed_issue_ids` is threaded through the `done` event (borrowed from task 107's `failed_project_ids`).

### `migrate/page.tsx` — new type interface (add after `CommentsExportState`, `src/app/v2/(hub)/admin/migrate/page.tsx:40-44`)

```ts
interface IssueCommentsExportState {
  progress: { current: number; total: number; issueId: string } | null;
  done: { count: number; failed: string[] } | null;
  error: string | null;
}
```

### `EXPORT_LEVELS` — new entry (`src/app/v2/(hub)/admin/migrate/page.tsx:74-83`)

Insert right after the existing `comments` entry (line 80):

```ts
{ key: "issue-comments", label: "Issue Comments", desc: "All issue comments — requires issues-*.json exported first" },
```

**Note the key is hyphenated.** This codebase already has one precedent for a hyphenated `EXPORT_LEVELS`/`IMPORT_LEVELS` key — `attachment-meta` — and it is **always accessed with bracket notation**, never dot notation, because `Record<string, CardState>`/`exportStates.foo` dot access doesn't work for a key containing a hyphen. Every reference to this card's state (`exportStates`, the `setExportStates` updater) must use `exportStates["issue-comments"]`, matching `exportStates["attachment-meta"]` at `migrate/page.tsx:1095`, `:1106`, `:1156` — not `exportStates.issue-comments` (which isn't even valid syntax).

### New state hook (add after `commentsExport`, `src/app/v2/(hub)/admin/migrate/page.tsx:151-155`)

```ts
const [issueCommentsExport, setIssueCommentsExport] = useState<IssueCommentsExportState>({
  progress: null,
  done: null,
  error: null,
});
```

### New handler (add after `handleCommentsExport` closes, `src/app/v2/(hub)/admin/migrate/page.tsx:350-412`)

```ts
async function handleIssueCommentsExport() {
  if (anyRunning) return;
  setAnyRunning(true);
  setExportStates((s) => ({ ...s, "issue-comments": "running" }));
  setIssueCommentsExport({ progress: null, done: null, error: null });

  try {
    const res = await fetch("/api/admin/zoho-export/issue-comments");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const accumulated: unknown[] = [];

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
          issueId?: string;
          comments?: unknown[];
          total_comments?: number;
          failed_issue_ids?: string[];
        };

        if (evt.type === "progress") {
          setIssueCommentsExport((s) => ({
            ...s,
            progress: { current: evt.current!, total: evt.total!, issueId: evt.issueId! },
          }));
        }
        if (evt.type === "comments" && evt.comments) {
          accumulated.push(...evt.comments);
        }
        if (evt.type === "done") {
          const blob = new Blob([JSON.stringify(accumulated, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "issue-comments.json";
          a.click();
          URL.revokeObjectURL(url);
          setIssueCommentsExport((s) => ({
            ...s,
            done: { count: evt.total_comments!, failed: evt.failed_issue_ids ?? [] },
            progress: null,
          }));
          setExportStates((s) => ({ ...s, "issue-comments": "done" }));
        }
      }
    }
  } catch (e) {
    setIssueCommentsExport((s) => ({ ...s, error: String(e), progress: null }));
    setExportStates((s) => ({ ...s, "issue-comments": "error" }));
    console.error("[export/issue-comments]", e);
  } finally {
    setAnyRunning(false);
  }
}
```

### New JSX render block (insert after the `key === "comments"` block closes, `src/app/v2/(hub)/admin/migrate/page.tsx:965-1013`, before the `key === "timelogs"` block at `:1015`)

```tsx
if (key === "issue-comments") {
  const isRunning = exportStates["issue-comments"] === "running";
  const pct = issueCommentsExport.progress
    ? Math.round((issueCommentsExport.progress.current / issueCommentsExport.progress.total) * 100)
    : 0;

  return (
    <div key="issue-comments" className="py-2 border-b border-slate-100 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
            {label}
            <StateIcon state={exportStates["issue-comments"] ?? "idle"} />
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
        </div>
        {!isRunning && (
          <button
            onClick={handleIssueCommentsExport}
            disabled={anyRunning}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={11} />
            Export
          </button>
        )}
      </div>
      {isRunning && issueCommentsExport.progress !== null ? (
        <div className="mt-2">
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-500 mt-1 truncate">
            Issue {issueCommentsExport.progress.current} of {issueCommentsExport.progress.total}
          </div>
        </div>
      ) : null}
      {exportStates["issue-comments"] === "done" && issueCommentsExport.done !== null ? (
        <div className="mt-1 text-[11px] space-y-0.5">
          <div className="text-green-600">{issueCommentsExport.done.count} comments downloaded</div>
          {issueCommentsExport.done.failed.length > 0 ? (
            <div className="text-amber-600 truncate" title={issueCommentsExport.done.failed.join(", ")}>
              {issueCommentsExport.done.failed.length} issue(s) failed after retries — re-run to retry
            </div>
          ) : null}
        </div>
      ) : null}
      {issueCommentsExport.error !== null ? (
        <div className="mt-1 text-[11px] text-red-600">{issueCommentsExport.error}</div>
      ) : null}
    </div>
  );
}
```

This mirrors the `key === "comments"` block exactly, plus the `failed`/amber-warning treatment borrowed from the `key === "issues"` block (`migrate/page.tsx:948-957`) since this route surfaces `failed_issue_ids`.

---

## Implementation Steps

1. Create `src/app/api/admin/zoho-export/issue-comments/route.ts` exactly as specified in Code Context.
2. In `src/app/v2/(hub)/admin/migrate/page.tsx`:
   a. Add `IssueCommentsExportState` interface after `CommentsExportState` (line 44).
   b. Add the `issue-comments` entry to `EXPORT_LEVELS` after `comments` (line 80). Do **not** add anything to `IMPORT_LEVELS` — this task is export-only.
   c. Add the `issueCommentsExport` state hook after `commentsExport` (line 155).
   d. Add `handleIssueCommentsExport()` after `handleCommentsExport()` closes (~line 412).
   e. Add the `if (key === "issue-comments")` JSX block after the `key === "comments"` block closes (~line 1013), before `if (key === "timelogs")` (line 1015).
3. Run `npx tsc --noEmit` and `pnpm lint`.

---

## Notes for Implementation Agent

- **This is export-only.** Do not create an `issue_comments` table, an import route, or a `resolveIssueId` helper — that is deliberately deferred to a follow-up task (mirroring how task 107 → task 108 were split). Do not add anything to `IMPORT_LEVELS`.
- **Every hyphenated-key state access must use bracket notation** (`exportStates["issue-comments"]`, `setExportStates((s) => ({ ...s, "issue-comments": ... }))`) — confirmed by the existing `attachment-meta` precedent in the same file. Dot notation will not compile.
- **Use `fetchZohoWithRetry` from `@/lib/zoho`, not a hand-rolled retry.** Import it alongside `getZohoAccessToken` exactly as `zoho-export/issues/route.ts` does. `token` must be reassigned from the returned `token` field on every call (token can be refreshed mid-loop on a 401) — see how `zoho-export/issues/route.ts` handles this (`token = newToken`).
- **Downloaded filename is `issue-comments.json`** (singular pattern matching `comments.json`, not a slice-numbered name — this route doesn't take `from`/`to` params, see decision #3).
- **`_zoho_issue_id` and `_zoho_project_id` must be tagged onto every raw comment object** before sending — required for a future import route's FK resolution, exactly as `_zoho_task_id`/`_zoho_project_id` are tagged today in Task Comments export.
- **Do not add `sort_by` or `filter` query params.** The Zoho docs example the user supplied shows optional `sort_by`/`filter` params, but neither the existing Task Comments export nor the Issues export use them — stay consistent with the established, simpler `page`/`per_page` only pattern.
- **Sonnet requested by user override** (default recommendation for this shape of task would have been haiku — it's a direct structural mirror of two already-implemented, already-verified patterns with no new schema — but the user explicitly asked to bump this task to sonnet).

---

## Acceptance Criteria

- [x] `GET /api/admin/zoho-export/issue-comments` requires admin/super_admin auth — 401/403 matching every other export route
- [x] Route scans all `issues-*.json` files in `_from_zoho/` (falls back to `issues.json`), returns 400 with a clear error if none exist
- [x] For each issue, paginates comments via `page`/`per_page`, following `page_info.has_next_page` — matches Task Comments export's pagination exactly
- [x] Uses `fetchZohoWithRetry` — a simulated/observed 429 or rolling-throttle response is retried per the shared helper's behavior, not a bespoke one-off retry
- [x] SSE stream emits `progress` (current/total/issueId), `comments` (batch per issue), and a final `done` (total_comments, failed_issue_ids) event — mirrors the existing `comments`/`issues` export event shapes
- [x] Every comment object is tagged with `_zoho_issue_id` and `_zoho_project_id`
- [x] `migrate/page.tsx` shows an "Issue Comments" card in Phase 1 — Export, directly after "Comments", with a progress bar reading "Issue X of Y", a downloaded-count message, and an amber failed-issues warning when `failed_issue_ids` is non-empty
- [x] Clicking Export downloads `issue-comments.json` containing the accumulated array
- [x] Live run against the real portal completes with a nonzero comment count (or a clean zero if no issues have comments) and no unhandled errors — **2285 comments exported, survived a rolling-throttle backoff cycle mid-run, see Implementation Notes**
- [x] `npx tsc --noEmit` and `pnpm lint` both clean

---

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

1. Ensure `_from_zoho/issues-*.json` (or `issues.json`) exists from a prior task 107 export run.
2. Start dev server: `pnpm dev`.
3. Navigate to `/v2/admin/migrate`. Confirm the "Issue Comments" card appears in Phase 1 — Export, after "Comments".
4. Click Export. Confirm the progress bar advances ("Issue X of Y"), and on completion `issue-comments.json` downloads.
5. Inspect the downloaded file: confirm each comment object has `_zoho_issue_id`/`_zoho_project_id` tags and the raw Zoho comment fields (`id`, `comment`, `added_by`, `created_time`, etc.) are preserved unmodified.
6. If any issues have zero comments, confirm the run still completes cleanly (empty `comments` batches are valid, not errors).

---

## Compatibility Touchpoints

- New route only — no changes to existing export/import routes, no schema changes, no changes to `IMPORT_LEVELS`.
- Purely additive to `migrate/page.tsx` (new interface, new array entry, new state, new handler, new JSX block) — no existing card's behavior changes.
