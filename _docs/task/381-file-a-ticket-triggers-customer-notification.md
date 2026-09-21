# 381: "File a Ticket" Also Triggers the Customer Notification Email

**Created:** 2026-09-21
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Task 379's "ticket created" customer email only fires from `email-poll`'s new-`tickets`-row branch (a brand-new inbound customer email). Task 380 added a manual resend for that same table. Neither fires when staff uses **"File a Ticket"** — the action on a Desk > Inbox thread message that creates a row in the separate `issues` table (Desk > Tickets), via `POST /api/v2/projects/[projectId]/tickets`. The user tested this exact flow (File a Ticket → pick a project → Create) and got no email, which is correct given task 379/380's scope as built — but the user has now confirmed they want this action to *also* trigger the customer notification.

**Why this is possible without a new data model:** "File a Ticket" already threads the originating Desk > Inbox ticket's UUID through as `source_ticket_id` on the created `issues` row (task 363; `_thread-to-project-modal.tsx` passes its `ticketDbId` prop into `CreateTicketModal`'s `sourceTicketId`, which lands in the `POST` body — see `_create-ticket-modal.tsx:118-132` and `route.ts:78-80`). That FK is exactly the same originating ticket task 379/380 already know how to notify — this task just adds a second call site for `notifyCustomerTicketCreated()`, gated on `source_ticket_id` being present.

**User's own words on when this should fire:** "Also send/resend the notification when File a ticket > Select Project > Create, once successful, send notification to the recipient/client" — i.e., after the `issues` insert succeeds, unconditionally (a fresh send/resend each time a ticket is filed from that message), using the *originating* ticket's requester email — not a new email concept, the same task-379 email.

## Requirements

