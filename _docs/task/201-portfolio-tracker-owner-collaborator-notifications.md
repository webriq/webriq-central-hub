# 201: Portfolio Tracker — Notifications for Set Project Owner & Add Collaborators

**Created:** 2026-08-03
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Completed (2026-08-03)

---

## Overview

The Portfolio Tracker project detail page (`/v2/portfolio-tracker/[projectId]`) has a gear-icon "Project Settings" menu with two actions: **Set Project Owner** and **Add Collaborators** (task 157). Today these actions silently update `project_members` — no one is told. This task wires both actions into the existing in-app notification system (`notifications` table, bell dropdown, `src/lib/notifications`) so:

- The person made owner, or newly added as a collaborator, gets a "you" notification.
- Every other existing project member gets a third-person notification naming who did what.
- The actor who triggered the action never gets notified about their own action (decided during planning — matches how most notification systems suppress self-notifications; the actor already sees the result live in the panel).
- The notification shows the actor's avatar (the `notifications` table already has `actor_id` + the GET route already joins `profiles!notifications_actor_id_fkey(full_name, avatar_url)` — no schema change needed).

No migration is required. All backing infra (`notifications` table with `actor_id`, `createNotification()`, push-notification best-effort send) already shipped in tasks 064/163/173 and migration 082.

## Requirements

- [ ] **Set Project Owner** (`PATCH /api/projects/[projectId]/members`): after a successful transfer, notify:
  - New owner: `"{ActorName} set you as the project owner of {ProjectName}."`
  - Every other project member (excluding the actor and the new owner): `"{ActorName} has changed the ownership of {ProjectName} to {NewOwnerName}."`
- [ ] **Add Collaborators** (`POST /api/projects/[projectId]/members`): change the endpoint from single-user (`user_id`) to batch (`user_ids: string[]`), so one UI action can add several people and produce **one** combined notification. After a successful add, notify:
  - Each newly-added collaborator: `"{ActorName} has added you as a collaborator on {ProjectName}."`
  - Every other existing project member (excluding the actor and the newly-added people): one message listing all newly-added names with correct grammar:
    - One person: `"{ActorName} has added {Name} as a collaborator on {ProjectName}."`
    - Two: `"{ActorName} has added {NameA} and {NameB} as collaborators on {ProjectName}."`
    - Three+: `"{ActorName} has added {NameA}, {NameB}, and {NameC} as collaborators on {ProjectName}."` (Oxford comma)
- [ ] Rework `CollaboratorsPanel` in `_onboarding-detail.tsx` from "click a name → add immediately" to "check multiple names → stage them as chips → one 'Add N' confirm button", so a PM can add several collaborators in one action and trigger the batched notification above. Existing already-added-collaborator chips/remove behavior is unchanged.
- [ ] Both notification paths use the existing `createNotification()` helper directly (not `notifyProjectMembers()`, since the two recipient groups get different message text) — `actorId` set to the acting user's id so the bell UI shows their avatar.
- [ ] Notification `link` points at the project's detail page: `/v2/portfolio-tracker/{project.project_id ?? project.id}` (matches the pattern used by `deliverable_complete` / `programme_phase_complete`).
- [ ] Self-transfer edge case: if `canSetOwner` lets an admin transfer ownership to themselves (target user id === actor id), skip the "you" notification for that target (actor is never notified) but still notify other members with `"...to {ActorName}."`.

## Out of Scope / Must-Not-Change

