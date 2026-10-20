# Test Report: 458, Desk Inbox reply fresh-email fallback + editable To/Cc/Bcc

**Date:** 2026-10-20
**Task doc:** `_docs/task/458-desk-reply-fresh-email-fallback-and-recipients.md`
**Quality gate:** PASS (see the task doc's Quality Gate Notes)
**Overall result:** **PASS.**
- Static checks: clean.
- Route checks: 28/28 with Zoho Mail mocked.
- Live sends: 6/6 to the user's own address.
- Browser walkthrough: U01–U08 pass.
- One real bug was found during testing and fixed (T-FIX-1). Its checks were re-run green.
- Skipped by the user's choice: live Cc/Bcc delivery, and customer-reply threading (AC 2).

## Environment and safety

- Local checkout, Next.js 16.2.11 (Turbopack dev), `.env` points at the **live** Supabase project and the live Zoho Mail account (`helpdesk@webriq.us`). There is no local database.
- **Recipient rule (user instruction):** never send to a real customer. Every live send went only to `brandondwite.cobacha@webriq.services`. The harness's `fetch` wrapper enforced this with a hard guard that throws on any other To/Cc/Bcc address in live mode. In mock mode, Zoho Mail send calls never leave the process. Fake `@example.com` addresses were used only in mock mode and in browser chips that were removed before sending.
- **Write scope (user-approved):** throwaway tickets whose subject contains `[TEST 458]`, requester = the user's address, `channel='email'`. Run 1 created 4, the failed run 2 created 1 (it aborted on a unique-key collision, see below), run 3 created 3, and the browser check created 1 (#21125). `cleanup.ts` deleted them (it only deletes ids recorded by the harness **and** carrying the `[TEST 458]` marker) and verified `remaining "[TEST 458]" tickets: 0` after the final run.
- **Live emails sent to the user's address (3):** two from harness run 1 (fallback + native reply threaded off it), one from the browser walkthrough.
- Harness, stub and cleanup scripts live in the session scratchpad, not the repo.
- The dev server was stopped afterwards and port 3000 confirmed free.

## Static checks

| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS (after the T-FIX-1 change) |
| `npx eslint "src/app/(hub)/desk/inbox/[inboxId]" "src/app/api/desk/tickets/[ticketId]/reply" src/lib/zoho/mail.ts` | PASS, 0 problems |

## Route checks: real handler, stubbed session

**Method:** the real `POST` from `reply/route.ts` was imported and called directly with a `Request` (not over HTTP), the same approach as task 455's report.
- **Stubbed:** only `@/lib/supabase/server`, replaced via a test-only tsconfig `paths` entry with a stub whose `auth.getUser()` returns a chosen real profile id (one admin/super_admin/pm, one developer). Role checks read the real `profiles` row.
- **Real:** DB writes go through the real `adminClient`.
- **Zoho Mail:** calls (`mail.zoho.com/api/accounts/...`) were intercepted. The request URL and JSON body were captured, and in mock mode a `{data:{messageId}}` 200 came back without any network send. Supabase and the Zoho OAuth token refresh went through for real.

Command, run from the repo root:

```
npx tsx --env-file=.env --tsconfig <scratchpad>/t458/tsconfig.test.json <scratchpad>/t458/harness.ts <scratchpad>/t458/run3.json --no-live
```

Final run (run 3) results:

| # | Check | Result |
|---|---|---|
| R01 | Signed out → 401 | PASS |
| R02 | Developer → 403 | PASS |
| R03 | `to` as a string (not array) → 400 | PASS |
| R04 | Invalid address → 400 `Invalid email address: not-an-email` | PASS |
| R05 | 21 recipients → 400 `At most 20 recipients per reply` | PASS |
| R06 | `to: []` → 400 `Add at least one To recipient` | PASS |
| R07 | `cc` as a string → 400 | PASS |
| R08 | No Zoho send attempted for any rejected request (0 captured) | PASS |
| R09 | Ticket with no `email_message_id` → 200 (the original bug) | PASS |
| R10 | Fallback uses the send endpoint `/messages` (no id in path, no `action`) | PASS |
| R11 | `mailFormat: "html"` | PASS |
| R12 | Subject `Re: [TEST 458] Fallback mock` | PASS |
| R13 | Cross-list dedupe: to=`qa-to`, cc=`qa-cc` (dup of To dropped), bcc=`qa-bcc` (dup of Cc dropped) | PASS |
| R14 | Content = reply + `… wrote:` header + `<blockquote>` | PASS |
| R15 | Quoted HTML kept as HTML | PASS |
| R16 | Auth-gated `/api/desk/...` inline `<img>` replaced with `[image]`, no `/api/desk/` left | PASS |
| R17 | Later internal note not quoted (last **public** message used) | PASS |
| R18 | Quote author = ticket contact | PASS |
| R19 | Hub row body = reply only (no quote) | PASS |
| R20 | Hub row is public staff, `contentType: text/html` | PASS |
| R21 | Hub row `source_meta.recipients` = deduped lists | PASS (failed in run 1: harness bug, see below) |
| R22 | No `to` in body → sends to the ticket contact, no cc/bcc fields | PASS |
| R23 | Ticket with `email_message_id` → 200 | PASS |
| R24 | Native path: `/messages/<latest id>`, `action: "reply"`, Cc passed | PASS |
| R25 | Native path sends the reply without a quote | PASS |
| R26 | Hub row stores the returned `messageId` | PASS |
| R27 | Plain-text quote HTML-escaped with `<br>` | PASS (failed in run 1: real bug T-FIX-1) |
| R28 | Subject already `Re: …` not doubled | PASS |

## Live sends: real Zoho Mail, user's address only

From harness run 1 (live mode, guard active). These paths were not changed by T-FIX-1, which only affects quoting of plain-text bodies; the live ticket's seeded message was HTML.

| # | Check | Result |
|---|---|---|
| L01 | Fallback send on a ticket with no mail message → 200 | PASS |
| L02 | Used the send endpoint `/messages` | PASS |
| L03 | Zoho returned a `messageId`, stored on the Hub row (`1792494719626138400`) | PASS. This answers the open question in `mail.ts` about the send response's id field. |
| L04 | Second reply on the same ticket → 200 | PASS |
| L05 | Second reply threaded natively off L03's id (`/messages/1792494719626138400`, `action: reply`) | PASS |
| L06 | Native reply returned its own `messageId` (`1792494722027155100`) | PASS |

**For the user to eyeball in their inbox (not machine-checked):** whether the fallback email shows the quoted seeded message, and whether the second email lands in the same conversation in their mail client.

## Browser walkthrough: Chrome (user's session), `localhost:3000`, ticket #21125

The first attempt couldn't open `localhost` (extension site permission). The user granted access and the retry ran fine.

| # | Check | Result |
|---|---|---|
| U01 | Composer opens with From = `helpdesk@webriq.us`, To = contact as a removable chip, Cc/Bcc links | PASS |
| U02 | Cc link reveals the Cc row. `bad-address` + Enter → stays in input, inline "Not a valid email: bad-address" | PASS |
| U03 | Replacing it with `qa-cc@example.com qa2@example.com` + Enter → split into two chips | PASS |
| U04 | Backspace ×2 in the empty input removes both chips | PASS |
| U05 | × on the pre-filled contact removes it. Hint changes to "Add at least one To recipient." Send with a body → blocked with the same error, no message created (thread still showed 1 conversation) | PASS |
| U06 | Cancel then Reply → To reset to the contact, Cc collapsed, body empty | PASS |
| U07 | Send with To = the user's address only → "Sending…" loading state, then the composer closes and the thread shows a "Reply from us" row | PASS |
| U08 | Expanding that row shows `To brandondwite.cobacha@webriq.services` above the body. DB row: public staff, `email_message_id` `1792495104690138300`, `source_meta.recipients {to:[user], cc:[], bcc:[]}` | PASS |

Dev overlay showed **1 issue:** a hydration-attribute mismatch on `fdprocessedid`, an attribute a browser form-filler extension injects into form controls (the Status `<select>`). Unrelated to task 458 and not a code issue.

## Failures found and how they were resolved

- **T-FIX-1 (real bug, fixed):** `isHtmlBody()` in the reply route also sniffed for tags, so a plain-text message containing `<…>` was treated as HTML. Example: `Line1\n<script>x</script>`, or common `John <john@x.com>` headers. It was embedded raw, unescaped, and lost its line breaks. Investigation showed every message writer stamps `source_meta.contentType` (Desk imports use `DESK_MESSAGE_CONTENT_TYPE = "text/html"`), so the sniff's premise was wrong. Fix: `isHtmlBody()` now checks `contentType === "text/html"` only, matching `page.tsx`. The task doc requirement was updated. R27 is now green; tsc + eslint re-run clean.
- **R21 run 1 (harness bug):** the check compared `JSON.stringify` of the stored jsonb, but Postgres reorders jsonb keys. The stored values were correct. The check now compares field by field.
- **Run 2 abort (harness bug):** run 1's tickets were still present, so the reused mock id `MOCK-ROOT-1` violated `ticket_messages_email_message_id_key`. Fixed with per-run mock ids, and cleanup now runs after each run.

## Skipped

- **Live Cc/Bcc delivery.** The user chose to skip it (no second address). The request shape is covered by R13/R24: `ccAddress`/`bccAddress` built, deduped, and omitted when empty. Whether Zoho delivers Cc/Bcc is not verified.
- **Acceptance criterion 2: a customer reply threads onto the same ticket.** It needs a reply to land in `helpdesk@` and the production `email-poll` to run. The test tickets were deleted at the user's request, so it wasn't exercised. Threading relies on the stored `messageId` (L03/U08 confirm it is stored) plus `email-poll` Match 2/3, which are unchanged.
- **Direct StackShift ticket read-only To line.** No `channel='stackshift'` test ticket was created (would trigger the outbox). Covered by code inspection only: `recipientsEditable = channel !== "stackshift"`, and the route returns before recipient parsing for that channel.

## Note for the tracker

`TASKS.md` still lists 458 under **Planned**, because the code was written before the implement stage (see the Quality Gate process note). Moving it to **Approved** waits for the user's approval of this report.
