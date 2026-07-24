# 184: Customers Page — Design System v2.0 Redesign + Customer ID Search

**Created:** 2026-07-24
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Completed (2026-07-24)

---

## Overview

`/v2/customers` (`_customers-index.tsx`, 333 lines + `page.tsx`, 134 lines + `loading.tsx`, 67 lines) is still on the pre-v2.0 look — `slate-*` Tailwind classes, ad-hoc hex in `STATUS_STYLE`, `rounded-xl`/`rounded-lg` radii, no `font-heading`/`font-mono` type roles. It has not yet been touched by any of the v2.0 migration tasks (166/167/173/179/183) that already moved `/v2/dashboard` and `/v2/portfolio-tracker` onto **Design System v2.0** (`DESIGN.md`, repo root — content ~99% identical to `_final_design/guide/central-hub-design-system.md`/`central-hub-style-guide.html`, the files the user pointed at; per the codebase's established convention, `DESIGN.md` is the source of truth and the `_final_design/guide/` files are the concrete visual reference, `central-hub-style-guide.html` in particular for literal component markup/classes).

`/v2/portfolio-tracker`'s list page (`_onboarding-list.tsx`, migrated in task 167) is the concrete reference this task follows — it already ships every v2.0 primitive this page needs: the `Chip` component (`dashboard-shared.tsx`), the pill-radius CTA/ghost button classes, the navy filter-pill pattern, the `bg-[#F4F6FB]`-on-`bg`/focus-white input pattern, and pill-radius pagination controls. Reuse its literal classNames wherever the two pages' UI matches (search input, filter pills, pagination, empty state) — this task is deliberately not inventing new patterns.

**Layout decision:** unlike `_onboarding-list.tsx` (which uses a card grid because each project needs a multi-line phase/progress/member summary), `/v2/customers` stays a **table/row list** — it's a dense, column-scannable list (company / contact / status / onboarding / projects) with more rows and less per-row content than the portfolio grid. This follows DESIGN.md Section 5's **Table** spec (`#FAFBFE` header background, `line-soft` dividers, `blue-50` row hover, first column padded 18px) rather than converting to cards — a deliberate scope decision, not an oversight, matching how task 183 made an explicit scope call for its own layout question.

**Customer-ID search:** already implemented server-side — `page.tsx:64-68`'s `.or()` filter already includes `customer_id.ilike.%${searchQ}%` alongside company/contact/email. This task does **not** need a backend change for search; it needs to (a) verify that behavior survives the rewrite untouched, and (b) make it discoverable in the UI — update the search placeholder to mention customer ID, and keep the customer ID visible under the company name (already rendered at `_customers-index.tsx:297`, just needs v2.0 recoloring/mono treatment it already mostly has).

## Requirements

### A. Color tokens — replace `slate-*` Tailwind + old hex with DESIGN.md literals
- [ ] `text-slate-900`/`text-slate-800` → `ink` (`#0B1533`); `text-slate-600`/`text-slate-700` → `body` (`#3A4565`); `text-slate-400`/`text-slate-500`/`text-slate-300` → `muted` (`#5F6A88`); `border-slate-200`/`border-slate-100`/`border-slate-50` → `line` (`#E2E7F2`) / `line-soft` (`#EDF0F7`) matched by role (card/table outer border → `line`, row dividers → `line-soft`); `bg-slate-50` (page bg) → `bg` (`#F4F6FB`); `bg-white` stays `surface`.
- [ ] `STATUS_STYLE` map (`_customers-index.tsx:42-47`): replace the four ad-hoc hex triples with DESIGN.md semantic tones — `active` → `ok` (`#177E48`/`#E3F5EA`), `onboarding` → `warn` (`#8A5A00`/`#FFF3D6`), `completed_onboarding` → `ok` (`#177E48`/`#E3F5EA`, distinguished from `active` by a checkmark instead of a dot — same pattern `OnboardingStatusPill` already uses in `dashboard-shared.tsx:275-282` for its own `completed` vs `in_progress` distinction), `inactive` → `neutral` (`#5F6A88`/`#EDF0F7`). **Do not** use any of the five reserved phase hues (`ph-onboard`/`ph-migrate`/`ph-publish`/`ph-ai`/`ph-optimize`) here — `customers.status` is a coarse lifecycle flag, not the fine-grained 120-day phase tracked per-project, and DESIGN.md is explicit that a phase hue is never reused for a non-phase meaning (the exact violation task 183 Requirement D fixed elsewhere).
- [ ] `ProgressCell`'s bar (`_customers-index.tsx:80-85`): track `bg-slate-100` → `bg-[#EDF0F7]` (`line-soft`), fill `bg-blue-500` → `bg-[#007BFF]` (`blue`).
- [ ] "New Customer" button (`bg-slate-900 hover:bg-slate-800`) — see Requirement E, becomes CTA orange, not a navy/slate recolor.
- [ ] Status filter pills (`bg-slate-900`/`text-slate-500`) — see Requirement F, becomes the navy-active filter-pill pattern, not a literal color swap.

### B. Radius & elevation — DESIGN.md Section 4
- [ ] Table container: `rounded-xl` → `rounded-[14px]` (`--r-lg`); shadow stays border-only (`border border-[#E2E7F2]`) — no shadow currently applied here, matches DESIGN.md's `sh-sm` default (`0 1px 2px rgba(7,17,51,.05)`) if any shadow is added, but a flat 1px border alone is already spec-compliant since panels only need `sh-sm`, not more.
- [ ] Search input / status-`<select>` in pagination: `rounded-lg` → `rounded-[10px]` (`--r-md`, DESIGN.md Forms spec).
- [ ] Pagination nav buttons: `rounded-md` → `rounded-full` (DESIGN.md: buttons/pills are pill radius, 999px) — matches `_onboarding-list.tsx:359-370`'s shipped pagination button classes exactly.
- [ ] "New Customer" button and status filter pills: pill radius (`rounded-full`), not `rounded-lg`/`rounded-md` — required either way once Requirements E/F apply their new button/pill roles.

### C. Typography — DESIGN.md Section 3
- [ ] Page title ("Customers"): add `font-heading` (Space Grotesk), recolor to `ink`; keep the existing `text-[22px] font-bold tracking-[-0.02em]` sizing (matches `_onboarding-list.tsx:271`'s shipped page-title convention exactly, including its `-0.02em` tracking, which is the app's established practical value even though DESIGN.md's literal token is `-0.015em` — same precedent task 183 followed for its own panel titles).
- [ ] Table header row cells ("Company"/"Contact"/"Status"/"Onboarding"/"Projects"): swap `text-[11px] font-semibold text-slate-500 uppercase tracking-wide` → DESIGN.md's table-header spec, `text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]`.
- [ ] Everything else (row text, buttons, filter labels, status labels) stays Inter — never `font-heading` on a button, label, or table cell, per DESIGN.md's explicit ban.
- [ ] `font-mono` (JetBrains Mono) on: the customer ID under company name (already `font-mono`, just recolor — `_customers-index.tsx:297`), the "Day X/120" text in `ProgrammeBadge` (currently plain Inter — add `font-mono`), the progress percentage in `ProgressCell` (already `font-mono` — recolor only), the `N–M of Total` pagination range text (already `font-mono`? — no, currently plain `text-[12px] text-slate-400 tabular-nums`; add `font-mono`, matching `_onboarding-list.tsx:355`'s `text-[12px] font-mono text-[#5F6A88]`), and the "N per page" `<select>` stays plain Inter (it's a control label, not a data value).

### D. Search — surface existing customer-ID search, no backend change
- [ ] Verify `page.tsx:64-68`'s `.or("company_name.ilike...,customer_id.ilike...")` clause survives the rewrite untouched — this is a read-only carry-forward, not a new feature.
- [ ] Update the search input's placeholder from `"Search customers…"` to `"Search company, contact, or customer ID…"` so the existing capability is discoverable.
- [ ] Restyle the input itself to DESIGN.md's Forms spec / `_onboarding-list.tsx:300-315`'s shipped search-input classes: `bg-[#F4F6FB]` at rest, `focus:bg-white focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14]`, `rounded-[10px]`.

### E. "New Customer" button → CTA orange
- [ ] This is the one "act now" action on the screen (creates a new customer record) — per DESIGN.md's One-CTA Rule and the same reasoning task 183 applied to "Start onboarding"/"Import N projects" and `_onboarding-list.tsx`'s own shipped `+ New Project` button (`_onboarding-list.tsx:288-293`). Recolor from `bg-slate-900 hover:bg-slate-800 rounded-lg` to the exact CTA class string: `bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white rounded-full`, pill padding (`px-[15px] py-2`), `text-[12px] font-semibold`.

### F. Status filter pills → navy-active pattern
- [ ] Replace the current segmented-group `bg-slate-900`/hover-only-text pattern (`_customers-index.tsx:192-205`) with DESIGN.md's individual floating pill pattern: inactive `bg-white border-[#E2E7F2] text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533]`, active `bg-[#071133] border-[#071133] text-white` (navy, never blue — filters are selection state, not actions), `rounded-full`, `text-[11px] font-semibold`, `aria-pressed`. Matches `_onboarding-list.tsx:319-333`'s shipped filter-pill block exactly (same five-status shape, just a different `STATUS_FILTERS`/`STATUS_LABELS` source).

### G. Table restyle — DESIGN.md Section 5 "Table"
- [ ] Header row: `bg-slate-50` → `#FAFBFE`; bottom border `border-slate-100` → `line-soft` (`#EDF0F7`).
- [ ] Row dividers: `border-slate-50` → `line-soft` (`#EDF0F7`).
- [ ] Row hover: `hover:bg-slate-50` → `hover:bg-[#F0F7FF]` (`blue-50`), per DESIGN.md's Table spec and Motion section ("Row hover = `blue-50` tint").
- [ ] First column left padding: DESIGN.md specifies 18px — current `px-5` (20px) is close; either leave as-is (2px off DESIGN.md's literal spec, cosmetically negligible and consistent with the rest of the row's `px-5`) or tighten specifically the first cell to `pl-[18px]` if an exact-token match is wanted. Implementation-time call; not a hard requirement given the row's shared `px-5` gutter would otherwise look inconsistent column-to-column.
- [ ] `StatusBadge` (now DESIGN.md Chip): swap the hand-rolled `<span style={...}>` for the shared `Chip` component (`dashboard-shared.tsx`) with a leading dot for `active`/`onboarding`, a leading check icon for `completed_onboarding` (mirroring `OnboardingStatusPill`), no dot for `inactive` — per Requirement A's tone mapping and DESIGN.md's Chips spec ("Status chip: leading 5px dot, `ok`/`warn`/`late` tints").
- [ ] `ProjectsCount` button (currently `border-slate-200`/`rounded-lg`): border → `line`, radius → `rounded-full` (buttons are pill radius), hover → `hover:bg-[#F0F7FF] hover:border-[#A8C6F5]` matching the rest of the page's ghost-button hover treatment.

### H. Empty state — teach, don't just say "not found" (DESIGN.md Voice & Tone)
- [ ] Recolor icon circle (`bg-slate-100`/`text-slate-400`) → `bg-[#F0F7FF]`/`text-[#007BFF]` (matches `_onboarding-list.tsx:397-398`'s no-data empty state).
- [ ] Copy: replace generic "No customers found" / "Try a different search or filter." with state-aware copy — no filters active: `"No customers yet — new customers you onboard will appear here."`; filtered/searched with zero results: keep `"No customers match your search"` / `"Try a different search term or clear the filter."`, matching `_onboarding-list.tsx:407-422`'s two-empty-state pattern (`projects.length === 0` vs `paginated.length === 0`) rather than one blended message for both cases.

### I. Motion
- [ ] No `framer-motion` usage exists in this file today — nothing to remove. Verify all recolored hover states use plain `transition-colors` (already the case throughout), consistent with DESIGN.md's 160ms compositor-only transition rule.

### J. Loading skeleton (`loading.tsx`) — keep in sync with the restyled layout
- [ ] Recolor `Bone`'s `bg-slate-100` → `bg-[#EDF0F7]` (`line-soft`); container `rounded-xl`/`border-slate-200` → `rounded-[14px]`/`border-[#E2E7F2]`; header skeleton `bg-slate-50` → `bg-[#F4F6FB]`; "New Customer" button bone → pill (`rounded-full`) width/height matching the real CTA button's new size; table header bone row background → `#FAFBFE`. Column widths/grid stay identical to `_customers-index.tsx`'s real grid (`grid-cols-[1fr_1fr_90px_140px_100px]`) so the skeleton doesn't jump on hydration.

## Out of Scope / Must-Not-Change

- `src/app/v2/(hub)/customers/[customerId]/*` (customer detail page, programme tab) — separate surface, not touched by this task.
- `src/app/v2/(hub)/customers/onboard/*` (New Customer wizard) — separate surface; only the list page's entry-point button (Requirement E) is in scope, not the wizard itself.
- `v2-hub-sidebar.tsx` / topbar — still un-migrated per DESIGN.md's "Adoption status," out of scope per every prior migration task's precedent (166/167/183).
- Supabase queries, pagination math, realtime `customer_products` subscription (`_customers-index.tsx:112-122`), `ProgrammeBadge`'s day/phase computation (`getCurrentProgrammeDay`/`getPhaseForDay`) — restyle only, no data/behavior changes.
- The `customer_id.ilike` search clause itself (`page.tsx:66`) — already correct, carried forward unchanged (see Requirement D).
- No schema, RLS, or API contract changes.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/customers/_customers-index.tsx` | Modify (full rewrite) | v2.0 tokens, `Chip`-based status badges, CTA/ghost/filter-pill button roles, table restyle, search placeholder |
| `src/app/v2/(hub)/customers/loading.tsx` | Modify | Recolor skeleton to match restyled layout (Requirement J) |
| `src/app/v2/(hub)/customers/page.tsx` | No change expected | Verify `customer_id.ilike` search clause is untouched (Requirement D) — read/confirm only |

## Code Context

### File: `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` (read-only reference — the exact v2.0 classNames to reuse)

```tsx
// Search input (lines 300-315)
"w-full pl-8 pr-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] placeholder:text-[#5F6A88]"

// Filter pill (lines 320-332)
"px-3 py-[4.5px] rounded-full border text-[11px] font-semibold transition-colors cursor-pointer"
// active: "bg-[#071133] border-[#071133] text-white"
// inactive: "bg-white border-[#E2E7F2] text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533]"

// CTA button (lines 288-293)
"inline-flex items-center gap-2 px-[15px] py-2 rounded-full text-[12px] font-semibold transition-colors cursor-pointer bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white"

// Pagination nav button (lines 359-370)
"flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"

// Empty state icon circle (lines 396-399)
"w-14 h-14 rounded-2xl flex items-center justify-center bg-[#F0F7FF]" // + <Icon className="text-[#007BFF]" />

// Page title (line 271)
"font-heading text-[22px] font-bold tracking-[-0.02em] flex items-center gap-2 text-[#0B1533]"
```

### File: `src/app/v2/(hub)/dashboard/_components/dashboard-shared.tsx` (read-only reference — `Chip` primitive to reuse)

```tsx
export function Chip({ tone, dot, children, className }: ChipProps) { ... }
// tones: ok/warn/late/neutral/onboard/migrate/publish/ai/optimize — this task uses only ok/warn/neutral
```
Import path: `import { Chip } from "../dashboard/_components/dashboard-shared";` (one level up from `../../dashboard/...` since `_customers-index.tsx` lives at `customers/`, a sibling of `dashboard/`, not nested two levels deep like the portfolio-tracker files — verify the relative path resolves; `customers/` and `dashboard/` are both direct children of `(hub)/`).

### File: `src/app/v2/(hub)/customers/_customers-index.tsx` (current — full file already read this session)

`STATUS_STYLE`/`STATUS_FILTERS`/`STATUS_LABELS` (lines 34-47) is the color table Requirement A/F replace. `StatusBadge` (lines 50-60) becomes a `Chip` wrapper per Requirement G. `ProgressCell` (lines 73-89) needs track/fill recolor (Requirement A). The toolbar (lines 172-262) and table (lines 279-327) are the bulk of the rewrite (Requirements D-H).

### File: `src/app/v2/(hub)/customers/page.tsx` (current — full file already read this session)

Lines 56-71 build the customers query; line 66's `.or(...)` clause already includes `customer_id.ilike.%${searchQ}%` — confirm this line is unchanged after the `_customers-index.tsx` rewrite (Requirement D is a UI-surfacing task, not a query change).

## Implementation Steps

1. Recolor all `slate-*`/old-hex literals in `_customers-index.tsx` per Requirement A (page bg, borders, text roles, `STATUS_STYLE`, `ProgressCell`).
2. Add `font-heading` to the page title; `font-mono` to customer ID, day/phase text, progress %, and pagination range text (Requirement C).
3. Rebuild `StatusBadge` on top of `Chip` from `dashboard-shared.tsx` with the ok/warn/ok+check/neutral tone mapping (Requirement G).
4. Restyle the search input (placeholder + classes) per Requirement D; confirm `page.tsx`'s search clause is untouched.
5. Recolor "New Customer" → CTA orange pill (Requirement E).
6. Rebuild the status filter row as individual navy-active pills (Requirement F).
7. Restyle the table: header background/type, row dividers, row hover, `ProjectsCount` button, radius (Requirements B/G).
8. Update both empty-state branches with teaching copy and recolored icon circle (Requirement H).
9. Update `loading.tsx`'s skeleton colors/radius to match (Requirement J).
10. Run `npx tsc --noEmit` and `pnpm lint`.
11. Manual pass (`pnpm dev`, visit `/v2/customers` as a `pm`/`admin`/`marketing` role): confirm the table renders with v2.0 tokens, all four status chips show correct tone/dot/check, filter pills toggle navy correctly, pagination works, search by a partial company name AND by a partial/full `customer_id` (e.g. `WRQ-`) both return matching rows, empty states render correctly for "no customers at all" vs "no results for this search," and the loading skeleton (hard-refresh or throttle network) matches the loaded layout's column widths.

## Acceptance Criteria

- [ ] No `slate-*` Tailwind class or pre-v2.0 hex (`#16A34A`/`#2563EB`/`#D97706`/`#94A3B8`/`#0F172A` etc.) remains in `_customers-index.tsx` or `loading.tsx`.
- [ ] Status chips use `Chip` from `dashboard-shared.tsx` with `ok`/`warn`/`neutral` tones only — no phase hue (`onboard`/`migrate`/`publish`/`ai`/`optimize`) reused for customer status.
- [ ] Exactly one CTA-orange (`#FB914E`) button exists on the page ("New Customer").
- [ ] Status filter pills use navy (`#071133`) for the active state, never blue.
- [ ] Page title uses `font-heading`; customer ID / day-phase / progress % / pagination range use `font-mono`; no `font-heading` on any button, label, or table cell.
- [ ] Search input placeholder mentions customer ID; searching by a partial `customer_id` string returns the matching customer(s) (verifies Requirement D's existing backend behavior wasn't broken by the rewrite).
- [ ] `npx tsc --noEmit` and `pnpm lint` both pass with no new errors.
- [ ] Manual walkthrough confirms no visual regressions and matches DESIGN.md's Table/Buttons/Chips/Forms sections.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: pnpm dev
#   /v2/customers — as pm/admin/marketing role
#   Search by company name, by contact name, and by a partial customer_id (e.g. "WRQ-") — confirm all three match
#   Toggle each status filter pill — confirm navy active state, correct filtering
#   Confirm exactly one CTA-orange button on the page; status chips render ok/warn/neutral tones with correct dot/check
#   Trigger loading.tsx (hard refresh / throttled network) and confirm skeleton matches loaded layout
#   Confirm empty states: clear all customers filter to see "no customers yet" copy vs a nonsense search term for "no results" copy
```

## Compatibility Touchpoints

- No schema, RLS, or API contract changes.
- `page.tsx`'s exported `CustomerListItem`/`PaginationMeta` types and props passed to `CustomersIndex` are the only consumers of this component (verified — no other file imports from `_customers-index.tsx`), so this is a self-contained rewrite with no cross-file type-signature risk.

## Implementation Notes

### What Changed
- `_customers-index.tsx` and `loading.tsx` were rewritten in full per Requirements A–J.
- **A.** All `slate-*` Tailwind classes and old hex replaced with DESIGN.md literals (`ink`/`body`/`muted`/`line`/`line-soft`/`bg`). `STATUS_TONE` map added, mapping `active`→`ok`, `onboarding`→`warn`, `completed_onboarding`→`ok`, `inactive`→`neutral` — no phase hue reused for a non-phase meaning. `ProgressCell`'s track/fill recolored to `line-soft`/`blue`.
- **B.** Table container `rounded-xl`→`rounded-[14px]`; search input/pageSize select `rounded-lg`→`rounded-[10px]`; pagination nav buttons, "New Customer," filter pills, and the Projects-count button all now pill radius (`rounded-full`).
- **C.** Page title got `font-heading` + `ink`. Table header cells now the DESIGN.md table-header spec (`text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]`). `font-mono` added to `ProgrammeBadge`'s "Day X/120" text and the pagination range text; customer ID and progress % were already `font-mono`, just recolored.
- **D.** Search placeholder changed to `"Search company, contact, or customer ID…"`; input restyled to the `_onboarding-list.tsx` Forms-spec classes (`bg-[#F4F6FB]` at rest, white+blue-ring on focus). `page.tsx:66`'s `customer_id.ilike` clause confirmed untouched (grepped post-rewrite).
- **E.** "New Customer" recolored from `bg-slate-900` to the exact CTA class string (`bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white`, pill radius).
- **F.** Status filter row rebuilt as individual pills (`STATUS_FILTERS.map`) with navy-fill active state (`#071133`) and `aria-pressed`, replacing the old single-group `bg-slate-900` segmented control.
- **G.** `StatusBadge` rebuilt on top of `Chip` from `dashboard-shared.tsx` — `active`/`onboarding` render with a leading dot, `completed_onboarding` renders with a leading `Check` icon (mirroring `OnboardingStatusPill`'s completed-vs-in-progress pattern), `inactive` renders plain. Table header/divider/hover recolored per the Table spec (`#FAFBFE` header bg, `line-soft` dividers, `blue-50` row hover). First-column padding left at the row's shared `px-5` per the task doc's own "implementation-time call" allowance (18px vs 20px is cosmetically negligible against a uniform gutter). `ProjectsCount` button recolored to the ghost-button hover treatment.
- **H.** Empty state split into two branches via a new `isFiltered` check (`searchParams.get("search")` non-empty or `statusValue !== "all"`): unfiltered → "No customers yet — new customers you onboard will appear here." (blue-50/blue `Building2` icon); filtered/searched with zero results → "No customers match your search" + a "Clear filters" button (warn-tint `Search` icon), matching `_onboarding-list.tsx`'s two-empty-state pattern exactly.
- **I.** No `framer-motion` usage existed in this file before or after — confirmed nothing to remove; all hover states use plain `transition-colors`.
- **J.** `loading.tsx`'s `Bone` recolored to `bg-[#EDF0F7]`; container/header radius and background updated to match (`rounded-[14px]`, `#FAFBFE` header row); "New Customer"/pagination/status-filter bones switched to pill radius; grid column widths (`grid-cols-[1fr_1fr_90px_140px_100px]`) left identical to the real table so the skeleton doesn't jump on hydration.
- No changes to `page.tsx` (Supabase queries, pagination math, search/status filter logic), the realtime `customer_products` subscription, or `ProgrammeBadge`'s day/phase computation — confirmed by inspection, all business logic carried over verbatim.

### Files Changed
- `src/app/v2/(hub)/customers/_customers-index.tsx` — full rewrite per Requirements A–I
- `src/app/v2/(hub)/customers/loading.tsx` — full rewrite per Requirement J
- `src/app/v2/(hub)/customers/page.tsx` — unchanged (verified only, per Requirement D)

### Deviations From Plan
- None — implementation followed the task document's requirements and reused `_onboarding-list.tsx`'s literal classNames wherever specified.
- The `impeccable` design-quality hook flagged 6 `text-[12px]` findings (`_customers-index.tsx` lines 86, 177, 230, 237, 294, 352) as off the DESIGN.md type ramp. Reviewed and left unchanged: 5 of the 6 (177, 230, 237, 294, 352 — the CTA button, pageSize select, pagination range text, "Clear filters" button, and Projects-count button) are buttons/controls matching DESIGN.md Section 5's explicit Buttons spec ("default … 12px text") and the literal classNames already shipped in `_onboarding-list.tsx`; the 6th (line 86, `ProgressCell`'s empty-state dash) is a pre-existing 12px value carried over unchanged from the original file, not introduced by this task — same category task 183's Implementation Notes already logged and left alone. No suppression added; documenting here per the hook's "acknowledge what you changed or why you are leaving a finding unchanged" instruction.

### Verification Run
- `npx tsc --noEmit` — PASS, no errors.
- `pnpm lint` — PASS, exit 0, no output.
- Manual in-browser QA — **NOT RUN**, no test credentials/session available in this environment (same constraint noted in tasks 166/167/183). Flagged for the user's own live-testing pass per the Verification section: visit `/v2/customers`, confirm v2.0 tokens render correctly, all four status chips show the right tone/dot/check, filter pills toggle navy, search by company name/contact/partial `customer_id` all match, pagination works, both empty states render correctly, and the loading skeleton matches the loaded layout's column widths.

## Revision 1 (post-Testing user feedback — Phase-1-hidden customers invisible to Super Admin, including in search)

User live-tested and searched for a known customer ("Test 2") and its exact `customer_id` (`WRQ-CUST-BDD824C5`), both returning "No customers match your search" despite the customer existing and being visible on Portfolio Tracker (Day 1/120, Onboard phase). Root cause traced to `page.tsx`'s pre-existing `fullyHiddenCustomerIds` exclusion (not introduced by this task) — it hides any customer whose *every* project still has `onboarding_visible_at = null` (i.e., not yet handed over from Marketing's Phase-1 intake), and it was applied **unconditionally**, with no role check, so even an exact-ID search from a Super Admin account couldn't surface a Phase-1 customer. User confirmed: they're logged in as Super Admin and expect to see everything, including these hidden customers — matching Portfolio Tracker's own existing `editable` role set (`marketing`/`admin`/`super_admin`) that already manages Phase-1 onboarding there.

### What Changed
- `page.tsx` now fetches the current user's role (`supabase.auth.getClaims()` → `profiles.role`, same pattern already used in `layout.tsx`/`dashboard/page.tsx`/`portfolio-tracker/page.tsx`) and computes `canSeeHiddenCustomers = role === "marketing" || role === "admin" || role === "super_admin"`.
- The `fullyHiddenCustomerIds` computation (and its underlying `projects` table scan) is now skipped entirely for privileged roles — they get an empty exclusion list, so the `.not("customer_id", "in", ...)` filter never applies to them, in search or otherwise. PM/developer/other roles keep the exact previous "hidden until handover" behavior, including during search.
- Secondary fix: the per-customer `project_count`/`programme_started_at` computation (lines 106-117) also had its own `if (!p.onboarding_visible_at) continue;` skip, which would have made a now-visible Phase-1 customer show "0 projects" and no "Day X/120" badge for a privileged viewer — misleading, since the customer's project clearly exists and has a running clock. That skip is now also gated on `!canSeeHiddenCustomers`, so privileged roles see the true project count and programme-day badge for these customers too.

### Files Changed
- `src/app/v2/(hub)/customers/page.tsx` — role-based bypass of the Phase-1-hidden-customer exclusion and its associated project-count/programme-day skip

### Deviations From Plan
- This is new scope beyond the original task 184 requirements (role-based visibility logic, not a v2.0 styling change) — added per explicit user direction during live testing, following the existing `marketing`/`admin`/`super_admin` role-set precedent already established by Portfolio Tracker's `editable` gate rather than inventing a new boundary.
- No new UI indicator was added to distinguish a "hidden to everyone else" customer from a normal one in the privileged view — the customer's own `status` chip (typically `onboarding`) already communicates it's mid-programme; not treated as a gap worth a separate UI element for this fix.

### Verification Run
- `npx tsc --noEmit` — PASS, no errors.
- `pnpm lint` — PASS, exit 0, no output.
- Manual in-browser QA — **NOT RUN**, same environment constraint as the original implementation. Flagged for the user's live pass: as Super Admin, confirm "Test 2" and its `customer_id` now both appear via search and in the unfiltered list with a correct project count and Day X/120 badge; as a `pm`/`developer` role (if testable), confirm Phase-1 customers remain hidden from both the list and search, preserving the original "hidden until handover" behavior for non-privileged roles.
