# 125: Onboarding Project Detail — Horizontal Gantt Timeline Redesign (exact reference functionality + design, WebriQ style guide)

**Created:** 2026-07-09
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

Redesign the Onboarding module's project detail page (`/v2/onboarding/[projectId]`) — currently a vertical stack of expandable "Phase N" cards under a plain progress-bar header — into a **real horizontal Gantt/timeline grid**, replicating the exact structural pattern of the user's two reference screenshots:

1. **track.io reference**: a date-column header row, swimlane rows grouped by category (colored diamond + label), cards positioned/spanning across date columns sized to their duration, a vertical "today" line, avatar clusters on cards.
2. **Asana reference**: date-column header, swimlane rows grouped by Key Result (colored background band per group, collapsible via chevron), cards placed at their specific date on the axis, a vertical "today" line.

**Revision note:** an earlier draft of this spec (superseded) proposed a simpler single horizontal *segmented progress bar* modeled on `_design/customers/CustomerTimeline.tsx`, because that file is WebriQ's own bespoke mockup for this page and uses the same fidelity system as task 124. The user has now clarified: build the **exact functionality and layout of the reference screenshots** (real date-column Gantt grid with swimlanes and positioned cards), not the simpler segmented-bar approach. `CustomerTimeline.tsx` is still used — but only for its **color/typography system** (per-phase hex palette, reminder-card color scheme, font choices), not its layout. There is no in-repo mockup file for the Gantt-grid layout itself; it is built fresh against the two reference screenshots' structural pattern, using WebriQ's own hex/font/Tailwind-arbitrary-value/`motion` system per the Style Implementation Rule (identical rule to task 124).

**This is still primarily a presentation-layer redesign** — every data fetch, mutation, Realtime subscription, and the wizard-launch swap must be preserved in behavior. The one new piece of client-side logic is the day-to-pixel positioning/layout math for the Gantt grid itself (no backend changes).

## Key Design Decisions (read before implementing)

Decisions 1–3 and 5–7 carry over unchanged from the superseded draft (same rationale, still correct). Decision 4 (gate markers) is dropped — swimlanes now encode phase boundaries directly, a redundant marker isn't needed. New decisions 8–13 cover the Gantt-grid specifics.

