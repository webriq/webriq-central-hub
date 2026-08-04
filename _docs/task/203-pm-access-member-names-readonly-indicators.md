# 203: Portfolio Tracker & Onboarding Wizard — PM Membership Access, Member-Name RLS Bugs, Read-Only Field Indicators

**Created:** 2026-08-04
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Completed (2026-08-04)

---

## Overview

Live, user-driven debugging session on `/v2/portfolio-tracker` and its `[projectId]` detail/Wizard page, triggered by the user testing the app logged in as `pm`. Five separate but related problems surfaced in sequence, each investigated and fixed in the same session:

1. PM couldn't click into a project from the Portfolio Tracker list even when a member of it — the list's `editable` gate was purely role-based (`marketing`/`admin`/`super_admin`), with no membership awareness at all.
2. After fixing (1), PM still hit a "Restricted" screen opening the Wizard — a second, stricter gate (`phase_members` for Phase 1 specifically) is separate from general project membership (`project_members`), and PM had the latter but not the former.
3. Collaborator/member avatars showed "Unnamed" on the Portfolio Tracker list.
4. The project detail page's Owner/Collaborators row showed "Unassigned"/"Unnamed" even though the project had real members.
5. Wizard fields the current user can't edit (read-only steps, or Step 6 upload controls) gave no visual/textual indication of *why* — controls just silently disabled or disappeared, with no explanatory message or `not-allowed` cursor.

No database migration involved. All fixes are application-code only.

## What Changed

### 1. Portfolio Tracker list — membership-aware click-through (`_onboarding-list.tsx`, `page.tsx`)
- `page.tsx` now passes `currentUserId` down to `OnboardingList`.
- Replaced the single role-only `editable` boolean with a per-card `canOpenProject(item)` check: `marketing`/`admin`/`super_admin` still always open it; a gated role (`isRoleGatedByMembership` — `pm`/`marketing`) additionally opens it if `currentUserId` appears in that project's `members` list (the existing task-154 deduped union of `project_members` + Phase-1 `phase_members`).
- Footer disclaimer only renders when at least one visible project isn't openable, and its copy no longer claims access is "restricted to Marketing" (inaccurate once PM-by-membership access exists).

### 2. Wizard "Restricted" gate — project membership sufficient for `pm` (`_onboarding-detail.tsx`)
- `isPhase1Restricted` was gated purely on `phase_members` (Phase 1) rows, a separate table from `project_members`. A PM who was a project member but never explicitly added to `phase_members(phase_number=1)` was blocked from the Wizard entirely.
- Per direct user clarification ("PM is project manager" — i.e. the project's own manager, not a phase-specific contributor like marketing), added `isProjectMember` and `hasPhase1Access = isPhase1Member || (role === "pm" && isProjectMember)`. `marketing` is untouched and still requires explicit Phase 1 membership, per task 153 requirement 4's original, explicit "marketing is also phase-gated, not just pm."

### 3 & 4. "Unnamed"/"Unassigned" member names — `profiles` RLS gap, not a data bug
Root cause (same across all six sites below): `profiles_read_own` RLS (migration 048) only lets a caller read their own `profiles` row, or every row if `admin`/`super_admin`. Every embedded `profiles(full_name, role)` PostgREST sub-select, and every plain `profiles` lookup, run through the RLS-bound client therefore returned nothing for teammates when the caller was `pm`/`marketing` — rendering as "Unnamed" (collaborator/avatar chips) or "Unassigned" (Owner). Fixed by switching each read to `adminClient` (bypasses RLS, read-only display lookup, no access-control decision at stake), matching the pattern already established in this codebase for the same class of gap (contacts lookup in `_load-detail-data.ts`).

Six sites fixed:
- `src/app/api/onboarding/projects/route.ts` — member full-name lookup powering the list page's avatar stack.
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_load-detail-data.ts` — Phase 1 members query, project members query, and the creator-name fallback query (all server-side initial load).
- `src/app/api/projects/[projectId]/members/route.ts` GET — project members client-side refetch (fires after add/remove/transfer).
- `src/app/api/projects/[projectId]/programme/phases/[phaseNumber]/members/route.ts` GET — Phase 1 members client-side refetch.

### 5. Wizard read-only fields — message + `not-allowed` cursor (`_onboarding-wizard.tsx`)
New shared `ReadOnlyHint` component (`Lock` icon + "Read-only — you don't have edit access to this step", `cursor-not-allowed`; `compact` variant for inline add-row spots, boxed variant sized to match an upload dropzone) wired into every shared field component so the treatment applies uniformly across all gated steps (1–5/7), not just the step it was first reported on:
- `ContactsField` — mini inputs get `disabled:cursor-not-allowed`; the hidden "Add contact" button spot now shows the hint.
- `TagField` (competitor/reference URLs) — hidden add-row spot shows the hint.
- `RichTextField` (business facts, additional notes, every `UploadFirstField` step's notes editor) — bordered container gets `cursor-not-allowed`, hint renders below it.
- `FileUploadBox` / `HtmlMockupFileList` — the dropzone is replaced by the boxed hint instead of silently vanishing.
- Raw "Current website URL" input — `disabled:cursor-not-allowed` added; hint replaces the "Leave blank if none." text when read-only.
- Phase 1 checklist toggle button — cursor changed `cursor-default` → `cursor-not-allowed`; the existing hover-Tooltip (previously only "Mark as Done"/"Uncheck") now shows the read-only message when `!canEditChecklist`.

## Files Changed

| File | Change |
|------|--------|
| `src/app/v2/(hub)/portfolio-tracker/page.tsx` | Pass `currentUserId` to `OnboardingList` |
| `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` | Membership-aware `canOpenProject()` replacing role-only `editable`; footer copy fix |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` | `hasPhase1Access` — project membership sufficient for `pm`'s Wizard gate |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` | New `ReadOnlyHint` component; wired into `ContactsField`, `TagField`, `RichTextField`, `FileUploadBox`, `HtmlMockupFileList`, the website-URL input, and the checklist toggle button |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_load-detail-data.ts` | `adminClient` for phase1Members/projectMembers/creator-name queries |
| `src/app/api/onboarding/projects/route.ts` | `adminClient` for member full-name lookup |
| `src/app/api/projects/[projectId]/members/route.ts` | `adminClient` for GET member list |
| `src/app/api/projects/[projectId]/programme/phases/[phaseNumber]/members/route.ts` | `adminClient` for GET phase member list |

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Both clean after every fix in this session. No `pnpm build`/browser verification run in this environment — deferred to the user's own live pass as a `pm` account that is a project member but not a Phase-1 member.

## Implementation Notes

### Deviations From a Formal Plan
This task was executed as a live back-and-forth debugging session (user reporting each issue with a screenshot, one at a time) rather than from a pre-written plan — no `_docs/task/` document existed before this one; it is written retroactively to record the full session. One deliberate scope decision made mid-session via direct user clarification, not assumed: whether PM's Wizard access should be project-membership-based or require a separate Phase-1 opt-in — the user's answer ("PM is project manager") decided it in favor of `pm`-only project-membership-sufficiency, leaving `marketing`'s stricter phase-level gate (task 153's explicit original requirement) untouched.

### Verification Run
- `npx tsc --noEmit` — PASS after every edit in this session
- `pnpm lint` — PASS, no new warnings/errors in any touched file
- Manual/browser verification — not run in this session; flagged for the user's own live pass
