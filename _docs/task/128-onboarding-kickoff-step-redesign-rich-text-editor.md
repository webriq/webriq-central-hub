# 128: Onboarding Wizard — Kickoff Step Redesign, Rich Text Editor & Autosave Indicator

**Created:** 2026-07-10
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

Redesign the **Kickoff** step of the internal onboarding wizard
(`_onboarding-wizard.tsx`, rendered when `step.key === "kickoff"`) so its
fields visually match the polished `Field` component style used on the New
Project wizard (`_content.tsx`), replace its three plain `<textarea>`s with a
rich text editor, and add a visible draft-autosave status indicator matching
the pattern already used on the public client onboarding form
(`useAutoSave` + `SaveIndicator`).

**Package finding:** Tiptap is already installed and already used elsewhere
in this codebase (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`,
`@tiptap/extension-underline` — see `package.json` and
`src/components/hub/pm-tabs/tasks-tab.tsx`). **No new package install is
needed.** Tiptap is the right (and only necessary) choice here — do not add
`react-quill`, `slate`, `lexical`, or any other editor library.

**Scope boundary:** "Redesign the Kickoff Step" is read literally — only the
`step.key === "kickoff"` field block (lines ~276–299 of
`_onboarding-wizard.tsx`) is in scope. The `storage-kb` step, the step
indicator/progress header, the per-step deliverable checklist box
(`WizardDeliverableRow` + internal deliverables list), and the Phase 1
completion screen are all out of scope for this task.

## Requirements

- [ ] Kickoff step's field labels + inputs adopt the same visual language as
      `Field` in `_content.tsx`: `rounded-[9px]`, `border-[1.5px]`, `px-3.5
      py-[11px]`, `text-sm`, focus glow (`focus:border-brand
      focus:shadow-[0_0_0_3px_rgba(51,88,244,0.1)]`), error state styling —
      but implemented in an **isDark-aware** way (paired light/dark utility
      classes via the `isDark` prop + `cn()`), matching how this file (and
      the rest of `src/app/v2`) already themes, per this codebase's
      documented convention of *not* introducing Tailwind `dark:` variants
      into v2. `_content.tsx` itself is hardcoded light-only and is a
      **style reference only**, not something to import or copy verbatim.
- [ ] The three Kickoff textareas — `directAccess`, `businessFacts`,
      `customerData` — are replaced with a rich text editor (Tiptap:
      `StarterKit` + `Underline`, same extensions as
      `tasks-tab.tsx`) with a minimal toolbar (Bold / Italic / Underline /
      Bullet List), styled to match the new Field visual language and to be
      isDark-aware.
- [ ] Editor content is stored/loaded as an HTML string in the same
      `kickoffData.directAccess` / `.businessFacts` / `.customerData` keys
      inside `wizard_data` — no DB schema or API contract change needed
      (`customer_phases.wizard_data` is JSONB; the `wizard-data` PATCH route
      merges whatever shape it's given).
- [ ] A visible autosave status indicator (idle/saving/saved/error) is shown
      for the Kickoff step, reusing the existing `SaveStatus` type
      (`src/types/onboarding.ts`) and `SaveIndicator` component
      (`src/components/onboarding/save-indicator.tsx`) — the same
      idle/saving/saved(+timestamp)/error UX already used on the public
      client onboarding form. The existing 2s debounce timing in the
      `kickoff` autosave `useEffect` does **not** need to change — only
      visible status feedback is being added.
- [ ] Autosave should not show "saving…" on initial mount when nothing has
      actually changed (mirror `useAutoSave`'s skip-if-unchanged guard via a
      ref of the last-saved JSON string), so the indicator doesn't flash on
      page load.
- [ ] `storage-kb` step, other steps, and the deliverables checklist box are
      visually and functionally unchanged.

## Out of Scope / Must-Not-Change

- `storage-kb` step fields/textareas (`documentsNote`, `dnsAccess`,
  `credentialsNote`) — untouched in this task.
- Step indicator/progress header, deliverable checklist box, internal
  deliverables list, Phase 1 completion screen.
- `_content.tsx` (New Project wizard) itself — read-only style reference,
  not modified.
- `PATCH /api/projects/[projectId]/programme/wizard-data` route — no change
  needed; it already merges arbitrary JSON per sub-phase key.
- No new npm/pnpm packages.
- `TagField` (competitor URLs) stays an input+tag list, not converted to
  rich text (it's not a textarea).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Restyle Kickoff step fields; add local `RichTextField` component; add save-status state wired to the kickoff autosave effect; render `SaveIndicator` |

No other files need to change.

## Code Context

### `_content.tsx` — `Field` style reference (light-only, hardcoded hex; do not copy verbatim, use as visual target)

```tsx
// src/app/v2/(hub)/onboarding/new/_content.tsx (Field component, ~L179-230)
<input
  className={cn(
    "peer w-full rounded-[9px] border-[1.5px] bg-white px-3.5 py-[11px] text-sm text-[#0F172A] outline-none transition-[border-color,box-shadow] duration-150",
    icon && "pl-[38px]",
    error
      ? "border-[#DC2626] shadow-[0_0_0_3px_rgba(220,38,38,0.08)]"
      : "border-[#E2E8F0] focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)]"
  )}
/>
```

`_content.tsx` uses its own literal `#2563EB` blue — this codebase's actual
brand color (used throughout the wizard file already via `text-brand` /
`bg-brand`) is `--color-brand: #3358F4` (`src/app/globals.css:51`). Use
`rgba(51,88,244,0.1)` for the focus shadow to stay consistent with the
existing `brand` token instead of `_content.tsx`'s literal blue.

### `_onboarding-wizard.tsx` — current Kickoff field block to replace (L276-299)

```tsx
{step.key === "kickoff" && (
  <div className="max-w-xl flex flex-col gap-4 mb-5">
    <div>
      <label className={labelCls}>Senior contact + direct access</label>
      <input value={seniorContact} onChange={(e) => setSeniorContact(e.target.value)} placeholder="Name, role, best contact method" className={inputBase} />
      <textarea rows={2} value={directAccess} onChange={(e) => setDirectAccess(e.target.value)} placeholder="Direct access notes (site admin, hosting, etc.)" className={cn(inputBase, "mt-2")} />
    </div>
    <div>
      <label className={labelCls}>Business facts</label>
      <textarea rows={4} value={businessFacts} onChange={(e) => setBusinessFacts(e.target.value)} placeholder="History, services, value proposition, service areas, target customers…" className={inputBase} />
    </div>
    <div>
      <label className={labelCls}>Current website URL</label>
      <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://client.com" className={inputBase} />
    </div>
    <TagField label="Competitor / reference URLs" tags={competitorUrls} input={competitorInput} setInput={setCompetitorInput}
      onAdd={() => { if (competitorInput.trim()) { setCompetitorUrls((c) => [...c, competitorInput.trim()]); setCompetitorInput(""); } }}
      onRemove={(i) => setCompetitorUrls((c) => c.filter((_, j) => j !== i))} placeholder="https://competitor.com" isDark={isDark} />
    <div>
      <label className={labelCls}>Customer data</label>
      <textarea rows={3} value={customerData} onChange={(e) => setCustomerData(e.target.value)} placeholder="Positioning-useful info about their customers…" className={inputBase} />
    </div>
  </div>
)}
```

`seniorContact`/`websiteUrl` stay plain `<input>`s — only the three
`<textarea>` fields (`directAccess`, `businessFacts`, `customerData`) become
rich text.

### `tasks-tab.tsx` — existing Tiptap toolbar pattern to mirror (extensions + button set), restyle isDark-aware instead of `dark:`

```tsx
// src/components/hub/pm-tabs/tasks-tab.tsx ~L294-301, 616-656
const editor = useEditor({
  extensions: [StarterKit, Underline],
  editorProps: { attributes: { class: "min-h-[120px] px-3 py-2 text-sm ... focus:outline-none" } },
});
// toolbar: Bold(B) / Italic(I) / Underline(U) / Strike(S) buttons calling
// editor.chain().focus().toggleBold().run() etc., active state via editor.isActive(...)
// plus Bullet List / Ordered List buttons via toggleBulletList()/toggleOrderedList()
// content read on submit via: editor && !editor.isEmpty ? editor.getHTML() : null
```

Note: `tasks-tab.tsx`'s editor is only mounted inside a conditionally-opened
create-task modal, so it never SSRs. The Kickoff step renders as part of the
wizard's normal client-rendered tree and can be hit during SSR of this
`"use client"` component — pass `immediatelyRender: false` to `useEditor(...)`
here to avoid a Tiptap SSR hydration warning (verify in the browser console
after implementing; add it if the warning appears, it's a safe default
either way for Tiptap v3 in a Next.js app router page).

### `save-indicator.tsx` + `SaveStatus` type — reuse directly, don't reinvent

```tsx
// src/types/onboarding.ts:87
export type SaveStatus = "idle" | "saving" | "saved" | "error";

// src/components/onboarding/save-indicator.tsx — existing component, import as-is:
import SaveIndicator from "@/components/onboarding/save-indicator";
<SaveIndicator status={saveStatus} lastSavedAt={lastSavedAt} error={saveError} />
```

`SaveIndicator` uses fixed status colors (`text-green-600`, `text-amber-500`,
`text-red-500`, `bg-slate-300` idle dot) rather than the `isDark` prop
pattern. That's an acceptable, low-risk inconsistency to import as-is for
fidelity with "similar to previous client onboarding" — these are semantic
status colors, not a light/dark surface, and they already read acceptably in
both themes elsewhere in the codebase. Do not rewrite `save-indicator.tsx`
itself as part of this task.

### `_onboarding-wizard.tsx` — current kickoff autosave effect to extend with status (L70-81)

```tsx
useEffect(() => {
  if (kickoffSaveRef.current) clearTimeout(kickoffSaveRef.current);
  kickoffSaveRef.current = setTimeout(() => {
    fetch(`/api/projects/${project.id}/programme/wizard-data`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subPhaseKey: "kickoff", data: { seniorContact, directAccess, businessFacts, websiteUrl, competitorUrls, customerData } }),
    }).catch(() => {});
  }, 2000);
  return () => { if (kickoffSaveRef.current) clearTimeout(kickoffSaveRef.current); };
}, [project.id, seniorContact, directAccess, businessFacts, websiteUrl, competitorUrls, customerData]);
```

Needs: a `kickoffSaveStatus`/`kickoffLastSavedAt`/`kickoffSaveError` state
trio (or reuse generic names since this is the only step getting the
indicator in this task), `setKickoffSaveStatus("saving")` right before the
`fetch`, `.then(res => ...)` branching to `"saved"` (+ `new Date()`) or
`"error"`, and a `lastSavedJsonRef` skip-if-unchanged guard mirroring
`useAutoSave`'s `lastDataRef` pattern so mount doesn't trigger a spurious
"saving" flash.

## Implementation Steps

1. Add `RichTextField` as a local component inside
   `_onboarding-wizard.tsx` (matching this file's existing convention of
   inlining small components like `TagField`/`FileUploadBox`/
   `WizardDeliverableRow` rather than creating new files under
   `src/components/`). Props: `label`, `value` (HTML string), `onChange`,
   `placeholder`, `isDark`, `minHeightClass`. Uses
   `useEditor({ extensions: [StarterKit, Underline], content: value, immediatelyRender: false, editorProps: { attributes: { class: cn(...) } }, onUpdate: ({ editor }) => onChange(editor.getHTML()) })`
   with a small Bold/Italic/Underline/Bullet-List toolbar, styled with the
   new isDark-aware bordered-container look (rounded-[9px] border-[1.5px],
   focus-within glow) instead of the flat `inputBase`.
2. Add new isDark-aware style constants scoped to the Kickoff step (e.g.
   `kickoffLabelCls`, `kickoffInputCls`, `kickoffFieldWrapCls`) matching the
   `Field` visual language from `_content.tsx` (rounded-[9px],
   border-[1.5px], focus glow using `rgba(51,88,244,0.1)`), paired
   light/dark via `isDark ? "..." : "..."` + `cn()`. Do not modify the
   existing shared `inputBase`/`labelCls` used elsewhere in the file.
3. In the `step.key === "kickoff"` block, apply the new style constants to
   `seniorContact` and `websiteUrl` inputs, replace the three `<textarea>`s
   with `<RichTextField>`, and pass `isDark` through to `TagField` as
   already done (no visual change required there beyond what `TagField`
   already does, unless a quick pass to align its input border radius/size
   with the new look is trivial — optional polish, not required).
4. Add `kickoffSaveStatus: SaveStatus`, `kickoffLastSavedAt: Date | null`,
   `kickoffSaveError: string | null` state, plus a `lastKickoffSavedRef`
   holding the last-saved JSON string.
5. Update the kickoff autosave `useEffect`: compute the JSON string of the
   six kickoff fields, skip scheduling if unchanged from
   `lastKickoffSavedRef.current`, otherwise debounce as today but set
   `"saving"` before the fetch and branch to `"saved"`/`"error"` after,
   updating `lastKickoffSavedRef.current` on success.
6. Import `SaveIndicator` from `@/components/onboarding/save-indicator` and
   render it in the Kickoff step's heading row (next to `step.name` /
   description, mirroring where `form-engine.tsx` places it in its sticky
   header) — only when `step.key === "kickoff"`.