1. **Exact-fidelity, no dark mode.** Drop `usePMSettings()`/`isDark` from this component entirely; render a fixed light palette matching WebriQ's mockup system, same as `/v2/onboarding/new`. Intentional regression for anyone using this one page in dark mode, consistent with task 124's precedent.
2. **Real `status` field wins over any day-diff inference.** Deliverable/internal-deliverable visual state (icon, color, "current" highlight) is driven by the real DB `status` (`pending | in_progress | done`), never inferred from day-vs-due-date math.
3. **Internal deliverables (Phase 1 only) must be preserved.** They have no `dayStart`/`dayEnd` of their own (only a `subPhaseKey` reference to their parent deliverable) — see Decision 11 for how they render in a grid that positions things by day.
5. **Shared font-loading file.** Move `src/app/v2/(hub)/onboarding/new/_fonts.ts` → `src/app/v2/(hub)/onboarding/_fonts.ts` (shared by `new/` and `[projectId]/`); update `new/_content.tsx`'s import.
6. **`page.tsx`'s wrapper must stop constraining the layout.** A Gantt grid needs to own its full width for horizontal scrolling to work — remove the `max-w-240 mx-auto px-8 py-6` wrapper, mirror task 124's bare-passthrough `new/page.tsx`.
7. **The "not started" empty state gets restyled; `_onboarding-wizard.tsx` does not.** No reference mockup for the empty state — use consistent hex/font choices. The wizard-launch swap (`wizardOpen` → `<OnboardingWizard>`) is preserved exactly; that component keeps its current `isDark`-pattern styling untouched, same scope boundary task 124 drew around the Projects-page modal.
8. **Daily columns, horizontally scrollable, real calendar dates.** The references show daily-granularity date columns (`S 17`, `M 18`...). Replicate that exactly rather than compressing to weekly columns — this is a 120-day programme, so the grid is wider than the references' ~2–3 week views and must scroll horizontally (standard Gantt-tool UX, not a compromise). Column headers show the real calendar date (derived from the project's actual `programme_started_at` timestamp — more accurate than `CustomerTimeline.tsx`'s fictional `getProgrammeStartDate()` stand-in, which back-calculates a fake start date from `today() - currentDay`; the real app already has the true start date, use it directly) formatted as weekday-letter + day-of-month, matching the references' header style. On mount, auto-scroll the grid so "today" is in view (a real usability need at 120-day scale that the references' shorter ranges don't have to solve, but the pattern — keep "today" visible — is the same one both references demonstrate by defaulting their view to a window containing today).
9. **Swimlanes grouped by Phase — the direct equivalent of the Asana reference's "Group by Key Result."** One swimlane per `PROGRAMME_PHASES` entry (5 total), each with a colored background band (using that phase's own `bg` hex from the palette below — not the references' arbitrary lavender/mint), a label (`Phase N: Name`, Day range, owner) pinned to the left edge via `position: sticky; left: 0` so it stays visible during horizontal scroll (same idiom used for the date-header row's `sticky top-0`), and a collapse chevron (matching the Asana reference's per-group collapse affordance — new interactive polish, cheap to add, purely a client-side expand/collapse of that swimlane's rows, no persistence needed).
10. **Cards positioned by real day range; overlap-stacking only where the real data needs it.** Card `left`/`width` are computed from `dayStart`/`dayEnd` × a fixed per-day column width. Checked against the actual `PROGRAMME_PHASES` data: within every phase, deliverables are sequential/non-overlapping **except** Phase 2's `tech-docs` and `migration-implementation`, which both span Day 16 — the only real case needing a second stacked sub-row within a swimlane. Implement stacking generically (rare, shallow — cap at what the real data needs, don't build a general-purpose packing algorithm for a problem that occurs once).
11. **Internal deliverables render as an expand affordance on their parent deliverable's card, not as their own axis-positioned row.** They have no day range, so they can't be positioned on the grid honestly. A parent deliverable card that has internal deliverables shows a small sub-checklist count badge (e.g. "2/4"); clicking it (or the card) expands an inline popover/panel listing them with the same toggle interaction as today. This preserves full existing functionality without inventing fake day positions — a materially different (and more honest) choice than trying to force them onto the date axis.
12. **No fabricated chrome for functionality that doesn't exist.** The track.io reference's floating "+" (add item) button, dotted dependency arrows between cards, drag-handles, and the "Timeline / Activities / Notes / White boards / Analysis" tab row are all decorative-or-editing affordances for a general PM tool with no equivalent in this system — deliverables are config-derived (`PROGRAMME_PHASES`), not user-created or freely reschedulable, and this page has no other views. Do not build these. The floating bottom-right button **is** kept, but repurposed to a real action: **"Jump to Today"**, scrolling the grid back to the current-day column — same visual language (floating circular accent-colored button, bottom-right) as the reference, wired to something real instead of a no-op "+". Similarly, the Asana reference's "Group by" dropdown is not rebuilt as a fake selector with only one working option (Phase) — the existing real "Jump to Phase" control is restyled into this header instead.
13. **Reminders move to a compact strip above the grid; Programme-stats fold into the header row.** The references have no side rail — a Gantt grid wants maximum width, unlike the old vertical-phase-card layout which comfortably shared a 2-column layout with a 280px rail. Restyle `buildReminders()`'s output as a horizontal row of compact notification chips (same 4-way warning/reminder/info/success color scheme from `CustomerTimeline.tsx`) directly below the header card, full width, wrapping if needed. Fold the "days remaining / phases completed / total deliverables / done" stats into small inline stat chips next to the header's Day-counter instead of a separate card.

