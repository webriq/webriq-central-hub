# 052: Code Review Fixes — Security, Auth & Correctness

**Created:** 2026-06-03
**Priority:** HIGH
**Type:** patch
**Recommended Model:** sonnet
**Status:** TESTING
**Completed:** 2026-06-03

---

## Overview

Fixes 7 correctness/security bugs surfaced by a `/code-review high` pass on the Sprint 5/6 diff (tasks 049–051). The majority are auth gaps (no role check on PM-only API endpoints) and one silent data loss bug (plan reject clobbers PM-set statuses). Three cleanup items (duplicate Server Action, inline Zoho URLs, filter predicate duplication) are included at lower priority.

---

## Requirements

### Security / Correctness (must-fix)

- [ ] **F1** — Add PM/admin role check to `POST /api/classification/[id]/assign`: only `pm` or `admin` users may assign developers; `dev` and `pending` sessions must receive 403.
- [ ] **F2** — Add PM/admin role check to `POST /api/classification` when `source = "hub_manual"`: same 403 for non-PM callers.
- [ ] **F3** — In `callback/page.tsx`: treat `syncZohoRole` returning `null` the same as `"pending"` — route to `/auth/pending` instead of `/dashboard`.
- [ ] **F4** — In `_pm-tasks.tsx`: move the reviewer name lookup out of the client component. The client-side `from("hub_users")` query is blocked by RLS (`users_read_own` policy, migration 007), so `reviewerMap` is always empty for other users. Pass `reviewerMap` as a server-rendered prop from `tasks/page.tsx` using `adminClient` (same pattern as the `developers` prop).
- [ ] **F5** — In `plan/route.ts` PATCH reject path: only reset `classification_records.status` to `"pending"` when the current status is a pipeline-owned value (`"planning"`, `"approved"`). Preserve PM-set statuses (`"on_hold"`, `"active"`, `"review"`, `"closed"`).
- [ ] **F6** — In `plan/route.ts` PATCH approve path: prevent duplicate Zoho task creation on concurrent approvals. Use an atomic `eq("status", "PENDING_APPROVAL")` guard on the status update; if 0 rows affected, return 409 and skip the Zoho push.
- [ ] **F7** — In `tasks/page.tsx`: treat a missing `hub_users` profile row as `role = "pending"` rather than `"pm"` — show a minimal "access pending" message or redirect to `/auth/pending`.

### Cleanup (nice-to-have, same PR)

- [ ] **C1** — Extract `approveHubUser` Server Action into a shared file (e.g. `src/app/(hub)/actions/approve-hub-user.ts`) and import it in both `dashboard/users/page.tsx` and `admin/hub-users/page.tsx`, so the role allowlist is maintained in one place.
- [ ] **C2** — In `_pm-tasks.tsx`: if reviewer data is moved to the server (F4), the client-side `hub_users` query becomes dead code — remove it.
- [ ] **C3** — In `tasks-tab.tsx`: deduplicate the `shown` filter predicate and `reviewCount` / `inReviewCount` by computing all counts in a single `useMemo` pass over `displayTasks`.

---

## Out of Scope / Must-Not-Change

- Do not add role checks to non-PM endpoints (`/api/webhooks`, `/api/digest`, `/api/dev/*`).
- Do not change `hub_users` RLS policies — fix is at the read layer (move to server), not the DB layer.
- Do not modify `isRouteAllowed` or `requireRole` for page-level routing.
- Do not change the Zoho-side Cliq notification format.
- Do not touch `/api/plan` POST (plan generation) — only the PATCH (approve/reject) needs the race fix.

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/classification/[id]/assign/route.ts` | Modify | F1: add PM role check after auth |
| `src/app/api/classification/route.ts` | Modify | F2: add PM role check in hub_manual branch |
| `src/app/(auth)/callback/page.tsx` | Modify | F3: treat null syncZohoRole return as "pending" |
| `src/app/(hub)/dashboard/tasks/page.tsx` | Modify | F4: fetch reviewerMap server-side with adminClient; F7: treat null profile as pending |
| `src/app/(hub)/dashboard/tasks/_pm-tasks.tsx` | Modify | F4: accept reviewerMap as prop; remove client-side hub_users query |
| `src/app/api/plan/route.ts` | Modify | F5: conditional status reset on reject; F6: atomic guard on approve |
| `src/app/(hub)/actions/approve-hub-user.ts` | Create | C1: shared Server Action |
| `src/app/(hub)/dashboard/users/page.tsx` | Modify | C1: import shared action |
| `src/app/(hub)/admin/hub-users/page.tsx` | Modify | C1: import shared action |
| `src/components/hub/pm-tabs/tasks-tab.tsx` | Modify | C3: deduplicate filter predicate |

---

## Code Context

### F1 + F2: Role check pattern

Add after the `if (!user)` check in both routes. Use `adminClient` (already imported) to avoid a second Supabase round-trip:

```ts
// After: if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const { data: caller } = await adminClient
  .from("hub_users")
  .select("role")
  .eq("id", user.id)
  .single();
