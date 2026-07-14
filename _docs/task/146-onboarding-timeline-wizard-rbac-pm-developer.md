# 146: Onboarding Timeline & Wizard — PM/Developer Role-Based Access

**Created:** 2026-07-14
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Testing

---

## Overview

Today, access to a project's Onboarding Timeline (`/v2/onboarding/[projectId]`) and the Phase 1
Onboarding Wizard inside it is gated to a single list — `marketing`, `admin`, `super_admin`
(`DETAIL_ROLES` in `page.tsx`) — everyone else (`pm`, `developer`, `hr`) is redirected back to the
read-only Onboarding list. The programme data itself (`customer_phases`, `customer_deliverables`,
`onboarding_internal_deliverables`) is *also* locked down at the database RLS layer to
`admin|super_admin|marketing` only (migration `060_onboarding_project_scoping.sql:99-111`), and
every write API route under `/api/projects/[projectId]/programme/*` enforces the same
`admin|super_admin|marketing` allow-list server-side.

Product now wants a three-tier split instead of the current all-or-nothing:

1. **Marketing / Admin / Super Admin** — unchanged. Full read/write on the Timeline and every
   Wizard step, including all checklists.
2. **PM** — can open the Timeline (read the 120-day chart) and the Wizard, but:
   - Steps 1–5 and 7 (Kickoff, Outcome target, Migration checklist, Content map, HTML mockup,
     Client sign-off) are **read-only** — no editing text fields, uploading/removing files, or
     toggling checklist items. PM can still navigate between steps to view them.
   - Step 6 (Storage folder + KB) is **fully editable** — PM can upload/remove/rename/move files,
     create/rename/delete folders, set permissions, and add/remove credentials & links — **except**
     that step's own checklist items (Branding guides, KB info (raw), DNS details, Credentials for
     external integrations) stay locked, same as steps 1–5/7.
   - PM cannot click "Complete Phase 1 & notify PM" (that's a checklist-completion action, and
     checklist editing is Marketing/Admin/Super Admin-only per the above).
3. **Developer** — can open the Timeline (read-only chart, all 5 phases) but **cannot** open the
   Wizard at all. This matches Developer's real scope: Phase 2 onward, which has no dedicated
   management UI yet (out of scope for this task — Developer gets Timeline visibility only here).

`customer_assets` / `customer_asset_folders` (the actual file/folder tables behind Step 6) already
have table-wide "authenticated can manage" RLS with app-layer visibility filtering via
`allowed_roles`/`allowed_user_ids` (migrations 021/057/065/067) — **no backend change needed there**
for PM to manage Step 6; the only backend gaps are (a) the Timeline detail route redirect, (b) the
`GET /api/projects/[projectId]/programme` read gate, and (c) DB-level SELECT on the three
programme tables. All *write* routes for phases/deliverables/internal-deliverables/wizard-data
already correctly stay `admin|super_admin|marketing`-only and must **not** change.

## Requirements

- [ ] `pm` and `developer` can open `/v2/onboarding/[projectId]` (the Timeline) without being
      redirected.
- [ ] `GET /api/projects/[projectId]/programme` returns data for `pm` and `developer`, not just
      `admin|super_admin|marketing`.
- [ ] DB RLS on `customer_phases`, `customer_deliverables`, `onboarding_internal_deliverables`
      allows `SELECT` for `pm` and `developer` in addition to `admin|super_admin|marketing`,
      while `INSERT`/`UPDATE`/`DELETE` on those three tables stays restricted to
      `admin|super_admin|marketing` only (no regression).
- [ ] On the Timeline page, write-only controls that would otherwise silently 403 for `pm`/
      `developer` — **Start Onboarding** and **Jump to phase** — are hidden for those two roles
      (Timeline is view-only for them at the phase-status level; Step 6 file actions are the one
      write surface PM keeps, handled inside the Wizard, not the Timeline).
