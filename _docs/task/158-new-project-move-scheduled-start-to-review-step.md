# 158: New Project — Scheduled Start Redesign: Date/Time Picker, Phase-Aware Scheduling, QStash + Cron Reliability

**Created:** 2026-07-15
**Priority:** LOW
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Completed (2026-07-16)

**Retitled** from the original "Move 'Scheduled Start' from Project Details to Review & Create" —
that shipped as originally scoped (see Implementation Notes below), but the same live-testing
session kept surfacing follow-up work on the exact same feature: a real native-picker UX
complaint, then a genuine "why didn't this actually start" production bug that traced all the way
down to cron jobs across the whole app never having been configured at all. All of it landed here
as one continuous thread rather than spinning up new task docs per round, matching this repo's
established convention for chat-driven live-test iteration on a single doc (see task 155's
Implementation Notes for the same pattern). See "Follow-Up Implementation Notes" below for the
full round-by-round breakdown.

---

## Overview

The "Scheduled start" datetime field currently lives on step 2 ("Project Details",
`_content.tsx:757-767`), shown unconditionally with a helper note that it's "Optional — only
required for 'Save + Set Schedule'." The user wants it removed from step 2 entirely and instead
surfaced on step 3 ("Review & Create"), appearing/expanding **when the "Save + Set Schedule"**
button is clicked — i.e. that button's first click reveals the date picker inline instead of
submitting immediately with whatever `scheduledAt` happened to be set on step 2 (today, likely
blank, since the field was easy to skip on step 2).

**Design call (flagging, not blocking):** "show/expand it... when the button is clicked" is
interpreted as a two-click flow: the first click on "Save + Set Schedule" expands an inline
datetime field (and the button becomes "Confirm Schedule" or similarly relabeled) instead of
submitting; a second click, only enabled once a valid datetime is chosen, performs the actual
`submit("save_scheduled")` call. This avoids submitting a "save_scheduled" project with no
schedule set (today's `submit()` already guards against that with `setSubmitError("Pick a
schedule date/time...")`, but that guard fires *after* a click with no visible field to fill in,
which reads as broken). If the user meant something simpler (e.g. the field is just always
visible on step 3 but visually de-emphasized until that specific button is hovered/clicked), that
can be adjusted post-implementation — this is a small, easily-tweaked UI behavior, not treated as
worth blocking on user confirmation before starting given how contained the change is.

## Requirements

- [ ] Remove the "Scheduled start" `Field` and its helper text from step 2
      (`_content.tsx:757-767`). Step 2 keeps only "Project name" from this block.
- [ ] On step 3, clicking "Save + Set Schedule" while the datetime field is not yet shown expands
      an inline `Field` (type `datetime-local`, same as today's) directly below/near that button,
      and the button does **not** submit on this first click.
- [ ] Once expanded, the (relabeled, e.g. "Confirm & Schedule") button click with a non-empty
      `scheduledAt` performs the existing `submit("save_scheduled")` call, unchanged.
- [ ] Clicking the button again with the field still empty keeps the existing inline validation
      message ("Pick a schedule date/time to Save + Set Schedule.") rather than a silent no-op.
- [ ] The expanded field must be collapsible/cancelable back to the two-button row (e.g. an "×" or
      switching to "Just save"/"Start onboarding" collapses it) so the layout doesn't get stuck
      expanded if the user changes their mind.
- [ ] Review step's existing conditional `ReviewRow` for "Scheduled start" (`_content.tsx:788-793`,
      shown only `{scheduledAt && ...}`) stays as-is — it will now naturally reflect the
      step-3-entered value instead of a step-2-entered one.

## Out of Scope / Must-Not-Change

- Do not change the `submit()` function's existing validation/API-call logic — only where/when the
  `scheduledAt` input is rendered and how the button's first click behaves.