## Requirements

- [ ] Header card (restyled, fixed palette): company/project name, phase badge (pulsing dot if active), owner, manually-tagged note, Jump-to-phase dropdown (existing handler, restyled), Wizard-launch button (Phase 1 active only), Day N/120 counter + progress bar, small inline stat chips (days remaining, phases completed, deliverables done/total).
- [ ] Reminders strip: horizontal row of compact `buildReminders()`-driven notification chips (4-way color scheme), directly below the header, full width.
- [ ] Gantt grid: sticky daily date-column header (real calendar dates, weekday-letter + day-of-month) spanning the full `programme_started_at`-to-Day-120 range, horizontally scrollable, auto-scrolled to bring "today" into view on mount.
- [ ] Vertical "today" line spanning the full grid height, using WebriQ's accent color (`#F97316`, matching `CustomerTimeline.tsx`'s needle), not the references' red/pink.
- [ ] 5 swimlane rows (one per `PROGRAMME_PHASES` entry), each with: a sticky left-pinned label (phase name, day range, owner), a phase-tinted background band, and a collapse/expand chevron.
- [ ] Deliverable cards positioned/sized by real `dayStart`/`dayEnd`, status-driven icon and color (real `status` field per Decision 2), owner initials-avatar chip(s) (derived locally — see Code Context — not imported from `_design/`), narrow-card graceful truncation with a `title` tooltip for full name, click-to-cycle-status preserved for Phase 1 only (matches existing `interactive = phase.number === 1` behavior).
- [ ] Overlap-stacking for the one real collision (Phase 2, Day 16 — `tech-docs` + `migration-implementation`), implemented generically enough to handle any future overlap without being a full packing-algorithm build.
- [ ] Internal-deliverable expand affordance on parent deliverable cards (Phase 1 only) per Decision 11 — count badge + inline expand panel with the existing toggle interaction, independently toggleable exactly as today.
- [ ] Floating "Jump to Today" button, bottom-right, scrolls the grid to center the current-day column.
- [ ] All existing interactions preserved and unchanged: Start Onboarding, Jump to Phase (with note), deliverable status toggle, internal-deliverable status toggle, Onboarding Wizard launch/return, Supabase Realtime subscription.
- [ ] `page.tsx` no longer constrains layout width/padding.
- [ ] Shared `_fonts.ts` moved to the `onboarding/` module root; `new/_content.tsx` updated; no duplicate font loading.

## Out of Scope / Must-Not-Change

- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — not touched, not restyled.
- `src/app/v2/(hub)/onboarding/new/_content.tsx` and `page.tsx` (task 124, Completed) — no functional changes beyond the font import path.
- `src/app/v2/(hub)/onboarding/_onboarding-list.tsx` — untouched.
- All API routes under `/api/projects/[id]/programme*` — contract, request/response shapes, server logic unchanged.
- `src/config/customer-phases.ts` — consumed as-is, not modified.
- Supabase Realtime channel name/subscription logic — unchanged.
- No new database columns, tables, or migrations.
- No drag-to-reschedule, no dependency-arrow editing, no "+" add-deliverable action, no extra tabs (Activities/Notes/White boards/Analysis) — decorative/editing chrome from the references with no backing system in this app (see Decision 12).
- No fabricated "Group by" dropdown with fake alternate grouping options.

## Style Implementation Rule