- [ ] For `developer`: Phase 1 task bars/checklist badges on the Timeline are not clickable, and
      the "Onboarding Wizard" button does not appear. Developer never reaches the Wizard component.
- [ ] For `pm`: Phase 1 task bars/checklist badges and the "Onboarding Wizard" button work exactly
      as they do for Marketing/Admin/Super Admin — clicking opens the Wizard.
- [ ] Inside the Wizard, for `pm`:
  - Steps 1, 2, 3, 4, 5, 7: every text field, rich text editor, tag input, contact list, and file
    upload/remove control is disabled (view-only). Checklist toggle buttons on these steps are
    disabled.
  - Step 6: the File Explorer (upload, new folder, rename, move, delete, permissions) and
    Credentials & links (add/remove) remain fully interactive. That step's checklist toggle
    buttons are disabled.
  - `Continue`/`Back`/`Previous step` navigation still works on every step.
  - The required-field guard that normally blocks `Continue` (e.g. "Add the agreed measurable
    outcomes... before continuing") does not block PM navigation — PM can't fill those fields in,
    so the check must not fire for `pm`.
  - The "Complete Phase 1 & notify PM" button and the "Mark all as done" / force-confirm bypass
    flow are not shown to `pm` on the last step.
- [ ] Marketing/Admin/Super Admin behavior is byte-for-byte unchanged — every field, upload, and
      checklist toggle across all 7 steps still works exactly as today.
- [ ] `npx tsc --noEmit` passes.
- [ ] Once implemented and verified, update `_docs/onboarding-user-manual.md` — specifically
      Section 2 ("Who can use this") and the wizard-navigation notes in Section 7/Section 8 that
      currently state Wizard access is Marketing/Admin/Super Admin-only — to describe the new
      three-tier PM/Developer/Marketing split accurately.

## Out of Scope / Must-Not-Change

- Do not add any Phase 2–5 management UI for Developer — Timeline (read-only) visibility is the
  entire scope of Developer's access in this task.
- Do not change any `WRITE_ROLES`/`STAFF_ROLES` array on the *write* programme routes
  (`deliverables/[deliverableKey]`, `internal-deliverables/[deliverableKey]`, `wizard-data`,
  `complete-phase`, `phase`, `start`) — all stay `["admin", "super_admin", "marketing"]`.
- Do not touch `customer_assets`/`customer_asset_folders` RLS or their API routes' permission
  model — they're already unrestricted at the API layer by design (migration 057/067 comments);
  this task only needs the Wizard's own UI gating for PM/Developer on top of that.
- Do not change the Onboarding *list* page (`_onboarding-list.tsx`) — `pm`/`developer` already see
  the correct read-only card list there (task 145); this task is scoped to the project detail
  (Timeline) route and the Wizard.
- Do not change `hr`'s access — stays exactly as today (read-only list only, no Timeline/Wizard
  access); not mentioned in this task's requirements, so leave `DETAIL_ROLES` additions to just
  `pm` and `developer`.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/070_onboarding_pm_developer_read_access.sql` | Create | Split the `customer_phases`/`customer_deliverables`/`onboarding_internal_deliverables` "for all" RLS policies into a `select`-only policy including `pm`/`developer`, plus a write policy unchanged at `admin\|super_admin\|marketing` |
| `src/app/v2/(hub)/onboarding/[projectId]/page.tsx` | Modify | Add `pm`, `developer` to `DETAIL_ROLES`; pass `role` prop to `OnboardingDetail` |
| `src/app/api/projects/[projectId]/programme/route.ts` | Modify | Add `pm`, `developer` to `STAFF_ROLES` (read-only GET route) |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` | Modify | Accept `role` prop; hide Start Onboarding/Jump to phase for `pm`/`developer`; gate Phase 1 bar interactivity + "Onboarding Wizard" button on `role !== "developer"`; pass `role` down to `OnboardingWizard` |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Accept `role` prop; compute a per-step read-only flag; disable fields/uploads/checklist toggles on steps 1–5/7 for `pm`; keep Step 6 file/folder actions live for `pm` while locking its checklist; hide Complete Phase 1 action and bypass required-field Continue-guards for `pm`; thread a `disabled`/`readOnly` prop through `ContactsField`, `RichTextField`, `TagField`, `FileUploadBox`, `HtmlMockupFileList` |
| `_docs/onboarding-user-manual.md` | Modify (after implementation) | Update Section 2 and Wizard-navigation notes to describe the PM/Developer/Marketing split |