if (!["pm", "admin"].includes(caller?.role ?? "")) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

Apply this to:
- `src/app/api/classification/[id]/assign/route.ts` after line 16
- `src/app/api/classification/route.ts` after line 25 (before the `hub_manual` branch — the non-manual path is AI webhook; only gate hub_manual here or gate the whole endpoint)

> **Note:** The non-manual classification path (`classifyTask`) is triggered by authenticated PMs from the UI or webhooks. Gating the whole endpoint on PM role is safe — webhooks use the `/api/webhooks` route, not `/api/classification` directly.

### F3: Callback null handling

File: `src/app/(auth)/callback/page.tsx` lines 50–51

```ts
// Current:
const role = await syncZohoRole(userId, email, displayName);
if (role === "pending") destination = "/auth/pending";

// Fix:
const role = await syncZohoRole(userId, email, displayName);
if (!role || role === "pending") destination = "/auth/pending";
```

### F4: Move reviewerMap to server component

File: `src/app/(hub)/dashboard/tasks/page.tsx` — current server fetches (lines 28–38):

```ts
const [{ data: devUsers }, { data: customers }] = await Promise.all([
  adminClient.from("hub_users").select("id, display_name, email").eq("role", "dev"),
  adminClient.from("customers").select("customer_id, company_name").eq("status", "active").order("company_name"),
]);
```

Extend to a 3-way `Promise.all`:

```ts
const [{ data: devUsers }, { data: customers }, { data: allUsers }] = await Promise.all([
  adminClient.from("hub_users").select("id, display_name, email").eq("role", "dev"),
  adminClient.from("customers").select("customer_id, company_name").eq("status", "active").order("company_name"),
  adminClient.from("hub_users").select("id, display_name"),
]);
const reviewerMap: Record<string, string> = {};
for (const u of allUsers ?? []) {
  if (u.id && u.display_name) reviewerMap[u.id] = u.display_name;
}
return <PMTasksContent developers={devUsers ?? []} customers={customers ?? []} reviewerMap={reviewerMap} />;
```

Then in `_pm-tasks.tsx`:
- Add `reviewerMap: Record<string, string>` to the component props interface
- Remove the `hub_users` query from `Promise.all` in the `useEffect` and the `setReviewerMap` state
- Initialize `reviewerMap` state from the prop (or just pass it through as a prop to `TasksTab`)

### F5: Conditional status reset on plan reject

File: `src/app/api/plan/route.ts` lines 132–147:

```ts
// Current:
} else {
  await Promise.all([
    adminClient.from("implementation_plans").update({ status: "REJECTED", ... }).eq("id", planId),
    adminClient.from("classification_records").update({ status: "pending" }).eq("id", classificationId),
  ]);
}

// Fix — only reset pipeline-owned statuses:
const PIPELINE_STATUSES = new Set(["planning", "approved"]);
const { data: currentRecord } = await adminClient
  .from("classification_records")
  .select("status")
  .eq("id", classificationId)
  .maybeSingle();

await Promise.all([
  adminClient.from("implementation_plans").update({ status: "REJECTED", rejection_reason: rejectionReason ?? null, rejected_by: user.id }).eq("id", planId),
  PIPELINE_STATUSES.has(currentRecord?.status ?? "")
    ? adminClient.from("classification_records").update({ status: "pending" }).eq("id", classificationId)
    : Promise.resolve({ data: null, error: null }),
]);
```

### F6: Atomic guard on plan approve

File: `src/app/api/plan/route.ts` lines 83–92:

Replace the current `Promise.all` status update with an atomic guard:

```ts
// Atomic approve: only proceed if plan is still PENDING_APPROVAL
const { count } = await adminClient
  .from("implementation_plans")
  .update({ status: "APPROVED", approved_by: user.id })
  .eq("id", planId)
  .eq("status", "PENDING_APPROVAL")
  .select("id", { count: "exact", head: true });

if (!count) {
  // Already approved (or rejected) by a concurrent request
  return NextResponse.json({ ok: true, zohoTaskId: plan.zoho_task_id });
}

// Classification record update (non-atomic, idempotent)
await adminClient.from("classification_records").update({ status: "approved" }).eq("id", classificationId);
```

