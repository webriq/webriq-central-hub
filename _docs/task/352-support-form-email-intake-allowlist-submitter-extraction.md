# 352: Support-Form Email Intake — Allowlist + Real-Submitter Extraction, plus Wix Notification Denylist

**Created:** 2026-09-09
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

The webriq.com **Helpdesk → "Submit a support ticket"** form emails every submission to the
`helpdesk@webriq.us` mailbox. Those mails are:

- **From:** `no-reply@webriq.me`
- **Subject:** literally `Submit ticket` (the user's own subject line is a field *inside* the body)
- **Body:** an HTML template with one `key: value` line per form field:

  ```
  Below are the details of form submission:

  fullName: test
  email: test@gmail.com
  company: test
  category: Technical issue
  subject: Test
  concern: Test
  attachment: https://webriqforms-v2-pagebuilder-bucket.s3.us-west-2.amazonaws.com/1788346098373--Screenshot%202026-09-02%20184314.png
  ```

Task 327's intake filter (`src/lib/email/intake-filter.ts`) currently **drops** these — the
`From` matches `SYSTEM_SENDER_PATTERNS` (`/^no-?reply@/i`). So real support requests submitted
through the website form never become tickets.

Simply letting them through is not enough: the poll route sets a new ticket's
`requester_email` to the raw envelope `From`, so every form ticket would be attributed to
`no-reply@webriq.me` — breaking customer↔contact matching, the same-sender thread-match
(Match 3 in the poll route), and staff replies (which would go to `no-reply@webriq.me`
instead of the actual person). The real submitter must be pulled out of the body.

This task also adds a small, unrelated denylist entry the user requested at the same time:
drop mail from `@notification.wix.com` (e.g. `wix-team@notification.wix.com`).

## Requirements

- [ ] `intake-filter.ts` gains a structured **allowlist** (`INTAKE_ALLOWLIST`) checked *before*
      any denylist rule; a match returns `{ ingest: true, source: <label> }` and overrides the
      denylist.
- [ ] Allowlist seed entry: `label: "webriq-support-form"`, `fromAddress: /^no-?reply@webriq\.me$/i`,
      `subject: /^submit ticket$/i` — **both** must match.
- [ ] `IntakeDecision` type gains optional `source?: string`.
- [ ] `intake-filter.ts` gains a `SYSTEM_SENDER_DOMAINS: string[]` denylist bucket, seeded with
      `"notification.wix.com"`, matched as exact domain **or** subdomain (`domain === d || domain.endsWith("." + d)`).
- [ ] New `src/lib/email/support-form.ts` — `parseSupportFormEmail(email)` extracts
      `{ requesterName, requesterEmail, company, category, subject, concern, attachmentUrl }`
      from the form template, or returns `null` when it is not a parseable form submission.
- [ ] `email-poll/route.ts`: when `gate.source === "webriq-support-form"`, parse the body and
      use the extracted `requesterEmail` / `subject` / a rebuilt plain-text body for
      ticket matching, ticket creation, and the first `ticket_messages` insert.
- [ ] Parse failure (missing/invalid `email:` field, or missing form marker) → ingest with the
      raw envelope values and a `console.warn`, never crash and never silently drop.
- [ ] Existing intake-filter behaviour (task 327 cases) unchanged.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Out of Scope / Must-Not-Change

- **No DB table / admin UI / runtime config** for intake rules — they stay as named `const`
  arrays in `intake-filter.ts` (small, security-sensitive, rationale comments belong with the
  logic). Revisit only if the lists grow large.
- **The `attachment:` S3 URL is kept as a link in the ticket body only** — not downloaded into
  the `ticket-attachments` bucket. A follow-up task can pull those in if wanted.
- No change to the header-based rules in `shouldIngestEmail` (still dormant — the poll route
  passes no `headers` map).
- No change to `src/lib/zoho/mail.ts`, `inbound.ts`'s `ParsedInboundEmail` shape, the ticket
  detail page, outbound reply, or any migration.
- No change to thread-matching logic itself — only the *values* fed into it for form mail.
- Zoho Desk's own parallel intake on the same mailbox is irrelevant here and untouched.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/email/intake-filter.ts` | Modify | Add `INTAKE_ALLOWLIST` (checked first), `SYSTEM_SENDER_DOMAINS` bucket + check, `source?` on `IntakeDecision`. |
| `src/lib/email/support-form.ts` | Create | `parseSupportFormEmail()` — body → structured submission or `null`. |
| `src/app/api/cron/email-poll/route.ts` | Modify | Branch on `gate.source`; thread parsed `requesterEmail` / `subject` / rebuilt body through ticket match + create + first message. |
| `_docs/task/352-*.md` | Create | This doc. |
| `TASKS.md` | Modify | Add row under Planned. |

## Code Context

### File: `src/lib/email/intake-filter.ts` (current, full — 90 lines)

Key points for the implementation:
- `IntakeDecision = { ingest: boolean; reason?: string }` — add `source?: string`.
- `shouldIngestEmail({ fromAddress, fromName, subject, headers? })` — computes
  `from` (lowercased address), `name` (lowercased display name), `subject` (trimmed, original
  case), `domain` (part after `@`).
- Order of checks today: hub sender-name → `SYSTEM_SENDER_PATTERNS` → own-domain-unnamed →
  `NOISE_SUBJECT_PATTERNS` → header rules → `{ ingest: true }`.
- **New order:** `INTAKE_ALLOWLIST` loop **first** (return `{ ingest: true, source: entry.label }`
  on `entry.fromAddress.test(from) && entry.subject.test(subject)`), then everything above,
  with the `SYSTEM_SENDER_DOMAINS` check folded in next to the `SYSTEM_SENDER_PATTERNS` loop.

```ts
const INTAKE_ALLOWLIST: { label: string; fromAddress: RegExp; subject: RegExp }[] = [
  // webriq.com Helpdesk "Submit a support ticket" form relays every submission from this
  // fixed no-reply address with this exact subject. The real submitter is in the body —
  // src/lib/email/support-form.ts + the email-poll route pull it out (task 352).
  { label: "webriq-support-form", fromAddress: /^no-?reply@webriq\.me$/i, subject: /^submit ticket$/i },
];

// Whole sender domains that are always automation, never a real customer. Exact or subdomain.
const SYSTEM_SENDER_DOMAINS: string[] = [
  "notification.wix.com", // wix-team@notification.wix.com and siblings (task 352)
];
```

### File: `src/app/api/cron/email-poll/route.ts` (current)

```ts
// line ~14
import { shouldIngestEmail } from "@/lib/email/intake-filter";

// line ~102 — the gate
const gate = shouldIngestEmail({
  fromAddress: summary.fromAddress,
  fromName: summary.fromName,
  subject: summary.subject,
});
if (!gate.ingest) {
  console.log(`[cron/email-poll] skipped ${summary.messageId} from "${summary.fromRaw}": ${gate.reason}`);
  return "skipped";
}

const email = await toParsedInboundEmail(summary); // { messageId, threadId, from, subject, html, text, attachments, inlineImages, inlineImagesUnresolved }
```

`email.from` is then used at: Match 3 (`.ilike("requester_email", email.from)` + the
`subjectsMatch(t.subject, email.subject)` filter), the `contacts` lookup
(`.ilike("email", email.from)`), and the new-ticket `insert` (`requester_email: email.from`,
`subject: email.subject`). Body for the first `ticket_messages` insert is
`email.html ?? email.text ?? ""` with `source_meta.contentType` set accordingly.

**Implementation approach:** right after `toParsedInboundEmail`, compute:

```ts
let requesterEmail = email.from;
let ticketSubject = email.subject;
let formBody: string | null = null; // plain text; when set, overrides email.html/.text

if (gate.source === "webriq-support-form") {
  const form = parseSupportFormEmail(email);
  if (form?.requesterEmail) {
    requesterEmail = form.requesterEmail;
    ticketSubject = form.subject?.trim() || email.subject;
    formBody = buildSupportFormBody(form); // helper in support-form.ts
  } else {
    console.warn(`[cron/email-poll] ${summary.messageId}: support-form parse failed — using raw envelope`);
  }
}
```

Then substitute `requesterEmail` for `email.from` and `ticketSubject` for `email.subject`
in Match 3, the contact lookup, and the ticket `insert`. For the message body: when
`formBody` is set, use it with `contentType: "text/plain"` and skip the inline-image pass
(a form body has no `cid:` images).

### File: `src/lib/email/support-form.ts` (new)

```ts
import type { ParsedInboundEmail } from "./inbound";

export type SupportFormSubmission = {
  requesterName: string | null;
  requesterEmail: string | null;
  company: string | null;
  category: string | null;
  subject: string | null;
  concern: string;
  attachmentUrl: string | null;
};

// Field labels the form template emits, in body order. Matched case-insensitively.
// "concern" runs to the "attachment:" line (or EOF) so multi-line concerns survive.
```

- Work off `email.text` when present, else convert `email.html` → text: replace
  `<br>`, `</p>`, `</div>`, `</tr>`, `</li>` with `\n`; strip remaining tags; decode
  `&amp; &lt; &gt; &quot; &#39; &nbsp;`.
- Require the marker `/details of form submission/i` **and** a syntactically valid
  `email:` value — otherwise return `null`.
- `attachmentUrl`: first `https?://\S+` on/after the `attachment:` label. If the source was
  HTML, also try an `href="https?://[^"]+"` near the label (the visible text can be
  wrapped/truncated by the mail client).
- `buildSupportFormBody(form)` returns:

  ```
  Full name: {name}
  Email: {email}
  Company: {company}
  Category: {category}

  {concern}

  Attachment: {url}        <- only when attachmentUrl is set
  ```

## Implementation Steps

1. `intake-filter.ts`: add `source?: string` to `IntakeDecision`; add `INTAKE_ALLOWLIST` and
   the allowlist loop at the very top of `shouldIngestEmail` (after the trimmed-input
   computation, before the hub sender-name check); add `SYSTEM_SENDER_DOMAINS` + a check
   folded in with the `SYSTEM_SENDER_PATTERNS` loop.
2. Create `src/lib/email/support-form.ts` with `parseSupportFormEmail()` +
   `buildSupportFormBody()` + types.
3. `email-poll/route.ts`: import both helpers; add the `gate.source` branch computing
   `requesterEmail` / `ticketSubject` / `formBody`; substitute them into Match 3, the contact
   lookup, and the ticket `insert`; use `formBody` (text/plain, no inline-image pass) for the
   first `ticket_messages` body when set.
4. Scratch script in the scratchpad: run `shouldIngestEmail` for — (a) the form mail (expect
   ingest, `source: "webriq-support-form"`), (b) `wix-team@notification.wix.com` (expect drop),
   (c) `x@sub.notification.wix.com` (expect drop), (d) a task-327 case (unchanged), (e) a
   normal customer email (expect ingest). Run `parseSupportFormEmail` against the sample body
   (text and an HTML variant).
5. `npx tsc --noEmit` && `pnpm lint`.
6. Update `TASKS.md` (move to Testing per repo convention on completion).

## Acceptance Criteria

- [ ] An email from `no-reply@webriq.me` subject `Submit ticket` with the form body creates a
      ticket whose `requester_email` is the body's `email:` value, whose `subject` is the
      body's `subject:` value, and whose first message body is the rebuilt plain-text block
      (concern + field header + attachment link).
- [ ] That ticket's `customer_id` resolves via the normal `contacts` match on the real
      submitter address (null when no contact — unchanged behaviour).
- [ ] A form mail whose body is missing/garbled still creates a ticket (raw envelope values)
      and logs `support-form parse failed`.
- [ ] Email from `wix-team@notification.wix.com` (and any `*.notification.wix.com`) is dropped
      with a `reason` naming the domain rule.
- [ ] All task-327 drop/keep cases behave exactly as before.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Scratch: node/tsx script exercising shouldIngestEmail + parseSupportFormEmail against fixtures
# Live (deferred — needs the real mailbox + cron config, same posture as tasks 318/327):
#   submit the webriq.com support form, wait one poll cycle, confirm one ticket with the
#   submitter's real email/subject and a clean body.
```

## Compatibility Touchpoints

- No packaging / install / adapter surface.
- No env vars, no migration, no schema change.
- `IntakeDecision` gains an optional field — additive, no other caller besides the poll route.
- No new dependency (HTML→text is a small local regex helper, not a library — the body is a
  known fixed template, not arbitrary rich mail).

## Implementation Notes

### What Changed
- `intake-filter.ts`: `IntakeDecision` gained `source?: string`. New `INTAKE_ALLOWLIST`
  (`{ label, fromAddress, subject }[]`) checked at the top of `shouldIngestEmail` — a match
  where both `fromAddress` and `subject` test true returns `{ ingest: true, source: label }`,
  short-circuiting every denylist rule. Seeded with `webriq-support-form`
  (`/^no-?reply@webriq\.me$/i` + `/^submit ticket$/i`). New `SYSTEM_SENDER_DOMAINS` bucket
  (`["notification.wix.com"]`), checked next to `SYSTEM_SENDER_PATTERNS`, matching the domain
  exactly or as a parent of a subdomain (`domain === d || domain.endsWith("." + d)`).
- New `src/lib/email/support-form.ts`: `parseSupportFormEmail(email)` → `SupportFormSubmission | null`
  (converts HTML→text when there's no plain part, requires the "details of form submission"
  marker + a valid `email:` value, otherwise `null`); `buildSupportFormBody(form)` → the
  plain-text first-message body (field header, blank line, concern, blank line, `Attachment:`
  line). Attachment URL is read from the anchor `href` first (visible text is often
  truncated), falling back to a text match.
- `email-poll/route.ts`: after `toParsedInboundEmail`, when `gate.source === "webriq-support-form"`
  it parses the body into local `requesterEmail` / `ticketSubject` / `formBody`. Those replace
  `email.from` / `email.subject` in Match 3, the `contacts` lookup, and the ticket `insert`.
  When `formBody` is set the first `ticket_messages` row stores it as `text/plain`, the
  inline-image pass is skipped, and `inlineImagesUnresolved` is forced off. Parse failure →
  `console.warn` + raw-envelope fallback (unchanged behaviour).

### Files Changed
- `src/lib/email/intake-filter.ts` - allowlist + Wix domain denylist + `source` on the decision.
- `src/lib/email/support-form.ts` - new; form-body parser + ticket-body builder.
- `src/app/api/cron/email-poll/route.ts` - thread parsed submitter/subject/body through ticket match + create.
- `_docs/task/352-*.md`, `TASKS.md` - planning + tracker.

### Deviations From Plan
- None. `attachmentUrl` href-vs-text precedence was flipped during testing (href first) so the
  truncated visible URL text in HTML mail doesn't win — a refinement within the planned helper,
  not a scope change.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (0 errors; 2 pre-existing unrelated warnings in `_checklist-tab.tsx`)
- Scratch script (`shouldIngestEmail` × 11 cases + `parseSupportFormEmail`/`buildSupportFormBody`
  × 13 cases, incl. the real sample body in both HTML and plain-text form) - PASS (24/24), script deleted.
- Live end-to-end (submit the real webriq.com form, confirm one ticket with the submitter's
  real email/subject/body after one poll cycle) - SKIPPED (needs the live mailbox + cron
  config, same posture as tasks 318/327).
- impeccable design hook flagged `broken-image` on `route.ts` L247/L267/L272 — false positive:
  those are pre-existing code comments containing the literal text `<img src>` (task 321/341
  notes about dead inline images in ticket bodies), not markup, in a UI-less backend route. Not
  suppressed in config (left for the reviewer to confirm).

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. Types are explicit (`SupportFormSubmission`, `IntakeDecision.source?`),
  no `any`, guard-clause style throughout, `console.warn` on parse failure is intentional
  operational logging consistent with the file's existing usage.
- One readability tidy applied during the gate: `concernValue` first-line extraction used a
  redundant `.replace(/^\s*:?\s*/, "")` after `CONCERN_LABEL` (which already consumes the
  colon) — swapped to `.trimStart()` with a clarifying comment. Behaviourally identical.
- `intake-filter.ts` rules stay as named `const` arrays in one file per the task's storage
  decision; each carries a rationale comment. Allowlist-before-denylist ordering is explicit
  and commented.

### Deviations
- Minor: `attachmentUrl` reads the anchor `href` before the visible-text URL (visible text is
  truncated by the mail client). Within the planned helper, decided during implementation
  testing — already recorded in Implementation Notes.
- Minor (accepted): the allowlist subject match is exact (`/^submit ticket$/i`). A future form
  change to the relayed subject line would drop the mail rather than mis-route it — the
  intended fail-safe direction for an allowlist.

### Required Fixes
- None.
