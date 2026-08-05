# 207: Developer Dashboard — Design System v2.0 Redesign (Fix Theme Bug) + Hide Tracker/Desk/Orchestration Nav Tabs (Developer Role Only)

**Created:** 2026-08-05
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

The Developer dashboard (`/v2/dashboard` rendered via `DevDashboard` for `role === "developer"`) does not follow the v2.0 design system (`_final_design/guide/central-hub-design-system.md`, reference impl `_final_design/dashboard/webriq-central-hub-dashboard.html`) and has a real rendering bug visible in the current screenshot:

- **Root cause of the bug:** `dev-dashboard.tsx` wraps the page in `isDark ? "pm-dark" : "pm-light"` (from `usePMSettings()`) and its task-card children read theme-scoped CSS custom properties (`--c-text`, `--c-card`, `--c-border`, etc., defined in `globals.css` under `.pm-dark`/`.pm-light`). The KPI/section shell components it imports from `dashboard-shared.tsx` (`KpiCard`, `SectionCard`) are hardcoded light (`bg-white border-slate-200`) and never read those variables. When the user's PM settings have dark theme active, the ambient `pm-dark` class flips `--c-text` to near-white and the inner task cards pick up dark (`--c-card: #121726`) backgrounds, while the KPI numbers (no explicit text color class) inherit a washed-out color against their white card shells, and "Your workspace"/"Team Pool" row labels (`text-(--c-sub)`) go low-contrast. This is exactly the pale "Open 20", near-invisible workspace/team-pool labels, and black floating task cards seen in the screenshot.
- **Design mismatch:** none of the v2.0 tokens (`--navy #071133`, `--blue #007BFF`, `--ink #0B1533`, `--body #3A4565`, `--muted #5F6A88`, Space Grotesk/Inter/JetBrains Mono type roles, 14px panel radius, chip/stat-tile specs, etc.) are used. `dashboard-shared.tsx`'s `KpiCard`/`SectionCard`/`StatusChip`/`PriorityDot` are the pre-v2.0 ("legacy" per their own comments) components — later v2.0 redesigns (`pm-dashboard.tsx`, `_pm-shared.tsx`, tasks 183/191/194/198/206) stopped using them and instead build page-local, fixed-light components with literal v2.0 hex values and no `isDark`/CSS-var dependency at all. This task brings Dev Dashboard in line with that already-established, working pattern rather than patching the CSS-var/isDark approach.

Separately, the developer's sidebar currently shows "Tracker", "Desk", and "Orchestration" nav items. "Desk" (`/v2/dashboard/tasks`) and "Orchestration" (`/v2/orchestration`) are both unbuilt stub pages for developers today, and Tracker (Portfolio Tracker) is a PM-facing programme view not part of a developer's workflow. Hide all three from the sidebar **for the `developer` role only** — every other role's nav is unaffected.

## Requirements

