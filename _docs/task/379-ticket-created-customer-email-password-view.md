# 379: Ticket-Created Customer Email Notification + Password-Protected Public Ticket View

**Created:** 2026-09-21
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

When a Desk Mailbox support ticket is created natively on the Hub (a customer emails in and `POST /api/cron/email-poll` inserts a new `tickets` row), the customer currently gets no acknowledgement from the Hub itself — only the Hub's internal staff see it in Desk > Inbox. Zoho Desk used to send an automatic "Your ticket has been created" confirmation email (reference screenshot: subject `[##21007##] Your ticket has been created`, body with the ticket ID/subject, a "View ticket" button, WebriQ Support Team sign-off).

This task reproduces that confirmation on the Hub, WebriQ-branded (orange CTA per the Design System v2.0, not Zoho's green), and adds a **public, password-protected** page to view the ticket — the "View ticket" link opens a page that shows nothing until the customer enters the password that was included in the same email. This is a *new* customer-facing security surface (unauthenticated route + a secret gated by a stored hash), not a cosmetic email template task — treat the password-gate design with the same care as the codebase's existing OTP verification flow, which it deliberately mirrors.

**Trigger point (confirmed via research, not assumed):** the *only* live code path that inserts a new `tickets` row is the new-ticket branch in `src/app/api/cron/email-poll/route.ts:221-239`. The `channel: "portal" | "manual"` enum values are only ever written by the historical Zoho Desk import (`src/lib/migrate/desk-tickets-import.ts`) — there is no staff-facing "create ticket" UI for Desk Mailbox tickets today. Do not confuse this `tickets` table (Desk Mailbox / helpdesk email tickets, migration-025-era) with the *unrelated* `src/lib/tickets/` directory and `/api/v2/projects/[projectId]/tickets` routes, which are the task-364 rename of the old `issues` table (assignable project work items) — this task touches neither of those.

## Requirements

- [ ] On first-time creation of a native `tickets` row (email-poll route, the `!ticketId` branch only — never on a matched/existing ticket reply), generate a random view password, hash it, persist the hash, and send a branded confirmation email to `requester_email` containing: the ticket's display number, subject, the plaintext password, and a "View Ticket" link to the new public page. Matches the reference image's content shape (greeting, ticket ID + subject line, "we will process your request" copy, WebriQ Support Team sign-off, CTA button) but using this codebase's own branding (WebriQ logo, orange CTA per design tokens — not Zoho's green).
- [ ] Email send is best-effort and **non-blocking** — a failure must not fail ticket/message ingestion (same posture as `syncTaskToZoho` and the stackshift-order notification paths already documented in CLAUDE.md).
- [ ] New public route `(public)/tickets/[ticketId]` (URL keyed by the `tickets.id` UUID, per this codebase's routing-key convention — never the sequential `ticket_number`/`ticket_id` display value, which is guessable). The page reveals **no ticket data** until the password is verified — not subject, not status, not existence-vs-not-found distinction beyond a generic message.
- [ ] Password entry is a simple form (plain password input, not an OTP-style 6-box grid — the user asked for a "password", and Zoho's own flow types out a password, not digits). On success, the page renders: ticket display number, subject, status, created date, and the message thread filtered to `ticket_messages.visibility = 'public'` only (never `internal` notes/drafts).
- [ ] Brute-force protection on the password check: a per-ticket failed-attempt counter + temporary lockout, mirroring the existing OTP lockout pattern in `src/app/(auth)/actions.ts` (`checkOtpLockout`/`registerOtpFailure`/`resetOtpAttempts`) but scoped to the ticket row rather than a shared `otp_codes`-style table — no new lockout table needed.
- [ ] Design tokens: follow `_final_design/guide/central-hub-design-system.md` exactly (colors, radii, type scale) for both the email HTML and the new public page. Reuse the existing `--auth-*` Tailwind tokens (already wired in `globals.css`) rather than inventing new hex values, since they already encode the v2.0 palette (`bg-auth-navy`, `text-auth-blue`, `bg-auth-orange`, `text-auth-late`, etc.).
- [ ] Follow `nextjs-file-length-best-practices.md` — split the public page into a thin server `page.tsx` (existence check + metadata) and a client component for the form/reveal; if the client component's password-gate state and the post-verify ticket/thread rendering both grow past ~200 lines combined, split into `_password-gate.tsx` + `_ticket-summary.tsx` (or similar) rather than one large file.

## Out of Scope / Must-Not-Change

- **No reply-from-public-view capability.** This task is view-only, matching the literal request ("For viewing the ticket, create a public view"). A customer reply channel from the public page is a natural follow-up but is not built here.
- **No attachment rendering on the public page.** `ticket_messages` attachments exist but gating the existing staff-only `file-url` signing routes for anonymous+password-verified access is a separate, non-trivial scope (needs its own auth check design) — flag as a follow-up, do not build it now.
- **No changes to the project-ticket system** (`src/lib/tickets/`, `/api/v2/projects/[projectId]/tickets/**`, the former `issues` table). Unrelated domain, same table-name coincidence only.
- **No RLS policy changes.** The public route uses `adminClient`, the same documented `(public)`-route exception already used by `(public)/onboard/[customerId]` — customers have no Supabase session here.
- **No "resend notification" button** on the staff Desk Inbox UI. Task 375 added exactly this pattern for StackShift orders; it's a cheap, obvious follow-up here too, but the user did not ask for it — do not add it speculatively.
- **Do not touch `AuthSplitShell`** or reuse it wholesale for the new page. It is a heavy, sign-in-specific shell (Lottie hero animation, dual-column split, theme toggle) built for the login/signup experience; the ticket-view page is a single-purpose transactional page and should get its own lightweight card layout built from the design-system tokens. It is fine (and encouraged) to reuse the small, generic pieces (`AuthErrorBanner`, `AuthSubmitButton`) since both are already token-driven and dependency-free.
- **No migration is applied by the agent** — per this repo's established convention (see CLAUDE.md's running list of "written not applied" migrations), write migration 146 but do not run `supabase db push`.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/146_ticket_customer_view_access.sql` | Create | Adds `customer_view_password_hash`, `customer_view_password_set_at`, `customer_view_failed_attempts`, `customer_view_locked_until`, `customer_notified_at` to `tickets` |
| `src/types/database.ts` | Modify | Add the 5 new columns to `tickets` Row/Insert/Update |
| `src/lib/desk/customer-view-access.ts` | Create | `generateCustomerViewPassword()`, `hashCustomerViewPassword()`, `verifyCustomerViewPassword(ticketId, password)` (lockout-aware) |
| `src/lib/email/ticket-created-notification.ts` | Create | `sendTicketCreatedEmail({...})` — branded HTML+text email, reuses `transporter`/`FROM` from `mailer.ts` |
| `src/app/api/cron/email-poll/route.ts` | Modify | After the new-ticket insert (`!ticketId` branch, ~line 221-239): generate + hash + store password, resolve requester name, send the email in a try/catch, stamp `customer_notified_at` |
| `src/app/(public)/tickets/[ticketId]/page.tsx` | Create | Thin server component: validates the ticket exists (via `adminClient`), renders the client gate; generic not-found state otherwise |
| `src/app/(public)/tickets/[ticketId]/client.tsx` | Create | Password form → POST to the verify route → reveals ticket summary + public message thread on success |
| `src/app/api/public/tickets/[ticketId]/view/route.ts` | Create | `POST` — verifies password via `verifyCustomerViewPassword`, returns ticket + public messages on success, generic error + lockout state on failure |

## Code Context

### `src/app/api/cron/email-poll/route.ts` — insertion point (existing code, lines 221-239)

```ts
const { data: newTicket, error: ticketError } = await adminClient
  .from("tickets")
  .insert({
    customer_id: contactMatches?.[0]?.customer_id ?? null,
    subject: ticketSubject,
    channel: "email",
    status: "open",
    priority: "normal",
    requester_email: requesterEmail,
    zoho_mail_thread_id: email.threadId,
  })
  .select("id, ticket_number, ticket_id")
  .single();

if (ticketError || !newTicket) throw new Error(`failed to create ticket: ${ticketError?.message}`);
ticketId = newTicket.id;
ticketNumber = newTicket.ticket_number;
ticketDisplayId = newTicket.ticket_id;
// <-- hook point: generate password, hash+store, resolve name, send email (non-blocking)
```

Requester name resolution should reuse `resolveContactName` from `src/app/(hub)/desk/inbox/_resolve.ts` (pure function, no route-specific dependencies — already implements exactly the fallback chain needed: contact full_name → first+last → contact email → `requester_email` → "Guest"). A `contacts` lookup by `ilike("email", requesterEmail)` (same shape as the existing `contactMatches` query a few lines above) supplies the `ContactRow`.

### `src/app/(auth)/actions.ts` — OTP hash/lockout pattern to mirror (lines ~107-205)

```ts
const bytes = randomBytes(4);
const code = String(bytes.readUInt32BE(0) % 900000 + 100000);
const codeHash = createHash("sha256").update(code).digest("hex");
// ... insert row with codeHash ...
// verify: createHash("sha256").update(input).digest("hex") === stored hash
```

`src/lib/desk/customer-view-access.ts` should follow this exact `randomBytes` + `sha256` convention (this codebase has no bcrypt dependency and does not use one anywhere) rather than introducing a new hashing library. Recommend an 8-character alphanumeric password (not a 6-digit numeric OTP) — ticket-view secrecy doesn't need to match the account-security OTP format, and "password" (per the user's own wording) reads better as alphanumeric than as a 6-digit PIN. Exclude visually ambiguous characters (`0/O`, `1/I/l`) since it's hand-typed from an email.

### `src/lib/email/mailer.ts` — branded HTML template to match (lines 38-80, `sendHubInviteEmail`)

Reuse this structure (logo + card + one orange CTA button) for `sendTicketCreatedEmail`, adapting copy to the reference screenshot's content: ticket number/subject line, "We will process your request and update you with a resolution as soon as possible," the plaintext password displayed prominently (e.g., in a bordered mono block), and a "View Ticket" button linking to `${NEXT_PUBLIC_APP_URL}/tickets/${ticket.id}`.

### `src/types/database.ts` — `tickets` table (current shape, for the diff)

```ts
tickets: {
  Row: {
    id: string;
    ticket_number: number;
    ticket_id: string;
    // ...
    zoho_mail_thread_id: string | null;
    created_at: string;
    updated_at: string;
  };
  // Insert / Update mirror Row, all new fields optional
}
```

### `src/app/(auth)/auth/verify/page.tsx` + `src/components/auth/auth-error-banner.tsx` / `auth-submit-button.tsx`

Reference for the password-gate form UX (loading state, error banner, disabled-until-valid submit button) and for reusing `AuthErrorBanner`/`AuthSubmitButton` directly — both are dependency-free and already draw from `--auth-*` tokens, so they'll look consistent without any new styling.

### `src/app/(public)/onboard/[customerId]/page.tsx`

Reference for the `(public)` route group's established pattern: server component using `adminClient` with an inline comment documenting the "no session" exception, a friendly not-found state instead of a hard 404.

## Implementation Steps

1. Write migration 146 (5 new nullable/defaulted columns on `tickets`, no RLS changes needed since the public route uses `adminClient`). Update `src/types/database.ts` to match.
2. Build `src/lib/desk/customer-view-access.ts`: password generation, sha256 hashing, and `verifyCustomerViewPassword(ticketId, password)` that reads/writes `customer_view_failed_attempts` + `customer_view_locked_until` on the ticket row (lock after ~5 failed attempts, mirrors the OTP lockout window used elsewhere) and returns `{ ok: true } | { ok: false, locked?, lockedUntil?, attemptsRemaining? }`.
3. Build `src/lib/email/ticket-created-notification.ts` with `sendTicketCreatedEmail()`, matching the `sendHubInviteEmail` HTML structure and the reference screenshot's copy, WebriQ-branded (orange CTA, not green).
4. Wire the email-poll route: after the new-ticket insert, generate + hash + persist the password, resolve the requester's display name via `resolveContactName`, call `sendTicketCreatedEmail` in its own `try/catch` (log-and-continue on failure, same posture as the stackshift-order webhook's notification block), stamp `customer_notified_at` on success.
5. Build `POST /api/public/tickets/[ticketId]/view` — validates `ticketId` is a UUID, calls `verifyCustomerViewPassword`, on success returns `{ ticket: {...}, messages: [...] }` (messages filtered to `visibility = 'public'`), on failure returns the same generic-error/lockout shape as `verifyOtpCode`.
6. Build `(public)/tickets/[ticketId]/page.tsx` (server, existence check + `generateMetadata`) and `client.tsx` (password form → reveal), following the file-length split called out in Requirements if the client component grows large. Style with design-system tokens (`--auth-*` / design-system v2.0 palette), not the legacy v1 `bg-brand`/`bg-page-bg` classes still present in the onboarding page.
7. Run `npx tsc --noEmit` and `pnpm lint`.

## Acceptance Criteria

- [ ] A new inbound email that creates a fresh `tickets` row triggers exactly one confirmation email to `requester_email`, containing the ticket number/subject, a plaintext password, and a working "View Ticket" link — and a reply to an *existing* ticket does not re-trigger it.
- [ ] Ticket ingestion succeeds even when the email send throws (verified by temporarily breaking `MAIL_HOST`/mocking a throw) — no `tickets`/`ticket_messages` insert failure.
- [ ] Visiting `/tickets/[id]` without a password reveals no ticket data (subject, status, requester, messages all withheld) — verified by reading the initial page's rendered HTML/response payload.
- [ ] Entering the correct password reveals ticket number, subject, status, created date, and only `visibility: 'public'` messages (an internal note attached to the same ticket must not appear).
- [ ] 5 consecutive wrong passwords lock further attempts for a cooldown window; the correct password still fails while locked.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Browser/manual: trigger `POST /api/cron/email-poll` against a test inbox message (or insert a test row directly and call the notification function in isolation) and inspect the rendered email HTML; visit `/tickets/[id]` in a browser and walk the password-gate flow (wrong password → error, 5x wrong → locked, correct password → reveal).

## Compatibility Touchpoints

- CLAUDE.md should get a new bullet documenting the `tickets` customer-view-access columns and the public route, at the `document` skill stage (not now) — follow the existing documentation style for prior "written not applied" migrations.
- No env var additions — reuses `NEXT_PUBLIC_APP_URL`, `MAIL_HOST`/`MAIL_USER`/`MAIL_PASS`/`MAIL_FROM`.
- No package additions — sha256 hashing via built-in `node:crypto`, matching existing OTP code.

## Implementation Notes

### What Changed
- Migration 146 adds 5 columns to `tickets`: `customer_view_password_hash`, `customer_view_password_set_at`, `customer_view_failed_attempts`, `customer_view_locked_until`, `customer_notified_at`.
- New `src/lib/desk/customer-view-access.ts`: password generation (8-char, ambiguity-free alphabet), sha256 hashing (case-insensitive — hashes the uppercased, trimmed input so hand-typed entry isn't case-sensitive), `verifyCustomerViewPassword()` (5-attempt / 15-minute lockout, mirrors `src/lib/auth/otp-lockout.ts`'s shape but keyed on the ticket row instead of a shared table), and `notifyCustomerTicketCreated()` — the orchestration entry point that resolves the requester's display name (via `resolveContactName` from `desk/inbox/_resolve.ts`), generates+hashes+stores the password, sends the email, and stamps `customer_notified_at`. This function swallows all its own errors (logs and returns) so the cron call site stays a bare `await`.
- New `src/lib/email/ticket-created-notification.ts`: `sendTicketCreatedEmail()`, WebriQ-branded HTML+text email matching the reference screenshot's copy shape (`[##{ticketNumber}##] Your ticket has been created`, ticket ID/subject, password block, orange "View ticket" CTA, WebriQ Support Team sign-off). Uses Design System v2.0 hex values (`#FB914E`/`#471F02` CTA, `#0B1533`/`#3A4565`/`#5F6A88` text tones) rather than the older `#F97316` orange still present in a couple of pre-v2.0 templates in `mailer.ts`.
- `src/app/api/cron/email-poll/route.ts`: added one `await notifyCustomerTicketCreated({...})` call immediately after the new-ticket insert (inside the `if (!ticketId)` branch only — never fires on a matched reply).
- New `src/app/api/public/tickets/[ticketId]/view/route.ts`: `POST`, UUID-shape validation, calls `verifyCustomerViewPassword`, returns ticket summary + `visibility: 'public'` messages only on success, generic error/lockout shape on failure.
- New `src/app/(public)/tickets/[ticketId]/page.tsx` (server, existence check only — no data leak pre-password) + `client.tsx` (password form, orchestration) + `_ticket-summary.tsx` (revealed-state rendering, split out per the file-length guidance). Built a lightweight standalone card, not `AuthSplitShell`, per the task doc's explicit direction — reuses only the design-system hex tokens, not any auth components (`AuthErrorBanner`/`AuthSubmitButton` turned out not to fit cleanly since this page needed inline `attemptsRemaining` text and a non-auth button style; the plan's "reuse if generic enough" was reassessed as not worth it and inline equivalents were built instead, staying just as small).
- `src/types/database.ts`: added the 5 new `tickets` columns to Row/Insert/Update.

### Files Changed
- `supabase/migrations/146_ticket_customer_view_access.sql` - new columns (written, not applied)
- `src/types/database.ts` - `tickets` type updated to match migration 146
- `src/lib/desk/customer-view-access.ts` - new: password gen/hash/verify + lockout + notify orchestration
- `src/lib/email/ticket-created-notification.ts` - new: branded confirmation email
- `src/app/api/cron/email-poll/route.ts` - hook the notification into the new-ticket branch
- `src/app/api/public/tickets/[ticketId]/view/route.ts` - new: public password-check endpoint
- `src/app/(public)/tickets/[ticketId]/page.tsx` - new: server existence check + metadata
- `src/app/(public)/tickets/[ticketId]/client.tsx` - new: password gate + reveal orchestration
- `src/app/(public)/tickets/[ticketId]/_ticket-summary.tsx` - new: revealed ticket/thread rendering

### Deviations From Plan
- Password is compared case-insensitively (hash input is uppercased before hashing) — not explicitly specified in the plan, added because the 8-char alphabet is uppercase-only and hand-typed passwords from an email are error-prone on case.
- Did not end up reusing `AuthErrorBanner`/`AuthSubmitButton` from `src/components/auth/` as the plan suggested "if generic enough" — built small inline equivalents instead, since the error banner needed to interpolate `attemptsRemaining` text differently and the submit button's copy/behavior ("View ticket" / "Verifying…") didn't map cleanly onto `AuthSubmitButton`'s fixed props. Net code size is comparable; flagging as a plan deviation per policy rather than silently diverging.
- Two `impeccable` design-hook findings (off-scale `18px`/`12px` font sizes) were caught and fixed during authoring (adjusted to the documented 15px panel-title / 11px small-label steps) — not a deviation, just noting the design-token requirement was actively enforced, not just aspirational.

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors)
- `pnpm lint` - PASS (2 pre-existing unrelated warnings in `_checklist-tab.tsx`, untouched by this task)
- Browser acceptance - NOT RUN (needs migration 146 applied + a live/mocked inbound email to trigger `email-poll`, plus `MAIL_*` env configured to inspect the real rendered email)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, no `any`/untyped escape hatches, error handling is intentional throughout (the orchestration function swallows and logs by design, matching the non-blocking requirement).
- Two real issues found and fixed during this pass (not present in the version `implement` handed off):
  1. **Message rendering bug**: the public API route returned `ticket_messages.body` verbatim, but inbound customer email is routinely HTML (`source_meta.contentType`), which would have rendered as raw tag soup on the public page (React escapes by default — not an XSS risk, but a real display defect that would have failed a live acceptance pass). Fixed by adding a `source_meta`-aware `htmlToText()` strip in `src/app/api/public/tickets/[ticketId]/view/route.ts`, mirroring the existing private `htmlToText` helper in `src/lib/email/support-form.ts` (same regex-based approach, no new dependency, still no `dangerouslySetInnerHTML` — deliberately avoids introducing an XSS surface on this unauthenticated route).
  2. **`page.tsx` readability**: the ticket-existence check embedded an `await` inside a `&&` boolean expression (`UUID_RE.test(...) && (await ...).data !== null`), which works correctly (short-circuits before the query) but violates the "guard clauses over dense expressions" standard. Rewrote as a plain `if` + local variable.
