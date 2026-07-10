# 129: Kickoff Step Finalization — Multi-Contact Field, Business Facts Attachments, Validated Completion Checklist & Two-Column Layout

**Created:** 2026-07-10
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

Finalize the internal onboarding wizard's Kickoff step
(`_onboarding-wizard.tsx`, `step.key === "kickoff"`), building on top of task
128 (styling + rich text editor + autosave indicator, currently in Testing).
This task changes the Kickoff **data shape** and **completion semantics**,
which task 128 explicitly left untouched:

1. Remove the "Customer data" field entirely. (Future work, out of scope
   here: that data becomes a `credential`-type `customer_assets` row living
   in the Storage/KB step — `customer_assets.type` already supports
   `"credential"`, no schema change needed for that later migration.)
2. Replace the single "Senior contact" input with a repeatable **Contacts**
   list (name/position/email/phone/social, add/remove rows, first row =
   Primary Contact).
3. Rename "Direct access notes" → "Additional Notes" (same field, broadened
   label/scope — decided during planning, see Q&A below).
4. Add file-attachment capability to "Business Facts" (required field,
   satisfied by text OR an attachment).
5. Add URL validation to "Current website URL" and "Competitor / reference
   URLs".
6. Add a 3-item completion checklist ("Kickoff meeting held", "Contacts
   confirmed", "Goals/timeline/details filed") that gates the Kickoff
   step's own status — reusing the **existing**
   `onboarding_internal_deliverables` mechanism (task 127), not a bespoke
   one.
7. Two-column layout for the Kickoff step so it uses the wide empty space
   to the right of the current `max-w-xl` column.
8. Sync the primary contact to `customers.contact_name` / `contact_email`
   on every kickoff autosave.
9. On Phase 1 hand-off (`complete-phase` route, `phase_number === 1`),
   write the collected contacts into the `contacts` table (requires a
   migration — see below).

### Planning Q&A (resolved before writing this doc)

| Question | Decision |
|---|---|
| Contacts storage | JSON in `wizard_data.kickoff.contacts` during onboarding; **on Phase 1 hand-off**, bulk-insert into the `contacts` table. Requires making `contacts.external_id` nullable (migration) — it's `not null unique` today, tied to Zoho Desk imports (migrations 056/058). Manually-entered contacts get `external_id: null`, `match_method: 'manual'` (already an allowed value per the existing check constraint). |
| Primary contact → `customers` sync | Yes — sync `contacts[0]`'s name + email to `customers.contact_name` / `customers.contact_email` on every kickoff autosave (not just on hand-off), inside the existing `wizard-data` PATCH route. |
| Completion checklist mechanism | Reuse `onboarding_internal_deliverables` (task 127's exact precedent: `WizardDeliverableRow` already renders read-only + "Status is derived automatically from the checklist below" once `stepInternal.length > 0`, and the internal-deliverable PATCH route already auto-derives the parent `customer_deliverables` row's status from all sibling checklist items). Requires 3 new `INTERNAL_DELIVERABLES` config entries with `subPhaseKey: "kickoff"`, plus a one-off backfill migration for projects already in progress (`seed.ts` only inserts internal deliverable rows at project creation). |
| "Additional Notes" vs "Direct access notes" | Rename — one field, not two. State var and `wizard_data` key renamed from `directAccess`/`.directAccess` to `additionalNotes`/`.additionalNotes`. Safe: this key is only read/written inside this one file and merged generically by the `wizard-data` PATCH route (no other consumer — confirmed via grep in task 128's research, still true, nothing new reads `wizard_data.kickoff` besides this file). |

## Requirements

### Data shape (`wizard_data.kickoff`)
- [ ] Remove `customerData` key/field entirely (drop the `RichTextField` for
      it and its state).
- [ ] Remove `seniorContact` key; replace with `contacts: ContactEntry[]`
      where `ContactEntry = { fullName: string; position: string; email: string; phone: string; socialMedia: string }`.
      `socialMedia` is a single free-text string (comma-separated accounts,
      per the user's spec — not parsed into an array).
- [ ] Rename `directAccess` → `additionalNotes` (same rich text field,
      relabeled "Additional Notes", helper text "Leave blank if none").
- [ ] `businessFacts` stays as-is (rich text), now also required — see
      validation below.
- [ ] `websiteUrl`, `competitorUrls` stay, now URL-validated.

### First column — Contacts, Website, Competitors
- [ ] New local `ContactsField` component (follows this file's existing
      "inline small components" convention, same interaction shape as
      `TagField`: an add button appends a blank contact row, each row has a
      remove button). Fields per contact: Full Name (required, non-empty),
      Position (optional), Email (required, validated
      `/^\S+@\S+\.\S+$/` — same pattern already used in `_content.tsx`),
      Phone (optional, validated if non-empty — lenient pattern, e.g.
      `/^[+\d][\d\s\-().]{6,19}$/`), Social Media Account(s) (optional,
      free-text, helper text "separate multiple with commas").
- [ ] The first contact row is visually labeled "Primary Contact" (small
      badge/pill), matching the `customers.contact_name`/`contact_email`
      sync target.
- [ ] "Current website URL": optional; helper text "Leave blank if none";
      if non-empty, must parse as an absolute URL (`new URL(v)` succeeds
      with `http:`/`https:` protocol) — inline error if not, don't block
      typing, just show the message and don't autosave an invalid value as
      "valid" (still saves as-is; validation is a UI hint + a completion
      gate, not a hard input blocker — see Compatibility Touchpoints).
- [ ] "Competitor / reference URLs" (`TagField`, already exists): validate
      each entry with the same URL check before it's added to the tag list;
      show inline error and don't add invalid entries (don't clear the
      input either, so the user can fix and retry).

### Second column — Business Facts, Additional Notes
- [ ] "Business Facts" rich text editor gets a file upload affordance
      (reuse the existing `handleUpload`/`FileUploadBox` pattern already
      used by the `storage-kb` step, pointed at a **new, separate** local
      state `businessFactsFiles` and uploaded with
      `label: "Business Facts"` instead of `label: "Documents"` so the two
      upload lists stay distinguishable in `customer_assets`. Matches this
      codebase's existing (documented) limitation: uploaded-files lists are
      session-local, not fetched from the DB on mount — consistent with
      how `storage-kb`'s `uploadedFiles` already behaves, not a new gap).
  - Required field: satisfied by EITHER non-empty text (HTML stripped of
    tags is non-empty) OR at least one uploaded file.
- [ ] "Additional Notes" (renamed `directAccess`): optional, helper text
      "Leave blank if none".

### Layout
- [ ] Kickoff step's field container becomes a responsive two-column grid
      (`grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4`) instead of the
      current `max-w-xl flex flex-col gap-4`. Column 1: Contacts → Website
      URL → Competitor URLs. Column 2: Business Facts (+ attachments) →
      Additional Notes. Other steps (`storage-kb`, etc.) are untouched —
      they keep their own `max-w-xl` single-column layout.

### Completion checklist
- [ ] Add 3 entries to `INTERNAL_DELIVERABLES` in `customer-phases.ts` with
      `subPhaseKey: "kickoff"`:
      `kickoff-meeting-held` ("Kickoff meeting held"),
      `kickoff-contacts-confirmed` ("Contacts confirmed"),
      `kickoff-goals-timeline-filed` ("Goals, timeline and other important
      details filed", description noting it's satisfied by Business
      Facts/meeting notes).
- [ ] This automatically makes `stepInternal.length > 0` true for kickoff,
      which (via existing, unmodified logic) makes the top `WizardDeliverableRow`
      read-only with its status auto-derived from the 3 checklist items —
      exactly the "once all are checked, Kickoff completes" behavior
      requested, with **zero changes** needed to that derivation logic
      (task 127 already built it generically).
- [ ] Client-side validation gate on two of the three checklist toggles,
      intercepting the click before calling the existing
      `setInternalStatus`/API, not by touching the shared PATCH route:
  - `kickoff-contacts-confirmed` can only move to `"done"` if
    `contacts.length > 0` and every contact has a non-empty `fullName` and
    a valid `email`. Otherwise show an inline error
    ("Add at least one contact with a name and valid email before
    confirming contacts.") and do not call the API.
  - `kickoff-goals-timeline-filed` can only move to `"done"` if Business
    Facts is filled (text or attachment, per above). Otherwise show
    ("Fill in Business Facts — text or an attached document — before
    marking this done.").
  - `kickoff-meeting-held` has no field dependency — cycles freely like
    every other internal deliverable elsewhere in the app.
  - Only the transition *into* `"done"` is gated; cycling
    pending→in_progress, or done→pending (unchecking), is never blocked.

### Backend
- [ ] `wizard-data` PATCH route: when `subPhaseKey === "kickoff"` and the
      merged `contacts` array has ≥1 entry with a non-empty email, update
      `customers.contact_name` (`fullName`) and `customers.contact_email`
      (`email`) for `contacts[0]`, keyed by the project's `customer_id`.
      Non-fatal — log and continue (don't fail the wizard-data save) if
      this secondary update errors.
- [ ] `complete-phase` route: when `phase_number === 1` completes
      (existing `onboarding_visible_at` branch), read
      `customer_phases.wizard_data.kickoff.contacts` for this project and
      bulk-insert into `contacts` with `external_id: null`,
      `match_method: 'manual'`, `customer_id` = the project's
      `customer_id`, `first_name`/`last_name` split from `fullName` on the
      first space, `email`, `phone`, `title` = `position`,
      `source_meta: { social_media_accounts: contact.socialMedia }` (only
      if non-empty). Skip contacts with no email (shouldn't happen given
      the UI validation, but the checklist gate is a UI convention, not a
      DB constraint — defend against it). Non-fatal — log and continue if
      this insert errors; it must not block the phase-completion response.

### DB Migrations
- [ ] `alter table contacts alter column external_id drop not null;` — new
      migration file, next available number.
- [ ] Backfill migration: for every existing row in
      `onboarding_internal_deliverables`'s parent scope (i.e. every
      `project_id` that already has *any* `onboarding_internal_deliverables`
      row, meaning its programme was already seeded), insert the 3 new
      `kickoff-*` keys if missing, using
      `insert ... select ... on conflict (project_id, deliverable_key) do nothing`
      against `unique (project_id, deliverable_key)`.

## Out of Scope / Must-Not-Change

- Migrating the removed "Customer data" content into a `credential`-type
  `customer_assets` row on the Storage/KB step — future work.
- Blocking the "Continue" step-navigation button based on Kickoff
  completion — no step currently gates navigation; this task doesn't add
  it. Bert can still navigate between all 7 steps freely regardless of
  checklist state.
- Any UI for editing/reconciling imported Zoho Desk `contacts` rows against
  manually-entered onboarding contacts — the two `contacts` sources
  (Desk import `match_method: 'account_name'` vs onboarding
  `match_method: 'manual'`) are not deduplicated against each other by this
  task. Two rows for the same real person (one from each source) is an
  accepted, documented limitation, not a bug to fix here.
- `storage-kb` step and all other steps — layout, fields, and behavior
  unchanged.
- Fetching previously-uploaded `customer_assets` files on mount for either
  `storage-kb`'s or the new Business-Facts upload list — both stay
  session-local, matching the existing (pre-task-128) limitation.
- Any new npm/pnpm packages.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Remove Customer Data; add `ContactsField`; rename Direct access notes → Additional Notes; two-column layout; URL validation; Business Facts attachments; checklist validation gating |
| `src/config/customer-phases.ts` | Modify | Add 3 `INTERNAL_DELIVERABLES` entries with `subPhaseKey: "kickoff"` |
| `src/app/api/projects/[projectId]/programme/wizard-data/route.ts` | Modify | Sync primary contact to `customers.contact_name`/`contact_email` on kickoff save |
| `src/app/api/projects/[projectId]/programme/complete-phase/route.ts` | Modify | On Phase 1 hand-off, bulk-insert kickoff contacts into `contacts` table |
| `supabase/migrations/0XX_contacts_external_id_nullable.sql` | Create | `alter table contacts alter column external_id drop not null` |
| `supabase/migrations/0XX_backfill_kickoff_internal_deliverables.sql` | Create | Backfill the 3 new checklist rows for already-in-progress projects |

Use `ls supabase/migrations | tail -1` at implementation time to confirm the
next free migration number (060 was the latest at planning time).

## Code Context

### `_onboarding-wizard.tsx` — current Kickoff field block (post task-128, to replace)

```tsx
{step.key === "kickoff" && (
  <div className="max-w-xl flex flex-col gap-4 mb-5">
    <div>
      <label className={kickoffLabelCls}>Senior contact</label>
      <input value={seniorContact} onChange={(e) => setSeniorContact(e.target.value)} ... />
    </div>
    <RichTextField label="Direct access notes" value={directAccess} onChange={setDirectAccess} ... />
    <RichTextField label="Business facts" value={businessFacts} onChange={setBusinessFacts} ... />
    <div><label className={kickoffLabelCls}>Current website URL</label><input value={websiteUrl} ... /></div>
    <TagField label="Competitor / reference URLs" tags={competitorUrls} ... />
    <RichTextField label="Customer data" value={customerData} onChange={setCustomerData} ... />
  </div>
)}
```
`kickoffLabelCls`/`kickoffInputCls`/`RichTextField`/`TagField` all already
exist (task 128) and should be reused as-is for the new fields — only the
layout wrapper and field set change.

### `_onboarding-wizard.tsx` — kickoff autosave effect (extend payload shape, keep debounce/status logic)

```tsx
useEffect(() => {
  const payload = { seniorContact, directAccess, businessFacts, websiteUrl, competitorUrls, customerData };
  const payloadJson = JSON.stringify(payload);
  if (payloadJson === lastKickoffSavedRef.current) return;
  // ... setTimeout, setKickoffSaveStatus("saving"), fetch PATCH wizard-data ...
}, [project.id, seniorContact, directAccess, businessFacts, websiteUrl, competitorUrls, customerData]);
```
New payload: `{ contacts, additionalNotes, businessFacts, websiteUrl, competitorUrls }`.
Update `lastKickoffSavedRef`'s initial seed (currently built from
`kickoffData.*` at mount) to match the new field set/keys.

### `_onboarding-wizard.tsx` — storage-kb's existing file upload pattern to mirror for Business Facts

```tsx
const [uploadedFiles, setUploadedFiles] = useState<AssetRow[]>([]);
const [uploading, setUploading] = useState(false);
const [uploadError, setUploadError] = useState<string | null>(null);

const handleUpload = async (file: File) => {
  // POST /api/customers/{customer_id}/assets/upload (multipart) → { path, filename, size, mimeType }
  // then POST /api/customers/{customer_id}/assets { type: "file", label: "Documents", file_path, file_name, file_size, file_mime_type, phase_number: 1, project_id }
  // setUploadedFiles(prev => [...prev, newAsset])
};
// ...
<FileUploadBox files={uploadedFiles} uploading={uploading} onFile={handleUpload} isDark={isDark} />
```
For Business Facts, duplicate this shape with its own state
(`businessFactsFiles`/`uploadingBusinessFacts`/`businessFactsUploadError`)
and `label: "Business Facts"` in the second POST body — don't share state
with `storage-kb`'s upload list.

### `_onboarding-wizard.tsx` — checklist rendering (already generic, no changes needed here beyond the onClick handler)

```tsx
<WizardDeliverableRow
  name={step.name} description={step.description} owner={step.owner}
  status={stepStatus} isDark={isDark} toggling={togglingKey === step.key}
  onClick={stepInternal.length > 0 ? undefined : () => setDeliverableStatus(step.key, cycle(stepStatus))}
/>
{stepInternal.length > 0 && (
  <div className="mt-2.5 pt-2.5 border-t border-dashed border-slate-200 flex flex-col gap-1.5">
    {stepInternal.map((id) => {
      const row = localInternal.find((r) => r.deliverable_key === id.key);
      const iStatus = row?.status ?? "pending";
      return (
        <button key={id.key} onClick={() => setInternalStatus(id.key, cycle(iStatus))} ...>
          {/* icon + name, strikethrough when done */}
        </button>
      );
    })}
  </div>
)}
```
Once the 3 `kickoff-*` config entries exist, `stepInternal` for kickoff is
non-empty automatically (`internalDeliverablesForSubPhase("kickoff")`), so
this whole block starts rendering the checklist with **no JSX changes** —
only the `onClick` needs a kickoff-aware wrapper (e.g.
`handleKickoffInternalToggle(id.key, iStatus)`) that validates before
calling `setInternalStatus` for the two gated keys, and falls through to
the existing `setInternalStatus(id.key, cycle(iStatus))` call otherwise
(including for every non-kickoff step, unchanged).

### `internal-deliverables/[deliverableKey]/route.ts` — existing auto-derive-parent-status logic (do not modify; this is why the checklist mechanism reuse works for free)

```ts
const siblingKeys = internalDeliverablesForSubPhase(internalConfig.subPhaseKey).map((d) => d.key);
const { data: siblings } = await supabase.from("onboarding_internal_deliverables").select("status")
  .eq("project_id", projectId).in("deliverable_key", siblingKeys);
const statuses = siblings?.map((s) => s.status) ?? [];
const allDone = statuses.length > 0 && statuses.every((s) => s === "done");
const anyStarted = statuses.some((s) => s !== "pending");
const computedStatus = allDone ? "done" : anyStarted ? "in_progress" : "pending";
// ... updates customer_deliverables row for subPhaseKey "kickoff" to computedStatus
```

### `customer-phases.ts` — where to add the 3 new entries

```ts
export const INTERNAL_DELIVERABLES: InternalDeliverableConfig[] = [
  { key: "implementation-file", name: "Implementation file", description: "...", subPhaseKey: "migration-checklist" },
  // ... existing 8 entries ...
];
```
Append (order doesn't matter, `internalDeliverablesForSubPhase` filters by
`subPhaseKey`):
```ts
{ key: "kickoff-meeting-held", name: "Kickoff meeting held", description: "A structured kickoff call took place with the client.", subPhaseKey: "kickoff" },
{ key: "kickoff-contacts-confirmed", name: "Contacts confirmed", description: "At least one verified client contact is on file.", subPhaseKey: "kickoff" },
{ key: "kickoff-goals-timeline-filed", name: "Goals, timeline and other important details filed", description: "Captured in Business Facts / meeting notes.", subPhaseKey: "kickoff" },
```

### `seed.ts` — why new projects get the checklist for free, existing ones need the backfill migration

```ts
const internalDeliverableRows = INTERNAL_DELIVERABLES.map((d) => ({
  project_id: project.id,
  deliverable_key: d.key,
}));
// ... adminClient.from("onboarding_internal_deliverables").insert(internalDeliverableRows)
```
This inserts **all** `INTERNAL_DELIVERABLES` config entries (project-wide,
not per-phase) at programme start — so any project created *after* this
task ships gets the 3 new kickoff rows automatically. Projects already
mid-programme (like the "Acme Testing Co Website" test project) need the
backfill migration.

### `contacts` table (migration 056, renamed by 058) — target for the hand-off insert

```sql
create table contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id text references customers(customer_id) on delete set null,
  external_id text unique not null,        -- ← migration in this task: drop not null
  external_account_id text,
  first_name text, last_name text, email text, secondary_email text,
  phone text, mobile text, title text,
  match_method text check (match_method in ('account_name', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_meta jsonb default '{}'
);
```
RLS: `contacts_pm_write` policy allows `admin|super_admin|pm` — note this
does **not** include `marketing` (Bert's role). The `complete-phase` route
already uses `adminClient` for its `projects` visibility update in the
same handler, so use `adminClient` for the contacts insert too (bypasses
RLS, consistent with the existing pattern in this same file for
session-less/role-mismatched server-side writes).

### `wizard-data/route.ts` — where to add the customers sync (after the existing merge/update, before returning)

```ts
const { data, error } = await supabase.from("customer_phases").update({ wizard_data: mergedData })
  .eq("project_id", projectId).eq("phase_number", 1).select("wizard_data").single();
if (error) { /* existing error handling */ }
// NEW: if subPhaseKey === "kickoff", look up projects.customer_id, then
// update customers.contact_name/contact_email from contacts[0] (non-fatal on error)
return NextResponse.json(data);
```

## Implementation Steps

1. `customer-phases.ts`: append the 3 new `INTERNAL_DELIVERABLES` entries.
2. Migrations: create the `external_id` nullable migration and the
   backfill migration (check `ls supabase/migrations | tail -1` for the
   next number first).
3. `_onboarding-wizard.tsx` state: remove `seniorContact`/`customerData`;
   rename `directAccess`→`additionalNotes`; add
   `contacts: ContactEntry[]` (seeded from `kickoffData.contacts ?? []`,
   default to a single empty row if the array is empty so the form always
   shows at least one row to fill in); add `businessFactsFiles`/
   `uploadingBusinessFacts`/`businessFactsUploadError`; add
   `contactsValidationError`/`businessFactsValidationError` (or a single
   `checklistValidationError` string) for the inline gate messages.
4. Update the kickoff autosave effect's payload shape and
   `lastKickoffSavedRef` seed to match.
5. Add `ContactsField` local component (mirrors `TagField`'s add/remove
   interaction, but each "tag" is a small card with 5 sub-inputs instead
   of a single string) — validates email/phone inline per row, shows
   "Primary Contact" badge on index 0.
6. Add a small `isValidUrl(v: string): boolean` helper (top of file or
   inline) using `new URL(v)` in a try/catch, requiring `http:`/`https:`.
   Wire it into the website URL field (inline error, non-blocking) and
   `TagField`'s `onAdd` callback for competitor URLs (reject invalid
   entries instead of adding them).
7. Add `handleBusinessFactsUpload` mirroring `handleUpload` but posting
   `label: "Business Facts"` and updating `businessFactsFiles`.
8. Rewrite the Kickoff step's JSX block: `grid grid-cols-1 lg:grid-cols-2
   gap-x-8 gap-y-4` wrapper, column 1 (`ContactsField`, website URL,
   competitor `TagField`), column 2 (`RichTextField` "Business Facts" +
   `FileUploadBox` for `businessFactsFiles`, `RichTextField` "Additional
   Notes"). Remove the Customer Data `RichTextField` entirely.
9. Add `handleKickoffInternalToggle(key, currentStatus)`: computes the
   target status via the existing `cycle()`, and if the target is `"done"`
   and `key === "kickoff-contacts-confirmed"` or
   `"kickoff-goals-timeline-filed"`, runs the relevant validation first —
   on failure, set the inline error state and return without calling
   `setInternalStatus`; on pass (or for any other transition/key), call
   `setInternalStatus(key, target)` as today. Wire this into the
   `stepInternal.map(...)` button's `onClick` **only when
   `step.key === "kickoff"`** (other steps keep calling
   `setInternalStatus(id.key, cycle(iStatus))` directly, unchanged).
10. `wizard-data/route.ts`: after the successful `customer_phases` update,
    if `subPhaseKey === "kickoff"` and `mergedSubPhase.contacts?.[0]?.email`
    is truthy, fetch `projects.customer_id` for `projectId` and update
    `customers` (`contact_name`, `contact_email`) — wrap in try/catch,
    log-and-continue on failure, still return the original `data` response.
11. `complete-phase/route.ts`: inside the existing `if (phaseNumber === 1)`
    block, after the visibility update succeeds, fetch
    `customer_phases.wizard_data` for `phase_number = 1` on this project,
    read `.kickoff.contacts`, map to `contacts` table rows (split
    `fullName`, `external_id: null`, `match_method: 'manual'`,
    `source_meta` for social media), and `adminClient.from("contacts").insert(rows)`
    — skip contacts with no email; wrap in try/catch, log-and-continue,
    don't fail the phase-completion response on error.
12. Manually verify in the browser (existing dev server, Acme Testing Co
    Website project): two-column layout renders correctly in both
    isDark states (code-review the paired classes as task 128 did, since
    no in-app theme toggle was found then either); add 2+ contacts,
    reorder isn't needed but removal must work; URL validation rejects
    `"not a url"` and accepts `"https://example.com"`; Business Facts
    attachment satisfies the "Goals/timeline" checklist gate even with
    empty text; the "Contacts confirmed" and "Goals/timeline" checklist
    items refuse to check when their required data is missing (inline
    error shown) and succeed once filled; once all 3 are checked, the top
    "Mark Kickoff" row flips to read-only "Done" automatically (no manual
    click needed); confirm `customers.contact_name`/`contact_email`
    updated after a kickoff autosave (spot-check via a quick query or the
    customer profile page); confirm no console errors/regressions on
    `storage-kb` and other steps.

## Acceptance Criteria

- [ ] Customer Data field is gone from the Kickoff step; no `customerData`
      references remain in the touched files.
- [ ] Contacts: add/remove works, first row is labeled Primary Contact,
      email/phone validate inline, at least one contact with a valid email
      is required before "Contacts confirmed" can be checked.
- [ ] Website URL and Competitor URLs reject non-URL input with an inline
      message; valid URLs are accepted and saved.
- [ ] Business Facts: text or an attached file satisfies the "Goals/timeline"
      checklist requirement; attaching a file works end-to-end
      (upload → `customer_assets` row → visible in the file list).
- [ ] Additional Notes field is the renamed Direct access notes field —
      existing saved content for in-progress projects (if any) still loads
      correctly under the new key (verify against the test project used in
      task 128, which has saved `directAccess` content already — decide at
      implementation time whether to read the old key as a fallback for
      already-saved data, since renaming the key means old data under
      `directAccess` won't automatically appear under `additionalNotes`;
      flag this as a real migration nuance to resolve during
      implementation, likely by reading
      `kickoffData.additionalNotes ?? kickoffData.directAccess ?? ""` at
      mount so existing data isn't silently lost).
- [ ] Kickoff's own status row becomes read-only once the 3 checklist items
      exist, and automatically shows "Done" only when all 3 are checked —
      no manual top-level completion click possible or needed anymore.
- [ ] `customers.contact_name`/`contact_email` reflect the first contact
      after a kickoff autosave.
- [ ] On Phase 1 hand-off, kickoff contacts appear in the `contacts` table
      with `external_id IS NULL`, `match_method = 'manual'`.
- [ ] Two-column layout renders correctly at desktop width; collapses to
      one column below `lg`.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.
- [ ] No new npm/pnpm packages.
- [ ] `storage-kb` and all other steps remain visually/functionally
      unchanged.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then manually exercise the Kickoff step per Implementation Step 12
```
Optionally spot-check the DB after testing:
```sql
select contact_name, contact_email from customers where customer_id = '<test customer id>';
select * from contacts where customer_id = '<test customer id>' and match_method = 'manual';
select deliverable_key, status from onboarding_internal_deliverables
  where project_id = '<test project id>' and deliverable_key like 'kickoff-%';
```

## Compatibility Touchpoints

- **DB migrations required** — this task cannot ship without applying both
  new migration files to the Supabase project before/alongside the code
  deploy (`contacts.external_id` nullable + the internal-deliverables
  backfill). Flag this explicitly to the user before merging; migrations
  are not auto-applied by this workflow.
- `contacts` table RLS (`contacts_pm_write`: `admin|super_admin|pm`) does
  not include `marketing` — the hand-off insert must use `adminClient`,
  not the session-scoped client, or it will silently fail under RLS for
  Bert's `marketing` role.
- Existing in-progress projects' already-saved `wizard_data.kickoff.directAccess`
  content needs a read-time fallback to the new `additionalNotes` key (see
  Acceptance Criteria) — this is a data-continuity nuance, not just a
  rename.
- No packaging/docs/adapter impact otherwise.

## Implementation Notes

### What Changed
- `customer-phases.ts`: added the 3 `kickoff-*` `INTERNAL_DELIVERABLES`
  entries (`kickoff-meeting-held`, `kickoff-contacts-confirmed`,
  `kickoff-goals-timeline-filed`).
- Two new migration files created (not applied — see below):
  `061_contacts_external_id_nullable.sql`,
  `062_backfill_kickoff_internal_deliverables.sql`.
- `src/types/database.ts`: `contacts` table's `Row`/`Insert`/`Update` types
  updated so `external_id` is `string | null` — a necessary companion to
  migration 061 that wasn't in the original file list (this file is
  apparently hand-maintained, not auto-regenerated from the live schema in
  this workflow), otherwise `tsc` fails on the new `complete-phase` insert.
  Flagged as a deviation below.
- `_onboarding-wizard.tsx`: removed `seniorContact`/`customerData` state
  and fields entirely; added `contacts: ContactEntry[]` state (seeded with
  one blank row when empty) and a new local `ContactsField` component
  (add/remove rows, per-row email/phone inline validation, "Primary
  Contact" badge on the first row with **no remove button** on that row —
  added per user feedback mid-implementation); renamed
  `directAccess`→`additionalNotes` with a read-fallback to the old key so
  already-saved content isn't lost; added `businessFactsFiles` upload
  state + `handleBusinessFactsUpload` (mirrors the existing `storage-kb`
  upload pattern, posts with `label: "Business Facts"` to keep the two
  upload lists distinguishable); added `isValidUrl`/`isValidEmail`/
  `isValidPhone`/`stripHtml` module-level helpers; wired URL validation
  into Website URL (on blur) and Competitor URLs (`TagField`'s `onAdd`,
  rejects without clearing input); added `handleKickoffInternalToggle`
  that gates the `kickoff-contacts-confirmed` and
  `kickoff-goals-timeline-filed` checklist items behind
  `isContactsValid`/`isBusinessFactsFilled` before allowing "done", only
  for `step.key === "kickoff"` (all other steps' checklist clicks are
  unchanged); rebuilt the Kickoff field block as a
  `grid grid-cols-1 lg:grid-cols-2` two-column layout.
- `wizard-data/route.ts`: after a successful kickoff save, if the merged
  `contacts[0]` has an email, looks up the project's `customer_id` and
  updates `customers.contact_name`/`contact_email` — wrapped in try/catch,
  non-fatal.
- `complete-phase/route.ts`: extended the `projects` select to include
  `customer_id`; inside the existing `phaseNumber === 1` visibility block,
  added a try/catch that reads `wizard_data.kickoff.contacts` and bulk
  inserts them into `contacts` via `adminClient` (`external_id: null`,
  `match_method: "manual"`, name split on first space, `title` = position,
  `source_meta.social_media_accounts` when present) — non-fatal, doesn't
  block the phase-completion response.
- Post-implementation follow-up fixes from live user feedback (same
  session): restyled `ContactsField`'s mini inputs and card container to
  match the rest of the Kickoff step's `rounded-[9px]`/`border-[1.5px]`/
  focus-glow Field language (they'd shipped with the older `rounded-lg`
  style); removed the "Remove" button from the Primary Contact row only;
  restyled "Add contact" to match `TagField`'s "Add" button, then — per a
  further follow-up — converted **both** buttons to icon-only outline
  squares (`Plus` icon only, no text label, `border-brand/25`-ish outline
  instead of solid `bg-brand` fill) so they read as secondary "add a row"
  actions rather than primary submit buttons; both got `title`/`aria-label`
  per the icon-only-buttons-need-aria-label convention.

### Files Changed
- `src/config/customer-phases.ts` — added 3 internal-deliverable config entries
- `supabase/migrations/061_contacts_external_id_nullable.sql` — created, not yet applied
- `supabase/migrations/062_backfill_kickoff_internal_deliverables.sql` — created, not yet applied
- `src/types/database.ts` — `contacts.external_id` typed nullable (see Deviations)
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — full Kickoff step rework
- `src/app/api/projects/[projectId]/programme/wizard-data/route.ts` — primary contact sync
- `src/app/api/projects/[projectId]/programme/complete-phase/route.ts` — hand-off contacts insert

### Deviations From Plan
- Updated `src/types/database.ts` for `contacts.external_id` — not in the
  task doc's Proposed File Changes list, but required for `tsc --noEmit` to
  pass (an explicit acceptance criterion) once the migration made that
  column nullable. Low-risk, additive-only type change.
- User asked mid-implementation (before full manual verification) to: (1)
  make `ContactsField`'s inputs/card visually consistent with the rest of
  the Kickoff Field styling, (2) remove the "Remove" button from the
  Primary Contact row, (3) restyle the "Add contact" button to match
  `TagField`'s "Add" button. All three applied and verified live in the
  browser; not explicitly specified in the original task doc but squarely
  within its "consistent Field styling" intent.
- Migrations were **not applied** to the database — user chose "I'll apply
  them myself" when asked. This means, until applied: the completion
  checklist's toggle actions will fail silently (no-op, confirmed
  gracefully — no crash, no console error) for `kickoff-*` keys on
  already-in-progress projects (their `onboarding_internal_deliverables`
  rows don't exist yet without migration 062); the Phase-1 hand-off
  contacts insert would fail under the `external_id NOT NULL` constraint
  without migration 061. Both are therefore **unverified end-to-end** —
  see Verification Run below.

### Verification Run
- `npx tsc --noEmit` — PASS (after every edit, final state clean)
- `pnpm lint` — PASS (after every edit, final state clean)
- Manual browser verification (existing dev server on :3000, "Acme Testing
  Co Website" project, Kickoff step) — PASS for everything not gated by
  the unapplied migrations:
  - Two-column layout renders correctly; Customer Data field fully gone.
  - `ContactsField` renders with Primary Contact badge, add/remove works,
    styling now matches the rest of the step (post follow-up fixes).
  - "Additional Notes" correctly shows the pre-existing content that was
    saved under the old `directAccess` key from task 128's testing —
    confirms the read-fallback works on real (not synthetic) data.
  - Website URL: typing an invalid value and blurring shows the inline
    "Enter a full URL starting with http:// or https://" error; clearing
    it removes the error.
  - Business Facts shows the pre-existing saved rich text plus the new
    upload box below it.
  - Autosave indicator transitions correctly (idle → saving → saved) when
    adding/removing a contact row.
  - Checklist (`Kickoff meeting held` / `Contacts confirmed` / `Goals,
    timeline...`) renders immediately (config-driven, doesn't need the DB
    backfill to *display*); clicking "Kickoff meeting held" without
    migration 062 applied fails gracefully — no visible change, no
    console error, no crash — confirming the existing
    `setInternalStatus`'s `if (!res.ok) return;` guard handles the missing
    DB row safely.
  - Console clean (no errors/warnings) across the full test pass.
- **NOT verified** (blocked on the user applying the two migrations):
  contacts-confirmed / goals-timeline-filed validation gating actually
  reaching "done" and auto-deriving the parent Kickoff row to "Done";
  `customers.contact_name`/`contact_email` sync (code-reviewed, not
  DB-spot-checked); Phase-1 hand-off writing rows into `contacts`. User
  should re-request verification (or run `/test 129`) after applying
  `061_contacts_external_id_nullable.sql` and
  `062_backfill_kickoff_internal_deliverables.sql`.

### Follow-up: internal-deliverable toggle semantics + seed-time status (post-implementation, same session)

User clarified two behaviors after the initial implementation was already
in Testing:

1. Clicking an internal-deliverable checklist item should directly toggle
   pending ↔ done — "in_progress" is reserved for the parent step/phase's
   own status (already auto-derived from the checklist), not something an
   individual checklist item sits in.
2. The Kickoff step should start as "In progress" automatically the moment
   a project's onboarding is started (`seedAndStartProgramme`), not sit at
   "Pending" until the first checklist item is touched.

**Changes:**
- Added `toggleInternalStatus` (`pending ↔ done`) in
  `_onboarding-wizard.tsx`, used by both the generic (non-kickoff)
  internal-deliverable `onClick` and `handleKickoffInternalToggle` (which
  still applies the same contacts/business-facts validation gate before
  allowing the transition to `"done"`). The pre-existing `cycle()`
  (`pending → in_progress → done → pending`) is untouched and still used
  for `WizardDeliverableRow`'s top-level click on steps that have **no**
  internal checklist (e.g. "Outcome target") — that's still legitimately a
  3-state, directly-clickable status.
- `src/lib/programme/seed.ts`: the `deliverableRows` builder now sets
  `status: "in_progress"` for `phase_number === 1 && deliverable_key === "kickoff"`
  (all other deliverables still default to `"pending"`, explicit now
  instead of relying on the DB column default). Prospective only — affects
  future "Start Onboarding" actions, not already-started projects.

**Verification:**
- Existing internal deliverable ("Implementation file" under "Migration
  checklist", which already had a real DB row from original project
  seeding, unaffected by the pending migration 062): clicked from Done →
  went straight to Pending (parent auto-derived to Pending too, no
  in_progress step observed) → clicked again → straight back to Done.
  Restored to its original Done state afterward.
- Created a real throwaway test project ("QA Test Co 129") via "Start
  onboarding (Day 1 now)" to verify the seed change on a fresh project
  (new projects aren't affected by the unapplied migrations, since
  `seedAndStartProgramme` inserts fresh `onboarding_internal_deliverables`
  rows itself). Confirmed: Kickoff showed **"In progress"** immediately on
  first load, with zero manual interaction. Clicked "Kickoff meeting held"
  → went straight to Done (no in_progress), parent stayed "In progress"
  correctly (not all 3 items done). Clicked "Contacts confirmed" with no
  contact filled in → correctly blocked with the inline validation error,
  confirming the gate logic survived the toggle-function swap. Reverted
  "Kickoff meeting held" back to Pending afterward. This test project
  ("QA Test Co 129", customer ID `WRQ-CUST-CEE9`) was **not deleted** —
  left in place since there's no delete-project affordance readily
  available in the UI; flagged to the user in case they want it removed.
- `npx tsc --noEmit` / `pnpm lint` — PASS after these changes.
- Console clean across all of the above.

### Follow-up: attachment remove button + Continue-gate confirmation flow (post-implementation, same session)

User requested: (1) a remove button on uploaded attachments, and (2) a
Continue-button confirmation flow — if the current step has incomplete
internal-deliverable checklist items, show a popup listing them with a
"Mark all as done" action; if that would bypass required-field validation,
show a second confirmation ("Yes, proceed" force-bypasses and marks done
anyway; "Review" closes everything and highlights the invalid fields with
a red glowing border).

**Changes:**
- `FileUploadBox` gained an `onRemove?: (id: string) => void` prop — each
  file row now has a small trash-icon button (only rendered when
  `onRemove` is passed). Reused the existing, already-in-use
  `DELETE /api/customers/{customerId}/assets?id={id}` endpoint (same one
  `client.tsx`'s customer-profile asset manager already calls) — no new
  API route needed. `handleRemoveFile`/`handleRemoveBusinessFactsFile`
  optimistically remove from local state, then fire the DELETE in the
  background (non-blocking, matches this file's existing fire-and-forget
  autosave pattern; a failed delete shows an inline error but doesn't roll
  back the optimistic removal — acceptable, same class of limitation as
  the pre-existing session-local file list).
- `handleContinueClick` replaces the plain `setStepIdx((s) => s + 1)` on
  the Continue button: if `stepInternal.length > 0` for the current step
  and any item isn't `"done"`, opens the "Incomplete checklist items"
  modal (Popup A) instead of advancing.
- Popup A lists the incomplete items with **Cancel** (closes, no change)
  and **Mark all as done** (`handleMarkAllDone`).
- `handleMarkAllDone`: for Kickoff specifically, checks whether any of the
  incomplete items are the two validated keys
  (`kickoff-contacts-confirmed`/`kickoff-goals-timeline-filed`) and would
  fail validation right now — if so, opens Popup B ("Missing required
  fields") instead of proceeding. For every other step (no validation
  function exists for their internal-deliverable keys), or for Kickoff
  when everything already validates, it goes straight to
  `finalizeMarkAllDone`.
- `finalizeMarkAllDone`: `Promise.all`s `setInternalStatus(key, "done")`
  for every incomplete item, closes both modals, clears the checklist
  error state, and **advances to the next step** — completing the
  original Continue action once everything is resolved.
- Popup B: **"Yes, proceed"** (`handleForceProceed`) calls
  `finalizeMarkAllDone` directly — bypasses validation entirely and force-
  completes every incomplete item (including the ones that would
  otherwise be blocked), then advances. **"Review"** (`handleReview`)
  closes both modals without marking anything or advancing, and sets
  `contactsFieldError`/`businessFactsFieldError` to `true` for whichever
  field(s) are still actually invalid.
- Red glow: `ContactsField` and `RichTextField` both gained an optional
  `hasError` prop. The parent only ever passes
  `contactsFieldError && !isContactsValid` /
  `businessFactsFieldError && !isBusinessFactsFilled` — ANDing with live
  validity means the glow **self-clears** the moment the user fixes the
  field, without needing to manually reset the boolean anywhere. Also
  wired the same flags into the existing direct-checklist-click path
  (`handleKickoffInternalToggle`), so clicking "Contacts confirmed"/"Goals,
  timeline..." directly (not just via Continue) now also triggers the red
  glow, not just the inline text error — for consistency.
- Both modals reuse this codebase's existing overlay pattern
  (`fixed inset-0 z-50 ... bg-black/40` centered card, seen in
  `_projects-index.tsx`/`client.tsx`), rebuilt isDark-aware to match this
  file's convention (none of the existing examples were isDark-aware, so
  this is new but consistent styling, not a copy-paste).

**Bug caught and fixed during verification:** `RichTextField`'s red-glow
border was being visually overridden by the normal blue `focus-within`
border/shadow when the field had both an error AND focus (two separate,
non-conflicting-per-tailwind-merge class strings, but the `focus-within:`
variant's generated CSS rule happened to win the cascade). Fixed by
branching the wrapper's border/shadow/focus classes on `hasError` first,
so an errored field gets a **red** focus-within style instead of blue.

**Verification (browser, "QA Test Co 129" test project created for
earlier seed-time verification):**
- Popup A → "Mark all as done" with an intentionally-empty Contacts field
  → correctly opened Popup B ("Missing required fields").
- Popup B → "Review" → both popups closed, Contacts card AND Business
  Facts editor both showed the red glowing border simultaneously.
- Filled in a valid contact (name + email) and clicked into Business
  Facts → Contacts' red glow cleared immediately (self-healing), Business
  Facts' focus-within now correctly renders red-not-blue while still
  invalid (confirms the cascade fix).
- Re-ran Continue → Popup A → "Mark all as done" with contacts now valid
  → correctly skipped Popup B entirely (no failing items left) and
  advanced straight to Step 2, with Kickoff's status flipping to Done
  (checkmark) and "1/7 complete".
- Verified the primary-contact sync (from the original task 129 work) as
  a side effect: `customers.contact_name`/`contact_email` for this test
  customer show "Jane Test"/"jane@test.com" via a direct API query — first
  real DB confirmation of that feature working end-to-end.
- Step 2 ("Outcome target", no internal deliverables) → Continue advanced
  immediately with no modal, confirming the gate only applies to steps
  that actually have a checklist.
- Step 3 ("Migration checklist", non-Kickoff, has one internal
  deliverable with no validation function) → Popup A → "Mark all as done"
  → advanced directly with **no** Popup B, confirming the force-confirm
  step is Kickoff-specific and doesn't spuriously appear for steps with
  no validation logic.
- Attachment remove button: the Chrome automation's `file_upload` tool
  turned out to be incompatible in this environment and errored, but
  (unexpectedly) appears to have silently uploaded some internal fixture
  image before erroring out, orphaning a `customer_assets` row under this
  test customer (never visible in the UI, since the file list is
  session-local and that upload predated the current page load — an
  existing, documented limitation, not a new bug). Actual verification
  used `javascript_tool` to dispatch a real `change` event on the hidden
  file input with a genuine test file, which went through the real
  `handleBusinessFactsUpload` path — confirmed upload showed in the UI,
  clicking the new remove button removed it instantly from the UI, and a
  direct API query confirmed the underlying DB row was actually deleted
  (not just hidden client-side). Manually deleted the orphaned fixture-
  image row via a direct DELETE call to leave the test customer's asset
  list clean.
- `npx tsc --noEmit` / `pnpm lint` — PASS.
- Console clean throughout (checked via fresh page loads, not just
  mid-session).

### Closing summary (task marked Completed)

User confirmed Kickoff-step work is done for now. Final state, across all
rounds in this task:

- **Data shape**: `wizard_data.kickoff` is now
  `{ contacts, additionalNotes, businessFacts, websiteUrl, competitorUrls }`
  — `seniorContact` and `customerData` removed; `directAccess` renamed to
  `additionalNotes` with a read-time fallback so already-saved data isn't
  lost.
- **UI**: two-column Field-styled layout; repeatable `ContactsField`
  (primary contact non-removable, icon-only outline add/remove controls
  matching `TagField`'s final style); URL-validated Website/Competitor
  fields; Business Facts rich text + file attachments (with a remove
  button, reusing the existing asset DELETE endpoint); Additional Notes.
- **Completion mechanics**: the 3-item checklist reuses the pre-existing
  `onboarding_internal_deliverables` system end-to-end (task 127's
  auto-derive-parent-status logic needed zero changes). Checklist items
  are a direct pending↔done toggle (not the 3-state cycle) — "in_progress"
  is reserved for the parent step, which itself now starts "in_progress"
  automatically the moment a project's onboarding begins
  (`seedAndStartProgramme`). The Continue button gates on any incomplete
  checklist item for the current step (any step with a checklist, not
  Kickoff-only), via a two-step confirmation flow: list incomplete items →
  "Mark all as done" → if that would bypass Kickoff's contacts/business-
  facts validation, a second "Yes, proceed" (force-bypass) vs. "Review"
  (abort + red-glow the invalid fields) confirmation.
- **Backend**: primary contact syncs to `customers.contact_name`/
  `contact_email` on every kickoff autosave (verified end-to-end against
  real DB data — "Jane Test"/"jane@test.com" round-tripped correctly);
  Phase-1 hand-off bulk-inserts kickoff contacts into the `contacts` table
  as `match_method: 'manual'`, `external_id: null`.
- **Outstanding, not blocking "Completed"**: the two migration files
  (`061_contacts_external_id_nullable.sql`,
  `062_backfill_kickoff_internal_deliverables.sql`) still need to be
  applied by the user to their Supabase project — flagged repeatedly
  through this task, user opted to apply them personally rather than have
  this session do it. Until applied: the checklist won't function on
  already-in-progress projects (confirmed fails gracefully, no crash), and
  the Phase-1 hand-off contacts insert will error (non-fatally — logged,
  doesn't block the response) for any project with manually-entered
  contacts.
- A throwaway verification project ("QA Test Co 129", customer ID
  `WRQ-CUST-CEE9`) was created during this task to test seed-time and
  Continue-flow behavior on a project unaffected by the pending
  migrations. It was not deleted (no delete-project UI found) — still
  flagged to the user as of this note.
