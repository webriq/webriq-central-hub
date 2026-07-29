# 195: New Project Form — Duplicate Project Creation on Resubmit (No Server-Side Duplicate-Name Guard)

**Created:** 2026-07-29
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Reported symptom: after submitting the "New Project" form (`/v2/portfolio-tracker/new`) for **M&I Interiors**, the Portfolio Tracker shows **three** "M&I Interiors Website" cards for the same customer/classification (StackShift I) — one "In progress" (Day 2/120, already started), two "Draft" ("Awaiting kickoff").

**Root cause: the only defense against duplicate project names lives entirely on the client, runs exactly once (at a step transition, not at submission), and has no server-side or database-level backstop.**

1. Uniqueness is only ever checked by `GET /api/onboarding/projects/check-name` (`src/app/api/onboarding/projects/check-name/route.ts:17-22`) — a case-insensitive `ilike` match on `projects.name`.
2. The wizard (`src/app/v2/(hub)/portfolio-tracker/new/_content.tsx`) calls that check **once**, inside `goNext()` at the Step 2 → Step 3 transition (`_content.tsx:651-661`). Once the user reaches Step 3 (Review & Create), the name is never re-validated.
3. The actual creation endpoint, `POST /api/onboarding/projects` (`src/app/api/onboarding/projects/route.ts:177-340`), performs **zero** duplicate/name checks before inserting into `customer_products` (line 273-285) and `projects` (line 291-304). Any number of POSTs with an identical `project_name` + `customer` succeed unconditionally, each creating a brand-new `customer_products` row and `projects` row.
4. There is no database constraint to fall back on either — `projects_project_id_key` (migration 066/088) is unique only on the auto-generated display code (`project_id`), never on `name`. Confirmed via `grep -i unique supabase/migrations/*.sql` — no unique index touches `projects.name`.
5. On the client, the only re-entrancy guard on the Step-3 action buttons ("Just save" / "Save + set schedule" / "Start Phase N Now") is the React `submitting` state driving `disabled={!!submitting}` (`_content.tsx:1101,1121,1142,1188,1202,1224`). This is a **UI-only, best-effort** guard: it does nothing to stop a second POST that originates from a page reload, a second tab, a retried request after a slow/ambiguous response, or the user navigating back to Step 2 and forward to Step 3 again without changing the name — all of which reach the same unguarded `POST /api/onboarding/projects`.

This combination — a check that fires once, long before the moment that matters, plus zero enforcement at the point of insertion — is a classic check-then-act (TOCTOU) gap.

**What's confirmed vs. not:** `POST /api/onboarding/projects` performs exactly one `.insert()` into `projects` per invocation (`route.ts:291-304`) — there is no loop, no recursive call, and no DB trigger on `projects` that duplicates the row (`generate_project_id`, migration 088, only assigns the display code on the single inserted row; `seedAndStartProgramme`, only reachable via `mode: "start"`, never touches `projects` at all — see `src/lib/programme/seed.ts`). So three "M&I Interiors Website" draft rows necessarily means **three separate POST requests** reached this endpoint.

**Confirmed via `select * from projects where customer_id = 'WRQ-CUST-D0A5D523'`:**

| `project_id` | `name` | `created_at` | `created_by` | `programme_started_at` |
|---|---|---|---|---|
| `D0A5D523-PROJ-01` | "M&I Interiors" | 2026-06-25 08:22:51 | `null` | `null` |
| `D0A5D523-PROJ-02` | "M&I Interiors Website" | 2026-07-28 12:38:07.413633 | `d996c735-489e-4a4b-a0ee-000cb0a4154c` | `null` |
| `D0A5D523-PROJ-03` | "M&I Interiors Website" | 2026-07-28 12:38:16.751162 | `d996c735-489e-4a4b-a0ee-000cb0a4154c` | `null` |
| `D0A5D523-PROJ-04` | "M&I Interiors Website" | 2026-07-28 12:38:31.35844 | `d996c735-489e-4a4b-a0ee-000cb0a4154c` | 2026-07-28 12:38:31.4 |

`PROJ-01` is a separate, unrelated, pre-existing record — a different name ("M&I Interiors", no "Website" suffix), `external_project_id` set and `source_meta` populated with Zoho tags/status (i.e. Zoho-imported, not wizard-created), `created_by` null, and created 2026-06-25 — before `GET /api/onboarding/projects`'s `created_at >= 2026-07-06` cutoff (`route.ts:60`), so it never even appeared on the Portfolio Tracker screen in the reported screenshot. It is **not** one of the three duplicate cards and is not implicated by this bug.

