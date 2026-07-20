# 150: 120-Day Programme — Nav Rename, `project_id` Route Param, Wizard Step Routes

**Created:** 2026-07-14
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Completed (2026-07-17)

---

## Overview

Three related naming/routing gaps in the 120-day programme module
(`src/app/v2/(hub)/onboarding/`):

**(a) Nav label / page title.** The sidebar tab reads "Onboarding"
(`v2-hub-sidebar.tsx:38`, `href: V2_ROUTES.ONBOARDING = "/v2/onboarding"`) and neither the
list page (`onboarding/page.tsx`) nor the detail page (`onboarding/[projectId]/page.tsx`)
exports `metadata` — both fall back to the root `<title>WebriQ Central Hub</title>`
(`src/app/v2/layout.tsx:10-11`). "Onboarding" describes only Phase 1 (Days 1-15); this page
and its detail view track the full 5-phase, 120-day programme.

**(b) UUID vs. `project_id` in the URL.** `onboarding/[projectId]/page.tsx:30-34` queries
`.eq("id", projectId)` — the dynamic segment holds the routing-key UUID, exactly per
CLAUDE.md's documented convention ("the UUID `id` column remains the routing key in every
URL/route param, unchanged," established under task 142/migration 066). This task is a
**deliberate, scoped exception** to that convention for this one route: the request is to
show the human-readable `project_id` (format `<last4ofcustomerId>-PROJ-<4randomchars>`,
unique, migration 066) in the URL instead. There is also a pre-existing **naming collision**
to fix as part of this: `_onboarding-list.tsx`'s `OnboardingProjectListItem.project_id` field
(line 11) is not the real `project_id` at all — `route.ts:79` populates it as `project_id:
p.id`, i.e. the UUID reusing the wrong name. The real `projects.project_id` column isn't even
selected by that route today (`route.ts:38-47`). Both must be fixed together or the new route
param would silently be fed the UUID under the human-readable name.

**(c) No wizard step routes.** The wizard (`_onboarding-wizard.tsx`) renders inline inside
`_onboarding-detail.tsx`, gated by local `wizardOpen`/`wizardStartStepKey` `useState`
(`_onboarding-detail.tsx:585`, `732-733`, `846`) — there is no URL segment for "wizard open"
or "which step." A hard refresh always remounts `_onboarding-detail.tsx` with those back at
their defaults, dropping the user onto the timeline root regardless of what they were doing.

## Requirements

### (a) Rename

- [ ] Sidebar label changes from "Onboarding" to **"Tracker"** — a shorter nav label than the
      full page title, per explicit user request; the underlying route/constant names still use
      "programme"/"onboarding" internal terminology (`customer-phases.ts` header, migration
      059's own title, etc.) — only the two user-facing display strings (sidebar label, page
      title) change.
- [ ] List page `<title>` becomes "Portfolio Tracker" (via `export const metadata`); detail
      page `<title>` becomes `"{companyName} — Portfolio Tracker"`.
- [ ] Route path changes from `/v2/onboarding` to **`/v2/programme`** (and
      `/v2/onboarding/new` → `/v2/programme/new`) — this also aligns the URL with the
      already-established API namespace (`/api/projects/[projectId]/programme/...`), which
      today confusingly sits under a different word than the page that calls it.
- [ ] `V2_ROUTES.ONBOARDING`/`V2_ROUTES.ONBOARDING_NEW` constants are renamed to
      `V2_ROUTES.PROGRAMME`/`V2_ROUTES.PROGRAMME_NEW` (values updated to the new paths) — every
      call site already goes through these constants (confirmed: no hardcoded
      `/v2/onboarding` string literals outside `constants.ts` itself), so this is a
      single-source-of-truth rename, not a repo-wide string find/replace.

### (b) `project_id` route param

- [ ] `onboarding/[projectId]/page.tsx`'s query becomes `.eq("project_id", projectId)`
      instead of `.eq("id", projectId)` — the URL segment now carries the human-readable
      `projects.project_id` value.
- [ ] `GET /api/onboarding/projects` (`route.ts`) additionally selects `project_id` from
      `projects` and exposes it distinctly from the UUID in its response shape.
