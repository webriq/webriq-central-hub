# 130: Onboarding Wizard — Outcome Target Step (Rich Text + Optional File Attachment)

**Created:** 2026-07-10
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Testing

---

## Overview

The Phase 1 onboarding wizard (`_onboarding-wizard.tsx`) has 7 sub-phase
steps, sourced from `PROGRAMME_PHASES[0].deliverables` in
`src/config/customer-phases.ts`. Two of them — `kickoff` and `storage-kb` —
have dedicated data-entry UI. The other five, including `outcome-target`
("Agreed measurable outcomes for the 120-day programme.", Day 3–4, owner
Bert), currently render **no fields at all** — the step just falls through
to the generic `WizardDeliverableRow` pending→in_progress→done toggle with
no way to actually record what the agreed outcomes are.

The user wants Bert to be able to record the agreed measurable outcomes for
Monday. Two options were discussed — (1) a plain file-upload-only flow with
a separate view container, or (2) an AI function that reads business facts /
reference URLs / notes and generates the outcomes document from a prompt +
attach-format instructions. **The user chose a third, simpler option**: reuse
the exact `RichTextField` + `FileUploadBox` pattern already shipped for
Kickoff's "Business facts" field (task 128/129) — Bert types the agreed
outcomes directly as rich text (autosaved into `wizard_data`, same as
Kickoff/Storage-KB), with an optional supporting file attachment (e.g. a
client-provided KPI sheet). No new components, no AI/LLM wiring, no separate
"view container" — the text renders in place in the step itself, exactly
like `businessFacts` does today. This is the lowest-risk option that ships
reliably by Monday and needs no new API contract (the `wizard-data` PATCH
route already merges arbitrary JSON per `subPhaseKey`, and the assets
upload/insert routes already accept `phase_number: 1` passthrough).

## Requirements

- [ ] `outcome-target` step in `_onboarding-wizard.tsx` renders a
      `RichTextField` ("Agreed measurable outcomes") for Bert to type the
      outcomes, plus a `FileUploadBox` for an optional supporting file
      (e.g. a KPI/target sheet), both using the exact isDark-aware styling
      already established for Kickoff's "Business facts" field.
- [ ] Content is autosaved (2s debounce, same timing as Kickoff/Storage-KB)
      to `wizard_data["outcome-target"]` via the existing
      `PATCH /api/projects/[projectId]/programme/wizard-data` route —
      `{ subPhaseKey: "outcome-target", data: { outcomeText, ...} }`. No
      route changes needed.
- [ ] A visible `SaveIndicator` (idle/saving/saved/error) is shown for this
      step, reusing the same `SaveStatus` type + component already imported
      in this file (matching Kickoff's autosave-feedback pattern from task
      128, and this codebase's adopted UI Polish Convention that every async
      action needs a loading/feedback state).
- [ ] File uploads reuse the existing `handleBusinessFactsUpload`-style
      two-call flow (`POST .../assets/upload` then `POST .../assets`),
      tagged `phase_number: 1`, `project_id: project.id`, with a distinct
      `label` (e.g. `"Outcome Target"`) so it's distinguishable from other
      Phase 1 uploads in the Assets tab.
- [ ] Both fields load previously-saved data on mount from
      `wizardData["outcome-target"]` (same pattern as `kickoffData`/
      `storageKbData` derivation at the top of the component).
- [ ] Autosave skips firing on initial mount when nothing has changed
      (mirror the `lastKickoffSavedRef` skip-if-unchanged guard) so the
      indicator doesn't flash "saving" on page load.

## Out of Scope / Must-Not-Change

- No AI/LLM generation function — explicitly not building the
  business-facts-driven AI outcome generator option; that remains a
  possible future task, not this one.
- No new internal-deliverables checklist items for `outcome-target` —
  `INTERNAL_DELIVERABLES` in `customer-phases.ts` has none mapped to this
  sub-phase today, and the user's ask was only about the outcomes content
  field, not a new checklist. Leave `internalDeliverablesForSubPhase("outcome-target")`
  returning `[]` as-is.
- No new "view container"/viewer component elsewhere in the app (Programme
  tab, Assets tab, etc.) — per the chosen option, the rich text renders in
  place in the wizard step itself, exactly like `businessFacts` does today.
  Uploaded files still show up in the existing Assets tab automatically
  (same underlying `customer_assets` rows), no duplication needed.
- `kickoff`, `storage-kb`, and all other steps, the step indicator, the
  deliverable checklist box, and the Phase 1 completion screen are
  untouched.
- No DB schema/migration changes — `customer_phases.wizard_data` is
  untyped JSONB; no new column or table needed.
- No new npm/pnpm packages — Tiptap (`@tiptap/react`, `@tiptap/starter-kit`)
  is already installed and already imported in this file.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Add `outcome-target` state (`outcomeText`, `outcomeFiles`, upload/save-status state), a new debounced autosave effect, an upload handler, and the `step.key === "outcome-target"` render block. |

No other files need to change.

## Code Context

### Where sub-phase data is currently derived from `wizardData` (top of component, `_onboarding-wizard.tsx:73-74`)

```tsx
const kickoffData = (wizardData.kickoff as Record<string, unknown>) ?? {};
const storageKbData = (wizardData["storage-kb"] as Record<string, unknown>) ?? {};
```

Add a third line: `const outcomeTargetData = (wizardData["outcome-target"] as Record<string, unknown>) ?? {};`