- Phase 1 ownership/membership (`phase_members`, the `OwnerPanel`/collaborator UI inside `_onboarding-wizard.tsx`'s Phase 1 management surface, `/api/projects/[projectId]/programme/phases/[phaseNumber]/members`) — the user's screenshots are the **project-level** gear menu only. Do not touch the phase-level route or its handlers (`handleAddPhase1Member`, `handleRemovePhase1Member`, `handleTransferPhaseOwnership`).
- Removing a collaborator (`DELETE /api/projects/[projectId]/members`) — no notification requested for removal; leave as-is.
- Push-notification delivery mechanics, VAPID setup, service worker — already wired (task 064/164); `createNotification()` already calls `sendPushNotification()` best-effort. Do not modify `src/lib/push`.
- The `notifications` table schema, RLS, or the bell dropdown UI (`/api/notifications`, notification drawer component) — no changes needed, already supports `actor_id`/avatar.
- `notifyProjectMembers()` in `src/lib/notifications/index.ts` — leave it as-is for its existing callers; this task calls `createNotification()` directly per-recipient instead (different message per recipient group is not something `notifyProjectMembers` supports, and it isn't worth generalizing it for one caller).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/projects/[projectId]/members/route.ts` | Modify | Add owner-change notifications to `PATCH`; change `POST` to batch `user_ids`, add collaborator-added notifications |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` | Modify | `CollaboratorsPanel`: stage-then-confirm multi-select UI; `handleAddProjectMember` → accepts `userIds: string[]`, POSTs `{ user_ids }` |

## Code Context

### File: `src/app/api/projects/[projectId]/members/route.ts`

Current `PATCH` (transfer ownership) only fetches `profile.role` for the permission check — it will additionally need the actor's `full_name`, the target's `full_name`, and the project's `name`/`project_id`. Current shape (see full file already read during planning):

```ts
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { projectId } = await params;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const createdBy = await getProjectCreator(supabase, projectId);
  if (!canSetProjectOwner(profile?.role ?? null, createdBy === user.id)) { /* 403 */ }
  const body = await request.json();
  const targetUserId = String(body?.user_id ?? "");
  const targetMembership = await getProjectMembership(supabase, projectId, targetUserId);
  if (!targetMembership.isMember) { /* 400 */ }
  const { error } = await transferProjectOwnership(projectId, targetUserId);
  // ... return ok
}
```

Add after the successful `transferProjectOwnership` call (mirrors the `notifyProjectMembers` call site pattern in `src/app/api/projects/[projectId]/programme/deliverables/[deliverableKey]/route.ts:64-74`, but per-recipient message text so it uses `createNotification` directly, imported from `@/lib/notifications`):

```ts
import { createNotification } from "@/lib/notifications";

// after successful transfer:
const [{ data: actorProfile }, { data: targetProfile }, { data: project }, { data: allMembers }] = await Promise.all([
  supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  supabase.from("profiles").select("full_name").eq("id", targetUserId).maybeSingle(),
  supabase.from("projects").select("name, project_id").eq("id", projectId).maybeSingle(),
  supabase.from("project_members").select("user_id").eq("project_id", projectId),
]);
const actorName = actorProfile?.full_name ?? "Someone";
const newOwnerName = targetProfile?.full_name ?? "Unnamed";
const projectName = project?.name ?? "this project";
const url = project?.project_id ? `/v2/portfolio-tracker/${project.project_id}` : undefined;

if (targetUserId !== user.id) {
  await createNotification(targetUserId, {
    type: "project_owner_changed",
    title: "Project owner changed",
    body: `${actorName} set you as the project owner of ${projectName}.`,
    url,
    actorId: user.id,
  });
}
const otherMemberIds = (allMembers ?? [])
  .map((m) => m.user_id)
  .filter((id) => id !== user.id && id !== targetUserId);
await Promise.all(otherMemberIds.map((id) => createNotification(id, {
  type: "project_owner_changed",
  title: "Project owner changed",
  body: `${actorName} has changed the ownership of ${projectName} to ${newOwnerName}.`,
  url,
  actorId: user.id,
})));
```

Current `POST` (add collaborator, single `user_id`) needs to become batch. New shape:

```ts
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  // ...same auth/permission checks as today...
  const body = await request.json();
  const userIds = Array.isArray(body?.user_ids)
    ? [...new Set(body.user_ids.map(String).filter(Boolean))]
    : [];
  if (userIds.length === 0) return NextResponse.json({ error: "user_ids is required" }, { status: 400 });

  const results = await Promise.all(userIds.map((id) => addProjectMember(projectId, id, user.id)));
  const addedIds = userIds.filter((_, i) => !results[i].error);
  if (addedIds.length === 0) {
    return NextResponse.json({ error: "Failed to add project members" }, { status: 500 });
  }

  // Notifications — best-effort, mirrors the deliverable_complete call site's placement after the DB write.
  try {
    const [{ data: actorProfile }, { data: addedProfiles }, { data: project }, { data: allMembers }] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      supabase.from("profiles").select("id, full_name").in("id", addedIds),
      supabase.from("projects").select("name, project_id").eq("id", projectId).maybeSingle(),
      supabase.from("project_members").select("user_id").eq("project_id", projectId),
    ]);
    const actorName = actorProfile?.full_name ?? "Someone";
    const projectName = project?.name ?? "this project";
    const url = project?.project_id ? `/v2/portfolio-tracker/${project.project_id}` : undefined;
    const addedNames = addedIds.map((id) => addedProfiles?.find((p) => p.id === id)?.full_name ?? "Unnamed");

    await Promise.all(addedIds.map((id) => createNotification(id, {
      type: "project_collaborator_added",
      title: "Added as collaborator",
      body: `${actorName} has added you as a collaborator on ${projectName}.`,
      url,
      actorId: user.id,
    })));

    const otherMemberIds = (allMembers ?? [])
      .map((m) => m.user_id)
      .filter((id) => id !== user.id && !addedIds.includes(id));
    if (otherMemberIds.length > 0) {
      const noun = addedNames.length === 1 ? "collaborator" : "collaborators";
      await Promise.all(otherMemberIds.map((id) => createNotification(id, {
        type: "project_collaborator_added",
        title: "Collaborator added",
        body: `${actorName} has added ${formatNameList(addedNames)} as ${noun} on ${projectName}.`,
        url,
        actorId: user.id,
      })));
    }
  } catch (err) {
    console.error("POST /api/projects/[projectId]/members notification error:", err);
  }

  return NextResponse.json({ ok: true, added: addedIds.length }, { status: 201 });
}

// Oxford-comma list join: "A" | "A and B" | "A, B, and C" — local to this route, only caller.
function formatNameList(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
```

### File: `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx`

`CollaboratorsPanel` (lines ~887-960) currently adds on click:

```tsx
onClick={() => { onAdd(person.id); setSearch(""); }}
```

Rework to stage-then-confirm. Add local `staged: string[]` state; clicking a candidate adds to `staged` (removes from the candidate dropdown via an expanded `memberIds`/`stagedIds` exclusion) instead of calling `onAdd` immediately; render staged names as removable chips distinct from the already-added collaborator chips below (e.g. a "Adding…" sub-row with a dashed border, each chip has its own ×, plus an "Add {n}" primary button and a "Cancel" link that clears `staged`). On confirm, call `onAdd(staged)` (parent signature changes from `(userId: string) => void` to `(userIds: string[]) => void`) and clear `staged` locally; the parent's success path (`refetchProjectMembers`) already closes the loop.

`handleAddProjectMember` (line ~1067) changes from single-id to array:

```ts
const handleAddProjectMember = async (userIds: string[]) => {
  setMembershipBusy(true);
  setMembershipError(null);
  try {
    const res = await fetch(`/api/projects/${project.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_ids: userIds }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? "Failed to add project members");
    }
    await refetchProjectMembers();
  } catch (err) {
    setMembershipError(err instanceof Error ? err.message : "Failed to add project members.");
  } finally {
    setMembershipBusy(false);
  }
};
```

`CollaboratorsPanel`'s `onAdd` prop type and the JSX call site (`onAdd={handleAddProjectMember}` around line 1661) update to match the new `(userIds: string[]) => void` signature — no other call sites of `handleAddProjectMember` exist.

## Implementation Steps

1. In `src/app/api/projects/[projectId]/members/route.ts`: import `createNotification` from `@/lib/notifications`; add the owner-change notification block to `PATCH` after `transferProjectOwnership` succeeds.
2. In the same file: change `POST`'s body parsing to `user_ids: string[]`, loop `addProjectMember`, then add the collaborator-added notification block (both target and "other members" branches) plus the local `formatNameList` helper.
3. In `_onboarding-detail.tsx`: change `handleAddProjectMember` to accept and POST `userIds: string[]`.
4. In the same file: rework `CollaboratorsPanel` to stage selections locally (checkbox-style dropdown clicks that add to a staged chip row, not immediate API calls) with an "Add N" confirm button wired to the new `onAdd(userIds: string[])` signature; keep the existing already-added-members chip list and its per-person `onRemove` untouched.
5. Update the `CollaboratorsPanel` props type and the `onAdd={handleAddProjectMember}` call site to match.
6. Manually verify in the browser: Set Project Owner as a super_admin/admin/creator on a project with 3+ members — confirm the new owner and the other members each get the correct, distinct notification text and the actor gets none. Then Add Collaborators, staging 1, then 2, then 3 people across three separate confirms, checking singular vs. "X and Y" vs. Oxford-comma phrasing each time, and that the actor never receives a notification, and each newly-added person gets the "you" version.
7. Confirm the bell dropdown shows the actor's avatar (via the existing `actor_id`/`profiles!notifications_actor_id_fkey` join) on each generated notification.

## Acceptance Criteria

- [ ] Transferring project ownership notifies the new owner with the "you" phrasing and every other existing project member (not the new owner, not the actor) with the third-person phrasing.
- [ ] The acting user never receives a notification for an action they themselves triggered (owner transfer or collaborator add), including the self-transfer edge case.
- [ ] Adding one collaborator produces singular grammar ("as a collaborator"); adding two produces "X and Y ... as collaborators"; adding three or more produces an Oxford-comma list ("X, Y, and Z ... as collaborators").
- [ ] Each newly-added collaborator receives their own "you" notification regardless of batch size.
- [ ] `CollaboratorsPanel` lets a PM/admin select multiple people before committing, and a single confirm action results in exactly one API call and one combined "other members" notification (not one per person added).
- [ ] Every generated notification's `link` opens the correct project's Portfolio Tracker detail page.
- [ ] Notification bell shows the actor's avatar/initials on these new notification types, same as existing `deliverable_complete` notifications.
- [ ] `npx tsc --noEmit` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser verification (no test runner configured): exercise both actions from the Portfolio Tracker project detail page's gear menu as described in Implementation Step 6, using at least two different logged-in accounts (or the notification bell of a second seeded user) to confirm recipient-side phrasing.

## Compatibility Touchpoints

- The `POST /api/projects/[projectId]/members` request body contract changes from `{ user_id }` to `{ user_ids: [] }`. Confirmed via grep that `_onboarding-detail.tsx`'s `handleAddProjectMember` is the endpoint's only caller — no other route or script depends on the old single-`user_id` shape.
- No migration, no new env vars, no MCP tool inventory changes.

## Implementation Notes

### What Changed
- `PATCH /api/projects/[projectId]/members` (Set Project Owner) now notifies the new owner ("you" phrasing) and every other existing project member (third-person phrasing naming the new owner), after a successful `transferProjectOwnership`. Actor is excluded via `id !== user.id` filters on both branches, which also naturally covers the self-transfer edge case (no "you" notification sent when `targetUserId === user.id`; other members still get the third-person message naming the actor as the new owner).
- `POST /api/projects/[projectId]/members` (Add Collaborators) changed from single `user_id` to batch `user_ids: string[]`. After adding, each newly-added person gets a "you" notification; every other existing member (excluding actor and the newly-added group) gets one combined notification using a new local `formatNameList()` Oxford-comma helper, with singular/plural noun ("collaborator"/"collaborators") selected by count.
- `CollaboratorsPanel` in `_onboarding-detail.tsx` reworked from click-to-add-immediately to stage-then-confirm: clicking a search result now adds them to a local `staged` array rendered as removable chips in a dashed-border "Adding…" row; an "Add N" button fires one `onAdd(userIds: string[])` call, a "Cancel" link clears the staged list. Already-added-collaborator chips and their per-person `onRemove` (single-user `DELETE`) are untouched.
- `handleAddProjectMember` renamed to `handleAddProjectMembers`, now POSTs `{ user_ids: userIds }` instead of `{ user_id: userId }`.
- Both notification blocks are wrapped in their own `try/catch` (separate from the main route try/catch) so a notification failure never fails the underlying add/transfer response — matches the "best-effort" precedent set by `notifyProjectMembers` callers elsewhere in the codebase.

### Files Changed
- `src/app/api/projects/[projectId]/members/route.ts` — added `createNotification` import; batched `POST` body parsing + per-recipient notifications + `formatNameList` helper; added owner-change notifications to `PATCH`.
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` — `CollaboratorsPanel` stage-then-confirm rework; `handleAddProjectMember` → `handleAddProjectMembers` (array-based); updated the `onAdd` prop type and its JSX call site.

