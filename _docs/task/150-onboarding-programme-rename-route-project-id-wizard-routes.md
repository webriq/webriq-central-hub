# 150: 120-Day Programme — Nav Rename, `project_id` Route Param, Wizard Step Routes

**Created:** 2026-07-14
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned

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

- [ ] Sidebar label changes from "Onboarding" to **"120-Day Programme"** — the name already
      used consistently in code comments/task titles across this module (`customer-phases.ts`
      header, migration 059's own title, etc.), so this aligns the user-facing label with
      established internal terminology rather than inventing a new one.
- [ ] List page `<title>` becomes "120-Day Programme" (via `export const metadata`); detail
      page `<title>` becomes `"{companyName} — 120-Day Programme"`.
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
| `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` | Modify | Label "Onboarding" → "120-Day Programme"; `href` uses renamed constant |
| `src/app/v2/(hub)/onboarding/` → `src/app/v2/(hub)/programme/` | Rename (dir) | Move the whole route folder tree to match the new path |
| `src/app/v2/(hub)/programme/page.tsx` | Modify | Add `export const metadata` (title "120-Day Programme") |
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
3. Update `v2-hub-sidebar.tsx`: label → "120-Day Programme", href → `V2_ROUTES.PROGRAMME`.
4. Add `export const metadata = { title: "120-Day Programme" }` to `programme/page.tsx`.
5. In `programme/[projectId]/page.tsx`: switch the query to `.eq("project_id", projectId)`;
   add `export const metadata` computed from the fetched `companyName` (Next.js allows a
   dynamic-per-request title by exporting an async `generateMetadata` function instead of a
   static `metadata` object when the title depends on fetched data — use that form here).
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

- [ ] Sidebar shows "120-Day Programme" linking to `/v2/programme`; the old `/v2/onboarding`
      path is gone (or, if a redirect is preferred for any bookmarked links, that's an
      explicit implementer decision to flag — not required by this spec).
- [ ] List and detail page browser tab titles reflect "120-Day Programme" /
      "{Company} — 120-Day Programme" instead of the generic "WebriQ Central Hub" fallback.
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
Confirm the sidebar tab label and both page titles read "120-Day Programme".

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
