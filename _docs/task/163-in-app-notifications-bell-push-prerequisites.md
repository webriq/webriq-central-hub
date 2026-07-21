# 163: In-App Notifications — Activate Header Bell + Wire Push Notification Prerequisites

**Created:** 2026-07-20
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

The notification bell in the v2 hub header (`src/app/v2/(hub)/_components/v2-hub-header.tsx:137-141`) is currently decorative: a static `<button>` with a hardcoded red dot and no click handler, no dropdown, and no data source. Task 064 (Push Notifications, status TESTING) explicitly scoped out building this: *"Do not create a full notification center UI in this task — that's a separate feature."* This task **is** that separate feature.

This task builds:
1. A `notifications` table + API so the bell can show real, persisted, per-user notifications (list, unread count, mark read).
2. The dropdown UI on the bell itself.
3. A `createNotification()` helper that writes the in-app row **and** calls the existing (but currently unused) `sendPushNotification()` from task 064 — this is the first real caller push notifications have ever had.
4. The missing wiring that's currently blocking push notifications from working at all for v2 users (see Prerequisites below).

### Investigation findings: what's missing for Push Notifications (task 064)

Task 064 shipped the *plumbing* only. Three things are still missing before push notifications can actually fire for any real user event:

- **`sendPushNotification()` has zero callers.** `grep -rl sendPushNotification src` returns only its own definition file (`src/lib/push/index.ts`). Nothing in the codebase invokes it — no route, no cron job, nothing. The function works in isolation but nothing triggers it.
- **`PushPermissionPrompt` is wired into the legacy hub layout only.** `src/app/(hub)/layout.tsx:43` renders `<PushPermissionPrompt />`, but `src/app/v2/(hub)/layout.tsx` (the layout actually in active use — it's what renders the header/sidebar this task is touching) does **not** render it. V2 users are never asked for notification permission and never get a row written to `push_subscriptions`, so even if something called `sendPushNotification()`, there would be no subscription to send to for any v2 user.
- **No event source exists yet to call it from.** Task 064's own Goal section says push should fire "when a preview URL is ready, when approval is needed, when a deploy completes, or when a health check fails" — none of those events exist as real code paths yet (they belong to Sprint 4/5 execution engine work that hasn't landed). Two kinds of already-shipped events do have clear recipients today: plan approve/reject (`src/app/api/plan/route.ts`), and the onboarding/programme events below.

This task fixes the first two (dead-simple, no new design needed) and gives push its first real trigger by routing it through the new `createNotification()` helper at the events that already have a resolvable recipient today. Full event coverage (deploy complete, health check failed, preview ready) is out of scope until the execution engine (Sprint 5) exists — flagged as follow-up, not silently dropped.

### Onboarding/programme events — already fire externally, never in-app

Three onboarding-related routes already notify *someone* today, but only via `sendCliqNotification()` — a broadcast to a whole Zoho Cliq channel (`"pm"` or `"dev"`), not a specific in-app user:

- `src/app/api/programme/reminders/route.ts` — daily cron (`notifyOnce()`), fires per-project onboarding step reminders.
- `src/app/api/projects/[projectId]/programme/complete-phase/route.ts` — phase handoff ("Phase N complete — handed over to Phase N+1, owner: X") and 120-day programme completion.
- `src/app/api/customers/[customerId]/products/[productName]/onboarding/route.ts` — customer finishes all onboarding forms for a product.

When task 064 was written, there was no way to resolve "the PM for this project" to a specific `profile_id` — `projects` only had `created_by`, set once and never editable. Task 155 (2026-07-15) added `project_members` (`project_id`, `user_id`, `is_owner`), which now makes a per-user recipient resolvable for all three routes above: the project owner, or all project members. This task adds a `notifyProjectMembers(projectId, payload, { ownerOnly? })` helper and wires it into all three routes alongside their existing `sendCliqNotification()` calls (both fire — Cliq broadcast is not being removed, in-app/push is additive).

---

## Requirements