## Code Context

### `supabase/migrations/060_onboarding_project_scoping.sql:88-111` (current policies to split)

```sql
alter table onboarding_internal_deliverables enable row level security;
drop policy if exists "onboarding_internal_deliverables_staff" on onboarding_internal_deliverables;
create policy "onboarding_internal_deliverables_staff"
  on onboarding_internal_deliverables for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing'))
  with check (get_my_role() in ('admin', 'super_admin', 'marketing'));

drop policy if exists "customer_phases_staff_read" on customer_phases;
drop policy if exists "customer_phases_staff_write" on customer_phases;
create policy "customer_phases_marketing_only"
  on customer_phases for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing'))
  with check (get_my_role() in ('admin', 'super_admin', 'marketing'));

drop policy if exists "customer_deliverables_staff_read" on customer_deliverables;
drop policy if exists "customer_deliverables_staff_write" on customer_deliverables;
create policy "customer_deliverables_marketing_only"
  on customer_deliverables for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing'))
  with check (get_my_role() in ('admin', 'super_admin', 'marketing'));
```

New migration 070 should `drop` each `for all` policy and replace it with two policies per table
(select-only broadened, all-other-commands unchanged), e.g. for `customer_phases`:

```sql
drop policy if exists "customer_phases_marketing_only" on customer_phases;
create policy "customer_phases_marketing_write"
  on customer_phases for insert to authenticated
  with check (get_my_role() in ('admin', 'super_admin', 'marketing'));
create policy "customer_phases_marketing_update"
  on customer_phases for update to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing'))
  with check (get_my_role() in ('admin', 'super_admin', 'marketing'));
create policy "customer_phases_marketing_delete"
  on customer_phases for delete to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing'));
create policy "customer_phases_pm_developer_read"
  on customer_phases for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing', 'pm', 'developer'));
```

Repeat the same four-policy shape for `customer_deliverables` and
`onboarding_internal_deliverables` (same column/table names as above, just swap the table).
Postgres RLS `for insert/update/delete` split (rather than a single `for all` with a `select`
added separately) is required because a single policy's `using`/`with check` can't have different
role sets for read vs. write — this mirrors the existing four-policy split pattern already used
elsewhere in this schema for asymmetric read/write access.

### `src/app/v2/(hub)/onboarding/[projectId]/page.tsx` (current, full file)

```ts
const DETAIL_ROLES = ["marketing", "admin", "super_admin"];
...
if (!role || !DETAIL_ROLES.includes(role)) {
  redirect(V2_ROUTES.ONBOARDING);
}
...
return (
  <OnboardingDetail
    project={{ id: project.id, name: project.name, customer_id: project.customer_id, project_id: project.project_id, company_name: companyName }}
  />
);
```

Change `DETAIL_ROLES` to `["marketing", "admin", "super_admin", "pm", "developer"]` and pass
`role={role}` into `<OnboardingDetail>`.

### `src/app/api/projects/[projectId]/programme/route.ts:4`

```ts
const STAFF_ROLES = ["admin", "super_admin", "marketing"];
```

Change to `["admin", "super_admin", "marketing", "pm", "developer"]`. This is the only programme
route that changes — every PATCH/POST route under `programme/*` keeps its existing
`WRITE_ROLES = ["admin", "super_admin", "marketing"]` untouched.

### `_onboarding-detail.tsx` — relevant current pieces