- Do not change "Just save" or "Start onboarding (Day 1 now)" button behavior — untouched.
- Do not add a new API field or migration — `scheduled_start_at` is already submitted the same way.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/onboarding/new/_content.tsx` | Modify | Remove step-2 scheduled-start field; add expand-on-click behavior to step 3's "Save + Set Schedule" button |

## Code Context

### Step 2 field to remove (`_content.tsx:743-768`)

```tsx
<div className="flex flex-col gap-4.5">
  <Field id="project-name" label="Project name" ... />
  <div className="flex flex-col gap-1.5">
    <Field id="scheduled-start" label="Scheduled start" type="datetime-local" value={scheduledAt} onChange={setScheduledAt} icon={<CalendarClock size={15} />} />
    <p className="text-xs text-[#94A3B8]">Optional — only required for &quot;Save + Set Schedule&quot;.</p>
  </div>
</div>
```

Becomes: keep only the `project-name` `Field`; delete the `scheduled-start` block (state
`scheduledAt`/`setScheduledAt` stays — now driven from step 3).

### Step 3 buttons (`_content.tsx:849-866`) — current

```tsx
<div className="flex gap-2.5">
  <button type="button" onClick={() => submit("save")} ...>Just save</button>
  <button type="button" onClick={() => submit("save_scheduled")} ...>Save + set schedule</button>
</div>
```

Becomes: add a `scheduleExpanded` boolean state; "Save + Set Schedule" click branches on it:

```tsx
const [scheduleExpanded, setScheduleExpanded] = useState(false);

{scheduleExpanded && (
  <div className="flex flex-col gap-1.5 mb-2.5">
    <Field id="scheduled-start" label="Scheduled start" type="datetime-local" value={scheduledAt} onChange={setScheduledAt} icon={<CalendarClock size={15} />} />
  </div>
)}
<div className="flex gap-2.5">
  <button type="button" onClick={() => submit("save")} disabled={!!submitting}>Just save</button>
  <button
    type="button"
    onClick={() => {
      if (!scheduleExpanded) { setScheduleExpanded(true); return; }
      submit("save_scheduled");
    }}
    disabled={!!submitting}
  >
    {submitting === "save_scheduled" ? "Saving…" : scheduleExpanded ? "Confirm & schedule" : "Save + set schedule"}
  </button>