Identical to task 124's rule (`_docs/task/124-new-project-wizard-full-page-redesign.md`). Summary:
- Static styling → Tailwind arbitrary-value classes with exact hex/rgba values, never `style={{}}`.
- Per-phase color variants → a static lookup map keyed by phase number holding **complete Tailwind class strings**, mirroring task 124's `CLASSIFICATION_META` pattern — not raw hex + runtime interpolation.
- Hover/focus → Tailwind `hover:`/`focus:`/`peer-focus:` classes, not JS event handlers.
- Motion-driven values (today-line position on scroll, card expand/collapse, swimlane collapse height, stagger-in) → Motion's own `animate`/`initial`/`exit`/`transition` props, not `style={{}}`.
- Fonts → Space Grotesk (headings/phase labels), Inter (body), JetBrains Mono (dates/day numbers) via each font object's `.className` per element.
- **New for this task**: day-to-pixel positioning (`left`, `width` on Gantt cards) is inherently a numeric layout calculation, not a themeable style choice — this is the one legitimate case for computed inline `style={{ left, width }}` on the card wrapper itself (same class of exception CLAUDE.md already carves out for "canvas/SVG dimensions" — a Gantt card's horizontal position is dimensional data, not a color/spacing choice with a Tailwind equivalent). Keep all other styling on that same card (colors, borders, text, icons) as Tailwind classes; only the position/size math uses `style={{}}`.

## Per-Phase Palette (from `_design/customers/CustomerTimeline.tsx`, color system only — not its layout)

```ts
// phase.number -> { color, bg }
1: { color: "#2563EB", bg: "#EFF6FF" }   // Onboard
2: { color: "#7C3AED", bg: "#F5F3FF" }   // Migrate & Rebrand
3: { color: "#0D9488", bg: "#F0FDFA" }   // Publish
4: { color: "#D97706", bg: "#FFFBEB" }   // AI Visibility
5: { color: "#0F172A", bg: "#F1F5F9" }   // Optimize
```

Reminder-chip color scheme (reuse exactly, keyed by `buildReminders()`'s existing `type` field):
```ts
warning:  { bg: "#FFF7ED", border: "#FED7AA", titleColor: "#92400E" }  // AlertTriangle, #D97706
reminder: { bg: "#EFF6FF", border: "#BFDBFE", titleColor: "#1E40AF" }  // Bell, #2563EB
info:     { bg: "#F8FAFC", border: "#E2E8F0", titleColor: "#0F172A" }  // Info, #64748B
success:  { bg: "#F0FDF4", border: "#BBF7D0", titleColor: "#166534" }  // CheckCircle2, #16A34A
```

Today-line / floating action accent: `#F97316` (matches `CustomerTimeline.tsx`'s needle color).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/onboarding/_fonts.ts` | Create (moved from `new/_fonts.ts`) | Shared Space Grotesk/Inter/JetBrains Mono loader for the Onboarding module. |
| `src/app/v2/(hub)/onboarding/new/_fonts.ts` | Delete | Superseded by the shared module-root file. |
| `src/app/v2/(hub)/onboarding/new/_content.tsx` | Modify | Update the `_fonts` import path only. |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` | Modify (large, effectively a rewrite of the render layer) | Gantt-grid redesign per Requirements; all state/handlers/effects/API calls preserved. |
| `src/app/v2/(hub)/onboarding/[projectId]/page.tsx` | Modify (small) | Remove the constraining wrapper div. |

## Code Context

### File: `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` (real component — full data contract to preserve exactly)

```tsx
// Data fetch (keep exactly):
const res = await fetch(`/api/projects/${project.id}/programme`);
// -> { programme_started_at, phases: CustomerPhaseRow[], deliverables: CustomerDeliverableRow[], internal_deliverables: OnboardingInternalDeliverableRow[] }

// Realtime (keep exactly):
supabase.channel(`v2_onboarding_${project.id}`)
  .on("postgres_changes", { event: "*", schema: "public", table: "customer_phases", filter: `project_id=eq.${project.id}` }, ...)
  .on("postgres_changes", { event: "*", schema: "public", table: "customer_deliverables", filter: `project_id=eq.${project.id}` }, ...)
  .subscribe();

// Mutations (keep exactly):
POST   /api/projects/{id}/programme/start
PATCH  /api/projects/{id}/programme/phase                          { phase_number, note? }
PATCH  /api/projects/{id}/programme/deliverables/{key}              { phase_number, status }
PATCH  /api/projects/{id}/programme/internal-deliverables/{key}     { status }

// Reminders (keep exactly):
buildReminders(currentDay, phaseStatusMap, deliverableStatusMap): ReminderItem[]
// ReminderItem = { key, type: "warning"|"reminder"|"info"|"success", title, body }

// Wizard swap (keep exactly, do not restyle _onboarding-wizard.tsx itself):
if (wizardOpen) return (<>{backLink}<OnboardingWizard project={project} deliverables={...} internalDeliverables={...} wizardData={...} currentDay={...} isDark={false} onBack={...} onDeliverableChange={...} onInternalDeliverableChange={...} /></>);
// isDark is hardcoded false once this component drops usePMSettings() — OnboardingWizard's own
// untouched internals still take the prop and render exactly as they do today.
```

Real per-phase deliverable day ranges (from `PROGRAMME_PHASES` in `customer-phases.ts`, confirmed during planning — use for validating the positioning/stacking logic against real data, not just the API response shape):
```
Phase 1 (Day 1–15):  kickoff D1-2, outcome-target D3-4, migration-checklist D5-9, content-map D10-11,
                      html-mockup D12-13, storage-kb D14, client-signoff D15  — sequential, no overlap.
Phase 2 (Day 16–30): tech-docs D16, migration-implementation D16 (OVERLAP — the one real stacking case),
                      structure-cleanup D24, branding-review D26, foundational-pages D28, internal-qa D29,
                      client-review-approval D30 — otherwise sequential.
Phase 3 (Day 31–60): 5 single-day deliverables at D40/45/50/55/60 — sequential, no overlap.
Phase 4 (Day 61–90): 4 single-day deliverables at D62/70/80/90 — sequential, no overlap.
Phase 5 (Day 91–120): 4 single-day deliverables at D92/115/118/120 — sequential, no overlap.
```

Internal-deliverable → parent-deliverable mapping (Phase 1 only, via `internalDeliverablesForSubPhase(key)`):
```
migration-checklist → implementation-file
html-mockup         → html-md-files
content-map         → cluster-topics-schedules, publishing-plan
storage-kb          → branding-guides, kb-info-raw, dns-details, credentials-external
```

### File: `_design/customers/CustomerTimeline.tsx` (color/typography system only — do not port its `TimelineBar`/`PhaseCard` layout code, that approach was superseded)

Notification chip color scheme (lines 499-528) — port the color/icon mapping only, restyle as a compact horizontal chip instead of the mockup's stacked card:
```tsx
const cfg = {
  warning:  { bg: "#FFF7ED", border: "#FED7AA", icon: <AlertTriangle color="#D97706"/>, titleColor: "#92400E" },
  reminder: { bg: "#EFF6FF", border: "#BFDBFE", icon: <Bell color="#2563EB"/>, titleColor: "#1E40AF" },
  info:     { bg: "#F8FAFC", border: "#E2E8F0", icon: <Info color="#64748B"/>, titleColor: "#0F172A" },
  success:  { bg: "#F0FDF4", border: "#BBF7D0", icon: <CheckCircle2 color="#16A34A"/>, titleColor: "#166534" },
}[n.type];
```

### Reference screenshots (external — not files in this repo; structural pattern to replicate)

- **track.io**: date-column header (`S 17`, `M 18`, ...), swimlane groups with a colored-diamond + uppercase label (`◆ DESIGN`), cards spanning their date range with a status icon + name + date-range + avatar cluster, vertical red "today" line, floating bottom-right "+" button (repurposed per Decision 12).
- **Asana**: breadcrumb + title + "Group by" control (restyled into the existing Jump-to-phase control per Decision 12), date-column header, swimlane groups with a full-width colored band + collapse chevron (`KR1: ... ⌄`), cards placed at their date with an emoji/icon + name + date label, vertical "today" line.

## Implementation Steps

1. Move `src/app/v2/(hub)/onboarding/new/_fonts.ts` → `src/app/v2/(hub)/onboarding/_fonts.ts`; update `new/_content.tsx`'s import.
2. Trim `page.tsx`'s wrapper div to a bare passthrough.
3. Build the per-phase Tailwind class-string lookup map (5 entries) from the palette above, mirroring task 124's `CLASSIFICATION_META` shape.
4. Build a small local `ownerInitials(owner: string): string[]` + deterministic `avatarColor(seed: string): string` helper pair inside `_onboarding-detail.tsx` (inspired by, not imported from, `_design/customers/CustomerData.tsx` — that file is reference-only, never imported into `src/`). Split owner strings like `"PM + Dev"` on `+`/`,`, derive 2-letter initials per segment, cap the rendered chip cluster at 3 with a `+N` overflow (safety margin — current real data never exceeds 2).
5. Restyle the header card + fold in inline stat chips (Decision 13); restyle the Reminders strip as compact horizontal chips.
6. Build the Gantt grid: sticky daily date-header (real calendar dates from `programme_started_at`), horizontally scrollable container, today-line, 5 sticky-labeled swimlanes with phase-tinted bands and collapse chevrons.
7. Build the deliverable-card positioning: `left`/`width` computed from `dayStart`/`dayEnd` × column width (the one legitimate `style={{}}` exception per the Style Implementation Rule); status-driven icon/color; owner-avatar chips; click-to-cycle-status for Phase 1 only.
8. Implement overlap-stacking generically, verify it correctly stacks the one real Phase-2/Day-16 collision.
9. Implement the internal-deliverable expand affordance on parent cards (Phase 1 only) per Decision 11, preserving the existing toggle handler.
10. Implement auto-scroll-to-today on mount and the floating "Jump to Today" button.
11. Restyle the "not started" empty state and `backLink`.
12. Remove `usePMSettings()`/`isDark`; hardcode `isDark={false}` on `<OnboardingWizard>`.
13. `npx tsc --noEmit` and `pnpm lint`.
14. Browser-verify per Acceptance Criteria — the same real project from task 124's verification (`WRQ-CUST-2EBA` / "Acme Testing Co Website") is available; starting its programme live during this task's verification is an acceptable, expected side effect (unlike task 124, where extra writes were deliberately avoided).

## Acceptance Criteria

- [x] `/v2/onboarding/[projectId]` renders full-bleed against a `#F8FAFC` background, no `max-w-240` constraint.
- [x] Gantt grid shows a daily date header with real calendar dates, is horizontally scrollable, and auto-scrolls so "today" is in view on load.
- [x] 5 swimlanes render with phase-tinted bands, sticky left-pinned labels that stay visible while scrolling horizontally, and working collapse/expand chevrons.
- [x] Deliverable cards are positioned/sized correctly for their real day range; the Phase 2 Day-16 overlap (`tech-docs` + `migration-implementation`) renders as two stacked rows without visual collision.
- [x] Vertical "today" line renders at the correct day column in `#F97316`.
- [x] Clicking a Phase 1 deliverable card cycles its status (pending→in_progress→done) live; Phase 2–5 cards are correctly non-interactive (verified by design/code — real data has no live Phase 2-5 status rows to interact with, but `interactive = phase.number === 1` gate is unchanged from the original implementation).
- [x] Internal-deliverable expand affordance shows the correct count badge, expands to the toggleable checklist, and toggling updates independently of the parent deliverable.
- [x] "Jump to Today" button scrolls the grid to center the current-day column.
- [x] Start Onboarding, Jump to Phase (with note), and Realtime updates all still work exactly as before — Jump to Phase dropdown visually verified open/rendering correctly (not submitted, to avoid mutating the real test project's phase further); Start Onboarding not re-exercised this task (project was already started from task 124's verification) but the handler is byte-for-byte unchanged; Realtime subscription code is unchanged from the working original.
- [x] Launching "Onboarding Wizard" swaps to the untouched `_onboarding-wizard.tsx` UI and returning restores the redesigned detail view.
- [x] Reminders strip renders the correct 4-way color-coded chips from real `buildReminders()` output.
- [x] `_fonts.ts` exists only at `onboarding/_fonts.ts`; `/v2/onboarding/new` still renders correctly after the import path update.
- [x] `npx tsc --noEmit` and `pnpm lint` both pass clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
grep -rln "onboarding/new/_fonts" src/   # must return nothing after the move
pnpm dev   # browser-verify /v2/onboarding/[projectId] end-to-end: scroll behavior, swimlane collapse,
           # card positioning/overlap-stacking, status toggling, internal-deliverable expand, Jump to
           # Today, Start Onboarding, Jump to Phase, wizard launch/return
```

## Compatibility Touchpoints

- No API/DB/packaging surface affected — pure presentation-layer change on top of the existing `/api/projects/[id]/programme*` contract.
- Task 124's `/v2/onboarding/new` route gets a one-line import-path update as a direct consequence of the shared-fonts move; no behavioral change there.

## Implementation Notes

### What Changed
- Replaced the vertical expandable-phase-card layout with a real horizontal Gantt grid: daily date-column header (real calendar dates from `programme_started_at`), 5 phase swimlanes with phase-tinted bands and collapse/expand, deliverable cards positioned/sized by real `dayStart`/`dayEnd`, an orange "today" line, owner-initial avatar chips, and a floating "Jump to Today" button — all per the task doc's Requirements and Key Design Decisions.
- Internal deliverables (Phase 1 only) render as a count-badge + expandable popover on their parent card, since they have no day range of their own to position on the axis.
- Header card, Reminders strip, and stat chips restyled to the fixed WebriQ palette; `usePMSettings()`/`isDark` removed entirely; `page.tsx`'s constraining wrapper removed for full-bleed width.
- Shared `_fonts.ts` moved from `onboarding/new/` to the `onboarding/` module root; `new/_content.tsx`'s import updated; task 124's route re-verified working.

### Files Changed
- `src/app/v2/(hub)/onboarding/_fonts.ts` — new (moved from `new/_fonts.ts`).
- `src/app/v2/(hub)/onboarding/new/_fonts.ts` — deleted.
- `src/app/v2/(hub)/onboarding/new/_content.tsx` — import path updated only.
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` — full redesign; all data fetching, mutations, Realtime subscription, and the wizard-launch swap preserved unchanged.
- `src/app/v2/(hub)/onboarding/[projectId]/page.tsx` — constraining wrapper div removed.

### Deviations From Plan
- **Internal-deliverable popover uses a React portal (`createPortal` to `document.body`) with `position: fixed` coordinates computed from the trigger badge's `getBoundingClientRect()`, plus a `document`-level `mousedown` outside-click listener** — not in the original plan, which assumed a plain `position: absolute` popover with a `fixed inset-0` backdrop for dismissal (mirroring task 124's dropdown pattern). That approach broke in live testing for two independent reasons, both confirmed via direct DOM/JS inspection rather than assumption: (1) the swimlane's `overflow-hidden` (needed to clip cards during collapse) also clipped the popover, since it rendered as a normal descendant positioned below the card; (2) once overflow was fixed, the `fixed inset-0` backdrop itself failed to dismiss on outside click, because it was nested inside a `motion.div` ancestor that Framer Motion gives an implicit `transform`, which — per CSS spec — re-anchors descendant `position: fixed` elements to that ancestor's box instead of the viewport, shrinking the "backdrop" down to the card's own tiny footprint. A portal sidesteps both problems at once (the standard pattern for exactly this class of bug in dropdown/popover libraries) and was verified working for open, toggle-closed, and outside-click-closed.
- **Swimlane collapse/expand uses a plain conditional render with a static `style={{height}}`, not `motion.div`'s animated `height` prop as planned.** Live-testing surfaced a reproducible bug: after a single click, React state (`collapsedPhases`) updated correctly (confirmed via temporary console logging — fired once per click, converged to the correct value even under React 18 Strict Mode's intentional double-invoke of the state updater), but the DOM's actual rendered height did not consistently follow — this is a known category of friction between Framer Motion's imperative height-animation and React Strict Mode's double-render-then-discard development behavior (dev-only; would not necessarily reproduce in a production build, but reproduced consistently in `next dev`, which is what matters for a working, testable feature). Rather than chase a Motion/StrictMode-specific workaround for a minor animation nicety, switched to a plain `<div style={{height: collapsed ? 0 : laneHeight}}>` with cards conditionally rendered when expanded — loses the smooth collapse transition, gains full reliability. Re-verified via direct JS `getComputedStyle` inspection after the fix: collapse and re-expand both now work correctly and deterministically.
- **Owner avatar-chip colors use a fully static, enumerable `PERSON_COLOR` lookup map** (keyed by each of the ~8 real first-name tokens across all `PROGRAMME_PHASES` owners — Bert, PM, Dev, Jun, Erica, April, Eri, Strategy — with a default fallback), rather than a computed/hashed color as the task doc's Code Context sketch implied. Since the full set of owner names is small, static config data (not open-ended user input), this keeps 100% of styling as static Tailwind class strings per the Style Implementation Rule, with no additional `style={{}}` exception needed beyond the one already pre-approved for card day-position math.
- **Gate-diamond markers (Decision "one per phase boundary") were dropped, not built** — noted in the task doc's revision history as superseded when the design pivoted from a single segmented bar to real swimlanes: with 5 separate phase rows, the swimlane boundaries themselves already visually encode phase transitions: a redundant diamond marker inside the grid would have added visual noise without new information. Not present in either reference screenshot either (both show only a today-line, no boundary markers).

### Verification Run
- `npx tsc --noEmit` — PASS (0 errors under `src/`; remaining errors are pre-existing `_design/` reference-file noise, unrelated).
- `pnpm lint` — PASS (0 errors, 0 warnings — including a `no-unused-expressions` warning caught and fixed during implementation, converting a ternary-for-side-effect into an if/else).
- `grep -rln "onboarding/new/_fonts" src/` — PASS (no matches).
- Browser verification (Chrome, `localhost:3000`, real Super Admin session, real project `WRQ-CUST-2EBA` / "Acme Testing Co Website" from task 124's own verification, now in-progress/Day 1): full interactive pass completed, including two real bugs found and fixed live (see Deviations) via direct JS/DOM inspection, not just screenshots — screenshots alone were proven unreliable for diagnosing this class of bug (small collapse-height deltas and transient stagger-animation frames both look like "nothing changed" or "content missing" in a single screenshot; `getComputedStyle`/`console.log` ground-truth checks were used to confirm each fix). Confirmed working: full page renders full-bleed with correct fonts/palette; Gantt grid auto-scrolls to today on load; horizontal scroll with sticky-pinned swimlane labels; deliverable status cycling (pending→in_progress→done) with live updates to the header stat chip, swimlane done-count, and Reminders strip; internal-deliverable badge count (0/1, 0/2, 0/1, 0/4 — matches the real `internalDeliverablesForSubPhase` mapping exactly) and popover open/toggle/outside-click-close; Phase 2 Day-16 overlap correctly stacks into 2 tracks and correctly disappears when the lane is collapsed; swimlane collapse/expand; Onboarding Wizard launch (untouched UI) and return (redesigned view restored); Jump to Today button; Jump to Phase dropdown renders correctly (not submitted, to avoid further mutating the shared test project beyond what was already needed). No console errors observed outside the temporary debug logs added and removed during diagnosis.
