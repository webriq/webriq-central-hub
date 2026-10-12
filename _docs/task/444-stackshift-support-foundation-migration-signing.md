# 444: StackShift direct support — foundation: migration, signed-request auth, rate limit, audit, SLA config (stage 1a)

**Created:** 2026-10-08
**Priority:** MEDIUM
**Type:** feature (foundation)
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

First build step of the direct StackShift → Hub path (design `_docs/plan/stackshift-hub-direct-support-design.md` §5, contract `_docs/plan/stackshift-hub-support-api-contract.md` §1/§7). Delivers the shared foundation the endpoint tasks sit on: the migration (written, not applied), the HMAC request-verification library with key rotation, per-site Postgres rate limiting, request audit logging, and the priority → SLA-hours config. No public endpoint is exposed yet, so nothing can change production behaviour.

Part of the StackShift Support → Hub direct rollout: design `_docs/plan/stackshift-hub-direct-support-design.md`, contract `_docs/plan/stackshift-hub-support-api-contract.md`, hand-off `_docs/plan/stackshift-hub-support-handoff.md` (parent task 442).

## Requirements

- [ ] **Migration 169 (written, not applied):** `inbox` + `external_ref text unique`, `stackshift_site text` (indexed), `stackshift_actor_ref text`, `desk_ticket_id text` (indexed, not unique); widen `inbox_channel_check` to add `'stackshift'` (follow migration 148's drop/add pattern); `inbox_messages` + `external_ref text unique`; tables `stackshift_outbox`, `stackshift_support_audit`, `stackshift_rate_limit` (site, window_start, count), `support_sla_config` (priority → hours, admin-editable, seeded urgent 4 / high 8 / normal 24 / low 72 — values to confirm with the user). RLS: staff read of audit/outbox/SLA, service-role writes, SLA edit for admin/super_admin.
- [ ] Update `src/types/database.ts` for every new column/table (with `Relationships[]`).
- [ ] `src/lib/stackshift-support/auth.ts`: `verifySignedRequest(req, rawBody)` implementing contract §1 exactly (503 unset secret, ±300 s skew, `current`/`next` key id, `timingSafeEqual`, canonical string with full path + sorted query + body SHA-256) and `signRequest()` for the outbound/harness side; returns typed error codes matching the contract table.
- [ ] `src/lib/stackshift-support/rate-limit.ts`: Postgres counter per (site, minute) (upsert-increment RPC or single statement), 120/min default, returns `Retry-After`; fail-open with a logged warning if the table is missing (pre-migration safety).
- [ ] `src/lib/stackshift-support/audit.ts`: best-effort `recordAudit()` (never throws, never blocks the request).
- [ ] `src/lib/stackshift-support/sla.ts`: `computeDueAt(priority, from)` reading `support_sla_config` with an in-code default fallback.
- [ ] Pure-logic checks `_docs/task/444-stackshift-support-auth.check.ts` (signature valid/invalid, stale/future timestamp, rotation, canonicalisation with sorted query, rate-limit window maths, SLA fallback).

## Out of Scope / Must-Not-Change

- The existing StackShift → Zoho Desk → Hub flow is **not** disabled, removed, rescheduled or demoted (Desk polls/crons, `desk-ticket-poll`, helpdesk@ Desk email channel, task-441 duplicate flag stay as they are). Only task 450 may touch them, and only after the parity gate passes with the user's written sign-off.
- Duplicates between the direct path and the Desk-polled copy are **allowed and badged**, never auto-skipped or merged.
- Hub side only — no StackShift-app changes (a separate later project; see the hand-off spec).
- No git commands. Migrations are **written, not applied** by the agent.
- **No route handlers** (task 445). No outbox dispatcher (task 446). No UI. Do not apply the migration.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/169_stackshift_support_direct.sql` | Create | Columns, channel check, outbox/audit/rate-limit/SLA tables, RLS (written, not applied) |
| `src/types/database.ts` | Modify | New columns/tables |
| `src/lib/stackshift-support/auth.ts` | Create | Signature verify + sign |
| `src/lib/stackshift-support/rate-limit.ts` | Create | Per-site Postgres limiter |
| `src/lib/stackshift-support/audit.ts` | Create | Best-effort audit writer |
| `src/lib/stackshift-support/sla.ts` | Create | Priority → dueAt |
| `_docs/task/444-stackshift-support-auth.check.ts` | Create | Pure checks (npx tsx) |
| `env.example` | Modify | `STACKSHIFT_SUPPORT_SECRET[_NEXT]`, `STACKSHIFT_EVENTS_SECRET`, `STACKSHIFT_EVENTS_URL`, `STACKSHIFT_SUPPORT_NOTIFY_CUSTOMER` |

## Code Context

Copy the secret-check shape from `src/app/api/webhooks/stackshift-order/_secret.ts` (503 when unset, `timingSafeEqual`). Migration pattern for the channel constraint: `supabase/migrations/148_stackshift_desk_ticket_poll.sql` (drop `inbox_channel_check`, re-add with the extra value). RLS helper functions: `get_my_role()` (migration 026) — never inline role logic. Latest migration on disk is `168_timer_breaks.sql`. Pure-check convention: `_docs/task/439-timer-logic.check.ts` run via `npx tsx`.

## Implementation Steps

1. Write migration 169 + rollback notes; update `database.ts`.
2. Implement auth (+ checks first, TDD), rate-limit, audit, SLA modules.
3. Add env vars to `env.example`.
4. Run checks, `tsc`, eslint; record the SQL for the operator to apply.

## Acceptance Criteria

- [ ] Migration reviewed, idempotent where practical, not applied; types compile.
- [ ] `verifySignedRequest` passes every case in the check file, including rotation and canonical-path/query ordering.
- [ ] Missing secret ⇒ 503 path covered; pre-migration rate-limit/audit failures never throw.
- [ ] No secrets in code; env vars documented.

## Verification

```bash
npx tsc --noEmit
pnpm lint
npx tsx _docs/task/444-stackshift-support-auth.check.ts
```

## Compatibility Touchpoints

`database.ts`, `env.example`, a new migration (operator applies). CLAUDE.md note added with task 445.


## Implementation Notes

### What Changed
- Migration 169 written (not applied): inbox/inbox_messages columns, `stackshift` channel, `stackshift_outbox`, `stackshift_support_audit`, `stackshift_rate_limit` + atomic `stackshift_rate_limit_hit()` RPC, `support_sla_config` (seeded), RLS via `get_my_role()`.
- `src/lib/stackshift-support/`: pure `auth-logic.ts` / `rate-limit-logic.ts` / `sla-logic.ts` (testable under plain tsx) plus thin wrappers `auth.ts` (`verifySignedRequest`), `rate-limit.ts` (fail-open), `audit.ts` (never throws), `sla.ts` (default fallback).
- `database.ts` and `env.example` updated.

### Deviations From Plan
- SLA/inbox priority key is `critical` (matches `inbox.priority`), not `urgent` as the task text said.
- `stackshift_outbox.sequence` is a global identity (monotonic, so ordered per ticket) rather than a per-ticket counter; task 446 can order by (ticket_id, sequence).
- `inbox.external_ref` / `inbox_messages.external_ref` use partial unique indexes (non-null only) instead of a column-level `unique`.
- Pure logic split into `*-logic.ts` files so checks don't import the service-role client.

### Verification Run
- `npx tsx _docs/task/444-stackshift-support-auth.check.ts` - PASS
- `npx tsc --noEmit` - PASS
- eslint on `src/lib/stackshift-support` - PASS
- Migration 169 - NOT APPLIED (operator).