`PROJ-02`, `PROJ-03`, `PROJ-04` are the three cards from the screenshot: identical name, identical `customer_id`, identical `created_by`, created **9 seconds and then 15 seconds apart** (12:38:07 → 12:38:16 → 12:38:31) — three distinct, human-paced submissions of the same intake within a ~24-second window, not a sub-second double-click race. `PROJ-04`'s `programme_started_at` (12:38:31.4) is essentially simultaneous with its own `created_at` (12:38:31.35844), confirming that row was created *already started* — i.e. its submission used `mode: "start"` ("Start Phase 1 Now") directly, not saved as a draft and started as a separate later action. The confirmed sequence is therefore: two "Just save" submissions producing draft duplicates (`PROJ-02`, `PROJ-03`), followed by a third submission via "Start Phase 1 Now" (`PROJ-04`) — all under 30 seconds apart, all from the same user, all succeeding independently because nothing in the stack rejected the repeat name.

What's fully confirmed is that the app had **no protection against this** at any layer — no synchronous client-side lock, no server-side duplicate check, no DB constraint — so every one of those three requests succeeded and independently created a full duplicate project. The fix below closes the gap unconditionally, regardless of why a person resubmits within that window (impatience with a slow/ambiguous response, not noticing the first attempt succeeded, retrying after a hiccup, etc.).

## Requirements

- [ ] `POST /api/onboarding/projects` performs a case-insensitive duplicate-name check (same `ilike` semantics as `check-name`) before creating the `customer_products`/`projects` rows, and returns `409` with a clear error message if a project with that name already exists. This is the authoritative fix — it closes the gap regardless of how the duplicate request occurs (double click, retry, back-and-forth navigation, second tab).
- [ ] The wizard surfaces that `409` the same way it already surfaces other submit errors (existing `submitError` state / `<p>` in Step 3, `_content.tsx:1081`) — no new UI pattern needed, just confirm the existing catch block's `err.message` path reaches the user with the server's message intact.
- [ ] Harden the client-side re-entrancy guard so a rapid double-click/double-invoke on `submit()` / `startAtPhase()` can't fire two `fetch` calls before React re-renders `disabled`: check-and-set a synchronous ref (not just the `submitting` state) at the very top of both functions, before any `await`, and release it in the `finally` block alongside the existing `setSubmitting(null)`.
- [ ] No change to the existing Step 2 → Step 3 `check-name` pre-check — it stays as an early, fast UX hint; it just stops being the *only* line of defense.

## Out of Scope / Must-Not-Change

- Cleaning up the three existing duplicate "M&I Interiors Website" rows in the live database — that's a one-off manual data-fix, not a code change, and isn't part of this task.
- `POST /api/onboarding/projects/import` (bulk Zoho import route) — different entry point, not touched by this bug or this fix.
- Adding a DB-level unique constraint on `projects.name` — deliberately not pursued here: legitimate cases may want the same project name reused across different customers (name isn't globally meant to be unique in the schema's intent, only within the "don't accidentally resubmit the same intake" scenario this task addresses), and a hard DB constraint would need product sign-off on exact scope (per-customer? global?). The application-level check mirrors the existing `check-name` route's exact (global, case-insensitive) semantics so behavior stays consistent between the pre-check and the real guard.
- Any redesign of the wizard's steps, validation copy, or visual states — this is a correctness fix only.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/onboarding/projects/route.ts` | Modify | Add a duplicate-name guard inside `POST` before the `customer_products`/`projects` inserts; return `409` on match |
| `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` | Modify | Add a synchronous ref-based re-entrancy lock to `submit()` and `startAtPhase()`, in addition to the existing `submitting` state |

## Code Context

### File: `src/app/api/onboarding/projects/route.ts` (POST handler, lines ~200-291)

Current — no name check anywhere in `POST`; jumps straight from body validation into customer resolution and then unconditional inserts:
```ts
if (!body.project_name?.trim()) {
  return NextResponse.json({ error: "project_name is required" }, { status: 400 });
}
if (body.mode === "save_scheduled" && !body.scheduled_start_at) {
  return NextResponse.json({ error: "scheduled_start_at is required when mode is save_scheduled" }, { status: 400 });
}
// ... no duplicate-name check ...

// Resolve or create the customer.
let customerId: string;
```

Reference query to mirror, from `check-name/route.ts:17-22`:
```ts
const { data, error } = await supabase
  .from("projects")
  .select("id")
  .ilike("name", name)
  .limit(1)
  .maybeSingle();
```

### File: `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` (submit, lines 691-722)

