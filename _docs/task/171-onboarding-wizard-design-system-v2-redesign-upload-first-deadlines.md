# 171: Onboarding Wizard — Design System v2.0 Full Step Redesign, Upload-First RTE Toggle, Deadline Badges

**Created:** 2026-07-22
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

`_onboarding-wizard.tsx` (`src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx`, ~4,957 lines) is the 7-step Phase-1 intake Wizard for the 120-day onboarding programme. It's the one major piece of the onboarding-programme surface still un-migrated: `/v2/dashboard` (task 166), the Portfolio Tracker list (task 167), and the Timeline's own chrome plus the Wizard's *outer shell only* (task 168 — the 7-circle step indicator) already moved to Design System v2.0 (`_final_design/guide/central-hub-design-system.md` + `central-hub-style-guide.html`). Task 168 explicitly deferred every step's own content restyle, noting this codebase's own history of treating each step as its own task (128, 130–135). This task is that deferred work, done in one consolidated pass across all 7 steps for visual consistency, per the user's explicit request.

This task also adds two new pieces of UX behavior, not just a re-skin:

1. **Upload-first, RTE-optional** on the three steps the user named — Outcome Target, Migration Checklist, and 90-day Content Map — where the field is currently laid out as `RichTextField | "Or" divider | FileUploadBox` (RTE primary, upload secondary, both always visible). Flip the emphasis: the file upload becomes the primary, full-width action; the rich text editor is hidden by default behind a labeled toggle switch, for users who prefer to type notes instead of uploading a document.
2. **Deadline visibility on every step and every deliverable** — the step header currently shows a subdued `Day {dayStart}–{dayEnd}` line; every step needs a proper, status-tinted deadline readout, and every checklist (internal-deliverable) row needs the guide's own documented `DAY 12` / `PENDING` mono tag (`central-hub-design-system.md` §4, "Checklist row" — this spec already anticipates exactly this use case).

