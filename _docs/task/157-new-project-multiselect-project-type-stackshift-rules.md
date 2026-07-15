# 157: New Project — Multi-Select Project Type with StackShift Combination Rules

**Created:** 2026-07-15
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep

**Status:** Planned — contains open design questions the user should confirm before
implementation starts (see "Design Decisions Needing Confirmation" below). Do not begin
implementation until these are resolved; treat this doc as a proposal, not a final spec.

---

## Overview

The "Project details" step (step 2) of the New Project wizard currently lets a PM/marketing user
pick exactly **one** classification (`CLASSIFICATIONS`: `StackShift I | StackShift II | StackShift
Access | StackShift Access Plus | PipelineForge | Discrete Development`) via single-select
`ClassificationCard`s (`_content.tsx:735-739`, `classification: Classification` state). The user
wants **multi-select** with a validation rule: **at most one StackShift variant** may be selected
at a time, but it can be paired with PipelineForge and/or Discrete Development. Concretely, valid
selections are:

- A single classification alone (existing behavior — must remain valid for backward compatibility;
  every existing project has exactly one).
- Any one StackShift variant + PipelineForge.
- Any one StackShift variant + Discrete Development.
- Any one StackShift variant + PipelineForge + Discrete Development.
- PipelineForge + Discrete Development (no StackShift).

Invalid: any combination containing **two or more StackShift variants** (e.g. "StackShift I" +
"StackShift II").

This reduces to one rule: **selected StackShift-variant count ≤ 1; everything else is free.** This
is the derivation used throughout this doc — flagging it explicitly since the user's five-item
list didn't literally spell out "single selection alone is still valid," but backward
compatibility requires it (see Design Decisions below).

Today, exactly one `classification` (`Classification`, a plain string) is stored per project via a
1:1 `customer_products` row (`projects.customer_product_id` FK), and two pure functions derive
everything else from it: `deriveProductName` (→ `"StackShift" | "PipelineForge"`, used for
`customer_products.product_name`) and `deriveProjectType` (→ `"Content Site" | "Custom App"`, used
for `projects.project_type`). Both take a single `Classification` and cannot represent a
multi-value selection as-is — this task has to widen the data model, not just the picker UI.

## Design Decisions Needing Confirmation

These are genuine open questions this task doc can't safely resolve unilaterally — confirm with
the user before implementation:

1. **Storage shape.** Proposed: add a new `customer_products.classifications text[] not null
   default '{}'` array column (migration) alongside the existing `classification text | null`
   column. New writes populate **both** — `classifications` gets the full selected array;
   `classification` (kept for backward-compatible reads by every existing query/UI that expects a
   single value — e.g. the Onboarding list's badge, `GET /api/onboarding/projects`'s
   `classification` field) gets the selected StackShift variant if one was chosen, else the first
   selected item. Existing rows get a one-time backfill (`classifications = ARRAY[classification]`
   where not null). Alternative considered and rejected: a separate join table
   (`project_classifications`) — more normalized, but every read site in this codebase already
   expects a single scalar `classification` string, so a parallel array column is far less
   invasive than rewiring every join.
2. **`deriveProductName` for multi-select, and a pre-existing quirk.** Today `deriveProductName`
   maps `"Discrete Development"` → `"StackShift"` (i.e. `classification === "PipelineForge" ?
   "PipelineForge" : "StackShift"` — anything non-PipelineForge falls through to StackShift, which
   is arguably already a mislabel for Discrete Development-only projects, but that's pre-existing
   behavior, not something this task is asked to fix). For multi-select, proposed
   `deriveProductNames(classifications): ("StackShift" | "PipelineForge")[]` — returns
   `["StackShift"]` if any StackShift variant is present, adds `"PipelineForge"` if present, and
   drops Discrete-Development-only selections into the same StackShift fallback as today (kept
   for parity, flagged here rather than silently changed). **Confirm**: should Discrete
   Development finally get its own product name once it can appear without StackShift (e.g. the
   "PipelineForge + Discrete Development" combo), or is preserving today's fallback fine?
3. **`project_type` for multi-select.** `projects.project_type` is a single enum column
   (`Content Site | Ecommerce (B2C) | Ecommerce (B2B) | Custom App`, per CLAUDE.md). Proposed:
   `deriveProjectType(classifications)` returns `"Custom App"` if `"Discrete Development"` is in
   the set, else `"Content Site"` (same rule as today, now checking array membership instead of
   equality). **Confirm**: is "Custom App wins" the right precedence when Discrete Development is
   combined with a StackShift/PipelineForge classification, or should mixed combos get a different
   label?