- Design-token gap closed: requirement #26 asked for the `--auth-*` Tailwind tokens (`bg-auth-orange`, `text-auth-blue`, etc.) rather than hardcoded hex. The first pass used raw hex everywhere (matching the hub v2 page convention in `_detail-ui.tsx`, which itself has no `--auth-*` equivalents to reuse). On review, `client.tsx` had 4 spots where an exact `--auth-*` class *does* exist and should have been used instead of its hex twin: the lock-icon accent (`bg-auth-blue/10`/`text-auth-blue`), the input focus ring (`focus:border-auth-blue`/`focus:ring-auth-blue/[.14]`), the error banner (`text-auth-late`/`bg-auth-late-bg`/`border-auth-late/20`), and the submit button (`bg-auth-orange`/`text-auth-cta-ink`/`hover:bg-auth-orange-600`). All four now use the class instead of the literal hex value, closing the token-drift risk. `_ticket-summary.tsx`'s status-chip tint colors remain hardcoded hex (`style={{color, background}}`) because `globals.css` only wires `--auth-warn`/`--auth-ok` foreground colors, not matching background tints — there is no class to reuse for those, so hex is the only option there (values still match the design guide's `--warn-bg`/`--ok-bg` exactly).
- `npx tsc --noEmit` and `pnpm lint` re-run clean after all fixes above (same 2 pre-existing unrelated warnings, 0 errors).

### Deviations
- Both deviations already logged in Implementation Notes (case-insensitive password hashing, not reusing `AuthErrorBanner`/`AuthSubmitButton`) are **Minor** — neither changes scope, architecture, or user-visible behavior beyond what was planned, and both have stated rationale.
- The message-rendering fix and the design-token class fix made during this gate are **not scope changes** — they bring the implementation into compliance with requirements already written in the approved task doc (render the message thread legibly; use `--auth-*` tokens where they exist), not new product surface.

### Required Fixes
None — all findings were fixed inline during this gate rather than deferred.