Current — only the `submitting` state guards re-entry, set *inside* the async function after the click already fired:
```ts
async function submit(mode: "save" | "save_scheduled" | "start") {
  const isValid = /* ... */;
  if (!isValid) {
    setSubmitError("Company and project name are required.");
    return;
  }
  if (mode === "save_scheduled" && !scheduledAt) {
    setSubmitError("Pick a schedule date/time to Save + Set Schedule.");
    return;
  }
  setSubmitting(mode);
  setSubmitError(null);
  try {
    const res = await fetch("/api/onboarding/projects", { /* ... */ });
    ...
```

`startAtPhase()` (lines 730-783) has the identical shape/gap.

## Implementation Steps

1. In `src/app/api/onboarding/projects/route.ts`, after the existing body validation block (after the `scheduled_start_at` check, before "Resolve or create the customer"), add:
   ```ts
   const { data: existingProject, error: nameCheckError } = await supabase
     .from("projects")
     .select("id")
     .ilike("name", body.project_name.trim())
     .limit(1)
     .maybeSingle();
   if (nameCheckError) {
     console.error("POST /api/onboarding/projects name check error:", nameCheckError);
     return NextResponse.json({ error: "Failed to validate project name" }, { status: 500 });
   }
   if (existingProject) {
     return NextResponse.json({ error: "A project with this name already exists" }, { status: 409 });
   }
   ```
2. In `_content.tsx`, add a ref near the other refs (`debounceRef`): `const submitLockRef = useRef(false);`
3. At the top of `submit()`, immediately after the existing validity checks (before `setSubmitting(mode)`), add:
   ```ts
   if (submitLockRef.current) return;
   submitLockRef.current = true;
   ```
   and in the `finally` block (alongside `setSubmitting(null)`), add `submitLockRef.current = false;`.
4. Apply the same two additions to `startAtPhase()` — same lock guard at top, same release in its `finally`.
5. Confirm the existing `catch` blocks' `err.message` (from `throw new Error(d.error ?? "Failed to create project")`) surfaces the new "A project with this name already exists" text unchanged — no new error-handling path needed.

## Acceptance Criteria