4. **Onboarding phases — biggest open question.** The task request says this "will probably affect
   ... the onboarding phases." Today `PROGRAMME_PHASES` (`customer-phases.ts`) is **explicitly
   documented as identical for every project** ("Identical for every project; only per-project
   *state* ... lives in the database") — no project has ever varied its phase/deliverable content
   by classification. Making phase content vary by the selected classification combination (e.g.
   skipping StackShift-specific migration/rebrand deliverables for a Discrete-Development-only
   project) would be a materially larger architectural change than the picker/validation/storage
   work above — it touches the static config's core invariant, the seed route
   (`programme/start`), and every phase-rendering call site. **Recommended scope split**: this
   task implements the multi-select picker, validation, storage, and name/type derivation only;
   varying phase content by classification is deferred to its own follow-up task once this lands
   and the user has had a chance to specify exactly which phases/deliverables should change for
   which combinations. Flagging this clearly rather than guessing at a phase-variation scheme.

## Requirements

- [ ] `ClassificationCard`s in step 2 become multi-select (toggle on/off, not radio) — clicking a
      selected card deselects it; clicking an unselected StackShift card while another StackShift
      card is already selected **swaps** the selection (deselects the old one, selects the new
      one) rather than blocking the click, since "at most one StackShift" is naturally expressed as
      a swap, not a hard block. Non-StackShift cards (PipelineForge, Discrete Development) simply
      toggle independently.
- [ ] At least one classification must be selected to advance from step 2 (mirrors today's
      implicit single-selection requirement — `classification` defaulted to `CLASSIFICATIONS[0]`
      so it was never actually empty before; multi-select needs an explicit empty-selection guard).
- [ ] Project name auto-generation (`deriveProjectSuffix`) becomes multi-aware: `"App"` suffix if
      Discrete Development is selected, else `"Website"` — same rule, now checking `.includes()`
      against the array.
- [ ] `POST /api/onboarding/projects` accepts `classifications: Classification[]` (replacing the
      single `classification: Classification` field in the request body — see Compatibility
      Touchpoints for the exact contract change) and validates every entry is a known
      `Classification` plus the "≤1 StackShift" rule server-side (never trust client-side
      validation alone for a data-integrity rule).
- [ ] `customer_products` insert writes both `classifications` (full array) and `classification`
      (single fallback value, see Design Decision 1) per the resolved storage shape.
- [ ] `GET /api/onboarding/projects` (list page data) continues to work unchanged by reading the
      existing single `classification` column — no list-page UI changes required by this task.
- [ ] Review step (step 3) shows all selected classifications (e.g. as a comma-separated list or
      small chip row — match existing `ReviewRow` styling), not just one.

## Out of Scope / Must-Not-Change

- **Do not vary `PROGRAMME_PHASES` content by classification** — see Design Decision 4. This task
  only changes what gets selected and stored at intake.
- Do not change the Onboarding list page's classification badge/display logic — it keeps reading
  the single `classification` column, which this task keeps populated for compatibility.
- Do not touch the v1 (`(public)/onboarding/[customerId]`) form-engine's `product_name`-keyed
  `SCHEMAS` map (`onboarding-schemas.ts`) — that's a fully separate, older onboarding system this
  task's `customer_products.product_name` change does not intentionally target. Verify it isn't
  broken by the `deriveProductNames` change as a side effect, since `product_name` is a shared
  column.
- Do not change `CLASSIFICATIONS` itself (the 6 allowed values) — only how many can be selected
  and how they combine.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/075_customer_products_classifications_array.sql` | Create | Add `classifications text[] not null default '{}'`, backfill from `classification` |
| `src/types/database.ts` | Modify | Add `classifications: string[]` to `customer_products` Row/Insert/Update |
| `src/config/customer-phases.ts` | Modify | `deriveProductNames(classifications[])`, `deriveProjectType(classifications[])`, `deriveProjectSuffix(classifications[])` — multi-aware versions; add `isValidClassificationCombo(classifications[])` |
| `src/app/v2/(hub)/onboarding/new/_content.tsx` | Modify | Multi-select `ClassificationCard`s, swap-on-StackShift-conflict logic, review step chip list |
| `src/app/api/onboarding/projects/route.ts` | Modify | Accept `classifications: Classification[]`, validate combo rule, write both columns |

## Code Context

### Current single-value derivation (`customer-phases.ts:194-204`)

```ts
export function deriveProductName(classification: Classification): "StackShift" | "PipelineForge" {
  return classification === "PipelineForge" ? "PipelineForge" : "StackShift";
}
export function deriveProjectSuffix(classification: Classification): "Website" | "App" {
  return classification === "Discrete Development" ? "App" : "Website";
}
export function deriveProjectType(classification: Classification): "Content Site" | "Custom App" {
  return classification === "Discrete Development" ? "Custom App" : "Content Site";
}
```

Proposed multi-aware additions (keep the single-value functions too — do not delete, other code
may still call them; grep for call sites before removing anything):

```ts
const STACKSHIFT_VARIANTS: Classification[] = ["StackShift I", "StackShift II", "StackShift Access", "StackShift Access Plus"];

export function isValidClassificationCombo(selected: Classification[]): boolean {
  if (selected.length === 0) return false;
  return selected.filter((c) => STACKSHIFT_VARIANTS.includes(c)).length <= 1;
}
export function deriveProjectSuffixMulti(selected: Classification[]): "Website" | "App" {
  return selected.includes("Discrete Development") ? "App" : "Website";
}
export function deriveProjectTypeMulti(selected: Classification[]): "Content Site" | "Custom App" {
  return selected.includes("Discrete Development") ? "Custom App" : "Content Site";
}
```

### Current single-select card grid (`_content.tsx:735-739`)

```tsx
<div className="mb-6 grid grid-cols-2 gap-3">
  {CLASSIFICATIONS.map((c) => (
    <ClassificationCard key={c} classification={c} selected={classification === c} onSelect={() => setClassification(c)} />
  ))}
</div>
```

Becomes (state changes from `useState<Classification>` to `useState<Classification[]>`, click
handler implements swap-on-StackShift-conflict):

```tsx
const [classifications, setClassifications] = useState<Classification[]>([]);

function toggleClassification(c: Classification) {
  setClassifications((prev) => {
    if (prev.includes(c)) return prev.filter((x) => x !== c);
    if (STACKSHIFT_VARIANTS.includes(c)) {
      // swap: drop any other StackShift variant, keep everything else
      return [...prev.filter((x) => !STACKSHIFT_VARIANTS.includes(x)), c];
    }
    return [...prev, c];
  });
}
```

`ClassificationCard`'s `selected` prop becomes `classifications.includes(c)`; `onSelect` becomes
`() => toggleClassification(c)`.

### `POST /api/onboarding/projects` body/validation (`route.ts:144-175, 227-250`) — current

```ts
type NewProjectBody = {
  ...
  classification: Classification;
  ...
};
...
if (!CLASSIFICATIONS.includes(body.classification)) {
  return NextResponse.json({ error: "Invalid classification" }, { status: 400 });
}
...
const productName = deriveProductName(body.classification);
const { data: product } = await supabase.from("customer_products").insert({
  ...
  classification: body.classification,
  ...
```

Becomes: `classifications: Classification[]` in the body type; validate every entry is in
`CLASSIFICATIONS` **and** `isValidClassificationCombo(body.classifications)`; insert both columns:

```ts
if (!Array.isArray(body.classifications) || body.classifications.length === 0
    || !body.classifications.every((c) => CLASSIFICATIONS.includes(c))
    || !isValidClassificationCombo(body.classifications)) {
  return NextResponse.json({ error: "Invalid classification combination" }, { status: 400 });
}
...
const productNames = deriveProductNamesMulti(body.classifications); // see Design Decision 2
const primaryClassification = body.classifications.find((c) => STACKSHIFT_VARIANTS.includes(c)) ?? body.classifications[0];
// insert: classification: primaryClassification, classifications: body.classifications, product_name: productNames[0] (or joined — resolve per Design Decision 2)
```

## Implementation Steps

1. **Confirm the Design Decisions above with the user before writing any code.**
2. Write migration `075_customer_products_classifications_array.sql` (array column + backfill).
3. Add `classifications` to `customer_products` types in `database.ts`.
4. Add `isValidClassificationCombo`/multi-aware derive functions to `customer-phases.ts`.
5. Convert `_content.tsx`'s classification state to an array; implement `toggleClassification`
   with the StackShift-swap rule; update the card grid's `selected`/`onSelect` wiring.
6. Update `goNext()`'s step-2 guard to require `classifications.length > 0`.
7. Update project-name auto-generation to use `deriveProjectSuffixMulti`.
8. Update the step-3 review row to render the full selected list.
9. Update `POST /api/onboarding/projects`: body type, validation, `customer_products` insert
   (both columns), `projects.project_type` via `deriveProjectTypeMulti`.
10. Grep the codebase for every other read of `customer_products.classification`/`product_name`
    (list page, any admin views) to confirm none silently break from the new derivation — fix or
    flag anything found.

## Acceptance Criteria

- [ ] Selecting "StackShift I" then "StackShift II" results in only "StackShift II" staying
      selected (swap, not both).
- [ ] Selecting "StackShift I" + "PipelineForge" + "Discrete Development" together is accepted and
      submits successfully.
- [ ] Selecting "PipelineForge" + "Discrete Development" alone (no StackShift) is accepted.
- [ ] Attempting to submit with zero classifications selected is blocked client-side.
- [ ] The server rejects a request with two StackShift variants in `classifications` (test via
      direct API call, bypassing the client-side swap) with a 400.
- [ ] An existing single-classification project (created before this migration) still displays its
      classification correctly on the Onboarding list page.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser: create a project selecting a StackShift+PipelineForge+DiscreteDev combo, confirm
project name suffix is "App"; create another with PipelineForge+DiscreteDev only; attempt a
StackShift+StackShift combo via direct `fetch` to the API to confirm server-side rejection.
Confirm an existing pre-migration project's classification badge is unaffected on the Onboarding
list.

## Compatibility Touchpoints

- **New migration required** — `075_customer_products_classifications_array.sql`; user applies it
  before this ships.
- **Breaking API contract change**: `POST /api/onboarding/projects`'s `classification` field is
  replaced by `classifications` (array). Since this is an internal-only endpoint called solely by
  `_content.tsx` (no external consumers), both are updated together in the same task — no
  versioning/back-compat shim needed.
- Does not affect Sanity, GitHub, or Zoho integration surfaces.