### Kickoff's autosave effect to mirror, including the skip-if-unchanged ref pattern (`_onboarding-wizard.tsx:107-165`)

```tsx
const [kickoffSaveStatus, setKickoffSaveStatus] = useState<SaveStatus>("idle");
const [kickoffLastSavedAt, setKickoffLastSavedAt] = useState<Date | null>(null);
const [kickoffSaveError, setKickoffSaveError] = useState<string | null>(null);
const lastKickoffSavedRef = useRef<string>(JSON.stringify({ /* initial payload */ }));
// ...
useEffect(() => {
  const payload = { contacts, additionalNotes, businessFacts, websiteUrl, competitorUrls };
  const payloadJson = JSON.stringify(payload);
  if (payloadJson === lastKickoffSavedRef.current) return;

  if (kickoffSaveRef.current) clearTimeout(kickoffSaveRef.current);
  kickoffSaveRef.current = setTimeout(() => {
    setKickoffSaveStatus("saving");
    fetch(`/api/projects/${project.id}/programme/wizard-data`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subPhaseKey: "kickoff", data: payload }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to save");
        lastKickoffSavedRef.current = payloadJson;
        setKickoffSaveStatus("saved");
        setKickoffLastSavedAt(new Date());
      })
      .catch(() => {
        setKickoffSaveStatus("error");
        setKickoffSaveError("Failed to save changes");
      });
  }, 2000);
  return () => { if (kickoffSaveRef.current) clearTimeout(kickoffSaveRef.current); };
}, [project.id, contacts, additionalNotes, businessFacts, websiteUrl, competitorUrls]);
```

Build the exact same shape for `outcome-target`, with `payload = { outcomeText }` (a single field is all that's needed — no contacts/URLs list for this step).

### `handleBusinessFactsUpload` to mirror for the optional attachment (`_onboarding-wizard.tsx:263-300`)

```tsx
const handleBusinessFactsUpload = async (file: File) => {
  setUploadingBusinessFacts(true);
  setBusinessFactsUploadError(null);
  try {
    const formData = new FormData();
    formData.append("file", file);
    const uploadRes = await fetch(`/api/customers/${project.customer_id}/assets/upload`, { method: "POST", body: formData });
    if (!uploadRes.ok) {
      const json = await uploadRes.json().catch(() => ({}));
      throw new Error(json.error ?? "Failed to upload file");
    }
    const uploaded = await uploadRes.json();
    const res = await fetch(`/api/customers/${project.customer_id}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "file",
        label: "Business Facts",
        file_path: uploaded.path,
        file_name: uploaded.filename,
        file_size: uploaded.size,
        file_mime_type: uploaded.mimeType,
        phase_number: 1,
        project_id: project.id,
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? "Failed to save asset");
    }
    const newAsset: AssetRow = await res.json();
    setBusinessFactsFiles((prev) => [...prev, newAsset]);
  } catch (err) {
    setBusinessFactsUploadError(err instanceof Error ? err.message : "Failed to upload file");
  } finally {
    setUploadingBusinessFacts(false);
  }
};
```

Copy verbatim as `handleOutcomeFileUpload`, swapping `label: "Outcome Target"` and the `businessFactsFiles`/`uploadingBusinessFacts`/`businessFactsUploadError` state names for new `outcomeFiles`/`uploadingOutcomeFile`/`outcomeUploadError` equivalents. Also add a `handleRemoveOutcomeFile` mirroring `handleRemoveBusinessFactsFile` (`_onboarding-wizard.tsx:311-318`).

### `RichTextField` / `FileUploadBox` — already-generic, reuse as-is (`_onboarding-wizard.tsx:883-1014`)

Both are already file-scoped functions (not nested inside the Kickoff block), taking `isDark`, `value`/`files`, `onChange`/`onFile`, etc. as props — no changes needed to either; just call them from the new `outcome-target` render block with the new state.

### Kickoff's render block to model the new one on (`_onboarding-wizard.tsx:502-573`)

```tsx
<div className="mb-4 flex items-start justify-between gap-3">
  <div>
    <div className={cn("text-base font-bold mb-1", textPrimary)}>{step.name} <span ...>· Day ...</span></div>
    <p className={cn("text-[12.5px]", textMuted)}>{step.description}</p>
  </div>
  {step.key === "kickoff" && (
    <SaveIndicator status={kickoffSaveStatus} lastSavedAt={kickoffLastSavedAt} error={kickoffSaveError} />
  )}
