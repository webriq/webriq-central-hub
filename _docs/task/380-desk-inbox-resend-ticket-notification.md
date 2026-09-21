# 380: Desk > Inbox — Manual "Send Notification" Action (Resend Task-379 Ticket Email)

**Created:** 2026-09-21
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Task 379 sends the "Your ticket has been created" customer email automatically, but only once, from `email-poll`'s new-ticket branch, and the send is deliberately best-effort/non-blocking (a failure is swallowed and logged, never surfaced to staff). Two gaps follow directly from that:

1. If the send silently fails (bad `MAIL_*` config, transient SMTP error, etc.), staff have no way to know or retry — the ticket just sits with `customer_notified_at: null` forever.
2. Every ticket created *before* task 379 shipped has no password and was never notified at all.

This task adds a manual "Send Notification" action to give staff a retry/backfill path, mirroring the precedent already established for StackShift Orders (task 375's "Resend notification" button).

**Placement, resolved during planning (important — two different tables share the word "ticket" in this app):** this goes on **Desk > Inbox** (`/desk/inbox`, the `tickets` table — task 379's actual `requester_email`/password/lockout owner), **not** Desk > Tickets (`/desk/tickets`, the `issues` table staff file *from* an inbox message via "File a Ticket" — a project work-item tracker with no customer/requester-email column at all, and no notification concept today). The user's own reason for asking ("resend the task-379 email... tickets created before this update") only makes sense against the Inbox table; confirmed explicitly with the user before starting this doc.

## Requirements

- [ ] Icon-only button (no visible label — "save space") in each Desk > Inbox row, with a Base UI `Tooltip` (`@/components/ui/tooltip`, already globally provided via `layout.tsx`'s `TooltipProvider` — no new wiring needed) explaining the action on hover, e.g. "Send ticket notification email".
- [ ] Clicking it calls a new staff-only `POST /api/desk/tickets/[ticketId]/resend-notification`, which regenerates the password (new one, not the old one re-sent — the old one may be compromised or simply unknown to staff) and re-sends `sendTicketCreatedEmail`, reusing `notifyCustomerTicketCreated()` from task 379's `src/lib/desk/customer-view-access.ts` unchanged in shape — this route is a thin resolve-then-call wrapper, not a reimplementation.
- [ ] Button shows a loading state while in flight (spinner replacing the icon, disabled) and a `sonner` toast on success/failure (matches the codebase's documented toast convention for transient confirmations with no inline surface to update — CLAUDE.md's UI Polish Conventions section).
- [ ] Disabled (not hidden — so the tooltip can explain why) when the row has no `requester_email` — there is no address to send to.
- [ ] Staff-only, same role gate as the adjacent status-update route: session required + `profile.role` in `admin | super_admin | pm` (mirrors `src/app/api/desk/tickets/[ticketId]/status/route.ts` exactly, including its `TKT-\d+` param validation).
- [ ] Fix a real correctness gap this action exposes: `notifyCustomerTicketCreated()`'s password-hash update must also reset `customer_view_failed_attempts: 0` and `customer_view_locked_until: null`. Today it only writes the new hash — a ticket that got locked out under the old password would stay locked even after staff issues a brand-new one. This applies to the original creation-time call too (harmless there, since those columns already default to 0/null on a fresh row) so no branching is needed — just widen the one `update()` call.

## Out of Scope / Must-Not-Change

- **No changes to Desk > Tickets (`/desk/tickets`, `issues` table).** Confirmed with the user — that table has no customer/requester-email concept today, and wiring one up is a separate, materially larger piece of work than this task, not a "just add a button" change.
- **No confirmation dialog before sending.** Task 375's resend button (the direct precedent) has none either — a single click, consistent with that established, lower-friction pattern for this class of action.
- **No "last notified" timestamp surfaced in this dense table row.** `tickets.customer_notified_at` already exists (task 379); showing it here would need a new column in an already-tight 6-column grid, and the user asked for an icon-button only, not a status readout. A follow-up if wanted.
- **Do not touch the automatic email-poll send path** (`src/app/api/cron/email-poll/route.ts`) — that flow is unchanged; this task only adds a second, manual call site for the same underlying `notifyCustomerTicketCreated()`.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/desk/tickets/[ticketId]/resend-notification/route.ts` | Create | `POST` — staff-auth gate, resolves the ticket by display `ticket_id`, calls `notifyCustomerTicketCreated()` |
| `src/lib/desk/customer-view-access.ts` | Modify | `notifyCustomerTicketCreated()`'s password-hash `update()` also resets `customer_view_failed_attempts`/`customer_view_locked_until` |
| `src/app/(hub)/desk/inbox/page.tsx` | Modify | Add `hasRequesterEmail` (derived from the already-selected `requester_email`) to the `TicketListItem` mapping |
| `src/app/(hub)/desk/inbox/_inbox-index.tsx` | Modify | Add `sendNotification(ticketId)` handler (POST + per-row loading state + `sonner` toast), pass down to `InboxTable` |
| `src/app/(hub)/desk/inbox/_inbox-table.tsx` | Modify | New icon-button column, `Tooltip`-wrapped, disabled when `!hasRequesterEmail` |

## Code Context

### `src/app/api/desk/tickets/[ticketId]/status/route.ts` — the exact auth/param pattern to mirror (full file, 52 lines)

Session + role check, `TKT-\d+` param validation, resolve via `.eq("ticket_id", ticketId)`. The new route should look structurally identical up through ticket resolution, then call `notifyCustomerTicketCreated({ ticketId: ticket.id, ticketNumber: ticket.ticket_number, subject: ticket.subject, requesterEmail: ticket.requester_email })` instead of a status update — note `notifyCustomerTicketCreated` takes the row's UUID `id` as its `ticketId` param (not the display `ticket_id` the route itself is keyed by), so select both.

### `src/lib/desk/customer-view-access.ts` — the update call to widen (current shape, lines ~127-137)

```ts
const { error: updateError } = await adminClient
  .from("tickets")
  .update({
    customer_view_password_hash: passwordHash,
    customer_view_password_set_at: new Date().toISOString(),
  })
  .eq("id", params.ticketId);
```

Add `customer_view_failed_attempts: 0, customer_view_locked_until: null` to this same object.

### `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx` — resend precedent (task 375)

```tsx
<Mail size={12} /> {resending ? "Sending…" : "Resend notification"}
```

This task's button is icon-only (no text label — different UI slot, a dense table row vs. a detail-page action bar), but reuse the same `Mail` icon and the same `resending`/loading-state shape.

### `src/app/(hub)/projects/v2/[projectId]/_onboarding-detail.tsx` — the Tooltip usage pattern (lines 870-879)

```tsx
function AvatarTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
```

`TooltipProvider` is already mounted globally in `src/app/layout.tsx` — no provider wiring needed at the call site, just `Tooltip`/`TooltipTrigger`/`TooltipContent` from `@/components/ui/tooltip`.

### `src/app/(hub)/desk/inbox/_inbox-index.tsx` — the existing optimistic-update pattern to mirror (current, lines ~59-67)

```ts
async function updateTicketStatus(ticketId: string, status: TicketListItem["status"]): Promise<void> {
  const snapshot = tickets;
  setTickets((prev) => prev.map((t) => (t.ticketId === ticketId ? { ...t, status } : t)));
  const res = await fetch(`/api/desk/tickets/${ticketId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) setTickets(snapshot);
}
```

The new `sendNotification` handler doesn't mutate `tickets` state (nothing in the row visibly changes), so it needs its own small "which row id is currently sending" state instead (e.g. `const [sendingId, setSendingId] = useState<string | null>(null)`) rather than reusing the optimistic-update shape verbatim.

### `src/app/(hub)/desk/inbox/_inbox-table.tsx` — current grid (6 columns, no actions column today)

```tsx
const GRID_COLS = "grid-cols-[170px_1fr_150px_150px_120px_130px]";
```

Add a 7th fixed-width column (e.g. `44px`) for the icon button.

## Implementation Steps

1. Widen `notifyCustomerTicketCreated()`'s password-hash update in `customer-view-access.ts` to also clear the lockout fields.
2. Build `POST /api/desk/tickets/[ticketId]/resend-notification` — copy the auth/param-validation shape from the sibling `status` route, resolve the ticket (`id, ticket_number, subject, requester_email`), 404 if not found, 400 if `requester_email` is null, otherwise call `notifyCustomerTicketCreated()` and return `{ ok: true }`.
3. Add `hasRequesterEmail: boolean` to `TicketListItem` and its mapping in `page.tsx` (derived from the field already selected — no new query).
4. Add the `sendNotification` handler + `sendingId` state to `_inbox-index.tsx`, wire a `sonner` toast on both outcomes, pass `sendingId`/`onSendNotification` down to `InboxTable`.
5. Add the 7th grid column to `_inbox-table.tsx`: an icon-only `<button>` (`Mail` icon, or a spinner while `sendingId === t.ticketId`), `disabled` when `!t.hasRequesterEmail` or already sending, wrapped in `Tooltip`/`TooltipTrigger`/`TooltipContent` per the pattern above. `aria-label="Send ticket notification email"` on the button itself (icon-only buttons need one per this codebase's UI Polish Conventions, independent of the tooltip).
6. Run `npx tsc --noEmit` and `pnpm lint`.

## Acceptance Criteria

- [ ] Clicking the icon button on a Desk > Inbox row sends a fresh confirmation email (new password) to that row's `requester_email` and shows a success toast.
- [ ] A ticket with `requester_email: null` shows the button disabled; hovering still shows a tooltip (not blank).
- [ ] A ticket previously locked out (`customer_view_locked_until` in the future) is unlocked by a resend — verified by checking `customer_view_failed_attempts`/`customer_view_locked_until` are reset after the call.
- [ ] Non-staff (no session, or a session with a role outside `admin/super_admin/pm`) gets 401/403 from the route directly.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Browser/manual: click the icon on a real Desk > Inbox row (needs `MAIL_*` env + migration 146 applied, same prerequisites as task 379) and confirm the toast + email; try a row with no `requester_email` to confirm the disabled state; call the route directly without a session to confirm 401.

## Compatibility Touchpoints

- No env var, dependency, or migration additions — reuses everything task 379 already introduced.
- CLAUDE.md's task-379 bullet (once written at the `document` stage) should mention this manual resend path alongside it, same as how task 375 documents alongside 374/347.

## Implementation Notes

### What Changed
- `src/lib/desk/customer-view-access.ts`: `notifyCustomerTicketCreated()`'s password-hash update now also resets `customer_view_failed_attempts`/`customer_view_locked_until` (per requirement — a resend must clear any lockout under the old password).
- New `src/app/api/desk/tickets/[ticketId]/resend-notification/route.ts`: `POST`, mirrors the sibling `status` route's auth/param shape exactly (session + `admin|super_admin|pm` role check, `TKT-\d+` validation), resolves the ticket, 404/400 on missing ticket/email, otherwise calls `notifyCustomerTicketCreated()`.
- `src/app/(hub)/desk/inbox/page.tsx`: added `hasRequesterEmail: !!t.requester_email` to the `TicketListItem` mapping (no new query — the field was already selected).
- `src/app/(hub)/desk/inbox/_inbox-index.tsx`: added `hasRequesterEmail` to the `TicketListItem` type, a `sendingId` state + `sendNotification()` handler (POST + `sonner` toast on both outcomes), wired both down to `InboxTable`.
- `src/app/(hub)/desk/inbox/_inbox-table.tsx`: 7th grid column, icon-only `Mail`/`Loader2` button wrapped in `Tooltip`/`TooltipTrigger`/`TooltipContent`, `aria-label`, disabled when `!hasRequesterEmail` or already sending.

### Files Changed
- `src/lib/desk/customer-view-access.ts` - widen the password-hash update to clear lockout state; widen `notifyCustomerTicketCreated`'s return type `void` → `boolean` (see deviation below)
- `src/app/api/desk/tickets/[ticketId]/resend-notification/route.ts` - new resend endpoint
- `src/app/(hub)/desk/inbox/page.tsx` - add `hasRequesterEmail` to the row mapping
- `src/app/(hub)/desk/inbox/_inbox-index.tsx` - resend handler + state, passed to `InboxTable`
- `src/app/(hub)/desk/inbox/_inbox-table.tsx` - icon-button column + tooltip

### Deviations From Plan
- **`notifyCustomerTicketCreated()` now returns `Promise<boolean>` instead of `Promise<void>`.** The task doc said to reuse it "unchanged in shape," but as originally written it swallows every failure and always completes without signaling success/failure — fine for the fire-and-forget cron call, but it would have made this resend route always report success even when the email genuinely failed to send, directly undermining the feature's own stated purpose ("staff have no way to know or retry" — Overview). Widened the return type; the cron call site in `email-poll/route.ts` needed no change since it already just `await`s the call without using its result. This is a Minor, necessary deviation — same shape, same non-throwing behavior, just now truthfully reports outcome to callers that check it.
- Caught and fixed one real bug in my own first draft during this session (not carried into the final diff): `TooltipTrigger`'s `render` prop fully substitutes the trigger element, so the sending-state icon needs to be a child of the `<button>` passed to `render`, not a child of `<TooltipTrigger>` itself — the first draft had it backwards, which would have rendered an empty button (icon never shown). Fixed before running verification.

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors)
- `pnpm lint` - PASS (2 pre-existing unrelated warnings in `_checklist-tab.tsx`, untouched by this task)
- Browser acceptance - NOT RUN (needs migration 146 applied + `MAIL_*` env, same prerequisites as task 379; also needs a signed-in staff session with `admin`/`super_admin`/`pm` role to exercise the button)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, no broad `any`, error handling is intentional (try/catch/finally on the client, explicit 401/403/404/400/502 status codes on the route mirroring the sibling `status` route's shape).
- Auth gate verified byte-for-byte equivalent to `src/app/api/desk/tickets/[ticketId]/status/route.ts` (session check, role allowlist, `TKT-\d+` param regex) — the requirement asked for this exact mirror, and it is one.
- Verified the `boolean`-return widening of `notifyCustomerTicketCreated()` doesn't affect the existing cron call site: `email-poll/route.ts` still does a bare `await notifyCustomerTicketCreated({...})` with no use of the return value, so that flow is byte-identical in behavior.
- **One real accessibility/functional bug found and fixed during this pass** (not present in the version `implement` handed off): the icon button used the native `disabled` attribute plus Tailwind's `disabled:pointer-events-none` when a row had no `requester_email`. Native `disabled` buttons stop receiving mouse/hover events in every browser, and `pointer-events-none` makes that explicit — so the tooltip would never have shown on the exact row it most needs to explain itself, directly failing this task's own second acceptance criterion ("A ticket with `requester_email: null` shows the button disabled; hovering still shows a tooltip (not blank)"). Fixed by switching to `aria-disabled` + a guarded `onClick` (button stays hoverable/focusable, the styling change communicates the disabled state visually, and clicking is a no-op) — this is the standard accessible pattern for "disabled control that still needs a tooltip," and there was no existing precedent for it in this codebase to follow (the only similar cases found conditionally hide the button+tooltip pair entirely rather than disable-with-explanation, which wasn't an option here per the requirement).
- `npx tsc --noEmit` and `pnpm lint` re-run clean after the fix (same 2 pre-existing unrelated warnings, 0 errors).

### Deviations
- The two deviations already logged in Implementation Notes (`notifyCustomerTicketCreated` returning `boolean`, and the `TooltipTrigger`/`render` child-placement bug caught before verification) are **Minor** — both are corrections that make the implementation actually satisfy requirements already in the approved doc, not scope changes.
- The `disabled` → `aria-disabled` fix made during this gate is likewise **not a scope change** — it's required for the task's own stated acceptance criterion to actually hold, not new product surface.

### Required Fixes
None — the one finding was fixed inline during this gate rather than deferred.