### Deviations From Plan
- Fixed a TypeScript narrowing bug not anticipated in the plan's code sketch: `Array.isArray(body?.user_ids)` (optional chain) followed by a plain `body.user_ids` reference in the true branch don't narrow together, leaving `userIds` typed `unknown[]` and breaking every downstream call that expected `string[]` (`addProjectMember`, `.in("id", addedIds)`, `createNotification`). Fixed by assigning `body?.user_ids` to a single local `const rawUserIds: unknown` and narrowing that one reference, then mapping through `String(v)` explicitly — matches the working `Array.isArray(body.xxx)` (non-optional-chain) pattern already used elsewhere in the codebase (e.g. `onboarding/projects/route.ts`, `v2/tasks/[taskId]/route.ts`).
- Everything else matches the approved task document's code context as planned.
- Post-implementation copy fix requested directly by the user (small enough to apply inline rather than spin out a new task): renamed the gear-menu item from "Add Collaborators" to "Manage Collaborators" and the `CollaboratorsPanel` header from "Add collaborators — who sees this on the Onboarding list" to "Manage collaborators — who sees this on the Onboarding list", since the panel now also manages existing collaborators (remove) and ownership isn't implied by "Add" once staging/removal live in the same surface. Text-only change, no behavior/notification-logic impact.

### Verification Run
- `npx tsc --noEmit` - PASS (no errors after the narrowing fix above)
- `pnpm lint` - PASS (no warnings or errors)
- Manual/browser verification (Implementation Step 6/7) - SKIPPED (deferred to the `test` stage per the implement skill's workflow — this stage runs typecheck/lint only; no dev server was started during implementation)
