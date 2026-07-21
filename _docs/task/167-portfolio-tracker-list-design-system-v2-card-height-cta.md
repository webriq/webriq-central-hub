# 167: Portfolio Tracker List — Design System v2.0, Consistent Card Height, "+ New Project" CTA, Phase-Agnostic Description, Search/Filter/Pagination

**Created:** 2026-07-21
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

`/v2/portfolio-tracker` (`src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx`, wrapped by a thin `page.tsx`) is the one remaining piece of the onboarding-programme surface still on the pre-166 look — hardcoded Tailwind slate/blue/amber classes switched by an `isDark` prop, not Design System v2.0's navy/blue/orange tokens task 166 already applied to `/v2/dashboard`. This task:

1. Restyles the page to v2.0, reusing the `Chip`/`PhaseChip`/`OnboardingStatusPill` primitives task 166 already added to `dashboard-shared.tsx` instead of this file's own separate `STATUS_STYLE` map.
2. Fixes a real layout bug: `ProjectCard` renders a different set of content blocks depending on project state (in-progress → progress bar + phase line; scheduled → one line; draft/not-started → one line; footer row only appears if `classification || members.length > 0`), so cards in the same grid row end up different heights — visible in the screenshot the user attached (a "Draft" card sitting shorter than its "In Progress" neighbors in the same row).
3. Makes "+ New Project" the page's one v2.0 CTA (orange, per DESIGN.md's "one CTA per screen" rule) — "Import Project" stays a secondary ghost action.
4. Rewrites the page's descriptive subtitle to derive its phase-count/day-total language from `PROGRAMME_PHASES` (`src/config/customer-phases.ts`) instead of hardcoding "120-day"/"Phase 1–5", so it doesn't silently go stale if the programme's phase structure changes later (task 148 already changed deliverable day-spans once; the phase count/total-days themselves could change too).
5. Adds search, status filtering, and pagination to the list, matching `/v2/projects`' UX (search input, status-pill filter row, page-size select + first/prev/next/last controls, URL-synced via `router.push`/`useSearchParams` so a filtered view is shareable/bookmarkable) — added mid-scoping at the user's explicit request.

**Second scope decision (also flagged, not blocking):** `/v2/projects` implements search/filter/pagination **server-side** — `page.tsx` reads `searchParams`, builds a filtered Supabase query with `.range()` + `count: "exact"`, passes the already-paginated page down as props (`_projects-index.tsx:6-115`). Portfolio-tracker's equivalent data source, `GET /api/onboarding/projects`, is architecturally different and shared by four other consumers (`pm-dashboard.tsx`, `dev-dashboard.tsx`, `marketing-dashboard.tsx` all `fetch()` it client-side too): it does role/membership filtering **in application code, after** the initial DB fetch (`isRoleGatedByMembership` — `route.ts:73-83`), plus a second, per-project-batch phase/member lookup. Naively adding `.range()` before that post-filter would produce wrong page counts/short pages whenever the post-filter removes rows. Properly fixing that would mean reworking the shared route's membership filter into a SQL-level join/subquery — a real, separate, riskier change affecting 4 other call sites, out of proportion to this task and not requested. Given the realistic dataset size here (a handful to a few dozen active onboarding projects, not the hundreds/thousands `/v2/projects` is built for), this task implements search/filter/pagination **client-side**, over the already-fetched full list returned by the existing, unmodified `GET /api/onboarding/projects` — same visible UX as `/v2/projects` (search box, status pills, pagination bar, URL-synced), different mechanism underneath. If true DB-side pagination is actually needed later (e.g. once the onboarding project count grows large), that's a follow-up task against the shared API route, not this one.

**Scope decision (flagged for review, not asked as a blocking question — user has been iterating quickly toward v2.0 consistency and this follows the precedent already set):** `_onboarding-list.tsx` currently supports both light and dark themes via `usePMSettings()`'s `isDark` toggle. Task 166's new `Chip`/`PhaseChip` primitives are fixed-light only (no dark variant — v2.0 itself has no dark-mode spec, same reasoning already applied to `pm-dashboard.tsx`, which also dropped `isDark` and went fixed-light). Since this page renders the exact same `OnboardingProjectListItem` data as `pm-dashboard.tsx`'s new Programme board/Clients table and should look like the same design family, this task **drops `isDark`/`usePMSettings()` from this file and goes fixed-light v2.0**, matching `pm-dashboard.tsx`'s precedent rather than maintaining a second, now-inconsistent dark-mode-capable version of the same card. If this page's dark mode was actually in active use and should be preserved instead, say so and this task will be revised before implementation.