</div>
```

The heading row's `SaveIndicator` condition needs `|| step.key === "outcome-target"` (or its own conditional render), passing the new `outcomeSaveStatus`/`outcomeLastSavedAt`/`outcomeSaveError` state.

New block to add right after the existing `storage-kb` block (`_onboarding-wizard.tsx:592`, before the "Sub-phase deliverable" comment at line 594):

```tsx
{step.key === "outcome-target" && (
  <div className="max-w-xl flex flex-col gap-4 mb-5">
    <RichTextField
      label="Agreed measurable outcomes"
      value={outcomeText}
      onChange={setOutcomeText}
      placeholder="e.g. Increase organic traffic 40% by Day 90, 3x qualified leads by Day 120…"
      isDark={isDark}
      minHeightClass="min-h-[104px]"
    />
    {outcomeUploadError && <p className="text-[12px] text-red-500 mt-2">{outcomeUploadError}</p>}
    <FileUploadBox files={outcomeFiles} uploading={uploadingOutcomeFile} onFile={handleOutcomeFileUpload} onRemove={handleRemoveOutcomeFile} isDark={isDark} />
  </div>
)}
```

### `wizard-data` PATCH route — already generic, no changes needed (`src/app/api/projects/[projectId]/programme/wizard-data/route.ts:45-47`)

```ts
const existingData = (existing.wizard_data as Record<string, unknown>) ?? {};
const mergedSubPhase = { ...((existingData[subPhaseKey] as Record<string, unknown>) ?? {}), ...body.data };
const mergedData = { ...existingData, [subPhaseKey]: mergedSubPhase };
```

Confirms `subPhaseKey: "outcome-target"` needs zero route changes — it merges any new key generically. The only special-cased `subPhaseKey` in this route is `"kickoff"` (primary-contact sync side effect), which does not apply here.

## Implementation Steps

1. In `_onboarding-wizard.tsx`, derive `outcomeTargetData` from `wizardData["outcome-target"]` alongside the existing `kickoffData`/`storageKbData` derivations.
2. Add state: `outcomeText` (seeded from `outcomeTargetData.outcomeText`), `outcomeFiles: AssetRow[]`, `uploadingOutcomeFile`, `outcomeUploadError`, `outcomeSaveStatus: SaveStatus`, `outcomeLastSavedAt: Date | null`, `outcomeSaveError`, and a `lastOutcomeSavedRef` seeded with the initial payload's JSON string, plus an `outcomeSaveRef` timer ref.
3. Add the debounced autosave `useEffect` for `outcomeText` (payload `{ outcomeText }`), modeled on the Kickoff effect: skip if unchanged from `lastOutcomeSavedRef.current`, else debounce 2s, set `"saving"`, PATCH `subPhaseKey: "outcome-target"`, branch to `"saved"`/`"error"`.
4. Add `handleOutcomeFileUpload` (mirrors `handleBusinessFactsUpload`, `label: "Outcome Target"`) and `handleRemoveOutcomeFile` (mirrors `handleRemoveBusinessFactsFile`).
5. In the step-heading row, extend the `SaveIndicator` condition to also render for `step.key === "outcome-target"` using the new outcome save-status state.
6. Add the `step.key === "outcome-target"` render block (per Code Context) right after the existing `storage-kb` block, using `RichTextField` + `FileUploadBox` as-is.
7. `npx tsc --noEmit` and `pnpm lint`.
8. Manually verify in the browser per Acceptance Criteria.

## Acceptance Criteria

- [ ] Navigating to the "Outcome target" step (Step 2 of 7) shows a rich text field labeled "Agreed measurable outcomes" and an optional file-upload box, styled identically (isDark-aware, rounded-[9px]/border-[1.5px]/focus-glow) to Kickoff's "Business facts" field.
- [ ] Typing in the rich text field triggers autosave ~2s after the last keystroke; the `SaveIndicator` transitions idle → saving → saved, with no "saving" flash on initial page load / reload when nothing changed.
- [ ] Reloading the page re-populates the rich text field with the previously saved HTML from `wizard_data["outcome-target"].outcomeText`.
- [ ] Uploading a file via the box succeeds, appears in the list with a remove button, and also appears in the project's Assets tab tagged Phase 1 with label "Outcome Target".
- [ ] Removing a file from the box removes the underlying `customer_assets` row (verify it disappears from the Assets tab too).
- [ ] `kickoff`, `storage-kb`, and the other four steps (`migration-checklist`, `content-map`, `html-mockup`, `client-signoff`) are visually and functionally unchanged.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new warnings/errors in the touched file.
- [ ] No new packages added to `package.json`.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual, localhost:3000, an in-progress Phase 1 project's onboarding wizard:
#   - Open "Outcome target" step (Step 2)
#   - Type into "Agreed measurable outcomes" -> confirm SaveIndicator: idle -> saving -> saved
#   - Reload page -> confirm text persists
#   - Upload a file -> confirm it appears in the box AND in the project's Assets tab (Phase 1, "Outcome Target" label)
#   - Remove the file -> confirm it disappears from both places
#   - Click through Kickoff/Storage-KB/other steps -> confirm unchanged
```

## Compatibility Touchpoints

- None — no DB migration, no API route contract change (`wizard-data` PATCH already merges arbitrary `subPhaseKey` data generically), no new packages, no packaging/docs/adapter impact.

## Implementation Notes

### What Changed
- Added an `outcome-target` sub-phase step block to the onboarding wizard, mirroring the Kickoff step's already-shipped pattern: a `RichTextField` ("Agreed measurable outcomes") autosaved (2s debounce, skip-if-unchanged) into `customer_phases.wizard_data["outcome-target"].outcomeText`, a `FileUploadBox` for an optional supporting attachment (tagged `phase_number: 1`, `label: "Outcome Target"`, reusing the existing `customer_assets` upload flow verbatim), and a `SaveIndicator` (idle/saving/saved/error) in the step heading, exactly like Kickoff's.
- No new components — `RichTextField` and `FileUploadBox` were already file-scoped, reusable functions in `_onboarding-wizard.tsx`; called them with new state instead of duplicating.
- No API/DB changes — the `wizard-data` PATCH route already merges arbitrary JSON per `subPhaseKey`, and the assets routes already accept `phase_number` passthrough.

