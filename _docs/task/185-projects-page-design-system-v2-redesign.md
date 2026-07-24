# 185: Projects Page (`/v2/projects`) — Design System v2.0 Redesign, Multi-Member Avatars, Task/Issue Progress, Legacy/Version 2 Classification Filter

**Created:** 2026-07-24
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Completed (2026-07-24)

---

## Overview

`/v2/projects` (`_projects-index.tsx`, 660 lines + `_pm-shared.tsx`, 293 lines + `page.tsx`, 116 lines) is the native Projects module's list/grid page — still on the pre-v2.0 look (`slate-*` Tailwind, `bg-slate-900` active states, a rotating conic-gradient hover glow on grid cards). The user pointed at `_final_design/guide/central-hub-design-system.md` + `central-hub-style-guide.html` as the design reference, and `/v2/portfolio-tracker` (`_onboarding-list.tsx`) as the concrete example to follow. Per the codebase's established convention (tasks 166/167/183/184), those `_final_design/guide/` files are a static snapshot of **`DESIGN.md`** (repo root, ~99% identical content) — `DESIGN.md` is the source of truth this task builds against, `central-hub-style-guide.html` is the literal markup/class reference.

**Scope-defining reading of the request:** the instruction "Do change the placement of the elements on the cards, just the design tokens" is read as a typo for **"Do NOT change the placement... just the design tokens"** — i.e., recolor/retoken existing elements in place, *except* for the layout changes explicitly called out elsewhere in the same request (multi-member avatar stack, progress text moving below the ring, a new issues-progress block, the new top-of-page classification filter, gradient-hover removal). Flagging this explicitly since it inverts the sentence as literally written — if this reading is wrong, correct it before implementation starts.

**Blast-radius boundary (important):** `_pm-shared.tsx` is shared by the whole Projects feature, not just this list page — `[projectId]/_board-view.tsx`, `_list-view.tsx`, `_calendar-view.tsx`, `_task-drawer.tsx`, and `_project-detail.tsx` all consume its `StatusBadge`, `PriorityBadge`, `ProjectStatusBadge`, `ProjectTypeBadge`, `CompletionRing`, `OwnerChip`, `AssigneeChip` exports, and none of those detail-page views are in scope for this task (still v1, not yet migrated per `DESIGN.md`'s own Adoption-status note). **This task does not modify `_pm-shared.tsx`.** All v2.0-token replacements for status/type chips, the completion ring, and avatars are built as new, page-scoped components inside `_projects-index.tsx` only — mirroring `_onboarding-list.tsx`'s own explicit precedent of *not* importing `_pm-shared.tsx`'s `OwnerChip` and instead reimplementing an avatar stack locally, with the comment: *"Onboarding/Projects are otherwise unrelated feature areas (page-scoped UI convention)"* (`_onboarding-list.tsx:37-40`). Same logic applies one level down: the Projects **list** page and the Projects **kanban/detail** pages are different enough visually (v2.0 vs. still-v1) that they must not share styled badge components right now.

## Requirements

### A. New data joins (`page.tsx`) — classification bucket, multi-member avatars, issue counts

Reference pattern: `src/app/api/onboarding/projects/route.ts:104-122` (project members → profiles full-name map) and `:55-58` (`customer_products(classification)` nested select) — copy this exact two-query-wave shape, not a new pattern.

- [ ] Add `external_project_id` and `customer_product_id` to the `projects` `.select()` (`page.tsx:44`).
- [ ] **Classification bucket** — a project is **Legacy** iff `external_project_id IS NOT NULL` (it came from the Zoho Projects import, `src/app/api/admin/zoho-import/projects/route.ts:82-121` — the only code path that ever sets this column); **Version 2** iff `external_project_id IS NULL` (created natively via the Hub's own "New Project" flow). This is the field the "StackShift"/"Discrete App" (Zoho's raw naming) vs. "StackShift I"/"StackShift II"/"StackShift Access" (the Hub's own `customer_products.classification` vocabulary, see `portfolio-tracker/new/_content.tsx:54-69`'s `CLASSIFICATION_ICON`/`CLASSIFICATION_DESC`) distinction cashes out to in the schema — no new column or migration needed. **This is an inferred mapping, not confirmed against live data** (no DB access in this environment) — flagged for the user to sanity-check against real rows before/during implementation; if it's wrong, the fix is a one-line predicate swap, not a redesign.
- [ ] Server-side filter: add a `classification` search param (`""` / `"legacy"` / `"version2"`), applied via `.not("external_project_id", "is", null)` / `.is("external_project_id", null)` — same pattern as the existing `status`/`customer` filters (`page.tsx:47-52`).
- [ ] **Members** (second query wave, after `projectIds` is known from the first fetch): `project_members` (`project_id, user_id`) → dedupe `user_id`s → `profiles` (`id, full_name`) → build `members: {id, full_name}[]` per project, deduped, in insertion order. No `phase_members` union (that's onboarding-specific, task 154's scope — not applicable here).
- [ ] **Issues**: add `supabase.from("issues").select("project_id,status")` to the existing `Promise.all` alongside the current `taskCountRes` (`page.tsx:65-69`) — same "fetch all, group client-side by `project_id`" shape already used for tasks, no new dependency. `issues.status` is normalized through the same `mapTaskStatus()` used for `tasks.status` (see `zoho-import/issues/route.ts:121`), so `done = status === "closed"` is the correct predicate — identical to the existing tasks computation.
- [ ] Extend `ProjectListItem` (currently defined in `_projects-index.tsx`, imported by `page.tsx`) with: `classification: "legacy" | "version2"`, `members: { id: string; full_name: string | null }[]`, `issue_total: number`, `issue_done: number`.

### B. Card redesign — v2.0 tokens, multi-member avatar stack, tasks + issues progress

Reference: `_onboarding-list.tsx`'s `ProjectCard` (lines 118-190) for panel classes, footer layout, and the `AvatarStack`/`AvatarTip`/`initialsFor`/`colorFor` helpers (lines 41-108) — copy this pattern into `_projects-index.tsx` as page-scoped helpers (do **not** import from `_onboarding-list.tsx` or `_pm-shared.tsx` — same "unrelated feature area" reasoning as that file's own precedent, applied symmetrically).