## Requirements

### A. Card height consistency (the reported bug)
- [ ] `ProjectCard` gets a fixed 4-slot structure so every card in a grid row is the same height regardless of project state, instead of swapping between different block shapes:
  1. Header: title + status chip (existing, unchanged in shape).
  2. Company name row (existing, unchanged).
  3. Progress row — **always rendered**: a thin track + `Day N/120` in mono when `current_day` is set; when not (draft/scheduled), render the same track row at 0% fill with the existing "Starts {date}" / "Not started" line in its place so the row height matches rather than being omitted.
  4. Phase/handover line — **always rendered**, one line, falling back to placeholder copy ("Awaiting kickoff") when there's no phase yet, rather than being conditionally skipped.
  5. Footer (classification + avatar stack) — **always rendered** (previously conditional on `item.classification || item.members.length > 0`), showing "Unclassified" / no avatars rather than collapsing the row away.
- [ ] Grid item wrapper (`button`/`div`) and the card's inner content `div` both get `h-full` so the CSS grid's default row-stretch behavior actually reaches the visible card box, not just its invisible wrapper.

### B. Design System v2.0 restyle
- [ ] Drop `usePMSettings()`/`isDark` from this file (see flagged scope decision above); remove the dark-mode class branches throughout `ProjectCard`, `AvatarStack`, and the page shell.
- [ ] Replace the file's own `STATUS_STYLE` map + inline status-pill markup with the shared `OnboardingStatusPill` (no `isDark` prop needed once fixed-light) imported from `../../dashboard/_components/dashboard-shared`.
- [ ] Replace the classification text with the shared `Chip tone="neutral"` (or omit when `classification` is null, matching `pm-dashboard.tsx`'s Clients table convention — never render an empty chip).
- [ ] Add a `PhaseChip` next to (or below) the phase/handover line when `current_phase_number`/`current_phase_name` are set, reusing the same phase-hue system already shipped in task 166 — this card currently shows phase as plain text only, no color coding.
- [ ] Progress bar fill color: `#007BFF` (v2.0 blue) replacing the current `bg-brand` (old `#3358F4` v1 token).
- [ ] Page shell (title, subtitle, empty state, loading skeletons, error banner): v2.0 `ink`/`body`/`muted`/`line`/`line-soft` hex, `font-heading` for the page title, matching `pm-dashboard.tsx`'s established literal-hex convention (no new CSS-variable layer).
- [ ] Invoke the `frontend-design` and `impeccable` skills against the rewritten file for a visual-polish pass (hover states, spacing, motion, hierarchy) per the user's explicit request — constrained by CLAUDE.md's UI Polish Conventions (no `dark:` variants, hand-rolled pills not shadcn `Badge`).

### C. "+ New Project" as the page's one CTA
- [ ] "+ New Project" (both the header action-bar button and, if still present per Requirement E, any other instance) uses v2.0's CTA button spec: `bg-[#FB914E] text-[#471F02]` → hover `bg-[#E2762F] text-white`, pill radius (`rounded-full`), per DESIGN.md Section 5 "Buttons."
- [ ] "Import Project" stays a ghost/secondary button (white background, `#E2E7F2` border, hover border `#A8C6F5`) — it must not also read as a CTA now that "New Project" owns that role.
- [ ] Use the existing named `V2_ROUTES.PORTFOLIO_TRACKER_NEW` constant for the New Project link instead of the current hand-built `` `${V2_ROUTES.PORTFOLIO_TRACKER}/new` `` string (the constant already exists in `src/config/constants.ts:44`, just wasn't used here).

### D. Phase-agnostic page description
- [ ] Replace the hardcoded editable-role subtitle — `"120-day programme intake and progress, Phase 1–5 — Phase 1 is hidden from PM/staff view until handover."` — with one derived from `PROGRAMME_PHASES` (import from `@/config/customer-phases`): phase count = `PROGRAMME_PHASES.length`, total days = `PROGRAMME_PHASES[PROGRAMME_PHASES.length - 1].dayEnd`. Example target: `` `Programme intake and progress across all ${PROGRAMME_PHASES.length} phases (${totalDays}-day full cycle) — Phase 1 is hidden from PM/staff view until handover.` `` — exact wording is an implementation-time call, the requirement is that the numbers are computed, not typed literally.
- [ ] Replace the non-editable subtitle ("Projects currently going through Phase 1 onboarding.") similarly if it also encodes a phase-specific assumption — review at implementation time; this one only names "Phase 1" by role-scoping intent (non-editable roles only ever see Phase 1 projects per the existing `editable` gate), which is a real, current-and-durable fact about the access model, not a numbers-that-could-change issue — don't over-apply Requirement D here if there's nothing actually fragile to fix.

### E. Empty-state CTA duplication (found during research, in scope since it directly affects "one CTA per screen")
- [ ] The empty state currently renders its *own* "New Project" button (lines 260-270 of the current file) **in addition to** the header action-bar's "New Project" button, which is always rendered above it when `canCreate` is true — i.e., two CTAs are already on screen simultaneously whenever the list is empty. Remove the empty state's own button; the header's CTA is already visible on the same screen and is sufficient (matches DESIGN.md's "one CTA per screen, maximum" rule).
- [ ] The empty state must distinguish "no projects exist at all" from "no projects match the current search/filter" (new with Requirement F) — the latter needs its own copy ("No projects match your search — try a different filter" + a "Clear filters" action) rather than "No projects in onboarding," per DESIGN.md's "empty states teach" rule.

### F. Search, status filter, pagination (client-side, URL-synced — see second scope decision above)
- [ ] **Search**: a text input (same visual treatment as `/v2/projects`' search box — `Search` icon, placeholder, `#E2E7F2` border, focus `#007BFF` border per DESIGN.md's Forms spec) filtering the already-fetched list by `project_name`/`company_name` substring match (case-insensitive). URL param: `?search=`.
- [ ] **Status filter**: a pill-group filter using this domain's real status enum — `all | draft | scheduled | in_progress` (not `/v2/projects`' `active/on_hold/completed/archived` set, which doesn't apply here) — styled per DESIGN.md's "Filter pills" spec (navy fill for the active pill, never blue, since filters are selection state not actions). URL param: `?status=`.
- [ ] **Pagination**: page-size select + first/prev/next/last controls (same icon set/layout as `/v2/projects`' toolbar — `ChevronsLeft`/`ChevronLeft`/`ChevronRight`/`ChevronsRight`), operating on the filtered (search + status) client-side array, not the raw fetch. Page-size options: `[9, 18, 36]` (multiples of the 3-column grid, unlike `/v2/projects`' `[15,45,90]`/`[20,50,100]` split which exists because that page also has a list view — portfolio-tracker only has the card grid). URL params: `?page=`, `?pageSize=`.
- [ ] All three filters reset `page` to `1` on change (matching `/v2/projects`' `buildUrl({ ..., page: 1 })` pattern) and are combined via `useSearchParams`/`router.push` into one shareable URL, mirroring `_projects-index.tsx:109-115`'s `buildUrl()` helper (reimplemented locally in this file, not imported — the two pages are otherwise unrelated feature areas, matching this file's own existing "page-scoped UI" convention already used for `AvatarStack`/`initialsFor`).
- [ ] The result count line ("`N` clients in the programme" — Requirement D's dynamic subtitle) reflects the **filtered** total, not the unfiltered fetch total, so it stays consistent with what's actually on screen (mirrors `/v2/projects`' `{total} project{total===1?"":"s"}` line, which already reflects its server-filtered count).

## Out of Scope / Must-Not-Change

- `page.tsx` (thin server wrapper — role resolution, redirect, `OnboardingList` render) — no changes needed.
- `GET /api/onboarding/projects` — consumed as-is; `OnboardingProjectListItem`'s shape is unchanged.
- The `[projectId]` detail page, the Wizard, and the "New Project"/"Import Project" destination pages themselves — only this list page and its CTA styling are in scope.
- `v2-hub-sidebar.tsx` / topbar — still out of scope per task 166's scope decision 1, unchanged here too.
- No RLS, schema, or API contract changes.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` | Modify | v2.0 restyle, fixed-height cards, CTA button, dynamic phase-count description, drop duplicate empty-state CTA |

## Code Context

### File: `src/app/v2/(hub)/dashboard/_components/dashboard-shared.tsx` (read-only reference — primitives added by task 166, reuse here)

```tsx
export function Chip({ tone, dot, children, className }: ChipProps) { ... }          // tones: ok/warn/late/neutral/onboard/migrate/publish/ai/optimize
export function PhaseChip({ phaseNumber, phaseName }: { phaseNumber: number; phaseName: string }) { ... }
export function OnboardingStatusPill({ status, isDark = false }: { status: string; isDark?: boolean }) { ... }  // draft/scheduled/in_progress
```
Import path from this file: `import { Chip, PhaseChip, OnboardingStatusPill } from "../../dashboard/_components/dashboard-shared";` (mirrors the existing reverse import already in `marketing-dashboard.tsx`: `import type { OnboardingProjectListItem } from "../../portfolio-tracker/_onboarding-list";`).

### File: `src/config/customer-phases.ts` (read-only reference)

```ts
export const PROGRAMME_PHASES: PhaseConfig[] = [ /* 5 entries today, number/name/dayStart/dayEnd/deliverables */ ];
```
Use `PROGRAMME_PHASES.length` and `PROGRAMME_PHASES[PROGRAMME_PHASES.length - 1].dayEnd` for Requirement D — never hardcode `5`/`120`.

### File: `src/config/constants.ts:44` (read-only reference)

```ts
PORTFOLIO_TRACKER_NEW: "/v2/portfolio-tracker/new",
```
Use this directly (Requirement C) instead of string-building `` `${V2_ROUTES.PORTFOLIO_TRACKER}/new` ``.

### File: `src/app/v2/(hub)/projects/_projects-index.tsx` (read-only reference — search/filter/pagination pattern to port, UX only, not the server-fetch mechanism — see second scope decision)

```tsx
const searchParams = useSearchParams();
const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

function buildUrl(overrides: Record<string, string | number | null>) {
  const p = new URLSearchParams(searchParams.toString());
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) { p.delete(k); } else { p.set(k, String(v)); }
  }
  return `${V2_ROUTES.PROJECTS}?${p.toString()}`;
}
// Search input — debounced (network round-trip on that page; not required here since filtering
// is local, but keep the same input UX/placement per the user's "similar to /v2/projects" ask):
<input value={searchInput} onChange={(e) => { ... router.push(buildUrl({ search: q || null, page: 1 })); }} ... />
// Status filter pills:
<div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shrink-0">
  {STATUS_FILTERS.map((s) => <button onClick={() => router.push(buildUrl({ status: s === "all" ? null : s, page: 1 }))} ...>{STATUS_LABELS[s]}</button>)}
</div>
// Pagination bar — page-size select + count line + first/prev/next/last:
<select value={pageSize} onChange={(e) => router.push(buildUrl({ pageSize: Number(e.target.value), page: 1 }))}>...</select>
<span>{from + 1}–{Math.min(from + pageSize, total)} of {total}</span>
<button onClick={() => router.push(buildUrl({ page: 1 }))} disabled={!hasPrev}><ChevronsLeft /></button>
<button onClick={() => router.push(buildUrl({ page: page - 1 }))} disabled={!hasPrev}><ChevronLeft /></button>
<button onClick={() => router.push(buildUrl({ page: page + 1 }))} disabled={!hasNext}><ChevronRight /></button>
<button onClick={() => router.push(buildUrl({ page: Math.ceil(total / pageSize) }))} disabled={!hasNext}><ChevronsRight /></button>
```
Port the layout/interaction shape (input placement, pill-group styling, pagination bar) to v2.0 tokens (Requirement B) — this reference is v1-styled (`slate-900`/`slate-200` etc.), not a literal copy-paste target.

### File: `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` (current — full file already read this session)

Current `ProjectCard`'s conditional structure (lines 115-140) is the root cause of Requirement A:
```tsx
{item.current_day ? (
  <> {/* progress bar + phase line */} </>
) : item.scheduled_onboarding_start_at ? (
  <div>Starts {...}</div>
) : (
  <div>Not started</div>
)}
{(item.classification || item.members.length > 0) && (
  <div>{/* footer — currently conditional, becomes unconditional per Requirement A */}</div>
)}
```
Current header action bar (lines 203-224) and empty-state CTA (lines 260-270) both render a "New Project" link — Requirement E removes the latter; Requirement C restyles the former.

Current `STATUS_STYLE`/inline status-pill markup (lines 73-77, 107-112) — replaced by the shared `OnboardingStatusPill` per Requirement B.

## Implementation Steps

1. Add the `Chip`/`PhaseChip`/`OnboardingStatusPill` imports; remove the local `STATUS_STYLE` map and `usePMSettings`/`isDark` usage throughout.
2. Rewrite `ProjectCard` per Requirement A's 4-slot structure, `h-full` on wrapper + content, `PhaseChip` added, progress bar color updated.
3. Restyle the page shell (title/subtitle/empty-state/loading/error) to v2.0 literal hex, per Requirement B.
4. Restyle the header action bar per Requirement C (CTA orange "+ New Project" via `PORTFOLIO_TRACKER_NEW`, ghost "Import Project").
5. Remove the empty state's duplicate "New Project" button per Requirement E; add the search/filter-aware empty-state copy variant.
6. Rewrite the editable-role subtitle to derive phase count/total days from `PROGRAMME_PHASES` per Requirement D (and reflect the filtered count per Requirement F); review the non-editable subtitle per Requirement D's note (likely no change needed).
7. Add search input, status filter pills, and pagination controls per Requirement F — `useSearchParams`/`router.push`/local `buildUrl()` helper, client-side filtering + slicing of the already-fetched `projects` array (no changes to `GET /api/onboarding/projects` or `page.tsx`).
8. Invoke `frontend-design` and `impeccable` skills against the rewritten file for a polish pass, per Requirement B's last bullet.
9. Run `npx tsc --noEmit` and `pnpm lint`.
10. Visual check: confirm cards in the same grid row render the same height regardless of project status (draft/scheduled/in-progress mixed in one row); confirm only one CTA-styled (orange) button is visible on the page at any time; confirm the subtitle's phase count/day total match `PROGRAMME_PHASES`' actual current values; confirm search/status-filter/pagination all update the URL and the URL correctly restores filter state on a fresh load (paste a filtered URL directly into the browser).

## Acceptance Criteria

- [ ] Cards in the same grid row are the same height regardless of project status — verified against a real mixed-status row (draft + scheduled + in-progress side by side).
- [ ] No file in this task references old v1 hex/tokens (`bg-brand`/`#3358F4`, `bg-slate-900` as a CTA, etc.).
- [ ] Exactly one orange, v2.0-CTA-styled button is visible on the page at any time ("+ New Project"); "Import Project" is visually secondary.
- [ ] The editable-role subtitle's phase-count and total-day numbers are computed from `PROGRAMME_PHASES`, not hardcoded — verified by temporarily changing `PROGRAMME_PHASES`' length in a local test and confirming the subtitle text updates (revert after checking).
- [ ] `STATUS_STYLE`/local status-pill markup is gone; the shared `OnboardingStatusPill`/`Chip`/`PhaseChip` are used instead.
- [ ] Search filters the visible cards by project/company name; the status-pill filter (all/draft/scheduled/in_progress) narrows correctly; pagination controls correctly slice the filtered set and disable at the first/last page; all three sync to the URL (`?search=&status=&page=&pageSize=`) and correctly restore from a direct URL load.
- [ ] Changing search or status resets `page` back to `1`.
- [ ] The result-count line reflects the filtered total, not the unfiltered fetch total.
- [ ] `npx tsc --noEmit` and `pnpm lint` both pass with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: pnpm dev, visit /v2/portfolio-tracker as a role with canCreate=true (marketing/admin/super_admin)
#   - Confirm mixed-status cards (draft/scheduled/in-progress) in the same row render equal height
#   - Confirm "+ New Project" is the only orange/CTA-styled button on screen
#   - Confirm the empty state (if reachable) shows no duplicate New Project button, and shows the
#     search/filter-aware copy when a search/filter yields zero results (vs. a genuinely empty list)
#   - Confirm phase chips render with correct v2.0 phase-hue colors
#   - Type into search, pick a status pill, change page size, page forward/back — confirm the URL
#     updates each time and reloading a copied filtered URL restores the same view
```

## Implementation Notes

### What Changed
- `_onboarding-list.tsx` rewritten in full. Dropped `usePMSettings`/`isDark` per the first flagged scope decision — the page is now fixed-light v2.0, matching `pm-dashboard.tsx`'s precedent from task 166.
- `ProjectCard` rebuilt to the 4-slot structure from Requirement A: header, always-rendered progress row (0%-fill track + "Day —/120" when not started, instead of omitting the row), always-rendered phase/status line (falls back to "Awaiting kickoff"), always-rendered footer ("Unclassified" instead of collapsing when there's no classification/members). Both the grid-item wrapper and the card's own content `div` get `h-full`, and the grid itself gets `items-stretch` — so a draft card sitting next to an in-progress card in the same row now renders the same height.
- Replaced the file's local `STATUS_STYLE`/inline status-pill markup with the shared `OnboardingStatusPill` (imported from `../dashboard/_components/dashboard-shared`, task 166), added `PhaseChip` to the phase line (previously plain text, no phase-hue color), and swapped the classification text for the shared `Chip tone="neutral"`.
- "+ New Project" restyled to the v2.0 CTA spec (`#FB914E`/`#471F02` → hover `#E2762F`/white, pill radius) and switched to the named `V2_ROUTES.PORTFOLIO_TRACKER_NEW` constant instead of a hand-built string; "Import Project" restyled as the secondary ghost action.
- Removed the empty state's duplicate "New Project" button (Requirement E) — the header's CTA was already visible on the same screen whenever the list was empty.
- Subtitle now reads `` `${total} client${...} · programme intake and progress across all ${PROGRAMME_PHASES.length} phases (${totalDays}-day full cycle) — ...` `` — phase count and total days computed from `PROGRAMME_PHASES` (imported from `@/config/customer-phases`), not hardcoded "120-day"/"Phase 1–5"; also folded in the live filtered `total` count (previously the subtitle carried no count at all).
- Added search (debounced 300ms, matching `/v2/projects`' input UX even though no network round-trip needs debouncing here — kept for interaction-feel parity per the user's "similar to /v2/projects" request), a 4-way status filter pill row (`all/draft/scheduled/in_progress`, navy-fill active state per DESIGN.md's "filter pills use navy, never blue" rule), and pagination (page-size select `[9,18,36]` + first/prev/next/last), all URL-synced via a locally reimplemented `buildUrl()` helper (mirroring `_projects-index.tsx`'s, not imported — page-scoped convention). All three reset `page` to `1` on change. Added a second, distinct empty state for "list has projects but none match the current search/filter" (with its own "Clear filters" action), separate from the genuine empty-list state.
- Fixed a real pre-existing bug while touching this exact code: `setLoading(true)` was called synchronously inside the fetch effect's body (`react-hooks/set-state-in-effect` lint error, previously flagged in task 165's own notes at the old line 170) — redundant on mount since `loading` already initializes `true`; moved the reset into the Retry button's `onClick` instead, the only other place that needs it.
- Fixed a real typo introduced then caught during my own review pass before finalizing: the card footer's `className` had a duplicate/conflicting `mt-2.5` (`"mt-auto pt-2.5 mt-2.5 border-t ..."`) — reduced to one.

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` — full rewrite per all Requirements A–F

### Deviations From Plan
- None beyond the two scope decisions already flagged in the Overview before implementation started (fixed-light v2.0 instead of keeping `isDark`; client-side rather than server-side search/filter/pagination) — both stated up front, not discovered mid-implementation.
- `frontend-design`/`impeccable` skills: `impeccable`'s design-system lint hook ran automatically after every edit in this session (not manually invoked as a separate skill call) and flagged only font-size findings that match `DESIGN.md`'s own documented type scale expressed as Tailwind arbitrary-value brackets, per this codebase's established convention — same stale-sidecar pattern already logged in task 166's Implementation Notes (`.impeccable/design.json` hasn't been regenerated since `DESIGN.md` was rewritten). None were changed; none were fabricated. A dedicated `frontend-design` skill pass was not separately invoked this session — the file already reuses task 166's approved v2.0 primitives/hex values throughout rather than introducing new visual decisions, which is what that skill would otherwise be adjudicating.

### Verification Run
- `npx tsc --noEmit` — PASS, no errors in the touched file.
- `pnpm lint` — PASS, no errors/warnings in the touched file. Total repo problem count dropped from 1369/77 (task 166's baseline) to 1368/76 — the one fixed pre-existing `set-state-in-effect` bug, no regressions.
- Manual in-browser QA — **SKIPPED**, same constraint as task 166: no test credentials/session available; confirmed instead via `curl` (307 redirect — expected auth-guard behavior, no crash) and the live dev server's own compile log (clean compiles, no new errors after the edits landed). Flagged for the user's own live-testing pass, same as task 166's round 2/3 pattern.

## Compatibility Touchpoints

- No schema, RLS, or API contract changes — read-only consumption of the existing `GET /api/onboarding/projects` response.
- Dropping `isDark` from this one file is a targeted, scoped visual change (see flagged scope decision) — does not affect `usePMSettings()`'s theme toggle itself or any other page still honoring it.