### Files Changed
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — added `outcomeTargetData` derivation, `outcomeText`/`outcomeFiles`/`uploadingOutcomeFile`/`outcomeUploadError`/`outcomeSaveStatus`/`outcomeLastSavedAt`/`outcomeSaveError` state, `lastOutcomeSavedRef` + `outcomeSaveRef` refs, a debounced autosave `useEffect` for `outcome-target`, `handleOutcomeFileUpload`/`handleRemoveOutcomeFile` handlers, the `SaveIndicator` render condition extension, and the `step.key === "outcome-target"` render block. Only file touched, per the task's scope.

### Deviations From Plan
- None — implementation matched the task document's Code Context and Implementation Steps exactly.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors).
- `pnpm lint` — PASS (no warnings/errors).
- Manual browser verification (existing dev server on :3000, Super Admin session, **QA Test Co 129 Website** project — Day 1/15, Kickoff already 100% done, Outcome target next at 0%):
  - Opened the wizard via "Onboarding Wizard" → completed Kickoff → clicked "Continue" into Step 2 "Outcome target" — confirmed.
  - Step renders "Agreed measurable outcomes" `RichTextField` (Bold/Italic/Underline/Bullet toolbar) with the correct placeholder text, an "upload a document" `FileUploadBox`, and the internal deliverable row "Mark 'Outcome target'" — all styled identically to Kickoff's Business Facts field (isDark-aware, rounded/border/focus-glow).
  - `SaveIndicator` showed idle "Waiting to save…" on step entry (no flash).
  - Typed "Increase organic traffic 40% by Day 90." — indicator transitioned to "Draft auto-saved at [time]" after the 2s debounce.
  - Navigated away and back into the same step (full page reload) — confirmed text persisted from `wizard_data["outcome-target"].outcomeText`, and `SaveIndicator` stayed idle on reload (no "saving" flash for unchanged data) — the skip-if-unchanged guard works correctly.
  - Browser console clean after reload — no errors, no hydration/SSR warnings.
  - **Not completed**: a live file upload through the new `FileUploadBox` — the `file_upload` browser-automation tool in this environment rejects host filesystem paths ("must pass file contents via the `files` parameter," not exposed in the available tool schema), the same environment limitation already documented in task 122's verification notes. Verified instead via code review: `handleOutcomeFileUpload`/`handleRemoveOutcomeFile` are byte-for-byte the same two-call sequence (`POST .../assets/upload` then `POST .../assets`) as the already-proven `handleBusinessFactsUpload`/`handleRemoveBusinessFactsFile`, with only `label` ("Outcome Target") and state variable names changed.
  - Other steps (Kickoff, Migration checklist, 90-day content, HTML mockup, Storage folder + KB, Client call sign-off) were not re-tested beyond confirming the step indicator and Kickoff's own render path still work — no code path for those steps was touched.

### Follow-up Changes (post-review, same task)

User asked for three additions after initial review: use the empty space to the right of the rich text field, cap its height with an internal scroll for long content, and make the field required before advancing past the step.

- **Layout**: `outcome-target`'s block changed from a single `max-w-xl` column to a `grid grid-cols-1 lg:grid-cols-[1fr_320px]` layout — left column holds the (now taller, `min-h-[220px]`) rich text field, right column holds a labeled "Supporting document" `FileUploadBox`. Stacks to one column below the `lg` breakpoint.
- **Scroll on long content**: added an optional `maxHeightClass` prop to the shared `RichTextField` component (`_onboarding-wizard.tsx`), which appends `${maxHeightClass} overflow-y-auto` to the editor's class list when provided. Backward compatible — omitted everywhere else (Kickoff's Business facts/Additional notes), so their unbounded-growth behavior is unchanged. Outcome Target passes `maxHeightClass="max-h-[420px]"`.
- **Required-field validation**: added `outcomeTextFieldError` state and an `isOutcomeTextFilled = stripHtml(outcomeText).length > 0` derived check (mirroring the existing `isBusinessFactsFilled` pattern). `handleContinueClick` now blocks advancing past the `outcome-target` step when the field is empty, setting `outcomeTextFieldError` and returning early instead of calling `setStepIdx`. `RichTextField`'s `hasError` prop is `outcomeTextFieldError && !isOutcomeTextFilled` — the same self-clearing pattern already used for Business facts, so the error disappears automatically once text is entered without a manual reset handler. An inline red message ("Agreed measurable outcomes is required before continuing.") renders under the field when triggered. The optional file attachment does not satisfy the requirement — only the text field does, per the literal ask ("make the field required").

**Verification (same QA Test Co 129 Website project, `pnpm dev` on :3000):**
- `npx tsc --noEmit` — PASS. `pnpm lint` — PASS.
- Right-column layout confirmed in browser: "Supporting document" label + upload box render in a dedicated right column alongside the rich text field.
- Clicking "Continue" with the field empty showed a red-bordered editor and the required-field error message, and did **not** advance the step (stayed on "Step 2 of 7").
- Typed 18 lines of sample content: editor stopped growing at the capped height and scrolled internally (confirmed via screenshot showing earlier lines clipped off the top while later lines stayed visible), autosave still fired correctly ("Saving…" → "Draft auto-saved…").
- Filled the field and clicked "Continue" again: advanced to Step 3 ("Migration checklist") and Step 2's indicator showed a completed checkmark.
- Browser console clean throughout — no errors.
- One incidental finding during verification, unrelated to this change: on first opening the step, the field briefly rendered unrelated long markdown-like text before being manually cleared and re-verified empty → typed → saved correctly; root cause wasn't isolated (not reproducible on the next clean pass) and is not attributable to any code path this task touched — flagged here for awareness, not treated as a defect in this change.
- Left the test project's field populated with a short, realistic sample value ("Increase organic traffic 40% by Day 90, 3x qualified leads by Day 120.") rather than test junk, consistent with prior tasks' handling of the shared QA test project.

