# 441: Investigate & Fix Ticket Ingestion Delay (StackShift) and Incomplete Email Threads (Helpdesk Zoho Mail)

**Created:** 2026-10-08
**Priority:** HIGH
**Type:** bugfix (investigation first, then gated fixes)
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

Two symptoms in the Desk Inbox, both visible in the reporter's screenshots:

1. **StackShift tickets arrive days late.** Ticket `#21083` ("Website Orders – Populate overcredit_release…") has its only message stamped **Oct 02, 11:58 PM** (that value comes from Desk's `sendDateTime`, see `stackshift-message-sync.ts:143`), but the Hub ticket row was created **Oct 07, 6:30 AM** — ~5 days later. The cron is meant to poll every 10 minutes.
2. **Helpdesk (Zoho Mail) tickets don't sync the whole thread.** Ticket `#21086` ("New page for McGregor Wealth Management") shows **1 conversation** (Sep 15, 12:32 AM), while Zoho Mail shows the root plus two staff replies (**Me**, Sep 15 and Sep 18, SENT) and a customer follow-up (**Wed Oct 7, 6:03 PM**). The Hub ticket itself was created **Oct 08, 3:10 AM** — ~3 weeks after the root email arrived.

Both pollers are cursor-based and share the `email_poll_cursor` table. Code reading (below) found several concrete defects that fit the symptoms, but **the root cause per symptom is not yet confirmed against live data** — Phase 0 collects that evidence before any fix is chosen.

## Findings from code research (hypotheses to confirm in Phase 0)

### StackShift — `src/app/api/cron/desk-ticket-poll/route.ts` (task 388)

| # | Finding | Why it can cause multi-day delay |
|---|---------|----------------------------------|
| S1 | **No `maxDuration`** exported on the route (`grep maxDuration src/app/api/cron` → nothing). Each run searches up to 20 pages, then calls `processTicket()` → `syncTicketMessages()` **sequentially**, several Desk requests per ticket (thread + per-thread content + comments + attachments). | A run that exceeds the platform default timeout dies **before** the cursor upsert (the cursor only advances once, at the very end, `route.ts` ~L108). The same backlog is retried from the same cursor on every run → ticket lands only when a run happens to finish. |
| S2 | Cursor = max `modifiedTime` seen; filter is strictly `modifiedMs > cursorMs`; **no overlap window**. | If Desk's search index lags (ticket created at T, searchable at T+Δ) or the ticket's `cf_stack_shift_site` is set by a follow-up update, its `modifiedTime` can be ≤ the cursor by the time it is searchable → it is **never** returned until something modifies it again (a reply). That matches "ticket appears days later, when it was next touched". |
| S3 | Cadence is every 10 min (`148_stackshift_desk_ticket_poll.sql`); migration 148 is registered as "written, not applied"-style in this repo's convention. | If the `stackshift-desk-ticket-poll` pg_cron job is missing / failing (bad Vault `app_base_url`, secret mismatch → 401), nothing polls at all and tickets only arrive via manual/admin runs. **Must verify in `cron.job` / `cron.job_run_details`.** |
| S4 | `customField1=cf_stack_shift_site:${notempty}` and `sortBy=-modifiedTime` are flagged **UNVERIFIED** in the route header. | If `sortBy` is ignored, `orderUnreliable` forces a full 20-page scan every run (slow → S1). |

### Helpdesk — `src/app/api/cron/email-poll/route.ts` + `src/lib/zoho/mail.ts` (tasks 303/318/327)

| # | Finding | Effect |
|---|---------|--------|
| E1 | **Inbox folder only, inbound only.** `listNewMessages({ folderId: ZOHO_MAIL_INBOX_FOLDER_ID })`; every ingested message is inserted `author_type: "client"`. Staff replies in the **Sent** folder (and anything sent from the Zoho Mail UI instead of the Hub's `sendReply`) are never read. | The "Me / SENT" replies in the screenshot can never appear in the Hub. Directly explains the missing thread. |
| E2 | **Cursor skips past a failed message.** Loop `for (summary of messages)` updates the cursor after each *successful* message and `continue`s on failure; the comment claims "a failure leaves it in place so the next poll retries", but a later success in the same batch advances the cursor beyond the failed one. | A single transient failure (attachment/IMAP/DB hiccup) permanently drops that message — e.g. the Oct 7 follow-up. |
| E3 | `GET /messages/view?folderId&limit=50&status=all` — **no sort params, no paging**; "since" is filtered client-side. The inbox is very noisy (screenshot: 7,247 unread, NewsLetter 1,034, Notification, `no-reply@webriq.me` form mail, Microsoft alerts). | If >50 messages arrive between polls, or Zoho's default order isn't `receivedTime` desc, older-but-unseen messages fall off the window and are never fetched. |
| E4 | New-ticket path inserts the message with **default `created_at = now()`** (no source timestamp), unlike the Desk sync which passes the original time. | Hub message dates can't be compared with Zoho's to measure lag, and a late-ingested root looks "on time". (Observed ticket UI shows Sep 15 for the message — **confirm where that date is read from**; may be a UI source_meta/`email_received_at` field.) |
| E5 | Ticket created 3 weeks after the root's `receivedTime` means the root was **not** ingested when it arrived. Candidates: E2/E3 drop followed by a later re-delivery/move, a cursor reset (`update email_poll_cursor …` per migration 122's note), the poll not running, or `shouldIngestEmail`/Match-3 behaviour. | Needs evidence — see Phase 0. |

## Requirements

### Phase 0 — Evidence (read-only; no code change; operator runs SQL, agent drafts the queries in the task retro)
- [ ] `select jobname, schedule, active from cron.job where jobname in ('ticket-email-poll','stackshift-desk-ticket-poll')` and the last ~50 `cron.job_run_details` rows for each (status, duration, `return_message`) — confirms S3, timeouts (S1) and 401s.
- [ ] Vercel function logs for `/api/cron/desk-ticket-poll` and `/api/cron/email-poll` over the Oct 2–8 window: duration, `504/FUNCTION_INVOCATION_TIMEOUT`, `[cron/…] failed to process …` lines.
- [ ] `select id, last_received_time, updated_at from email_poll_cursor` — compare with now; has either cursor stopped advancing (S1) or been reset (E5)?
- [ ] For tickets `#21083`, `#21086`: `inbox.created_at`, `source_meta` (`ticketNumber`, `webUrl`), `zoho_mail_thread_id`, every `inbox_messages` row (`created_at`, `email_message_id`/`external_id`, `author_type`).
- [ ] Desk side for `#21083`: ticket `createdTime` vs `modifiedTime` vs when `cf_stack_shift_site` was set (Desk ticket history) — confirms or kills S2.
- [ ] Zoho Mail side for `#21086`: `receivedTime` of the Sep 15 root and the Oct 7 follow-up, their `folderId`, and what `messages/view` returns for the inbox right now (count, order) — confirms or kills E3/E5.
- [ ] Write the confirmed root cause per symptom into this doc (Findings → Confirmed) **before** Phase 1; drop fixes whose hypothesis was refuted.

### Phase 1 — StackShift fixes (apply only those Phase 0 confirms)
- [ ] Export `maxDuration` (match other long cron/admin routes) and add a **per-run time budget** to the ticket loop so the run stops cleanly and advances the cursor to the last *fully processed* ticket instead of dying mid-run (S1).
- [ ] Advance the cursor **incrementally** (after each ticket, or per page), never only at end-of-run (S1).
- [ ] Add a **lookback overlap** (e.g. re-scan `cursor − 15 min`; upserts are already idempotent on `external_id` and message sync dedupes by `external_id`) and use `>=` semantics so index lag / equal timestamps can't strand a ticket (S2).
- [ ] Emit one structured log line per run: `{ found, processed, failed, cursorBefore, cursorAfter, ms }`, and a lag figure (`ingestedAt − ticket.createdTime`) per new ticket (observability that was missing).
- [ ] Verify (or fix) `sortBy` behaviour on `/tickets/search` against a live token (S4).

### Phase 2 — Helpdesk thread completeness (apply only those Phase 0 confirms)
- [ ] Fix cursor semantics so a failed message is retried: stop the batch at the first failure (preserving oldest-first order) or track the earliest failed `receivedTime`; the existing `email_message_id` dedupe makes retries safe (E2).
- [ ] Make listing robust: pass explicit sort (`receivedTime` desc) and page until a page is entirely ≤ cursor; keep the client-side filter (E3).
- [ ] Ingest **staff replies**: also poll the **Sent** folder (`ZOHO_MAIL_SENT_FOLDER_ID`, new env var in `env.example`), match them to a ticket by `threadId`/Match 2/3, insert as `author_type: "staff"`, never create a ticket from a Sent-only message, and skip messages the Hub itself sent via `sendReply` (dedupe on the returned `messageId` / `email_message_id`) (E1).
- [ ] Pass the message's real `receivedTime` as `inbox_messages.created_at` on insert so ordering and lag are correct (E4).
- [ ] **Thread backfill for existing tickets** — an admin route modelled on `backfill-stackshift-messages` / `backfill-inline-images` (`?dryRun`, `?limit`, `?ticketNumber`, admin-only, SSE) that, for tickets with a `zoho_mail_thread_id`, fetches the full Zoho thread and inserts missing messages. Includes `#21086`.

## Out of Scope / Must-Not-Change

- No change to the Desk→Hub one-way direction (no write-back to Desk, task 388 decision stands).
- No change to the intake filter rules, customer-confirmation email behaviour, ticket numbering, or the inline-image/IMAP pipeline (tasks 321/327/341/379).
- No change to the Zoho Mail OAuth/refresh-token model.
- No git commands; migrations (if any are needed, e.g. a poll-run log table) are **written, not applied** by the agent per repo convention.
- Do not reset/overwrite either cursor row from code; any manual cursor rewind is an operator SQL step documented in the retro.
- Do not spawn real Zoho/Desk writes during verification (read-only API calls and dry-runs only).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/cron/desk-ticket-poll/route.ts` | Modify | `maxDuration`, time budget, incremental cursor, overlap window, run summary log |
| `src/lib/desk/stackshift-message-sync.ts` | Read / minimal modify | Only if per-ticket cost needs trimming for the time budget |
| `src/app/api/cron/email-poll/route.ts` | Modify | Cursor-on-failure fix, paging, Sent-folder pass, `created_at`, run summary log |
| `src/lib/zoho/mail.ts` | Modify | Sort/paging params on `listNewMessages`; folder-parameterised listing; thread-fetch helper (spike-verified) |
| `src/app/api/admin/desk/backfill-email-threads/route.ts` | Create | Dry-run-first backfill of missing thread messages for existing tickets |
| `env.example` | Modify | `ZOHO_MAIL_SENT_FOLDER_ID` |
| `CLAUDE.md` | Modify | Update the Cron/poll notes (cursor semantics, Sent folder, overlap) |
| `supabase/migrations/169_*.sql` | Create **only if** a poll-run log table is chosen | Written, not applied |

## Code Context

### `desk-ticket-poll/route.ts` — cursor written once, at end of run
```ts
for (const ticket of tickets) {
  try { await processTicket(ticket, token); processed++; }
  catch (e) { console.error(`[cron/desk-ticket-poll] failed to process ticket ${ticket.id}`, e); }
}
if (latestSeenMs > cursorMs) {
  await adminClient.from("email_poll_cursor").upsert({ id: CURSOR_ID, last_received_time: String(latestSeenMs), ... });
}
```
A timeout inside the loop means the upsert never runs.

### `desk-ticket-poll/route.ts` — strict comparison, no overlap
```ts
if (modifiedMs > cursorMs) { collected.push(t); ... }
```

### `email-poll/route.ts` — cursor advances past a failure
```ts
for (const summary of messages) {          // oldest first
  try {
    const outcome = await processMessage(summary);
    await adminClient.from("email_poll_cursor").update({ last_received_time: summary.receivedTime ... });
  } catch (e) {
    console.error(`[cron/email-poll] failed to process message ${summary.messageId}`, e); // loop continues
  }
}
```

### `zoho/mail.ts` — window of 50, no sort, Inbox only
```ts
const qs = new URLSearchParams({ folderId: params.folderId, limit: String(params.limit ?? 50), status: "all" });
// ... client-side filter: Number(m.receivedTime) > Number(params.sinceReceivedTime)
```

Also read: `src/lib/desk/stackshift-message-sync.ts` (message `created_at` from Desk), `src/lib/zoho/desk.ts` `fetchDeskPage`, `supabase/migrations/122_ticketing_zoho_mail_migration.sql` and `148_stackshift_desk_ticket_poll.sql` (cron jobs + cursor seeds), and the sibling backfill routes under `src/app/api/admin/desk/`.

## Implementation Steps

1. Run Phase 0; record confirmed causes in this doc. Stop and report if a cause is outside the listed hypotheses.
2. Spike (read-only) the unverified Zoho Mail endpoints: `messages/view` sort/paging params, listing the Sent folder, and fetching a full thread — record exact request/response shapes in the doc.
3. Implement Phase 1 changes for confirmed StackShift causes; add a pure-logic check (`_docs/task/441-poll-cursor.check.ts`, run via `npx tsx`, per the 438–440 convention) for the cursor/overlap/time-budget decision function — extract it into a small pure helper so it is testable.
4. Implement Phase 2 changes for confirmed Helpdesk causes, with a matching pure check for "failed message never skipped by cursor" and Sent-message dedupe.
5. Build the thread backfill route; dry-run against `#21086`, then widen.
6. Update `CLAUDE.md` + `env.example`; write the retro with before/after lag numbers.

## Acceptance Criteria

- [ ] Root cause for each symptom is documented with evidence (queries/log excerpts), not assumed.
- [ ] A new StackShift Desk ticket appears in the Hub within **one poll interval + one run duration** (≤ ~12 min) in a live test, including a ticket whose `cf_stack_shift_site` is set via a follow-up update.
- [ ] A forced timeout/failure mid-run no longer causes the same backlog to be retried indefinitely (cursor advances past completed tickets only).
- [ ] A simulated failure on message N of a batch leaves message N retried on the next poll (never skipped), without duplicate rows.
- [ ] Ticket `#21086` shows the full thread (root, both staff replies as staff, Oct 7 follow-up) in correct chronological order after the backfill; staff replies are labelled staff.
- [ ] Hub-sent replies (`sendReply`) are not duplicated by the Sent-folder pass.
- [ ] Each poll run logs a one-line summary with cursor before/after and counts.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass; new `.check.ts` files pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
npx tsx _docs/task/441-poll-cursor.check.ts
# Live (operator): trigger each cron with the secret and read the summary line
curl -s -X POST "$APP/api/cron/desk-ticket-poll" -H "x-cron-secret: $CRONJOB_SECRET_KEY"
curl -s -X POST "$APP/api/cron/email-poll" -H "x-cron-secret: $CRONJOB_SECRET_KEY"
# Backfill dry run
curl -s -X POST "$APP/api/admin/desk/backfill-email-threads?dryRun=1&ticketNumber=21086"
```
Browser acceptance: open `/desk/tickets` for `#21083` and `#21086`; compare against Zoho Desk and Zoho Mail.

## Compatibility Touchpoints

- **Env/ops:** new `ZOHO_MAIL_SENT_FOLDER_ID` must be set locally **and on Vercel** (the task-341 lesson: an env var present locally but absent in prod silently degrades with no log signal — log a warning if the Sent folder is unset).
- **Zoho Mail OAuth scopes:** confirm the existing `ZOHO_MAIL_REFRESH_TOKEN` can read the Sent folder; regenerate with added scope if not.
- **pg_cron:** if cadence changes, update via a new migration using the same `cron.alter_job` pattern (written, not applied).
- **Docs:** `CLAUDE.md` cron-auth/poll notes; `_docs/mcp-tools.md` unaffected (no MCP tool changes).
- **Related tasks:** 303, 318, 321, 327, 341, 379, 388–392.

## Implementation Notes

### What Changed
- **StackShift poll (S1, S2):** `maxDuration = 300`, 240 s run budget, tickets processed oldest-first with the cursor advanced after each one, 15-minute lookback overlap (overlap-zone tickets are only processed if the Hub has never ingested them), and a one-line JSON run summary (found/processed/failed/budgetHit/cursorBefore/cursorAfter/ms).
- **Helpdesk poll (E2, E4):** a failed message now stops the batch so the cursor can't skip past it; the inserted message keeps Zoho's `receivedTime` as `created_at`; run summary now logged and includes `failed`.
- Pure helpers in `src/lib/desk/poll-cursor.ts` with `_docs/task/441-poll-cursor.check.ts`.

### Files Changed
- `src/app/api/cron/desk-ticket-poll/route.ts` — items above
- `src/app/api/cron/email-poll/route.ts` — items above
- `src/lib/desk/poll-cursor.ts` (new), `_docs/task/441-poll-cursor.check.ts` (new)

### Deviations From Plan
- **Phase 0 not run** — needs live DB/Vercel/Zoho access the agent lacks. The operator must still run the Phase 0 queries; root causes remain unconfirmed. Only the defects provable from code were fixed.
- **Deferred (need Phase 0 / Zoho spike):** Sent-folder ingestion (E1, `ZOHO_MAIL_SENT_FOLDER_ID`), Inbox sort/paging (E3), `sortBy` verification (S4), the `backfill-email-threads` route, and `CLAUDE.md`/`env.example` updates. E1 is the likeliest reason #21086 lacks its staff replies.
- A failed email message now blocks later messages until it succeeds (head-of-line); a permanently failing message would stall the poll, visible via `failed` in the run log.

### Verification Run
- `npx tsc --noEmit` - PASS
- `npx eslint src/app/api/cron src/lib/desk/poll-cursor.ts` - PASS
- `npx tsx _docs/task/441-poll-cursor.check.ts` - PASS
- Live cron trigger / browser acceptance - SKIPPED (no live access)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Fixed during review: `fetchTicketsSinceCursor`'s parameter was still named `cursorMs` although it now receives `cursor − overlap` (renamed `sinceMs`); replaced a non-null assertion on `byId.get()` with a guard. `tsc` and eslint re-run clean.
- Pure logic is isolated in `poll-cursor.ts` with a check file; no dead code, `any`, or debug-only logging (the two `console.log` run summaries are intentional observability required by the task).
- Residual note: the email poll's head-of-line stop means one permanently failing message stalls ingestion; it is surfaced via `failed` in the run log. Acceptable, documented.

### Deviations
- Medium: Phase 0 evidence and the Sent-folder / sort-paging / backfill-route / `CLAUDE.md` + `env.example` items are deferred (already recorded in Implementation Notes). The task's acceptance criteria for full-thread sync (#21086) are therefore **not yet met**; test stage should verify only what was implemented and report the rest as open.
- Minor: none other.

## Implementation Notes — Sent-folder follow-up

### What Changed
- New `src/lib/email/sent-ingest.ts`: `pollSentFolder()` lists the Sent folder (`ZOHO_MAIL_SENT_FOLDER_ID`, own cursor row `helpdesk-sent`), matches each message to an existing ticket (thread id → root message id → recipient + subject fallback), inserts it as `author_type: "staff"` with its real timestamp. Never creates tickets; dedupes on `email_message_id`; stops at the first failure; unset env var logs a warning and skips.
- `email-poll/route.ts` calls it after the inbound loop (non-fatal) and includes `sent` counts in the response/log.
- `zoho/mail.ts`: summary gains optional `toAddress`; `receivedTime` falls back to `sentDateInGMT`.
- `env.example`: `ZOHO_MAIL_SENT_FOLDER_ID`.

### Unverified (check after enabling)
- That Sent listings expose `receivedTime`/`sentDateInGMT` and `toAddress` under those names.
- That `sendReply`'s returned id equals the Sent-folder `messageId`; otherwise Hub-sent replies would duplicate.
- Sent-message attachments are not ingested (out of scope for now).
- First run has a null cursor: it takes the latest 50 Sent messages and appends only those matching existing tickets.

### Still deferred
- Inbox sort/paging (E3), the thread backfill route for older history, `CLAUDE.md` update.

### Verification Run
- `npx tsc --noEmit` - PASS; eslint on changed files - PASS; live run - SKIPPED

## Implementation Notes — root cause found + list-based pass + duplicate flag

### Confirmed findings (live evidence)
- **Mail thread (#21086):** not an incomplete sync. #21037 (Mail poll) holds the full 7-message thread; #21086 is the Zoho **Desk** copy of the same email (Desk # 21079, `channel=api`, source `stackshift-desk-poll`) and only has the opening message because staff replied via Mail/Hub. helpdesk@ evidently also feeds Zoho Desk (email-to-ticket), so the same email exists in both systems. Sent-folder ingestion (E1) was **not** the cause here (all 19 matched Sent messages were already stored); it stays as a safety net.
- **StackShift lag:** poll running since Sep 22; 7 of 12 `api` tickets took >1 day to arrive. Desk debug for #21083 (Desk ticket 21466): created Oct 2 15:58:11 with `cf_stack_shift_site` set at creation, modified 15:58:37, history = `TicketCreated` only, ingested Oct 6 22:30. **Cause: Desk's `/tickets/search` index lags hours to days**, while a direct fetch works immediately. Cursor logic + overlap can't fix lag of that size.
- Listing note: Zoho Mail `messages/view` returns newest-first only when `start` is passed (without it the Sent listing returned a June-2025 slice); `sortBy` accepts only `date`.

### What changed (this round)
- `desk-ticket-poll/route.ts`: **created-pass** (`runCreatedPass`) — lists newest-created tickets via real-time `/tickets?sortBy=-createdTime`, fetches each unseen one once to read `cf`, ingests StackShift ones through `processTicket()`. Own cursor row `stackshift-desk-created` (missing → 7-day seed, created on first advance), max 60 Get Ticket calls/run, shares the run budget, failure is non-fatal and reported as `createdPass` in the run summary. `?debug=ticket&id=` diagnostic still present (remove once verified).
- **Duplicate flag:** `findMailDuplicate()` sets `source_meta.duplicateOf = { inboxId, ticketNumber }` when a Desk ticket matches a Mail ticket (same requester, subject match, created within ±1 h). Detail page shows a link banner. No merge, nothing hidden.
- `poll-cursor.ts` + check: `selectUncheckedByCreated`.

### Not done / unverified
- `sortBy=-createdTime` on List Tickets is unverified (order guard keeps paging if wrong); check `createdPass.listed/checked/ingested` in the first run.
- No list-row pill for duplicates (detail banner only).
- Existing #21086 isn't flagged until re-processed; one-off SQL in the hand-off message.
- Probes (`?debug=sort` on email-poll, `?debug=ticket` on desk-ticket-poll) and the `CLAUDE.md` update remain to be cleaned/done.

### Verification Run
- `npx tsc --noEmit` - PASS; eslint on changed files - PASS; `npx tsx _docs/task/441-poll-cursor.check.ts` - PASS; live run - SKIPPED

### Live verification (created-pass) + cleanup
- First live run: `createdPass { listed: 43, checked: 41, ingested: 1, cursorBefore: 1790841934147, cursorAfter: 1791410923000 }`, 20.8 s — `sortBy=-createdTime` confirmed, and one StackShift ticket the search had never returned was ingested.
- Both temporary debug modes (`?debug=sort`, `?debug=ticket`) and `probeListSort` removed; `CLAUDE.md` StackShift-poll bullet updated.
