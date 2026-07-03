# Task 105 — Fix Attachments Export Throttle: Bounded Retry + Shared Zoho Retry Helper

> **Priority:** HIGH
> **Type:** bugfix
> **Version Impact:** patch
> **Recommended Model:** sonnet
> **Date:** 2026-07-03
> **Status:** TESTING
> **Completed:** 2026-07-03
> **Investigation:** `/understand` ran before this spec. Findings embedded below.
> **Implementation Notes:** All 4 planned file changes made exactly as specced. `npx tsc --noEmit` clean. `pnpm lint` clean on all 4 changed files (also fixed one unrelated pre-existing `prefer-const` error on `cursor` in `timelogs/route.ts:17`, left over from prior uncommitted task-102 work — trivial, no behavior change, made `pnpm lint` fully pass instead of leaving a stray failure). Not yet tested live against a real throttle — that requires a real Zoho rolling-throttle hit to reproduce, which the tester should attempt on a real export run if feasible, or accept code-review-level verification (retry/backoff logic, token threading, SSE payload shape) as sufficient given the throttle is external and hard to trigger on demand. **Per CLAUDE.md, no git commit was made** — all changes are in the working tree uncommitted, ready for manual review/commit.

---

## Problem

`GET /api/admin/zoho-export/attachment-meta` is still hitting Zoho's `URL_ROLLING_THROTTLES_LIMIT_EXCEEDED` throttle during live runs — this is a **recurrence of a documented, previously-observed failure mode**, not a new bug. Task 104 already raised the per-task pacing from `sleep(200)` to `sleep(700)` (matching `timelogs`' "proven-safe cadence") after the export tripped the throttle at ~task 200. That fix addressed the *proactive* pacing math, but task 104's own notes flagged the residual risk explicitly:

> "only retries once per task; if the throttle hadn't actually cleared, the next task would trip it again and stall repeatedly."

That is the exact symptom being reported now.

**Current retry design (both `attachment-meta/route.ts` and `timelogs/route.ts`, duplicated verbatim):**
- `429` → read `Retry-After` header, sleep, retry once
- `400` with `error.title === "URL_ROLLING_THROTTLES_LIMIT_EXCEEDED"` → sleep 9 minutes, retry **once**
- `401` → refresh token via `getZohoAccessToken()`, retry once
- None of these retries loop. If the retried request also fails, the code falls through, `console.log`s server-side, and **silently moves to the next task** — no error surfaced to the SSE stream or UI. From the UI the export looks like it completed successfully while silently under-counting attachments.

**Duplication:** this exact three-branch retry block is copy-pasted independently in `attachment-meta/route.ts` and `timelogs/route.ts`. No shared helper exists anywhere in `src/lib/zoho/index.ts` (730 lines, 20+ exports) despite two routes needing near-identical logic. `tasks`/`comments` exports only handle 429; `milestones`/`tasklists`/`users` have no throttle handling at all — out of scope for this task (not touched).

---

## Decisions (resolved via clarifying questions before this spec)

1. **Retry strategy:** replace single-retry-then-silently-skip with a **bounded retry loop with backoff** on the rolling-throttle path. Keep retrying the same task/window up to `maxRollingRetries` (default 3) with increasing wait each attempt (9min, 12min, 15min). Only give up on that specific task after exhausting retries — and when that happens, **surface it as a real failure** in the SSE `done` payload (`failed_task_ids` / `failed_windows`) instead of a silent `console.log`. The export run still completes even if a handful of tasks ultimately fail, so in-progress chunk data (already streamed via `attachments`/`timelogs` SSE events) is never lost to an abort.
2. **Fix scope:** extract the 429 / rolling-throttle / 401 retry logic into **one shared helper**, `fetchZohoWithRetry()`, added to `src/lib/zoho/index.ts`. Use it in both `attachment-meta/route.ts` and `timelogs/route.ts` — the two routes that already duplicate this logic verbatim. **Do not** backport throttle handling to `tasks`/`comments`/`milestones`/`tasklists`/`users` in this task — that's a separate, unrequested expansion.