</div>
```

`submit()`'s existing `if (mode === "save_scheduled" && !scheduledAt) { setSubmitError(...); return; }`
guard (`_content.tsx:482-484`) stays untouched and still fires correctly on the confirm click.

## Implementation Steps

1. Remove the step-2 "Scheduled start" `Field` block; keep `scheduledAt`/`setScheduledAt` state
   declarations as-is.
2. Add `scheduleExpanded` state (default `false`).
3. On step 3, render the datetime `Field` conditionally above the two-button row when
   `scheduleExpanded` is true.
4. Change the "Save + Set Schedule" button's `onClick` to expand-then-confirm as shown above;
   update its label to reflect state.
5. Reset `scheduleExpanded` to `false` on `goBack()` from step 3, so re-entering the review step
   doesn't leave it stuck expanded from a prior visit (only relevant if the user navigates
   back-and-forth between steps 2 and 3 before submitting).

## Acceptance Criteria

- [ ] Step 2 no longer shows a "Scheduled start" field.
- [ ] On step 3, the first click on "Save + Set Schedule" reveals the datetime field without
      submitting.
- [ ] A second click with a valid datetime submits via `mode: "save_scheduled"` exactly as before.
- [ ] A second click with the field still empty shows the existing "Pick a schedule date/time..."
      error instead of silently failing.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser: walk through the wizard to step 3, click "Save + Set Schedule" once (field should
appear, no network call), fill a date, click again (should submit and redirect to the success
screen); repeat clicking without filling a date to confirm the error path.

## Compatibility Touchpoints

- None — pure client-side UI reflow, no API/schema change.

## Implementation Notes

### What Changed
- Removed the step-2 "Scheduled start" `Field` + helper text block; step 2 now only shows
  "Project name". `scheduledAt`/`setScheduledAt` state kept as-is, per the plan.
- Added `scheduleExpanded` boolean state (default `false`). Step 3's "Save + Set Schedule" button
  now branches on it: first click sets `scheduleExpanded` true and returns (no submit); once
  expanded, the same button (relabeled "Confirm & schedule") calls `submit("save_scheduled")`
  exactly as before.
- The expanded datetime `Field` renders directly above the two-button row, paired with an "×"
  icon button that collapses it back (resets `scheduleExpanded`, clears `scheduledAt`, and clears
  any stale `submitError`) — satisfies the doc's "must be collapsible/cancelable" requirement.
- `goBack()` now resets `scheduleExpanded` to `false` whenever leaving step 3, so navigating back
  to step 2 and returning to step 3 doesn't leave the field stuck expanded from a prior visit.
- `submit()`'s existing `mode === "save_scheduled" && !scheduledAt` guard, the review step's
  conditional "Scheduled start" `ReviewRow`, and the "Just save"/"Start onboarding" buttons were
  left untouched, per Out of Scope.
- Added `X` to the `lucide-react` import for the collapse button's icon.

### Files Changed
- `src/app/v2/(hub)/onboarding/new/_content.tsx` - moved scheduled-start field from step 2 to an expand-on-click field on step 3

### Deviations From Plan
- None — implementation matches the task doc's Code Context, including its own flagged
  interpretation of "expand on click" as a two-click confirm flow (not blocked on user
  confirmation per the doc's own note that this is easily tweaked post-implementation).

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual/browser verification - SKIPPED (Claude in Chrome extension not connected this session).
  The doc's walkthrough — click "Save + Set Schedule" once (field appears, no network call), fill
  a date, click again (submits and redirects), then repeat without filling a date to confirm the
  existing error path — still needs to be exercised in the browser before this ships.

## Follow-Up Implementation Notes

Everything below happened in the same live-testing thread as the original implementation, on the
same "Scheduled start" feature, and is bundled into this one doc rather than opened as separate
tasks. `npx tsc --noEmit`, `pnpm lint`, and `pnpm build` all passed clean after every round unless
noted otherwise. Live/manual verification (browser click-throughs, real cron/QStash firing) was
confirmed directly by the user in their own environment for Rounds 8-9, since the Claude in Chrome
extension wasn't available this session.

### Round 1 — Fixed a pre-existing duplicate error message (aside, found live)
`Field` already renders its own `error` message internally, but a leftover standalone error
`<span>` — originally meant only for the "existing company" search view (a plain `<input>` with
no built-in error display) — rendered unconditionally, doubling "Company name is required." in
"New company" mode. Gated it to `companyMode === "existing"` only.

### Round 2 — Auto-populate primary contact when selecting an existing company
New `GET /api/customers/[customerId]/primary-contact` — reads `contacts` where `is_primary = true`
via `adminClient` (marketing isn't covered by `contacts_staff_read` RLS, migration 056, same gap
`upsertPrimaryContact`/the onboarding wizard's own page.tsx query already work around). Selecting
an existing company in step 1 now fetches and pre-fills Primary contact/Contact email/Phone. Added
a `contactLoading` state and a `disabled` prop on `Field`; while fetching, all three contact fields
disable and show "Loading full name…" / "Loading email address…" / "Loading phone number…" in
place of their normal placeholders.

### Round 3 — Company/Project name duplicate-check validation
New `GET /api/customers/check-name` and `GET /api/onboarding/projects/check-name` (case-insensitive
exact match via `ilike`, no wildcards). `goNext()` became async: step 1 blocks advancing with "A
company with this name already exists." for **new** companies only (selecting an existing company
is intentional reuse, not a duplicate); step 2 blocks with "A project with this name already
exists." Both validated server-side, not just as a client nicety. The "Continue" button disables
and reads "Checking…" while either check is in flight.

### Round 4 — "Start at Phase" dropdown + immediate phase-jump on create
Extended the New Project wizard's "Start Now" flow to be phase-aware (this intersects with task
157's multi-select classification work, done in the same session). Added
`canManagePhases = role !== "pm" && role !== "developer"` — copied verbatim from
`_onboarding-detail.tsx`'s existing predicate, since jumping to a later phase is deliberately
admin/super_admin/marketing-only there too. admin/super_admin/marketing now see a "Start at phase"
dropdown (`PROGRAMME_PHASES`) above the button, whose label becomes "Start Phase {N}: {Name} Now";
pm keeps the original single "Start onboarding (Day 1 now)" button, unchanged. Phase 1 reuses the
existing `mode: "start"` create path untouched; phase 2-5 creates via `mode: "save"` then calls the
Timeline's existing `PATCH .../programme/phase` ("Jump to phase") route — reusing established
seeding logic rather than duplicating it. Also added a first-pass date-range constraint (`min`/`max`
HTML attributes, now/+1 year) to the still-native `datetime-local` scheduled-start field — later
superseded by Round 6's custom picker.

### Round 5 — "Confirm & schedule" design parity, hide "Start Now" while scheduling, "Just save" clears the schedule
Three small UX fixes requested together: (1) the "Start Phase N Now" button (and its dropdown)
now hides once "Save + Set Schedule" is clicked (`scheduleExpanded`), since you're choosing to
schedule instead of starting immediately — the phase dropdown itself stays visible so scheduling
still respects whichever phase was selected; (2) once expanded, "Confirm & schedule" is restyled
to match "Start Now"'s gradient-blue/bold/Check-icon/shadowed look instead of the plain outlined
secondary-button style; (3) "Just save" now resets `scheduledAt`/`scheduleExpanded` before
submitting, so backing out of scheduling and just saving doesn't leave stale schedule state around.

### Round 6 — Custom date/time picker (react-day-picker), replacing the native `datetime-local` input
The native picker renders completely differently per browser/OS (Chrome's inline spinner vs.
Safari's wheel UI vs. Firefox's), which the user flagged directly from a screenshot. Installed
`react-day-picker@10.0.1` (headless/unstyled by default, no CSS import, exactly the shadcn-style
`Calendar` pattern this stack already leans toward) — chosen over `react-datepicker` specifically
to avoid fighting a shipped default stylesheet. Built a from-scratch `DateTimePicker` (calendar
grid restyled via `classNames` to match this file's hex-based design tokens, `disabled={{ before,
after }}` enforcing the date-range constraint natively in the calendar itself, plus an hour/minute
`<select>` pair and an AM/PM segmented toggle reusing the file's existing "New company/Existing
company" toggle style) with click-outside-to-close (same `mousedown`/ref-contains pattern already
established in `_onboarding-detail.tsx`). Follow-up: auto-flip positioning — a `useLayoutEffect`
measures the trigger's position and the panel's rendered height and flips the panel to render
above (`bottom-[calc(100%+6px)]`) instead of below when there isn't enough room, so opening the
picker near the bottom of the viewport never forces extra scrolling.

### Round 7 — Scheduled start becomes phase-aware end-to-end, and the Timeline's not-started card gets a matching redesign
Migration 076: `projects.scheduled_start_phase` (nullable smallint 1-5, null = Phase 1 for backward
compatibility with every already-scheduled project). `POST /api/onboarding/projects` validates
`start_phase` server-side, requiring admin/super_admin/marketing for anything but 1 — mirrors the
immediate-start permission boundary exactly, never trusting the client's dropdown gating alone.
`seedAndStartProgramme` (`src/lib/programme/seed.ts`) generalized to accept an optional
`phaseNumber` (default 1), unifying the plain Phase-1 seed path and the Timeline's "Jump to phase"
seed logic (backdate `programme_started_at` so "today" lands on the target phase's first day,
earlier phases "skipped", `is_manual_override` only set for phaseNumber ≠ 1) into one function
instead of two near-duplicates. `scheduled-autostart`'s cron route reads `scheduled_start_phase`
and passes it through. Separately, redesigned `_onboarding-detail.tsx`'s not-started card
(`_onboarding-detail.tsx`) for the scheduled case: shows a "Scheduled to auto-start" message with
the exact date/time and target phase name, a "Start Phase {N}: {Name} Anyway" button, a
"— OR —" divider, and a "Select Phase" dropdown (excludes the already-scheduled phase, since
that's what the "Anyway" button already covers) that reveals a "Proceed" button once a phase is
picked. Both paths route through a new `startAtPhase()` helper that branches on phase 1 vs. other
(preserving Phase-1-only ownership assignment via the existing `handleStart`, and reusing
`handleJump` for anything else) rather than introducing a third seeding path.

### Round 8 — Root-caused and fixed: the scheduled auto-start cron had never actually fired in production
Diagnosed live after a scheduled test project's start time passed with nothing happening. Found
that **all 5** cron-triggered jobs in this app (`daily-pm-digest`, `weekly-wiki-lint`,
`zoho-tasklists-sync`, `daily-programme-reminders`, and `onboarding-scheduled-autostart`) were
registered at their original migrations with unfilled `REPLACE_WITH_APP_URL` /
`REPLACE_WITH_DIGEST_SECRET` placeholders — as far as this migration history shows, none of them
had ever successfully fired. Fixed via Supabase Vault rather than hardcoding real values into a
git-tracked migration: migration 077 converts `onboarding-scheduled-autostart` to look up
`app_base_url`/`cron_secret_key` from `vault.decrypted_secrets` by name at execution time; migration
078 converts the other 4. Also renamed the shared secret app-wide (user's request, since "digest"
stopped being accurate once 4 unrelated routes started sharing it): `DIGEST_SECRET` →
`CRONJOB_SECRET_KEY` env var, `x-digest-secret` → `x-cron-secret` header, across all 5 routes plus
`env.example`/`CLAUDE.md`. Migration 079 tightened only `onboarding-scheduled-autostart`'s interval
from 15 to 5 minutes (the other 4 stay daily/weekly, correctly). Live-diagnosed a second real bug
via `cron.job_run_details`/`net._http_response`: the Vault secrets hadn't actually been created yet
(`select id, name from vault.secrets` returned zero rows), so the Vault lookup resolved to `NULL`,
and `NULL || '/api/...'` is `NULL` in SQL — violating `net.http_request_queue.url`'s `NOT NULL`
constraint. Fixed by the user running `vault.create_secret(...)` for both secrets. User confirmed
live: the cron fallback successfully auto-started the pre-existing "Test Website" test project
once the Vault secrets existed.

### Round 9 — QStash: one-shot exact-time trigger, cron kept as a fallback safety net
User-directed architecture change after discussing alternatives (Vercel Cron, per-project one-off
`pg_cron` jobs, QStash) — chose Upstash QStash specifically because cron only guarantees firing
"within the poll interval," not at the exact scheduled instant. Installed `@upstash/qstash@2.11.2`.
New `src/lib/qstash/index.ts` (`scheduleProjectAutostart`/`cancelProjectAutostart`, both fail soft
to a no-op if `QSTASH_TOKEN`/`NEXT_PUBLIC_APP_URL` aren't configured — never blocks project
creation). Migration 080: `projects.qstash_message_id`, tracking the pending message so a manual
override can cancel it. New callback route `POST
/api/onboarding/projects/[projectId]/qstash-start`, signature-verified via
`verifySignatureAppRouter` and idempotent (checks `programme_started_at` before doing anything, so
a stray retry or a manual override that beat the schedule to it is a harmless no-op). Wired into
`POST /api/onboarding/projects` (schedules on `save_scheduled` create, `notBefore` set to the exact
scheduled instant) and both manual-override routes (`programme/start`, `programme/phase` PATCH),
which now cancel any pending QStash message when a manual start/jump beats the schedule to it. The
existing cron poll is intentionally left completely untouched as a fallback — deliberate
redundancy, not leftover cruft, in case a QStash delivery ever fails.

Two real bugs found and fixed during this round, both live-diagnosed from actual error output
rather than guessed at:
- **Build-breaking config-loading bug**: `verifySignatureAppRouter` throws *synchronously at
  module-load time* if `QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY` are absent — this
  broke `pnpm build`/`pnpm dev` for the **entire app**, not just this one route, until QStash was
  configured. Fixed by only wrapping the handler with signature verification when both keys are
  present; otherwise the route exports a plain 501 "not configured" response instead of taking the
  whole build down.
- **Region-routing bug (live, post-deploy)**: QStash's global endpoint (`qstash.upstash.io`) routed
  the publish call to `eu-central-1`, but the user's QStash token/user only exists in `us-east-1`,
  producing `"user ... not found in this region"`. Fixed by setting
  `QSTASH_URL=https://qstash-us-east-1.upstash.io` in Vercel — the SDK reads this env var
  automatically as an override to the global endpoint (confirmed directly from the installed
  package's source, `readEnvironmentVariables(["QSTASH_URL", "QSTASH_TOKEN"], ...)`), so no code
  change was needed, just the env var + a redeploy.

Also verified via schema inspection (not just assumption, since the user asked directly whether a
QStash/cron race could cause an error) that a near-simultaneous QStash delivery and cron tick for
the same project cannot corrupt data: `customer_phases` (`unique (project_id, phase_number)`),
`customer_deliverables` (`unique (project_id, phase_number, deliverable_key)`), and
`onboarding_internal_deliverables` (`unique (project_id, deliverable_key)`) all carry `project_id`-
scoped unique constraints — a losing racer's insert cleanly fails with a caught Postgres 23505
error (already handled by `seedAndStartProgramme`'s existing error branch) rather than creating
duplicate rows.

User confirmed both mechanisms live in production: the cron fallback auto-started a pre-existing
scheduled project (Round 8), and after the region fix, QStash successfully delivered exact-time for
a newly-scheduled test project.

### Files Changed (cumulative, all rounds)
- `src/app/v2/(hub)/onboarding/new/_content.tsx` - contact fetch/loading, duplicate-name checks, phase dropdown + Start-Now/Anyway flow, custom DateTimePicker, schedule button redesign
- `src/app/v2/(hub)/onboarding/new/page.tsx` - passes `role` down for `canManagePhases`
- `src/app/v2/(hub)/onboarding/[projectId]/page.tsx` - fetches/passes `scheduled_onboarding_start_at`/`scheduled_start_phase`
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` - scheduled-aware not-started card redesign, `startAtPhase()` helper
- `src/app/api/onboarding/projects/route.ts` - `start_phase` validation, QStash scheduling call
- `src/app/api/onboarding/scheduled-autostart/route.ts` - phase-aware, cron secret rename
- `src/app/api/onboarding/projects/[projectId]/qstash-start/route.ts` - new, QStash callback
- `src/app/api/onboarding/projects/check-name/route.ts` - new
- `src/app/api/customers/check-name/route.ts` - new
- `src/app/api/customers/[customerId]/primary-contact/route.ts` - new
- `src/app/api/projects/[projectId]/programme/start/route.ts` - QStash cancel on manual start
- `src/app/api/projects/[projectId]/programme/phase/route.ts` - QStash cancel on manual jump
- `src/app/api/digest/route.ts`, `src/app/api/kb/lint/route.ts`, `src/app/api/admin/zoho-sync/tasklists/route.ts`, `src/app/api/programme/reminders/route.ts` - cron secret rename
- `src/lib/programme/seed.ts` - phase-aware unification of the two seeding paths
- `src/lib/qstash/index.ts` - new
- `src/types/database.ts` - `scheduled_start_phase`, `qstash_message_id` columns
- `env.example`, `CLAUDE.md` - cron/QStash env var documentation
- `supabase/migrations/076_projects_scheduled_start_phase.sql` - new
- `supabase/migrations/077_scheduled_autostart_cron_vault.sql` - new
- `supabase/migrations/078_cron_jobs_vault_rename.sql` - new
- `supabase/migrations/079_scheduled_autostart_cron_5min.sql` - new
- `supabase/migrations/080_projects_qstash_message_id.sql` - new

### Final Verification
- `npx tsc --noEmit` - PASS (after every round)
- `pnpm lint` - PASS (after every round)
- `pnpm build` - PASS (full production build, after every round involving server/route changes)
- Live/manual verification - CONFIRMED by the user in their own environment: cron fallback
  auto-started a real pre-existing scheduled project; QStash delivered exact-time for a real newly
  scheduled project after the region fix.