- [ ] In `POST /api/v2/projects/[projectId]/tickets` (`src/app/api/v2/projects/[projectId]/tickets/route.ts`), after the `issues` insert succeeds, when the created row's `source_ticket_id` is non-null: look up the originating `tickets` row (`id, ticket_number, subject, requester_email`) and call `notifyCustomerTicketCreated()` — the exact same function tasks 379/380 already use, unchanged.
- [ ] Must **not** fire for ordinary project-ticket creation with no `source_ticket_id` (the normal "New Ticket" flow from inside a project page) — that path has no linked customer/requester email at all.
- [ ] Non-blocking / best-effort, matching every other call site of this function: a failure here must not fail the `issues` insert or change the route's `201` response. `notifyCustomerTicketCreated()` already swallows its own failures and returns `boolean` (task 380) — this call site can simply `await` and log-and-continue like `email-poll`'s does, no new try/catch needed around the call itself.
- [ ] If the originating ticket has no `requester_email` (shouldn't happen for a real customer email, but defensive), skip silently — same posture as "nothing to notify," not an error.
- [ ] No client-side changes. The existing "Create" success toast/modal-close behavior in `_create-ticket-modal.tsx` is untouched — this is a fire-and-forget server-side effect, same as the automatic email-poll send (staff never got a "customer notified" confirmation there either, and the task-380 resend button already exists as the visible fallback/retry surface).

## Out of Scope / Must-Not-Change

- **No dedupe/guard against filing the same message twice.** There is no existing "file again" affordance in the UI for an already-filed message, so a second filing (if it ever happens) sending a second email is an acceptable, low-probability edge case — not worth extra state to prevent.
- **No changes to `_create-ticket-modal.tsx` / `_thread-to-project-modal.tsx`.** `source_ticket_id` is already threaded through correctly (task 363) — nothing on the client needs to change for this task.
- **No changes to the ordinary "New Ticket" flow** (opened from inside a project page, no `sourceTicketId` prop, no `source_ticket_id` in the POST body) — confirmed it already omits the field (`source_ticket_id: sourceTicketId || undefined`), so the new server-side check naturally excludes it.
- **No new database columns/migration.** `source_ticket_id` (migration 137) and every column `notifyCustomerTicketCreated()` touches already exist.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/v2/projects/[projectId]/tickets/route.ts` | Modify | After a successful insert with `source_ticket_id` set, look up the originating ticket and call `notifyCustomerTicketCreated()` |

## Code Context

### `src/app/api/v2/projects/[projectId]/tickets/route.ts` — current insert + response (lines 63-96)

```ts
const { data, error } = await supabase
  .from("issues")
  .insert({
    project_id: project.id,
    title: body.title.trim(),
    // ...
    source_ticket_id: body.source_ticket_id || null,
  })
  .select()
  .single();

if (error) {
  console.error("[api/v2/projects/[id]/tickets] create failed:", error.message);
  return NextResponse.json({ error: error.message }, { status: 400 });
}

// Task 287 / 351 — each assignee gets persistent project access. Best-effort.
if (sync.assignees.length > 0) {
  await Promise.all(sync.assignees.map((id) => addProjectMember(project.id, id, user.id)))
    .catch((err) => console.error("[api/v2/projects/[id]/tickets] project_members sync failed:", err));
}

return NextResponse.json(data, { status: 201 });
```

New logic goes between the `error` check and the final `return` — same slot as the existing assignee-sync best-effort block, same posture (awaited, but a failure inside is caught and logged, never surfaces to the response). Use `adminClient` (not the route's session-scoped `supabase`) for the originating-ticket lookup — every other call site that touches the `tickets` table for this feature (`email-poll`, the task-380 resend route, `notifyCustomerTicketCreated` itself) already uses `adminClient`; staying consistent avoids a possible RLS-policy gap being the difference between "works from the cron" and "works from this route."

```ts
if (data.source_ticket_id) {
  const { data: sourceTicket } = await adminClient
    .from("tickets")
    .select("id, ticket_number, subject, requester_email")
    .eq("id", data.source_ticket_id)
    .maybeSingle();
  if (sourceTicket?.requester_email) {
    await notifyCustomerTicketCreated({
      ticketId: sourceTicket.id,
      ticketNumber: sourceTicket.ticket_number,
      subject: sourceTicket.subject,
      requesterEmail: sourceTicket.requester_email,
    });
  }
}
```

### `src/app/(hub)/projects/_shared/_create-ticket-modal.tsx` — confirms `source_ticket_id` is already wired (lines 42-56, 118-132)

```ts
// Task 363 — the Desk ticket's UUID `id` when this modal was opened via "File a Ticket" on a
// ticket thread message. Stamps `tickets.source_ticket_id` [sic — the column is on `issues`,
// not `tickets`; pre-existing comment, not touched by this task] so the ticket surfaces on the
// Desk > Tickets tab. Omitted for the normal (project-page) New Ticket flow.
sourceTicketId?: string;
```

```ts
const res = await fetch(`/api/v2/projects/${projectId}/tickets`, {
  // ...
  source_ticket_id: sourceTicketId || undefined,
});
```

Confirms the ordinary New Ticket flow (no `sourceTicketId` prop passed in) sends `source_ticket_id: undefined`, which the route already normalizes to `null` — the new check's `if (data.source_ticket_id)` guard is sufficient, no client change needed.

### `src/lib/desk/customer-view-access.ts` — the function being reused, unchanged (signature only)

```ts
export async function notifyCustomerTicketCreated(params: {
  ticketId: string;
  ticketNumber: number;
  subject: string;
  requesterEmail: string;
}): Promise<boolean>
```

## Implementation Steps

1. Add `adminClient` and `notifyCustomerTicketCreated` imports to `src/app/api/v2/projects/[projectId]/tickets/route.ts`.
2. After the `issues` insert succeeds, add the `source_ticket_id`-gated lookup + `notifyCustomerTicketCreated()` call shown above, in the same slot as the existing assignee-sync block.
3. Run `npx tsc --noEmit` and `pnpm lint`.

## Acceptance Criteria

- [ ] Filing a ticket from a Desk > Inbox message (via "File a Ticket" → pick project → Create) sends a fresh "ticket created" email (new password) to the originating message's `requester_email`.
- [ ] Creating an ordinary project ticket from inside a project page (no `source_ticket_id`) sends no email.
- [ ] A failure in the notification (e.g. simulated `MAIL_HOST` breakage) does not change the route's success response or prevent the `issues` row from being created.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Browser/manual: file a ticket from a real Desk > Inbox message and confirm the email arrives; create an ordinary project ticket and confirm no email is sent; needs `MAIL_*` env + migration 146 applied, same prerequisites as tasks 379/380.

## Compatibility Touchpoints

- No env var, dependency, or migration additions.
- CLAUDE.md's task-379 bullet (once written at the `document` stage) should mention this second trigger path alongside the manual resend (task 380).

## Implementation Notes

### What Changed
- `src/app/api/v2/projects/[projectId]/tickets/route.ts`: added `adminClient` and `notifyCustomerTicketCreated` imports; after the `issues` insert succeeds, when `data.source_ticket_id` is set, looks up the originating `tickets` row via `adminClient` and calls `notifyCustomerTicketCreated()` when it has a `requester_email`. Placed in the same slot as the existing assignee-sync best-effort block, exactly as planned — no deviation from the Code Context.

### Files Changed
- `src/app/api/v2/projects/[projectId]/tickets/route.ts` - new source_ticket_id-gated notification call after ticket creation

### Deviations From Plan
- None — implemented exactly as specified in Code Context, single file, no client changes.

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors)
- `pnpm lint` - PASS (2 pre-existing unrelated warnings in `_checklist-tab.tsx`, untouched by this task)
- Browser acceptance - NOT RUN (needs migration 146 applied + `MAIL_*` env, same prerequisites as tasks 379/380; requires filing a real ticket from a Desk > Inbox message with a live requester email)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, no broad `any`, no secrets/debug logging. Nesting (2 levels: `if (source_ticket_id)` → `if error / else if requester_email`) is as flat as the control flow allows — can't early-return since the route must still send its `201` response regardless of notification outcome, and this matches the shape of the adjacent, pre-existing assignee-sync best-effort block in the same file.
- **One real gap found and fixed during this pass**: the lookup only destructured `data`, never `error` — a genuine Supabase/DB failure on the `SELECT` (not just "row not found") would have failed completely silently, with no log line anywhere. Every comparable call site in this codebase (the assignee-sync block two lines above it in this same file, task 380's resend route, `notifyCustomerTicketCreated` itself) logs its own errors. Fixed by destructuring `error` and adding a `console.error` branch, mirroring the file's own established pattern. Re-verified `npx tsc --noEmit` + `pnpm lint` clean after the fix (0 errors, same 2 pre-existing unrelated warnings).
- Noted, not fixed: the "select ticket fields → gate on `requester_email` → call `notifyCustomerTicketCreated`" shape is now duplicated between this file and task 380's resend route (`src/app/api/desk/tickets/[ticketId]/resend-notification/route.ts`) — about 5 lines, same simple `tickets` column list. Small enough, and stable enough (this exact 4-column select is unlikely to churn), that extracting a shared helper isn't worth touching an already-shipped, already-quality-gated file (task 380) for. Flagged here per the "repeated logic" standard so it's visible if a third call site ever appears (rule-of-three extraction candidate), not treated as a blocking finding now.

### Deviations
- None beyond the one fix above, which is a correctness/observability improvement within the single file already in scope — not a scope change, and not visible to end users (it only affects what shows up in server logs on a DB failure that was already silently degrading to "no notification sent").

### Required Fixes
None — the one finding was fixed inline during this gate.