- [ ] Redesign `DevDashboard` (`dev-dashboard.tsx`) to use only v2.0 design-system tokens: literal hex Tailwind classes matching `central-hub-design-system.md` §1 (never `--c-*` CSS vars, never `isDark`/`pm-dark`/`pm-light`), `font-heading` (Space Grotesk) for page/panel titles and stat numbers only, `font-mono` (JetBrains Mono) for IDs/customer codes, `--line`/`--line-soft` borders + `--sh-sm` shadow on every raised surface, 14px (`rounded-[14px]`) panel radius, 5px-radius chips.
- [ ] Fix the theme bug: no dashboard element should ever render with a color that depends on ambient dark-mode CSS vars — every text/bg color must be an explicit literal class (mirrors `pm-dashboard.tsx`'s `StatTile`/`SectionPanel` pattern).
- [ ] Keep the existing data/behavior: 3 KPIs (Open/In Progress/For Review from `classification_records`), the 3-column kanban ("My Tasks"), the unassigned "Team Pool" list, the greeting header (`useGreeting`) — redesign visuals only, do not change the Supabase queries or the `groupByKanban` logic.
- [ ] Stat tiles, panel, chip, list-row, and empty/loading-state visuals should read as siblings of `pm-dashboard.tsx`'s `StatTile`/`SectionPanel`/`EmptyState` and the reference HTML's `.stat`/`.panel`/`.chip`/`.l-item`/`.dq-item` — reuse `Chip`, `SkeletonRow` from `dashboard-shared.tsx` where the fixed tone set (`ok|warn|late|neutral|onboard|migrate|publish|ai|optimize`) actually applies; do **not** force `classification_records.status`/`priority` (a different vocabulary than `tasks.status`) into a phase-hue Chip tone — see Code Context.
- [ ] In `V2HubSidebar` (`v2-hub-sidebar.tsx`), hide "Tracker", "Desk", and "Orchestration" from `workItems` when `role === "developer"`. All other roles keep seeing them exactly as today.
- [ ] Remove/replace the dashboard's own "Your workspace" quick-link row that points at Tracker (now hidden from the dev nav) so nothing on the page links to a nav item a developer can no longer see in the sidebar.
- [ ] Every interactive element (kanban task cards, workspace/team-pool rows) keeps a visible hover state and, where it's a real link/button, a focus-visible ring — per CLAUDE.md's "UI Polish Conventions — Adopted".
- [ ] No emoji, no `<div onClick>`, no `style={{}}` except for values with no Tailwind equivalent (e.g. dynamic avatar background hex, gradient fills) — matches existing codebase rules.

## Out of Scope / Must-Not-Change

- Do not touch `PMDashboard`, `AdminDashboard`, `MarketingDashboard`, or `dashboard-view.tsx`'s role routing.
- Do not hide Tracker/Desk/Orchestration for any role other than `developer` — PM, Admin, Marketing, HR, and Client sidebars must render unchanged.
- Do not remove or restructure the `/v2/dashboard/tasks` or `/v2/orchestration` routes/pages themselves — only their sidebar entry point for developers.
- Do not change the `classification_records` Supabase queries, kanban grouping logic (`groupByKanban`), or add a new `assigned_developer_id` column — that's flagged as a separate future TODO already in the file.
- Do not modify `globals.css`'s `.pm-dark`/`.pm-light` token block — other pages (Marketing/Admin dashboards) still depend on it; this task only stops `dev-dashboard.tsx` from consuming it.
- Do not add dark-mode support to the redesigned Dev dashboard — per CLAUDE.md, v2.0 pages are fixed-light only.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/dashboard/_components/dev-dashboard.tsx` | Modify | Full v2.0 redesign: drop `isDark`/`usePMSettings`/legacy `KpiCard`/`SectionCard`/`StatusChip`/`PriorityDot` imports; add page-local `StatTile`, `SectionPanel`, task-card, and status/priority badge components with literal hex classes, matching `pm-dashboard.tsx`'s pattern. Drop the Tracker row from the workspace quick-links card. |
| `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` | Modify | In `getNavGroups()`, gate "Tracker", "Desk", "Orchestration" out of `workItems` when `isDev` is true. |
| `src/app/v2/(hub)/dashboard/_components/dashboard-shared.tsx` | No change (reference only) | `Chip`, `SkeletonRow` are reused as-is; `KpiCard`/`SectionCard`/`StatusChip`/`PriorityDot` become unused by Dev Dashboard after this change but must stay — still consumed by other dashboards. Do not delete them. |

If `dev-dashboard.tsx` grows past ~350–400 lines after adding the new sub-components (per `nextjs-file-length-best-practices.md`), extract the page-local presentational pieces (`StatTile`, task-card, badge helpers) into a colocated `_dev-dashboard-parts.tsx`, mirroring how other v2.0 pages split large redesigns — but only if the line count actually crosses that line; `pm-dashboard.tsx` stayed single-file at a comparable size, so splitting is not mandatory by default.

## Code Context

### File: `src/app/v2/(hub)/dashboard/_components/dev-dashboard.tsx` (current, to be replaced)
```tsx
export default function DevDashboard({ displayName }: Props) {
  const { settings } = usePMSettings();
  const isDark = settings.theme === "dark";
  ...
  return (
    <div className={`py-6.5 px-8 flex flex-col gap-6 ${isDark ? "pm-dark" : "pm-light"}`}>
      ...
      <KpiCard key={k.label} label={k.label} value={loading ? "—" : k.value} accentClass={k.accentClass} />
      ...
```
Everything under the `isDark`/`pm-dark`/`pm-light`/`--c-*` model must be removed — replace with the pattern below (already proven in this codebase).

### File: `src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx` (pattern to mirror — already v2.0-compliant, fixed-light, no isDark)
```tsx
function StatTile({ icon, iconBg, iconColor, label, value, note, loading }: {...}) {
  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] p-[17px_15px] flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-[#5F6A88]">{label}</span>
        <span className="w-[30px] h-[30px] rounded-lg flex items-center justify-center shrink-0" style={{ background: iconBg, color: iconColor }}>{icon}</span>
      </div>
      <div className="font-heading text-[28px] font-bold leading-none tracking-[-0.02em] text-[#0B1533]">{loading ? "—" : value}</div>
      {note && <div className="text-[11px] text-[#5F6A88]">{note}</div>}
    </div>
  );
}

function SectionPanel({ title, hint, link, linkHref, children, noPad }: {...}) {
  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] overflow-hidden">
      <div className="flex items-center gap-2.5 flex-wrap px-[18px] py-3.5 border-b border-[#EDF0F7]">
        <span className="font-heading text-[15px] font-semibold text-[#0B1533] tracking-[-0.01em]">{title}</span>
        {hint && <span className="text-[11px] text-[#5F6A88]">{hint}</span>}
        {link && linkHref && <Link href={linkHref} className="ml-auto text-[12px] font-semibold text-[#0063D6] hover:underline">{link} →</Link>}
      </div>
      <div className={noPad ? "" : "p-[18px]"}>{children}</div>
    </div>
  );
}
```
Use these two (or dev-dashboard-local equivalents with the same literal-hex approach) for the KPI row and every panel ("My Tasks", "Your workspace", "Team Pool"). Reuse `EmptyState`'s shape (`pm-dashboard.tsx` lines ~140–150) for the "no unassigned tasks" / empty kanban column states instead of the current plain dashed-border div.

### File: `src/app/v2/(hub)/projects/_pm-shared.tsx` (why NOT to force classification-record status/priority into the `Chip` tone enum)
```tsx
// --blue: #007BFF/#E5F1FF (interactive, not a semantic state) · neutral: #5F6A88/#EDF0F7
export const STATUS_STYLE: Record<TaskStatus, { text: string; bg: string; border: string }> = {
  open: { text: "#5F6A88", bg: "#EDF0F7", border: "#EDF0F7" },
  in_progress: { text: "#007BFF", bg: "#E5F1FF", border: "#E5F1FF" },
  ...
};
```
`dashboard-shared.tsx`'s `Chip` component's tone enum (`ok|warn|late|neutral|onboard|migrate|publish|ai|optimize`) reserves `onboard/migrate/publish/ai/optimize` for the fixed 120-day programme phase hues — DESIGN.md explicitly forbids reusing a phase hue for a non-phase meaning (already enforced in tasks 183/185). `classification_records.status` (`open|pending|planning|active|review|on_hold|closed`) and `priority` (`CRITICAL|HIGH|NORMAL|LOW`) are not phase values, so render them the way `_pm-shared.tsx` does: a small local `Record<string, {text; bg}>` of literal hex values, drawn from `--ok/--warn/--late/--blue/--muted` (never a `--ph-*` value), rendered with the same 5px-radius/10px-700 chip shape as `Chip` (either add a small local badge or extend `Chip` with a `hex` escape-hatch prop if reuse across pages seems likely — implementer's call, but do not repurpose `migrate`/`onboard`/etc. tones here).

### File: `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` (nav gating — current)
```tsx
function getNavGroups(role: string | null): NavGroup[] {
  const isAdmin = role === "admin" || role === "super_admin";
  const isDev   = role === "developer";

  const workItems: NavItem[] = [
    { label: "Dashboard", ... },
    ...(!isDev ? [{ label: "Customers", ... }] : []),
    ...(role !== "client" ? [{ label: "Tracker", ... }] : []),
    { label: "Projects", ... },
    { label: "Desk", ... },
    { label: "Orchestration", ... },
  ];
```
Change to also exclude Tracker/Desk/Orchestration when `isDev`:
```tsx
    ...(role !== "client" && !isDev ? [{ label: "Tracker", ... }] : []),
    { label: "Projects", ... },
    ...(!isDev ? [
      { label: "Desk", ... },
      { label: "Orchestration", ... },
    ] : []),
```

### Reference visual target
- `_final_design/guide/central-hub-design-system.md` — the token/component spec, follow §1–§7 exactly.
- `_final_design/dashboard/webriq-central-hub-dashboard.html` — working reference implementation of the same token set (stat tiles, panel, chip, list-row, `dq-item` patterns) to translate into React/Tailwind, same as `pm-dashboard.tsx` already did.

## Implementation Steps

1. In `v2-hub-sidebar.tsx`, update `getNavGroups()` to exclude "Tracker", "Desk", "Orchestration" when `isDev` is true (see Code Context diff above). Manually verify PM/Admin/Marketing/Client nav groups are byte-for-byte unchanged.
2. In `dev-dashboard.tsx`:
   - Remove `usePMSettings`, `isDark`, and the `pm-dark`/`pm-light` wrapper class.
   - Remove the `KpiCard`, `SectionCard`, `PriorityDot`, `StatusChip` imports from `dashboard-shared.tsx`; keep/add `Chip`, `SkeletonRow` as needed.
   - Add page-local `StatTile` and `SectionPanel` components (literal v2.0 hex classes, `font-heading` for numbers/titles) per the `pm-dashboard.tsx` pattern.
   - Add a small local status/priority hex-badge map for `classification_records.status`/`priority`, following `_pm-shared.tsx`'s `STATUS_STYLE`/`PRIORITY_STYLE` pattern (no phase-hue tones).
   - Rebuild the KPI row using `StatTile` (Open / In Progress / For Review), with icon + tinted icon background per §4 stat-tile spec (e.g. blue tint for Open, blue for In Progress, warn tint for For Review — no orange, no phase hues).
   - Rebuild "My Tasks" as a `SectionPanel` containing the existing 3-column kanban; restyle each task card to the panel/line-soft/hover-blue-50 visual language; restyle the loading skeleton to use `--line-soft`-equivalent literal gray, and the empty-column state per `EmptyState`'s visual language (or a compact inline variant).
   - Rebuild the right rail: drop the "Tracker · in progress" row from the workspace quick-links card (keep Projects, or replace with a developer-relevant metric — implementer's call as long as nothing links to a hidden nav item); rebuild "Team Pool" as a `SectionPanel` list matching `.l-item`/`.dq-item` row visuals.
   - Recolor the greeting header to literal `text-[#0B1533]` / `text-[#5F6A88]` (matches `pm-dashboard.tsx`'s greeting block) instead of `text-(--c-text)`/`text-(--c-sub)`.
   - Confirm no remaining reference to `--c-*` custom properties or `isDark` anywhere in the file.
3. If the file exceeds ~400 lines, extract presentational sub-components into `_dev-dashboard-parts.tsx` colocated alongside it.
4. Run `npx tsc --noEmit` and `pnpm lint`; fix any type/lint errors from the removed props (`accentClass`, `badge`, etc. no longer needed once `KpiCard` usage is gone).
5. `pnpm dev`, sign in (or switch) as a `developer`-role user, open `/v2/dashboard`:
   - Confirm sidebar no longer shows Tracker/Desk/Orchestration.
   - Confirm sidebar for a non-developer role (PM/Admin) is unchanged.
   - Confirm stat numbers, panel titles, chips, and task cards render with full contrast/legibility (no washed-out or invisible text) regardless of the user's PM settings theme toggle.
   - Confirm hover/focus states on task cards and list rows.

## Acceptance Criteria

- [ ] `dev-dashboard.tsx` contains no `isDark`, `usePMSettings`, `pm-dark`, `pm-light`, or `--c-*` references.
- [ ] All colors in the redesigned Dev dashboard are literal hex values matching `central-hub-design-system.md` §1 (or the mapped semantic states `--ok/--warn/--late/--blue`), with no phase hue (`onboard/migrate/publish/ai/optimize`) used for a non-phase meaning.
- [ ] Panels use 14px radius, `--line` border + `--sh-sm` shadow; stat numbers and panel titles use `font-heading`; any ID/count/mono value uses `font-mono`.
- [ ] The theme bug from the screenshot (pale "Open" stat number, dark floating task cards, blank workspace/team-pool row text) does not reproduce, verified by toggling the PM settings theme switch while viewing `/v2/dashboard` as a developer — the page looks identical either way (fixed-light).
- [ ] Sidebar hides "Tracker", "Desk", "Orchestration" only for `role === "developer"`; PM/Admin/Marketing/HR/Client nav is unchanged (spot-checked).
- [ ] No element on the Dev dashboard links to a hidden nav destination for the developer role.
- [ ] Existing data behavior (KPI counts, kanban grouping, unassigned list) unchanged.
- [ ] Every interactive row/card has a visible hover state; focus-visible rings intact.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual: sign in as a developer-role user → /v2/dashboard
#  - sidebar: no Tracker/Desk/Orchestration
#  - toggle PM settings dark/light theme → dashboard visuals unchanged (fixed-light)
#  - hover/focus states on task cards, workspace row, team pool rows
# Manual: sign in as a PM/Admin-role user → confirm sidebar unaffected (Tracker/Desk/Orchestration still present)
```

## Compatibility Touchpoints

- `v2-hub-sidebar.tsx` is shared across every v2 role — the conditional must be scoped tightly to `isDev` to avoid regressing other roles' navigation. No other packaging/docs/adapter surface is affected.

## Implementation Notes

### What Changed
- `v2-hub-sidebar.tsx`: `getNavGroups()` now excludes "Tracker", "Desk", "Orchestration" from `workItems` when `role === "developer"`. Every other role's nav array is byte-identical to before (verified by inspection: `isDev` only gates the three new spread blocks; `isAdmin`/`role !== "client"` conditions untouched).
- `dev-dashboard.tsx`: full rewrite. Removed `usePMSettings`/`isDark`/`pm-dark`/`pm-light` wrapper and all `--c-*` CSS-var reads. Removed the `KpiCard`/`SectionCard`/`PriorityDot`/`StatusChip` imports from `dashboard-shared.tsx` (kept only `SkeletonRow`). Added page-local, fixed-light v2.0 components mirroring `pm-dashboard.tsx`: `StatTile`, `SectionPanel`, `EmptyState`, `TaskCard`, `WorkspaceCard`, plus local `StatusBadge`/`PriorityLabel` driven by literal hex maps (`STATUS_HEX`, `PRIORITY_HEX`) instead of `dashboard-shared.tsx`'s phase-hue `Chip` tones, per the task's explicit guidance not to reuse `onboard/migrate/publish/ai/optimize` for non-phase meanings. KPI row now uses `font-heading` numbers + tinted icon chips (neutral/blue/warn) instead of the old plain `KpiCard`. "My Tasks" kanban restyled to literal `#E2E7F2`/`#EDF0F7`/`#0B1533`/`#5F6A88` tokens, `customer_id` now rendered `font-mono` (was plain text before — ID values should be mono per DESIGN.md §2). Dropped the "Tracker · in progress" row from the workspace quick-links card (now a single "Projects" row) since Tracker is hidden from the developer sidebar; removed the now-dead `/api/onboarding/projects` fetch, `trackerInProgress` state, and unused `OnboardingProject` type that only fed that row. "Team Pool" empty state upgraded from a plain `<p>` to the `EmptyState` icon+title+body treatment matching `pm-dashboard.tsx`. All KPI/kanban/team-pool Supabase queries against `classification_records` and `groupByKanban()` are unchanged.

### Files Changed
- `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` — gate Tracker/Desk/Orchestration out of the developer nav.
- `src/app/v2/(hub)/dashboard/_components/dev-dashboard.tsx` — full v2.0 redesign per Requirements.

### Deviations From Plan
- None from the approved scope. One judgment call within an explicitly-flagged "implementer's call" area: the workspace card keeps only a "Projects" row (Tracker row dropped, nothing added in its place) rather than substituting a different metric — simplest option that satisfies "nothing links to a hidden nav item" without inventing new data.
- Pre-existing `impeccable` design-hook findings noted but intentionally left unchanged (both reviewed against DESIGN.md and existing codebase precedent, not new drift from this change):
  - `v2-hub-sidebar.tsx`: 19 pre-existing off-palette colors (`#0F172A`, `#2563EB`, `#64748B`, `#475569`, etc.) predate this edit — the sidebar's own visual redesign is out of scope per the task document ("Out of Scope").
  - `dev-dashboard.tsx`: 4 flagged font sizes (10px/12px dense list/chip text) match the exact sizes already used throughout `pm-dashboard.tsx`, `_pm-shared.tsx`, and `dashboard-shared.tsx`'s `Chip` component (spec'd at "10px/700" in DESIGN.md §4, separate from the primary type-role scale table in §2) — established, accepted convention, not a defect introduced here.

### Verification Run
- `npx tsc --noEmit` - PASS (no output, zero errors)
- `pnpm lint` - PASS (zero errors/warnings)
- `pnpm dev` + `curl /v2/dashboard` - PASS (307 redirect to login, confirms no server-side compile/module error; full authenticated browser walkthrough as a developer-role user was SKIPPED — no test credentials available in this session. Recommend the user run the manual browser checks in the Verification section before merging.)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Both changed files re-read in full (`dev-dashboard.tsx` 305 lines, `v2-hub-sidebar.tsx` 269 lines) and checked against the Standards Checklist: no dead/commented-out code, no `any`, no deep nesting, page-local components have single clear responsibilities and accurate names (`StatusBadge`, `PriorityLabel`, `StatTile`, `SectionPanel`, `EmptyState`, `TaskCard`, `WorkspaceCard`), color/label lookups extracted once (`STATUS_TONE`, `PRIORITY_TONE`, `PRIORITY_LABEL`) rather than repeated inline, no secrets/debug logging, `npx tsc --noEmit` and `pnpm lint` both clean.
- Tightened one thing beyond the original implementation pass: `StatusBadge`/`PriorityLabel` used `style={{}}` with a `Record<string, {text, bg}>` hex map. CLAUDE.md's styling convention prefers a lookup map of *complete Tailwind class strings* over inline `style` when the value is expressible as an arbitrary-value class — it is here (`text-[#5F6A88] bg-[#EDF0F7]`). Converted both maps to complete class-string `Record<string, string>`s and dropped the `style` props entirely (the status dot now uses `bg-current` instead of a second inline color). `StatTile`/`WorkspaceCard`'s icon-background `style={{}}` was deliberately left as-is — it's copied verbatim from `pm-dashboard.tsx`'s reference `StatTile`, which the task document explicitly instructed this implementation to mirror; "fixing" it here would diverge from the established, already-shipped pattern instead of matching it. Re-ran `tsc`/`lint` after this change — both still pass.
- Confirmed by direct inspection (not `git diff`, per this repo's no-git-commands rule) that `v2-hub-sidebar.tsx`'s only change is the three new `!isDev` guards around Tracker/Desk/Orchestration — `isAdmin`, `role !== "client"`, and every other role's items are untouched.
- Verified no phase-hue (`onboard/migrate/publish/ai/optimize`) is used anywhere in `dev-dashboard.tsx` for the non-phase `classification_records.status`/`priority` values — the risk flagged explicitly in the task's Code Context was avoided.
- Verified every color literal in `dev-dashboard.tsx` traces to a token in `central-hub-design-system.md` §1 (`--line #E2E7F2`, `--line-soft #EDF0F7`, `--ink #0B1533`, `--body #3A4565`, `--muted #5F6A88`, `--blue #007BFF`, `--blue-700 #0063D6`, `--blue-100 #E5F1FF`, `--blue-50 #F0F7FF`, `--warn #8A5A00`/`--warn-bg #FFF3D6`, `--late #C0392B`, `--ok #177E48`/`--ok-bg #E3F5EA`, `--bg #F4F6FB`) — none invented.
- No `isDark`, `usePMSettings`, `pm-dark`, `pm-light`, or `--c-*` reference remains in `dev-dashboard.tsx` (grepped by re-read).

### Deviations
- Minor: kanban task cards and Team Pool rows have no hover state, unlike the Requirements bullet's literal wording ("kanban task cards, workspace/team-pool rows" keep a visible hover state). These elements carry no `onClick`/`href` in either the original file or this redesign — they're static display rows, not actions. Adding a hover treatment to a non-interactive element would create a false click affordance, which CLAUDE.md's own polish conventions and its "never use `<div onClick>` for an action" rule argue against. `WorkspaceCard`'s one real `Link` does carry hover + focus-visible, satisfying the requirement for the dashboard's only actual interactive row. Documented, not fixed — fixing it would mean inventing new navigation behavior the task document explicitly did not ask for (kanban/team-pool click-through isn't in Requirements or Out-of-Scope either way, so adding it now would be scope expansion).
- Minor: `pnpm dev` + `curl` confirms no server compile error, but the full authenticated browser walkthrough specified in Verification (sign in as developer/PM, inspect visuals and sidebar live) was not performed — no test credentials available in this automated session. Carried forward from Implementation Notes; recommend before merge.
- No Medium or Major deviations found. Scope matches the approved task document; no unapproved architecture, data, or query changes.

## Post-Gate Fix — UAT Finding

User testing on the redesigned dashboard (screenshots) surfaced two real scoping bugs that predate this task (present in the original file too, just newly visible/legible after the redesign fixed the contrast bug):

1. **"My Tasks" showed every open `classification_records` row in the org**, not just the developer's own — confusing since nothing in the UI indicated it was unscoped.
2. **"Your workspace" → Projects showed the org-wide project total (234)**, not projects the developer is actually on.

Root cause: `classification_records` has no `assigned_developer_id` (flagged as a known future TODO in the file already) and there's no `project_members` table — the only existing membership signal is `projects.dedicated_developers`, a free-text array of developer names PMs type into the Add/Edit Project form (`customers/[customerId]/client.tsx`), already used elsewhere in the app as the de facto "who's on this project" field.

Fix applied in `dev-dashboard.tsx`:
- Before loading tasks, fetch `projects` where `dedicated_developers` contains the logged-in developer's `profiles.full_name` (`.contains("dedicated_developers", [displayName])`), giving `myProjectsCount` and the set of `customer_id`s the developer is dedicated to.
- "My Tasks" (and therefore the Open/In Progress/For Review KPI counts, which derive from the same `records` query) now filters `classification_records` to `customer_id in (my customer_ids)`. If the developer has zero dedicated projects, the query is skipped and the kanban renders empty rather than issuing an unbounded `.in()`.
- "Your workspace" now shows `myProjectsCount` instead of an unfiltered `count: "exact", head: true` query over all `projects`; relabeled "Projects" → "My projects" so the scoped meaning is explicit in the UI, not just implicit in the number.
- **Team Pool intentionally left unscoped** (still all open unassigned records, org-wide) — it represents a shared queue any developer can pick up, which is a different concept from "my work" and the user did not flag it as wrong.
- Known limitation, documented inline in the file: this is an exact string match against `dedicated_developers`, so it inherits the same fragility (typos, casing, name changes) already present everywhere else that array is used as identity. A real fix would need an `assigned_developer_id`/`project_members` schema change — out of scope for this reactive fix, consistent with the original task document's "do not add a new column" boundary.

### Verification Run (post-gate fix)
- `npx tsc --noEmit` - PASS (zero errors)
- `pnpm lint` - PASS (zero errors/warnings)
- Full authenticated browser check (confirming the Projects count and My Tasks list actually reflect the signed-in developer's own `dedicated_developers` membership) still not performed in this session — no test credentials available. Recommend verifying with a real developer account whose name appears in at least one project's `dedicated_developers` list, and a name-mismatch case, before merge.

## Post-Gate Fix #2 — Correction to "My Projects" Definition

User follow-up: the `dedicated_developers` free-text name match (Post-Gate Fix #1) wasn't what they meant — they wanted "projects where I am a member **or** projects where I have assigned tasks." That definition already exists verbatim in this codebase: `src/app/v2/(hub)/projects/_project-access.ts`'s `getDeveloperAccessibleProjectIds(userId)` (from task 208), which unions `project_members` rows and `tasks.assignees` (a real `string[]` of `profiles.id` values, unlike `dedicated_developers`'s free-text names) for exactly this reason — its own comment notes `project_members` alone is too sparse since it's only populated by onboarding-programme start or explicit "Add Collaborators," not by task assignment. That helper already gates developer project *visibility* elsewhere in the app, so reusing it here means "my projects" means the same thing everywhere instead of two different, disagreeing definitions.

Replaced the client-side `dedicated_developers` matching entirely:
- `dashboard/page.tsx` (Server Component): for `role === "developer"`, calls `getDeveloperAccessibleProjectIds(userId)`, then resolves those project rows' `customer_id`s in one follow-up query. Passes `devProjectsCount`/`devCustomerIds` down.
- `dashboard-view.tsx`: threads `devProjectsCount`/`devCustomerIds` through to `<DevDashboard projectsCount={...} customerIds={...} />` (optional props, default to `0`/`[]`, so non-developer dashboards are unaffected).
- `dev-dashboard.tsx`: `Props` now takes `projectsCount: number` and `customerIds: string[]` directly instead of computing membership client-side. "My Tasks" filters `classification_records` on `customer_id in customerIds` (unchanged mechanism from Fix #1, just now fed the correct, authoritative ID set). "Your workspace" shows `projectsCount` directly — no client-side fetch or `loading` gate needed for it anymore, since it's resolved server-side before first paint (fixed a related nit: the previous version tied the Projects number's "—" placeholder to the unrelated classification_records loading flag, which would've flashed a stale "—" for a value that was already known).
- Team Pool is still intentionally unscoped (shared queue), same as Fix #1.

### Files Changed (this fix)
- `src/app/v2/(hub)/dashboard/page.tsx` — resolve developer project/customer scope server-side via the existing `_project-access.ts` helper.
- `src/app/v2/(hub)/dashboard/_components/dashboard-view.tsx` — thread the new props to `DevDashboard`.
- `src/app/v2/(hub)/dashboard/_components/dev-dashboard.tsx` — consume `projectsCount`/`customerIds` props instead of the `dedicated_developers` client fetch from Fix #1.

### Verification Run (post-gate fix #2)
- `npx tsc --noEmit` - PASS on all three changed files (isolated by grepping the output for their paths — zero matches). Whole-repo `tsc` still reports pre-existing errors in `_project-detail.tsx`/`_task-timer-button.tsx`/`timer-context.tsx`, none of which this task touches; `_project-detail.tsx` was already listed as modified in `git status` before this session started, consistent with unrelated in-progress work (plausibly the same task-208 `currentUserId`/`currentUserRole` feature this fix reused a helper from).
- `pnpm lint` - same: 2 pre-existing errors in `timer-context.tsx` (an unrelated `react-hooks/purity` violation), zero in the three files this task changed.
- Full authenticated browser check still not performed — no test credentials in this session. Recommend verifying as a developer account that (a) has a `project_members` row or an assigned task on at least one project, and (b) has neither, to confirm both the populated and empty-state paths.