- [ ] `notifications` table (migration) — id, profile_id, type, title, body, url (nullable), read_at (nullable), created_at — with RLS so a user can only select/update their own rows; inserts happen server-side via `adminClient` only.
- [ ] `src/lib/notifications/index.ts` — `createNotification({ profileId, type, title, body, url })`: inserts the row, then calls `sendPushNotification(profileId, { title, body, url })` (best-effort — push failure must not fail the notification write).
- [ ] `notifyProjectMembers(projectId, payload, { ownerOnly? })` in the same module — resolves recipients from `project_members` (owner only, or all members) and calls `createNotification()` for each; best-effort per recipient (one failure doesn't block the rest).
- [ ] `GET /api/notifications` — auth guard, returns the current user's notifications (paginated, most recent first) + `unread_count`.
- [ ] `PATCH /api/notifications/[id]` — auth guard, marks one notification read (sets `read_at`); must verify the row belongs to the caller.
- [ ] `POST /api/notifications/mark-all-read` — auth guard, marks all of the caller's unread notifications read.
- [ ] Wire `<PushPermissionPrompt />` into `src/app/v2/(hub)/layout.tsx` (or `_components/v2-hub-shell.tsx`, whichever is the client-mounted boundary) — currently missing entirely for v2.
- [ ] Replace the static bell button in `v2-hub-header.tsx` with a working `NotificationBell` client component: real unread-count badge (not the hardcoded red dot), dropdown panel listing recent notifications, click-to-navigate + mark-read, "mark all read" action, empty state (icon + one-line message, per UI Polish Conventions), loading state while fetching.
- [ ] Wire `createNotification()` into the plan approve/reject flow (`src/app/api/plan/route.ts`) — notify the relevant PM/assignee on approval or rejection.
- [ ] Wire `notifyProjectMembers()` into `src/app/api/programme/reminders/route.ts`, `src/app/api/projects/[projectId]/programme/complete-phase/route.ts`, and `src/app/api/customers/[customerId]/products/[productName]/onboarding/route.ts` — alongside their existing `sendCliqNotification()` calls, not replacing them.
- [ ] Wire `notifyProjectMembers()` into `src/app/api/projects/[projectId]/programme/deliverables/[deliverableKey]/route.ts` and the `internal-deliverables/[deliverableKey]` route — fire only on the transition into `status === "done"` (not on every touch, not on `in_progress`), added post-gate per user follow-up.
- [ ] `npx tsc --noEmit` exits 0.

## Out of Scope / Must-Not-Change

- Do not build the broader event coverage from task 064's original goal (preview URL ready, deploy complete, health check failed) — those events don't exist in code yet (Sprint 4/5 execution engine). Only plan approve/reject and the three onboarding/programme routes below are wired in this task.
- Do not touch the legacy (non-v2) hub header/sidebar or `(hub)/layout.tsx` beyond what's already there (it already has `PushPermissionPrompt` from task 064) — only v2 is missing it.
- Do not add realtime/websocket infra (no Supabase Realtime channel pattern exists anywhere in this codebase today) — poll on an interval, consistent with existing patterns.
- Do not modify `src/lib/push/index.ts` or the `/api/push/subscribe` route from task 064 — they work as-is; this task only gives them a caller.
- Do not change `implementation_plans` table schema or the approve/reject status logic in `plan/route.ts` — only add a `createNotification()` call alongside the existing logic.
- Do not remove or alter any existing `sendCliqNotification()` call in the three onboarding/programme routes — `notifyProjectMembers()` is additive (Cliq broadcast + in-app/push both fire), not a replacement.
- Do not touch `project_members` schema, RLS, or the ownership-transfer logic from tasks 153/155 — only read from it to resolve notification recipients.
- No `dark:` Tailwind classes or `isDark` prop — `v2-hub-header.tsx` and `v2-hub-sidebar.tsx` are static light-mode today (no `isDark` threading exists in either file); match that, don't introduce theming here.

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/082_notifications.sql` | Create | `notifications` table + RLS policies using `get_my_role()`/`auth.uid()` pattern |
| `src/types/database.ts` | Modify | Add `notifications` table types (Row/Insert/Update/Relationships) |
| `src/lib/notifications/index.ts` | Create | `createNotification()` — insert row + call `sendPushNotification()` |
| `src/app/api/notifications/route.ts` | Create | `GET` — list + unread_count |
| `src/app/api/notifications/[id]/route.ts` | Create | `PATCH` — mark one read |
| `src/app/api/notifications/mark-all-read/route.ts` | Create | `POST` — mark all read |
| `src/app/v2/(hub)/layout.tsx` | Modify | Render `<PushPermissionPrompt />` (currently missing for v2) |
| `src/app/v2/(hub)/_components/notification-bell.tsx` | Create | Client component: bell button + dropdown, fetch/poll, mark-read |
| `src/app/v2/(hub)/_components/v2-hub-header.tsx` | Modify | Replace static bell button (lines 137-141) with `<NotificationBell />` |
| `src/app/api/plan/route.ts` | Modify | Call `createNotification()` on approve/reject |
| `src/app/api/programme/reminders/route.ts` | Modify | Call `notifyProjectMembers()` alongside existing `sendCliqNotification()` per reminder |
| `src/app/api/projects/[projectId]/programme/complete-phase/route.ts` | Modify | Call `notifyProjectMembers()` on phase handoff + programme completion |
| `src/app/api/customers/[customerId]/products/[productName]/onboarding/route.ts` | Modify | Call `notifyProjectMembers()` when a customer completes all onboarding forms |
| `src/app/api/projects/[projectId]/programme/deliverables/[deliverableKey]/route.ts` | Modify | Call `notifyProjectMembers()` on deliverable status transition into `done` |
| `src/app/api/projects/[projectId]/programme/internal-deliverables/[deliverableKey]/route.ts` | Modify | Call `notifyProjectMembers()` when the auto-derived parent deliverable transitions into `done` |

---

## Code Context

### Current dead bell (src/app/v2/(hub)/_components/v2-hub-header.tsx:137-141)

```tsx
{/* Notification bell */}
<button aria-label="Notifications" className="relative p-1.5 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer">
  <Bell size={18} />
  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 border-2 border-white" />
</button>
```

### sendPushNotification (src/lib/push/index.ts) — already works, just never called

```ts
export async function sendPushNotification(
  profileId: string,
  payload: PushPayload // { title, body, url? }
): Promise<void> {
  const { data: subscription } = await adminClient
    .from("push_subscriptions")
    .select("endpoint, keys")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!subscription) return;
  // ... webpush.sendNotification(...), deletes stale row on 410
}
```

Note: `.maybeSingle()` assumes at most one subscription row per `profile_id`. The subscribe route only dedupes by `endpoint`, so a user subscribed from two devices will have two rows and this call will throw. Not fixed in this task (no multi-device subscribers exist yet since push has never been wired to anything) — flag as a known follow-up if multi-device push is needed later.

### v2 hub layout — missing PushPermissionPrompt (src/app/v2/(hub)/layout.tsx)

```tsx
export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  // ... auth guard + profile fetch, no PushPermissionPrompt anywhere
  return (
    <V2HubShell userRole={userRole} displayName={userDisplayName}>
      {children}
    </V2HubShell>
  );
}
```

Compare legacy `src/app/(hub)/layout.tsx:6,43` which already imports and renders it — mirror that import/placement here (or inside `V2HubShell` if that's the actual client-mounted tree root — check before deciding where).

### RLS helper pattern to reuse (supabase/migrations/026_rls_policies_v2.sql)

```sql
create or replace function public.get_my_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;
```

Use `auth.uid() = profile_id` directly for the notifications RLS policies (no role check needed — a notification only ever belongs to one user), consistent with how other user-scoped tables in this codebase gate by owner id.

### Existing plan approve/reject flow (src/app/api/plan/route.ts:82-102)

```ts
if (action === "approve") {
  const { data: approvedPlan } = await adminClient
    .from("implementation_plans")
    .update({ status: "APPROVED", approved_by: user.id })
    // ...
  // Push to Zoho — non-blocking; failure does not fail the approve.
}
```

Add `createNotification()` here (and in the reject branch) — non-blocking, same "failure doesn't fail the approve" convention already used for the Zoho push a few lines below.

### formatRelativeTime (src/lib/utils.ts) — reuse for "3m ago" style timestamps in the dropdown

### project_members (src/types/database.ts:653-677) — recipient resolution for onboarding events

```ts
project_members: {
  Row: { id: string; project_id: string; user_id: string; is_owner: boolean; added_by: string | null; created_at: string };
  // ...
}
```

`notifyProjectMembers(projectId, payload, { ownerOnly })` queries `project_members` by `project_id` (optionally `.eq("is_owner", true)`), maps `user_id` → `profileId`, and calls `createNotification()` per row. Projects created before task 153 may have zero `project_members` rows (flagged in task 155) — treat an empty result as a no-op, not an error, so the Cliq broadcast in the calling route still succeeds even when there's no in-app recipient yet.

### programme/reminders idempotency pattern to follow (src/app/api/programme/reminders/route.ts:23-29)

```ts
async function notifyOnce(projectId: string, customerId: string, key: string, message: string, channel: "pm" | "dev" = "pm"): Promise<boolean> {
  const { error } = await adminClient.from("programme_notifications").insert({ project_id: projectId, customer_id: customerId, notification_key: key });
  if (error) return false; // unique violation (already sent) or a real DB error — either way, don't send
  await sendCliqNotification(message, channel);
  return true;
}
```

Call `notifyProjectMembers()` only inside the `if (sent)`/success branch of `notifyOnce`-gated calls — the `programme_notifications` unique-key insert is what prevents duplicate sends on cron re-runs; piggyback on that same guard rather than adding a second dedupe mechanism.

---

## Implementation Steps

1. Write migration `082_notifications.sql`: table + `auth.uid() = profile_id` RLS policies for select/update; no insert policy for authenticated role (server-only writes via `adminClient`).
2. Add `notifications` table types to `src/types/database.ts` (Row/Insert/Update/Relationships, matching the shape used for other tables in that file).
3. Create `src/lib/notifications/index.ts` with `createNotification()` — insert via `adminClient`, then `await sendPushNotification(...)` wrapped so a push failure doesn't throw past the caller. Add `notifyProjectMembers(projectId, payload, { ownerOnly })` in the same file — queries `project_members`, maps to `profileId`, calls `createNotification()` per recipient (empty result is a no-op, not an error).
4. Create the three `/api/notifications*` routes — auth guard pattern from `src/app/api/execution/route.ts:18-25`, ownership check via `.eq("profile_id", user.id)` on every read/update.
5. Add `<PushPermissionPrompt />` to the v2 hub layout tree — confirm whether it belongs in `layout.tsx` (server component — likely needs to stay a sibling like the legacy layout does) or inside `_components/v2-hub-shell.tsx` if that's already a client boundary; match whichever avoids adding "use client" to `layout.tsx` itself.
6. Build `notification-bell.tsx`: fetch `/api/notifications` on mount, poll every 30s, dropdown panel (recent list, unread bolded/dotted, empty state, "mark all read"), click item → mark read + navigate to `url` if present.
7. Swap the static bell markup in `v2-hub-header.tsx` for `<NotificationBell />`.
8. Wire `createNotification()` into `plan/route.ts` approve and reject branches.
9. Wire `notifyProjectMembers()` into the three onboarding/programme routes (`programme/reminders`, `complete-phase`, product onboarding submit), alongside — not replacing — their existing `sendCliqNotification()` calls.
10. Run `npx tsc --noEmit`.

---

## Acceptance Criteria

- [ ] `notifications` table exists with working RLS (a user cannot read or mark-read another user's notifications).
- [ ] `GET /api/notifications` returns the caller's notifications + unread count; `PATCH /api/notifications/[id]` and `POST /api/notifications/mark-all-read` work and are ownership-checked.
- [ ] `createNotification()` writes the in-app row and also triggers a push notification for the same event (verify manually: approve a plan while logged in as a subscribed user → row appears in `notifications` table → push fires if a `push_subscriptions` row exists).
- [ ] `notifyProjectMembers()` correctly resolves recipients from `project_members` and no-ops (does not error, does not block the route's existing Cliq call) when a project has zero members.
- [ ] Completing all onboarding forms for a customer, completing a programme phase, and the daily reminders cron each produce a `notifications` row for the project's owner/members, in addition to their existing Cliq message.
- [ ] V2 users are prompted for push permission (previously they were not — `<PushPermissionPrompt />` now renders somewhere in the v2 hub tree).
- [ ] Bell in `v2-hub-header.tsx` shows a real unread badge, opens a dropdown with real data, supports mark-read and mark-all-read, and has a proper empty state.
- [ ] `npx tsc --noEmit` exits 0.

## Verification

```bash
pnpm install
npx tsc --noEmit
pnpm lint
# Manual: log into /v2 → confirm push permission prompt now appears (previously missing)
# Manual: approve or reject a plan → confirm a row lands in `notifications` and the bell badge updates
# Manual: complete a programme phase (or trigger the reminders cron manually with x-cron-secret) →
#         confirm project owner/members get a `notifications` row in addition to the Cliq message
# Manual: click bell → dropdown shows the notification, click it → marks read + navigates, badge decrements
# Manual: "mark all read" clears the badge
```

## Compatibility Touchpoints

- New migration must be added after `081_customer_asset_folders_cascade_delete.sql` (next number: `082`).
- Does not affect the legacy (non-v2) hub — that layout already has `PushPermissionPrompt`; this task only closes the v2 gap.
- No packaging/adapter/install-surface impact.

---

## Implementation Notes

### What Changed
- Discovered mid-implementation that a `notifications` table (+ `notification_preferences`, unused) already existed from migration 025/026 — scaffolded at the very start of v2 and never wired to anything. No new migration was needed; the planned `082_notifications.sql` was deleted and the database.ts type addition was reverted (the pre-existing type block, with real column names `recipient_id`/`event_type`/`link`/`channels_sent` rather than the `profile_id`/`type`/`url` this doc originally specified, was kept as-is).
- Built `src/lib/notifications/index.ts`: `createNotification()` maps a friendly `{ type, title, body, url }` payload onto the existing schema and writes `channels_sent` based on whether the push send actually succeeded; `notifyProjectMembers()` resolves recipients from `project_members`.
- Built `GET/PATCH /api/notifications*` routes aliasing the DB's real column names back to the friendly `{ type, url }` shape in JSON responses (`select("type:event_type", ..., "url:link", ...)`), so the bell component didn't need to know about the underlying schema.
- Replaced the dead bell button in `v2-hub-header.tsx` with `<NotificationBell />` (`_components/notification-bell.tsx`): real unread badge, dropdown with mark-read/mark-all-read, 30s poll, empty + loading states.
- Added `<PushPermissionPrompt />` to `v2-hub-shell.tsx` (not `layout.tsx` — that's a server component; the shell is the existing client boundary) — this was previously missing entirely for v2 users.
- Wired `createNotification()`/`notifyProjectMembers()` into four routes: `plan/route.ts` (approve/reject), `programme/reminders/route.ts` (daily cron), `complete-phase/route.ts` (phase handoff + programme completion), and the customer onboarding submit route (all products complete) — all additive alongside their existing `sendCliqNotification()` calls, none removed.

### Files Changed
- `src/lib/notifications/index.ts` - new `createNotification()` / `notifyProjectMembers()` helpers
- `src/app/api/notifications/route.ts` - GET list + unread count
- `src/app/api/notifications/[id]/route.ts` - PATCH mark one read
- `src/app/api/notifications/mark-all-read/route.ts` - POST mark all read
- `src/app/v2/(hub)/_components/notification-bell.tsx` - new bell + dropdown component
- `src/app/v2/(hub)/_components/v2-hub-header.tsx` - swapped static bell button for `<NotificationBell />`
- `src/app/v2/(hub)/_components/v2-hub-shell.tsx` - added `<PushPermissionPrompt />` (was missing for v2)
- `src/app/api/plan/route.ts` - notify `classification_records.reviewed_by` on plan approve/reject
- `src/app/api/programme/reminders/route.ts` - `notifyProjectMembers()` alongside each `notifyOnce()` Cliq send; added `project_id` to the projects query for deep-link URLs
- `src/app/api/projects/[projectId]/programme/complete-phase/route.ts` - `notifyProjectMembers()` on phase handoff/programme completion
- `src/app/api/customers/[customerId]/products/[productName]/onboarding/route.ts` - `notifyProjectMembers()` (looked up by `customer_id`, covering all of that customer's projects) when all onboarding forms are complete

### Deviations From Plan
- **Major (schema discovery):** No new `notifications` table/migration was created — one already existed (migration 025), unused, with different column names than this doc assumed. Adapted the lib module and API routes to the real schema instead of building a duplicate table. `src/types/database.ts` was left untouched (reverted my speculative addition).
- **Minor (recipient resolution for plan/route.ts):** The doc didn't verify a recipient existed for plan approve/reject before writing the requirement. `classification_records.reviewed_by` turned out to be the resolvable recipient (the PM who reviewed/classified the ticket) — used that instead of leaving this route unwired.
- **Minor (routing):** Notification `url`s point to `/v2/portfolio-tracker/[projectId]` using `projects.project_id` (the public-facing ID), not the UUID `id` — per the existing documented exception for that route. Required adding `project_id` to a couple of existing `projects` select queries that didn't previously fetch it.
- **Minor (onboarding recipient scope):** The onboarding-submit route's "all products complete" event is customer-wide, not tied to the single product just submitted — so `notifyProjectMembers()` is called for every project under that `customer_id`, not just the one linked to the submitted `customer_product_id`.
- **Minor (lint):** Added a scoped `eslint-disable-next-line react-hooks/set-state-in-effect` on the bell's fetch-on-mount effect, with a reasoning comment — a known false-positive-prone rule already unsuppressed-but-present in two pre-existing, unrelated files in this codebase (`_onboarding-wizard.tsx`, `_onboarding-list.tsx`); those were left alone as out of scope.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS for all files touched by this task (2 pre-existing, unrelated errors remain in untouched files `_onboarding-wizard.tsx` and `_onboarding-list.tsx` — confirmed via `git status` these are uncommitted work from an earlier task, not introduced here)
- Manual browser verification (push permission prompt, bell dropdown, approve/reject/onboarding/reminder notification delivery) - SKIPPED (not run this session; recommended before sign-off)

---

## Quality Gate Notes

### Result
PASS

### Standards Review
- Fixed during this pass: `src/app/api/plan/route.ts` had the `classification_records.reviewed_by` lookup duplicated near-identically in the approve and reject branches — extracted into a shared `notifyReviewer(classificationId, type, title, body)` helper at module scope.
- Fixed during this pass: `programme/reminders/route.ts`'s `notifyOnce()` built the in-app `event_type` from `key.split("-")[0]`, which truncated informative keys (e.g. `phase-late-1` → `phase`, dropping which phase). Changed to use the full `key` verbatim — no consumer currently filters on this column, so full fidelity costs nothing and preserves information for future use.
- All four wired routes (`plan`, `programme/reminders`, `complete-phase`, onboarding-submit) keep their pre-existing `sendCliqNotification()` calls untouched and add the new notification call alongside — matches the task doc's "additive, not replacing" boundary.
- Auth guard, ownership-check (`.eq("recipient_id"/"profile_id", user.id)`), and error-handling patterns in the three new `/api/notifications*` routes match the codebase's established convention (`execution/route.ts`-style guard, `adminClient` reserved for server-only writes).
- `notification-bell.tsx` matches the surrounding file's style conventions (raw `<button>`s, slate palette, no `isDark`/`dark:`, lucide-react icons only, aria-label on the icon button, proper empty/loading states per the UI Polish Conventions in CLAUDE.md).
- No unused imports, no `any`, no dead code, no secrets/debug logging left in any touched file.

### Deviations
- **Major, already resolved during implementation, not a fresh one here:** the pre-existing `notifications` table (migration 025) with different column names than the task doc assumed. This was caught and reconciled during the implement stage (see Implementation Notes above); no further action needed at this gate — confirmed the final code correctly targets the real schema (`recipient_id`/`event_type`/`link`/`channels_sent`) with no leftover references to the originally-planned column names.
- **Minor:** the two standards fixes above (helper extraction, full `event_type` key) are documented as this stage's changes, not implementation deviations — small maintainability improvements within the same scope, no behavior change.

---

## Addendum — Deliverable Completion Notifications (post-gate addition)

Added after the initial quality gate pass, per user follow-up: deliverable status changes were previously silent (no Cliq, no in-app). Scoped to completion only (`in_progress` was explicitly not requested).

### What Changed
- `src/app/api/projects/[projectId]/programme/deliverables/[deliverableKey]/route.ts` — fetches the deliverable's prior status before updating; calls `notifyProjectMembers()` only when the new status is `"done"` and the prior status wasn't already `"done"` (avoids re-notifying on repeated saves of an already-complete deliverable).
- `src/app/api/projects/[projectId]/programme/internal-deliverables/[deliverableKey]/route.ts` — Bert's internal-only checklist route auto-derives a parent `customer_deliverables` row's status from sibling checklist items (existing behavior, task 127). Added a notify call only when that auto-derived parent status becomes `"done"`. The internal checklist items themselves stay Bert-only (never notified individually) — only the parent deliverable it rolls up into (which PM/dev already see) triggers a notification, so no internal-only data is exposed.
- Both use the same `deliverable_complete` event type, message shape `"{deliverable name} marked done — Phase {N}."`, and `/v2/portfolio-tracker/{project_id}` deep link as the rest of this task's notifications.

### Files Changed
- `src/app/api/projects/[projectId]/programme/deliverables/[deliverableKey]/route.ts` - notify on done-transition
- `src/app/api/projects/[projectId]/programme/internal-deliverables/[deliverableKey]/route.ts` - notify when auto-derived parent deliverable completes

### Deviations From Plan
- None — matches exactly what was proposed and agreed (completion-only, not in-progress).

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS for both touched files (same 2 pre-existing, unrelated errors as before remain in untouched files)
- Manual browser verification - SKIPPED (not run this session)

---

## Addendum — Bell UI Polish + Actor/Project Enrichment (post-testing, via /impeccable)

User flagged the shipped bell's UI (screenshot) and asked for the actor and project name to be visible on each notification, so it's clear "what and who."

### What Changed
- `notification-bell.tsx`: replaced the plain unread dot with a per-category icon in a tinted circle (green check for completions, red X for rejections, amber clock for reminders, gray bell fallback); added `focus-visible` rings to the bell trigger, "Mark all read," and every item button — none had any before.
- Enriched every notification body with the acting teammate's name (where a real staff actor exists) and the project name, reusing data already available in each route (`profiles.full_name`, `projects.name`) — no schema change needed for this pass.
- Routes touched: `plan/route.ts` (approve/reject → actor name via a new `getActorName()` helper), `complete-phase/route.ts`, both deliverable routes, `programme/reminders/route.ts` (project name only — cron-triggered, no staff actor), and the onboarding-submit route (project name only — customer-triggered, no staff actor).

### Files Changed
- `src/app/v2/(hub)/_components/notification-bell.tsx` - icon-per-category, focus-visible states
- `src/app/api/plan/route.ts` - actor name in approve/reject notifications
- `src/app/api/projects/[projectId]/programme/complete-phase/route.ts` - actor + project name
- `src/app/api/projects/[projectId]/programme/deliverables/[deliverableKey]/route.ts` - actor + project name
- `src/app/api/projects/[projectId]/programme/internal-deliverables/[deliverableKey]/route.ts` - actor + project name
- `src/app/api/programme/reminders/route.ts` - project name (no actor — cron-triggered)
- `src/app/api/customers/[customerId]/products/[productName]/onboarding/route.ts` - project name (no actor — customer-triggered)

### Deviations From Plan
- None — additive text/visual enrichment only, no behavior change to when/who gets notified.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (same 2 pre-existing, unrelated errors only)

---

## Addendum — Drawer Conversion + Actor Avatars (post-testing, via /impeccable)

User asked to convert the dropdown into a full drawer (reference: a dark-themed Cliq-style notification panel) showing the actor's profile picture, not just their name in text.

### What Changed
- Converted the anchored dropdown to a fixed, full-height slide-in drawer from the right edge, with a click-to-close backdrop, Escape-to-close, and a `motion-reduce`-safe transition. Restyled to this app's existing light-mode header/OpsChat palette (white/slate, amber accent for "Mark all read") rather than the reference's dark theme — no precedent anywhere in this shell (header, sidebar, or the existing OpsChat side-panel) for a dark drawer mounted from this light header, so matching the reference's literal color scheme would have broken visual continuity with its own trigger.
- Added `actor_id` to the `notifications` table (new migration, nullable — cron/customer-triggered events have no staff actor) and extended `NotificationPayload`/`createNotification()` to store it. `GET /api/notifications` now joins `profiles(full_name, avatar_url)` via that FK.
- Every route with a real staff actor (both deliverable routes, plan approve/reject, complete-phase) now passes `actorId` alongside the existing actor-name-in-text change from the prior addendum.
- The drawer renders the actor's real avatar photo when set, else a deterministic colored-initials circle (same visual language as the header's existing presence avatars); falls back to the category icon when there's no actor at all.
- Deliberately did **not** implement the reference's "Participants" (stacked multi-avatar) row — there's no data model here for "multiple people on one event" the way the reference's shared-document-update notifications have; faking it would have been an invented affordance.

### Files Changed
- `supabase/migrations/082_notifications_actor_id.sql` - new `actor_id` column + index
- `src/types/database.ts` - `notifications` type updated with `actor_id`
- `src/lib/notifications/index.ts` - `NotificationPayload.actorId`, written on insert
- `src/app/api/notifications/route.ts` - joins actor `full_name`/`avatar_url`
- `src/app/api/plan/route.ts`, `complete-phase/route.ts`, both deliverable routes - pass `actorId: user.id`
- `src/app/v2/(hub)/_components/notification-bell.tsx` - full drawer rewrite (backdrop, slide transition, avatar rendering)

### Deviations From Plan
- Skipped the reference's "Participants" row (see above) — a deliberate scope cut, not an oversight.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (same 2 pre-existing, unrelated errors only)
- Manual browser check: confirmed drawer opens/closes correctly (slide-in, backdrop, empty state) against a live logged-in session. Did not confirm the populated-list avatar rendering end-to-end — user opted to verify that independently.

---

## Addendum — Missing Index Performance Fix (post-testing)

User asked whether the bell's 30s polling was causing lag.

### What Changed
- Root-caused: the `notifications` table has had **zero indexes** since its original creation (migration 025) — not even on `recipient_id`, which both of the bell's queries filter on (Postgres doesn't auto-index foreign key columns). Every poll was running a full sequential scan across every user's rows, not just the caller's, and would only get slower as the table grows.
- Added a composite index `(recipient_id, created_at desc)` for the list query, and a partial index `(recipient_id) where read_at is null` for the unread-count query.

### Files Changed
- `supabase/migrations/083_notifications_indexes.sql` - two new indexes, no query changes needed

### Deviations From Plan
- None — pure additive migration.

### Verification Run
- Confirmed via migration history that no index on `recipient_id` ever existed - PASS (verified, not assumed)
- Migration not yet applied to the user's Supabase instance as of this writing — flagged that this is required for the fix to take effect
- Honest caveat recorded: at current (low) data volume, this may not fully explain any perceived lag on its own; noted as a real defect worth having regardless
- No new deviations found beyond what Implementation Notes already recorded (recipient resolution via `reviewed_by`, `project_id`-based routing, customer-wide onboarding notification scope, scoped lint disable). All were reviewed against the task doc's Out-of-Scope boundaries and none cross them.
