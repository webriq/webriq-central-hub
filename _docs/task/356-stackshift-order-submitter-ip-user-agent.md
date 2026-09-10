# 356: StackShift Order Form — Capture Submitter IP + User-Agent

**Created:** 2026-09-10
**Priority:** LOW
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Record the IP address and browser user-agent of the person who submits the StackShift
Order Form, for later audit / abuse review.

The Hub webhook (`POST /api/webhooks/stackshift-order`) is called **server-to-server by the
webriq.com proxy**, never by the browser — so its own request headers carry the proxy /
Vercel IP and a server `fetch` user-agent, not the submitter's. The real values must be
forwarded by the webriq.com proxy in the JSON payload; the Hub stores what it receives.

Stored in two dedicated `text` columns. No review-UI surfacing in this task.

## Requirements

- [ ] `orderIntakeSchema` accepts optional `submitterIp` (`string`, ≤64) and
      `submitterUserAgent` (`string`, ≤1024), both `.optional().nullable()`.
- [ ] Migration 136 adds `stackshift_orders.submitter_ip text` +
      `submitter_user_agent text` (nullable). **Written, not applied** by the agent
      (StackShift-migration convention — tasks 130 / 133 / 134 / 135).
- [ ] The webhook stores them via a **best-effort post-insert `update`**, separate from the
      main insert and separate from the existing `contact_risk` update, so a
      pre-migration-136 DB never fails the relay. `raw_payload` carries them regardless.
- [ ] `src/types/database.ts` — `submitter_ip` / `submitter_user_agent` (`string | null`)
      added to the `stackshift_orders` Row / Insert / Update.
- [ ] `CLAUDE.md` — `stackshift_orders` bullet extended.
- [ ] Task doc appendix documents the two new optional payload fields for the webriq.com
      proxy contract.

## Out of Scope / Must-Not-Change

- **No review-UI display** — the values are stored/queryable only. (Deliberate choice.)
- **No `inet` column type** — `text` only; a malformed value must never fail the insert and
  lose a submission.
- **No geo-IP / ASN / device-parsing enrichment.**
- **No webriq.com code** — separate repo. This task only widens the Hub's accepted payload
  and documents the contract; updating the proxy to actually send the fields is a separate
  webriq.com change.
- **The main `.insert()` call** — do not add the new columns to it (pre-migration safety);
  they go in a best-effort follow-up `update` only, mirroring `contact_risk` (task 353).
- **The existing `contact_risk` best-effort block** — leave it as its own `update`; add a
  sibling block, do not merge (each must degrade independently during the migration window).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/stackshift-orders/schema.ts` | Modify | Add `submitterIp` / `submitterUserAgent` to `orderIntakeSchema` |
| `supabase/migrations/136_stackshift_orders_submitter_meta.sql` | Create | Two nullable `text` columns — written, NOT applied |
| `src/app/api/webhooks/stackshift-order/route.ts` | Modify | Best-effort post-insert `update` storing the two fields |
| `src/types/database.ts` | Modify | Type the two columns on `stackshift_orders` |
| `CLAUDE.md` | Modify | Extend the `stackshift_orders` bullet |

## Code Context

### File: `src/lib/stackshift-orders/schema.ts` (end of `orderIntakeSchema`)

```ts
  // Task 353 — highest riskLevel the webriq.com proxy got back from POST /api/public/validate
  contactRisk: z.enum(["low", "medium", "high"]).optional().nullable(),
  // Task 356 — submitter request metadata, forwarded by the webriq.com proxy (the Hub sees
  // only the proxy). Both optional; absent = the proxy didn't send them.
  submitterIp: z.string().max(64).optional().nullable(),
  submitterUserAgent: z.string().max(1024).optional().nullable(),
});
```

Zod strips unknown keys by default, so a field must be in the schema to reach `p` and thus
`raw_payload`.

### File: `src/app/api/webhooks/stackshift-order/route.ts` (after the `contact_risk` block, ~L101)

```ts
  // Task 353 — surface the contact-validation flag ... (unchanged)
  if (p.contactRisk && p.contactRisk !== "low") {
    const { error: riskErr } = await adminClient
      .from("stackshift_orders")
      .update({ contact_risk: p.contactRisk })
      .eq("id", order.id);
    if (riskErr) console.warn("[stackshift-order] contact_risk not stored:", riskErr.message);
  }

  // Task 356 — submitter IP / user-agent (proxy-forwarded). Best-effort, separate update so
  // a pre-migration-136 DB (no columns) never fails the relay — raw_payload carries them.
  if (p.submitterIp || p.submitterUserAgent) {
    const { error: metaErr } = await adminClient
      .from("stackshift_orders")
      .update({
        submitter_ip: p.submitterIp ?? null,
        submitter_user_agent: p.submitterUserAgent ?? null,
      })
      .eq("id", order.id);
    if (metaErr) console.warn("[stackshift-order] submitter meta not stored:", metaErr.message);
  }
