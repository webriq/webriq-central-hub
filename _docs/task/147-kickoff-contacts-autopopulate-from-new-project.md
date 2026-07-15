# 147: Kickoff > Primary Contact — Auto-Populate From New Project Setup Form

**Created:** 2026-07-14
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Testing

---

## Overview

The "New Project" setup wizard (`src/app/v2/(hub)/onboarding/new/_content.tsx`) collects a
primary contact's name, email, and phone during project creation and `POST`s it to
`/api/onboarding/projects` (`src/app/api/onboarding/projects/route.ts`). That route writes
`contact_name`/`contact_email` onto the **`customers`** row (lines 162-165 for a new
customer, 175-182 for an existing one) — but the phone number is never written there; it's
stashed separately in `projects.source_meta.primary_contact_phone` (line 210).

Later, when the PM opens the same project's Kickoff wizard step, its `ContactsField`
initializes from `wizard_data.kickoff.contacts` only
(`_onboarding-wizard.tsx:175-178`) — a JSONB blob that is exclusively written by the
Kickoff step's own autosave. Nothing in that initialization path reads
`customers.contact_name`/`contact_email` or `projects.source_meta.primary_contact_phone`.
Since a freshly created project has never autosaved a Kickoff contact yet, `kickoffData.contacts`
is empty and the Contacts card falls back to one fully blank row
(`_onboarding-wizard.tsx:176-177`) — even though the same person's name and email were just
typed into the New Project form minutes earlier.

The sync that does exist runs in the opposite direction: every Kickoff autosave takes
`contacts[0]` from the wizard form and pushes it into `customers.contact_name`/`contact_email`
(`src/app/api/projects/[projectId]/programme/wizard-data/route.ts:62-77`) — Kickoff → `customers`,
never `customers` → Kickoff. This task adds the missing read so the New Project form's contact
pre-fills the first Kickoff contact row instead of requiring the PM to re-type it.

## Requirements

- [ ] When a project's Kickoff step has never been autosaved with contacts
      (`wizard_data.kickoff.contacts` is empty/undefined), the Contacts card's first row is
      pre-filled from `customers.contact_name` (→ `fullName`), `customers.contact_email`
      (→ `email`), and `projects.source_meta.primary_contact_phone` (→ `phone`) instead of
      rendering a fully blank row.
- [ ] Once the Kickoff step has been autosaved at least once (`wizard_data.kickoff.contacts`
      is non-empty), that saved data remains the source of truth — do not overwrite a PM's
      edited/added contacts with the original New Project values on every load. This is a
      one-time default-fill, not a persistent sync.
- [ ] `position`/`socialMedia` fields on the pre-filled contact stay empty — the New Project
      form never collects those.
- [ ] If `customers.contact_name`/`contact_email` are also empty (project created without a
      contact, or an older project predating this data), fall back to today's fully-blank-row
      behavior — no regression for existing projects with legitimately empty contact data.

## Out of Scope / Must-Not-Change

- Do not change the existing Kickoff → `customers` autosave sync in
  `wizard-data/route.ts:62-77` — it still needs to keep `customers.contact_name`/`contact_email`
  updated from whatever the PM edits in Kickoff after the initial pre-fill.
- Do not change the New Project form (`_content.tsx`) or `POST /api/onboarding/projects` — the
  write side (`customers.contact_name`/`contact_email`, `projects.source_meta.primary_contact_phone`)
  is correct as-is; only the Kickoff read side is missing.
- Do not add phone to the `customers` table schema — `projects.source_meta.primary_contact_phone`
  is an established location (task 122) and reading it is sufficient for this fix.
- Do not touch the Phase-1 hand-off contact bulk-insert into the `contacts` table
  (`complete-phase/route.ts`) — unrelated to this pre-fill.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/onboarding/[projectId]/page.tsx` | Modify | Widen the `projects` select to include `customers(contact_name, contact_email)` and `source_meta`; pass the values through the `project` prop |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` | Modify | Widen `OnboardingDetailProps.project` type to carry the new fields through to `OnboardingWizard` (already passes `project` straight through at line 725 — just needs the wider type) |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Widen `OnboardingWizardProps.project` type (line 82); change `initialContacts`/`defaultContacts` derivation (lines 175-177) to fall back to the project's contact fields before falling back to a blank row |

## Code Context

### File: `src/app/v2/(hub)/onboarding/[projectId]/page.tsx` (current, lines 30-44)

```ts
  const { data: project, error } = await supabase
    .from("projects")
    .select("id, name, customer_id, project_id, customers(company_name)")
    .eq("id", projectId)
    .single();

  if (error || !project) {
    notFound();
  }

  const companyName = (project.customers as unknown as { company_name: string } | null)?.company_name ?? "Customer";

  return (
    <OnboardingDetail
      project={{ id: project.id, name: project.name, customer_id: project.customer_id, project_id: project.project_id, company_name: companyName }}
      role={role}
    />
  );
```

Change the `.select()` to also pull `customers(contact_name, contact_email)` and
`source_meta`, then thread `contact_name`, `contact_email`, and
`(project.source_meta as { primary_contact_phone?: string } | null)?.primary_contact_phone`
into the `project` prop object.

### File: `_onboarding-detail.tsx` (current, line 23)

```ts
  project: { id: string; name: string; customer_id: string; project_id: string | null; company_name: string };
```