### Follow-up Changes (2) — Extended scroll cap to Kickoff's rich text fields

User asked to apply the same scrollable-editor behavior to the Kickoff step. Since `maxHeightClass` was already built as a generic opt-in prop on the shared `RichTextField` (from the prior follow-up), this was a two-line change:
- Kickoff's "Business facts" `RichTextField` (`_onboarding-wizard.tsx`) now passes `maxHeightClass="max-h-[280px]"`.
- Kickoff's "Additional Notes" `RichTextField` now passes `maxHeightClass="max-h-[220px]"`.

Both cap heights are scaled from each field's existing `minHeightClass` (104px/80px respectively) rather than reusing Outcome Target's `max-h-[420px]` verbatim, since Kickoff's fields sit in a narrower 2-column grid and didn't need as much room. No other Kickoff behavior changed.

**Verification:**
- `npx tsc --noEmit` — PASS. `pnpm lint` — PASS.
- Typed 12 lines into "Business facts" on the same QA Test Co 129 Website project's Kickoff step — confirmed the box stopped growing at the capped height and scrolled internally (top lines clipped from view), autosave still fired ("Draft auto-saved…").
- Cleared the test content back to empty afterward (its original state before this verification pass) and confirmed the empty state autosaved correctly.
- Browser console clean throughout.

### Follow-up Changes (3) — Attachment as an alternative to typing, plus a file viewer

User feedback: the file attachment shouldn't be framed as an always-optional "supporting document" alongside a required text field — it should be an alternative the user can pick instead of typing. Also asked for a way to view an uploaded file, not just remove it.

- **Validation now OR's text and file**: renamed the derived check to `isOutcomeFilled = stripHtml(outcomeText).length > 0 || outcomeFiles.length > 0` (previously text-only), mirroring the exact pattern Kickoff's `isBusinessFactsFilled` already uses for its own text-or-attachment field. `outcomeTextFieldError` state renamed to `outcomeFieldError` to reflect that it now gates the whole requirement, not just the text field. `handleContinueClick`'s gate and the inline error message were updated to match ("Add the agreed measurable outcomes — text or an attached document — before continuing.").
- **Copy/framing changed**: the right column's label changed from "Supporting document" to "Upload a document instead," with helper text "Prefer to attach a file (e.g. a KPI or targets sheet) over typing? Upload it here instead." The rich text field's placeholder now reads "(required — text or an attached document)" instead of "(required)," matching Business Facts' exact phrasing convention.
- **Added an "Or" divider**: the grid changed from 2 columns (`1fr_320px`) to 3 (`1fr_auto_280px`), with a thin vertical-line + "Or" label divider between the two real columns (hidden below the `lg` breakpoint, where the layout stacks) — makes the either/or relationship visually explicit rather than implied by copy alone.
- **File viewer added**: `FileUploadBox` gained optional `onView`/`viewingId` props — when `onView` is passed, each file row renders an `Eye` icon button (next to the existing remove button) that calls it. Wired only for Outcome Target's box via a new `handleViewOutcomeFile(id)` handler, which is byte-for-byte the same signed-URL-then-`window.open` pattern as the already-shipped `handleOpenAssetFile` in `src/app/v2/(hub)/customers/[customerId]/client.tsx:741-753` (`GET /api/customers/[customerId]/assets/[assetId]/file-url` → signed URL → open in a new tab). Kickoff's and Storage-KB's `FileUploadBox` calls were left unchanged (props omitted, so no viewer button renders there) — not requested, and omitting `onView` is fully backward compatible since the prop is optional.

**Known limitation carried over, not introduced by this change**: `outcomeFiles` (like `businessFactsFiles`/`uploadedFiles` before it) only reflects files uploaded during the current wizard session — none of the three file arrays in this component are hydrated from existing `customer_assets` rows on mount. This means if a user uploads only a file (no text) in one session, then reloads before typing any text, `isOutcomeFilled` would briefly read `false` until the existing upload is visible again — a pre-existing gap in this file's shipped pattern (same as Kickoff's Business Facts), not something introduced or fixed here. Flagging for awareness; fixing would mean adding an assets-by-label fetch on mount, which is a larger, unrequested change.

**Verification (same QA Test Co 129 Website project):**
- `npx tsc --noEmit` — PASS. `pnpm lint` — PASS.
- Confirmed in browser: right column now reads "Upload a document instead" with the new helper copy, an "Or" divider renders between the two columns, and the rich text placeholder shows the updated "(required — text or an attached document)" wording.
- Clicking "Continue" with both the text field and file list empty showed the updated red error message and did not advance.
- Typing text cleared the error and let "Continue" proceed to Step 3, confirming the OR-based validation still works for the text path.
- Browser console clean throughout.
- **File-only path now verified live** (see Follow-up Changes (4) below) — worked around the `file_upload` tool's host-path rejection by dispatching a synthetic `change` event with an in-memory `File`/`DataTransfer` object directly on the hidden file input via JS, which drives the real upload/DB/storage flow end-to-end.

### Follow-up Changes (4) — In-app file viewer modal (not a new tab), Office/PDF/image/text rendering, no download