> **Note:** If the current plan status column doesn't have `"PENDING_APPROVAL"` as the initial state (it may be set differently), verify via `grep -n "PENDING_APPROVAL" supabase/migrations/` before implementing. The guard must match whatever the plan's initial status is when it's awaiting PM approval.

### F7: Null profile handling in tasks page

File: `src/app/(hub)/dashboard/tasks/page.tsx` lines 21–24:

```ts
// Current:
const role = profile?.role ?? "pm";
if (role === "dev") { return <DevTasksContent />; }

// Fix:
const role = profile?.role ?? null;
if (!role || role === "pending") {
  redirect("/auth/pending");
}
if (role === "dev") { return <DevTasksContent />; }
```

### C1: Shared approveHubUser action

Both `src/app/(hub)/dashboard/users/page.tsx` and `src/app/(hub)/admin/hub-users/page.tsx` define identical `approveHubUser` Server Actions (same auth check, same role allowlist `["admin", "pm", "dev"]`, same `adminClient.from("hub_users").update({ role })`). The only difference is `revalidatePath` target.

Create `src/app/(hub)/actions/approve-hub-user.ts`:

```ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function approveHubUser(formData: FormData, revalidate: string) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return;
  const { data: caller } = await supabase.from("hub_users").select("role").eq("id", claims.claims.sub).single();
  if (caller?.role !== "admin") return;
  const userId = formData.get("userId") as string;
  const role = formData.get("role") as string;
  if (!userId || !["admin", "pm", "dev"].includes(role)) return;
  await adminClient.from("hub_users").update({ role }).eq("id", userId);
  revalidatePath(revalidate);
}
```

> **Note:** Server Actions cannot accept additional arguments beyond `FormData` when used as `action={fn}` in a form. Wrap it per-page with `bind`:
> ```ts
> const approveAction = approveHubUser.bind(null, "/dashboard/users");
> ```
> Pass `approveAction` to `<UsersTable approveAction={approveAction} />`.

---

## Implementation Steps

1. **F1+F2** — Add PM role check helper inline in both assign and classification routes (copy the 4-line pattern above). Reuse the already-imported `adminClient`.

2. **F3** — One-line fix in `callback/page.tsx`: change `if (role === "pending")` → `if (!role || role === "pending")`.

3. **F7** — In `tasks/page.tsx`, change `profile?.role ?? "pm"` → check null profile and redirect.

4. **F4** — Extend `tasks/page.tsx` Promise.all to fetch all hub_users for reviewerMap. Update `_pm-tasks.tsx` props interface to accept `reviewerMap`, remove client-side hub_users query from `useEffect`, remove `reviewerMap` state initialization from the Promise.all there.

5. **F5** — In `plan/route.ts` reject branch: read `classification_records.status` first, gate the reset on pipeline-owned values. Note this adds one extra DB read on the reject path.

6. **F6** — In `plan/route.ts` approve branch: replace the `Promise.all` status update with the atomic `eq("status", "PENDING_APPROVAL")` guard. Verify initial plan status value in the migrations before implementing.

7. **C1** — Create `src/app/(hub)/actions/approve-hub-user.ts` with the shared action. Update both pages to import and bind it.

8. **C2** — Remove now-dead `hub_users` query from `_pm-tasks.tsx` `useEffect`.

9. **C3** — In `tasks-tab.tsx`, compute `{ reviewCount, inReviewCount, classifiedCount }` in a single `useMemo` over `displayTasks` and remove the duplicate inline `.filter()` calls.

10. Run `npx tsc --noEmit` and `pnpm lint` — both must pass.

---

## Acceptance Criteria

- [ ] `GET /api/classification/{id}/assign` with a `dev`-role session returns 403
- [ ] `POST /api/classification` with `source="hub_manual"` and a `dev`-role session returns 403
- [ ] OAuth callback with no Zoho portal user routes to `/auth/pending` (not `/dashboard`)
- [ ] PM Tasks page renders reviewer names correctly (they come from the server, not empty from RLS-filtered client query)
- [ ] Rejecting a plan for a classification record with status `"on_hold"` leaves the record in `"on_hold"` (not `"pending"`)
- [ ] Concurrent plan approve requests (simulated via two rapid POSTs) result in exactly one Zoho task created
- [ ] User with no `hub_users` row is redirected to `/auth/pending` from the tasks page
- [ ] `npx tsc --noEmit` passes
- [ ] `pnpm lint` passes

