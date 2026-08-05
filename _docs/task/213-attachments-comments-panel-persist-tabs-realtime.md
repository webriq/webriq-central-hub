# 213: Attachments/Comments Panel — Persist Tab State (Eliminate Refetch/Flicker) + Supabase Realtime Auto-Refresh

**Created:** 2026-08-05
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Completed (2026-08-05)

---

## Overview

User-reported bug on `/v2/projects/[projectId]/tasks/[taskId]`'s Attachments/Comments panel (task 211's tabbed panel, task 212's Comments rewrite): switching between the "Attachments" and "Comments" pill tabs re-triggers a full fetch and a brief "empty" flash every single time, even after the data has already loaded once. Screenshots showed the Comments tab settled into its empty state with no visible skeleton, while Attachments only ever visibly shows its skeleton on the page's first paint.

Root cause: `_task-attachments-comments-panel.tsx:41-45` conditionally renders **either** `<TaskAttachments>` **or** `<TaskComments>`:

```tsx
{tab === "attachments" ? (
  <TaskAttachments projectId={projectId} taskId={taskId} />
) : (
  <TaskComments taskId={taskId} />
)}
```

A ternary like this fully unmounts the inactive tab's component. Every switch back to a tab remounts it from scratch — its `loading` state resets to `true` and its `useEffect` re-fetches from the API, discarding whatever was already loaded. On a fast local network the fetch often resolves before the browser paints the intermediate loading frame, so the skeleton is invisible in practice; the user only perceives the "empty, then loads" flash. This is a UI-architecture bug, not a real-time-data problem — no message queue or websocket infrastructure fixes a component that keeps destroying its own cache.

