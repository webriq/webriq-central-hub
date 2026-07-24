# 183: "Import Project" & "New Project" Wizards — Design System v2.0 Redesign

**Created:** 2026-07-24
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

`/v2/portfolio-tracker/new` (`.../new/_content.tsx`, 1451 lines) and `/v2/portfolio-tracker/import` (`.../import/_content.tsx`, 899 lines) are the two remaining pieces of the onboarding-programme surface still on the pre-v2.0 look — hardcoded `#2563EB`/slate-Tailwind classes switched by an `isDark` prop, gradient buttons/icons, and per-classification rainbow hues that collide with the design system's reserved phase-hue vocabulary. Their sibling list page (`_onboarding-list.tsx`) and `/v2/dashboard` were already migrated to **Design System v2.0** in tasks 166/167, which also built the reusable v2.0 primitives (`Chip`, `PhaseChip`, `OnboardingStatusPill` in `dashboard-shared.tsx`) and established the concrete restyle pattern this task follows.

The user pointed at `_final_design/guide/central-hub-design-system.md` + `central-hub-style-guide.html` as the design reference. Those files are a static snapshot of the same system already tracked live at the repo root as **`DESIGN.md`** (content is ~99% identical; `DESIGN.md` additionally carries an "Adoption status" section and is the file task 166/167/179 already cite and update as the system evolves). This task treats `DESIGN.md` as the source of truth and `central-hub-style-guide.html` as the concrete visual reference (it literally has `<button class="btn btn-cta">Start handover</button>` — the precedent used below for the wizards' terminal action buttons), per the codebase's existing convention — no new design doc is introduced.

**Both files are large (1451 + 899 lines) — this is a full-file rewrite of each, not a patch.**

## Requirements

### A. Fixed-light v2.0 (flagged scope decision, following task 167's precedent)
- [ ] Drop `usePMSettings()`/`isDark` from both files entirely; remove every dark-mode class branch. v2.0 has no dark-mode spec (same reasoning already applied to `pm-dashboard.tsx` and `_onboarding-list.tsx`) — these two wizards should match the rest of the portfolio-tracker feature rather than being the one remaining dark-capable corner of it.
- [ ] `NewProjectWizard`'s `role` prop stays (used for `canManagePhases`, unrelated to theming) — only the `isDark` boolean and its `usePMSettings()` import go.

### B. Color tokens — replace old v1 hex with DESIGN.md literals
- [ ] Blue `#2563EB` / `#1D4ED8` → `#007BFF` / `#0063D6` (DESIGN.md `blue` / `blue-700`) everywhere: step-indicator active/done fill, focus borders/rings, links, "Continue" buttons, TypeMultiSelect/date-picker accents.
- [ ] Slate grays (`#0F172A`, `#64748B`, `#CBD5E1`, `#E2E8F0`, `#475569`, `#F8FAFC`, `#F1F5F9`) → DESIGN.md's `ink` `#0B1533` / `body` `#3A4565` / `muted` `#5F6A88` / `line` `#E2E7F2` / `line-soft` `#EDF0F7` / `bg` `#F4F6FB` / `surface` `#FFFFFF`, matched by role (headings→ink, body/help text→muted, borders→line, dividers→line-soft, page/section background→bg).
- [ ] Error red `#DC2626`/`#FCA5A5` → DESIGN.md `late` `#C0392B` / `late-bg` `#FDE8E6`.
- [ ] Success green stays `#22C55E`/`#16A34A`-family only if flattened to DESIGN.md's `ok` `#177E48` / `ok-bg` `#E3F5EA` (see Requirement E — no more gradient).
- [ ] Focus ring opacity/spec: `shadow-[0_0_0_3px_rgba(0,123,255,.14)]` (DESIGN.md Forms spec), replacing the current `rgba(37,99,235,...)` values.

### C. Typography
- [ ] Step/page/panel titles ("Company & contact", "Project details", "Review & create", "Import Project", "Review & fix") get `font-heading` (Space Grotesk, already wired via `next/font` — see `dashboard-shared.tsx`/`_onboarding-list.tsx`'s `font-heading text-[22px] font-bold tracking-[-0.02em]` convention for page titles; these are panel-level titles inside the wizard card, so use DESIGN.md's Panel-title spec: Space Grotesk 600 · 15–18px · `-0.01em` · `ink` — implementation can keep the existing ~20-22px sizing scaled to panel context, just swap the font and hex).
- [ ] Everything else (labels, inputs, buttons, table cells) stays Inter — **never** `font-heading` on a button/label/cell, per DESIGN.md's explicit ban.
- [ ] `font-mono` (JetBrains Mono, already wired) on: the customer ID shown/copied in the New Project success screen, the "Row N" / row-count / "N rows parsed" text in the Import wizard, kickoff-date and any day-count display — anything that's an ID, date, or count, matching DESIGN.md's "Data" type role.

### D. Classification / project-type hue collision (real design-system violation — fix, don't preserve)
Both files currently color-code classifications (StackShift I/II, StackShift Access, StackShift Access Plus, PipelineForge, Discrete Development) using blue/violet/teal/orange — **four of DESIGN.md's five reserved phase hues** (`ph-migrate` blue, `ph-publish` violet, `ph-ai` teal, `ph-onboard` orange), for an unrelated meaning. DESIGN.md is explicit: *"A phase hue is never reused for a non-phase meaning. Violet anywhere = Publish."* `dashboard-shared.tsx`'s `Chip` component enforces exactly this — its `neutral` tone (`bg-[#EDF0F7] text-[#5F6A88]`) is what `_onboarding-list.tsx` already uses for the same `classification` field on `ProjectCard`.
- [ ] `new/_content.tsx`'s `ClassificationCard` selection grid: replace the six-color `CLASSIFICATION_META` hue table with a single neutral/interactive-blue selected state — unselected: `line-soft` bg-icon + `muted` icon/text (matching `_onboarding-list.tsx`'s `Chip tone="neutral"` treatment); selected: `blue-100` icon bg + `blue-700` icon + `blue` border + `blue-50`-tint card background (mirrors the existing `Field` input's own focus treatment, so selection reads as "this field is active/chosen," not as a fifth invented phase-hue system). Icons (`Layers`/`LayoutGrid`/`Shield`/`ShieldCheck`/`GitBranch`/`Code2`) stay as the differentiator between cards — color no longer needs to do that job.
- [ ] `import/_content.tsx`'s `TYPE_CHIP_COLORS` (feeding the per-row `TypeMultiSelect` pills): same fix — replace the six-color map with the shared `Chip tone="neutral"` styling (or an equivalent neutral pill) for the selected-value chips inside the multi-select trigger, and a single blue "selected" highlight (not per-type hue) inside the dropdown option list.
- [ ] Where practical, import and reuse `Chip` from `../../dashboard/_components/dashboard-shared` directly for these neutral pills instead of hand-rolling a new neutral style, matching task 167's reuse pattern — only build a bespoke element where `Chip`'s fixed shape (rounded-`[5px]`, 10px/700, no built-in remove-`X` affordance) doesn't fit (e.g. the `TypeMultiSelect` trigger's removable pills need the `X` button `Chip` doesn't provide — keep those bespoke but recolor to neutral).

### E. Remove gradients (DESIGN.md: "No gradient text, glassmorphism, or decorative blur anywhere")
- [ ] `SuccessScreen`'s icon circle: `bg-gradient-to-br from-[#22C55E] to-[#16A34A]` → flat `bg-[#177E48]` (DESIGN.md `ok`), or `bg-[#E3F5EA]` circle with `#177E48` icon if a lighter tint reads better against the white panel (implementation-time call, but must be flat, not a gradient).
- [ ] Import result screen's icon circle: same fix for both the success (`from-[#22C55E] to-[#16A34A]`) and partial/zero-imported (`from-brand-orange to-[#EA580C]`) states — the zero-imported state should use DESIGN.md `late` (`#C0392B`/`#FDE8E6`), not orange (orange is reserved for the one-CTA-per-screen rule, not for an error/attention state — `late` is the correct semantic here).
- [ ] Every `bg-gradient-to-br from-[#2563EB] to-[#1D4ED8]` primary-action button (New Project's "Start Phase X Now"/"Start onboarding" and "Save + set schedule" confirm state) → flat color per Requirement F's button-role mapping, no gradient.

### F. Button roles (CTA orange vs. confirm/navigate blue vs. ghost) — apply DESIGN.md Section 4 "Buttons," using `central-hub-style-guide.html`'s `<button class="btn btn-cta">Start handover</button>` as the concrete precedent for "the one action that begins/starts something is the screen's CTA":
- [ ] **New Project wizard:**
  - Step 1 & 2 "Continue" → confirm/navigate blue (`bg-[#007BFF] hover:bg-[#0063D6]`, white text), not orange.
  - Step 3 "Start Phase X Now" / "Start onboarding (Day 1 now)" → **CTA orange** (`bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white`), pill radius — this is the screen's one "act now" action.
  - "Just save" → ghost (white, `line` border).
  - "Save + set schedule" (and its confirm state) → confirm/navigate blue, not CTA — it schedules a future start, it isn't itself the "start now" action.
  - "Back"/"Cancel"/"Previous step" → text link (`blue-700`) or ghost, matching current treatment.
  - Success screen "View project" → confirm/navigate blue (already blue; just recolor to `#007BFF`); "Back to projects" → ghost.
- [ ] **Import wizard:**
  - Step 2 "Import N projects" → **CTA orange** (the screen's "act now" action, same reasoning as "Start onboarding").
  - "Choose a different file" → ghost.
  - Result screen "Import another file" → ghost; "Back to projects" → confirm/navigate blue (recolor only).
- [ ] Verify exactly one CTA-orange button is ever visible at a time on each screen (DESIGN.md's "one per screen, maximum" rule) — e.g. step 3 of New Project must not show both "Start Phase X Now" (orange) and a second orange element simultaneously.

### G. Motion — align to DESIGN.md Section 5 ("160ms `cubic-bezier(.22,1,.36,1)` on background/color/border-color; compositor properties only; no lifts, no scale, no page-load choreography")
- [ ] Remove `whileHover={{ scale: ... }}` / `whileTap={{ scale: ... }}` from buttons (`motion.button`) — replace with plain `<button>` + `transition-colors` (matches every other v2.0 surface's hover treatment).
- [ ] Remove `whileHover={{ y: -2 }}` lift on `ClassificationCard` — selection state (Requirement D) should communicate "selectable/selected" via color/border, not a hover lift.
- [ ] The step-content slide transition (`AnimatePresence`/`stepVariants`, opacity+x) and the step-indicator's dot/line color animation may stay — they're functional wayfinding between wizard steps (not decorative page-load choreography) and already animate only compositor-safe properties (`opacity`/`transform`) plus `background` (color), which DESIGN.md's own transition list includes.
- [ ] `AvatarStack`-style hover lifts don't exist in these two files — nothing to change there.

### H. Structural / component reuse
- [ ] Outer wizard panel: `rounded-2xl` → `rounded-[14px]` (DESIGN.md `--r-lg`); shadow → DESIGN.md Panels spec (`border` + `--sh-sm`: `0 1px 2px rgba(7,17,51,.05)`), replacing the current `shadow-[0_4px_24px_rgba(15,23,42,0.07)]`.
- [ ] Import wizard's review table (step 2): header background `#FAFBFE`, `line-soft` dividers, row hover `blue-50` tint, per DESIGN.md's Table spec — currently `bg-[#F8FAFC]`/plain borders with no row-hover tint defined.
- [ ] No change to data flow, API calls (`/api/customers`, `/api/onboarding/projects`, `/api/onboarding/projects/import`, `/api/onboarding/projects/check-name`, `/api/customers/check-name`, `/api/customers/[id]/primary-contact`, `/api/projects/[id]/programme/phase`), validation logic, XLSX parsing, or the `CLASSIFICATION_META`/`TYPE_CHIP_COLORS` maps' *icon* assignments — this task is visual/token-level only.

## Out of Scope / Must-Not-Change

- `new/page.tsx` and `import/page.tsx` (server wrappers — role/auth guard, redirect) — unchanged.
- `_onboarding-list.tsx` — already migrated (task 167); read-only reference for this task, not touched.
- `v2-hub-sidebar.tsx` / topbar — still out of scope per task 166/167's precedent.
- Any API route, Supabase query, or validation/business logic (classification grouping rules, date parsing, phase-overdue detection, name-uniqueness checks) — restyle only, behavior identical.
- No schema, RLS, or API contract changes.
- `react-day-picker` (`DateTimePicker`) and `xlsx` usage stay as-is functionally — only their rendered classNames get v2.0 tokens.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` | Modify (full rewrite) | Drop `isDark`, v2.0 tokens, fix classification-card hue collision, remove gradients/scale motion, CTA/blue/ghost button roles |
| `src/app/v2/(hub)/portfolio-tracker/import/_content.tsx` | Modify (full rewrite) | Same, plus review-table restyle and `TYPE_CHIP_COLORS` neutral fix |

## Code Context

### File: `src/app/v2/(hub)/dashboard/_components/dashboard-shared.tsx` (read-only reference — v2.0 primitives to reuse)

```tsx
export function Chip({ tone, dot, children, className }: ChipProps) { ... }  // tones: ok/warn/late/neutral/onboard/migrate/publish/ai/optimize
export function PhaseChip({ phaseNumber, phaseName }: { phaseNumber: number; phaseName: string }) { ... }
```
Import path from either wizard file: `import { Chip } from "../../dashboard/_components/dashboard-shared";` (mirrors `_onboarding-list.tsx:15`'s existing import). Only `Chip tone="neutral"` is relevant here — `PhaseChip`/`OnboardingStatusPill` don't apply to these two create/import flows (no phase/status field exists pre-creation).

### File: `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` (read-only reference — the exact v2.0 button/input/panel classNames already shipped for this feature)

```tsx
// CTA
"inline-flex items-center gap-2 px-[15px] py-2 rounded-full text-[12px] font-semibold transition-colors cursor-pointer bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white"
// Ghost
"inline-flex items-center gap-2 px-[15px] py-2 rounded-full border text-[12px] font-semibold transition-colors cursor-pointer border-[#E2E7F2] bg-white text-[#3A4565] hover:border-[#A8C6F5] hover:text-[#0B1533]"
// Page/panel title
"font-heading text-[22px] font-bold tracking-[-0.02em] text-[#0B1533]"
// Input (focus)
"rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]"
// Filter pill active (navy, never blue)
statusValue === s ? "bg-[#071133] border-[#071133] text-white" : "bg-white border-[#E2E7F2] text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533]"
// Card border/radius
"rounded-[14px] border ... border-[#E2E7F2] hover:border-[#A8C6F5]"
```

### File: `DESIGN.md` (repo root, read-only reference — Section 4 "Buttons")

```
CTA (orange): --orange bg, #471F02 text → hover --orange-600 + white text. One per screen.
Confirm/navigate (blue): --blue bg, white → hover --blue-700.
Ghost: white bg, --line border → hover border #A8C6F5.
Text link: --blue-700, 600 weight.
```

### File: `_final_design/guide/central-hub-style-guide.html:319-320` (read-only reference — concrete CTA precedent)

```html
<button class="btn btn-cta">+ Add client</button>
<button class="btn btn-cta">Start handover</button>
```
Used as the basis for Requirement F's "the action that begins something is the screen's CTA" rule.

### File: `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` (current — full file already read this session)

`CLASSIFICATION_META` (lines 68-171) is the six-color hue table Requirement D removes. `ClassificationCard` (lines 527-585) consumes it and has the `whileHover={{ y: -2 }}` lift Requirement G removes. `SuccessScreen` (lines 600-685) has the gradient icon circle Requirement E flattens. The step-3 action block (lines 1308-1444) has the `bg-gradient-to-br from-[#2563EB] to-[#1D4ED8]` buttons Requirement F/E fix.

### File: `src/app/v2/(hub)/portfolio-tracker/import/_content.tsx` (current — full file already read this session)

`TYPE_CHIP_COLORS` (lines 45-52) is the equivalent hue table for Requirement D. `TypeMultiSelect` (lines 274-416) renders it. The review table (lines 741-852) is Requirement H's restyle target. The result screen's two gradient icon-circle states (lines 570-577) are Requirement E's target.

## Implementation Steps

1. `new/_content.tsx`: remove `usePMSettings`/`isDark` import and every `isDark ? ... : ...` branch; verify the file still compiles with only the light-mode class chosen at each site (Requirement A).
2. Recolor all remaining hex literals per Requirement B (blue/ink/body/muted/line/line-soft/late).
3. Add `font-heading` to panel titles, `font-mono` to the customer-ID/date/count displays (Requirement C).
4. Rewrite `CLASSIFICATION_META` → neutral/blue-selected `ClassificationCard` styling, importing `Chip` where it fits (Requirement D).
5. Flatten both gradient icon circles and all gradient buttons to solid v2.0 colors (Requirement E).
6. Reassign button roles (CTA/blue/ghost/text-link) per Requirement F across both wizard's step-1/2/3 (and result-screen) action rows.
7. Strip `whileHover`/`whileTap` scale and the classification-card lift; keep the step-slide `AnimatePresence` transition (Requirement G).
8. Update outer panel radius/shadow (Requirement H).
9. Repeat steps 1–7 for `import/_content.tsx`, plus rewrite `TYPE_CHIP_COLORS` (Requirement D) and the review table's header/divider/row-hover styling (Requirement H).
10. Run `npx tsc --noEmit` and `pnpm lint`.
11. Manual pass (`pnpm dev`, visit `/v2/portfolio-tracker/new` and `/v2/portfolio-tracker/import` as a `pm`/`marketing`/`admin` role): walk both wizards end to end (all steps, both "new company"/"existing company" branches, schedule-vs-start-now branches, a CSV import with at least one row needing attention), confirming exactly one orange CTA is visible per screen, no gradients remain, classification/type selection reads clearly without the old rainbow hues, and dark-mode toggling in settings no longer affects either page (since `isDark` is gone).

## Acceptance Criteria

- [ ] Neither file imports `usePMSettings` or references `isDark`.
- [ ] No `#2563EB`/`#1D4ED8`/slate-Tailwind hex/`bg-gradient-to-br` remains in either file.
- [ ] Classification/project-type selection UI no longer reuses any of DESIGN.md's five phase hues (`#E2762F`/`#0063D6`/`#6A48E0`/`#0B8A93`/`#177E48`) for a non-phase meaning.
- [ ] Exactly one CTA-orange (`#FB914E`) button is visible at any given moment in either wizard.
- [ ] Page/panel titles use `font-heading`; no `font-heading` appears on a button, label, or table cell.
- [ ] IDs, dates, and counts render in `font-mono`.
- [ ] `npx tsc --noEmit` and `pnpm lint` both pass with no new errors.
- [ ] Manual walkthrough of both wizards (all steps/branches) confirms no visual regressions and matches DESIGN.md's Buttons/Forms/Panels/Motion sections.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: pnpm dev
#   /v2/portfolio-tracker/new  — walk all 3 steps, both company modes, schedule vs. start-now vs. start-at-phase (admin/marketing role), success screen
#   /v2/portfolio-tracker/import — upload a CSV with a mix of clean and attention-needed rows, fix a row, import, check result screen (both imported>0 and imported=0 states if feasible)
#   Confirm: one CTA orange max per screen, no gradients, classification/type pills read clearly without rainbow hues, dark-mode setting no longer changes either page
```

## Compatibility Touchpoints

- No schema, RLS, or API contract changes — both files consume existing routes unchanged.
- Dropping `isDark` from these two files is scoped exactly as task 167 scoped it for `_onboarding-list.tsx` — does not affect `usePMSettings()`'s theme toggle itself or any other page still honoring it.

## Implementation Notes

### What Changed
- Both `new/_content.tsx` and `import/_content.tsx` were rewritten in full per Requirements A–H.
- **A.** `usePMSettings`/`isDark` removed entirely from both files; every dark-mode class branch collapsed to its single light-mode value. `NewProjectWizard`'s `role` prop (unrelated to theming) is untouched.
- **B.** All old v1 hex (`#2563EB`/`#1D4ED8`, slate grays, `#DC2626` error) replaced with `DESIGN.md` literals (`#007BFF`/`#0063D6` blue, `#0B1533` ink, `#3A4565` body, `#5F6A88` muted, `#E2E7F2` line, `#EDF0F7` line-soft, `#F4F6FB` bg, `#C0392B` late). Focus rings now `rgba(0,123,255,.14)` per the Forms spec. Inputs, the date-time picker trigger/dropdown, the type-multiselect trigger/dropdown, and the review table's cell inputs all rest on `--bg` (`#F4F6FB`) and go white on focus, matching `_onboarding-list.tsx`'s shipped search-input precedent exactly.
- **C.** Panel-level step headings (`Company & contact`, `Project details`, `Review & create`, `Import project`, `Review & fix`) got `font-heading`. `font-mono` added to the customer-ID display/copy value, the import wizard's row-count (`{rows.length}` in "N rows parsed"), and the reviewed "Scheduled start" date (`ReviewRow`'s new `mono` prop). Also fixed `"Import Project"` → `"Import project"` for DESIGN.md's sentence-case rule (a real, if minor, second Voice & Tone violation found while touching that heading).
- **D.** `CLASSIFICATION_META`'s six-hue table replaced with `CLASSIFICATION_ICON`/`CLASSIFICATION_DESC` maps in `new/_content.tsx`; `ClassificationCard` now uses one neutral (`line-soft`/`muted`) unselected state and one blue (`blue-100`/`blue-700`/`blue` border) selected state, icons doing all the differentiating. `import/_content.tsx`'s `TYPE_CHIP_COLORS` table removed the same way — `TypeMultiSelect`'s trigger pills are now a single neutral (`line-soft` bg/`muted` text) style, and the dropdown's selected-row highlight is blue (`#F0F7FF`/`#007BFF` check), not per-type hue. Neither file ended up importing `Chip` from `dashboard-shared.tsx` — see Deviations below.
- **E.** All gradients removed: `SuccessScreen`'s icon circle is flat `#177E48` (ok); the import result screen's two icon-circle states are flat `#177E48` (imported > 0) / `#C0392B` (imported = 0, using `late` instead of orange since orange is CTA-only); the New Project step-3 "Start"/"Save + set schedule" buttons lost their `bg-gradient-to-br` in favor of flat colors assigned per Requirement F's button roles.
- **F.** Button roles reassigned exactly per the plan: step 1/2 "Continue" and "Save + set schedule"/"Confirm & schedule" → confirm/navigate blue; step 3 "Start Phase X Now"/"Start onboarding" and the import wizard's "Import N projects" → CTA orange (`#FB914E`/`#471F02` → hover `#E2762F`/white); "Just save", "Back", "Choose a different file", "Import another file" → ghost; "Back to projects" (both success screens) → ghost (New Project) / confirm-navigate blue (Import, matching the plan's asymmetric mapping for that specific button). Verified only one CTA-orange button is ever rendered at a time in both wizards (the New Project step-3 CTA and the schedule-flow's blue "Confirm & schedule" are mutually exclusive via the existing `scheduleExpanded` conditional).
- **G.** Removed `motion.button`/`whileHover`/`whileTap` scale animations from all buttons (now plain `<button>` + `transition-colors`) and the `whileHover={{ y: -2 }}` lift from `ClassificationCard` (now plain `<button>`). Kept the step-content `AnimatePresence` slide transition and the step-indicator's animated color/box-shadow, per the plan's explicit carve-out (functional wayfinding, compositor-safe properties only).
- **H.** Outer wizard panel radius changed `rounded-2xl` → `rounded-[14px]`; shadow changed to `shadow-[0_1px_2px_rgba(7,17,51,0.05)]` (`--sh-sm`) in both files. Import wizard's review table restyled: header `#FAFBFE` bg with the 9.5px/700/caps/+0.09em table-header type spec, `line-soft` row dividers, `blue-50` row hover.
- No changes to any API call, validation function (`resolveClassifications`, `resolvePhase`, `resolveDate`, `resolvePrimaryContact`, `isOverdue`), XLSX parsing, or `buildCreatePayload`/`submit`/`startAtPhase` logic in either file — confirmed by diffing the retained business-logic blocks against the original read earlier in this session.

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` — full rewrite per Requirements A–C, D (new-file half), E–H
- `src/app/v2/(hub)/portfolio-tracker/import/_content.tsx` — full rewrite per Requirements A–C, D (import-file half), E–H

### Deviations From Plan
- Requirement D's "where practical, import and reuse `Chip`" was evaluated but not applied to either file: `new/_content.tsx`'s `ClassificationCard` is a large selection card (40px icon tile + description text), not a small pill, so `Chip`'s shape doesn't fit it at all. `import/_content.tsx`'s `TypeMultiSelect` trigger pills need a per-pill remove `X` button `Chip` doesn't provide (the same reason the task doc itself flagged as the expected exception). Both files instead use bespoke elements recolored to `Chip`'s exact `neutral` tone values (`bg-[#EDF0F7] text-[#5F6A88]`) — same visual result, no new dependency between these page-scoped files and `dashboard-shared.tsx`. The task doc explicitly allowed this ("or an equivalent neutral pill... only build bespoke where `Chip`'s fixed shape doesn't fit"), so this is a covered contingency, not an undocumented deviation.
- One drafting mistake caught and fixed before verification: an accidental leftover `import { useRouter as _unused_useRouter } from "next/navigation";` line was written into `import/_content.tsx` during the rewrite and removed immediately after, before running `tsc`/`lint`.
- Two `design-system-font-size` findings from the `impeccable` hook (`import/_content.tsx`, `TypeMultiSelect`'s search input and option-row text, both `text-[12px]`) were left unchanged — these are pre-existing values carried over verbatim from the original file (not introduced by this task), and 12px sits between DESIGN.md's documented 11px "small label" and 13px "body" steps rather than violating either. Matches the same stale-`.impeccable/design.json`-sidecar pattern tasks 166/167 already logged and left alone (the hook's own message confirms: "DESIGN.md is newer than .impeccable/design.json"). No requirement in this task's scope called for touching `TypeMultiSelect`'s type sizing.

### Verification Run
- `npx tsc --noEmit` — PASS, no errors.
- `pnpm lint` — PASS, exit 0, no output (no errors or warnings in either touched file or anywhere else in the repo).
- Manual in-browser QA — **NOT RUN**, no test credentials/session available in this environment (same constraint noted in tasks 166/167). Flagged for the user's own live-testing pass per Requirement's Verification section: walk both wizards end to end (all steps, both company modes, schedule-vs-start-now-vs-start-at-phase branches, a CSV import with a mix of clean/attention-needed rows) to confirm no visual regressions.

## Revision 1 (post-Testing user feedback)

User reviewed the shipped Testing build and requested five changes to the Import wizard's Review & Fix table plus a button-radius audit across both wizards. Applied directly against the same two files (task stayed in `Testing`, not reopened as a new task).

### What Changed
1. **Table fields "too classic"** — every editable cell in the review table (`import/_content.tsx`) switched from an always-visible-border box to a borderless-until-interaction style: `border-transparent bg-transparent` at rest, `hover:bg-[#F4F6FB]` on hover, `focus:border-[#007BFF] focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,123,255,0.10)]` on focus/open — a standard inline-edit/spreadsheet-cell pattern (Airtable/Sheets-style), replacing the "form input trapped in a table cell" look the user flagged. Applies to the Customer input, Primary Contact input, `TypeMultiSelect` trigger, and the Current Phase `<select>`. The Customer input's required-field error state keeps a visible `#F5C6C2` border + faint red tint so validation stays legible against the now-borderless default.
2. **Kickoff Date picker parity with New Project's Schedule field** — added `KickoffDatePicker`, a date-only sibling of `../new/_content.tsx`'s `DateTimePicker` (same v2.0 calendar styling, same `DayPicker` classNames), replacing the native `<input type="date">`. No time panel — `ImportRow.kickoffDate` is a plain `yyyy-mm-dd`, so a time picker would be scope creep on the data shape. Positioned via a `document.body` portal (mirroring `TypeMultiSelect`'s existing pattern in this same file, not `DateTimePicker`'s simple relative positioning) since it lives inside the review table's `overflow-x-auto` container, which would otherwise clip a relatively-positioned dropdown.
3. **Warning-text wrapping** — the table switched from browser-default auto layout (which let one-line warnings like "Overdue — Day 16, past the 15-day Onboarding window" force the whole column wider, stealing space from neighboring columns) to `table-fixed` with an explicit `<colgroup>`. Warning/hint text (`Select at least one`, the raw-placeholder note, the Overdue message) now wraps within its fixed column width instead of pushing the table wider — also got `leading-snug` for tighter multi-line spacing.
4. **Column widths** — `<colgroup>` widths: Customer 220px (was ~160px implicit), Project Type 190px, Primary Contact 200px (was 140px), Kickoff Date 150px, Current Phase 210px (was 170px — needed room for the longest phase name, "Migrate & Rebrand"), Remove 52px. Total ~1022px comfortably fits the wizard's `max-w-300` (1200px) panel; `overflow-x-auto` stays as a narrow-viewport fallback.
5. **Remove-button tooltip** — wrapped the trash icon button in the existing `Tooltip`/`TooltipTrigger`/`TooltipContent` primitives from `@/components/ui/tooltip` (same Base UI component `_onboarding-list.tsx`'s `AvatarTip` already uses elsewhere in this feature — no new dependency), label "Remove" per the user's preferred short option. The button's `aria-label="Remove row"` is unchanged (screen-reader label stays row-specific; the visible tooltip is the shorter, generic action name).
6. **Button-radius token violation** — audited both files against `DESIGN.md` Section 4 ("Buttons — pill radius (999px), one job each") and found every actual action button in both wizards had been left on the old v1 file's `rounded-[9px]`/`rounded-[8px]` radius during the original task 183 rewrite instead of being updated to `rounded-full`. Fixed in both files: New Project's step-nav Back/Continue, "Start Phase X Now"/"Start onboarding", "Cancel scheduling" icon button, "Just save", "Save + set schedule"/"Confirm & schedule", the time-picker's "Done" button, the day-picker's prev/next nav icons, and the success screen's "Back to projects"/"View project"; Import's step-nav "Choose a different file"/"Import N projects" and the result screen's "Import another file"/"Back to projects". Left unchanged (correctly, not a violation): form-control elements styled as inputs rather than discrete actions — `Field`'s text input, `DateTimePicker`'s/`KickoffDatePicker`'s trigger buttons (visually identical to a bordered input row, not a pill button), the hour/minute `<select>`s, and the `New company`/`Existing company` and `AM`/`PM` segmented toggles (a distinct "segmented control" affordance DESIGN.md doesn't fold into its Buttons or Filter-pills spec) — these all correctly keep DESIGN.md's `--r-md`-scale (~9-10px) input radius.

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/import/_content.tsx` — table restyle, `KickoffDatePicker` added, tooltip added, button radii fixed
- `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` — button radii fixed only (no other changes requested for this file)

### Deviations From Plan
- None — this revision was scoped entirely by the user's five explicit requests plus the button-radius audit they asked for ("check the style guide"); no additional judgment calls beyond the input-vs-button radius distinction explained above.

### Verification Run
- `npx tsc --noEmit` — PASS, no errors.
- `pnpm lint` — PASS, exit 0, no output.
- `impeccable` hook — flagged the same 2 pre-existing `text-[12px]` findings from the original implementation (`TypeMultiSelect`'s search input/option rows, untouched by this revision) plus incidental re-flags of the same lines as edits landed nearby; no new findings from the added `KickoffDatePicker` component or table changes. No action taken, consistent with the original Implementation Notes' rationale.
- Manual in-browser QA — **NOT RUN**, same environment constraint as the original implementation. Flagged for the user's live pass: confirm the review table's inline-edit hover/focus feel, the new date picker's portal positioning doesn't clip against the table's horizontal scroll, warning text wraps instead of stretching columns, and every button reads as a pill (no square-cornered buttons) in both wizards.

## Revision 2 (post-Revision-1 user feedback, with screenshot)

User reviewed Revision 1's live rendering (screenshot showing the review table) and requested four more changes, all scoped to `import/_content.tsx`'s review table.

### What Changed
1. **Customer & Primary Contact → `<textarea>`** — both fields were clipping long values (visible in the screenshot: "Retail Sign Systems / The Jant G…", "Saginaw Community Food Club &…"). Converted both from `<input>` to an auto-growing `<textarea rows={1} className="resize-none overflow-hidden">`, height set via a callback `ref` (`el.style.height = "auto"; el.style.height = el.scrollHeight + "px"`) that runs on mount and every re-render, so long values wrap to multiple lines and grow the row instead of being cut off. Added an `onKeyDown` guard that no-ops on `Enter` — the textarea is for wrapping display of a single value, not literal multi-line entry, so it must not let a stray Enter keystroke inject a `\n` into `account`/`primaryContact` before those strings reach `POST /api/onboarding/projects/import`.
2. **Message/value left-alignment** — the sub-field messages ("Select at least one", the raw-placeholder `"To be confirmed"` note, "Overdue — …") had no left padding while the controls above them do (`TypeMultiSelect`'s trigger: `px-2` + `Search` icon (11px) + `gap-1` (4px) = 23px before its text starts; the Primary Contact field and Current Phase `<select>` both start text at their own `px-2.5` = 10px). Added matching `pl-[23px]` to the Project Type message and `pl-2.5` to the Primary Contact and Current Phase messages so each message's text now lines up with the value/placeholder text directly above it, per the user's screenshot callout.
3. **Row-hover borders** — added `"group"` to each `<tr>`'s className and `group-hover:border-[#E2E7F2]` to every field's rest-state border class (Customer/Primary Contact textareas, `TypeMultiSelect`'s trigger, `KickoffDatePicker`'s trigger, Current Phase `<select>`) so hovering anywhere on a row now reveals all of that row's field borders together (still `--line`, not blue — blue stays reserved for actual focus), instead of each field only showing a border on its own individual hover. This works purely via Tailwind's `group`/`group-hover:` CSS variant, which resolves through the DOM tree regardless of the component boundaries `TypeMultiSelect`/`KickoffDatePicker` introduce, so no prop drilling was needed to reach into those child components.

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/import/_content.tsx` — table field type change (textarea), message padding, row-level `group`-hover borders

### Deviations From Plan
- None — scoped entirely by the user's four explicit requests.

### Verification Run
- `npx tsc --noEmit` — PASS, no errors.
- `pnpm lint` — PASS, exit 0, no output.
- Manual in-browser QA — **NOT RUN**, same environment constraint as prior rounds. Flagged for the user's live pass: confirm textarea auto-grow renders correctly on initial load (existing long CSV values, not just newly-typed ones), confirm message text now visually lines up under its field's value text, and confirm hovering any part of a row reveals borders on every field in that row.

## Revision 3 (post-Revision-2 user feedback, with screenshot)

Once Customer/Primary Contact could wrap to two lines (Revision 2), rows containing a wrapped value grew taller — but Project Type, Kickoff Date, and Current Phase stayed pinned to their natural single-line height at the top of the now-taller row, leaving visible empty space below them and making those fields look small/cramped next to the taller Customer/Primary Contact boxes (per the user's screenshot of an affected row).

### What Changed
- Every field in the row now stretches to the row's full height instead of sitting at its own natural content height:
  - `TypeMultiSelect`'s trigger (`div`) and `KickoffDatePicker`'s trigger (`button`) — both flex containers — got `h-full` added alongside their existing `min-h-[34px]`/no-min-height, so they grow to match the tallest cell in the row while keeping their content vertically centered (`items-center`, unchanged).
  - The Current Phase `<select>` got `h-full`.
  - The Customer and Primary Contact `<textarea>`s got `min-h-full` (not `h-full`) — `height` is set imperatively via the ref callback's inline `style.height`, and an inline style always wins over a class-based `height` rule, so a `h-full` class would have been silently ineffective; `min-height` is a distinct property that isn't overridden by an inline `height`, so the browser correctly uses whichever is larger (the textarea's own content height, or the row's height set by a taller sibling), fixing the case now visible in both directions (a wrapped Customer next to a short Primary Contact, and vice versa).
- All of this relies on each `<td>` already having a definite height once the table row's layout is resolved (standard CSS table layout behavior) — no JS row-height syncing was needed since every field is now either a direct height:100%-based flex/select child of its `td`, or a `min-height:100%`-clamped textarea.

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/import/_content.tsx` — `h-full`/`min-h-full` added to all five editable-field controls in the review table

### Deviations From Plan
- None — scoped entirely by the user's request and screenshot.

### Verification Run
- `npx tsc --noEmit` — PASS, no errors.
- `pnpm lint` — PASS, exit 0, no output.
- Manual in-browser QA — **NOT RUN**, same environment constraint as prior rounds. Flagged for the user's live pass: confirm every field in a row with a wrapped Customer/Primary Contact value now visually fills the row's full height (no more short-looking single-line fields sitting in extra whitespace), in both a row where Customer wraps and one where Primary Contact wraps.

## Revision 4 (Revision 3's CSS fix didn't hold — replaced with deterministic JS measurement)

User reported Customer/Primary Contact were still visually small next to Kickoff Date after Revision 3. Root cause: Revision 3 relied on `min-height: 100%` resolving against the table row's height. Table cells are a documented CSS spec exception where percentage-height children *can* resolve against the row's used height — but that resolution depends on the whole percentage-height chain holding up, and it evidently wasn't holding up reliably in this table (a known flaky area even where nominally spec-supported). Replaced the CSS-only approach with a deterministic JS measurement that doesn't depend on percentage-height resolution at all.

### What Changed
- Extracted the table's `<tr>` into its own `ReviewTableRow` component (module scope, defined after `KickoffDatePicker`/before `ImportProjectWizard`, matching this file's existing component-ordering convention). It holds two refs (`accountRef`, `contactRef`) and a `rowHeight` state, and a `useLayoutEffect` (keyed on `row.account`/`row.primaryContact`) that: resets both textareas to `height: auto`, reads their natural `scrollHeight`, takes `Math.max(34, accountScrollHeight, contactScrollHeight)`, writes that back as an explicit `px` height on both textareas, and stores it in `rowHeight` state.
- `rowHeight` is now passed down as an explicit `minHeight` prop to `TypeMultiSelect` and `KickoffDatePicker` (both gained the prop, applied via `style={{ height: minHeight }}` on their trigger element) and as an inline `style={{ height: rowHeight }}` on the Current Phase `<select>` — replacing the removed `h-full`/`min-h-full` classes entirely, so every field's height is now driven by the same single JS-computed number instead of a mix of CSS percentage resolution and inline pixel values.
- `needsAttention` (previously a closure defined inside `ImportProjectWizard`, using no component state — a pure function of `ImportRow`) was hoisted to module scope, next to the file's other pure per-row helpers (`isOverdue`, `resolveClassifications`, etc.), since `ReviewTableRow` — now defined above `ImportProjectWizard` in the file — needs to call it and can't reach a closure defined inside a component declared later in the module. `ImportProjectWizard` itself still computes `attentionCount`/`importableCount` from it exactly as before.
- The reset-to-`auto`-before-measuring step (on both fields, every time either changes) is what lets the row shrink back down again if a long value gets edited to something shorter — without it, a field that was previously stretched to match a taller sibling would just keep reporting its own already-stretched height back.

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/import/_content.tsx` — new `ReviewTableRow` component; `minHeight` prop added to `TypeMultiSelect` and `KickoffDatePicker`; `needsAttention` moved to module scope; table body now renders `<ReviewTableRow>` instead of an inline per-row JSX block

### Deviations From Plan
- None beyond the `needsAttention` hoist, which was a mechanical requirement of the extraction (not a design decision) — the function's behavior is byte-for-byte unchanged, only its declaration site moved.

### Verification Run
- `npx tsc --noEmit` — PASS, no errors (confirms the `needsAttention` scope fix resolved cleanly).
- `pnpm lint` — PASS, exit 0, no output.
- Manual in-browser QA — **NOT RUN**, same environment constraint as prior rounds. Flagged for the user's live pass: confirm Customer/Primary Contact/Project Type/Kickoff Date/Current Phase are now visibly the same height in every row (single-line and wrapped alike), and confirm a row shrinks back down correctly after editing a long Customer or Primary Contact value down to something short.

## Revision 5 (New Project wizard — "Confirm & schedule" recolored to match "Start Now", per user screenshots)

User compared the two live step-3 screens (Review & Create's schedule-expanded state vs. the Start-at-phase screen) and asked for the "Confirm & schedule" button to use the same color as "Start Phase X Now"/"Start onboarding" — overriding Requirement F's original blue confirm/navigate assignment for that specific button now that it's been seen next to its sibling live.

### What Changed
- `new/_content.tsx`'s "Confirm & schedule" button (the `scheduleExpanded === true` state of the "Save + set schedule" button) recolored from `bg-[#007BFF]`/white text/blue shadow to the same flat `bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white` treatment as "Start Phase X Now"/"Start onboarding" (also dropping the blue-tinted shadow to match that button's flat, shadow-less style exactly). No DESIGN.md "one CTA per screen" conflict: "Start Phase X Now" only renders when `!scheduleExpanded`, "Confirm & schedule" only when `scheduleExpanded` — the two are mutually exclusive, so at most one orange CTA is ever visible at once, same as before this change.

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` — one button's color classes changed

### Deviations From Plan
- This reverses the earlier Requirement F assignment for this one button (originally blue, "it schedules a future start, isn't itself the start-now action") — explicit user direction after seeing both states live, not a bug fix.

### Verification Run
- `npx tsc --noEmit` — PASS, no errors.
- `pnpm lint` — PASS, exit 0, no output.
- Manual in-browser QA — **NOT RUN**, same environment constraint as prior rounds.