7. Manually verify in the browser: typing in each rich text field updates
   state, formatting buttons work, autosave fires ~2s after the last
   keystroke and the indicator transitions idle → saving → saved, reloading
   the page re-populates the rich text fields with the previously saved
   HTML, and no Tiptap SSR/hydration console warnings appear.

## Acceptance Criteria

- [ ] Kickoff step's `seniorContact`, `websiteUrl` inputs and the three
      rich text fields visually match the `Field`/border/focus-glow
      language from `_content.tsx`, correctly themed in both light and dark
      (`isDark` prop) without any `dark:` Tailwind variants introduced.
- [ ] `directAccess`, `businessFacts`, `customerData` render as a Tiptap
      rich text editor with a working Bold/Italic/Underline/Bullet-List
      toolbar; content persists as HTML in `wizard_data.kickoff.*` and
      reloads correctly on page refresh.
- [ ] A `SaveIndicator` is visible on the Kickoff step and accurately
      reflects idle/saving/saved(+timestamp)/error state as the user types,
      without flashing "saving" on initial page load when nothing changed.
- [ ] `storage-kb` step and all other steps are visually/functionally
      unchanged.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new warnings/errors in the touched file.
- [ ] No new packages added to `package.json`.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then manually exercise the Kickoff step per Implementation Step 7
```

## Compatibility Touchpoints

- None — no packaging, docs, adapters, or install surface impact. No DB
  migration needed (`wizard_data` is untyped JSONB). No API route contract
  change.

## Implementation Notes

### What Changed
- Restyled the Kickoff step's `Senior contact` and `Current website URL`
  inputs to the `Field`-style visual language from `_content.tsx`
  (`rounded-[9px]`, `border-[1.5px]`, focus glow using the real `--color-brand`
  token `rgba(51,88,244,0.1)`), via new isDark-aware, Kickoff-scoped style
  constants (`kickoffLabelCls`, `kickoffInputCls`) that don't touch the
  shared `inputBase`/`labelCls` used by other steps.
- Added a local `RichTextField` component (Tiptap `StarterKit` +
  Bold/Italic/Underline/Bullet-List toolbar) and replaced the three
  `directAccess`/`businessFacts`/`customerData` `<textarea>`s with it.
  Content is stored/loaded as HTML in the same `wizard_data.kickoff.*` keys.
- Split the original combined "Senior contact + direct access" label into
  two separate fields — `Senior contact` (input) and `Direct access notes`
  (rich text) — since the rich text field needs its own label; this is a
  small, low-risk clarity improvement over the original shared-label
  grouping.
- Added `kickoffSaveStatus`/`kickoffLastSavedAt`/`kickoffSaveError` state and
  a `lastKickoffSavedRef` (seeded with the initially-loaded payload's JSON)
  to the existing kickoff autosave `useEffect`, so it skips scheduling when
  nothing changed (no "saving" flash on mount/reload) and drives a real
  `SaveIndicator` (imported as-is from the public onboarding form) rendered
  next to the Kickoff step heading.

### Files Changed
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — all
  changes described above; the only file touched, per the task's scope.

### Deviations From Plan
- Tiptap v3's `StarterKit` already bundles `Underline` internally (unlike
  the v2-era API that `tasks-tab.tsx`'s existing editor was written
  against). Passing `@tiptap/extension-underline` separately, as the task
  doc's code context suggested mirroring from `tasks-tab.tsx`, produced a
  runtime "Duplicate extension names found: ['underline']" warning
  (confirmed live in the browser console). Fixed by using `[StarterKit]`
  only in the new `RichTextField` — `toggleUnderline()`/`isActive("underline")`
  still work since StarterKit provides the mark. `tasks-tab.tsx` itself was
  left untouched (out of scope) and still has this latent warning.
- Split "Senior contact + direct access" into two separately-labeled fields
  instead of one shared label (see above) — required by RichTextField
  needing its own label; not visually or functionally regressive.

### Follow-up Fix (post-review)
- User caught that `TagField`'s ("Competitor / reference URLs") input and
  "Add" button were left on the old `rounded-lg`/1px-border style and never
  got the Field-language restyle applied to the rest of the Kickoff step.
  Fixed: `TagField`'s label, input (now matches `kickoffInputCls`:
  `rounded-[9px]`, `border-[1.5px]`, focus glow), and "Add" button
  (`rounded-[9px]`, `py-[11px]` to align height with the taller input) now
  match the rest of the step. `TagField` is only used in this one spot in
  the codebase, so this was a safe, contained restyle.
- While re-verifying in the browser, a stray click during coordinate
  testing accidentally cycled the "Mark 'Kickoff'" deliverable checkbox
  through in_progress → done → back to pending — caught immediately via
  screenshot and manually cycled back to its original "Pending" state before
  finishing. No lasting data change.
- User reported the Bullet List toggle activated (button highlighted) but
  typed bullets showed no visible marker. Root cause: Tailwind v4's
  preflight resets `ul`/`ol` to `list-style: none`, so Tiptap's `<ul><li>`
  output rendered with no bullet even though the list *structure* was
  correct. Fixed by adding
  `[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5`
  to `RichTextField`'s `editorProps.attributes.class`. Verified live: bullet
  markers now render for both new and previously-saved list content.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors)
- `pnpm lint` — PASS (no warnings/errors)
- Manual browser verification (existing dev server on :3000, Acme Testing
  Co Website project, Kickoff step) — PASS:
  - Field styling matches the target rounded/bordered/focus-glow look in
    light mode.
  - Rich text editors accept input, Bold formatting applies and persists
    (verified via full page reload — text stayed bold).
  - `Senior contact` plain input also persists across reload.
  - `SaveIndicator` stayed idle ("Waiting to save…") on page load with
    unchanged data (no flash), transitioned to "Draft auto-saved at …"
    after editing and the 2s debounce elapsed.
  - Browser console clean after fix — no Tiptap duplicate-extension
    warning, no SSR/hydration errors, no exceptions.
  - Dark mode (`isDark`) styling was verified by code inspection only (no
    in-app theme toggle was found during manual testing) — the new classes
    follow the identical `isDark ? "..." : "..."` pairing already used
    throughout this file for every other themed element, so risk is low.
  - `storage-kb` step and the deliverables checklist were not touched and
    were not re-tested beyond visual confirmation they render unchanged.