---

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/zoho/index.ts` | Modify | Add `fetchZohoWithRetry()` shared helper (429 retry, bounded rolling-throttle retry with backoff, 401 refresh+retry) |
| `src/app/api/admin/zoho-export/attachment-meta/route.ts` | Modify | Replace inline retry block with `fetchZohoWithRetry()`; track and surface `failed_task_ids` in the `done` event |
| `src/app/api/admin/zoho-export/timelogs/route.ts` | Modify | Replace inline retry block with `fetchZohoWithRetry()`; track and surface `failed_windows` in the `done` event |
| `src/app/v2/(hub)/admin/migrate/page.tsx` | Modify | `AttachmentMetaExportState.done`/`TimelogsExportState.done` gain a `failed: string[]` field; render a warning line when non-empty |

---

## Code Context

### New helper — insert into `src/lib/zoho/index.ts` after `getZohoAccessToken()` (currently ends at line 64)

```ts
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type ZohoFetchResult = {
  res: Response;
  token: string;
  throttleExhausted: boolean;
};

/**
 * Fetches a Zoho API URL with built-in throttle/auth resilience:
 * - 429 → respects Retry-After header, retries once
 * - 400 URL_ROLLING_THROTTLES_LIMIT_EXCEEDED → bounded retry loop with backoff
 *   (default 3 attempts: 9min, 12min, 15min waits) before giving up
 * - 401 → refreshes the token via getZohoAccessToken() and retries once
 *
 * Returns the final Response, the (possibly refreshed) token to carry forward
 * into subsequent calls, and whether the rolling-throttle retries were exhausted
 * without success — callers must treat `throttleExhausted: true` as a real
 * failure (surface it), not a silent skip.
 */