- [ ] Submitting the New Project form twice in a row with an unchanged project name (e.g. rapid double-click on "Just save", or resubmitting after navigating Step 3 → Step 2 → Step 3 without editing the name) results in exactly **one** `projects` row — the second attempt shows the submit-error message ("A project with this name already exists") instead of creating a duplicate.
- [ ] A single, normal submission still succeeds exactly as before (new customer + new project, existing customer + new project, scheduled start, "Start Phase N Now" — all four paths still create their project on first submit).
- [ ] The pre-existing Step 2 → 3 `check-name` UX (blocking "Continue" with a duplicate name before reaching Review) is unchanged.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manually: open /v2/portfolio-tracker/new, fill Step 1/2, reach Step 3, click "Just save" twice quickly
#   (or click once, then Back to Step 2 and Continue again without changing the name, then submit again) —
#   confirm only one project is created and the second attempt shows the duplicate-name error.
# Manually: run one normal end-to-end submission per mode (Just save / Save + set schedule / Start Phase 1 Now)
#   to confirm no regression to legitimate single submissions.
```

## Compatibility Touchpoints

- None — internal API + client-only fix, no schema change, no packaging/docs impact. `POST /api/onboarding/projects` gains a new possible `409` response; no existing caller currently depends on the absence of a 409 from this route (the only caller is this wizard, which already has generic error handling for non-2xx responses).

## Implementation Notes

### What Changed
- `POST /api/onboarding/projects` now performs a case-insensitive duplicate-name check (`ilike` on `projects.name`, mirroring `check-name`'s exact query) immediately after body validation, before any customer/product/project insert. A match returns `409` with `"A project with this name already exists"`.
- Added a synchronous `submitLockRef` (in addition to the existing `submitting` state) to the wizard, checked-and-set at the top of both `submit()` and `startAtPhase()` before any `await`, and released in each function's `finally` block alongside `setSubmitting(null)`. A second invocation while the lock is held now returns immediately instead of firing another `fetch`.
- No changes were needed to error surfacing — the existing `catch` blocks already convert any non-2xx response's `d.error` into `submitError`, so the new 409 message flows through unchanged.

### Files Changed
- `src/app/api/onboarding/projects/route.ts` - added the duplicate-name guard block (name-check query + 409 response) between body validation and customer resolution.
- `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` - added `submitLockRef`; added lock check/set + release to `submit()` and `startAtPhase()`.

### Deviations From Plan
- None — implementation followed the task doc's Implementation Steps exactly.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual browser verification (double-submit, back-and-forth resubmission, and one normal end-to-end run per mode) - SKIPPED (deferred to the `test` stage per the implement→simplify→test chain; not run in this stage).

## Live Data Incident — WRQ-CUST-D0A5D523 Cleanup (2026-07-29)

The three duplicate cards from the original screenshot were traced to specific rows and resolved in the live database, ahead of/independent from the code fix landing. Recorded here so the history isn't lost if this comes up again.

**Confirmed rows for `customer_id = 'WRQ-CUST-D0A5D523'` before cleanup:**

| `project_id` | `name` | `created_at` | `created_by` | `programme_started_at` |
|---|---|---|---|---|
| `D0A5D523-PROJ-01` | "M&I Interiors" | 2026-06-25 08:22:51 | `null` | `null` |
| `D0A5D523-PROJ-02` | "M&I Interiors Website" | 2026-07-28 12:38:07.413633 | `d996c735-489e-4a4b-a0ee-000cb0a4154c` | `null` |
| `D0A5D523-PROJ-03` | "M&I Interiors Website" | 2026-07-28 12:38:16.751162 | `d996c735-489e-4a4b-a0ee-000cb0a4154c` | `null` |
| `D0A5D523-PROJ-04` | "M&I Interiors Website" | 2026-07-28 12:38:31.35844 | `d996c735-489e-4a4b-a0ee-000cb0a4154c` | 2026-07-28 12:38:31.4 |

- `PROJ-01` — a separate, pre-existing, unrelated record (Zoho-imported, different name, predates the Portfolio Tracker's `created_at >= 2026-07-06` cutoff). **Left untouched**, not part of this incident.
- `PROJ-02` and `PROJ-03` — the two "Draft" duplicate cards. **Deleted** (see below).
- `PROJ-04` — the "In progress" card, created already-started via `mode: "start"` ("Start Phase 1 Now"), the third of three same-name submissions 9s and 15s apart. **Kept as the canonical project**, `project_id` left as `PROJ-04` (not renumbered — see rationale below).

**Safety checks performed before deletion** (all read-only `SELECT`s, run by the user in the Supabase SQL editor):
- Every table with a `project_id` FK into `projects` (`tasks`, `time_logs`, `milestones`, `tasklists`, `issues`, `customer_phases`, `customer_deliverables`, `customer_assets`, `programme_notifications`, `onboarding_internal_deliverables`, `customer_asset_folders`, `phase_members`) — zero rows for either `PROJ-02` (`id: 0c1e1943-599c-448c-a14d-c101af3ce26a`) or `PROJ-03` (`id: 569c14e3-7bbe-4fbb-ab52-851d83a3ee03`).
- `project_members` — 1 row each (the creator's auto-added owner membership, `on delete cascade`) — expected, no orphan risk.
- Their dedicated `customer_products` rows (`613eec31-553c-4074-9cac-4be41740b279`, `d8c09ef5-3fa8-44bd-a268-1ae0a39dba0a`) — both `onboarding_complete: false`, untouched; the only FKs into `customer_products(id)` anywhere in the schema (`projects.customer_product_id`, `tickets.customer_product_id`) are `on delete set null`, never cascade, so deleting them carries no cascade risk either.
- Supabase Storage (`customer-assets` bucket, `{customer_id}/{project_uuid}/...` path convention) — no objects under either project's folder.

**Deletion performed:**
```sql
delete from projects
where id in ('0c1e1943-599c-448c-a14d-c101af3ce26a', '569c14e3-7bbe-4fbb-ab52-851d83a3ee03');

delete from customer_products
where id in ('613eec31-553c-4074-9cac-4be41740b279', 'd8c09ef5-3fa8-44bd-a268-1ae0a39dba0a');
```

**Decision — `PROJ-04` was *not* renumbered to `PROJ-02`:** considered and declined. Two reasons: (1) `project_id` is a live routing key for `/v2/portfolio-tracker/[projectId]` and `/v2/projects/[projectId]` (+ nested `/tasks/[taskId]`) — see `CLAUDE.md`'s routing-key exceptions — so changing it risks breaking any already-shared/bookmarked link to this project; (2) the generator (`generate_project_id()`, migration 088) deliberately derives the next number from the *max existing suffix*, not a row count, specifically so a deleted project's number is never reused (task 187) — manually reusing `02` here would work against that documented design and misrepresent this project's actual creation order (it was the 4th project created for this customer, not the 2nd). The resulting gap (`01`, then `04`) is intentional and left as-is; `WRQ-CUST-D0A5D523` now has exactly one active project going forward (`D0A5D523-PROJ-04`, "M&I Interiors Website").