```

### File: `src/types/database.ts` (`stackshift_orders`, next to `contact_risk`)

Row: `submitter_ip: string | null;` / `submitter_user_agent: string | null;`
Insert & Update: `submitter_ip?: string | null;` / `submitter_user_agent?: string | null;`

### File: `supabase/migrations/135_stackshift_orders_customer_notification.sql` (style reference for 136)

Mirror the header-comment style; end with the `alter table` statement.

## Implementation Steps

1. `supabase/migrations/136_stackshift_orders_submitter_meta.sql` — two nullable `text`
   columns (do not apply).
2. `orderIntakeSchema` — add the two optional fields after `contactRisk`.
3. `database.ts` — add the two columns to the three `stackshift_orders` shapes.
4. `route.ts` — add the best-effort `update` block after the `contact_risk` block.
5. `CLAUDE.md` — extend the `stackshift_orders` bullet (submitter meta, migration 136).
6. `npx tsc --noEmit` + `pnpm lint`.

## Acceptance Criteria

- [ ] A payload including `submitterIp` / `submitterUserAgent` results in those values on
      the `stackshift_orders` row (post-migration) and always in `raw_payload`.
- [ ] A payload **without** them succeeds unchanged; columns stay null.
- [ ] With migration 136 not yet applied, the webhook still returns `201` and the submission
      is recorded (the `update` logs a warning and is swallowed).
- [ ] Unknown/extra keys in the payload are still stripped (no `.passthrough()` added).
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Live intake curl + migration 136 apply — deferred (needs secret/MAIL env + Supabase apply;
same posture as tasks 347 / 353 / 354).

## Compatibility Touchpoints

- **Migration 136** — written, not applied. The webhook works without it (best-effort
  `update` is swallowed); the columns are needed for the values to actually persist.
- **webriq.com proxy** — must be updated separately to send the fields. Contract below.
- **No new env vars, no new dependencies.**
- **CLAUDE.md** — `stackshift_orders` bullet updated.

## Appendix — webriq.com proxy contract addition

The proxy's `POST /api/webhooks/stackshift-order` JSON body gains two **optional** fields:

| Field | Type | Source |
|-------|------|--------|
| `submitterIp` | string (≤64) | The end user's client IP — the first hop of `x-forwarded-for` on the original browser request, or the hosting platform's equivalent (`request.ip`). Send a single address, not the full chain. |
| `submitterUserAgent` | string (≤1024) | The `user-agent` header of the original browser request. |

Both optional — omit (or send `null`) if unavailable. The Hub stores `null` when absent and
never rejects a submission over a missing or malformed value.

## Implementation Notes

### What Changed
- `orderIntakeSchema` (`src/lib/stackshift-orders/schema.ts`) — added `submitterIp`
  (`z.string().max(64).optional().nullable()`) and `submitterUserAgent`
  (`z.string().max(1024).optional().nullable()`) after `contactRisk`. Since zod strips
  unknown keys, this is also what lets the values reach `p` → `raw_payload`.
- `supabase/migrations/136_stackshift_orders_submitter_meta.sql` — `add column submitter_ip
  text, add column submitter_user_agent text`. **Written, not applied.**
- `src/app/api/webhooks/stackshift-order/route.ts` — new best-effort `update` block right
  after the `contact_risk` block (kept separate, per plan): runs only when at least one
  field is present, catches + `console.warn`s on error (pre-migration column gap), never
  touches the main insert or the `201`.
- `src/types/database.ts` — `submitter_ip` / `submitter_user_agent` (`string | null` on Row,
  `?: string | null` on Insert/Update) next to `contact_risk` on `stackshift_orders`.
- `CLAUDE.md` — `stackshift_orders` bullet extended.

### Files Changed
- `src/lib/stackshift-orders/schema.ts` - accept the two optional payload fields
- `supabase/migrations/136_stackshift_orders_submitter_meta.sql` - new columns (not applied)
- `src/app/api/webhooks/stackshift-order/route.ts` - best-effort store
- `src/types/database.ts` - type the columns
- `CLAUDE.md` - bullet update

### Deviations From Plan
- **Task renumbered 355 → 356.** An unrelated task 355 (visible scrollbars / time-log
  modal) landed on disk from a parallel session mid-write; this task took the next free
  number. Doc file, `# 356:` heading, in-doc `Task 356` comments, and the TASKS.md row all
  updated. No other change.