Separately, and worth solving in the same pass since it touches the same two files: once tab switches no longer force a refetch, the lists need a way to pick up genuinely new data posted by someone else (another PM/developer) while the page is open. This codebase already has a shipped, working pattern for exactly this — `_project-detail.tsx:146-199` subscribes to Supabase Realtime `postgres_changes` on `tasks`/`issues` filtered by `project_id` and patches local state directly on INSERT/UPDATE/DELETE, no polling, no new infrastructure. This task extends that same pattern to `task_comments` and `attachments`, rather than introducing QStash (a scheduling/queue product, not a push mechanism) or a hand-rolled WebSocket server (redundant — Supabase Realtime already runs over websockets under the hood, with an SDK this codebase already depends on).

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | How to stop the remount-triggered refetch — lift state to the parent panel, or keep both children mounted? | **Keep both children mounted; toggle visibility with a `hidden` class instead of conditional rendering.** This is a one-line change in `_task-attachments-comments-panel.tsx` with zero changes to either child's internal fetch/loading/skeleton logic (already correct, per task 211/212 — no need to touch it). The alternative (lifting fetched state up into the panel, passing it down as props) would also work but requires restructuring both children's internals for no added benefit here, and this codebase's convention (CLAUDE.md) is to avoid introducing abstraction beyond what the task requires. |
| 2 | Cost of keeping both mounted: does this mean both tabs' data now fetches immediately on page load, even before the user ever opens the second tab? | **Yes, and that's an accepted, small cost.** Both endpoints return small, metadata-only payloads scoped to one task (a handful of attachment/comment rows at most) — the same lightweight queries either tab already made on its own first activation. Fetching both once per page visit instead of once-per-tab-per-visit is strictly less network traffic than the current bug (which refetches on *every* switch), and it means the Comments tab's skeleton is now guaranteed to be observable on initial page load instead of only conditionally, whichever tab is opened first. |
| 3 | Does the Attachments tab's Realtime subscription need a full refetch on each event, or can it patch local state directly? | **Patch directly, mirroring `_project-detail.tsx`'s exact pattern.** `GET /api/v2/projects/[projectId]/tasks/[taskId]/attachments` already returns attachment rows' own columns verbatim (`id, filename, size, created_at`) with no joins — a `postgres_changes` payload for an INSERT/DELETE on the `attachments` table carries those same columns, so the local `attachments` array can be updated straight from `payload.new`/`payload.old` exactly like `_project-detail.tsx` does for `tasks`/`issues`. No extra fetch needed. |
| 4 | The `attachments` table is polymorphic (`entity_type`/`entity_id`) — Realtime's `filter` option only supports one equality clause (confirmed by `_project-detail.tsx`'s own usage, which filters on a single column). How to scope the Attachments-tab subscription to just this task's attachments? | **Filter on `entity_id=eq.${taskId}`, then defensively check `entity_type === "task"` inside the handler.** A task's UUID won't collide with a project/issue/comment UUID in practice, but the extra in-handler check costs nothing and guards against the theoretical case cleanly, without needing a compound filter Realtime doesn't support. |
| 5 | Same polymorphism problem for the Comments tab's *comment attachments* — `entity_id` there is a `comment_id`, not the `taskId`, so it can't be filtered by `taskId` directly. | **Filter on `entity_type=eq.comment` (the broadest available single-column filter) and, in the handler, only apply the event if its `entity_id` matches a comment already in local state.** Rejected alternative: denormalizing a `task_id` column onto `attachments` — out of scope, would need a migration, and buys nothing over the local narrowing check for this table's actual traffic volume (an internal tool, not a high-throughput system). |
| 6 | A new `task_comments` row (or a new comment-attachment) arriving via Realtime needs the same shape the initial page load gets — resolved `author_name` and the comment's `attachments` array — neither of which is present on a bare `postgres_changes` payload (which only carries the raw row: `author_id`, `body`, `created_at`, `task_id`). How to resolve that without hand-rolling a second author/attachment-join client-side? | **Re-fetch the full comment list via the existing, already-batched `GET /api/v2/tasks/[taskId]/comments` endpoint whenever the Realtime channel signals a `task_comments` or a relevant `attachments` change**, rather than resolving author name/attachments piecemeal client-side or adding a new single-comment endpoint. This is a *materially different trigger* than the bug being fixed — it fires only when data actually changed (rare, for a given task), not on every tab click — so it doesn't reintroduce the original problem. Simpler and safer than duplicating the existing route's join logic in the browser. |
| 7 | Does Realtime even fire for `task_comments`/`attachments` today, or does the table need to be added to the `supabase_realtime` publication first? | **Add an explicit migration.** `006_product_completion_percentage.sql` shows this project's own precedent: `customer_products` needed an explicit `alter publication supabase_realtime add table customer_products;` before its Realtime subscription would receive events. No migration in this repo does the equivalent for `tasks`/`issues` (the tables `_project-detail.tsx` already subscribes to), which means that project's Realtime publication most likely also has `tasks`/`issues` enabled via the Supabase Studio Replication UI directly (a real but uncommitted piece of infra state) rather than through a committed migration — an assumption this task should not repeat. Add a new migration (093) explicitly enabling Realtime for `task_comments` and `attachments`, guarded with an existence check so it's safe to run even if one or both are already enabled. |
| 8 | Cleanup — do the new subscriptions need explicit teardown? | **Yes, `supabase.removeChannel(channel)` in each `useEffect`'s cleanup function, keyed on `taskId`** — identical to `_project-detail.tsx`'s existing pattern. Since both children now stay mounted for the lifetime of the tab switcher (Decision #1), each subscribes once per page visit and tears down once on navigating away from the task detail page. |

## Requirements

### A — Stop the remount-triggered refetch/flicker
- [ ] In `_task-attachments-comments-panel.tsx`: render both `<TaskAttachments>` and `<TaskComments>` unconditionally; wrap each in a `<div className={cn(tab === "attachments" ? "" : "hidden")}>` / `<div className={cn(tab === "comments" ? "" : "hidden")}>` pair instead of the current ternary, so switching tabs only toggles visibility and never unmounts either child.
- [ ] No changes needed to either child's existing fetch/loading/skeleton/empty-state logic (task 211/212 already got this right) — confirm both still show their skeleton exactly once, on the task detail page's initial load, regardless of which tab is active first.

### B — Realtime auto-refresh for the Attachments tab
- [ ] In `_task-attachments.tsx`: add a `useEffect` (alongside the existing fetch effect) that opens `supabase.channel(\`task_attachments_${taskId}\`)`, subscribes to `postgres_changes` on `attachments` filtered by `entity_id=eq.${taskId}`, and on each event whose `entity_type === "task"`:
  - `INSERT` → append the new row to local `attachments` state (dedupe by `id` in case the current user's own upload already added it optimistically, if such an optimistic path exists — check `TaskAttachmentPicker`'s upload flow before assuming).
  - `DELETE` → filter it out of local `attachments` state (no delete UI ships today per task 211/212, but mirror `_project-detail.tsx`'s handling of this event for robustness against any future/manual deletion path).
  - Clean up with `supabase.removeChannel(channel)`.

### C — Realtime auto-refresh for the Comments tab
- [ ] In `_task-comments.tsx`: extract the existing comment-list fetch (currently inline in a `useEffect`) into a standalone `fetchComments()` function so it can be called both on initial mount and from the Realtime handler below.
- [ ] Add a `useEffect` subscribing to two `postgres_changes` streams (mirroring `_project-detail.tsx`'s one-`useEffect`-per-table shape):
  - `task_comments` filtered by `task_id=eq.${taskId}`, any event → call `fetchComments()`.
  - `attachments` filtered by `entity_type=eq.comment` → in the handler, only call `fetchComments()` if the event's `entity_id` matches a comment already present in local state (Decision #5) — otherwise it's an attachment for a comment on a different task and should be ignored.
  - Clean up both channels with `supabase.removeChannel(channel)`.
- [ ] Do not touch the comment-posting flow's own local `setComments` append after a successful `POST` — that's the current user's own optimistic update and stays as-is; the new Realtime path only covers changes originating elsewhere.

### D — Enable Realtime replication for the two tables
- [ ] New migration `093_enable_realtime_comments_attachments.sql` — idempotent `alter publication supabase_realtime add table` for `task_comments` and `attachments`, guarded by an existence check against `pg_publication_tables` so it's safe whether or not either table is already enabled (Decision #7).

## Out of Scope / Must-Not-Change

- **Any polling-based or QStash-based refresh mechanism** — explicitly rejected per the Overview; Supabase Realtime (already a dependency, already proven working in `_project-detail.tsx`) is the only new mechanism this task introduces.
- **A custom WebSocket server** — Supabase Realtime already runs over websockets; no separate server process is needed or wanted.
- **Attachment/comment delete UI** — still out of scope (task 212 Decision #11); the Realtime `DELETE` handling added here is defensive plumbing only, not a new feature surface.
- **`_project-detail.tsx`'s own `tasks`/`issues` Realtime subscriptions** — untouched; only referenced as the pattern to mirror.
- **Any change to the comments/attachments API routes' response shapes** — this task only adds a client-side Realtime layer and a migration; `GET /api/v2/tasks/[taskId]/comments` and the attachments routes are unchanged.
- **Task 212's rich-text composer, attachment picker, and HTML-body rendering** — unaffected; this task only touches the fetch/subscribe lifecycle around them.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx` | Modify | Keep both tabs mounted; toggle `hidden` instead of conditional render (Requirement A) |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments.tsx` | Modify | Add Realtime subscription on `attachments` (entity scoped to this task), patch local state directly (Requirement B) |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-comments.tsx` | Modify | Extract `fetchComments()`; add Realtime subscriptions on `task_comments` + comment-scoped `attachments`, triggering a re-fetch (Requirement C) |
| `supabase/migrations/093_enable_realtime_comments_attachments.sql` | Create | Enable Realtime replication for `task_comments` and `attachments` (Requirement D) |

## Code Context

### `_project-detail.tsx:146-172` — the exact Realtime pattern to mirror (full file already read this session)
```tsx
useEffect(() => {
  const supabase = createClient();
  const channel = supabase
    .channel(`project_tasks_${project.id}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${project.id}` },
      (payload) => {
        if (payload.eventType === "INSERT") { /* append */ }
        else if (payload.eventType === "UPDATE") { /* patch by id */ }
        else if (payload.eventType === "DELETE") {
          const deletedId = (payload.old as { id: string }).id;
          setTasks((prev) => prev.filter((t) => t.id !== deletedId));
        }
      }
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}, [project.id]);
```
`createClient` import is `@/lib/supabase/client` (browser singleton) — same import both new subscriptions in `_task-attachments.tsx`/`_task-comments.tsx` should use.

### `_task-attachments-comments-panel.tsx:40-46` — current conditional render to replace (full file already read this session)
```tsx
<div className="p-[18px]">
  {tab === "attachments" ? (
    <TaskAttachments projectId={projectId} taskId={taskId} />
  ) : (
    <TaskComments taskId={taskId} />
  )}
</div>
```

### `_task-attachments.tsx`'s current fetch effect (full file already read this session) — `AttachmentRow = { id: string; filename: string; size: number | null; created_at: string }`, fetched from `GET /api/v2/projects/${projectId}/tasks/${taskId}/attachments` with no joins — matches what a `postgres_changes` payload on the same table carries, confirming Decision #3's direct-patch approach needs no extra fetch.

### `_task-comments.tsx`'s current fetch effect and `CommentRow` shape (full file already read this session)
```tsx
type CommentAttachment = { id: string; filename: string; size: number | null };
type CommentRow = { id: string; body: string; created_at: string; author_name: string; attachments: CommentAttachment[] };

useEffect(() => {
  const ctrl = new AbortController();
  fetch(`/api/v2/tasks/${taskId}/comments`, { signal: ctrl.signal })
    .then((r) => (r.ok ? r.json() : []))
    .then((data: CommentRow[]) => setComments(data))
    .catch(() => {})
    .finally(() => setLoading(false));
  return () => ctrl.abort();
}, [taskId]);
```
Extract the fetch body into `fetchComments()` (keeping the `AbortController` for the mount-time call; the Realtime-triggered calls don't need cancellation the same way since they're infrequent, event-driven calls, not effect re-runs).

### `006_product_completion_percentage.sql:8-10` — precedent for enabling Realtime on a table via migration
```sql
-- ─── Enable Supabase Realtime for PM dashboard live-update subscription ──────
-- Allows the PM dashboard to receive UPDATE events as customers fill the form.
alter publication supabase_realtime add table customer_products;
```
New migration 093 does the same for two tables, wrapped in an existence guard (Decision #7) since, unlike this precedent, we can't confirm `task_comments`/`attachments` aren't already enabled via the dashboard.

## Implementation Steps

1. `supabase/migrations/093_enable_realtime_comments_attachments.sql`: write the guarded `alter publication` migration (Requirement D).
2. `_task-attachments-comments-panel.tsx`: swap the ternary for always-mounted + `hidden`-toggle (Requirement A).
3. `_task-attachments.tsx`: add the Realtime subscription, patch-on-event (Requirement B).
4. `_task-comments.tsx`: extract `fetchComments()`, add the two Realtime subscriptions calling it (Requirement C).
5. Manually verify in the browser with two sessions/tabs open on the same task: switching tabs repeatedly in one session shows no network refetch and no flicker (confirm via DevTools Network tab — one request per endpoint for the whole page visit, not one per switch); posting a comment/attachment/pasted image in session B appears in session A without a reload; deleting or reloading confirms nothing regressed in the existing skeleton/empty states.

## Acceptance Criteria

- [ ] Switching between the Attachments and Comments tabs never triggers a new network request for either tab's list — confirmed via DevTools Network tab (one request per endpoint per page visit).
- [ ] Both tabs' skeleton loading states are visible on the task detail page's initial load (not just whichever tab happens to be active first).
- [ ] A comment, comment attachment, or task attachment posted by another user/session appears in the current session's open task detail page without a manual reload.
- [ ] The existing "Post comment" / attachment-upload flow for the current user is unaffected (still appends immediately via its own local state update, not dependent on the Realtime round-trip).
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new warnings/errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser verification (no test runner configured) — see Implementation Step 5. Requires two concurrent sessions (or one session + a second incognito/second-browser session) on the same task to observe cross-session Realtime updates.

## Compatibility Touchpoints

- New migration (093) — additive only (publication membership), no schema/data change, no RLS change.
- No new npm dependencies — reuses `@supabase/supabase-js`'s already-used Realtime client (`.channel()`/`.on("postgres_changes", ...)`), same as `_project-detail.tsx`.
- No API route response-shape changes.
- No env var changes.
- No MCP tool inventory changes (`_docs/mcp-tools.md`).

## Implementation Notes

### What Changed
- `_task-attachments-comments-panel.tsx` — replaced the `tab === "attachments" ? <TaskAttachments/> : <TaskComments/>` ternary with both components always mounted, each wrapped in a `<div className={cn(tab !== "..." && "hidden")}>` toggling visibility only. Neither child unmounts on a tab switch anymore, so neither refetches or re-shows its loading skeleton after the first load (Requirement A).
- `_task-attachments.tsx` — added a second `useEffect` opening a Realtime channel (`task_attachments_${taskId}`) subscribed to `postgres_changes` on `attachments` filtered by `entity_id=eq.${taskId}`. INSERT appends the new row (deduped by `id`, guarded to `entity_type === "task"`); DELETE filters it out. No refetch — patches `attachments` state straight from the payload, mirroring `_project-detail.tsx`'s `tasks`/`issues` pattern exactly (Requirement B, Decisions #3/#4).
- `_task-comments.tsx` — extracted the inline fetch effect into a stable `fetchComments(signal?)` (wrapped in `useCallback`); added a `commentsRef` synced via effect so the Realtime handlers can read the current comment list without depending on `comments` in their own effect's dependency array. Added two Realtime channels: `task_comments_${taskId}` (filtered by `task_id`) triggers `fetchComments()` on any event, except it skips an `INSERT` whose `id` is already in `commentsRef.current` (the current user's own optimistic post, avoiding a redundant round-trip); `task_comment_attachments_${taskId}` (filtered by `entity_type=eq.comment`, since the polymorphic `attachments` table has no `task_id` column to filter on directly) triggers `fetchComments()` only when the event's `entity_id` matches a comment already in local state — discarding attachment events for comments on other tasks (Requirement C, Decisions #5/#6).
  - Deviation from the plan's original sketch: the task doc's Code Context suggested checking membership *inside* a `setComments` updater callback. Implemented with a `useRef` mirror instead — calling a network side effect (`fetchComments()`) from inside a React state-updater function is unsafe (React may invoke updaters more than once per commit), so the membership check reads `commentsRef.current` directly outside of `setComments`.
- `supabase/migrations/093_enable_realtime_comments_attachments.sql` — new migration, guarded `alter publication supabase_realtime add table task_comments` / `... add table attachments`, each wrapped in an `if not exists (select ... from pg_publication_tables ...)` check (Requirement D, Decision #7).

### Files Changed
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx` — always-mount both tabs, toggle `hidden` (Requirement A)
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments.tsx` — Realtime subscription, direct state patch (Requirement B)
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-comments.tsx` — extracted `fetchComments()`, two Realtime subscriptions, `commentsRef` (Requirement C)
- `supabase/migrations/093_enable_realtime_comments_attachments.sql` — new migration enabling Realtime replication (Requirement D)

### Deviations From Plan
- The `commentsRef`-based membership check (described above) replaces the plan's Code Context sketch of checking inside a `setComments` updater — a correctness fix surfaced during implementation, not a scope change. The observable behavior (skip refetch for the poster's own comment, refetch otherwise) is unchanged from the plan's intent.
- No deviations touching Out of Scope boundaries — confirmed `_project-detail.tsx`'s own subscriptions, the comments/attachments API route response shapes, task 212's composer/attachment-picker/HTML-body rendering, and attachment/comment delete UI are all untouched by this task's diff.

### Verification Run
- `npx tsc --noEmit` - PASS (no errors)
- `pnpm lint` - PASS (no warnings or errors)
- impeccable design-lint hook - fired after every file write/edit; every finding across all three `.tsx` edits was `design-system-font-size` on pre-existing literal pixel values already shipped by tasks 211/212 (the pill-tab label, file-tile labels, comment/attachment text sizes) — none introduced by this task's diff, confirmed by reading each finding's line against the actual edit. Classified as false positives per CLAUDE.md's documented UI Polish Convention and task 212's identical precedent; none required a change.
- File sizes: `_task-attachments-comments-panel.tsx` 53 lines, `_task-attachments.tsx` 199 lines, `_task-comments.tsx` 225 lines — all comfortably under `nextjs-file-length-best-practices.md`'s 250–300-line soft-warning threshold; no split needed.
- Manual/browser verification (Implementation Step 5, requiring two concurrent sessions) - SKIPPED (deferred to the `test` stage per the implement skill's workflow — this stage runs typecheck/lint only, no dev server was started during implementation).

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation — confirmed via full reads of all 4 changed/new files against `git diff --name-only`'s scope for this task (`_task-attachments-comments-panel.tsx`, `_task-attachments.tsx`, `_task-comments.tsx`, the new migration). Files also showing in `git diff` (`comments/route.ts`, `_task-attachment-viewer-modal.tsx`) belong to task 212's already-uncommitted work, not this task — excluded from this review.
- No `any` or untyped escape hatches — Realtime payloads are cast to narrow, explicit shapes (`AttachmentRow & { entity_type: string }`, `{ id: string }`, `{ entity_id: string }`) matching only the fields each handler actually reads, not `any`.
- No deep nesting — both new Realtime `useEffect`s follow the same flat subscribe/handle/cleanup shape as `_project-detail.tsx`'s existing precedent.
- Each file/function has one responsibility: the panel only toggles visibility; each child's new `useEffect` only handles its own table's Realtime sync, kept separate from the existing fetch effect.
- Names accurately describe behavior (`fetchComments`, `commentsRef`, `task_attachments_${taskId}`/`task_comments_${taskId}`/`task_comment_attachments_${taskId}` channel names are self-describing and collision-free).
- Repeated logic: none newly introduced; `formatFileSize`/`IMAGE_EXTENSIONS` duplication across these files is pre-existing (task 212's own Quality Gate Notes already accepted this), untouched by this task's diff.
- Errors handled intentionally: fetch failures still silently no-op (`.catch(() => {})`), unchanged from pre-task-213 behavior; Realtime channels have no explicit subscribe-status error handling, matching `_project-detail.tsx`'s own identical precedent exactly (not a new gap).
- No secrets, credentials, or debug logging in production paths.
- Fixed-hex token styling throughout the touched JSX; the one new className expression (`cn(tab !== "..." && "hidden")`) uses a standard Tailwind utility, not `dark:` or `style={{}}`.
- `npx tsc --noEmit` and `pnpm lint` both re-confirmed PASS during this review (rerun, not just trusted from Implementation Notes).
- File sizes re-confirmed: 53 / 199 / 225 lines — within `nextjs-file-length-best-practices.md`'s soft-warning threshold; no split needed.

### Deviations
- **Minor — DELETE-event filtering depends on data Postgres may not send.** Both Realtime `DELETE` handlers read `entity_type`/`entity_id` off `payload.old`, which Postgres only populates fully when a table has `REPLICA IDENTITY FULL`; by default (primary key only) `payload.old` on a `DELETE` may carry just `{ id }`. No migration in this repo sets `REPLICA IDENTITY FULL` on any table, including `tasks`/`issues` (which `_project-detail.tsx` already subscribes to `DELETE` events on today) — so this is an existing, accepted characteristic of the pattern being mirrored, not a new gap this task introduces. Both new handlers fail open safely (a missing `entity_type` doesn't crash, it just skips the extra guard and falls through to an `id`-based filter that's a no-op if the id isn't locally present). No user-facing impact today since no delete UI exists yet for either attachment type (task 212 Decision #11). Not required to fix in this pass; flagging for whoever eventually ships attachment deletion.
- **Minor — no request-sequencing on Realtime-triggered `fetchComments()` calls.** If multiple `task_comments`/`attachments` events fire in quick succession, the resulting `fetchComments()` calls race with no cancellation of the earlier one; the last *response to resolve* wins, not necessarily the last *event* received. Acceptable for this internal tool's realistic comment-posting frequency (a handful of staff per task, not high-throughput), and the eventual UI state is still correct once the burst settles (each response is a full, authoritative list, never a partial patch).
- No deviations touching Out of Scope boundaries — confirmed `_project-detail.tsx`'s own `tasks`/`issues` subscriptions, the comments/attachments API routes' response shapes, task 212's composer/attachment-picker/HTML-body rendering, and attachment/comment delete UI are all untouched by this task's diff.
- The one deviation from the plan's own Code Context sketch (checking comment membership via a `useRef` mirror instead of inside a `setComments` updater) is already documented in Implementation Notes as a correctness fix, not a scope change — re-confirmed correct on this pass.

## Post-Gate Fix — Attachment Preview Modal Race (User-Reported)

### Symptom
User reported "Failed to load file preview." in `TaskAttachmentViewerModal` when viewing a task attachment, reproducible via browser (`shutterstock_2068659026 (1).jpg` on task `46305B0C01-T0001`).

### Root Cause (systematic-debugging, Phase 1–2)
Reproduced via Chrome automation + `read_network_requests`: every single "View" click fired **two** real `GET .../file-url` requests, not one — confirmed deterministic across a clean click (0 prior requests → exactly 2 after). Traced to React 19 Strict Mode's dev-only mount→cleanup→remount effect-invocation cycle (Next.js defaults `reactStrictMode: true`; no override in `next.config.ts`). One of the two duplicate requests intermittently receives a transient `503` from the Next.js dev server (confirmed NOT reproducible via a plain `Promise.all([fetch(url), fetch(url)])` or a manual synchronous-abort test from the console — both stayed 200/AbortError as expected — so the 503 is specific to the exact timing Strict Mode's real remount produces, a Next-dev-mode artifact outside application-code control). Compared against the working pattern in the same directory: `_task-attachments.tsx`'s `AttachmentThumbnail` already guards its own per-tile signed-URL fetch with a `cancelled` flag; `_task-attachment-viewer-modal.tsx`'s fetch effect had no equivalent guard — so whichever of the two duplicate requests' callbacks ran *last* won, regardless of which was actually correct, and a stale request's own `ctrl.abort()`-adjacent failure could stomp a genuinely successful result.

### Fix
`_task-attachment-viewer-modal.tsx` — added a `let cancelled = false` flag (mirroring `AttachmentThumbnail`'s existing pattern exactly), set in the effect's cleanup alongside the existing `ctrl.abort()`, and checked before each of `setUrl`/`setError`/`setLoading`. A superseded effect instance's result — whatever it is — is now a no-op instead of overwriting the current, active instance's state.

### Verification
- `npx tsc --noEmit` / `pnpm lint` — both PASS.
- Browser reproduction (Chrome automation): reloaded the task page fresh, clicked "View" on the same attachment across 3 separate close/reopen cycles. `read_network_requests` confirmed the underlying transient `503` still occurs on some of the duplicate requests (Strict Mode's double-invoke itself is unaffected — expected, dev-only, harmless) — but the modal displayed the image successfully every time, with no "Failed to load file preview." shown, across all 3 reproductions. Root cause confirmed fixed at the application-code level regardless of the underlying dev-mode duplicate-request artifact.
- File is 137 lines — no length concern.

## Post-Gate Fix — Comment Attachments: Add HTML, Markdown, Plain Text, MP4 (User-Requested)

### Request
User asked for comment attachments to also accept HTML, MD, TXT, and MP4 files (previously images/PDF/Word/Excel only).

### Change 1 — server allow-list
`src/app/api/v2/tasks/[taskId]/comments/[commentId]/attachments/route.ts` — added `text/html`, `text/markdown`, `text/plain`, `video/mp4` to `ALLOWED_MIME_TYPES`, matching the precedent already established in `src/app/api/customers/[customerId]/assets/upload/route.ts` (the onboarding wizard's HTML Mockup step, which uploads the same three text-based types). Updated the 400 error message's "Supported types" text to match. `MAX_FILE_SIZE` (25MB) left unchanged — not requested, and worth flagging separately since MP4s commonly exceed it.

### Change 2 — client-side picker (found via live user report, not requested but necessary)
User reported the exact rejection still happening in-browser (`payment-failed-email.html: unsupported file type`) even after Change 1. Traced to a **second**, independent allow-list: `src/app/v2/(hub)/projects/[projectId]/_task-attachment-picker.tsx` (`TaskAttachmentPicker`) validates client-side before a file ever reaches the server route, and still had the original image/PDF/Office-only list. This component is shared with the New Task modal (`_project-detail.tsx`), whose own server route (`.../projects/[projectId]/tasks/[taskId]/attachments/route.ts`) was intentionally left untouched (out of scope — only comment attachments were requested) — so the component's default list couldn't simply be widened without creating a client/server mismatch for that other caller (accept-then-400 UX). Fixed by making the allow-list a `allowedMimeTypes?: string[]` prop (default unchanged, so the New Task modal's call site needed zero changes), and passing a new `COMMENT_ATTACHMENT_MIME_TYPES` constant (mirroring the server route's list exactly) from `_task-comments.tsx`'s call site only.

### Files Changed
- `src/app/api/v2/tasks/[taskId]/comments/[commentId]/attachments/route.ts` — widened `ALLOWED_MIME_TYPES` + error message
- `src/app/v2/(hub)/projects/[projectId]/_task-attachment-picker.tsx` — `ALLOWED_MIME_TYPES` renamed to `DEFAULT_ALLOWED_MIME_TYPES`, new optional `allowedMimeTypes` prop (default-preserving, New Task modal call site unchanged)
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-comments.tsx` — new `COMMENT_ATTACHMENT_MIME_TYPES` constant passed to `TaskAttachmentPicker`

### Verification
- `npx tsc --noEmit` / `pnpm lint` — both PASS.
- Browser reproduction: uploaded a real `payment-failed-email.html` test file via the comment composer's picker (Chrome automation `file_upload`) — staged successfully with no rejection, confirming the fix at the actual UI entry point the user hit, not just the server route in isolation.