`OnboardingDetailProps` (line 22-24):
```ts
interface OnboardingDetailProps {
  project: { id: string; name: string; customer_id: string; project_id: string | null; company_name: string };
}
```
Add `role: string | null;`.

`Swimlane`'s interactivity flag (line 445):
```ts
const interactive = phase.number === 1;
```
Change to something like `const interactive = phase.number === 1 && role !== "developer";` — thread
`role` down from `OnboardingDetail` into the `<Swimlane>` call (~line 917-939) the same way `startDate`
etc. are already threaded.

The pre-start screen's action buttons (lines ~751-761):
```tsx
<div className="flex items-center justify-center gap-2">
  <button type="button" onClick={handleStart} disabled={starting} ...>
    <PlayCircle size={15} /> {starting ? "Starting…" : "Start Onboarding"}
  </button>
  <JumpToPhaseMenu open={jumpOpen} setOpen={setJumpOpen} note={jumpNote} setNote={setJumpNote} onJump={handleJump} jumping={jumping} />
</div>
```
Wrap in `{role !== "pm" && role !== "developer" && (...)}` (or an equivalent `canManagePhases`
boolean) — for `pm`/`developer` on an unstarted programme, show the same explanatory copy without
action buttons.

The header card's `Jump to phase` + `Onboarding Wizard` button block (lines ~824-835):
```tsx
<div className="flex items-center gap-2">
  <JumpToPhaseMenu open={jumpOpen} setOpen={setJumpOpen} note={jumpNote} setNote={setJumpNote} onJump={handleJump} jumping={jumping} />
  {!isComplete && activePhaseNumber === 1 && (
    <button type="button" onClick={() => { setWizardStartStepKey(undefined); setWizardOpen(true); }} ...>
      <PlayCircle size={14} /> Onboarding Wizard
    </button>
  )}
</div>
```
Gate `<JumpToPhaseMenu>` on `role !== "pm" && role !== "developer"`, and gate the Wizard button's
condition on `role !== "developer"` in addition to the existing checks (so `pm` still sees it,
`developer` does not).

Finally, pass `role` into `<OnboardingWizard>` where it's rendered (~line 714):
```tsx
<OnboardingWizard
  project={project}
  ...
  isDark={false}
  ...
/>
```
Add `role={role}`.

### `_onboarding-wizard.tsx` — where to introduce the read-only mode

`OnboardingWizardProps` (line 81-92) needs `role: string | null;` added.

Near the top of the component body (after `const step = STEPS[stepIdx];` at line 351), compute:
```ts
const isPM = role === "pm";
const isStepReadOnly = isPM && step.key !== "storage-kb";
const canEditChecklist = !isPM; // storage-kb's own checklist stays locked for PM too
```

Every per-step JSX block for steps `kickoff`, `outcome-target`, `migration-checklist`,
`content-map`, `client-signoff` (lines ~1597-1949) and `html-mockup` (lines ~1951-1967) needs its
field components (`ContactsField`, plain `<input>`s, `TagField`, `RichTextField`, `FileUploadBox`,
`HtmlMockupFileList`) passed a disabling prop gated on `isStepReadOnly`. None of these components
currently accept a disabled/read-only prop — each needs one added:
- `ContactsField` (line 2137): add `disabled?: boolean` — disables add/remove/edit contact controls.
- `RichTextField` (line 2282): add `disabled?: boolean` — set the underlying editor's `editable`
  option to `!disabled` (or equivalent) and hide/disable the formatting toolbar.
- `TagField` (line ~2314 area, used for competitor URLs): add `disabled?: boolean` — disables the
  add-tag input and remove-tag buttons.
- `FileUploadBox` (line 2369): add `disabled?: boolean` — hides/disables the upload control and
  per-file remove button; `View`/preview stays available.