### Verification Run
- `npx tsc --noEmit` - PASS (exit 0)
- `pnpm lint` - PASS (0 errors; 2 pre-existing unrelated warnings in `_checklist-tab.tsx`)
- Live intake curl + migration 136 apply - SKIPPED (needs secret/MAIL env + Supabase apply;
  same posture as tasks 347/353/354)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. `git diff HEAD` = exactly the 5 planned files (schema.ts,
  database.ts, route.ts, CLAUDE.md + new migration 136 + new task doc). Task 354's work is
  already committed (`b97ba73`), so the diff is a clean 356-only boundary.
- `route.ts` block: guard-claused (`if (p.submitterIp || p.submitterUserAgent)`),
  best-effort `update` with `console.warn` on error, never touches the main insert or the
  `201`. A byte-for-byte mirror of the adjacent `contact_risk` block (task 353) — kept as a
  separate `update` per the plan so each field group degrades independently pre-migration.
- Schema: `submitterIp` ≤64 / `submitterUserAgent` ≤1024, both `.optional().nullable()`,
  same style as the `contactRisk` line above. No `.strict()`/`.passthrough()` added —
  unknown keys still stripped (acceptance criterion holds).
- Types: `p.submitterIp` is `string | null | undefined` (zod infer); `?? null` normalizes
  to the `string | null` Update shape. `replace_all` correctly updated both the identical
  Insert and Update blocks.
- Migration: `text` not `inet` (documented rationale — a malformed value must never fail the
  insert); header comment matches the 134/135 convention; written-not-applied noted.
- Logging is `console.warn` for a real operational degradation (missing column during the
  migration window), identical to the sibling block — not debug noise. No secrets, no
  `any`, no dead code.

### Deviations
- **Minor (external cause)** — task renumbered 355 → 356: an unrelated task 355 (visible
  scrollbars) landed on disk from a parallel session during the write. Doc filename,
  `# 356:` heading, two in-doc `Task 356` comment strings, and the TASKS.md row all updated;
  no functional change.

### Required Fixes
- None.

---

## Completion (2026-09-10)

**Marked complete at the user's explicit request.** Code + quality gate done; outstanding
items are operator / deploy / cross-repo steps:

- Migration `136_stackshift_orders_submitter_meta.sql` applied via `supabase db push` (the
  webhook records submissions without it — the values just aren't persisted to the two
  columns, only to `raw_payload`, until it lands).
- Hub redeploy.
- **webriq.com** — the proxy must be updated to read `x-forwarded-for` (first hop) +
  `user-agent` from the browser request and include `submitterIp` / `submitterUserAgent`
  in the relayed payload. Standalone prompt handed off; the user confirmed the rest of the
  webriq.com proxy is already implemented, so this is the only remaining webriq.com work
  for this task.
- Live acceptance: submit behind the production CDN → confirm both columns populate.