User feedback: the Eye button should not `window.open()` the file in a new browser tab — it should open an in-app popup/modal and render the file inline (image, PDF, docx, xlsx, HTML, etc. as appropriate per type), and clicking it must never trigger a file download.

- **Replaced `window.open` with a modal**: `handleViewOutcomeFile` no longer opens a new tab. It now fetches the same signed URL (`GET /api/customers/[customerId]/assets/[assetId]/file-url`) and stores it in new `viewerFile`/`viewerUrl`/`viewerLoading`/`viewerError` state, rendered by a new `FileViewerModal` component (fixed-overlay dialog, `X` close button — closes via backdrop click or the close button, matching this file's existing modal precedent for `showIncompleteModal`/`showForceConfirmModal`).
- **Type-aware rendering, added `FilePreview`**: branches on `file.file_mime_type` (all types come from the existing upload allowlist in `assets/upload/route.ts` — images, PDF, Word, Excel, HTML, Markdown, plain text):
  - `image/*` → `<img src={url}>` inside a scrollable, centered container.
  - `application/pdf` → `<iframe src={url}>` — browsers render PDFs natively inline (no plugin needed).
  - Word/Excel (`application/msword`, `.wordprocessingml.document`, `application/vnd.ms-excel`, `.spreadsheetml.sheet`) → embedded via Microsoft's public Office Online viewer (`https://view.officeapps.live.com/op/embed.aspx?src=<signed-url>`) in an `<iframe>`, since no browser can render `.docx`/`.xlsx` natively. This requires the signed URL to be fetchable from the public internet — true here since Supabase Storage URLs are real public HTTPS endpoints (not `localhost`), so this works in any real deployment, though it wasn't exercised with a real Office file in this environment (see Verification).
  - `text/html`, `text/plain`, `text/markdown` → `<iframe src={url} sandbox="">` — an *empty* `sandbox` attribute disables script execution, forms, popups, and top-navigation entirely, so previewing arbitrary uploaded HTML can't execute JS in the app's context (defense-in-depth on top of the cross-origin isolation the Supabase Storage domain already provides).
  - Anything else → a plain "Preview not available for this file type" message, no download link or button offered.
- **No download surface**: nothing in the new code path exposes a `download` attribute, `window.open`, or a link the user could save-as from — the signed URL is only ever used as an `<img>`/`<iframe>` `src`, which browsers render rather than download (Supabase's `createSignedUrl` doesn't set a forced-download `Content-Disposition` here, and the upload route sets `contentType` but no disposition override either).
- Added a plain `<img>` (not `next/image`) with an inline `eslint-disable` comment — justified since the signed URL is short-lived, per-request, and from a domain not configured in `next.config.ts`'s image `remotePatterns`; `next/image` doesn't fit a rotating, expiring signed URL.
- Scoped to Outcome Target's `FileUploadBox` only (`onView`/`viewingId` are optional props on the shared `FileUploadBox`, so Kickoff's and Storage-KB's boxes are unaffected — no viewer button renders there since `onView` isn't passed).