- `HtmlMockupFileList` (line 3931): add `disabled?: boolean` — same as `FileUploadBox` (view/edit
  preview can stay read-only-safe, i.e. the split-view HTML editor should also refuse saves when
  `disabled`, or simply not be openable — implementer's call, but no write must succeed).
- The plain `<input>` for "Current website URL" (kickoff step, ~line 1602-1609) needs a
  `disabled={isStepReadOnly}` directly.

The internal-deliverable checklist toggle buttons (lines 1981-1995, shared across all steps via
`stepInternal.map(...)`) need `disabled={togglingKey === ... || !canEditChecklist}` — this single
change covers both "steps 1-5/7 checklist locked" and "step 6 checklist locked" for PM, since
`canEditChecklist` is `false` for `pm` on every step.

`handleContinueClick` (line 1377) currently blocks on `isOutcomeFilled`/`isMigrationChecklistFilled`/
`isContentMapFilled` and on incomplete `stepInternal` items. For `pm`, none of these can ever be
satisfied (fields are read-only), so each guard must short-circuit to "just advance" when `isPM`
is true — e.g. wrap the existing body in `if (!isPM) { ...existing guards... }` before the final
`setStepIdx((s) => s + 1)`.

The last-step action area (lines 2019-2043: the "Complete Phase 1 & notify PM" button and its
surrounding warnings at lines 2003-2016) should not render for `pm` — wrap the `isLastStep` block
and the final button/`handleComplete` call in `role !== "pm"` (or show a neutral "Marketing
completes this phase" note instead of the button, implementer's call, but the button itself must
not be clickable by `pm`). Since `handleComplete`/`completePhase` ultimately hit
`admin|super_admin|marketing`-only server routes, this is a UX guard on top of an already-enforced
server-side boundary, not the sole line of defense.

## Implementation Steps

1. Write migration `070_onboarding_pm_developer_read_access.sql` splitting the three "for all"
   policies (`customer_phases`, `customer_deliverables`, `onboarding_internal_deliverables`) into
   separate insert/update/delete (marketing-only, unchanged) and select (+pm, +developer) policies,
   per the Code Context pattern above. Apply it (`supabase db push` or the project's normal
   migration-apply flow — check `env.example`/README for the exact command if unsure; do not guess
   a destructive command).
2. Update `GET /api/projects/[projectId]/programme`'s `STAFF_ROLES` to include `pm`, `developer`.
3. Update `[projectId]/page.tsx`: widen `DETAIL_ROLES`, pass `role` to `OnboardingDetail`.
4. Update `_onboarding-detail.tsx`:
   - Add `role` to `OnboardingDetailProps`.
   - Gate the pre-start screen's Start/Jump buttons, the header's Jump-to-phase menu, and the
     "Onboarding Wizard" button per the Requirements above.
   - Make `Swimlane`'s `interactive` flag role-aware (`developer` never interactive).
   - Pass `role` into `<OnboardingWizard>`.
5. Update `_onboarding-wizard.tsx`:
   - Add `role` to `OnboardingWizardProps`; compute `isPM`/`isStepReadOnly`/`canEditChecklist`.
   - Add a `disabled`/`readOnly` prop to `ContactsField`, `RichTextField`, `TagField`,
     `FileUploadBox`, `HtmlMockupFileList`, and thread `isStepReadOnly` into each usage across
     steps 1, 2, 3, 4, 5, 7 (not step 6's File Explorer/Credentials & links, which stay live for PM).
   - Disable the plain website-URL `<input>` on the Kickoff step for `isStepReadOnly`.
   - Disable every internal-deliverable checklist toggle button via `canEditChecklist`.
   - Make `handleContinueClick`'s required-field/incomplete-checklist guards a no-op for `isPM`.
   - Hide/disable the "Complete Phase 1 & notify PM" button and its warning copy for `isPM`.
6. Run `npx tsc --noEmit` and fix any type errors from the new props.
7. Manually verify in-browser as each role (see Verification below).
8. Once verified, update `_docs/onboarding-user-manual.md`:
   - Section 2 ("Who can use this") — describe the three-tier split accurately.
   - Section 6/7/8 — note that PM can open the Timeline and Wizard (view-only on steps 1-5/7,
     full file/folder management on Step 6, no Complete Phase 1 action), and Developer can view
     the Timeline only.

## Acceptance Criteria

- [ ] Logging in as `pm`, opening `/v2/onboarding`, clicking a project card opens the Timeline
      (no redirect).
- [ ] As `pm` on the Timeline: no "Jump to phase" or "Start Onboarding" buttons if the programme
      hasn't started; "Onboarding Wizard" button and Phase 1 bars are clickable and open the Wizard.
- [ ] As `pm` inside the Wizard: Steps 1-5 and 7 show existing saved content but every field is
      non-interactive (cannot type, upload, or toggle checklist items); Step 6 file upload, folder
      create/rename/delete/move, permissions, and credentials/links all work; Step 6's own
      checklist items are non-interactive; "Complete Phase 1 & notify PM" is not present/clickable.
- [ ] As `pm`, clicking "Continue" on any step (1-6) advances to the next step without being
      blocked by a required-field or incomplete-checklist modal.
- [ ] Logging in as `developer`, opening a project from `/v2/onboarding` opens the Timeline; Phase
      1 bars are not clickable, no "Onboarding Wizard" button appears, no Jump/Start buttons appear.
- [ ] Logging in as `marketing`/`admin`/`super_admin`: no behavior change anywhere — full edit
      access on every step, checklist toggles, and the Complete Phase 1 action all work as before.
- [ ] Logging in as `hr`: unchanged — still redirected away from the Timeline back to the
      read-only Onboarding list.
- [ ] `npx tsc --noEmit` passes.
- [ ] `_docs/onboarding-user-manual.md` reflects the new access rules.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser, for each of `marketing`, `pm`, `developer`, `hr` test accounts (or by temporarily
switching a test profile's `role` in `profiles`):
1. Open `/v2/onboarding` and confirm the card list behavior is unchanged for all roles (task 145).
2. Open a project as each role and confirm Timeline access matches Acceptance Criteria above.
3. As `pm`, open the Wizard on a project with existing Phase 1 data (or seed one) and click through
   all 7 steps confirming the read-only/editable split per step, then confirm no Complete Phase 1
   button is present on Step 7.
4. As `marketing`, run through the full wizard end-to-end (including Complete Phase 1) to confirm
   zero regression.

## Compatibility Touchpoints

- New Supabase migration (`070_...sql`) must be applied to every environment (local/staging/prod)
  before the code deploy that relies on `pm`/`developer` SELECT access — deploy migration first,
  same ordering convention as every other migration in this repo.
- No env var, package, or route-shape changes; no impact on the `(public)` onboarding form or any
  Zoho/Sanity/GitHub integration.

## Implementation Notes

### What Changed
- New migration `070_onboarding_pm_developer_read_access.sql` splits the previously single
  `for all` RLS policy on `customer_phases`, `customer_deliverables`, and
  `onboarding_internal_deliverables` into four policies each (insert/update/delete unchanged at
  `admin|super_admin|marketing`, plus a new `select` policy widened to also include `pm`/
  `developer`) — exactly the pattern from the task doc's Code Context.
- `GET /api/projects/[projectId]/programme`'s `STAFF_ROLES` widened to
  `["admin", "super_admin", "marketing", "pm", "developer"]`. Every write route under
  `programme/*` (`deliverables`, `internal-deliverables`, `wizard-data`, `complete-phase`,
  `phase`, `start`) was left untouched, as required.
- `[projectId]/page.tsx`: `DETAIL_ROLES` widened to include `pm`/`developer`; `role` is now
  passed into `<OnboardingDetail>`.
- `_onboarding-detail.tsx`: added `role` to `OnboardingDetailProps`; added `canManagePhases`
  (`role !== "pm" && role !== "developer"`) and `canOpenWizard` (`role !== "developer"`)
  booleans. The pre-start screen's Start Onboarding/Jump-to-phase buttons and the header's
  Jump-to-phase menu are now gated on `canManagePhases` (pm/developer see explanatory copy
  instead), and the "Onboarding Wizard" button additionally requires `canOpenWizard`.
  `Swimlane`'s `interactive` flag became `phase.number === 1 && role !== "developer"` so
  Phase 1 bars/checklist badges stay inert for developer. `role` is threaded down into both
  `Swimlane` and `OnboardingWizard`.
- `_onboarding-wizard.tsx`: added `role` to `OnboardingWizardProps`; computed `isPM`,
  `isStepReadOnly` (`isPM && step.key !== "storage-kb"`), and `canEditChecklist` (`!isPM`).
  Added an optional `disabled?: boolean` prop to `TagField`, `ContactsField`, `RichTextField`
  (synced into Tiptap via `editor.setEditable()` in a `useEffect`, plus hiding the formatting
  toolbar), `FileUploadBox`, and `HtmlMockupFileList` — each hides/disables its
  add/remove/upload/edit controls when `disabled` while leaving `View` live. Threaded
  `disabled={isStepReadOnly}` into every field usage across steps 1 (Kickoff), 2 (Outcome
  target), 3 (Migration checklist), 4 (Content map), 5 (HTML mockup), and 7 (Client sign-off) —
  Step 6 (Storage folder + KB)'s `StorageFileExplorer` and `AddCredentialLinkModal` were left
  completely untouched, per the requirement that PM keeps full file/folder/credential
  management there. `handleValidatedInternalToggle` now no-ops when `!canEditChecklist`, and
  every checklist toggle button's `disabled` prop includes `!canEditChecklist` — this single
  change locks the checklist on every step, including Step 6's own. `handleContinueClick`'s
  required-field/incomplete-checklist guards are now skipped entirely for `isPM` (they can
  never be satisfied by a read-only user), so Continue always just advances. The last step's
  warning copy and the "Complete Phase 1 & notify PM" button are hidden for `isPM`, replaced
  with a plain "Only Marketing/Admin can complete Phase 1" note — the button was never PM's to
  click, and the underlying route was already `admin|super_admin|marketing`-only server-side.

### Files Changed
- `supabase/migrations/070_onboarding_pm_developer_read_access.sql` — new, RLS split (not yet
  applied — see Deviations).
- `src/app/api/projects/[projectId]/programme/route.ts` — widened `STAFF_ROLES`.
- `src/app/v2/(hub)/onboarding/[projectId]/page.tsx` — widened `DETAIL_ROLES`, pass `role` prop.
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` — `role` prop, phase-action
  gating, `Swimlane` interactivity, `role` threaded to `OnboardingWizard`.
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — `role` prop, PM read-only
  computation, `disabled` prop added to 5 shared field components, wired through steps 1-5/7,
  checklist lock, Continue-guard bypass, Complete Phase 1 button hidden for PM.

### Deviations From Plan
- None in code shape — implementation matches the task doc's Code Context and Implementation
  Steps exactly, including the exact four-policy-per-table RLS split and the `isStepReadOnly`/
  `canEditChecklist` naming proposed in the doc.
- The new migration was **not applied** to any Supabase environment this session — per this
  repo's established convention (every prior migration-adding task, e.g. 141/142/144, leaves
  `supabase db push`/dashboard application to the user with their own credentials). `pm`/
  `developer` Timeline access will 500/403 at the data layer until the user applies
  `070_onboarding_pm_developer_read_access.sql`.
- Did not add a Phase 2-5 management UI for Developer — explicitly out of scope per the task doc.

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS
- Manual/browser role-by-role walkthrough (marketing/pm/developer/hr) — SKIPPED this session:
  requires the migration above to be applied first (pm/developer reads would otherwise fail at
  the RLS layer even though the app code is correct), and no test accounts for those roles were
  exercised live. Recommend running the Verification section's manual steps once the migration
  is applied.