export async function fetchZohoWithRetry(
  url: string,
  token: string,
  options?: { label?: string; maxRollingRetries?: number }
): Promise<ZohoFetchResult> {
  const label = options?.label ?? "zoho";
  const maxRollingRetries = options?.maxRollingRetries ?? 3;
  let currentToken = token;

  const doFetch = () => fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${currentToken}` } });

  let res = await doFetch();

  // 429: respect Retry-After header, retry once
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") ?? "5", 10);
    console.log(`[${label}] 429 — waiting ${retryAfter}s`);
    await sleep(retryAfter * 1000);
    res = await doFetch();
  }

  // Zoho rolling throttle (400 URL_ROLLING_THROTTLES_LIMIT_EXCEEDED) — bounded retry with backoff
  let rollingAttempt = 0;
  let throttleExhausted = false;
  while (res.status === 400) {
    const body = (await res.clone().json().catch(() => ({}))) as { error?: { title?: string } };
    if (body?.error?.title !== "URL_ROLLING_THROTTLES_LIMIT_EXCEEDED") break;
    if (rollingAttempt >= maxRollingRetries) {
      throttleExhausted = true;
      break;
    }
    rollingAttempt++;
    const waitMinutes = 9 + (rollingAttempt - 1) * 3; // 9, 12, 15 min
    console.log(`[${label}] Rolling throttle hit (attempt ${rollingAttempt}/${maxRollingRetries}) — waiting ${waitMinutes}min`);
    await sleep(waitMinutes * 60 * 1000);
    res = await doFetch();
  }

  // Token expired mid-export — refresh and retry once
  if (res.status === 401) {
    console.log(`[${label}] Token expired — refreshing`);
    const fresh = await getZohoAccessToken();
    if (fresh) {
      currentToken = fresh;
      res = await doFetch();
    }
  }

  return { res, token: currentToken, throttleExhausted };
}
```

Note: keep the fall-through structure (three independent status checks in sequence, not a switch) — this is intentional and matches the original code's behavior of re-checking status after each recovery step (e.g. a 429-retry that comes back 401 is still caught by the next block).

### `attachment-meta/route.ts` — current retry block to replace (`src/app/api/admin/zoho-export/attachment-meta/route.ts:58-116`)

```ts
      let totalAttachments = 0;

      for (let i = 0; i < slice.length; i++) {
        const task = slice[i];
        const taskId = String(task.id_string ?? task.id ?? "");
        const projectId = String(task._zoho_project_id ?? "");

        if (taskId && projectId) {
          const qp = new URLSearchParams({ entity_type: "task", entity_id: taskId });
          const url = `${BASE}/projects/${projectId}/attachments?${qp}`;
          let res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });

          // 429: respect Retry-After header
          if (res.status === 429) {
            const retryAfter = parseInt(res.headers.get("Retry-After") ?? "5", 10);
            console.log(`[attachment-meta] 429 — waiting ${retryAfter}s`);
            await sleep(retryAfter * 1000);
            res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
          }

          // Zoho rolling throttle (400 URL_ROLLING_THROTTLES_LIMIT_EXCEEDED) — wait 9 min and retry once
          if (res.status === 400) {
            const body = await res.clone().json().catch(() => ({})) as { error?: { title?: string } };
            if (body?.error?.title === "URL_ROLLING_THROTTLES_LIMIT_EXCEEDED") {
              console.log(`[attachment-meta] Rolling throttle hit — waiting 9 minutes before retry`);
              await sleep(9 * 60 * 1000);
              res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
            }
          }

          // Token expired mid-export — refresh and retry once
          if (res.status === 401) {
            console.log(`[attachment-meta] Token expired — refreshing`);
            const fresh = await getZohoAccessToken();
            if (fresh) {
              token = fresh;
              res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
            }
          }

          if (res.ok) {
            const json = await res.json() as { attachment?: unknown[] };
            const items = (json.attachment ?? []).map((a) => ({
              ...(a as Record<string, unknown>),
              _zoho_task_id: taskId,
              _zoho_project_id: projectId,
            }));
            if (items.length > 0) {
              totalAttachments += items.length;
              send({ type: "attachments", items });
            }
          } else if (res.status !== 404) {
            // 404 (per Zoho docs, task has no attachments module) is expected and not logged;
            // anything else is unexpected but still non-fatal — skip this task and continue.
            console.log(`[attachment-meta] ${res.status} task=${taskId}:`, await res.text().catch(() => ""));
          }
        }

        send({ type: "progress", current: i + 1, total: slice.length });
        await sleep(700); // stay under Zoho's 200 req/2 min rolling limit — same calibration as timelogs export
      }

      console.log(`[attachment-meta] done: ${totalAttachments} attachments across ${slice.length} tasks`);
      send({ type: "done", total_attachments: totalAttachments });
      controller.close();
```

**Replace with** (import `fetchZohoWithRetry` from `@/lib/zoho`, drop the now-unused inline `let res` retry branches):

```ts
      let totalAttachments = 0;
      const failedTaskIds: string[] = [];

      for (let i = 0; i < slice.length; i++) {
        const task = slice[i];
        const taskId = String(task.id_string ?? task.id ?? "");
        const projectId = String(task._zoho_project_id ?? "");

        if (taskId && projectId) {
          const qp = new URLSearchParams({ entity_type: "task", entity_id: taskId });
          const url = `${BASE}/projects/${projectId}/attachments?${qp}`;
          const { res, token: newToken, throttleExhausted } = await fetchZohoWithRetry(url, token, { label: "attachment-meta" });
          token = newToken;

          if (res.ok) {
            const json = await res.json() as { attachment?: unknown[] };
            const items = (json.attachment ?? []).map((a) => ({
              ...(a as Record<string, unknown>),
              _zoho_task_id: taskId,
              _zoho_project_id: projectId,
            }));
            if (items.length > 0) {
              totalAttachments += items.length;
              send({ type: "attachments", items });
            }
          } else if (throttleExhausted) {
            failedTaskIds.push(taskId);
            console.log(`[attachment-meta] Giving up on task=${taskId} — rolling-throttle retries exhausted`);
          } else if (res.status !== 404) {
            // 404 (per Zoho docs, task has no attachments module) is expected and not logged;
            // anything else is unexpected but still non-fatal — skip this task and continue.
            console.log(`[attachment-meta] ${res.status} task=${taskId}:`, await res.text().catch(() => ""));
          }
        }

        send({ type: "progress", current: i + 1, total: slice.length });
        await sleep(700); // stay under Zoho's 200 req/2 min rolling limit — same calibration as timelogs export
      }

      console.log(`[attachment-meta] done: ${totalAttachments} attachments across ${slice.length} tasks (${failedTaskIds.length} failed)`);
      send({ type: "done", total_attachments: totalAttachments, failed_task_ids: failedTaskIds });
      controller.close();
```

`token` is declared with `let` at the top of the route handler already (`let token = await getZohoAccessToken();`) — keep that declaration, just remove the manual reassignment inside the old 401 branch since `fetchZohoWithRetry` now owns it.

### `timelogs/route.ts` — current retry block to replace (`src/app/api/admin/zoho-export/timelogs/route.ts:118-153`)

```ts
              const url = `${BASE}/projects/${projectId}/timelogs?${qp}`;
            let res = await fetch(url, {
                headers: { Authorization: `Zoho-oauthtoken ${token}` },
              });

              // 429: respect Retry-After header
              if (res.status === 429) {
                const retryAfter = parseInt(res.headers.get("Retry-After") ?? "10", 10);
                console.log(`[timelogs] 429 — waiting ${retryAfter}s`);
                await sleep(retryAfter * 1000);
                res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
              }

              // Zoho rolling throttle (400 URL_ROLLING_THROTTLES_LIMIT_EXCEEDED) — wait 9 min and retry once
              if (res.status === 400) {
                const body = await res.clone().json().catch(() => ({})) as { error?: { title?: string } };
                if (body?.error?.title === "URL_ROLLING_THROTTLES_LIMIT_EXCEEDED") {
                  console.log(`[timelogs] Rolling throttle hit — waiting 9 minutes before retry`);
                  await sleep(9 * 60 * 1000);
                  res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
                }
              }

              // Token expired mid-export — refresh and retry once
              if (res.status === 401) {
                console.log(`[timelogs] Token expired — refreshing`);
                const fresh = await getZohoAccessToken();
                if (fresh) {
                  token = fresh;
                  res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
                }
              }

              if (!res.ok) {
                console.log(`[timelogs] ${res.status} task=${taskId} ${start}→${end}:`, await res.text());
                break;
              }
```

**Replace with:**

```ts
              const url = `${BASE}/projects/${projectId}/timelogs?${qp}`;
              const { res, token: newToken, throttleExhausted } = await fetchZohoWithRetry(url, token, { label: "timelogs" });
              token = newToken;

              if (!res.ok) {
                if (throttleExhausted) {
                  failedTaskWindows.push(`${taskId} ${start}→${end}`);
                  console.log(`[timelogs] Giving up on task=${taskId} ${start}→${end} — rolling-throttle retries exhausted`);
                } else {
                  console.log(`[timelogs] ${res.status} task=${taskId} ${start}→${end}:`, await res.text());
                }
                break;
              }
```

Add `const failedTaskWindows: string[] = [];` next to `let totalLogs = 0;` (`timelogs/route.ts:94`), and update the final `send` call (`timelogs/route.ts:184`):

```ts
      send({ type: "done", total_logs: totalLogs, failed_windows: failedTaskWindows });
```

### `migrate/page.tsx` — state types to extend (`src/app/v2/(hub)/admin/migrate/page.tsx:37-57`)

```ts
interface TimelogsExportState {
  from: string;
  to: string;
  progress: { current: number; total: number; project: string } | null;
  done: { count: number; failed: string[] } | null;   // was: { count: number } | null
  error: string | null;
}

interface AttachmentMetaExportState {
  from: string;
  to: string;
  progress: { current: number; total: number } | null;
  done: { count: number; failed: string[] } | null;    // was: { count: number } | null
  error: string | null;
}
```

### `migrate/page.tsx` — `handleAttachmentMetaExport` SSE parsing to update (`src/app/v2/(hub)/admin/migrate/page.tsx:386-450`)

The `evt` type annotation (line ~412) and the `done` handler (line ~429) both need the new field:

```ts
          const evt = JSON.parse(frame.slice(6)) as {
            type: string;
            current?: number;
            total?: number;
            items?: unknown[];
            total_attachments?: number;
            failed_task_ids?: string[];   // new
          };
          // ...
          if (evt.type === "done") {
            // ...existing blob download logic unchanged...
            setAttachmentMetaExport((s) => ({
              ...s,
              done: { count: evt.total_attachments!, failed: evt.failed_task_ids ?? [] },
              progress: null,
            }));
            setExportStates((s) => ({ ...s, "attachment-meta": "done" }));
          }
```

Mirror the same pattern in `handleTimelogsExport` (`src/app/v2/(hub)/admin/migrate/page.tsx:319-384`) with `failed_windows?: string[]` and `done: { count: evt.total_logs!, failed: evt.failed_windows ?? [] }`.

### `migrate/page.tsx` — done-summary rendering to extend

Attachment Metadata (`src/app/v2/(hub)/admin/migrate/page.tsx:956-958`):
```tsx
{exportStates["attachment-meta"] === "done" && attachmentMetaExport.done !== null ? (
  <div className="mt-1 text-[11px] text-green-600">{attachmentMetaExport.done.count} attachments downloaded</div>
) : null}
```
becomes:
```tsx
{exportStates["attachment-meta"] === "done" && attachmentMetaExport.done !== null ? (
  <div className="mt-1 text-[11px]">
    <div className="text-green-600">{attachmentMetaExport.done.count} attachments downloaded</div>
    {attachmentMetaExport.done.failed.length > 0 ? (
      <div className="text-amber-600 mt-0.5 truncate" title={attachmentMetaExport.done.failed.join(", ")}>
        {attachmentMetaExport.done.failed.length} task(s) failed after retries — re-run with from/to to retry
      </div>
    ) : null}
  </div>
) : null}
```

Time Logs (`src/app/v2/(hub)/admin/migrate/page.tsx:884-886`) — same pattern, swap the label to "window(s) failed":
```tsx
{exportStates.timelogs === "done" && timelogsExport.done !== null ? (
  <div className="mt-1 text-[11px]">
    <div className="text-green-600">{timelogsExport.done.count} logs downloaded</div>
    {timelogsExport.done.failed.length > 0 ? (
      <div className="text-amber-600 mt-0.5 truncate" title={timelogsExport.done.failed.join(", ")}>
        {timelogsExport.done.failed.length} window(s) failed after retries — re-run with from/to to retry
      </div>
    ) : null}
  </div>
) : null}
```

---

## Implementation Steps

1. **Add `fetchZohoWithRetry()` to `src/lib/zoho/index.ts`** — insert after `getZohoAccessToken()` (after line 64). Add the module-level `sleep` helper alongside it (this file doesn't have one yet; both route files define their own local copies — leave those as-is, they're independent local helpers used for per-task pacing, not part of this refactor).
2. **Rewrite the retry block in `src/app/api/admin/zoho-export/attachment-meta/route.ts`** per the Code Context above: import `fetchZohoWithRetry`, replace the three inline branches with one call, add `failedTaskIds` tracking, surface it in the final `send({ type: "done", ... })`.
3. **Rewrite the retry block in `src/app/api/admin/zoho-export/timelogs/route.ts`** per the Code Context above: same import, same replacement pattern, `failedTaskWindows` tracking (format: `"{taskId} {start}→{end}"` so a failure is identifiable), surfaced in the final `send`.
4. **Update `migrate/page.tsx`**: extend `TimelogsExportState.done` and `AttachmentMetaExportState.done` types with `failed: string[]`, update both SSE `evt` type annotations and `done` handlers to read `failed_task_ids`/`failed_windows`, extend both done-summary render blocks with the amber warning line.
5. Run `npx tsc --noEmit` and `pnpm lint` — confirm both routes and the migrate page type-check cleanly.

---

## Notes for Implementation Agent

- **Sonnet recommended** — this is a second attempt at the same bug (task 104's fix only addressed proactive pacing, not the reactive retry-exhaustion path it explicitly flagged as residual risk). Threading the possibly-refreshed `token` correctly through both call sites, and getting the backoff/exhaustion semantics right, needs care — a subtle regression here (e.g. losing the refreshed token between iterations) would silently reintroduce 401 failures.
- **Preserve the fall-through structure inside `fetchZohoWithRetry()`** — three sequential status checks (429, then a while-loop for 400, then 401), not mutually exclusive branches. This matches the original code's behavior where a recovery attempt from one branch can land in the next (e.g. a 429-retry response that comes back 401 must still be caught).
- **`failedTaskIds`/`failedTaskWindows` are additive visibility, not a behavior change** — the export run still completes normally; only the specific task/window that exhausted retries is marked failed instead of silently absorbed into "done". This mirrors the failure-visibility pattern task 104 already established on the import side (surfaced `errors` instead of a silently-empty `storage_path`).
- **Backoff schedule (9min → 12min → 15min, 3 attempts) is a starting point, not a confirmed Zoho-documented threshold.** No authoritative numeric window for `URL_ROLLING_THROTTLES_LIMIT_EXCEEDED` was found anywhere in the codebase or docs during investigation — `sleep(700)` and the 9-minute wait are both empirically-tuned from task 104's live-run observations, not from official Zoho documentation. If this recurs even with bounded retry, the next step would be increasing `maxRollingRetries` or the base wait, not re-architecting the retry shape.
- **Do not touch `tasks`/`comments`/`milestones`/`tasklists`/`users` export routes** — out of scope per the fix-scope decision above. `getZohoProjectTasklists`, `getUnassignedZohoTasks`, and other non-export library functions in `zoho/index.ts` are also untouched — this task only adds one new export, `fetchZohoWithRetry`.
- **`zoho-import/attachments/route.ts` (import side) is out of scope** — this task is export-only, matching the reported symptom.

---

## Acceptance Criteria

- [ ] `fetchZohoWithRetry()` exported from `src/lib/zoho/index.ts`, handling 429 (single retry), 400 rolling-throttle (bounded retry with backoff, default 3 attempts), and 401 (refresh + single retry)
- [ ] `attachment-meta/route.ts` uses `fetchZohoWithRetry()` instead of inline retry branches; `token` is correctly carried forward across iterations
- [ ] `timelogs/route.ts` uses `fetchZohoWithRetry()` instead of inline retry branches; `token` is correctly carried forward across iterations
- [ ] A task/window that exhausts rolling-throttle retries is pushed to `failed_task_ids`/`failed_windows` and surfaced in the `done` SSE event — not silently skipped
- [ ] `migrate/page.tsx` shows a warning line with the failed count when an export completes with failures, alongside the existing success count
- [ ] Existing 429 and 401 recovery behavior is unchanged in outcome (still retries once each)
- [ ] `npx tsc --noEmit` and `pnpm lint` both clean

---

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

1. Start dev server: `pnpm dev`
2. Navigate to `/v2/admin/migrate`
3. Run the Attachment Metadata export on a small `from`/`to` slice — confirm it still completes normally and downloads when no throttle is hit (regression check on the non-throttled path)
4. If a throttle is reproducible in a real run: confirm the export does not stall indefinitely, confirm it eventually either succeeds after backoff or reports the task in the amber "failed after retries" warning instead of silently omitting it from the counted total
5. Repeat steps 3–4 for the Time Logs export
