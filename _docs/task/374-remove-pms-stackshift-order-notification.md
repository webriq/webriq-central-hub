# 374 — Remove PMs from StackShift Order Email Notification Recipients

## Overview

`POST /api/webhooks/stackshift-order` sends one staff notification email per
submitted StackShift order (task 367 genericized this to a single email; task
354/353 context also lives nearby). Recipients currently come from
`getOrderNotificationRecipients()` (`src/lib/stackshift-orders/recipients.ts`),
which unions two sources:

1. A fixed address list from the `STACKSHIFT_ORDER_NOTIFY_EMAILS` env var.
2. Every user whose `profiles.role = 'pm'`, resolved by joining `profiles` →
   `auth.users` (via `adminClient.auth.admin.listUsers()`, paginated).

The user wants PMs removed from the recipient set — going forward, only the
fixed `STACKSHIFT_ORDER_NOTIFY_EMAILS` list should receive this email.

**Note for context, not a blocker:** task 367's own log states this same
PM-auto-include was reviewed and *deliberately kept* at the user's request
during that task's planning ("user corrected mid-planning to keep PM
auto-include"). This task reverses that decision — confirmed as the current
intent via this new request. No need to re-ask; just documenting the history
here since a future reader/agent will otherwise be confused by the
contradiction between task 367's log and this one.

## Requirements

- The New StackShift Order staff notification email must no longer be sent to
  users with `profiles.role = 'pm'`.
- The fixed `STACKSHIFT_ORDER_NOTIFY_EMAILS` recipient list is unaffected —
  still sent to.
- No other behavior of the webhook (dedupe-by-`idempotencyKey`, Cliq alerts if
  any, contact-risk flagging, order insert/update, `raw_payload`, etc.)
  changes.

## Out of Scope / Must Not Change

- Do not touch `STACKSHIFT_ORDER_NOTIFY_EMAILS` env var itself or `env.example`.
- Do not change the email content/template (`stackshift-order-notification.ts`)
  — only who receives it.
- Do not remove the `profiles` role-query pattern elsewhere in the codebase —
  this change is scoped to this one recipient-resolution function.
- Do not touch the (already-removed, per task 367) customer confirmation email
  path — it no longer exists.
- No DB migration needed — no schema change involved.

## Proposed File Changes

- `src/lib/stackshift-orders/recipients.ts` — remove the PM lookup block
  (the `profiles` query + paginated `auth.admin.listUsers()` loop) from
  `getOrderNotificationRecipients()`, leaving only the
  `STACKSHIFT_ORDER_NOTIFY_EMAILS` parsing. Drop the now-unused `adminClient`
  import if nothing else in the file needs it. Update the file's top comment
  (currently describes the fixed-list-plus-PM behavior) to reflect the new,
  simpler behavior.

No other files call `getOrderNotificationRecipients()` — confirmed via repo
search; the only caller is `src/app/api/webhooks/stackshift-order/route.ts`,
which just does `const recipients = await getOrderNotificationRecipients();`
and needs no change itself.

## Code Context

Current `src/lib/stackshift-orders/recipients.ts` (full file, 37 lines):

```ts
import { adminClient } from "@/lib/supabase/admin";

// Task 347 — every StackShift order submission notifies a fixed list (Philippe, Danielle,
// Dannea, Alex, Bert — addresses live in STACKSHIFT_ORDER_NOTIFY_EMAILS) plus every PM.
// `profiles` has no email column, so PM addresses come from auth.users intersected with
// profiles.role = 'pm'.
export async function getOrderNotificationRecipients(): Promise<string[]> {
  const out = new Set<string>();

  for (const raw of (process.env.STACKSHIFT_ORDER_NOTIFY_EMAILS ?? "").split(",")) {
    const email = raw.trim().toLowerCase();
    if (email.includes("@")) out.add(email);
  }

  try {
    const { data: pmProfiles } = await adminClient
      .from("profiles")
      .select("id")
      .eq("role", "pm");
    const pmIds = new Set((pmProfiles ?? []).map((p) => p.id));

    if (pmIds.size > 0) {
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
        if (error || !data) break;
        for (const u of data.users) {
          if (u.email && pmIds.has(u.id)) out.add(u.email.toLowerCase());
        }
        if (data.users.length < 1000) break;
      }
    }
  } catch (err) {
    console.error("[stackshift-order] failed to resolve PM recipient emails:", err);
  }

  return [...out];
}
```

Caller (`src/app/api/webhooks/stackshift-order/route.ts:119`, unchanged):

```ts
const recipients = await getOrderNotificationRecipients();
```

## Implementation Steps

1. In `src/lib/stackshift-orders/recipients.ts`, delete the `try { ... } catch
   { ... }` block that queries `profiles` + `auth.admin.listUsers()`.
2. Remove the `import { adminClient } from "@/lib/supabase/admin";` line
   (no longer used in the file).
3. Rewrite the top comment to state only the fixed-list behavior, and note
   that PM auto-include was removed by task 374 (mirroring this codebase's
   convention of leaving a breadcrumb for future readers, as seen throughout
   `CLAUDE.md`'s key-conventions section).
4. Leave `getOrderNotificationRecipients()`'s signature (`Promise<string[]>`)
   and the `STACKSHIFT_ORDER_NOTIFY_EMAILS` parsing loop untouched.

## Acceptance Criteria

- `getOrderNotificationRecipients()` returns only addresses parsed from
  `STACKSHIFT_ORDER_NOTIFY_EMAILS` — no `profiles`/`auth.admin` calls remain
  in the file.
- `src/app/api/webhooks/stackshift-order/route.ts` requires no changes and
  still compiles/behaves correctly against the new return value (same
  `string[]` shape).
- No unused imports remain in `recipients.ts`.

## Verification

- `npx tsc --noEmit` — must pass with no new errors.
- `pnpm lint` — must pass with no new warnings.
- Manual read-through confirming `recipients.ts` no longer imports or
  references `adminClient`, `profiles`, or `auth.admin.listUsers`.
- (Optional, not required to close this task) A live webhook POST to
  `/api/webhooks/stackshift-order` could be used to confirm the email only
  reaches the fixed list, but no test harness exists for this — static
  verification is sufficient given the small, isolated change.

## Compatibility Touchpoints

- None — no env var, migration, dependency, or route signature changes.

## Implementation Notes

### What Changed
- `getOrderNotificationRecipients()` no longer auto-includes `profiles.role='pm'` users; it now returns only addresses parsed from `STACKSHIFT_ORDER_NOTIFY_EMAILS`.

### Files Changed
- `src/lib/stackshift-orders/recipients.ts` — removed the `profiles` query + paginated `adminClient.auth.admin.listUsers()` PM-lookup block, removed the now-unused `adminClient` import, rewrote the top comment to describe the fixed-list-only behavior and note the task-374 removal.

### Deviations From Plan
- None. `src/app/api/webhooks/stackshift-order/route.ts` needed no change, as predicted.

### Verification Run
- `npx tsc --noEmit` - PASS (no output/errors)
- `pnpm lint` - PASS (2 pre-existing, unrelated warnings in `_checklist-tab.tsx`)
- Manual read-through - PASS: `recipients.ts` no longer references `adminClient`, `profiles`, or `auth.admin.listUsers`
- Live webhook POST / email content review - SKIPPED (optional per task doc, no test harness exists)