Add `contact_name: string | null; contact_email: string | null; primary_contact_phone: string | null;`
to this type (it's already forwarded verbatim to `OnboardingWizard` at line 725 — no logic
change needed there, just the wider type).

### File: `_onboarding-wizard.tsx` (current, lines 81-82, 169-178)

```ts
interface OnboardingWizardProps {
  project: { id: string; name: string; customer_id: string; project_id: string | null; company_name: string };
  ...
}
...
  const kickoffData = (wizardData.kickoff as Record<string, unknown>) ?? {};
  ...
  const initialContacts = (kickoffData.contacts as ContactEntry[] | undefined) ?? [];
  const defaultContacts: ContactEntry[] =
    initialContacts.length > 0 ? initialContacts : [{ fullName: "", position: "", email: "", phone: "", socialMedia: "" }];
```

Widen `OnboardingWizardProps.project` to match the new `_onboarding-detail.tsx` type. Change
the fallback row construction so that when `initialContacts.length === 0`, it builds the
default row from `project.contact_name`/`project.contact_email`/`project.primary_contact_phone`
(each `?? ""`) instead of always using empty strings:

```ts
  const defaultContacts: ContactEntry[] =
    initialContacts.length > 0
      ? initialContacts
      : [{
          fullName: project.contact_name ?? "",
          position: "",
          email: project.contact_email ?? "",
          phone: project.primary_contact_phone ?? "",
          socialMedia: "",
        }];
```

`ContactEntry` type is defined locally at line 32 — no changes needed there.

## Implementation Steps

1. In `page.tsx`: widen the `.select()` string to
   `"id, name, customer_id, project_id, source_meta, customers(company_name, contact_name, contact_email)"`,
   extract `contact_name`/`contact_email` off the `customers` relation and
   `primary_contact_phone` off `source_meta`, and add all three to the `project` prop object
   passed to `OnboardingDetail`.
2. In `_onboarding-detail.tsx`: widen `OnboardingDetailProps.project`'s type to include the
   three new nullable string fields.
3. In `_onboarding-wizard.tsx`: widen `OnboardingWizardProps.project`'s type identically, then
   update the `defaultContacts` fallback (lines 176-177) to seed from
   `project.contact_name`/`contact_email`/`primary_contact_phone` when
   `initialContacts.length === 0`.
4. Confirm `lastKickoffSavedRef`'s initial snapshot (line 210-217) still uses `defaultContacts`
   so the pre-filled values don't immediately register as an unsaved change / trigger a
   spurious autosave on mount.

## Acceptance Criteria

- [ ] Creating a new project via the New Project wizard with a contact name/email/phone, then
      immediately opening that project's Kickoff step, shows the Contacts card's first row
      pre-filled with that name, email, and phone (no re-typing required).
- [ ] `position` and `socialMedia` are empty on the pre-filled row.
- [ ] Editing/saving the Kickoff Contacts card once, then reloading the page, shows the saved
      (possibly edited) contacts — not a re-derived value from the New Project data.
- [ ] A project created without a contact (or an older project with no `customers.contact_name`)
      still shows the existing blank-row fallback — no crash, no `"null"` string literals
      rendered into the inputs.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser: create a new project via `/v2/onboarding/new` with a filled-in contact name,
email, and phone; open the resulting project's Kickoff step and confirm the first Contacts
row is pre-filled. Edit the row, wait for autosave, reload, and confirm the edited value
persists instead of reverting to the New Project value.

## Compatibility Touchpoints

- None — no schema or route changes. Purely a widened read query plus a prop-type/fallback
  change confined to the three files above.

## Implementation Notes

### What Changed
- Widened `page.tsx`'s `projects` select to also pull `source_meta` and
  `customers(contact_name, contact_email)` alongside the existing `company_name`, and now
  extracts `primary_contact_phone` off `source_meta` and threads all three new fields into the
  `project` prop passed to `OnboardingDetail`.
- Widened `OnboardingDetailProps.project` (`_onboarding-detail.tsx`) and
  `OnboardingWizardProps.project` (`_onboarding-wizard.tsx`) with the same three nullable
  string fields (`contact_name`, `contact_email`, `primary_contact_phone`) — `_onboarding-detail.tsx`
  already forwarded `project` straight through to `OnboardingWizard` verbatim, so no logic
  change was needed there beyond the type.
- Changed `_onboarding-wizard.tsx`'s `defaultContacts` fallback: when
  `kickoffData.contacts` is empty, the first row now seeds from
  `project.contact_name`/`contact_email`/`primary_contact_phone` (each `?? ""`) instead of a
  fully blank row. Once Kickoff has been autosaved at least once, `initialContacts` is
  non-empty and this fallback path is never reached again — matching the "one-time default
  fill, not a persistent sync" requirement.
- Confirmed (no change needed): `lastKickoffSavedRef`'s initial `JSON.stringify` snapshot
  already read from `defaultContacts` (not a separate blank literal), so the pre-filled values
  don't register as an unsaved change or trigger a spurious autosave on mount.

### Files Changed
- `src/app/v2/(hub)/onboarding/[projectId]/page.tsx` - widened `.select()`, extracted contact fields, threaded into `project` prop
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` - widened `OnboardingDetailProps.project` type
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` - widened `OnboardingWizardProps.project` type; `defaultContacts` fallback now seeds from the project's contact fields

### Deviations From Plan
- None. Implemented exactly per the doc's Code Context and Implementation Steps.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual/browser verification - SKIPPED (no live Supabase/browser environment available in this session)