**Scope decision — fixed-light v2.0, dropping `isDark` throughout the Wizard (flagged for review, not a blocking question — following this feature area's own established precedent):** `pm-dashboard.tsx` (166), `_onboarding-list.tsx` (167), and `_onboarding-detail.tsx`'s own chrome (168) all went fixed-light v2.0, dropping `isDark`/`usePMSettings()` — task 168 kept the Wizard `isDark`-aware *only* because it was explicitly out of scope that task, and said so directly: "going fixed-light here alone would visually split the Wizard between a light shell and a dark-toggleable body." This task *is* the step-content redesign 168 deferred, so the reason to keep `isDark` no longer applies — the new style guide has no dark-mode spec at all (confirmed: no `prefers-color-scheme`/`data-theme` rule in `central-hub-style-guide.html`, only an unrelated `.dark-strip` component that's a navy-colored info strip, not a theme). This task drops `isDark` from every step's content and every Wizard sub-component (`PhaseAccessPanel`, `StorageFileExplorer`, `AddCredentialLinkModal`, `FileViewerModal`, `HtmlMockupFileList`, `HtmlEditorModal`, `WizardDeliverableRow`, `RichTextField`, `FileUploadBox`), matching every other piece of this surface. Consequence: `_onboarding-detail.tsx`'s `isDark` prop pass to `<OnboardingWizard isDark={isDark} .../>` (line 1377) becomes dead — remove the prop from `OnboardingWizard`'s interface and the call site; `usePMSettings()`/`isDark` at `_onboarding-detail.tsx:981-982` was already confirmed (grep, this session) to have no other consumer in that file, so remove that hook call too rather than leave dead code. If the Wizard's dark mode is actually in active use and must be preserved, say so before implementation starts.

**Scope decision — `SaveIndicator` left untouched:** `src/components/onboarding/save-indicator.tsx` (amber/green/red/slate dot + text) is shared with `form-engine.tsx`, the customer-facing public onboarding form — a different surface, different register (this design guide is explicitly "Product UI," not customer-facing), not covered by this task. Restyling it to v2.0 tokens would bleed into that unrelated public page. Left exactly as-is.

**Scope decision — button re-mapping to the guide's taxonomy:** the footer's "Continue" button (`bg-brand`, step-to-step navigation) maps to the guide's **Confirm/navigate** blue spec; "Complete Phase 1 & notify PM" (currently a green gradient, `bg-gradient-to-br from-green-600 to-green-700`) is this screen's one terminal, high-stakes action and maps to the guide's **CTA** orange spec — the guide explicitly bans decorative gradients ("No gradient text, glassmorphism... no shadow-only elevation") and reserves orange for "act now" call-to-action, one per screen. "Back"/"Cancel" and "Mark All as Done" map to **Ghost**.

## Requirements

### A. Global — Design System v2.0 token compliance, fixed-light, across the whole Wizard

- [ ] Every literal v1 hex/named-color usage (`bg-brand`, `text-brand`, `border-brand`, `bg-green-500`, `amber-500`/`amber-50`/`amber-800`, `slate-*`, `red-500` where it should be `--late`, etc.) inside `_onboarding-wizard.tsx` is replaced with its v2.0 literal-hex equivalent (`--navy #071133`, `--blue #007BFF`/`--blue-700 #0063D6`, `--orange #FB914E`/`--orange-600 #E2762F`, `--ok #177E48`/`--ok-bg #E3F5EA`, `--warn #8A5A00`/`--warn-bg #FFF3D6`, `--late #C0392B`/`--late-bg #FDE8E6`, `--bg #F4F6FB`, `--surface #FFFFFF`, `--line #E2E7F2`, `--line-soft #EDF0F7`, `--ink #0B1533`, `--body #3A4565`, `--muted #5F6A88`) — matching the literal-hex convention already established in `pm-dashboard.tsx`/`_onboarding-list.tsx`/`_onboarding-detail.tsx` (no new CSS-variable layer, no named Tailwind custom-color classes).
- [ ] Every `isDark ? ... : ...` ternary in this file collapses to its v2.0-mapped light branch only (branch deleted, not adapted) — see the fixed-light scope decision above. Applies to every sub-component in the file, not just the top-level step content.
- [ ] Radius/elevation/spacing per the guide: buttons/pills → `rounded-full` (999px); panels/tiles → `rounded-[14px]` (`--r-lg`); inputs/inner controls → `rounded-[10px]` (`--r-md`); chips → `rounded-[7px]` (`--r-sm`). Every raised surface (panel, modal) pairs a 1px `--line` border **with** `shadow-[0_1px_2px_rgba(7,17,51,.05)]` (`--sh-sm`) — never shadow-only.
- [ ] Typography: page/panel titles and the step name in the step header use `font-heading` (Space Grotesk, already wired via `--font-display` in `layout.tsx` — confirmed set up by task 165, no new font loading needed). `font-heading` stays banned from buttons, labels, and table/list cells (guide rule). Deadline/day/count values use `font-mono` (JetBrains Mono, already wired via `--font-mono`).
- [ ] Motion: transitions on background/color/border-color use `duration-[160ms]` with the guide's ease curve (`cubic-bezier(.22,1,.36,1)`, add as an arbitrary value or a small local `transition-brand` utility if one doesn't already exist — check `globals.css` first); button press uses a 120ms 1px `translateY`. Respect `prefers-reduced-motion` (existing `motion-reduce:` usages elsewhere in this file, e.g. the `Loader2` spin, are the pattern to match).
- [ ] Focus rings: every interactive element (buttons, inputs, checklist rows, the new RTE toggle) gets a visible 2px `--blue` outline / 3px `rgba(0,123,255,.14)` ring on focus, matching task 168 Round 3's audit fix on the sibling pages (`focus:ring-[3px] focus:ring-[#007BFF]/[0.14]`).
- [ ] `StorageFileExplorer`, `AddCredentialLinkModal`, `FileViewerModal`, `HtmlMockupFileList`, `HtmlEditorModal` get the same token pass — visual/token only, **no structural changes** to their file/folder tree, credential-field UI, or HTML-mockup preview/edit logic (see Out of Scope).

### B. Deadline badge — every step header

- [ ] Replace the current subdued `{step.name} · Day {dayStart}–{dayEnd}` line (line ~1979) with a status-tinted mono badge, using `currentDay` (already a prop) against `step.dayStart`/`step.dayEnd` (already on every `DeliverableConfig` in `customer-phases.ts`):
  - Step done (`stepStatus === "done"`) → `--ok` tint, e.g. `DONE · DAY {dayEnd}`.
  - `currentDay > dayEnd` and not done → `--late` tint, e.g. `OVERDUE · DAY {dayEnd}`.
  - `currentDay` within `[dayStart, dayEnd]` and not done → `--warn` tint, e.g. `DUE DAY {dayEnd}`.
  - `currentDay < dayStart` (future step) → neutral `--line-soft`/`--muted` tint, e.g. `DAY {dayStart}–{dayEnd}`.
  - Mirror `Chip`'s tone-color mapping from `dashboard-shared.tsx` for visual consistency with phase chips elsewhere in the app — not imported (page-scoped convention, this file already keeps its own local equivalents), just matched.
- [ ] Step-indicator tooltips (`IconTip label={s.name}`, line ~1952) extend to include the day range, e.g. `Kickoff · Day 1–2`, so the deadline is visible on hover before a user even opens that step.
- [ ] The Wizard header's `{project.company_name} · Day {currentDay} of 15` line (line 1907) stays as the overall-phase progress readout — restyle to v2.0 tokens, no structural change.

### C. Deadline tag — every checklist (internal-deliverable) row

- [ ] Rebuild the checklist item row (lines ~2425–2461) to the guide's literal "Checklist row" spec: 17px checkbox, 5px radius (`--r-sm`), done state = `--ok` fill + white check + label struck through in `--muted` (already close — just needs the exact size/radius/color swap), **plus** a right-aligned mono tag per the guide's own documented example (`DAY 12` / `PENDING`).
  - Internal deliverables (`InternalDeliverableConfig`) carry no day field of their own — use the parent step's `dayEnd` as the item's deadline (documented scope decision; adding a per-item day field would be a schema/config change out of proportion to a visual task).
  - Tag logic: not started (`currentDay < step.dayStart`) → `PENDING`; due or overdue and not done → `DAY {step.dayEnd}` (in `--warn`/`--late` tone matching Requirement B's step-level logic); done → omit the tag (the checkmark + strikethrough already communicates completion, avoids clutter).
- [ ] "Mark All as Done" (line ~2414) restyles to Ghost per Requirement A; no logic change.

### D. Upload-first, RTE-optional — Outcome Target, Migration Checklist, 90-day Content Map only

Applies to exactly these three steps (lines ~2216–2338: `outcome-target`, `migration-checklist`, `content-map`). **Kickoff's** "Business facts"/"Additional Notes" fields and **Client Sign-off's** "Sign-off call notes" field are unchanged by this requirement — the user's request named these three specifically; Kickoff and Sign-off keep their current RTE-first layout (still get the Requirement A token pass).

- [ ] Reorder each of the three steps: `FileUploadBox` becomes the primary, full-width element at the top of the field (large dropzone, matching the guide's emphasis-through-size principle), replacing the current `RTE | "Or" | Upload` three-column grid.
- [ ] Below the upload box, a labeled toggle switch reveals the `RichTextField`: "Prefer to type notes instead of uploading a document? Add typed notes" (exact copy is an implementation-time call; must name the outcome per the guide's voice rule, sentence case, no exclamation points).
  - Promote the existing local `Switch` component (currently defined inline inside `AddCredentialLinkModal`, lines 3977–3991 — `role="switch"`, `aria-checked`, `aria-label`, pill track, v1 `bg-brand` fill) to module scope in this file (page-scoped convention: shared within this one file, not extracted to `src/components/`) and reuse it here, updated to v2.0 `--blue` fill per Requirement A.
  - **Default toggle state per field**: `stripHtml(value).length > 0` — i.e. open (RTE visible) if the field already has saved text content from before this change shipped, so existing projects don't silently hide notes a PM already typed; otherwise closed (upload-first, RTE hidden) for new/empty fields.
  - Toggle control is **hidden entirely** when `disabled` (`isStepReadOnly`) is true **and** the field has no existing text — nothing to reveal, and typing isn't available anyway (mirrors `FileUploadBox`'s own existing `{!disabled && (...)}` gating for its dropzone). When `disabled` and the field *does* have existing text, the RTE still renders (read-only, already handled by `RichTextField`'s `disabled` prop) but the toggle control can be omitted since there's nothing to toggle.
- [ ] **No change to the "either satisfies the requirement" validation logic** — `isOutcomeFilled`/`isMigrationChecklistFilled`/`isContentMapFilled` (`stripHtml(text).length > 0 || files.length > 0`) stay exactly as they are; this is a visibility/emphasis change, not a validation-rule change. The inline `*FieldError` messages under each field stay as-is.
- [ ] Autosave, upload/remove/view file handlers, and the debounced-save effects for these three fields are unchanged — only the surrounding layout and the RTE's default visibility change.

### E. Footer navigation buttons

- [ ] "Continue" (line ~2496): `bg-brand` → v2.0 Confirm/navigate blue, `bg-[#007BFF]` hover `bg-[#0063D6]`, white text, pill radius (already close on shape, needs literal hex + `rounded-full`).
- [ ] "Complete Phase 1 & notify PM" (line ~2511): drop the green gradient (`bg-gradient-to-br from-green-600 to-green-700`) for the v2.0 CTA orange spec — `bg-[#FB914E] text-[#471F02]` → hover `bg-[#E2762F] text-white`, pill radius. This becomes the page's one orange CTA; confirm no other orange CTA-styled element is simultaneously visible on the same screen (guide rule: "one orange CTA per screen, maximum").
- [ ] "Back"/"Cancel" (line ~2489) and "Mark All as Done": Ghost — white bg, `--line` border, hover border `#A8C6F5`.
- [ ] Warning/info banners (the "not yet done" and "will notify the PM" boxes, lines 2472–2480 — currently `amber-500`/`amber-50`/`amber-800`) → `--warn`/`--warn-bg` tokens.

### F. UX/consistency pass

- [ ] Every step's field layout uses the same panel/label/spacing rhythm (4px base grid, 18px panel padding) so switching between steps doesn't feel like a different tool each time — audit Kickoff's 2-column grid, the 3-part upload-first layout (Requirement D), Storage/KB's single-column explorer, and HTML Mockup's single-field layout against one shared spacing scale.
- [ ] Every interactive element gets a visible hover state (guide: `transition-colors hover:...`), matching CLAUDE.md's UI Polish Conventions.
- [ ] Icon-only buttons (already using `IconTip` throughout) keep their `aria-label`s; verify none were dropped during the restyle.
- [ ] Invoke the `frontend-design` and `impeccable` skills against the rewritten sections for a visual-polish pass (hover states, spacing, motion, hierarchy), per the user's explicit request and the standing precedent from tasks 166–168 — constrained by CLAUDE.md's UI Polish Conventions (no `dark:` variants; hand-rolled pills, not shadcn `Badge`).

## Out of Scope / Must-Not-Change

- **Must-not-break** (visual/token pass + the two named behavioral additions only, everything else byte-for-byte unchanged):
  - All autosave effects (Kickoff/Outcome/Migration/Content Map/Sign-off debounced PATCH calls) — timing, payload shape, `SaveIndicator` status wiring.
  - Every upload/remove/view file handler (`handle*Upload`, `handleRemove*File`, `handleView*File`) — request shape, progress-bar wiring, error handling.
  - The `isOutcomeFilled`/`isMigrationChecklistFilled`/`isContentMapFilled`/`isBusinessFactsFilled`/`isSignoffFilled`/`isHtmlMockupFilled` "either satisfies" validation logic and every `*FieldError` gate.
  - Checklist toggle logic (`handleValidatedInternalToggle`, `setInternalStatus`, `cycle`/`toggleInternalStatus`), the auto-progress effect for `outcome-target-filed`, `handleMarkAllChecklistDone`.
  - `StorageFileExplorer`'s file/folder tree, move/rename/delete/permissions logic; `AddCredentialLinkModal`'s credential-field add/remove/masking logic; `HtmlEditorModal`'s HTML edit/preview logic — token restyle only, no structural/behavioral changes (Requirement A).
  - PM read-only gating (`isStepReadOnly`, `canEditChecklist`), Phase-1 completion gating (`handleComplete`, `isPM`/`isPhaseActive` branches), and `PhaseAccessPanel`'s membership add/remove/transfer logic.
  - The step-key routing/URL-sync effect (`stepKeyToWizardParams`, `router.push` on step change) and `handleStepIndicatorClick`'s forward-navigation gate.
- `SaveIndicator` (`src/components/onboarding/save-indicator.tsx`) — shared with the public onboarding form, left untouched (see scope decision above).
- No changes to `customer-phases.ts`'s data (`dayStart`/`dayEnd`/deliverable definitions) — deadline badges read existing values, no new fields added.
- No schema, RLS, or API contract changes — `wizard-data` PATCH payload shapes, `customer_deliverables`/`onboarding_internal_deliverables` row shapes, and every `/api/customers/[customerId]/assets*` call are unchanged.
- No changes to `_load-detail-data.ts` or `page.tsx` (data-fetching/routing).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` | Modify | Full v2.0 token restyle of all 7 steps + every sub-component; upload-first/RTE-toggle on 3 steps; deadline badges (step header + checklist rows); button re-mapping; drop `isDark` throughout |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` | Modify | Remove the now-dead `isDark` prop pass to `<OnboardingWizard>`; remove `usePMSettings()`/`isDark` computation at lines 981–982 if confirmed (implementation time) to have no other consumer in this file |

## Code Context

### File: `_final_design/guide/central-hub-design-system.md` (read-only reference — the token source of truth for this task)

Key sections already extracted during planning: §1 Color (brand/neutral/semantic hex), §2 Typography (Space Grotesk/Inter/JetBrains Mono roles + scale), §3 Spacing/radius/elevation, §4 Components → "Checklist row" (`17px checkbox, 5px radius... right-aligned mono tag (DAY 12 / PENDING)`) and "Buttons" (CTA orange one-per-screen / Confirm-navigate blue / Ghost), §5 Motion, §6 Voice, §7 Do's & Don'ts. Read the full file again at implementation time — this list is not exhaustive.

### File: `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` (current — key line ranges, re-confirm exact numbers at implementation time since the file will shift as edits land)

```tsx
// Step header (~1976-1997) — Requirement B target
<div className={cn("text-base font-bold mb-1", textPrimary)}>{step.name} <span className={cn("text-[12px] font-normal", textMuted)}>· Day {step.dayStart === step.dayEnd ? step.dayStart : `${step.dayStart}–${step.dayEnd}`}</span></div>

// Outcome Target field (~2216-2256) — Requirement D target (migration-checklist ~2258-2298,
// content-map ~2300-2338 are structurally identical, same transform applies to all three)
<div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_280px] gap-x-6 gap-y-4 mb-5">
  <div><RichTextField label="Agreed measurable outcomes" value={outcomeText} onChange={setOutcomeText} ... /></div>
  <div className="hidden lg:flex flex-col items-center gap-2 px-1 pt-1">{/* "Or" divider */}</div>
  <div><label>Upload a document instead</label><FileUploadBox files={outcomeFiles} onFile={handleOutcomeFileUpload} ... /></div>
</div>

// Local Switch pattern to promote to module scope (currently inside AddCredentialLinkModal, ~3977-3991)
const Switch = ({ checked, onChange, label: ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button type="button" role="switch" aria-checked={checked} aria-label={ariaLabel} onClick={() => onChange(!checked)}
    className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer border-none", checked ? "bg-brand" : "bg-slate-300")}>
    <span className={cn("inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform", checked ? "translate-x-[18px]" : "translate-x-[3px]")} />
  </button>
);

// Checklist row (~2425-2461) — Requirement C target
<span className={cn("shrink-0 h-5 w-5 rounded border flex items-center justify-center transition-colors", isDone ? "bg-green-500 border-green-500" : "border-slate-300 bg-white")}>
  {isDone && <Check size={11} strokeWidth={3} className="text-white" />}
</span>
{/* no right-aligned tag today — Requirement C adds one */}

// Footer nav buttons (~2488-2515) — Requirement E target
<button onClick={handleContinueClick} className="... bg-brand rounded-lg ...">Continue <ArrowRight size={14} /></button>
<button onClick={handleComplete} className="... bg-gradient-to-br from-green-600 to-green-700 ...">Complete Phase 1 &amp; notify PM</button>
```

### File: `src/config/customer-phases.ts:42-48` (current — deliverable day ranges, read-only reference for Requirement B/C)

```ts
{ key: "kickoff", name: "Kickoff", dayStart: 1, dayEnd: 2, owner: "Bert" },
{ key: "outcome-target", name: "Outcome target", dayStart: 3, dayEnd: 4, owner: "Bert" },
{ key: "migration-checklist", name: "Migration checklist", dayStart: 5, dayEnd: 9, owner: "Bert" },
{ key: "content-map", name: "90-day content map", dayStart: 10, dayEnd: 11, owner: "Bert" },
{ key: "html-mockup", name: "HTML mockup", dayStart: 12, dayEnd: 13, owner: "Bert" },
{ key: "storage-kb", name: "Storage folder + KB", dayStart: 14, dayEnd: 14, owner: "Bert" },
{ key: "client-signoff", name: "Client call — sign-off", dayStart: 15, dayEnd: 15, owner: "PM + Bert" },
```
`InternalDeliverableConfig` (checklist items) has no day field of its own — Requirement C uses the parent step's `dayEnd` (looked up via `subPhaseKey` → `STEPS.find(s => s.key === item.subPhaseKey)`, already resolvable from data already in scope).

### File: `src/app/layout.tsx:12,14` + `globals.css:11-12` (current — fonts already wired, read-only reference)

```ts
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", weight: ["600","700"] });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
// globals.css: --font-heading: var(--font-display); --font-mono: var(--font-mono);
```
Use `font-heading`/`font-mono` Tailwind utility classes directly — no new font setup needed.

### File: `_onboarding-detail.tsx:975-982,1341-1377` (current — `isDark` prop threading to remove)

```tsx
const { settings } = usePMSettings();
const isDark = settings.theme === "dark";
// ...
// Timeline chrome is fixed-light v2.0 (task 168) — `isDark` is still computed above and passed
// to <OnboardingWizard isDark={isDark} .../> below unchanged, since Wizard step content (out of
// scope) still depends on it.
<OnboardingWizard
  ...
  isDark={isDark}
```
Confirmed this session (grep) that `isDark`/`settings` have no other consumer in this file — both the prop pass and (if still true at implementation time) the `usePMSettings()` call itself should be removed once the Wizard no longer needs `isDark`.

## Implementation Steps

1. Re-read `_onboarding-wizard.tsx` in full before editing (large file; this session's targeted greps/reads are not a substitute for the real current state — matches task 168's own approach to this file).
2. Promote the local `Switch` component to module scope; update its fill to v2.0 `--blue`.
3. Requirement B: rebuild the step header's deadline badge (status-tinted, mono) and extend step-indicator tooltips with day ranges.
4. Requirement C: rebuild the checklist row (size/radius/color per spec, add the right-aligned mono deadline tag, resolve each item's parent-step `dayEnd`).
5. Requirement D: rework the three named steps' layout (upload-first + toggle-gated RTE), preserving all existing validation/autosave/upload logic untouched.
6. Requirement E: re-map the footer buttons (Continue → blue, Complete Phase 1 → orange CTA, Back/Mark All as Done → Ghost); remove the green gradient.
7. Requirement A: sweep the remaining step content (Kickoff, Storage/KB, HTML Mockup, Client Sign-off) and every sub-component (`StorageFileExplorer`, `AddCredentialLinkModal`, `FileViewerModal`, `HtmlMockupFileList`, `HtmlEditorModal`, `WizardDeliverableRow`, `PhaseAccessPanel`, `RichTextField`, `FileUploadBox`) for remaining v1 hex/`isDark` ternaries, collapsing each to its v2.0 light-branch equivalent.
8. Remove the `isDark` prop from `OnboardingWizard`'s interface; update `_onboarding-detail.tsx`'s call site and (if confirmed unused elsewhere) drop its `usePMSettings()`/`isDark` computation.
9. Invoke `frontend-design`/`impeccable` for a polish pass per Requirement F's last bullet.
10. Run `npx tsc --noEmit` and `pnpm lint`.
11. Manual check: walk all 7 steps for a project at a few different `currentDay` values (before/within/past each step's day range) confirming deadline badges show the correct tint and checklist tags show `PENDING`/`DAY N` correctly; confirm the RTE toggle defaults open for a step that already has saved notes and closed for an empty one; confirm uploading a file and toggling the RTE open/closed doesn't affect the other; confirm PM read-only mode still renders correctly (toggle hidden when empty+disabled, RTE visible read-only when it has content); confirm Phase 1 completion, checklist toggling, and file upload/remove/view all still work exactly as before.

## Acceptance Criteria

- [ ] No v1 hex/named-color (`bg-brand`, `bg-green-500`, `amber-*`, gradient fills) or `isDark` ternary branching remains anywhere in `_onboarding-wizard.tsx`.
- [ ] Every step header shows a status-tinted, mono deadline readout derived from `currentDay` vs. that step's `dayStart`/`dayEnd`.
- [ ] Every checklist row shows the guide's right-aligned mono `DAY N` / `PENDING` tag (or no tag when done), matching `central-hub-design-system.md`'s "Checklist row" spec.
- [ ] Outcome Target, Migration Checklist, and 90-day Content Map each show the file upload as the primary, full-width action; the rich text editor is hidden behind a labeled toggle, defaulting open only when the field already has saved text content.
- [ ] The "either text or a file satisfies this field" validation behavior is unchanged on all three steps — verified by filling via upload only, via typed notes only, and via neither (error state).
- [ ] Kickoff and Client Sign-off's RTE fields are visually restyled to v2.0 but structurally unchanged (no toggle added there).
- [ ] Exactly one orange CTA-styled button ("Complete Phase 1 & notify PM") is visible at any time, only on the last step; "Continue" is v2.0 blue; "Back"/"Mark All as Done" are Ghost.
- [ ] `OnboardingWizard` no longer accepts or uses an `isDark` prop; `_onboarding-detail.tsx` no longer passes one (and no longer computes an unused `isDark`, if confirmed at implementation time).
- [ ] All autosave, validation, upload, checklist-toggle, and Phase-1-completion behavior is unchanged — verified manually against the pre-change behavior.
- [ ] `npx tsc --noEmit` and `pnpm lint` both pass with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: pnpm dev, visit /v2/portfolio-tracker/[a real projectId] as marketing/admin/super_admin
#   - Open the Wizard, step through all 7 steps — confirm consistent panel/spacing/token usage
#   - Confirm each step header's deadline badge tint matches currentDay vs. that step's day range
#     (test against a project at different currentDay values, or temporarily adjust currentDay)
#   - Confirm checklist rows show DAY N / PENDING tags correctly, no tag once done
#   - On Outcome Target / Migration Checklist / Content Map: confirm upload is the primary action,
#     toggle the RTE open, type notes, save, reload — confirm the toggle defaults open on reload
#     (content exists); on a step with no saved notes, confirm the toggle defaults closed
#   - Toggle checklist items, use "Mark All as Done," complete Phase 1 — confirm no regressions
#   - Reload the same project as a PM (read-only) role — confirm read-only rendering is correct,
#     including the toggle-hidden-when-empty-and-disabled rule
```

## Compatibility Touchpoints

- No schema, RLS, or API contract changes — every PATCH/upload/asset endpoint is consumed exactly as before.
- Removing `isDark` from `OnboardingWizard`'s props is a prop-shape change to a page-scoped component; its only caller (`_onboarding-detail.tsx`) is updated in the same task, so no other file is affected.
- `SaveIndicator` (shared with the public onboarding form) is explicitly untouched — no cross-surface visual bleed.

## Implementation Notes

### What Changed
- **Requirement A (global v2.0 tokens, fixed-light, drop `isDark`)** — done across the whole file via a scripted collapse (192 `isDark` occurrences → 0): every `isDark ? "light" : "dark"` ternary collapsed to its v2.0-mapped light-only value (navy/blue/orange/ok/warn/late/neutral hex per `central-hub-design-system.md` §1), then a second sweep remapped every remaining bare v1 class (`bg-brand`, `text-red-500`, `bg-green-500`, `bg-amber-*`, `border-slate-*`, modal-backdrop `bg-slate-900/NN` → navy-tinted `bg-[#071133]/NN`) to its literal v2.0 hex. `isDark: boolean` was removed from every sub-component's props/destructure/call-site (`PhaseAccessPanel`, `RichTextField`, `FileUploadBox`, `StorageFileExplorer`, `AddCredentialLinkModal`, `FileViewerModal`, `HtmlMockupFileList`, `HtmlEditorModal`, `WizardDeliverableRow`, `PhaseCompletionTransition`, `ContactsField`, `TagField`), `assetTypeCls`'s dark branch and the now-dead `ASSET_TYPE_CLS_DARK` map were deleted, `CodeMirror`'s `theme={isDark ? githubDark : githubLight}` collapsed to `githubLight` (unused `githubDark` import removed), and the two decorative gradients (`Phase 1 complete` icon, `Complete Phase 1` button) were flattened to solid `--ok`/`--orange` fills per the guide's no-gradient rule. `font-heading` (Space Grotesk, already wired via task 165's `--font-display`) applied to step/page/panel titles; `font-mono` (JetBrains Mono) applied to day counters and the deadline/checklist tags. Focus-visible outlines (2px `--blue`, 2px offset) added to the footer buttons, checklist rows, "Mark All as Done," and the new `Switch`.
  - `_onboarding-detail.tsx`: removed the now-dead `isDark={isDark}` prop pass to `<OnboardingWizard>`; confirmed (grep) `settings`/`isDark` had no other consumer in the file and removed the `usePMSettings()` call and its now-unused import entirely, rather than leaving dead code.
- **Requirement B (deadline badge, step header + tooltip)** — step header now shows a status-tinted mono badge (`DONE · DAY N` / `OVERDUE · DUE DAY N` / `DUE DAY N` / `DAY N–M`) computed from `currentDay` vs. `step.dayStart`/`dayEnd`. Step-indicator tooltips extended from just the step name to `"{name} · Day {range}"`.
- **Requirement C (checklist deadline tag)** — checklist checkbox resized to the guide's literal 17px/5px-radius spec (was 20px/4px), done-state recolored to `--ok`. Added the guide's own documented right-aligned mono tag (`PENDING` before `dayStart`, `DAY {dayEnd}` in warn/late tone once due/overdue, omitted once done) — resolved from the parent step's `dayEnd` since `stepInternal` is always scoped to the current step (confirmed: `internalDeliverablesForSubPhase(step.key)`), so no per-item day lookup was needed beyond what the task doc anticipated.
- **Requirement D (upload-first, RTE-optional)** — new module-scope `UploadFirstField` component (upload box primary/full-width, `Switch`-gated `RichTextField` below, defaulting open only when `stripHtml(value).length > 0`, toggle hidden when `disabled` and empty) applied to exactly the three named steps (Outcome Target, Migration Checklist, 90-day Content Map), replacing their `RTE | "Or" | Upload` three-column grid. Kickoff and Client Sign-off's RTE fields are unchanged structurally (token-swept only), per the explicit scope boundary. The local `Switch` (previously duplicated inline inside `AddCredentialLinkModal`) was promoted to module scope and both call sites now share it. Validation logic (`isOutcomeFilled`/`isMigrationChecklistFilled`/`isContentMapFilled`, the `stripHtml(text) || files.length` either/or check) and every autosave/upload/remove/view handler are untouched — verified live by toggling notes open/closed and uploading without any change to save behavior.
- **Requirement E (button remap)** — "Continue" → v2.0 Confirm/navigate blue (`bg-[#007BFF]` hover `#0063D6`); "Complete Phase 1 & notify PM" → v2.0 CTA orange (`bg-[#FB914E] text-[#471F02]` hover `#E2762F`/white), gradient removed; "Back"/"Cancel" and "Mark All as Done" → Ghost (white, `#E2E7F2` border, hover border `#A8C6F5`); all pill-radius (`rounded-full`).
- **Requirement F (UX/consistency)** — covered by the above; hover/focus states audited across the touched surfaces during the sweep.
- **Bug found and fixed during verification, not in the original plan**: a live dev-server compile check caught a transient `ReferenceError: isDark is not defined` in `HtmlMockupFileList`'s upload dropzone — one of the two `FileUploadBox`-style dropzone ternaries (Outcome/Migration/Content-map's `FileUploadBox` and HTML Mockup's separate `HtmlMockupFileList` each had their own copy of the same `isDark ? isDragOver ? ... : ...` pattern) that the first `replace_all` pass didn't catch because of a differing surrounding string. Fixed with a second `replace_all` targeting the exact shared pattern; confirmed fixed via a live re-test in the browser (see Verification Run).

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` — full v2.0 token restyle of all 7 steps and every sub-component; new `UploadFirstField`/promoted `Switch`; deadline badges (step header + checklist rows); button re-mapping; `isDark` removed entirely (props, types, destructures, ternaries)
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` — removed the dead `isDark` prop pass to `<OnboardingWizard>` and the now-unused `usePMSettings()` call/import

### Deviations From Plan
- None beyond the two decisions already flagged up front in the task doc's Overview (fixed-light v2.0 throughout; `SaveIndicator` left untouched) — both applied exactly as planned. The `ASSET_TYPE_CLS_LIGHT`/`ASSET_TYPE_CLS_DARK` pair was consolidated into a single `ASSET_TYPE_CLS` map (not explicitly named in the plan, but a direct, minimal consequence of Requirement A's `isDark`-removal — the "link" tint's leftover `indigo` v1 color was also remapped to v2.0 blue while touching this map, since it sat directly in scope of the change).

### Verification Run
- `npx tsc --noEmit` — PASS, zero errors repo-wide (checked after every major edit and once at the end).
- `pnpm lint` — PASS, zero errors/warnings repo-wide (two real warnings — unused `githubDark` import, unused `ASSET_TYPE_CLS_DARK` — found and fixed mid-session, not left for a follow-up).
- **Live browser QA — RAN** (an authenticated Super Admin session was available via the Chrome extension, unlike tasks 166–168 which had no test credentials): opened `/v2/portfolio-tracker/1C0A-PROJ-361D` (Greydog Security, Day 9/120, several steps already overdue — a good mixed-state test case) and walked the Wizard:
  - Kickoff: unchanged layout confirmed (no toggle added, per scope).
  - Outcome Target (Day 9, dayEnd 4 → overdue): `OVERDUE · DUE DAY 4` badge rendered correctly; upload-first layout confirmed (dropzone primary, toggle below, off by default); toggled the switch on — `RichTextField` appeared correctly styled (v2.0 blue focus ring, B/I/U/List toolbar); checklist row showed a `DAY 4` tag in the late (red) tone, confirmed by zoomed screenshot.
  - Migration Checklist (Day 9 = dayEnd 9, boundary case): `DUE DAY 9` badge rendered in warn (amber) tone, not late — confirms the `currentDay > dayEnd` (strict) boundary condition is correct; checklist tag matched.
  - Storage folder + KB (dayStart 14, not yet reached): `DAY 14` neutral badge; checklist items all showed `PENDING`; the 935-line `StorageFileExplorer` rendered its full folder grid (Business Files, Outcome Target, Checklist, Content Map, HTML Mockup, Other) with no runtime errors after the `isDark` removal.
  - HTML Mockup: caught the `isDark is not defined` bug here live (see "What Changed"), fixed it, then re-verified this exact step rendered cleanly with no console errors.
  - Footer buttons zoomed and confirmed: "Back" (white pill, light border) and "Continue" (solid blue pill, white text, arrow icon) match the v2.0 spec exactly.
  - Forward-navigation gate ("Step not available yet" modal) confirmed still functioning — pre-existing behavior, unmodified by this task, still blocks jumping past an unfinished step via the step-indicator (direct URL navigation with `?deliverable=N` still works for already-reached steps, unaffected).
- Not verified live: the "Complete Phase 1" orange CTA click flow, PM read-only rendering, and the toggle's `disabled`+empty hidden-control rule (no PM-role test account readily available in the session) — recommended as a follow-up spot-check before this is treated as fully done in practice.

### Round 2 — user feedback after live review (layout, upload polish, two real bugs)

User reviewed the live Wizard and asked for five changes, all applied in this round:

1. **Removed the full-width `WizardDeliverableRow` "quoted title" section** (the redundant `"Outcome target" ... Pending` box shown in the user's screenshots, duplicating the step title directly above it). The step's pending/in_progress/done status now renders as a small icon+label chip directly beside the step name in the header (reusing the same tone/icon vocabulary `WizardDeliverableRow` used — `CheckCircle2`/ok, `Clock`/blue, `Circle`/neutral), and the now-redundant "DONE ·" prefix was dropped from the deadline badge next to it (status is no longer duplicated across two badges).
2. **Checklist moved from a full-width bottom section to a sticky right-side column** (`grid-cols-[1fr_272px]`, `lg:sticky lg:top-4`) next to the step's main content, so it stays in view while filling in a field instead of requiring a scroll down. Checklist item rows adapted to the narrower column (label above, deadline tag below, instead of side-by-side) and tooltip side flipped `right` → `left` to stay on-screen at the column's right edge. Applied once, to the single shared checklist block every step already uses — no per-step duplication needed.
3. **`FileUploadBox` (and `HtmlMockupFileList`'s own copy of the same dropzone) redesigned**: thinner border (`border` instead of `border-2`), taller (`min-h-[168px]` vs. the old `py-4`), `rounded-2xl`, a `CloudUpload` icon (replacing `Upload`) inside a soft blue circle badge that fills solid blue + scales up slightly on hover/drag-over, bolder primary copy ("Drag & drop a file, or **browse**") plus a muted hint line. Being a shared component, this automatically applied everywhere the user asked for (Kickoff, HTML Mockup, Client Sign-off) with no separate per-step change — confirmed live on all three.
4. **Checklist validation gap fixed**: `implementation-file` (Migration Checklist) and `cluster-topics-schedules`/`publishing-plan` (Content Map) had no validation gate in `handleValidatedInternalToggle` — unlike every other gated item (Kickoff's two, `outcome-target-filed`, `html-md-files`, `signoff-agreement-filed`), they could be marked done with no notes/file present. Added the same gate pattern (blocks the toggle, sets `checklistValidationError` + the field's own `*FieldError`) keyed on `isMigrationChecklistFilled`/`isContentMapFilled`, and mirrored the same checks into `handleMarkAllDone`'s `hasFailing` list so "Mark all"/"Mark All as Done" can't bypass it either. Verified live: clicking "Implementation file" with no notes/upload no longer fires a PATCH and now shows the same inline error style as the other gated items.
5. **Step-indicator skip-ahead bug fixed**: `handleStepIndicatorClick` allowed jumping to *any* future step once the currently-viewed step was done/overdue, not just the next one — e.g. from Step 2 you could jump straight to Step 4, skipping Step 3 entirely. Added an `i !== stepIdx + 1` check ahead of the existing done/overdue gate, so forward navigation is capped to exactly one step at a time; backward navigation to already-reached steps is unaffected. Verified live: clicking Step 4 from Step 2 now shows "Complete 'Outcome target' first — steps can only be advanced one at a time." instead of jumping.

**Dead code removed as a direct consequence of Requirement 1** (not a separate ask, but couldn't be left behind): `WizardDeliverableRow` itself, `setDeliverableStatus` (the step-level manual status PATCH — its only call site was `WizardDeliverableRow`'s `onClick`, which only ever fired for a step with zero internal-deliverable items; every real step has at least one, so this path was already dead in practice, now dead in the source too), and the `cycle()` helper (`setDeliverableStatus`'s only caller). The step's status is unaffected — it was, and remains, auto-derived server-side from the checklist items via `setInternalStatus`'s response (`internal-deliverables` PATCH route already returns and applies the parent `deliverable` row).

#### Files Changed (Round 2)
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` only — status chip + simplified deadline badge in the step header; two-column layout (main content + sticky checklist sidebar); `FileUploadBox`/`HtmlMockupFileList` dropzone redesign; two new validation gates; step-indicator one-step-forward cap; removed `WizardDeliverableRow`/`setDeliverableStatus`/`cycle`; swapped the now-unused `Upload` icon import for `CloudUpload`.

#### Verification Run (Round 2)
- `npx tsc --noEmit` — PASS, zero errors.
- `pnpm lint` — PASS, zero errors/warnings (including the three new warnings this round's own edits produced mid-session — unused `Upload`, `setDeliverableStatus`, `cycle` — all resolved before this check).
- **Live browser QA** (same authenticated session): confirmed on Outcome Target (status chip "Pending" + simplified deadline badge, sticky sidebar checklist, redesigned upload dropzone), Kickoff (2-column content + sidebar checklist with 3 items each showing their own `DAY 2` tag, redesigned upload box on Business facts), Client Sign-off (RTE+Or+Upload structure preserved per the original scope decision, now with sidebar checklist and the redesigned dropzone), and HTML Mockup (redesigned dropzone, single-item sidebar checklist). Confirmed the skip-ahead navigation block and the Migration Checklist validation gate both work exactly as described above, via direct interaction (not just code inspection).
- Not verified live: Content Map's checklist gate specifically (same code path as Migration Checklist's, which was verified; not re-tested separately) and PM read-only rendering of the new layout (still no PM test account in this session).

### Round 3 — light divider, then user feedback: error-state upload styling + a real "stuck Pending" bug + status derivation rules

**Divider**: added a light 1px vertical rule (`bg-[#E2E7F2]`, `self-stretch`, `hidden lg:block`) between the main content column and the checklist sidebar, via a third `1fr_1px_272px` grid column rather than a border on the checklist card itself (which already has its own full border as a panel — a border-left there would have doubled up against the card edge instead of sitting in the gap between the two columns).

**User feedback, four items, all applied:**

1. **Upload-field red border/glow on validation error** — `FileUploadBox` and `HtmlMockupFileList` gained a `hasError` prop, styled identically to `RichTextField`'s existing error state (`border-[#C0392B]`, `shadow-[0_0_0_3px_rgba(192,57,43,0.25)]`, plus a light red-tinted background and a red icon-circle fill for extra clarity on a dashed dropzone specifically). Wired to every RTE-or-upload field's existing `*FieldError` state: Kickoff (Business Facts), Outcome Target, Migration Checklist, Content Map (all via `UploadFirstField`, which now forwards `hasError` to `FileUploadBox` too, not just the RTE), plus two steps that had **no** field-error state at all before this round — Client Sign-off and HTML Mockup. Added `signoffFieldError`/`htmlMockupFieldError` (matching the existing pattern exactly), wired them into `handleValidatedInternalToggle`'s `signoff-agreement-filed`/`html-md-files` gates and into `handleReview`, and added their own inline error message (previously: these two steps had a checklist-level error message but no per-field red-border indication anywhere). Also fixed a latent bug while touching `UploadFirstField`: its error `<p>` message was nested inside the `{notesOpen && (...)}` block, so it was invisible whenever the RTE toggle was off — moved it outside, since the upload box (always visible) is an equally valid way to satisfy the field.

2. **Real bug: status chip stuck on "Pending" forever, even with every checklist item checked** (user's screenshot). Root-caused via direct API testing (a manual `fetch` PATCH from the browser console confirmed the server's auto-derive logic itself was correct — it returned `deliverable.status: "done"` correctly). The actual bug: `_onboarding-detail.tsx` renders `<OnboardingWizard>` as soon as `wizardOpen` is true from URL search params (`?phase=&deliverable=`), which can happen *before* its own `deliverables`/`internalDeliverables` fetch resolves. `useState(deliverables)`/`useState(internalDeliverables)` only capture that initial, possibly-empty snapshot — with nothing to re-sync them later, every subsequent `.map`-based update (after every real, successful toggle) had zero matching rows to update, so `localDeliverables`/`localInternal` stayed empty for the rest of the session no matter how many successful PATCHes fired. Reproduced directly (confirmed "0/0 complete" instead of "0/7") via a deep-link-style page load, fixed with a render-time "adjust state from props" sync (React's documented pattern for exactly this, matching this file's own existing `prevStepIdxForValidation` idiom instead of a `useEffect`, to avoid the `react-hooks/set-state-in-effect` lint error this file already carries one instance of) that syncs `localDeliverables`/`localInternal` from the prop **only** on the one empty→populated transition — never again afterward, so it can't clobber a later optimistic local update. Re-verified live: direct deep-link load now correctly shows "0/7", and toggling a checklist item to done now correctly flips the status chip to "Done" and increments the count to "1/7".

3. **Three new "in progress" status triggers**, exactly as specified by the user: (1) today's programme day has reached the step's scheduled start day, even with nothing filled in yet; (2) the step's own RTE/upload field has content, even before the step's start day is reached; (3) some (but not all) checklist items are checked, since some items don't require a field at all. Implemented as a **display-only** derived value (`displayStepStatus`), layered on top of the real, server-persisted `stepStatus` (which stays exactly as-is and continues to drive navigation gating and `doneCount` — "done" always wins outright and is untouched by this) — computed synchronously from already-live component state (`currentDay`, `step.dayStart`, each step's own `is*Filled` check via a `stepOwnFieldFilled()` switch, and a fresh `anyChecklistItemDone` scan of `localInternal`), so it needs no network round-trip and can't drift from what's on screen. Used only for the header status chip; the deadline badge's tone vocabulary (done/overdue/due/future) is intentionally unchanged — it's about day-urgency, not the pending/in-progress/done status the chip already owns. `storage-kb` has no single "own field" (file-explorer only), so trigger 2 doesn't apply there — triggers 1 and 3 still do. Verified live: Outcome Target correctly showed "In progress" purely from trigger 1 (Day 9 ≥ start Day 3, nothing filled yet); 90-day Content Map (start Day 10, not yet reached) flipped from "Pending" to "In progress" the instant text was typed into its notes editor, with both checklist items still showing "PENDING" — confirming trigger 2 fires independently of triggers 1 and 3.

#### Files Changed (Round 3)
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` only — divider; `hasError` on `FileUploadBox`/`HtmlMockupFileList`; `signoffFieldError`/`htmlMockupFieldError` states + gate wiring; `UploadFirstField` error-message placement fix; `localDeliverables`/`localInternal` render-time prop sync; `displayStepStatus` computation used by the header status chip.

#### Verification Run (Round 3)
- `npx tsc --noEmit` — PASS, zero errors.
- `pnpm lint` — PASS, zero errors/warnings (one new error surfaced and was fixed mid-round: `react-hooks/set-state-in-effect` on the first `useEffect`-based attempt at the prop-sync fix, resolved by switching to the render-time adjustment pattern instead).
- **Live browser QA**, all via direct interaction: reproduced the "0/0 complete" bug with a deep-link-style load, then confirmed the fix — "0/7" on load, "1/7" plus a "Done" chip after checking a field-gated checklist item off. Confirmed the upload box shows the same red border/glow/tint as the RTE on a validation error (Outcome Target, no field filled). Confirmed trigger 1 (Outcome Target, overdue) and trigger 2 (Content Map, typed notes before its start day) each independently flip the status chip to "In progress." Not separately re-verified live this round: trigger 3 in isolation (multiple checklist items, some but not all checked — logically identical to the pre-existing, already-tested server-side `anyStarted` derivation this mirrors client-side) and the new Client Sign-off/HTML Mockup error-state wiring specifically (same code path as the four steps that were verified).

### Round 4 — Client Sign-off converted to upload-first; HTML Mockup full-width

Two follow-up requests, both applied:

1. **Client Sign-off** was the last step still on the original `RichTextField | "Or" | FileUploadBox` three-column layout (deliberately preserved that way through Rounds 1–3, per the original task scope naming only Outcome Target/Migration Checklist/Content Map). User asked for it to match those three now — converted to `UploadFirstField`, same as the other three: upload box primary and full-width, RTE hidden behind the toggle (defaulting open only if `signoffNotes` already has content). All existing wiring (`signoffNotes`/`signoffFiles`/`handleSignoffUpload`/`signoffFieldError`/`isSignoffFilled`, all already in place from Round 3's error-styling work) reused as-is — this was a pure JSX-structure swap, no new state or handlers needed.
2. **HTML Mockup**'s upload area was constrained to `max-w-xl` (576px), visibly narrower than every other step's full-width dropzone (user's screenshot). Removed the width cap — `max-w-xl mb-5` → `mb-5` — so `HtmlMockupFileList`'s dropzone now spans the full content column exactly like `FileUploadBox` does elsewhere.

Both changes are contained entirely within `_onboarding-wizard.tsx`'s step-content JSX — no changes to `UploadFirstField`, `FileUploadBox`, `HtmlMockupFileList`, or any handler/state.

#### Verification Run (Round 4)
- `npx tsc --noEmit` — PASS, zero errors.
- `pnpm lint` — PASS, zero errors/warnings.
- Live browser QA: confirmed Client Sign-off now renders identically in structure to Outcome Target/Migration Checklist/Content Map (full-width upload box, toggle-gated RTE below); confirmed HTML Mockup's dropzone now spans the full column width, matching the other steps.

### Round 5 — Complete-Phase-1 context cards moved out of the step panel, redesigned as equal-width columns

The last step's two messages ("N deliverables not yet done" and "Marking Phase 1 complete will…") were rendered as two long, stacked, identically-styled amber banners *inside* the same white panel as "Client call — sign-off"'s own content — visually reading as part of that step, though they're actually about completing the whole phase, not that one step. User asked for them moved outside that box and redesigned so the layout doesn't read as one long boring stack.

- Moved the whole `{isLastStep && !isPM && isPhaseActive && (...)}` block out from inside the step panel's closing `</div>`, to its own section between that panel and the footer nav bar.
- Rebuilt as a `grid-cols-1 sm:grid-cols-2` row of two equal-width cards (falls back to a single column when only the second card is showing, i.e. when there are 0 undone deliverables) instead of one stacked flex list: each card gets its own icon in a tinted circle badge (matching the icon-circle pattern already established on `FileUploadBox`'s dropzone and `PhaseCompletionTransition`), a bold headline line, and a description line below.
- Gave the two cards distinct tones instead of both being identical amber — the "not yet done" card stays `--warn` (amber, a genuine caution), the "what happens when you complete" card switched to `--blue`/`--blue-100` (informational, not a warning — it's just explaining the consequence of the action, which better matches the guide's semantic color system and also breaks up the visual monotony of two identical boxes).

#### Files Changed (Round 5)
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` only — relocated and redesigned the completion-context cards; no state, handler, or other component changes.

#### Verification Run (Round 5)
- `npx tsc --noEmit` — PASS, zero errors.
- `pnpm lint` — PASS, zero errors/warnings.
- Live browser QA: confirmed the two cards now render outside the "Client call — sign-off" panel, side by side in equal-width columns with distinct amber/blue tones and icon badges, sitting directly above the footer nav bar (Back / Step 7 of 7 / Complete Phase 1 & notify PM).

## Final Summary

Five rounds, one file (`_onboarding-wizard.tsx`, plus a one-time `_onboarding-detail.tsx` prop-removal in Round 1), all live-tested in-browser against a real project (Greydog Security, Day 9/120) with an authenticated session across every round — not just code-inspected.

**What shipped, end to end:**
- Full Design System v2.0 token pass across all 7 Wizard steps and every sub-component (`StorageFileExplorer`, `AddCredentialLinkModal`, `FileViewerModal`, `HtmlMockupFileList`, `HtmlEditorModal`, `PhaseAccessPanel`, `RichTextField`, `FileUploadBox`) — `isDark`/dark mode removed entirely (fixed-light), matching the precedent already set by tasks 166–168 for this surface.
- Status-tinted deadline badges on every step header and mono `DAY N`/`PENDING` tags on every checklist row, per the design guide's own documented "Checklist row" spec.
- A pending/in_progress/done status chip beside the step title, replacing the old redundant full-width `WizardDeliverableRow` section — now computed from three live triggers (scheduled start day reached, the step's own field has content, or some but not all checklist items are checked) layered on top of the real server-persisted status, so it reflects intent instantly with no network round-trip.
- Upload-first, RTE-optional layout (`UploadFirstField`) on Outcome Target, Migration Checklist, Content Map, and — extended in Round 4 — Client Sign-off: a redesigned full-width, taller, thinner-bordered dropzone with a `CloudUpload` icon badge is the primary action; the rich text editor is hidden behind a toggle, defaulting open only when the field already has saved text.
- Consistent error-state styling: the upload dropzone now shows the same red border/glow as the RTE on a validation failure, wired into every RTE-or-upload field including two steps (Client Sign-off, HTML Mockup) that had no per-field error indication at all before Round 3.
- A sticky, right-side checklist column (with a light vertical divider) replacing the old full-width bottom section, so the checklist stays in view without scrolling.
- Footer buttons remapped to the guide's CTA/Confirm-navigate/Ghost taxonomy; the "Complete Phase 1" gradient button replaced with a flat orange CTA.
- The Complete-Phase-1 context cards moved out of the step panel into their own equal-width, distinctly-toned row above the footer nav.
- Step-indicator navigation capped to one step forward at a time (was previously skippable past incomplete steps).
- Checklist validation gaps closed for Migration Checklist's and Content Map's items (previously markable done with nothing filled in).
- A real, root-caused data bug fixed: the Wizard's local deliverable/checklist state could permanently desync from the server on a deep-link-style page load, freezing every step's status at "Pending" no matter how many successful toggles happened afterward. Fixed with a render-time prop-sync (not a `useEffect`, to avoid this file's known `set-state-in-effect` lint constraint) that only fires on the one empty→populated transition.

**Verification, every round:** `npx tsc --noEmit` and `pnpm lint` clean (zero errors/warnings repo-wide) before considering any round done, plus live browser QA — not skipped due to missing credentials, unlike the precedent set by tasks 166–168, because an authenticated Super Admin session was available via the Chrome extension this session.

**Known gaps, not blocking, left for a future session if they turn out to matter:** PM (read-only) rendering of the new layout was never spot-checked live (no PM test account available); Content Map's checklist validation gate specifically wasn't independently re-verified in Round 3 (same code path as Migration Checklist's, which was); trigger 3 (partial-checklist → in-progress) wasn't re-tested in isolation after Round 3 since it mirrors the already-verified server-side derivation.
