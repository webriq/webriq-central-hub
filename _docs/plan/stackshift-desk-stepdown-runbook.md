# StackShift → Hub: Zoho Desk step-down runbook (task 450)

**Audience:** the Hub owner / operator. **Status:** ready to follow once a pilot site has a **non-revoked parity sign-off** (`/desk/stackshift-parity`, task 449). Nothing in the code changes behaviour before that: reconcile mode, per-site customer emails and the cadence/unschedule migrations are all gated on the sign-off.

Every step below is **reversible**. Do them in order, one at a time, and finish each step's *Verify* before the next. Rehearse each *Rollback* on the pilot site before relying on it — "rehearsed" is an acceptance criterion of task 450 that only you can tick.

Ground rules: nothing here deletes data; the Mail poll (`ticket-email-poll`) and every non-StackShift cron are never touched; one site at a time.

---

## 0. Preconditions (stop if any is false)
- [ ] Migrations **169–174** (in `supabase/migrations/`) are applied. Steps 3 and 6 use the **manual scripts** in `supabase/manual/stackshift-stepdown/` — they are deliberately *not* migrations (see that folder's README) and you run them yourself in the SQL editor.
- [ ] `/desk/stackshift-parity` shows the pilot site **signed off** and the sign-off is not revoked.
- [ ] `/desk/stackshift-stepdown` (Desk → StackShift step-down) lists the site under "Signed-off sites".
- [ ] StackShift's project has **stopped writing new tickets to Zoho Desk** for this site (its dual-write is off) — confirm with that team. Until then, "misses" would be false alarms.

## 1. Switch reconcile mode on (code, reversible)
**Do:** set `STACKSHIFT_DESK_RECONCILE_ENABLED=true` in the deployment environment and redeploy.
**What changes:** for tickets of *signed-off sites only*, the Desk poll (a) keeps refreshing Desk rows the Hub already holds (in-flight tickets keep syncing), (b) skips a Desk ticket whose direct copy exists, (c) **records and alerts** a Desk ticket the Hub has never seen (a *miss*) instead of importing it. Other sites are untouched.
**Verify:** the poll's log line `run {"reconcile":{"enabled":true,"signedOffSites":1}, …}`; create a throwaway ticket on the pilot site via the Desk side only and confirm it appears under *Open misses* and admins get a notification; import or dismiss it.
**Rollback:** set the variable to `false` (or unset it) and redeploy — or revoke the sign-off. The very next poll ingests exactly as before. Misses already recorded stay in the table; import the ones you still want.
**Observe:** at least one full business cycle (suggested ≥ 7 days) with **no unexplained misses**.

## 2. Customer emails move to the Hub (decision D4)
**Do:** *only after* StackShift has stopped sending its own customer notifications for the site, set `STACKSHIFT_SUPPORT_NOTIFY_SITES=<site>` (comma list; `*` = every signed-off site) and redeploy. StackShift must also send `suppressCustomerNotifications: false` on its create calls for that site.
**What changes:** the Hub sends the ticket-created email (with the customer-view password) and staff-reply emails for that site. A site without an active sign-off never gets Hub emails even if listed.
**Verify:** create a ticket as a test customer on the pilot site; exactly **one** ticket-created email arrives (not two); reply from the Hub and confirm one reply email.
**Rollback:** remove the site from `STACKSHIFT_SUPPORT_NOTIFY_SITES` (and let StackShift resume its own emails first, so customers are never left with none).

## 3. Lower the Desk poll cadence — manual script
**Do:** run `supabase/manual/stackshift-stepdown/step-3_lower-desk-poll-cadence.sql` in the SQL editor. It aborts unless a non-revoked sign-off exists, and changes only the schedule of `stackshift-desk-ticket-poll` (every 10 min → hourly).
**Verify:** `select schedule from cron.job where jobname = 'stackshift-desk-ticket-poll';` → `0 * * * *`.
**Rollback:** `select cron.alter_job((select jobid from cron.job where jobname = 'stackshift-desk-ticket-poll'), schedule := '*/10 * * * *');`
**Observe:** a further window (suggested ≥ 7 days), with no new misses.

## 4. Turn off the Desk email channel for helpdesk@ (outside the repo)
**Do (Zoho Desk admin):** disable the email channel / workflow rules that turn helpdesk@ emails into Desk tickets.
**Verify first:** the **Mail poll still covers helpdesk@** — send a test email to helpdesk@ and confirm it becomes a Hub ticket via `ticket-email-poll` (it does not depend on Desk). After disabling, send another and confirm no *Desk* ticket is created and no duplicate appears.
**Rollback:** re-enable the channel/rules in Zoho Desk. (Mail-ticket duplicates return and are flagged by the task-441 badge.)

## 5. Duplicate cleanup (decision D6) — dry run, review, apply
**Do:**
1. `NODE_OPTIONS=--experimental-websocket node --env-file=.env node_modules/tsx/dist/cli.mjs _docs/task/450-duplicate-cleanup/dry-run.ts --site <site>` — read-only; refuses without a sign-off.
2. Review `_docs/task/450-duplicate-cleanup/out/plan.json` and `apply.sql`.
3. Run `apply.sql` in the SQL editor. It is additive: for each correlated pair it copies the Desk-only context (site, business name, Desk custom fields, Desk number, SLA) onto the **direct** row under `source_meta.fromDesk`, and flags the **Desk copy** `source_meta.retiredInto`. Nothing is deleted or closed.
**What changes:** retired Desk copies disappear from the Inbox list by default (use *Show retired copies*); the Desk poll no longer refreshes them. Staff replies written only on a Desk copy stay on that retired copy.
**Verify:** the step-down page shows "0 duplicate pairs not retired"; spot-check 5 pairs in the Inbox.
**Rollback:** run `out/rollback.sql` — it removes exactly the keys `apply.sql` added.

## 6. Unschedule the Desk poll — manual script
**Precondition:** the step-down page shows **0 Desk-only tickets still open** for the site (open Desk-only tickets still need the poll to sync — design D5). The migration enforces this and also requires a non-revoked sign-off.
**Do:** run `supabase/manual/stackshift-stepdown/step-6_unschedule-desk-poll.sql` in the SQL editor. To knowingly give up syncing a few stragglers, run it in a transaction with `set local app.stackshift_force_unschedule = 'on';` first.
**Verify:** `select * from cron.job where jobname = 'stackshift-desk-ticket-poll';` returns no row.
**Rollback:** the re-registration SQL in the migration's header (identical to migration 148).

---

## If something goes wrong
- **Fastest full rollback of behaviour:** *revoke the sign-off* on `/desk/stackshift-parity`. Every gated behaviour (reconcile mode, Hub customer emails) turns itself off for that site on the next run.
- A **miss** is a real customer ticket the Hub never received. Never dismiss one without looking at it.
- The poll/cron changes (steps 3 and 6) are the only ones that require a database change to undo; both have exact rollback SQL above.
