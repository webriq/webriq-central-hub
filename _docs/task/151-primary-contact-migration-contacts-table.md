# 151: Primary Contact — Migrate from customers Columns to contacts.is_primary

**Created:** 2026-07-15
**Priority:** HIGH
**Type:** refactor
**Recommended Tier:** deep
**Status:** Completed (2026-07-15)

---

## Overview

A customer's "primary contact" is currently modeled as two loose columns directly on
`customers` (`contact_name`, `contact_email`) plus a third value — phone — stashed
per-project in `projects.source_meta.primary_contact_phone` (task 122) because `customers`
has no phone column at all. This is wrong on two counts: (1) a customer can have many
contacts — `contacts` already exists for exactly this (task 117's Zoho Desk import,
`customer_id` FK) — so "primary contact" belongs there as a flagged row, not a parallel
freeform blob on `customers`; (2) phone belongs to the *contact*, not the *project*, so
keying it off `source_meta` on whichever project happened to be created first is already
wrong the moment a customer has a second project.

This was raised once before and rejected: task 120 ("v2 Customer Profile — Select/Deselect
Primary Contact from Desk Contacts") explicitly considered adding an `is_primary` flag to
`contacts` and chose not to, because at the time `customers.contact_name`/`contact_email`
was already read by `reply.ts` and the Edit Customer modal, and forking the source of truth
for no benefit wasn't worth it. That reasoning held then. It stops holding now that phone
needs a real home and task 147 (this session) confirmed the Kickoff pre-fill path is a third
consumer with its own awkward `source_meta` reach-around — the "no benefit" side of that
trade-off is gone.

**Chosen design (confirmed with the user this session, see rationale below):**
`contacts.is_primary` becomes the actual write-side source of truth. `customers.contact_name`/
`contact_email` remain on `customers` as a **synced read cache**, kept current by every write
path below at write time. This means the 15+ existing read-only call sites (list views,
search, public onboarding pre-fill, profile display, `reply.ts`) do **not** need to change —
only the write paths, plus task 147's Kickoff pre-fill (which switches from the
`source_meta` phone hack to reading `contacts` directly, since phone has never existed on
`customers` and doesn't need to be added there just to keep a cache consistent for a field
nothing else reads).

## Requirements

- [ ] `contacts` gains two new columns: `full_name text` (nullable) and
      `is_primary boolean not null default false`.
- [ ] A partial unique index guarantees at most one `is_primary = true` row per
      `customer_id` at the DB level (not just an application-level convention).
- [ ] Migration backfills existing `customers.contact_name`/`contact_email` into `contacts`:
      for each customer with non-null `contact_name` or `contact_email`, either flag an
      existing `contacts` row as primary (matched by case-insensitive email — covers
      customers whose primary was already a Zoho Desk-imported contact via task 120's
      Set-as-Primary) or insert a new manually-sourced row and flag it primary.
- [ ] Every write path that currently sets `customers.contact_name`/`contact_email`
      directly is changed to instead upsert/promote the matching `contacts` row to
      `is_primary = true` (demoting any prior primary first, to satisfy the unique index),
      and only then sync the same values onto `customers.contact_name`/`contact_email` as a
      cache. Phone, where collected, is written to `contacts.phone` — never to `customers`
      (no column exists or is being added) and never to `projects.source_meta` again.
- [ ] Task 147's Kickoff pre-fill (`_onboarding-wizard.tsx`'s `defaultContacts`) reads the
      customer's primary `contacts` row (name/email/phone) instead of
      `project.contact_name`/`contact_email`/`primary_contact_phone`. The
      `projects.source_meta.primary_contact_phone` write in
      `POST /api/onboarding/projects` is removed entirely (superseded — see Compatibility
      Touchpoints for the one already-written value it leaves behind).
- [ ] Task 120's Set-as-Primary/Remove-Primary buttons (`v2/(hub)/customers/[customerId]/client.tsx`)
      keep working exactly as today from the user's point of view, but now operate on
      `contacts.is_primary` under the hood via the shared PATCH endpoint (see Implementation
      Steps — no dedicated new endpoint needed, the existing call already carries enough
      information).