- [ ] `OnboardingProjectListItem` (`_onboarding-list.tsx:9-21`)'s existing `project_id: string`
      field (currently the mis-named UUID) is renamed to `id: string`; a new
      `project_id: string | null` field is added carrying the real value. The card's
      link-building (`_onboarding-list.tsx:95`,
      `router.push(\`${V2_ROUTES.ONBOARDING}/${item.project_id}\`)`) switches to the real
      `project_id`.
- [ ] Any project whose `project_id` is somehow null (shouldn't happen post-migration-066,
      which backfilled + made it a trigger-generated NOT NULL-in-practice value, but the
      column itself is nullable per schema) is handled without producing a broken
      `/v2/programme/null` link — fall back to `id` for that one row's link if `project_id` is
      unexpectedly null, rather than crashing the list.
- [ ] CLAUDE.md's `project_id` convention note (the "display-only... routing key... unchanged"
      line) gets a one-line amendment carving out this route as the documented exception, so
      future readers don't treat the UUID-as-routing-key rule as still universally true. (See
      Compatibility Touchpoints.)

### (c) Wizard step routes

- [ ] The wizard, when open on a given step, reflects that step in the URL as a nested route
      segment — e.g. `/v2/programme/[projectId]/wizard/[stepKey]` — so a hard refresh while on
      (say) the "Migration Checklist" step reopens directly on that step instead of bouncing
      to the timeline.
- [ ] The plain `/v2/programme/[projectId]` route (no `/wizard/...` suffix) continues to show
      the timeline with the wizard closed, exactly as today.
- [ ] Navigating between wizard steps (Back/Continue, or clicking a `DeliverableCard` to jump
      to a specific step) updates the URL to match, so the browser back/forward buttons and a
      refresh both stay consistent with the currently-open step.
- [ ] Closing the wizard (existing `onBack`) navigates back to the plain
      `/v2/programme/[projectId]` timeline URL.
- [ ] `pm` users, who can only open the wizard read-only on steps 1-5/7 (task 146), get the
      same step-URL behavior — no new role bypass introduced by making steps URL-addressable.

## Out of Scope / Must-Not-Change

- Do **not** rename any underlying DB/RLS/column identifiers that use the word "onboarding" —
  `onboarding_visible_at`, `onboarding_internal_deliverables`, `onboarding_project_scoping`
  (migration name), `/api/onboarding/projects`, `/api/onboarding/scheduled-autostart`, or the
  `OnboardingWizard`/`OnboardingDetail`/`OnboardingList` component names. Those all correctly
  refer to Phase 1 specifically (literally named "Onboard" in `PROGRAMME_PHASES[0]`) or are
  established schema — only the top-level nav label, page `<title>`s, and the
  `/v2/onboarding` → `/v2/programme` route path change. Renaming schema/RLS identifiers is a
  much larger, separate concern not requested here.
- Do not change `V2_ROUTES.ONBOARDING`'s target audience/role gating (`DETAIL_ROLES`,
  `role !== "client"` in the sidebar) — purely a label/path rename.
- Do not revisit the broader `project_id`-vs-`id` convention anywhere else in the app
  (Projects module, Customers module, etc.) — CLAUDE.md's existing rule stays the default
  everywhere else; this task carves out one named exception for this one route tree only.
- Do not change how `wizardOpen`'s *content* is gated by role (task 146's read-only/editable
  split) — only how it's addressed via URL.