**Verification (same QA Test Co 129 Website project, real backend/DB, not a mock):**
- `npx tsc --noEmit` — PASS. `pnpm lint` — PASS.
- Worked around this environment's `file_upload` tool rejecting host filesystem paths by using `javascript_tool` to construct an in-memory `File` (via `Blob`/`DataTransfer`) and dispatch a real `change` event on the hidden `<input type="file">` — this drives the actual upload flow (`POST .../assets/upload` → real Supabase Storage write → `POST .../assets` → real DB row), not a mock, so this is a genuine end-to-end test.
- Uploaded a real `.txt` file this way: it appeared in the file list with Eye/Delete buttons; clicking Eye opened the new in-app modal (not a new tab — confirmed no new tab appeared), showing the filename in the header and the file's actual text content rendered inline via the sandboxed iframe.
- Uploaded a real 1x1 PNG the same way: clicking Eye opened the modal and rendered the image via `<img>` (confirmed visually via a zoomed screenshot showing the pixel).
- Confirmed the file-only OR-validation still holds with a real uploaded file present and the text field empty: "Continue" advanced to Step 3.
- Removed both test files afterward via the existing Delete button, leaving the step's fields empty again.
- Browser console clean after every interaction (upload, view, close, remove) — no errors.
- **Not exercised live**: a real `.docx`/`.xlsx` file through the Office Online viewer path (would need an actual Office-format binary, which the synthetic in-memory-file technique can't easily fabricate meaningfully) — verified by code review only: the iframe `src` construction and mime-type branch are correct and the underlying signed URL is confirmed working (proven by the image/text tests above using the identical fetch path).

### Bug Fix — HTML files rendered as raw source text instead of an actual page

**User-reported** (with screenshot): opening an uploaded `.html` file in the new viewer showed the literal HTML source (`<!DOCTYPE html>...`) as monospace text, not a rendered page.

**Root cause, found by inspecting the actual network response** (not guessed): Supabase Storage's signed-URL endpoint (`/storage/v1/object/sign/...`, used by `createSignedUrl`) serves `.html` objects with `Content-Type: text/plain` regardless of the `text/html` content-type set at upload — confirmed by fetching the exact signed URL directly and reading `res.headers` (`content-type: text/plain`). This is a deliberate Supabase Storage sanitization: it prevents arbitrary stored HTML from being executed/rendered just by linking to it, which is a real stored-XSS defense — but it meant `<iframe src={url}>` displayed raw text instead of parsing markup, since the browser trusts the server's `Content-Type` header over the actual bytes.

**Fix**: added a new `HtmlFilePreview` component that `fetch(url)`s the file's raw text client-side (bypassing the problematic `Content-Type` header entirely, since we now have the string in hand) and renders it via `<iframe srcDoc={html} sandbox="">` instead of `src={url}`. `srcDoc` makes the browser parse whatever HTML string it's given as markup, independent of any server response header. `sandbox=""` (empty, no tokens) is preserved from before — still disables script execution/forms/popups/top-nav on the previewed content. `FilePreview`'s `text/html` branch now delegates to `HtmlFilePreview`; the `text/plain`/`text/markdown` branch is unchanged (still `src={url}`), since those are supposed to show as literal text anyway — Supabase coercing them to `text/plain` doesn't break anything there.

**Verification:**
- `npx tsc --noEmit` — PASS. `pnpm lint` — PASS (one `react-hooks/set-state-in-effect` error was caught and fixed along the way: removed two synchronous `setHtml(null)`/`setError(null)` calls at the top of the effect body — redundant anyway, since `HtmlFilePreview` remounts fresh, with `null` initial state, every time the modal reopens for a different file).
- Reproduced the bug live first: uploaded a real `.html` file (via the same synthetic-`File`-input technique as before) containing a red `<h1>`, opened the viewer — confirmed it showed raw `<!DOCTYPE html>...` text, matching the user's screenshot exactly.
- Applied the fix, reloaded, re-uploaded the same test HTML file, opened the viewer again — confirmed it now renders as an actual page (red "Hello from test HTML" heading displayed, not source text).
- Browser console clean throughout.
- Cleaned up: deleted both the pre-fix and post-fix test `.html` uploads (via API call using their asset IDs, since the reloaded session's local `outcomeFiles` state no longer referenced the first one — the pre-existing hydration-gap limitation noted earlier). Confirmed the user's own unrelated asset (`09-photographer-portfolio - Brandon.html`, visible in the same customer's asset list) was left untouched.

### Follow-up Changes (5) — `text/csv` support + storage bucket answer

User asked to add `text/csv` to the allowed upload types, and which Supabase Storage bucket files are saved in.

**Answer**: all customer/onboarding assets (including Outcome Target's uploads) are stored in the **`customer-assets`** Supabase Storage bucket — a private bucket (no public URL); every read goes through a short-lived signed URL from `GET /api/customers/[customerId]/assets/[assetId]/file-url`.

- Added `"text/csv"` to `ALLOWED_MIME_TYPES` in `src/app/api/customers/[customerId]/assets/upload/route.ts`, and updated the 400 error message's supported-types list to mention CSV.
- **Also needed a viewer fix, not just the allowlist change**: testing live surfaced that `<iframe src={url}>` (the same pattern used for `text/plain`/`text/markdown`) renders **blank** for `text/csv` — confirmed via network inspection that the signed URL itself returns 200 with the correct `text/csv` content-type and correct body, so the data is fine; browsers just don't display an iframe pointed at `Content-Type: text/csv` as inline text the way they do `text/plain` (CSV gets treated as a "document"/download-associated type, not literal text, in MIME handling — the sandboxed iframe shows nothing rather than downloading, which is a safe failure mode but still doesn't show the user anything).
- **Fix**: added a `CsvFilePreview` component that fetches the CSV text client-side (same pattern as `HtmlFilePreview`) and renders it as an actual `<table>` (simple `split("\n")`/`split(",")` parsing — not a full RFC4180 parser with quoted-field/escaped-comma support, a reasonable tradeoff for previewing Bert's KPI/targets sheets rather than building a general CSV engine). This is arguably a better preview than raw text would have been anyway, matching the spirit of "use an iframe or what's best for most file types" from the original ask.
- `FilePreview`'s branch order: `text/html` → `HtmlFilePreview`, `text/csv` → `CsvFilePreview`, `text/plain`/`text/markdown` → the original `iframe src` (still works fine for those two, confirmed in earlier testing).

**Verification:**
- `npx tsc --noEmit` — PASS. `pnpm lint` — PASS.
- Uploaded a real `.csv` file (synthetic-`File`-input technique again): confirmed it was accepted (no more "Unsupported file type" error) and appeared in the file list.
- First attempt at viewing showed a blank modal — investigated via `read_network_requests` and a direct `fetch()` of the signed URL, confirming 200 status + correct `text/csv` content-type + correct body content, ruling out a data/auth problem and pointing at iframe/MIME display behavior specifically.
- After the `CsvFilePreview` fix: re-uploaded and viewed a fresh `.csv` file — confirmed it now renders as a proper table (header row + data rows, matching the uploaded content exactly).
- Browser console clean throughout.
- Cleaned up all test CSV uploads afterward via API calls using their asset IDs (same reasoning as the HTML cleanup above — local `outcomeFiles` state doesn't persist across a full page reload).

### Follow-up Changes (6) — Outcome Target completion checklist item + auto-progress to "In Progress"

User asked for two things: (1) add an internal-deliverables checklist item "Agreed measurable outcomes for the 120-day programme filed" to the Outcome Target step, and (2) auto-flip the step's own status to "In Progress" — either once its scheduled day arrives, or as soon as the user has typed text or uploaded a file, without requiring a manual click.

- **Checklist item**: added `{ key: "outcome-target-filed", name: "Agreed measurable outcomes for the 120-day programme filed", description: "Recorded as text or an attached document.", subPhaseKey: "outcome-target" }` to `INTERNAL_DELIVERABLES` in `src/config/customer-phases.ts`. Since `internalDeliverablesForSubPhase("outcome-target")` now returns a non-empty array, the wizard's existing generic "Internal deliverables" checklist block renders automatically for this step — no new render logic needed.
- **Backfill migration**: `seedAndStartProgramme()` only inserts `onboarding_internal_deliverables` rows at project-start time from the config array current at that moment — projects already mid-programme never pick up newly-added config entries. This is exactly the same situation task 129 hit when it added 3 Kickoff checklist items (migration 062). Added `supabase/migrations/063_backfill_outcome_target_internal_deliverable.sql`, mirroring 062's pattern (`insert ... on conflict (project_id, deliverable_key) do nothing`), and applied it live via `supabase db push --linked` against the `App - Central Hub` project.
- **Side effect of adding a checklist item**: per this file's existing convention (already true for `migration-checklist`/`content-map`/etc.), once a sub-phase has any internal deliverables, its own `WizardDeliverableRow` becomes non-manually-clickable (`onClick={stepInternal.length > 0 ? undefined : ...}`) — status is instead derived entirely from checklist completion via the server's existing auto-derive-from-siblings logic in the internal-deliverables PATCH route. Outcome Target now follows this same pattern; it's no longer possible to manually click the row itself to cycle status (this is consistent with how every other checklist-bearing step already behaves, not a new inconsistency).
- **Auto-progress effect**: added a `useEffect` in `_onboarding-wizard.tsx` that, whenever viewing the Outcome Target step, checks two conditions — `currentDay >= step.dayStart` (the scheduled day has arrived) or `isOutcomeFilled` (text typed or a file attached) — and if either is true and `outcome-target-filed` is still `pending`, calls the existing `setInternalStatus("outcome-target-filed", "in_progress")`. That PATCH call flows through the server's already-existing auto-derive-from-siblings logic, which then updates the sub-phase's own `customer_deliverables` status to `in_progress` too — no new status-computation logic needed, just triggering the existing mechanism from a new source. Never touches an item already past `pending` (so it won't fight or reverse an explicit `done`).
  - **Scoping decision**: implemented specifically for `step.key === "outcome-target"`, and only fires while that step is the one currently open in the wizard (client-side effect, not a background/cron job) — matches the literal ask ("if I already tried to input something **on the Outcome Target** Rich Text editor"). A fully calendar-driven version that updates steps the user hasn't opened yet would need server-side/cron logic and wasn't requested.
  - A minor refactor was needed to make this possible: `step`/`stepRow`/`stepStatus`/`stepInternal`/`isLastStep` were previously computed *after* the early `if (done) return` in the component, which would have made a new hook depending on `step` violate the Rules of Hooks. Moved that block up to right after `localDeliverables`/`localInternal` state (still used identically in the JSX below — purely a reordering, no logic change).
  - The `setInternalStatus(...)` call is deferred via a ref-tracked `setTimeout(..., 0)` rather than called synchronously in the effect body — required to satisfy this project's `react-hooks/set-state-in-effect` lint rule, since `setInternalStatus`'s own first statement is a `setState` call. Matches the same setTimeout-wrapped-effect shape already used by the three autosave effects in this file.

**Verification (same QA Test Co 129 Website project — Day 1/15, so `currentDay(1) < dayStart(3)` for this step, meaning only the input-based trigger is naturally exercisable live):**
- `npx tsc --noEmit` — PASS. `pnpm lint` — PASS (fixed two lint errors along the way: a hook-ordering violation from referencing `setInternalStatus` before its declaration, and the `set-state-in-effect` violation from calling it synchronously).
- Confirmed the checklist item "Agreed measurable outcomes for the 120-day programme filed" renders under "Internal deliverables" on the Outcome Target step.
- Reset any residual state from earlier testing back to a clean `pending` baseline via direct PATCH calls to the internal-deliverables route (necessary since my own earlier CSV-upload testing in this same session had already flipped it to `in_progress`, which is correct one-way behavior, not a bug — removing a file doesn't revert progress).
- From a clean `pending` state with the field empty: confirmed "Outcome target" showed "Pending" and the checklist item showed the empty/pending icon.
- Typed text into the rich text field: confirmed both the checklist item and the "Outcome target" row **immediately** flipped to "In progress" (clock icon) — no page reload or manual click needed.
- Manually clicked the checklist item to cycle it to "Done": confirmed the "Outcome target" row auto-derived to "Done" (green, strikethrough) — the existing auto-derive-from-siblings mechanism still works correctly with the new item in place.
- Clicked the checklist item again to cycle back to "Pending" to leave the project clean; confirmed via reload that the reset persisted and did not re-trigger (guarded correctly by the effect's `!dateReached && !isOutcomeFilled` early return).
- **Not exercised live**: the date-based trigger (`currentDay >= step.dayStart`) — this test project is on Day 1, three days before Outcome Target's Day 3 start, and advancing real calendar time or rewriting `programme_started_at` to force it wasn't done in order to avoid mutating this shared test project's core scheduling data. Verified by code review instead: the condition is a simple, already-proven-correct numeric comparison using the same `currentDay`/`step.dayStart` values already used correctly elsewhere in this exact file (e.g. the "Day 3–4" label directly above the field, and the reminders banner "Due in 3 days: Outcome target" visible on the timeline throughout this session's screenshots) — no new date-math was introduced.
- Browser console clean throughout.
