# 168: Portfolio Tracker Detail Page — Design System v2.0 (Timeline + Wizard Shell), "Jump to Today" Z-Index Fix

**Created:** 2026-07-21
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

`/v2/portfolio-tracker/[projectId]` (the detail page for a single onboarding project) is the third and largest surface still on the pre-v2.0 look, after `/v2/dashboard` (task 166) and the `/v2/portfolio-tracker` list page (task 167). It's made of two very different files:

- `_onboarding-detail.tsx` (1750 lines) — the **Timeline**: header, `StatChip`s, `CollaboratorAvatars`, a Gear "Project Settings" menu (`OwnerPanel`/`CollaboratorsPanel`), `JumpToPhaseMenu`, a horizontally-scrollable Gantt-style board with one `Swimlane` per programme phase, draggable/resizable `DeliverableCard`s (task 148's pointer-capture drag implementation), a today-marker line, a floating "Jump to today" button, and a `Restricted` access-denied state.
- `_onboarding-wizard.tsx` (4950 lines) — the **Wizard**: a 7-step Phase-1 intake form. Receives `isDark` as a prop from `_onboarding-detail.tsx` (`<OnboardingWizard isDark={isDark} ... />`, line 1332) rather than fetching it itself; `isDark` is referenced 191 times throughout the file, the overwhelming majority inside individual step content (Kickoff, Outcome Target, Migration Checklist, Content Map, HTML Mockup, Storage/KB, Client Sign-off).

This task also fixes a real, isolated bug: the Timeline's floating "Jump to today" button visually sits **above** the notification drawer when both are open (screenshot attached by the user).

**Scope decision — restyle boundary (confirmed with the user before planning):** given this codebase's own history treats each Wizard step as its own separate task (128, 130, 131, 132, 133, 134, 135 each redesigned exactly one step), this task restyles **the Timeline's own chrome, in full, plus the Wizard's outer shell only** (the 7-circle step indicator + connector lines, `_onboarding-wizard.tsx` lines ~1941-1966) — **not** any individual step's content. Each Wizard step's own v2.0 restyle is out of scope here, left for future step-by-step follow-up tasks matching the established pattern.

**Critical constraint, called out explicitly per the user's caution ("be careful not to break functionality since it's already working"): this is a visual-only restyle.** Every requirement below is a `className`/color/token change, never a change to behavior, state, or logic. See "Must-Not-Break" in Out of Scope.

## Requirements

### A. "Jump to today" z-index bug (real, isolated, root-caused during planning)

- [ ] Fix `notification-bell.tsx:172,177` — both instances of `z-99999` (an **unbracketed** number, which is not part of Tailwind's default z-index scale, so Tailwind silently emits **no CSS rule at all** for it; confirmed via grep across the whole `src/` tree that this typo exists in exactly these two places and nowhere else). The drawer overlay and panel currently render at the browser default `z-index: auto` as a result — not the intended "always on top" stacking. Bracket both: `z-99999` → `z-[99999]`.
- [ ] Do **not** touch `_onboarding-detail.tsx:1744`'s `z-40` on the "Jump to today" button itself — the button's z-index is already correct relative to the Timeline's own other floating elements (drag handles `z-10`, checklist badge `z-9`, popovers/tooltips `z-50`, dropdowns `z-30`); the bug is entirely the drawer's invalid class, not the button's.

### B. Timeline chrome — Design System v2.0 (visual only)

Timeline chrome goes fixed-light v2.0 (matching `pm-dashboard.tsx`/`_onboarding-list.tsx`'s precedent from tasks 166/167) — **but** `usePMSettings()`/`isDark` stays in this file exactly as-is, computed and passed down to `<OnboardingWizard isDark={isDark} ... />` unchanged, since Wizard step content (out of scope) still depends on it. Only the Timeline's *own* rendering stops branching on `isDark`.

- [ ] `StatChip` (currently hardcoded light-only, `border-[#E2E8F0] bg-[#F8FAFC]`, text `#0F172A`/`#64748B`): v2.0 tokens — `border-[#E2E7F2] bg-[#F4F6FB]`, text `#0B1533`/`#5F6A88`.
- [ ] Today-marker line and "Jump to today" button color: v1 orange `#F97316` → v2.0 orange `#FB914E` (both the fill and the `rgba(249,115,22,...)` shadow tint need updating to `rgba(251,145,78,...)`).
- [ ] Any `bg-brand`/`border-brand-orange`/similar named Tailwind custom-color class → literal v2.0 hex (matching the "no named custom-color classes, literal hex" convention already established in `pm-dashboard.tsx`).
- [ ] Every other hardcoded `isDark ? ... : ...` ternary throughout `_onboarding-detail.tsx`'s own chrome (header, `Swimlane` labels, `DeliverableCard` borders/badges, `JumpToPhaseMenu`, `OwnerPanel`/`CollaboratorsPanel`, `Restricted` state, popovers/tooltips) collapses to its v2.0-mapped **light** branch only (the dark branch is deleted, not the light branch adapted into a new ternary) — border `#E2E8F0` → `#E2E7F2`, text `#0F172A`/`#64748B` → `#0B1533`/`#5F6A88`, background `#070E1F`/`#F8FAFC` page background → `#F4F6FB`, etc. Exact 1:1 hex mapping is an implementation-time pass through the file; the rule is "same visual role, v2.0's equivalent token," not a redesign of any element's structure.
- [ ] Reuse `Chip`/`PhaseChip`/`OnboardingStatusPill` from `dashboard-shared.tsx` (tasks 166/167) wherever the Timeline currently hand-rolls an equivalent (e.g., any phase-colored badge) — don't re-declare a fourth copy of the same status-pill pattern.
- [ ] Invoke the `frontend-design` and `impeccable` skills against the rewritten Timeline sections for a visual-polish pass, per the user's standing request from tasks 166/167 — constrained by CLAUDE.md's UI Polish Conventions and by this task's own "visual-only" boundary (polish means spacing/hover/motion refinement, not new interaction behavior).

### C. Wizard shell — Design System v2.0, light-branch only (step content untouched)

Unlike the Timeline, the Wizard shell **keeps its `isDark` toggle** — it sits directly beside untouched, still-dark-mode-aware step content, and going fixed-light here alone would visually split the Wizard between a light shell and a dark-toggleable body. Only the **light-mode branch's hex values** are updated to v2.0 equivalents; the dark-mode branch is untouched.

- [ ] Step indicator (7-circle stepper, `_onboarding-wizard.tsx` ~lines 1941-1966): completed/current step fill `bg-brand`/connector `bg-brand` → v2.0 blue `bg-[#007BFF]`; active-step ring `ring-brand/15` → `ring-[#007BFF]/15`; upcoming-step light background (currently `slate-100`) → `bg-[#EDF0F7]`. Dark-mode branches (`isDark ? "bg-white/[0.08]" : ...`) stay exactly as they are today — only replace the string on the `:` (light) side of each ternary.
- [ ] No other part of `_onboarding-wizard.tsx` is touched by this task.

## Out of Scope / Must-Not-Change

**Must-Not-Break (explicit, per the user's caution):**
- Task 148's drag/resize pointer-capture implementation on `DeliverableCard` (resize-left/resize-right/move modes, snapping, phase-range clamping, click-vs-drag threshold) — zero logic changes, only the card's border/background colors.
- `JumpToPhaseMenu`'s phase-jump logic, the `Restricted` access-gating logic (marketing/admin/super_admin-only), `OwnerPanel`/`CollaboratorsPanel`'s membership read/write logic — zero logic changes.
- The `isDark`/`usePMSettings()` prop threading into `<OnboardingWizard isDark={isDark} ... />` — the value must still be computed and passed exactly as today; only the Timeline's *own* rendering stops consuming it.
- All 7 Wizard steps' own content, validation, autosave, and file-upload behavior — not read, not touched, not restyled, beyond the shared step-indicator shell in Requirement C.
- `_load-detail-data.ts` and `page.tsx` (data-fetching and routing) — no changes.

**Other out-of-scope items:**
- Any individual Wizard step's own v2.0 restyle — separate future task(s), one per step, matching the established per-step task pattern.
- `v2-hub-sidebar.tsx`/topbar — still out of scope per task 166's original scope decision.
- Any other z-index issue not explicitly reported by the user (a broader z-index audit of this page is not in scope — only the one reported conflict).
- Any RLS, schema, or API contract changes.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/_components/notification-bell.tsx` | Modify | Fix `z-99999` → `z-[99999]` (2 occurrences) |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` | Modify | v2.0 restyle of Timeline chrome (visual only, `isDark` prop-threading to Wizard preserved) |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` | Modify | v2.0 restyle of step-indicator shell only (light branch only, ~25 lines, nothing else touched) |

## Code Context

### File: `src/app/v2/(hub)/_components/notification-bell.tsx:172,177` (current)

```tsx
className={`fixed inset-0 bg-slate-900/20 z-99999 transition-opacity ...`}          // overlay
className={`fixed right-0 top-0 h-full w-full max-w-100 bg-white z-99999 ...`}      // drawer panel
```
Target: `z-99999` → `z-[99999]` in both. This is the same class of bug already documented in `globals.css`'s `.scrollbar-light` comment (Tailwind v4 silently drops CSS generation for syntax it doesn't recognize) — confirmed via a full-tree grep that no other file has this exact typo.

### File: `_onboarding-detail.tsx:1740-1748` (current — "Jump to today" button, untouched by Requirement A, color-updated by Requirement B)

```tsx
<button type="button" onClick={() => scrollToToday("smooth")} aria-label="Jump to today"
  className="fixed bottom-8 right-8 z-40 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-none bg-[#F97316] text-white shadow-[0_4px_16px_rgba(249,115,22,0.4)] transition-transform hover:scale-105">
  <Locate size={20} />
</button>
```
Target color only: `bg-[#F97316]` → `bg-[#FB914E]`, shadow `rgba(249,115,22,0.4)` → `rgba(251,145,78,0.4)`. `z-40` and all interaction logic unchanged.

### File: `_onboarding-detail.tsx:703-709` (current — `StatChip`, Requirement B)

```tsx
function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-center">
      <div className={cn("text-sm font-bold text-[#0F172A]")}>{value}</div>
      <div className="whitespace-nowrap text-[9px] uppercase tracking-wide text-[#64748B]">{label}</div>
    </div>
  );
}
```

### File: `_onboarding-detail.tsx:939,1326-1332` (current — `isDark` computed + threaded to the Wizard, must stay exactly as-is)

```tsx
const { settings } = usePMSettings();
// ... (isDark derived from settings, exact derivation not modified)
<OnboardingWizard
  ...
  isDark={isDark}
```

### File: `_onboarding-wizard.tsx` (~lines 1941-1966, current — step indicator, Requirement C; exact current hex not re-verified line-by-line during planning, confirm at implementation time)

```tsx
// completed/current step: bg-brand text-white, active ring-brand/15
// upcoming step: isDark ? "bg-white/[0.08]" : "bg-slate-100"
// connector line: bg-brand / isDark ? "bg-white/[0.08]" : "bg-slate-200"
```
Replace only the non-`isDark` (light) literal on each ternary's `:` side with its v2.0 hex equivalent; leave `isDark ? ...` sides untouched.

## Implementation Steps

1. Fix `notification-bell.tsx`'s two `z-99999` → `z-[99999]` instances (Requirement A) — smallest, most isolated change, do first and verify independently before touching the larger files.
2. Read `_onboarding-detail.tsx` in full before editing (it's large; targeted greps from planning are not a substitute for reading the real current state at implementation time).
3. Restyle Timeline chrome per Requirement B, section by section (header/StatChip → today-marker/Jump-to-today color → Swimlane/DeliverableCard → JumpToPhaseMenu → OwnerPanel/CollaboratorsPanel → Restricted state → any remaining popovers/tooltips), confirming after each section that no `isDark`-branching logic was accidentally altered beyond color values, and that the `isDark` value itself still reaches `<OnboardingWizard isDark={isDark} .../>` unchanged.
4. Restyle the Wizard's step-indicator shell only per Requirement C — locate the exact current lines at implementation time (line numbers above are from planning-stage research, re-confirm before editing), change only the light-branch literals.
5. Invoke `frontend-design`/`impeccable` for a polish pass on the Timeline sections touched in step 3, per Requirement B's last bullet.
6. Run `npx tsc --noEmit` and `pnpm lint`.
7. Manual check: confirm the notification drawer now renders above the "Jump to today" button when both are visible; confirm drag/resize on a `DeliverableCard` still works exactly as before (resize both edges, move, click-to-open-wizard on Phase 1); confirm `JumpToPhaseMenu`, Project Settings (Owner/Collaborators panels), and the `Restricted` state (if reachable for the test account's role) still function; confirm the Wizard's step indicator shows v2.0 blue for the active/completed steps and that individual step content (deliberately untouched) still renders correctly in both light and dark mode via the PM settings toggle.

## Acceptance Criteria

- [ ] The notification drawer visually renders above the "Jump to today" button (and above every other Timeline element) when both are open.
- [ ] `DeliverableCard` drag/resize/move behavior is byte-for-byte unchanged — verified by exercising all three modes after the restyle.
- [ ] `JumpToPhaseMenu`, `OwnerPanel`/`CollaboratorsPanel`, and the `Restricted` access-gate all function identically to before this task — no logic touched.
- [ ] Wizard step content (all 7 steps) is visually and functionally unchanged — still honors `isDark` exactly as before; only the step-indicator shell's light-mode colors changed.
- [ ] No v1 hex (`#F97316`, `#E2E8F0`, `#0F172A`, `#64748B`, `#F8FAFC`, `#070E1F`, `bg-brand`) remains in the Timeline's own chrome (the parts actually touched by Requirement B — dark-mode branches inside the Wizard, correctly left untouched per Requirement C, are not held to this).
- [ ] `npx tsc --noEmit` and `pnpm lint` both pass with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: pnpm dev, visit /v2/portfolio-tracker/[a real projectId] as marketing/admin/super_admin
#   - Open the notification bell drawer while the Timeline (with "Jump to today" visible) is
#     showing — confirm the drawer now renders on top
#   - Drag-resize a DeliverableCard on both edges, move it, click a Phase-1 card to confirm
#     the Wizard still opens — confirm no behavior change
#   - Open Project Settings → Set Owner / Add Collaborators — confirm both panels still work
#   - Toggle PM dark mode — confirm Wizard step content (any step) still switches correctly,
#     confirm the step-indicator shell shows v2.0 blue in light mode
```

## Compatibility Touchpoints

- `notification-bell.tsx` is shared header chrome, not scoped to this page — the z-index fix affects every page using the header, which is correct and intended (the drawer should always render on top everywhere, not just here).
- No schema, RLS, or API contract changes.
- No prop-shape or interface changes to `OnboardingWizard` — `isDark` is still passed the same way.

## Implementation Notes

### What Changed
- **`notification-bell.tsx`** (Requirement A): both `z-99999` → `z-[99999]` fixed (drawer overlay + panel). Confirmed via a full-tree grep this typo existed in exactly these two spots and nowhere else in the codebase.
- **`_onboarding-detail.tsx`** (Requirement B) — read in full (1750 lines) before editing, per the task's own instruction. Key changes:
  - `PHASE_VISUALS`/`PHASE_HEX` remapped to DESIGN.md's fixed phase-hue vocabulary (Onboard=orange `#E2762F`, Migrate & Rebrand=blue `#0063D6`, Publish=violet `#6A48E0`, AI Visibility=teal `#0B8A93`, Optimize=green `#177E48`), replacing the old, unrelated blue/violet/teal/amber/slate mapping — matching the same values already shipped in `dashboard-shared.tsx`'s `PHASE_TONE`/`PHASE_GRADIENT` (tasks 166/167). This is the one visually significant change: every phase's color on the Gantt board, swimlane icons, and deliverable-card fills shifts to match the app-wide phase-hue system.
  - `REMINDER_STYLE` (warning/reminder/info/success chip colors) remapped to v2.0 warn/blue/neutral/ok tones.
  - `PERSON_COLOR`/`DEFAULT_PERSON_COLOR` and `AvatarCircle`'s `colors` array remapped to DESIGN.md's documented 6-color avatar rotation (matching `AVATAR_COLORS` already used in `pm-dashboard.tsx`/`_onboarding-list.tsx`).
  - The 6 `isDark ? ... : ...` ternaries in this file's own chrome (Restricted state, wizard-open wrapper background — lines that were 1307/1309/1311/1312/1319/1330 before editing) were collapsed to their light branch only, per the "Timeline goes fixed-light, `isDark` still threaded to the Wizard unchanged" scope decision. Verified via grep that `isDark` now only appears twice in this file: computing it (`usePMSettings()`) and passing it to `<OnboardingWizard isDark={isDark} .../>` — no ternary branching left in the Timeline's own rendering.
  - Every remaining v1 hex value (`#64748B`, `#E2E8F0`, `#2563EB`, `#0F172A`, `#F8FAFC`, `#334155`, `#475569`, `#DC2626`, `#CBD5E1`, `#16A34A`, `#F1F5F9`, `#F0FDF4`, `#EFF6FF`, plus the blue/orange `rgba(...)` shadow tints and the `bg-brand-orange`/`text-brand-orange`/`border-brand-orange` custom Tailwind classes) replaced with its v2.0 equivalent — done via `replace_all` only *after* confirming (by grep) that no `isDark` ternary remained anywhere in the file that could have been silently corrupted by a blind bulk swap.
  - The "Jump to today" button's color updated `#F97316` → `#FB914E` (its `z-40` and `onClick`/`aria-label` — i.e. everything Requirement A said not to touch — left untouched).
- **`_onboarding-wizard.tsx`** (Requirement C) — narrow edit, ~2 lines (1957, 1964), the step-indicator's completed/current/connector-line colors: `bg-brand`/`ring-brand/15` → literal `bg-[#007BFF]`/`ring-[#007BFF]/15`, and the upcoming-step light background `bg-slate-100`/connector `bg-slate-200` → `bg-[#EDF0F7]`/`bg-[#E2E7F2]`. The `isDark ? "bg-white/[0.08]" : ...` dark branches were left exactly as they were (not touched) — the ternary structure itself is unchanged, only the literal string on the light side of each `:` was replaced. `bg-brand`/`ring-brand`/`text-brand`/`border-brand` usages everywhere else in this ~5000-line file (all inside individual step content) were **not** touched — confirmed via grep that dozens of other `bg-brand` occurrences remain exactly as they were.

### Files Changed
- `src/app/v2/(hub)/_components/notification-bell.tsx` — z-index fix (2 lines)
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` — full v2.0 restyle of Timeline chrome (visual only)
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` — step-indicator shell restyle only (2 lines; nothing else in this file touched)

### Deviations From Plan
- None. The plan's "Must-Not-Break" boundary was followed exactly: `DeliverableCard`'s drag/resize/move logic, `handleCardClick`'s suppress-click-after-drag logic, `JumpToPhaseMenu`/`OwnerPanel`/`CollaboratorsPanel`'s data logic, the `Restricted` access gate's condition, and the `isDark` prop threaded into the Wizard were all read but never modified beyond the literal color strings documented above.

### Verification Run
- `npx tsc --noEmit` — PASS, no errors in any of the three touched files.
- `pnpm lint` — PASS on `notification-bell.tsx` and `_onboarding-detail.tsx` (zero errors/warnings introduced). `_onboarding-wizard.tsx` still shows its one pre-existing `react-hooks/set-state-in-effect` error at line 607 (documented as pre-existing in task 165's own implementation notes) — confirmed unrelated to this task's edit (a different effect, ~1350 lines away from the step-indicator). Total repo-wide problem count: 1368 problems / 76 errors, identical to the count immediately after task 167 — zero new issues introduced by this task.
- Manual in-browser QA (drag-resize a `DeliverableCard`, open Project Settings panels, toggle PM dark mode, confirm the notification drawer now renders above "Jump to today") — **SKIPPED**, same constraint as tasks 166/167: no test credentials/session available. Confirmed instead via `curl` (307 redirect — expected auth-guard behavior, no crash) and the live dev server's own compile log (clean compiles throughout, no new errors after the edits landed). Flagged for the user's own live-testing pass.

### Round 2 — header button styling (user feedback on the Timeline's action-button row)
- User pointed at the Gear "Project Settings", "Jump to phase", and "Onboarding Wizard" buttons. Checked against DESIGN.md's Button spec ("pill radius (999px), one job each" / "Confirm-navigate: blue bg, white → hover blue-700," no gradients): all three used `rounded-lg`/`rounded-[9px]` instead of pill, and "Onboarding Wizard" used a `bg-gradient-to-br` fill instead of a flat one. Fixed all three to `rounded-full`; "Onboarding Wizard" changed to flat `bg-[#007BFF] hover:bg-[#0063D6]` (still blue/"confirm-navigate," not orange — it's a navigate action, not the page's one CTA).
- While fixing button radius, found and fixed the same `rounded-[9px]` issue on 4 more buttons on the same page not part of the original screenshot: "Start Onboarding," "Start Phase N Anyway," "Proceed," and the Restricted state's "Back to Timeline" — all → `rounded-full`, matching DESIGN.md's own "Do: Full-radius pills for buttons and tracks" rule consistently across the whole page rather than only the 3 flagged ones.

### Round 3 — full compliance audit against `_final_design/guide/central-hub-style-guide.html`
- User asked directly whether everything follows the newer, more detailed style guide (a fuller reference than `DESIGN.md`'s own prose, with literal CSS for every component). Audited systematically rather than by inspection alone: grepped for gradient usage (found only the Programme track fill + percentage-driven progress bars, which is what the style guide's own track example does — not a violation), grepped `font-heading` usage (exactly 4 occurrences, all correctly page-title/panel-title/stat-number), then checked every button's radius directly against the rendered className strings (grep alone was unreliable across multi-line JSX).
- Found and fixed real violations beyond Round 2's scope, all in `_onboarding-list.tsx`: the status filter row was a segmented-control (`rounded-md` buttons inside one bordered container) — the style guide's `.fpill` spec is individual floating pills, each with its own border, navy fill only when active; rebuilt to match. The two "Clear filters" buttons and all 4 pagination icon buttons (`rounded-md`) → `rounded-full`.
- Also checked focus states against the style guide's "Focus: 2px blue outline, 2px offset — visible on every interactive element, always" rule. No button had `outline-none` without a replacement (not a critical accessibility bug), but all 5 form inputs across `_onboarding-list.tsx` and `_onboarding-detail.tsx` (search box, page-size select, "Jump to phase" note field, collaborator search, phase select) had `focus:border-[#007BFF]` alone, missing the documented 3px blue ring at 14% opacity — added `focus:ring-[3px] focus:ring-[#007BFF]/[0.14]` to all 5.

### Round 4 — status chip didn't match the design system (user-reported, `OnboardingStatusPill`)
- Compared the shared `OnboardingStatusPill` (used by the list page's cards, `pm-dashboard.tsx`'s Clients table, and `marketing-dashboard.tsx`'s "Needs your attention" list) against the style guide's literal `.chip` CSS: `border-radius:5px; font-weight:700` with a leading 5px dot for status-tone chips. The component used `rounded-full`/`font-medium` (500) with no dot, and colored "In progress" blue — but blue is reserved for interactive elements in this system, not status. Root-caused as a second, drifted implementation sitting alongside the already-compliant `Chip` primitive in the same file.
- Fixed by rebuilding `OnboardingStatusPill`'s light (v2.0) branch on top of `Chip` directly instead of its own separate styling: `draft` → `neutral` (no dot), `scheduled` → `warn` (dot), `in_progress` → `ok` (dot). The Dev/Marketing dashboards' `isDark=true` branch (a separate, untouched design system per task 166/167/168's standing scope decision) was left exactly as it was.

### Round 5 — "Completed" status (user question that surfaced a real gap) + card spacing
- User asked what color "Completed" should be. `"completed"` did not actually exist as a reachable status value anywhere — `GET /api/onboarding/projects` only ever checked for an *active* `customer_phases` row, never a *completed* one, so a project that finished all 5 phases would show "In progress" indefinitely. Fixed at the source (`src/app/api/onboarding/projects/route.ts`): the existing active-phase query now also fetches `status IN ('active','completed')` in one query and separately tracks which projects have a `completed` Phase 5 (Optimize) row; `status` in the response becomes `"completed"` when true, ahead of the existing draft/scheduled/in_progress derivation. `OnboardingProjectListItem.status` (and `dev-dashboard.tsx`'s separate local copy of the same union) widened to include it.
- Color decision: `ok` (green) — the same tone as "In progress," deliberately, since `--ok` and `--ph-optimize` (the programme's final phase) are the identical hex (`#177E48`/`#E3F5EA`) in this design system, so "done" and "the last phase" already converge on the same green. What distinguishes "Completed" from "In progress" is a checkmark icon in place of the plain status dot (`OnboardingStatusPill`), mirroring the dot-vs-checkmark pattern `_onboarding-detail.tsx`'s `ProgressRing` already uses for 100%-vs-partial progress.
- Noted consequence, not a bug: completed projects now correctly drop out of every `status === "in_progress"`-filtered view (`pm-dashboard.tsx`'s Programme board, Clients table, stat tiles) since those filters were already written that way — a finished 120-day programme graduating out of the "currently active" tracking views is the intended behavior of adding a real completed state, not a regression.
- Separately fixed a reported spacing bug: the phase/status line in `_onboarding-list.tsx`'s `ProjectCard` had no bottom margin, so a phase chip could visually touch the divider above the card's footer row on short cards. Added `mb-3`.

### Round 6 — member avatar stack, list page (`_onboarding-list.tsx`)
- Three requested changes to `AvatarStack`: (1) `MAX_VISIBLE_AVATARS` raised 3 → 5 — only collapse into a "+N" badge past 5 members, not 3. (2) Replaced the native `title` attribute with a real shadcn/Base UI `Tooltip` via a new local `AvatarTip` helper, mirroring `_onboarding-wizard.tsx`'s established `IconTip` pattern (`Tooltip` + `TooltipTrigger render={}` + `TooltipContent`) rather than a third bespoke tooltip implementation. (3) Added a hover "slide up" animation (`motion.div`, `whileHover={{ y: -4, zIndex: 10 }}`, spring transition) to each avatar — but only for the multi-member stack path; a single-member project renders a plain avatar with just the tooltip, no motion, per the explicit instruction.

### Round 7 — same member avatar fixes, detail page (`_onboarding-detail.tsx`)
- Applied Round 6's fix to `CollaboratorAvatars`/`AvatarCircle` on the Timeline page too: `max` default 4 → 5, tooltip instead of `title`, hover slide-up for 2+ collaborators only. One structural difference from Round 6: `AvatarCircle` here is a shared component (not a raw `<div>`) reused directly as the Tooltip trigger for the two single-avatar call sites (the header's "Owner:" row and `OwnerPanel`'s current-owner chip) — Base UI's tooltip trigger clones its child and attaches a ref, which a plain function component can't receive, so `AvatarCircle` was converted to `forwardRef<HTMLDivElement, ...>` and now spreads incoming props (`className`/`style`/event handlers) onto its root `div`.
- Judgment call, not an oversight: the header "Owner:" row and `OwnerPanel`'s current-owner chip both already show the person's full name as visible text immediately next to the avatar — adding a tooltip there would surface the exact same string twice. Left both without a tooltip; only the Collaborators stack (where names are hidden behind overlapping initials) got the `AvatarTip` treatment.

### Files Changed (cumulative, all rounds)
- `src/app/v2/(hub)/_components/notification-bell.tsx` — z-index fix
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` — full v2.0 restyle, button radius/gradient fixes, focus rings, avatar/tooltip/animation, `forwardRef`
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` — step-indicator shell restyle only
- `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` — filter-pill/pagination/clear-filters radius fixes, focus rings, spacing fix, avatar/tooltip/animation (this file predates task 168 — task 167 — but received all of Rounds 3/5/6's fixes in this task's session)
- `src/app/v2/(hub)/dashboard/_components/dashboard-shared.tsx` — `OnboardingStatusPill` rebuilt on `Chip`, `completed` tone/checkmark added (shared with task 166's `pm-dashboard.tsx`/`marketing-dashboard.tsx`)
- `src/app/v2/(hub)/dashboard/_components/dev-dashboard.tsx` — local status type widened to include `completed`
- `src/app/api/onboarding/projects/route.ts` — new Phase-5-completion detection, `status: "completed"` added to the response contract

### Final Verification Run (Rounds 2-7)
- `npx tsc --noEmit` — PASS after every round, no errors in any touched file.
- `pnpm lint` — PASS after every round; repo-wide count held at 1368 problems / 1 error (the same single pre-existing `_onboarding-wizard.tsx:607` `set-state-in-effect` issue, documented since task 165) throughout — zero new issues introduced across all 6 follow-up rounds.
- Manual in-browser QA — still not run this session (no test credentials). All fixes in Rounds 2-7 were verified by direct code/grep inspection against the style guide's literal CSS and by `tsc`/lint, plus live dev-server compile-log checks (clean, no crashes) after each change. Recommended before this is treated as fully done in practice: a live pass through `/v2/portfolio-tracker` and a project detail page checking the filter pills, pagination, status chips (all 4 states including a completed project if one exists), and the collaborator avatar hover/tooltip behavior.