- Do not migrate the wizard to a full separate page-per-step server-rendered flow if that would
  mean re-fetching `wizardData`/`deliverables`/`internalDeliverables` on every step change —
  prefer a client-side route sync (e.g. `router.push` with `scroll: false`, keeping
  `_onboarding-detail.tsx`'s existing single data-fetch-on-mount) over a server-component-per-
  step architecture, to avoid a data-fetching regression. Flag this implementation choice for
  confirmation during planning if a different approach is preferred.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/config/constants.ts` | Modify | Rename `ONBOARDING`/`ONBOARDING_NEW` → `PROGRAMME`/`PROGRAMME_NEW`, update path values to `/v2/programme`, `/v2/programme/new` |
| `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` | Modify | Label "Onboarding" → "Tracker"; `href` uses renamed constant |
| `src/app/v2/(hub)/onboarding/` → `src/app/v2/(hub)/programme/` | Rename (dir) | Move the whole route folder tree to match the new path |
| `src/app/v2/(hub)/programme/page.tsx` | Modify | Add `export const metadata` (title "Portfolio Tracker") |
| `src/app/v2/(hub)/programme/new/page.tsx`, `_content.tsx` | Rename (no logic change) | Path only, via the directory move |
| `src/app/v2/(hub)/programme/[projectId]/page.tsx` | Modify | Query by `project_id` instead of `id`; add `export const metadata` with company name |
| `src/app/v2/(hub)/programme/[projectId]/wizard/[stepKey]/page.tsx` | Create | New nested route rendering the same detail component pre-opened to the given wizard step |
| `src/app/v2/(hub)/programme/[projectId]/_onboarding-detail.tsx` | Modify | Wizard open/step state driven by the URL (via `useParams`/`usePathname` + `router.push` on navigation) instead of pure local state |
| `src/app/api/onboarding/projects/route.ts` | Modify | Select and expose the real `project_id` alongside `id` |
| `src/app/v2/(hub)/programme/_onboarding-list.tsx` | Modify | Rename `OnboardingProjectListItem.project_id` → `id`; add real `project_id`; fix link-building |
| `CLAUDE.md` | Modify | One-line amendment noting this route's documented exception to the `project_id`-is-display-only convention |

## Code Context

### File: `src/config/constants.ts` (current, lines 43-44)

```ts
  ONBOARDING: "/v2/onboarding",
  ONBOARDING_NEW: "/v2/onboarding/new",
```

Becomes:

```ts
  PROGRAMME: "/v2/programme",
  PROGRAMME_NEW: "/v2/programme/new",
```

Grep every `V2_ROUTES.ONBOARDING`/`V2_ROUTES.ONBOARDING_NEW` reference repo-wide and rename to
match — confirmed (prior research pass) to be limited to `v2-hub-sidebar.tsx`,
`onboarding/page.tsx`, `onboarding/new/*`, `onboarding/[projectId]/page.tsx`, and
`_onboarding-list.tsx`'s own link-building — no other files reference this route.

### File: `onboarding/[projectId]/page.tsx` (current, lines 30-34)

```ts
  const { data: project, error } = await supabase
    .from("projects")
    .select("id, name, customer_id, project_id, customers(company_name)")
    .eq("id", projectId)
    .single();
```

Becomes:

```ts
  const { data: project, error } = await supabase
    .from("projects")
    .select("id, name, customer_id, project_id, customers(company_name)")
    .eq("project_id", projectId)
    .single();
```

(`project_id` is already selected here — task 147 also touches this same `.select()` to add
`contact_name`/`contact_email`/`source_meta`; coordinate the two if implemented close
together, they touch overlapping lines but not conflicting ones.)

### File: `GET /api/onboarding/projects` (`route.ts`, current, lines ~38-47, 78-80)

```ts
  const { data: projects, error } = await supabase
    .from("projects")
    .select(`
      id,
      name,
      customer_id,
      ...
```

Add `project_id` to this select list. In the response-mapping loop (line 78-80):

```ts
      return {
        project_id: p.id,        // BUG: this is the UUID, mis-named
        project_name: p.name,
```

Becomes:

```ts
      return {
        id: p.id,
        project_id: p.project_id,   // real human-readable code, may be null on legacy rows
        project_name: p.name,
```

### File: `_onboarding-list.tsx` (current, lines 9-21, 95)

```ts
export type OnboardingProjectListItem = {
  project_id: string;
  project_name: string;
  ...
};
...
    <button onClick={() => router.push(`${V2_ROUTES.ONBOARDING}/${item.project_id}`)} ...>
```

Becomes:

```ts
export type OnboardingProjectListItem = {
  id: string;
  project_id: string | null;
  project_name: string;
  ...
};
...
    <button onClick={() => router.push(`${V2_ROUTES.PROGRAMME}/${item.project_id ?? item.id}`)} ...>
```

### File: `_onboarding-detail.tsx` (current, lines 585, 706, 732-733, 846) — wizard open/step state

```ts
const [wizardStartStepKey, setWizardStartStepKey] = useState<string | undefined>(undefined);
...
setWizardStartStepKey(deliverableKey);   // opens wizard on a specific deliverable's step
...
onBack={() => { setWizardOpen(false); setWizardStartStepKey(undefined); }}
```

Needs to become URL-driven: reading the optional `stepKey` segment via `useParams()` (this
component would need to be reachable from both the plain `[projectId]/page.tsx` and the new
`[projectId]/wizard/[stepKey]/page.tsx`, most simply by having both pages render the same
`OnboardingDetail` client component with a `wizardStartStepKey` prop derived server-side from
the route params, rather than duplicating the whole page). `onOpenWizardStep`/step-forward/
Back calls `router.push` to the corresponding `/wizard/[stepKey]` or plain project URL instead
of only calling `setState`.

## Implementation Steps

1. Rename `src/app/v2/(hub)/onboarding/` → `src/app/v2/(hub)/programme/` (directory move,
   file contents unchanged except where noted below).
2. Update `constants.ts`: rename `ONBOARDING`/`ONBOARDING_NEW` → `PROGRAMME`/`PROGRAMME_NEW`,
   new path values.
3. Update `v2-hub-sidebar.tsx`: label → "Tracker", href → `V2_ROUTES.PROGRAMME`.
4. Add `export const metadata = { title: "Portfolio Tracker" }` to `programme/page.tsx`.
5. In `programme/[projectId]/page.tsx`: switch the query to `.eq("project_id", projectId)`;
   add `export const metadata` computed from the fetched `companyName` (Next.js allows a
   dynamic-per-request title by exporting an async `generateMetadata` function instead of a
   static `metadata` object when the title depends on fetched data — use that form here),
   producing `"{companyName} — Portfolio Tracker"`.
6. Update `GET /api/onboarding/projects/route.ts`: select `project_id`, expose `id` +
   `project_id` distinctly in the response (keep the route path itself as-is — task explicitly
   scopes the `/api/onboarding/*` route *names* as out-of-scope; only this route's response
   shape changes).
7. Update `_onboarding-list.tsx`: rename the type field, fix the link-building, update every
   local usage of `item.project_id` that assumed it was the UUID (grep the file for
   `item.project_id` after the rename to catch all of them — the type-checker will also catch
   most via `id` no longer existing where expected).
8. Create `programme/[projectId]/wizard/[stepKey]/page.tsx` — same auth/role/data-fetch as
   `[projectId]/page.tsx` (consider extracting the shared fetch-and-guard logic into a small
   helper both pages call, to avoid duplicating the `DETAIL_ROLES` check and Supabase query),
   rendering `OnboardingDetail` with an additional prop indicating the wizard should open
   immediately on `stepKey`.
9. In `_onboarding-detail.tsx`: read the optional `stepKey` route param (via `useParams()` in
   the client component, or as a prop threaded from whichever server page rendered it), use it
   to initialize `wizardOpen`/`wizardStartStepKey` instead of always defaulting to closed;
   update `onOpenWizardStep`, wizard Back, and any other step-changing action to call
   `router.push` to the matching URL (`/v2/programme/{project_id}` when closing, `/v2/programme/{project_id}/wizard/{stepKey}` when open on a step) alongside (or instead of) the local
   `setState` calls, so the URL and the rendered state never diverge.
10. Amend CLAUDE.md's `project_id` convention paragraph with a one-line carve-out: this route
    (`/v2/programme/[projectId]`) is the documented exception where `project_id` is the actual
    routing key, not `id` — everywhere else in the app the existing rule stands unchanged.

## Acceptance Criteria

- [ ] Sidebar shows "Tracker" linking to `/v2/programme`; the old `/v2/onboarding`
      path is gone (or, if a redirect is preferred for any bookmarked links, that's an
      explicit implementer decision to flag — not required by this spec).
- [ ] List and detail page browser tab titles reflect "Portfolio Tracker" /
      "{Company} — Portfolio Tracker" instead of the generic "WebriQ Central Hub" fallback.
- [ ] Opening a project from the list navigates to `/v2/programme/{project_id}` (the
      human-readable code, e.g. `2EBA-PROJ-04BA`), not a UUID.
- [ ] Opening a specific wizard step (e.g. via a `DeliverableCard` click) updates the URL to
      `/v2/programme/{project_id}/wizard/{stepKey}`; refreshing the page on that URL reopens
      the wizard on that exact step, not the timeline.
- [ ] Refreshing on the plain `/v2/programme/{project_id}` URL (no `/wizard/...`) shows the
      timeline with the wizard closed, as before.
- [ ] Closing the wizard navigates back to the plain project URL.
- [ ] `pm` role still gets the same read-only step access as before (task 146) on the new
      wizard step routes.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser: click into a project from `/v2/programme`, confirm the URL shows the
human-readable `project_id`. Open a wizard step (e.g. Migration Checklist), confirm the URL
updates, then hard-refresh the browser and confirm you land back on that same step instead of
the timeline. Navigate Back to the timeline and confirm the URL and view both revert correctly.
Confirm the sidebar tab label reads "Tracker" and both page titles read "Portfolio Tracker"
(detail page: "{Company} — Portfolio Tracker").

## Compatibility Touchpoints

- **CLAUDE.md update required** — amend the existing `project_id` convention paragraph (the
  "display-only... routing key... unchanged" line) to note this route as the one documented
  exception, per this task's own out-of-scope note. Do this as part of implementation, not a
  separate follow-up, so the convention doc never goes stale relative to the code.
- No data migration needed — `projects.project_id` already exists and is populated
  (migration 066); this task only changes what reads/writes reference it for routing.
- Any external bookmarks/links to `/v2/onboarding/...` will 404 after the rename — acceptable
  per the user's explicit request to change the route; not treated as a backwards-compatibility
  concern to preserve.

## Implementation Notes

### What Changed
- Directory `src/app/v2/(hub)/onboarding/` moved to `src/app/v2/(hub)/programme/` (whole tree:
  list, `new/`, `import/`, `[projectId]/`).
- `V2_ROUTES.ONBOARDING`/`ONBOARDING_NEW`/`ONBOARDING_IMPORT` renamed to `PROGRAMME`/
  `PROGRAMME_NEW`/`PROGRAMME_IMPORT`, values updated to `/v2/programme*`; every call site
  (sidebar, list page, new/import wizards, detail page, redirects) updated to match.
- Sidebar label "Onboarding" → "Tracker"; list page `<title>` → "Portfolio Tracker" (static
  `metadata`); detail page `<title>` → `"{companyName} — Portfolio Tracker"` (`generateMetadata`,
  new nested wizard-step page shares the same title logic).
- `[projectId]/page.tsx` now queries `projects` by `.eq("project_id", projectId)` instead of
  `.eq("id", projectId)`. The page's own downstream `phase_members`/`project_members` queries
  (which filter by the UUID FK) were switched from the raw route param to the fetched
  `project.id`, since those child tables are still keyed by the UUID, not the display code —
  this wasn't called out in the task's Code Context but is required for those queries to keep
  matching real rows once the route param stopped being the UUID.
- `GET /api/onboarding/projects`: now selects and exposes `project_id` distinctly from `id`
  (previously mis-named the UUID as `project_id`, per the task's own bug note).
- `POST /api/onboarding/projects`: same UUID-mislabeled-as-`project_id` bug existed in the
  creation response (used by the "New Project" success screen's View button) — not named in the
  task's Proposed File Changes table, but it's the same bug category already documented for the
  GET route, and leaving it unfixed would have sent that button to a 404 once the detail route
  started requiring the real `project_id`. Fixed alongside the GET route with the same
  null-safe fallback (`project.project_id ?? project.id`).
- `_onboarding-list.tsx`: `OnboardingProjectListItem.project_id` (mis-typed UUID field) renamed
  to `id`; added real `project_id: string | null`; card link-building and the list's `key` prop
  updated accordingly (`key` now uses `id`, always non-null, instead of the nullable
  `project_id`).
- New nested route `programme/[projectId]/wizard/[stepKey]/page.tsx`, sharing a new
  `_load-detail-data.ts` helper (`loadOnboardingDetailData`, `getCompanyNameForMetadata`) with
  the plain `[projectId]/page.tsx` — both call the same auth/role guard + Supabase fetch,
  differing only in whether `initialWizardStepKey` is passed to `OnboardingDetail`. This
  extraction was flagged as worth considering in the task's own Implementation Steps (step 8)
  to avoid duplicating the `DETAIL_ROLES` check and Supabase query, and was applied.
- `_onboarding-detail.tsx`: `wizardOpen`/`wizardStartStepKey` now initialize from the new
  `initialWizardStepKey` prop; every place that opens or closes the wizard (`handleOpenWizardStep`,
  the "Onboarding Wizard" button, the wizard's `onBack`, and the Phase-1-restricted screen's
  "Back to Timeline" button) now also `router.push`es to the matching `/v2/programme/{project_id}`
  or `/v2/programme/{project_id}/wizard/{stepKey}` URL (`scroll: false`).
- `_onboarding-wizard.tsx`: added a `stepIdx`-watching `useEffect` (with a ref tracking the last
  URL-synced step key, so mount never fires a redundant push) that calls `router.push` to the
  matching `/wizard/{stepKey}` URL on every step change — covers Continue, Back-within-wizard,
  and Steps-indicator jumps from one place instead of touching each of those 6 `setStepIdx` call
  sites individually.
- `CLAUDE.md`: amended the `project_id` convention paragraph with a one-line carve-out for
  `/v2/programme/[projectId]` (and its `/wizard/[stepKey]` nested route) as the documented
  exception.
- Fixed a stale code comment in `customers/[customerId]/_programme-tab.tsx` referencing the old
  `/v2/onboarding` path.

### Files Changed
- `src/config/constants.ts` — route constant rename
- `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` — label + href
- `src/app/v2/(hub)/onboarding/` → `src/app/v2/(hub)/programme/` — directory rename (whole tree)
- `src/app/v2/(hub)/programme/page.tsx` — metadata title, route constant refs
- `src/app/v2/(hub)/programme/new/page.tsx`, `new/_content.tsx` — route constant refs
- `src/app/v2/(hub)/programme/import/page.tsx`, `import/_content.tsx` — route constant refs
- `src/app/v2/(hub)/programme/_onboarding-list.tsx` — type fix, link-building, route constants
- `src/app/v2/(hub)/programme/[projectId]/page.tsx` — rewritten to use the shared data-loader;
  `generateMetadata` added
- `src/app/v2/(hub)/programme/[projectId]/_load-detail-data.ts` — new shared helper
- `src/app/v2/(hub)/programme/[projectId]/_onboarding-detail.tsx` — URL-driven wizard open/step
  state, `initialWizardStepKey` prop, `project.id`-based phase/project member queries (see What
  Changed)
- `src/app/v2/(hub)/programme/[projectId]/_onboarding-wizard.tsx` — step-URL sync effect
- `src/app/v2/(hub)/programme/[projectId]/wizard/[stepKey]/page.tsx` — new route
- `src/app/api/onboarding/projects/route.ts` — GET select/response fix, POST response fix
- `CLAUDE.md` — convention carve-out
- `src/app/v2/(hub)/customers/[customerId]/_programme-tab.tsx` — stale comment fix

### Deviations From Plan
- Renamed `V2_ROUTES.ONBOARDING_IMPORT` → `PROGRAMME_IMPORT` and updated its call sites, even
  though the task doc's grep note only confirmed `ONBOARDING`/`ONBOARDING_NEW` usage sites. The
  `import/` route lives under the same directory being moved, so leaving `ONBOARDING_IMPORT`
  pointed at the old `/v2/onboarding/import` path would have 404'd it post-rename — required for
  the directory move itself to work, not a scope expansion.
- Fixed the same UUID-mislabeled-as-`project_id` bug in `POST /api/onboarding/projects`'s
  response (not just the `GET` route the task named) — see What Changed. Left unfixed, the
  "New Project" success screen's View button would 404 against the now-`project_id`-keyed
  detail route.
- Fixed `[projectId]/page.tsx`'s `phase_members`/`project_members` queries to filter by
  `project.id` instead of the raw route `projectId` param — required once the route param
  stopped being the UUID those child tables are actually keyed by; not called out in the task's
  Code Context, which only showed the top-level `projects` query changing.
- Extracted `_load-detail-data.ts` as the shared fetch-and-guard helper the task's Implementation
  Steps suggested considering (step 8) — applied rather than duplicating the query/guard in the
  new wizard-step route.
- Chose a ref-gated `useEffect` inside the wizard (keyed on `stepIdx`) to sync the step URL,
  rather than editing each of the 6 internal `setStepIdx` call sites individually — same
  observable behavior, smaller diff, and guarantees the URL and rendered step can't drift no
  matter which internal control changed `stepIdx`.

### Verification Run
- `npx tsc --noEmit` - PASS (after clearing a stale `.next/types` cache from before the
  directory rename, which otherwise reported unrelated `Cannot find module '.../onboarding/...'`
  errors against the old path)
- `pnpm lint` - FAIL (pre-existing, unrelated to this task: `_onboarding-wizard.tsx:591`,
  `react-hooks/set-state-in-effect` on a `useEffect` that clears `checklistValidationError` on
  step change — this code was not touched by this task and the violation predates it)

## Implementation Notes — Follow-Up Revision (post-Testing)

User feedback while task 150 was already in Testing asked for a different URL shape than what
was originally implemented: the route segment/label moves from `programme` to
`portfolio-tracker`, and the nested `/wizard/[stepKey]` route is replaced with `?phase=&
deliverable=` query params (1-based deliverable index, not the string key) so future deliverable
insertions/reorders in `customer-phases.ts` don't require another URL change. Also requested:
breadcrumb header text and the detail page's back-link label.

### What Changed
- Directory `src/app/v2/(hub)/programme/` → `src/app/v2/(hub)/portfolio-tracker/`. The nested
  `[projectId]/wizard/[stepKey]/` route added earlier this task is deleted — the single
  `[projectId]/page.tsx` now handles both the closed-timeline and open-wizard-on-a-step cases via
  `searchParams`.
- `V2_ROUTES.PROGRAMME`/`PROGRAMME_NEW`/`PROGRAMME_IMPORT` renamed to `PORTFOLIO_TRACKER`/
  `PORTFOLIO_TRACKER_NEW`/`PORTFOLIO_TRACKER_IMPORT`, values `/v2/portfolio-tracker*`. Every call
  site updated (sidebar, list/new/import pages, detail page, wizard).
- New `[projectId]/_wizard-step-params.ts`: `stepKeyToWizardParams(stepKey)` /
  `wizardParamsToStepKey(phase, deliverable)` / `FIRST_WIZARD_STEP_PARAMS`, converting between
  the wizard's internal deliverable *key* (e.g. `"outcome-target"`) and a `{ phase, deliverable }`
  pair where `deliverable` is the 1-based index into `getPhaseByNumber(phase).deliverables`. The
  Wizard only covers Phase 1 today, so `phase` is currently always `1`, but the param is real
  (not hardcoded past this one module) so a future multi-phase wizard doesn't need another URL
  redesign. `wizardParamsToStepKey` validates `phase` against the one supported phase number
  before calling `getPhaseByNumber` — that function throws on an unknown phase number, and `phase`
  here comes from an untrusted URL query string.
- `[projectId]/page.tsx`: reads `searchParams: { phase?, deliverable? }`, resolves them to
  `initialWizardStepKey` via `wizardParamsToStepKey`, passed to `OnboardingDetail` exactly as the
  now-deleted `wizard/[stepKey]/page.tsx` did.
- `_onboarding-detail.tsx`: every wizard open/close call site (`handleOpenWizardStep`, the
  "Onboarding Wizard" open button, the Wizard's own `onBack`, and the Phase-1-restricted screen's
  "Back to Timeline" button) now pushes `?phase=&deliverable=` (open) or the plain project URL
  (close) instead of a `/wizard/{key}` path segment. Back-link label "Back to Onboarding" →
  "Back to Projects" (same destination, `V2_ROUTES.PORTFOLIO_TRACKER` — only the label changed;
  no explicit new destination was given, and re-pointing it to the separate Projects module
  wasn't requested).
- `_onboarding-wizard.tsx`: the `stepIdx`-watching URL-sync effect (added earlier this task) now
  builds `?phase=&deliverable=` via `stepKeyToWizardParams` instead of a `/wizard/{key}` path —
  same ref-gated, mount-skipping design as before, just a different URL shape.
- `v2-hub-header.tsx`: added a `BREADCRUMB_MAP` entry for `V2_ROUTES.PORTFOLIO_TRACKER` →
  `{ section: "Work", page: "Portfolio Tracker" }`. Before this, the route matched no prefix and
  fell through to the header's default `{ section: "WebriQ", page: "Hub" }` — this is what the
  screenshot showed. The map is prefix-matched (`pathname.startsWith(prefix + "/")`), so detail
  pages inherit the same "Work / Portfolio Tracker" breadcrumb automatically.
- `CLAUDE.md`: updated the task 150 carve-out to the new `/v2/portfolio-tracker/[projectId]` path
  (dropped the now-nonexistent `/wizard/[stepKey]` mention, noted the query-param step addressing
  instead).
- Fixed two more stale `/v2/programme` mentions surfaced by a repo-wide grep after the rename:
  a comment in `customers/[customerId]/_programme-tab.tsx` and one in
  `api/onboarding/projects/route.ts`.

### Files Changed
- `src/config/constants.ts` — route constant rename
- `src/app/v2/(hub)/programme/` → `src/app/v2/(hub)/portfolio-tracker/` — directory rename;
  `[projectId]/wizard/[stepKey]/` subtree deleted
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_wizard-step-params.ts` — new shared helper
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/page.tsx` — searchParams-driven wizard state
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` — query-param push
  URLs, back-link label
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` — query-param push URL
- `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx`, `new/*`, `import/*` — route constant
  rename call sites
- `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` — route constant rename
- `src/app/v2/(hub)/_components/v2-hub-header.tsx` — breadcrumb map entry
- `CLAUDE.md` — carve-out path update
- `src/app/v2/(hub)/customers/[customerId]/_programme-tab.tsx`,
  `src/app/api/onboarding/projects/route.ts` — stale comment fixes

### Deviations From Plan
- Implemented the new top-level path as `/v2/portfolio-tracker/[projectId]` rather than a literal
  root-level `/portfolio-tracker/[projectId]` as the request's example URLs showed. Everything in
  this app's v2 build (sidebar, header/breadcrumb, auth guard) lives under `/v2/*`; a true
  root-level route would sit outside that shell and need its own duplicated layout/auth-guard.
  Flagged to the user for confirmation rather than assumed silently.
- Left the list page's `<h1>🚀 Onboarding</h1>` heading and subtitle text unchanged — the request's
  screenshot showed them, but the explicit ask was only the breadcrumb and the back-link label.
  Flagged to the user in case that heading should change too.

### Verification Run
- `npx tsc --noEmit` - PASS (after clearing `.next/types` again post-rename)
- `pnpm lint` - FAIL (same pre-existing, unrelated `_onboarding-wizard.tsx` line — see above;
  line number shifted slightly with this revision's edits but it's the same violation)

### Follow-up: list page heading
User confirmed the flagged item — `_onboarding-list.tsx`'s `<h1>🚀 Onboarding</h1>` now reads
"🚀 Portfolio Tracker". The unrelated fallback string `"Onboarding"` used inside `ProjectCard` for
a project with no `current_phase_name` yet (line ~116) was left as-is — different string, not the
page heading. `npx tsc --noEmit` - PASS.