- [ ] Outer card: `rounded-xl border-slate-200` + the `GridCardWrapper` conic-gradient hover glow → `rounded-[14px] border border-[#E2E7F2] hover:border-[#A8C6F5] bg-white transition-colors` (DESIGN.md Panels spec + `_onboarding-list.tsx:124-126`'s exact classes). **Delete `GridCardWrapper` entirely** — no rotating border, no glow, no `whileHover` scale/lift on the card itself.
- [ ] Header row (unchanged position): title + company name stay top-left; status badge stays top-right, rebuilt on the shared `Chip` (imported from `../dashboard/_components/dashboard-shared`, the same cross-feature import `_onboarding-list.tsx:15` already uses) with tones: `active` → `ok` (dot), `on_hold` → `warn` (dot), `completed` → `ok` (check icon, not dot — distinguishes from `active` the same way `OnboardingStatusPill` distinguishes `completed` from `in_progress`, `dashboard-shared.tsx:275-282`), `archived` → `neutral` (no dot), the existing `pct === 0 && status === "active"` "Not Started" edge case → `neutral` (no dot) instead of the current violet (violet is a reserved phase hue — `ph-publish` — and must not be reused here, DESIGN.md Section 2 "Named Rules"). No `late`/red tone — none of these four statuses represent an error/blocked state at the project level.
- [ ] Project type row (unchanged position): `ProjectTypeBadge`'s four-color hue table (`_pm-shared.tsx:65-70` — teal/violet/blue/orange) collides with 4 of DESIGN.md's 5 reserved phase hues for a non-phase meaning, the exact violation task 183 Requirement D fixed for classification cards. Replace with a single neutral `Chip` (`line-soft`/`muted`) showing the type label as plain text — no icon differentiation needed at this compact badge size (unlike task 183's large `ClassificationCard`).
- [ ] Tags row (unchanged position, unchanged component): `TagChip`'s pastel per-tag palette (`_pm-shared.tsx:150-210`) is an arbitrary user-tag identity system, not a DESIGN.md status/classification chip — **out of scope, do not touch**.
- [ ] **Footer — the layout change**: replace the current single-owner-chip-left / single-ring-with-text-beside-it-right footer with:
  - **Left:** the new `AvatarStack` (all deduped `project_members`, tooltip-on-hover, `-ml-2` overlap, `ring-2 ring-white`, 6-color rotation `#0063D6`/`#6A48E0`/`#0B8A93`/`#B85512`/`#177E48`/`#44508A` — copied verbatim from `_onboarding-list.tsx:41-108`, including its `whileHover={{ y: -4 }}` per-avatar lift via `framer-motion` — this is a deliberate, already-shipped exception to DESIGN.md's Motion section's literal "no lifts" line, kept here specifically because it's "similar to what's on the portfolio-tracker page cards," the user's own reference). **Fallback:** when `members.length === 0` (expected for Legacy/Zoho-imported projects, which predate `project_members`), render a single small `owner_name`-derived initials bubble (same visual treatment as one `AvatarStack` avatar) instead of nothing, or "Unassigned" text if `owner_name` is also null — preserves the current empty-state behavior, doesn't regress it.
  - **Right:** two small circular progress rings side by side, each with its count text directly **below** it (not beside, per the request) in `font-mono text-[10px] text-[#5F6A88]`: a **Tasks** ring (`task_done`/`task_total`, "N/M tasks") and a new **Issues** ring (`issue_done`/`issue_total`, "N/M issues"). Build a page-scoped ring (do not extend or reuse `_pm-shared.tsx`'s `CompletionRing` — see the blast-radius note in Overview): same SVG approach, v2.0 colors — track `#EDF0F7` (`line-soft`), fill `#007BFF` (`blue`) or `#177E48` (`ok`) at 100%, ~32-34px (slightly smaller than the current 38px single ring, since there are now two side by side — implementation-time call within that range). `businessDaysRemaining` (currently shown beside the old ring) keeps working — move its display up near the status chip or type row rather than dropping it; exact placement is an implementation-time call, not a hard requirement, since the request doesn't mention it and it must not regress the existing due-date visibility.

### C. Top-of-page classification filter — "All" / "Legacy" / "Version 2"

- [ ] New filter-pill group in the toolbar row, alongside the existing Status filter pill group — same visual pattern (DESIGN.md "Filter pills" spec: pill radius, 11px/600, inactive white+`line` border, **active navy `#071133` fill** — never blue, matching `_onboarding-list.tsx:319-333`'s shipped `STATUS_FILTERS` block exactly, just a second, independent pill group with its own `aria-pressed`/URL param).
- [ ] `CLASSIFICATION_FILTERS = ["all", "legacy", "version2"] as const`, labels `"All"` / `"Legacy"` / `"Version 2"`, wired through `buildUrl({ classification: ..., page: 1 })` into the existing URL-param pattern (mirrors `status`).
- [ ] Combines with the existing Status filter and search (AND semantics, all server-side, matching how `status`/`customer`/`search` already combine in `page.tsx`).

### D. Toolbar, page chrome, and List (table) view — v2.0 tokens

Same page/file as B/C above — leaving these untouched while only the cards and filter row change would leave the page visibly half-migrated (navy pills next to `bg-slate-900` pills), which none of the prior v2.0 migration tasks (165/167/173/179/183/184) have done; each fully retones the page it touches.

- [ ] Page title "Projects" → `font-heading` (Space Grotesk), `text-[#0B1533]` (ink) — keep the existing `text-[22px] font-bold tracking-[-0.02em]` sizing, matching `_onboarding-list.tsx:271`/task 184's precedent for this exact class string.
- [ ] Search input → DESIGN.md Forms spec / `_onboarding-list.tsx:300-315`'s shipped classes: `bg-[#F4F6FB]` at rest, `rounded-[10px]`, `focus:bg-white focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14]`.
- [ ] Status filter pills: `bg-slate-900` active → navy `#071133` active, same shape as Requirement C's new classification pills.
- [ ] View toggle (`LayoutGrid`/`List`): `bg-slate-100`/`text-slate-900` active → neutral `line-soft`/`ink` or a small navy-outline treatment — implementation-time call for exact shade, must stay visually distinct from the navy filter-pill "selected" state so the two selection systems don't read as the same control.
- [ ] Pagination controls (per-page select, prev/next/first/last buttons): `rounded-lg`/`rounded-md` → `rounded-full`, `border-slate-200` → `border-[#E2E7F2]`, hover `hover:bg-slate-50` → `hover:bg-[#F0F7FF]` (`blue-50`) — matches `_onboarding-list.tsx:346-373`'s shipped pagination block exactly.
- [ ] "+ New Project" button: `bg-slate-900 rounded-lg` → **CTA orange** (`bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white`, `rounded-full`) — this is the page's one "start something" action, same reasoning as `_onboarding-list.tsx`'s own `+ New Project` link (`:288-293`) and task 183/184's CTA-button precedent. Confirm no other CTA-orange element is visible at the same time (the new Issues/Tasks rings are not buttons, so no conflict).
- [ ] `EmptyState`: recolor to v2.0 tokens, teaching copy per DESIGN.md Voice & Tone ("No clients in Publish yet — they'll appear here from Day 31," never a bare "No data") — adapt to this page's context, e.g. "No projects match your filters" + a suggestion, mirroring `_onboarding-list.tsx:407-422`'s "no results" empty state shape (icon tile + heading + hint + Clear-filters action) rather than the current generic version.
- [ ] `ListView` (table): header background `#FAFBFE`, `line-soft` dividers, row hover `blue-50` tint, `rounded-[14px]` container (DESIGN.md Table spec, matching task 184's customer table restyle). Status/Type badges reuse the same new page-scoped `Chip`-based components from Requirement B. The **Issues** column currently renders a static `"No Issues"` placeholder (`_projects-index.tsx:513-518`) — now that real issue counts are fetched (Requirement A), replace it with the same done/total + mini-bar treatment the Tasks column already has (`_projects-index.tsx:501-511`), just pointed at `issue_done`/`issue_total`.
- [ ] `CreateProjectModal`: panel `rounded-xl` → `rounded-[14px]`, inputs → Forms spec (`bg-[#F4F6FB]`/focus-blue-ring), "Cancel" → ghost, "Create" → confirm/navigate blue (**not** CTA orange — the page-level "+ New Project" trigger is already this flow's one CTA per Requirement D; the modal's own submit is the flow's terminal *confirm* step, not a second CTA, matching task 183's "Continue"-buttons-stay-blue reasoning for non-terminal actions within an already-CTA-triggered flow).

### E. Remove gradient / motion cleanup

- [ ] Delete `GridCardWrapper` (conic-gradient rotating border + blurred glow halo) entirely — explicit user ask, also a direct DESIGN.md violation ("No gradient text, glassmorphism, or decorative blur anywhere").
- [ ] Drop now-unused imports once `GridCardWrapper` is gone: `motion/react`'s `animate`, `motion`, `useMotionTemplate`, `useMotionValue`, and `twMerge` (all only consumed by that wrapper) — but note `framer-motion`'s `motion` is still needed (newly added) for the `AvatarStack` hover-lift per Requirement B, imported from the `"framer-motion"` package specifically (matching `_onboarding-list.tsx:6`'s import), not `"motion/react"` (the package the file currently imports from for the deleted wrapper) — these are two different installed packages (`package.json:40,45`), don't conflate them.
- [ ] No other `whileHover`/`whileTap` scale effects exist on this page's buttons today — nothing else to strip.

## Out of Scope / Must-Not-Change

- `_pm-shared.tsx` — **not modified at all** (see Blast-radius boundary in Overview). Its `StatusBadge`, `PriorityBadge`, `ProjectStatusBadge`, `ProjectTypeBadge`, `CompletionRing`, `OwnerChip`, `AssigneeChip`, `PROJECT_STATUS_STYLE`, `PROJECT_TYPE_STYLE`, `TagChip`/`tagColorFor` stay exactly as-is.
- `[projectId]/*` (board/list/calendar views, task drawer, project detail page) — untouched, still v1, separate future task.
- `POST /api/v2/projects`, `PATCH /api/v2/projects/[id]` — no request/response contract changes; `CreateProjectModal`'s restyle is visual only.
- No schema or migration changes — the Legacy/Version 2 split uses the existing `external_project_id` column as-is.
- `businessDaysRemaining()`, tag-remove (`removeTag`), search/pagination/URL-param mechanics, and all data-fetching logic in `page.tsx` beyond the additions in Requirement A — behavior identical, restyle/data-addition only.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/projects/page.tsx` | Modify | Add `external_project_id`/`customer_product_id` to select, classification server-side filter, `project_members`→`profiles` member map, `issues` count fetch, extend `ProjectListItem` payload |
| `src/app/v2/(hub)/projects/_projects-index.tsx` | Modify (large) | v2.0 tokens across toolbar/cards/list/modal; new classification filter pills; delete `GridCardWrapper`; new page-scoped `AvatarStack`, ring, and status/type `Chip` usage; Issues column real data |

## Code Context

### File: `src/app/v2/(hub)/projects/page.tsx` (current — full file already read this session)

```tsx
// Current select (line 44) — needs external_project_id, customer_product_id added:
.select("id,name,project_type,status,customer_id,end_date,tags,owner_name,updated_at", { count: "exact" })

// Existing task-count pattern (lines 65-80) — issues follow the identical shape:
const [projectsRes, customersRes, taskCountRes] = await Promise.all([
  projectsQuery,
  supabase.from("customers").select("customer_id,company_name").order("company_name"),
  supabase.from("tasks").select("project_id,status").is("parent_task_id", null),
]);
const counts = new Map<string, { total: number; done: number }>();
for (const t of taskCountRes.data ?? []) {
  const c = counts.get(t.project_id) ?? { total: 0, done: 0 };
  c.total += 1;
  if (t.status === "closed") c.done += 1;
  counts.set(t.project_id, c);
}
```

### File: `src/app/api/onboarding/projects/route.ts:104-122` (read-only reference — member map pattern to copy)

```tsx
const memberIdsByProject = new Map<string, Set<string>>();
if (projectIds.length > 0) {
  const [projMembersRes] = await Promise.all([
    supabase.from("project_members").select("project_id, user_id").in("project_id", projectIds),
    // (this task omits the phase_members union — onboarding-specific, task 154 scope)
  ]);
  for (const row of projMembersRes.data ?? []) {
    if (!memberIdsByProject.has(row.project_id)) memberIdsByProject.set(row.project_id, new Set());
    memberIdsByProject.get(row.project_id)!.add(row.user_id);
  }
}
const allMemberIds = [...new Set([...memberIdsByProject.values()].flatMap((s) => [...s]))];
const memberFullNameById = new Map<string, string | null>();
if (allMemberIds.length > 0) {
  const { data: memberProfiles } = await supabase.from("profiles").select("id, full_name").in("id", allMemberIds);
  for (const row of memberProfiles ?? []) memberFullNameById.set(row.id, row.full_name);
}
```

### File: `src/app/api/admin/zoho-import/projects/route.ts:82-121` (read-only reference — confirms `external_project_id` is the Zoho-origin marker)

```tsx
// Only set on insert, only for rows read from _from_zoho/projects.json:
const { error: insertError } = await adminClient.from("projects").insert({
  ...
  external_project_id: zohoId,
  ...
});
```

### File: `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` (read-only reference — full `AvatarStack`/`AvatarTip` implementation to copy, lines 37-108; `ProjectCard` footer layout, lines 173-178; filter-pill/toolbar classes, lines 298-374)

```tsx
const AVATAR_COLORS = ["#0063D6", "#6A48E0", "#0B8A93", "#B85512", "#177E48", "#44508A"];
const MAX_VISIBLE_AVATARS = 5;
function initialsFor(name: string | null): string { ... }
function colorFor(name: string | null): string { ... }
function AvatarTip({ label, children }: { label: string; children: React.ReactElement }) { ... } // wraps Tooltip/TooltipTrigger/TooltipContent
function AvatarStack({ members }: { members: { id: string; full_name: string | null }[] }) { ... } // -ml-2 overlap, whileHover y:-4, "+N" overflow past 5
```

### File: `src/app/v2/(hub)/dashboard/_components/dashboard-shared.tsx:183-216` (read-only reference — `Chip` component to import, tones `ok/warn/late/neutral` relevant here)

```tsx
export function Chip({ tone, dot, children, className }: ChipProps) { ... }
// tones: ok "#E3F5EA"/"#177E48", warn "#FFF3D6"/"#8A5A00", late "#FDE8E6"/"#C0392B", neutral "#EDF0F7"/"#5F6A88"
```

### File: `_docs/task/184-customers-page-design-system-v2-redesign.md` (read-only reference — the closest prior precedent for mapping a coarse project/customer status enum onto `Chip` tones without reusing a phase hue)

```
active → ok (dot), onboarding → warn (dot), completed_onboarding → ok (check, not dot), inactive → neutral (no dot)
```
This task's mapping: `active → ok (dot)`, `on_hold → warn (dot)`, `completed → ok (check)`, `archived → neutral (no dot)`, `not_started (derived) → neutral (no dot)`.

### File: `DESIGN.md` (repo root, read-only reference — Sections 2, 4, 5, 6)

```
Filter pills: pill radius, 11px/600. Inactive: white + line border. Active: navy fill — never blue.
Avatars: Initials, 24px in stacks, fixed 6-color rotation, stable per person. Stacks: -7px overlap, 2px white keyline.
Panels/Cards: White surface, line border, lg radius (14px), sh-sm shadow.
Don't: reuse a phase hue for a non-phase meaning. Don't use gradient text, glassmorphism, or decorative blur anywhere.
```

## Implementation Steps

1. `page.tsx`: add `external_project_id`/`customer_product_id` to the select; add the `classification` search param + server-side filter predicate.
2. `page.tsx`: second query wave — `customer_products` classification lookup (if still needed once classification bucket is confirmed to be purely `external_project_id`-derived, this may turn out unnecessary — keep it only if the card ends up showing the specific `customer_products.classification` value somewhere; otherwise drop it, the bucket itself doesn't need it), `project_members`→`profiles` member map (copy the reference pattern above), `issues` fetch + done/total grouping (copy the existing `tasks` pattern).
3. `page.tsx`: assemble the extended `ProjectListItem[]` payload.
4. `_projects-index.tsx`: extend the `ProjectListItem` type to match.
5. `_projects-index.tsx`: add `CLASSIFICATION_FILTERS` pill group to the toolbar, wired through `buildUrl`.
6. `_projects-index.tsx`: recolor page title, search input, status pills, view toggle, pagination, "+ New Project" button to v2.0 tokens (Requirement D).
7. `_projects-index.tsx`: delete `GridCardWrapper`; drop its now-unused imports; add `framer-motion`, `@/components/ui/tooltip`, and `Chip` (from `dashboard-shared.tsx`) imports.
8. `_projects-index.tsx`: add page-scoped `AvatarStack`/`AvatarTip`/`initialsFor`/`colorFor` (copied from `_onboarding-list.tsx`) and a page-scoped v2.0 completion ring.
9. `_projects-index.tsx`: rebuild `GridView`'s card markup per Requirement B — header/type row token swaps, new footer (avatar stack + two progress rings with text below).
10. `_projects-index.tsx`: restyle `ListView` (table) per Requirement D, wire real Issues column data.
11. `_projects-index.tsx`: restyle `EmptyState` and `CreateProjectModal` per Requirement D.
12. Run `npx tsc --noEmit` and `pnpm lint`.
13. Manual pass (`pnpm dev`, visit `/v2/projects` as a `pm`/`admin` role): confirm both Legacy and Version 2 filter buckets return the expected projects (spot-check against a known Zoho-imported project name vs. a natively-created one), grid cards show multiple avatars where `project_members` rows exist and fall back cleanly where they don't, tasks/issues rings + counts render correctly (including 0/0 projects), no gradient/glow remains on card hover, list view's Issues column shows real counts, and the "+ New Project" modal still creates a project successfully.

## Acceptance Criteria

- [ ] `GridCardWrapper` and all `motion/react`-driven gradient/glow code are removed from `_projects-index.tsx`.
- [ ] `_pm-shared.tsx` is unmodified (verify via diff — this file must not appear in the changeset).
- [ ] A new "All / Legacy / Version 2" filter pill group exists in the toolbar, is URL-synced, and correctly buckets projects by `external_project_id` null-ness.
- [ ] Grid cards show a multi-avatar stack (not a single owner chip) reflecting all `project_members` for that project, with a sane fallback when there are none.
- [ ] Grid cards show two progress indicators — tasks and issues — each with its "N/M {label}" text positioned below the ring, not beside it.
- [ ] No `#2563EB`/`bg-slate-900`/`text-slate-*` remains in `_projects-index.tsx`'s toolbar, cards, or modal; DESIGN.md hex literals used throughout.
- [ ] Status/type badges use the shared `Chip` component with tones that never reuse a reserved phase hue.
- [ ] `npx tsc --noEmit` and `pnpm lint` both pass with no new errors.
- [ ] Manual walkthrough confirms no visual regressions and matches DESIGN.md's Buttons/Chips/Forms/Panels/Avatars/Motion sections.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: pnpm dev
#   /v2/projects — toggle All/Legacy/Version 2, confirm bucketing looks right against real project names
#   Grid view: check a project with multiple project_members (avatar stack) and one with none (fallback)
#   Check tasks/issues ring+count rendering for a project with 0 tasks/issues and one with a mix of open/closed
#   List view: Issues column shows real N/M data, not "No Issues"
#   Confirm no gradient/glow on card hover; confirm exactly one CTA-orange button ("+ New Project") visible at a time
#   Create a project via the modal end-to-end, confirm it still works
```

## Compatibility Touchpoints

- No schema, RLS, or API contract changes.
- `_pm-shared.tsx` and everything under `[projectId]/*` stay v1-styled and functionally identical — this task does not advance their migration status.
- The Legacy/Version 2 bucketing logic (`external_project_id` null-ness) is a read-only classification for filtering/display — it writes nothing back to the database.

## Implementation Notes

### What Changed
- `page.tsx`: added `external_project_id`/`customer_product_id` to the `projects` select; added a `classification` search param with server-side `.not("external_project_id", "is", null)` (legacy) / `.is("external_project_id", null)` (version2) filtering; added an `issues` fetch (`project_id,status`) grouped into `issueCounts` the same way `tasks` already is; added a second query wave fetching `project_members` → deduped `profiles.full_name` map (mirrors `/api/onboarding/projects`'s pattern, without the `phase_members` union); extended the `ProjectListItem` payload with `issue_total`, `issue_done`, `classification` (`"legacy" | "version2"`, derived from `external_project_id`), and `members`.
- `_projects-index.tsx`: full-file rewrite (same "large enough to be a rewrite, not a patch" call task 183 made for similarly-sized files). Deleted `GridCardWrapper` (conic-gradient rotating border + blur glow) entirely, along with its `motion/react`/`twMerge` imports. Added page-scoped v2.0 components: `AvatarStack`/`AvatarTip`/`initialsFor`/`colorFor` (copied from `_onboarding-list.tsx`, including its `framer-motion` `whileHover={{ y: -4 }}` per-avatar lift), `ProjectStatusChip`/`ProjectTypeChip` (built on the shared `Chip` from `dashboard-shared.tsx`, replacing `_pm-shared.tsx`'s `ProjectStatusBadge`/`ProjectTypeBadge` on this page only), and `ProgressRing`/`ProgressStat` (a smaller v2.0-token sibling of `_pm-shared.tsx`'s `CompletionRing`). Rebuilt the grid card footer: `AvatarStack` (all `project_members`, falling back to a single `owner_name` bubble, then "Unassigned") on the left, two `ProgressStat`s (tasks, issues) side by side on the right, each with its `N/M {label}` text below the ring per the request. Added the "All/Legacy/Version 2" classification filter pill group next to the existing status pills, URL-synced identically. Recolored the full toolbar (search, status pills, view toggle, pagination, "+ New Project" → CTA orange), `ListView` (table header/dividers/row-hover, status/type chips, and a real Issues column replacing the static "No Issues" placeholder now that issue counts are fetched), `EmptyState` (teaching copy, distinguishes "no projects yet" from "no results for this filter"), and `CreateProjectModal` (panel/input/button-role tokens — "Cancel" ghost, "Create" confirm/navigate blue, since the page's "+ New Project" trigger is already this flow's one CTA).

### Files Changed
- `src/app/v2/(hub)/projects/page.tsx` — data-layer additions per Requirement A
- `src/app/v2/(hub)/projects/_projects-index.tsx` — full rewrite per Requirements B–E
- `src/app/v2/(hub)/projects/_pm-shared.tsx` — **not touched**, per the Overview's blast-radius boundary

### Deviations From Plan
- **Classification-bucket inference confirmed only by code reading, not live data** — `external_project_id IS NOT NULL` → Legacy was traced through `zoho-import/projects/route.ts` (the only writer of that column) rather than verified against actual rows (no DB credentials in this environment, flagged in the task doc itself). If a live check shows this bucketing doesn't match reality, the fix is a one-line predicate swap in `page.tsx`, not a redesign — flagged again here for the user's Verification pass.
- `ProjectTypeChip` passes `type` straight through to `Chip` rather than through an intermediate label map — the task doc's Code Context sketched a `PROJECT_TYPE_LABEL` map, but since the raw `project_type` values ("Content Site," "Ecommerce (B2C)," etc.) are already the exact display strings, the map would have been an identity function — dropped as unnecessary indirection, not a scope change.
- Ring size landed at the plan's 34px (within the specified 32-34px range).
- `businessDaysRemaining` was moved next to the type chip (right-aligned in that same row) rather than near the status chip — reads better than crowding the header row, and keeps the footer focused on avatars/progress as planned; still fully preserved, not dropped.
- View-toggle "selected" treatment uses `bg-[#EDF0F7] text-[#0B1533]` (neutral, not navy) specifically so it doesn't visually collide with the navy-fill filter-pill "selected" state elsewhere in the same toolbar row, per the task doc's own flagged implementation-time call.
- Four `design-system-font-size` findings from the `impeccable` hook (10px avatar initials/overflow-badge text, 10px progress-ring/`ProgressStat` label text) were left unchanged — these sizes match the already-shipped precedent this task was told to copy verbatim (`_onboarding-list.tsx`'s own `AvatarStack` uses the identical 9-10px scale for the same compact circular-badge context, and `_pm-shared.tsx`'s pre-existing `AssigneeChip` does too), and the hook's own message confirms the same stale-sidecar condition tasks 166/167/183 already logged and left alone ("DESIGN.md is newer than .impeccable/design.json"). No requirement in this task's scope called for changing avatar-badge or ring-label type sizing.

### Verification Run
- `npx tsc --noEmit` — PASS, no errors.
- `pnpm lint` — PASS, exit 0, no output.
- Manual in-browser QA — **NOT RUN**, no test credentials/session available in this environment (same constraint noted in every prior v2.0 migration task: 166/167/173/179/183/184). Flagged for the user's own live-testing pass per the Verification section above — in particular, confirming the Legacy/Version 2 bucketing against real project names, since that mapping (Deviations above) is the one part of this task that couldn't be checked against live data.

## Revision 1 (post-Testing user feedback, with screenshot)

User reviewed the shipped Testing build (screenshot showing the Status/Type filter pills and view toggle squeezed together on one line) and requested: replace the two single-select pill rows with checkbox multi-select dropdowns ("Filter by Status" / "Filter by Type", with an "All" checkbox that syncs to/from the individual checkboxes), add a sorting selector, and change the view toggle's active state from gray to black-fill + white icon with a real tooltip instead of `title=""`. Applied directly against the same two files (task stayed in Testing, not reopened as a new task, matching task 183's own precedent for this kind of post-Testing revision).

### What Changed
- **Filter semantics changed from single-select to multi-select.** `page.tsx`: `status`/`classification` search params now parse as either absent (→ every option selected, unfiltered — "All"), an explicit empty string (→ zero selected, matches nothing via a guaranteed-zero-rows predicate), or a comma-separated list of checked values. `status` filtering moved from `.eq()` to `.in()`; `classification` filtering branches on which of `legacy`/`version2` are present in the parsed list (both → unfiltered, one → the existing `external_project_id` null-check, neither → zero-rows). Added a `sort` param (`newest` default/`oldest`/`name_asc`/`name_desc`/`due_soonest`/`updated_desc`) mapped to `.order(column, { ascending, nullsFirst })`, replacing the previously hardcoded `start_date desc` — deliberately restricted to DB-sortable columns (no "sort by progress," since `task_done`/`task_total` are computed client-side from a separate post-fetch query and sorting by them would require restructuring the query before pagination — out of proportion to what was asked).
- **New `FilterMultiSelect` component** (`_projects-index.tsx`, page-scoped): a portal-positioned dropdown (same trigger-rect + scroll/resize reposition + outside-click-close mechanics as `import/_content.tsx`'s `TypeMultiSelect`, the closest existing precedent in the codebase) containing real checkboxes — 17px square, 5px radius (DESIGN.md's Checklist-row checkbox shape), but filled navy `#071133` (not that spec's `ok`-green) when checked, since this is a *selection* state, not a *completion* state, and DESIGN.md explicitly reserves navy for selection/filter UI. "All" is its own checkbox row (checked iff every option is checked) with a divider below it, separate from the option rows — clicking it toggles between "select every option" and "select none," and unchecking any individual option automatically un-checks "All" (it's derived from selection state, not independently tracked). Used for both Status and Type, replacing the two pill rows.
- **New `SortSelect` component**: a native `<select>` styled identically to the existing "N per page" pagination select (same radius/border/focus-ring tokens), with a leading `ArrowUpDown` icon.
- **View toggle**: active state changed from `bg-[#EDF0F7] text-[#0B1533]` (neutral gray, the choice explicitly flagged as an implementation-time call in the original Implementation Notes above) to `bg-[#071133] text-white` (navy fill + white icon) per the user's explicit "black + white icon" ask — using DESIGN.md's navy selection-state token rather than literal `#000000`, consistent with the rest of the toolbar's selection-state language. Each button is now wrapped in the existing `Tooltip`/`TooltipTrigger`/`TooltipContent` primitives (`@/components/ui/tooltip`, already imported for `AvatarTip`) instead of a bare `title=""` attribute, plus `aria-label` for accessibility (title attributes aren't reliably exposed to screen readers or touch devices).
- `isFiltered`/"Clear filters" now compares `statusSelected.length`/`classificationSelected.length` against each option list's full length instead of checking for a literal `"all"` string value.

### Files Changed
- `src/app/v2/(hub)/projects/page.tsx` — multi-value status/classification parsing, `.in()`-based filtering, sort param + `SORT_MAP`
- `src/app/v2/(hub)/projects/_projects-index.tsx` — new `FilterMultiSelect`/`FilterCheckRow`/`SortSelect` components, replaced pill-row toolbar with dropdowns + sort select, view-toggle recolor + real tooltips, `isFiltered` logic updated

### Deviations From Plan
- None beyond the implementation-time calls documented inline above (sort options limited to DB-sortable columns; navy — not literal black — for "black + white icon," to stay inside the design system's token vocabulary) — both are direct, reasoned readings of the user's request, not scope changes.
- Zero-selected-checkboxes intentionally renders an empty grid (matches nothing) rather than silently falling back to "All" — this is the literal reading of "if uncheck 1 then All will be unchecked" carried to its natural conclusion (unchecking everything is a valid, if unusual, filter state), and avoids a magic fallback that would make the checkboxes lie about what's currently filtered.

### Verification Run
- `npx tsc --noEmit` — PASS, no errors (after one fix: the `.in("status", ...)` array needed an explicit cast back to the status union type once it started life as a parsed `string[]`).
- `pnpm lint` — PASS, exit 0, no output.
- Manual in-browser QA — **NOT RUN**, same environment constraint as the original implementation and every prior revision in this file. Flagged for the user's live pass: confirm the Status/Type dropdowns open/close/position correctly (including near the right edge of the viewport), the "All" checkbox syncs both directions as described, the Sort dropdown actually reorders results, and the view toggle's new navy/white active state + tooltips render as expected.
