# 156: New Project — Optional Primary Contact + Horizontal Contact Email/Phone Layout

**Created:** 2026-07-15
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Two small UX changes to the "Company & Contact" step (step 1) of the New Project wizard
(`/v2/onboarding/new`, `_content.tsx`):

1. **Primary contact (name + email) becomes optional**, since the contact can also be entered
   later in the Kickoff step of the Onboarding Wizard (task 129's `ContactsField`, which already
   syncs its first contact to the customer's primary contact via `upsertPrimaryContact` — task
   151). Requiring it twice is redundant friction on intake.
2. **Align "Contact email" and "Phone" side-by-side** on desktop to shorten the step-1 form.

Confirmed via code reading (not just the screenshot): the **server** (`POST
/api/onboarding/projects`) already treats the whole `contact` object as optional —
`upsertPrimaryContact` is only called `if (body.contact?.name || body.contact?.email ||
body.contact?.phone)` (`route.ts:218`). The requirement is **purely a client-side validation
change** — `goNext()`'s step-1 check currently hard-requires `contactName` and `contactEmail`
(`_content.tsx:445-447`). No API or DB change needed.

## Requirements

- [ ] Step 1's `goNext()` validation no longer requires `contactName`/`contactEmail`. Keep the
      email-format check (`/^\S+@\S+\.\S+$/`) but only run it **if** the user typed something into
      the email field (empty is fine, an invalid non-empty value still errors).
- [ ] Remove the `required` prop / red asterisk from the "Primary contact" and "Contact email"
      `Field`s so the UI doesn't visually promise a hard requirement that no longer exists.
- [ ] "Contact email" and "Phone" render side-by-side in a two-column row on desktop (`sm:` and up),
      stacking to one column on narrow/mobile widths — matching this form's existing responsive
      convention (e.g. the step 3 review layout collapses gracefully; no other 2-up field row
      exists yet in this file, so this establishes the pattern using a plain `grid grid-cols-1
      sm:grid-cols-2 gap-3` wrapper, consistent with CLAUDE.md's "Tailwind scale classes" rule).
      "Primary contact" (name) stays its own full-width row above them, unchanged — the user's
      screenshot only calls out email+phone for the horizontal pairing.
- [ ] Step 3 (Review & Create)'s `ReviewRow`s for Primary contact/Contact email already fall back
      to `"—"` when empty (`contactName || "—"`, `contactEmail || "—"`) — verify this reads
      correctly with genuinely empty values now that the fields can be submitted blank (no code
      change expected here, just confirm during manual testing).

## Out of Scope / Must-Not-Change

- Do not touch the Kickoff step's `ContactsField` (task 129) or `upsertPrimaryContact` (task 151)
  — those are unchanged; this task only removes step 1's client-side requirement.
- Do not make "Phone" required or change its existing optional treatment.
- Do not change the "Company name" field's required status — still required on both new and
  existing-company paths.
- Do not change the review-step "Save + Set Schedule"/"Just save"/"Start onboarding" submit paths
  — `submit()`'s own validation (`companyMode`/`displayedProjectName`) is untouched; it never
  checked contact fields to begin with.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/onboarding/new/_content.tsx` | Modify | Drop step-1 contact-name/email requirement; two-column layout for email+phone |

## Code Context

### `goNext()` step-1 validation (`_content.tsx:440-453`) — current

```tsx
function goNext() {
  if (step === 1) {
    const errs: Record<string, string> = {};
    if (companyMode === "new" && !newCompanyName.trim()) errs.companyName = "Company name is required.";
    if (companyMode === "existing" && !selectedCustomer) errs.companyName = "Select an existing company.";
    if (!contactName.trim()) errs.contactName = "Contact name is required.";
    if (!contactEmail.trim()) errs.contactEmail = "Email is required.";
    else if (!/^\S+@\S+\.\S+$/.test(contactEmail)) errs.contactEmail = "Enter a valid email address.";
    if (Object.keys(errs).length) {
      setErrors1(errs);
      return;
    }
    setErrors1({});
  }
  ...
```

Becomes: drop the `!contactName.trim()` and `!contactEmail.trim()` required checks; keep only the
format check, now gated on non-empty:

```tsx
if (contactEmail.trim() && !/^\S+@\S+\.\S+$/.test(contactEmail)) errs.contactEmail = "Enter a valid email address.";
```

### Field rendering (`_content.tsx:677-719`) — current (all three stacked, name+email `required`)

```tsx
<Field id="contact-name" label="Primary contact" value={contactName} onChange={...} placeholder="Full name" icon={<User size={15} />} required error={errors1.contactName} />
<Field id="contact-email" label="Contact email" type="email" value={contactEmail} onChange={...} placeholder="contact@company.com" icon={<Mail size={15} />} required error={errors1.contactEmail} />
<Field id="contact-phone" label="Phone" value={contactPhone} onChange={setContactPhone} placeholder="Optional" icon={<Phone size={15} />} />
```

Becomes: drop `required` from name + email; wrap email + phone in a 2-col grid:

```tsx
<Field id="contact-name" label="Primary contact" value={contactName} onChange={...} placeholder="Full name (optional — can also be added during Kickoff)" icon={<User size={15} />} error={errors1.contactName} />
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
  <Field id="contact-email" label="Contact email" type="email" value={contactEmail} onChange={...} placeholder="contact@company.com" icon={<Mail size={15} />} error={errors1.contactEmail} />
  <Field id="contact-phone" label="Phone" value={contactPhone} onChange={setContactPhone} placeholder="Optional" icon={<Phone size={15} />} />
</div>
```

`Field` (`_content.tsx:179-`) takes no `className`/width prop today — it already renders at
`w-full` inside whatever wrapper it's placed in, so wrapping two calls in a `grid grid-cols-2`
container is sufficient; no changes needed inside `Field` itself.

## Implementation Steps

1. Update `goNext()`'s step-1 block to drop the two required checks, keep the conditional email
   format check.
2. Remove `required` from the "Primary contact" and "Contact email" `Field` calls; optionally
   soften the "Primary contact" placeholder to hint it can be filled in later at Kickoff.
3. Wrap the "Contact email" and "Phone" `Field`s in a `grid grid-cols-1 sm:grid-cols-2 gap-3` div.
4. Manually verify: submitting step 1 with all three contact fields blank now advances to step 2;
   entering an invalid (non-empty) email still blocks with the format error; the two-column layout
   renders side-by-side at desktop width and stacks on narrow viewports.

## Acceptance Criteria

- [ ] Step 1 advances to step 2 with Primary contact/Contact email/Phone all blank.
- [ ] An invalid, non-empty email still shows the format error and blocks advancing.
- [ ] Neither "Primary contact" nor "Contact email" shows a required asterisk.
- [ ] On a desktop-width viewport, "Contact email" and "Phone" render in the same row; on mobile
      width they stack.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser: open `/v2/onboarding/new`, fill only Company name, click Continue with contact
fields blank — should advance. Go back, type an invalid email (e.g. `foo`) — should block with an
error. Resize the browser to confirm the email/phone row layout responds correctly.

## Compatibility Touchpoints

- No migration, no API contract change — server already accepted an optional/absent `contact`.