---

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual:
- Log in as a dev-role user → attempt POST to `/api/classification/{id}/assign` → expect 403
- Log in as a PM → assign a developer → expect 200 and Zoho update
- Reject a plan for a record in "on_hold" state → verify record stays "on_hold"

---

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-06-03

### What was built

7 correctness/security fixes and 3 cleanup items from the `/code-review high` pass on Sprint 5/6:
- **F1/F2**: PM/admin role checks added to `POST /api/classification/[id]/assign` and `POST /api/classification`. Any `dev` or `pending` session now receives 403.
- **F3**: OAuth callback now treats `syncZohoRole` returning `null` (no Zoho portal user found) the same as `"pending"` — routes to `/auth/pending` instead of `/dashboard`.
- **F4**: `reviewerMap` moved from a client-side RLS-blocked query to a server-side `adminClient` fetch in `tasks/page.tsx`, passed as prop to `PMTasksContent`. Reviewer names now resolve correctly for all users.
- **F5**: Plan rejection no longer unconditionally resets classification status to `"pending"` — only resets for pipeline-owned statuses (`"planning"`, `"approved"`).
- **F6**: Atomic `eq("status","PENDING_APPROVAL")` guard on plan approve prevents concurrent requests from both creating Zoho tasks.
- **F7**: Null/missing `hub_users` profile on the tasks page now redirects to `/auth/pending` instead of silently serving PM content.
- **C1**: `approveHubUser` Server Action extracted to `src/app/(hub)/actions/approve-hub-user.ts`; both admin pages import and `.bind()` it.
- **C3**: `isNeedsReview` predicate extracted; `classifiedCount` pre-computed — filter logic now has a single source of truth in `tasks-tab.tsx`.

### How to access for testing
- PM role gate (F1): `POST /api/classification/{id}/assign` with dev-role session → expect 403
- PM role gate (F2): `POST /api/classification` with `source="hub_manual"` and dev-role session → expect 403
- Auth redirect (F3): OAuth login with no matching Zoho portal user → expect `/auth/pending`
- Reviewer map (F4): PM opens Tasks page → reviewer column shows names for all reviewers, not just self
- Plan reject (F5): Set classification to "on_hold", reject plan → classification stays "on_hold"
- Plan approve race (F6): Two concurrent PATCH approve requests → only one Zoho task created

### Deviations from plan
- **Minor**: `PIPELINE_STATUSES` Set is defined inside the `else` block of `plan/route.ts` rather than at module level. Functionally correct; a module-level constant would be marginally cleaner but creates no maintenance risk here.
- **Minor**: `tasks/page.tsx` runs two separate `hub_users` queries (one filtered by `role=dev`, one unfiltered for reviewerMap). Could be merged into one query with JS filtering. Both run in parallel via `Promise.all` so the performance difference is negligible. This matches the task doc's prescribed pattern exactly.

### Standards check
Pass — no `any` types, no unused imports, no `console.log` in production paths, TypeScript clean (`npx tsc --noEmit` passes with 0 errors). Pre-existing lint errors in `kb/page.tsx` and `sanity/index.ts` are unrelated to this task.

### Convention check
Pass — `"use server"` used correctly (file-level directive on a Server Actions module), `adminClient` used only in server-side contexts, `redirect` already imported in `tasks/page.tsx`.

---

## Notes for Implementation Agent

- **Sonnet recommended** — spans 7 files across auth, API, server components, and client components; security-sensitive role logic.
- For F6, the atomic plan approve guard works correctly only if `"PENDING_APPROVAL"` is the DB value for plans awaiting review. Run `grep -rn "PENDING_APPROVAL" supabase/migrations/` to confirm. If the initial status is different, adjust the `.eq("status", ...)` guard accordingly.
- For C1, the `revalidate` param approach works for Server Actions used with `.bind()` — this is a standard Next.js 16 pattern. Do NOT use `revalidatePath` inside the shared function itself with a hardcoded path.
- The client-side `hub_users` query in `_pm-tasks.tsx` was previously providing the `reviewerMap` — after F4, this state and its initialization can be fully removed from the `useEffect` `Promise.all`.
- `adminClient` is already imported in both classify endpoints — no new imports needed for F1/F2.