- [ ] The Phase-1 hand-off bulk-insert (`complete-phase/route.ts`, task 129) — which inserts
      every Kickoff contact into `contacts` on phase completion — is changed to skip any
      Kickoff contact whose email already matches an existing `contacts` row for that
      customer, so it no longer creates a duplicate row for the primary contact (which will
      already exist by hand-off time, kept current by every Kickoff autosave per this task).
      Non-primary contacts (rows 2+ in the Kickoff Contacts card) are unaffected and still
      insert as before.

## Out of Scope / Must-Not-Change

- Do **not** rewrite any read-only call site — list views, search (`v2/(hub)/customers/page.tsx`'s
  `ilike` search stays exactly as-is), the public onboarding pre-fill
  (`(public)/onboard/[customerId]/[productSlug]/page.tsx:128-129`), `reply.ts`, or any profile
  display. They keep reading `customers.contact_name`/`contact_email` — the cache is what
  keeps them correct without touching them.
- Do **not** add a `phone`/`phone_number` column to `customers`. Nothing reads phone off
  `customers` today (it doesn't exist there), so there is no cache to maintain for it —
  `contacts.phone` is the only home it needs.
- Do **not** touch `src/types/onboarding.ts`'s `contact_name`/`contact_email` fields (lines
  ~65-66, 72-73) — those are unrelated form-data keys inside the public onboarding JSONB
  blob, not the customer-level primary-contact concept this task is about.
- Do **not** change the Zoho Desk contact import/matching logic itself (task 117) — only how
  a contact gets *flagged* primary, not how contacts get imported or matched to a customer
  in the first place.
- Do **not** touch `contacts_pm_write`/`contacts_staff_read` RLS policies (migration 056) —
  the new columns are covered by the existing table-level policies with no role change.
- Do **not** build a UI for viewing/editing non-primary contacts beyond what task 119/120
  already ship — this task only changes where "primary" is stored and how it's set, not the
  Desk Contacts list UI itself.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/072_contacts_is_primary.sql` | Create | Add `full_name`/`is_primary` columns, partial unique index, backfill from `customers` |
| `src/types/database.ts` | Modify | Add `full_name`/`is_primary` to `contacts` Row/Insert/Update |
| `src/lib/customers/primary-contact.ts` | Create | Shared `upsertPrimaryContact(customerId, {name, email, phone})` and `demotePrimaryContact(customerId)` helpers, used by every write path below |
| `src/app/api/customers/route.ts` | Modify | POST — route `contact_name`/`contact_email` through `upsertPrimaryContact` instead of writing `customers` directly |
| `src/app/api/customers/[customerId]/route.ts` | Modify | PATCH — same; also handles the `contact_name: null, contact_email: null` "Remove Primary" case via `demotePrimaryContact` |
| `src/app/api/onboarding/projects/route.ts` | Modify | New-customer and existing-customer paths both route through `upsertPrimaryContact` (now including phone); remove the `source_meta.primary_contact_phone` write |
| `src/app/api/projects/[projectId]/programme/wizard-data/route.ts` | Modify | Kickoff autosave sync (lines ~62-77) calls `upsertPrimaryContact` instead of PATCHing `customers` directly — now also captures phone, which was previously silently discarded |
| `src/app/api/projects/[projectId]/programme/complete-phase/route.ts` | Modify | Skip inserting a Kickoff contact whose email already matches an existing `contacts` row for the customer (dedupe against the primary) |
| `src/app/v2/(hub)/onboarding/[projectId]/page.tsx` | Modify | Fetch the customer's primary `contacts` row instead of `customers(contact_name, contact_email)`/`source_meta`; pass into `project` prop |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` | Modify | No type change needed — `OnboardingDetailProps.project`'s three fields (`contact_name`/`contact_email`/`primary_contact_phone`) keep the same shape, just sourced differently upstream |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | No change needed — `defaultContacts` already reads `project.contact_name`/`contact_email`/`primary_contact_phone`; those now arrive from `contacts` instead of `customers`/`source_meta`, transparently |

## Code Context

### New migration: `supabase/migrations/072_contacts_is_primary.sql`

```sql
alter table contacts add column if not exists full_name text;
alter table contacts add column if not exists is_primary boolean not null default false;

-- At most one primary contact per customer, enforced at the DB level.
create unique index if not exists contacts_one_primary_per_customer
  on contacts (customer_id) where is_primary;

-- Backfill (a): customers whose contact_email already matches an existing contacts row
-- (e.g. a Zoho Desk-imported contact previously set primary via task 120) — flag it.
update contacts c
set is_primary = true
from customers cu
where c.customer_id = cu.customer_id
  and cu.contact_email is not null
  and c.email is not null
  and lower(trim(c.email)) = lower(trim(cu.contact_email))
  and not exists (select 1 from contacts c2 where c2.customer_id = c.customer_id and c2.is_primary);

-- Backfill (b): customers with contact_name/contact_email but no existing contacts match —
-- insert a new manually-sourced primary row.
insert into contacts (customer_id, full_name, email, is_primary, match_method)
select cu.customer_id, cu.contact_name, cu.contact_email, true, 'manual'
from customers cu
where (cu.contact_name is not null or cu.contact_email is not null)
  and not exists (select 1 from contacts c where c.customer_id = cu.customer_id and c.is_primary);
```

### New: `src/lib/customers/primary-contact.ts`

Mirrors this repo's existing pattern of small, focused `src/lib/*` helpers (e.g.
`src/lib/zoho/*`). Takes a Supabase client (server or admin, caller's choice — the Kickoff
autosave path and `complete-phase` already use `adminClient` for RLS reasons unrelated to
this task) so it works from every call site's existing auth context:

```ts
export async function upsertPrimaryContact(
  supabase: SupabaseClient,
  customerId: string,
  contact: { name?: string | null; email?: string | null; phone?: string | null }
): Promise<{ error: string | null }> {
  const email = contact.email?.trim() || null;
  const name = contact.name?.trim() || null;
  const phone = contact.phone?.trim() || null;

  // Match by case-insensitive email against this customer's existing contacts first —
  // covers both a re-submitted New Project form for a returning customer and task 120's
  // Set-as-Primary (which already sends the exact Desk contact's email/name).
  let matchedId: string | null = null;
  if (email) {
    const { data: existing } = await supabase
      .from("contacts")
      .select("id")
      .eq("customer_id", customerId)
      .ilike("email", email)
      .maybeSingle();
    matchedId = existing?.id ?? null;
  }

  // Demote any current primary that isn't the row we're about to (re)promote — required
  // before the insert/update below, since the partial unique index rejects a second
  // is_primary = true row for the same customer_id.
  await supabase
    .from("contacts")
    .update({ is_primary: false })
    .eq("customer_id", customerId)
    .eq("is_primary", true)
    .neq("id", matchedId ?? "");

  if (matchedId) {
    await supabase.from("contacts").update({ full_name: name, phone, is_primary: true }).eq("id", matchedId);
  } else {
    await supabase.from("contacts").insert({ customer_id: customerId, full_name: name, email, phone, is_primary: true, match_method: "manual" });
  }

  // Cache sync — every existing read-only call site keeps working unchanged.
  await supabase.from("customers").update({ contact_name: name, contact_email: email }).eq("customer_id", customerId);
  return { error: null };
}

export async function demotePrimaryContact(supabase: SupabaseClient, customerId: string): Promise<void> {
  await supabase.from("contacts").update({ is_primary: false }).eq("customer_id", customerId).eq("is_primary", true);
  await supabase.from("customers").update({ contact_name: null, contact_email: null }).eq("customer_id", customerId);
}
```

Implementer's call on exact error handling/return shape to match each call site's existing
convention (some routes throw, some return `{error}` — follow whatever the calling route
already does, don't invent a third pattern).

### File: `src/app/api/customers/[customerId]/route.ts` (current PATCH handler)

The existing handler applies `contact_name`/`contact_email` directly via
`updateData.contact_name = body.contact_name?.trim() ?? null` (and same for email) as part
of one larger `customers` update alongside unrelated fields (`company_name`,
`communication_tone`, `status`, etc.). Split this: continue updating the unrelated fields on
`customers` directly, but route `contact_name`/`contact_email` specifically through
`demotePrimaryContact` (when both arrive `null` — task 120's "Remove Primary" case, see
`client.tsx:497` `patchPrimaryContact(null, null)`) or `upsertPrimaryContact` (otherwise,
covers both the Edit Customer modal and task 120's "Set as Primary").

### File: `src/app/api/onboarding/projects/route.ts` (current, lines ~161-213)

Replace the three separate write blocks (new-customer `contact_name`/`contact_email` insert,
existing-customer conditional PATCH, and the `source_meta.primary_contact_phone` project
write) with one `upsertPrimaryContact(supabase, customerId, body.contact)` call after
`customerId` is resolved (works for both the new- and existing-customer branches
identically — no more branching needed for this specific concern), and drop the
`source_meta:` line from the `projects` insert entirely.

### File: `src/app/api/projects/[projectId]/programme/wizard-data/route.ts` (current, lines ~62-77)

Currently reads `contacts[0]` from the just-saved Kickoff payload and PATCHes
`customers.contact_name`/`contact_email` directly. Change to call
`upsertPrimaryContact(adminClient, customerId, { name: contacts[0].fullName, email: contacts[0].email, phone: contacts[0].phone })` —
this is also a real bug fix in passing: `contacts[0].phone` is currently collected by the
Kickoff `ContactsField` UI and then silently discarded on every autosave; after this change
it's finally persisted.

### File: `src/app/api/projects/[projectId]/programme/complete-phase/route.ts` (current, lines 69-109)

Add an email-match filter before the `contactRows` insert: for each Kickoff contact with an
email, skip it if a `contacts` row already exists for `project.customer_id` with a
case-insensitively matching email (the primary contact will already exist by hand-off time
via the autosave sync above). Only genuinely new (non-primary) contacts get inserted here
going forward.

### File: `src/app/v2/(hub)/onboarding/[projectId]/page.tsx` (current, post-task-147)

```ts
const { data: project, error } = await supabase
  .from("projects")
  .select("id, name, customer_id, project_id, source_meta, customers(company_name, contact_name, contact_email)")
  .eq("id", projectId)
  .single();
```

Change to fetch the primary `contacts` row instead (drop `source_meta` from the select — no
longer needed once the `primary_contact_phone` write is removed):

```ts
const { data: project, error } = await supabase
  .from("projects")
  .select("id, name, customer_id, project_id, customers(company_name)")
  .eq("id", projectId)
  .single();

const { data: primaryContact } = await supabase
  .from("contacts")
  .select("full_name, email, phone")
  .eq("customer_id", project?.customer_id)
  .eq("is_primary", true)
  .maybeSingle();
```

Then pass `contact_name: primaryContact?.full_name ?? null`,
`contact_email: primaryContact?.email ?? null`,
`primary_contact_phone: primaryContact?.phone ?? null` into the same `project` prop shape
task 147 already established — `_onboarding-detail.tsx`/`_onboarding-wizard.tsx` need **no
further changes**, they already consume exactly this shape.

## Implementation Steps

1. Write migration 072 (columns, unique index, backfill) per Code Context above.
2. Add `full_name`/`is_primary` to `contacts`'s Row/Insert/Update in `database.ts`.
3. Create `src/lib/customers/primary-contact.ts` with `upsertPrimaryContact`/`demotePrimaryContact`.
4. Update `src/app/api/customers/route.ts` (POST) to call `upsertPrimaryContact`.
5. Update `src/app/api/customers/[customerId]/route.ts` (PATCH) to route `contact_name`/`contact_email` through `upsertPrimaryContact`/`demotePrimaryContact` per the null-vs-value split above, leaving the rest of the update untouched.
6. Update `src/app/api/onboarding/projects/route.ts` to call `upsertPrimaryContact` once (both branches) and drop the `source_meta.primary_contact_phone` write.
7. Update `wizard-data/route.ts`'s Kickoff sync to call `upsertPrimaryContact` with phone included.
8. Update `complete-phase/route.ts`'s bulk-insert to skip email-matching existing contacts.
9. Update `page.tsx` to fetch the primary `contacts` row instead of `customers`/`source_meta` fields, per Code Context.
10. Confirm (no code change expected) `_onboarding-detail.tsx`/`_onboarding-wizard.tsx` still work unchanged against the new data source — the prop shape is identical to what task 147 shipped.

## Acceptance Criteria

- [ ] A fresh "New Project" submission with name/email/phone creates exactly one `contacts`
      row for that customer with `is_primary = true` and all three fields populated —
      opening that project's Kickoff step immediately shows the pre-filled row, including
      phone (previously always blank).
- [ ] Submitting the New Project form again for the *same* existing customer with the same
      email updates that same `contacts` row (no duplicate) and keeps it primary.
- [ ] Editing the primary contact via the v1 or v2 Edit Customer modal updates the `contacts`
      row and the `customers` cache stays in sync (list views/search still show the new
      value with no code changes to those views).
- [ ] Task 120's "Set as Primary" on a Desk contact flags that exact `contacts` row primary
      (no duplicate insert, matched by email) and demotes the previous primary; "Remove
      Primary" demotes the current primary and clears the `customers` cache, matching
      today's UI behavior.
- [ ] Editing/saving the Kickoff Contacts card (including phone) persists to the customer's
      primary `contacts` row on autosave; reloading shows the saved values, not a re-derived
      default.
- [ ] A Phase-1 hand-off for a project whose Kickoff primary contact already exists in
      `contacts` does not create a duplicate row; any additional (non-primary) Kickoff
      contacts still insert as before.
- [ ] A customer with no contact data at all still shows today's blank-row fallback
      everywhere — no crash, no `"null"` string literals.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser (requires the migration applied): create a new project with a filled contact
including phone; confirm the Kickoff step pre-fills all three fields. Edit the customer's
primary contact via the v1/v2 Edit modal; confirm the v2 customers list/search still shows it
correctly. On a customer with existing Zoho Desk contacts, use Set-as-Primary/Remove-Primary
and confirm no duplicate `contacts` rows appear and the unique index never rejects a write.
Complete a project's Phase 1 hand-off and confirm no duplicate primary-contact row lands in
`contacts`.

## Compatibility Touchpoints

- Migration 072 must be applied by the user before the new columns/write paths work — this
  repo's established pattern (user applies migrations manually). Applied successfully
  2026-07-15; live pre-fill confirmed working (see Live-Run Follow-Up in Implementation Notes).
- `projects.source_meta.primary_contact_phone` — any project created between task 122's
  original implementation and this task's ship date has its phone value stranded in
  `source_meta` (never migrated into `contacts` by migration 072's backfill, which only reads
  from `customers`, not `projects.source_meta`). This is a small, bounded gap (only projects
  created in that window, phone is the least-critical of the three fields) — flagged here
  rather than silently accepted; the user may want a follow-up one-off backfill script if any
  such projects exist and their phone value matters, but writing that script is deferred
  unless requested (unclear how many rows are actually affected without querying the live
  DB, which isn't available in this planning session).
- Supersedes task 147's `page.tsx` read path (this session) — task 147's doc should be
  considered prior art / historical context, not touched retroactively.

## Implementation Notes

### What Changed
- Migration 072: `contacts` gains `full_name text` and `is_primary boolean not null default
  false`, a partial unique index (`contacts_one_primary_per_customer`) enforcing at most one
  primary per `customer_id`, and a two-part backfill (flag an existing email-matching row
  primary; otherwise insert a new manually-sourced primary row from
  `customers.contact_name`/`contact_email`) — exactly per the doc's Code Context.
- `database.ts`: added `full_name`/`is_primary` to `contacts`'s Row/Insert/Update.
- New `src/lib/customers/primary-contact.ts`: `upsertPrimaryContact()` matches by
  case-insensitive email against the customer's existing `contacts` rows, demotes any other
  current primary (skipping the `.neq()` id-exclusion filter entirely when there's no match
  yet, to avoid comparing the uuid column against an empty-string placeholder — a bug caught
  and fixed during implementation, see Deviations), then updates or inserts the matched/new
  row as primary and syncs `customers.contact_name`/`contact_email` as a cache.
  `demotePrimaryContact()` unsets the current primary and clears the cache.
- All four write paths now route through the shared helper: `POST /api/customers`,
  `PATCH /api/customers/[customerId]` (including the null/null "Remove Primary" case via
  `demotePrimaryContact`), `POST /api/onboarding/projects` (both new- and existing-customer
  branches collapsed into one call, now including phone), and `wizard-data/route.ts`'s
  Kickoff autosave sync (now also captures phone, previously silently discarded).
- `complete-phase/route.ts`'s Phase-1 hand-off bulk-insert now fetches the customer's
  existing `contacts` emails first and skips any Kickoff contact whose email already
  matches, preventing a duplicate primary-contact row at hand-off time.
- `page.tsx` now fetches the customer's `is_primary` `contacts` row (`full_name`, `email`,
  `phone`) instead of `customers(contact_name, contact_email)`/`source_meta`, feeding the
  same `project` prop shape task 147 established — `_onboarding-detail.tsx`/
  `_onboarding-wizard.tsx` needed no changes, exactly as the doc anticipated.
- `POST /api/onboarding/projects`'s `projects` insert no longer writes
  `source_meta.primary_contact_phone`.

### Files Changed
- `supabase/migrations/072_contacts_is_primary.sql` - new migration, not yet applied (see Compatibility Touchpoints)
- `src/types/database.ts` - `contacts` type additions
- `src/lib/customers/primary-contact.ts` - new shared helper
- `src/app/api/customers/route.ts` - POST routes contact fields through `upsertPrimaryContact`
- `src/app/api/customers/[customerId]/route.ts` - PATCH routes contact fields through the helper; fixed the "No fields to update" 400 that would otherwise incorrectly fire when a request contains only `contact_name`/`contact_email` (task 120's Set/Remove Primary always sends exactly this)
- `src/app/api/onboarding/projects/route.ts` - collapsed 3 write blocks into 1 helper call; removed `source_meta.primary_contact_phone`
- `src/app/api/projects/[projectId]/programme/wizard-data/route.ts` - Kickoff sync routes through the helper, now includes phone
- `src/app/api/projects/[projectId]/programme/complete-phase/route.ts` - dedupe filter against existing `contacts` emails before bulk-insert
- `src/app/v2/(hub)/onboarding/[projectId]/page.tsx` - reads the primary `contacts` row instead of `customers`/`source_meta`

### Deviations From Plan
- **Two RLS gaps not mentioned in the doc's Code Context, found and fixed during
  implementation.** The doc's helper snippet took "server or admin, caller's choice" as a
  given, but tracing actual role access showed two of the four write/read call sites would
  silently fail for the `marketing` role otherwise: (1) `onboarding/projects/route.ts` and
  `wizard-data/route.ts`'s Kickoff sync both allow `marketing` to call them
  (`CREATE_ROLES`/`WRITE_ROLES` include it), but `contacts_pm_write` RLS (migration 056) only
  covers `admin`/`super_admin`/`pm` — so a marketing-role write would have been silently
  dropped by RLS. (2) `page.tsx` allows `marketing` in `DETAIL_ROLES` to view the page, but
  `contacts_staff_read` RLS only covers `admin`/`super_admin`/`pm`/`developer` — so a
  marketing-role read of the primary contact would have returned nothing, breaking the
  Kickoff pre-fill specifically for the role (Bert) that owns onboarding in the first place.
  Fixed by using `adminClient` for the `contacts`/primary-contact operations in both files
  (session-scoped `supabase` is still used for everything else in those routes) — no RLS
  policy was touched, per the doc's own Out-of-Scope boundary.
- **Bug caught and fixed during implementation, not present in the doc's snippet:** the
  helper's original demote-query used `.neq("id", matchedId ?? "")`, which would compare the
  `id` uuid column against the literal string `""` whenever there was no email match (a fresh
  insert). Fixed by only applying `.neq()` when `matchedId` is non-null.
- No other deviations — implemented per the doc's Proposed File Changes/Code Context/
  Implementation Steps otherwise.

### Live-Run Follow-Up (post-migration testing)
- User applied migration 072 successfully. First live re-test of the Kickoff pre-fill still
  showed blank fields — not a code bug, but a known-by-design interaction with the *existing*
  test project reused from task 147's testing: once `wizard_data.kickoff.contacts` has been
  autosaved even once (including a blank row from earlier testing), the pre-fill logic
  correctly treats that saved data as the permanent source of truth and never re-derives it —
  this is required behavior (a PM's edits must never be silently overwritten), not a defect.
  Confirmed by asking the user whether the same project had been tested before task 151 (yes).
- Resolved by giving the user a one-line SQL fix to clear just the stale key without touching
  any other saved Kickoff data, run directly in the Supabase SQL editor:
  ```sql
  update customer_phases
  set wizard_data = wizard_data #- '{kickoff,contacts}'
  where phase_number = 1 and project_id = '<project_id>';
  ```
  After clearing, the Kickoff pre-fill worked correctly — user confirmed the fix.
- **Takeaway for future testing of this feature**: any project whose Kickoff step was opened
  before this fix (or before a `contacts.is_primary` row existed for its customer) will look
  "still broken" even after the fix ships, purely because of this stale-snapshot behavior.
  Always test pre-fill behavior against a project that has never had its Kickoff step opened,
  or clear `wizard_data.kickoff.contacts` first per the SQL above.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual/browser verification - PASS (user-confirmed live, post-migration, after clearing the
  stale Kickoff snapshot on the reused test project per the follow-up above)
