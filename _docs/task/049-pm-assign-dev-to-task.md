# 049: PM Assign Developer to Task (Zoho API)

**Created:** 2026-06-03
**Priority:** HIGH
**Type:** feature
**Recommended Model:** sonnet
**Status:** TESTING
**Completed:** 2026-06-03

---

## Overview

PMs need to assign a developer to a task from the Task Queue. Assignment is executed via Zoho Projects API — no DB column is added. The Assign action only surfaces for tasks where `llm_eligible` is `"NO"` or `"HUMAN_ONLY"` (AI-eligible tasks go through the orchestration pipeline and don't need a manual dev assignment). The task must also have a `zoho_task_id` (i.e., it exists in Zoho) to be assignable.

## Requirements

- [ ] "Assign Dev" action appears on task rows where `llm_eligible !== "YES"` AND `zoho_task_id` is set AND `zohoProjectMap[customer_id]` exists
- [ ] Action opens a developer picker dropdown listing hub_users with `role = "developer"`
- [ ] On developer select, POST to new endpoint → resolves zpuid → calls Zoho assign API
- [ ] Show loading state while assigning; show success feedback (developer name) or error inline
- [ ] New API route: `POST /api/classification/[id]/assign` — PM auth required
- [ ] `_pm-tasks.tsx` fetches hub_users developers and passes to TasksTab

## Out of Scope / Must-Not-Change

- No DB column added to `classification_records`
- Do not touch dev self-assignment route `/api/dev/assign`
- Round-robin / auto-assignment is Phase 2 — not part of this task
- Do not modify the AI orchestration pipeline for `llm_eligible = "YES"` tasks

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/components/hub/pm-tabs/tasks-tab.tsx` | Modify | Add Assign column + developer dropdown + loading/success state |
| `src/app/(hub)/dashboard/tasks/_pm-tasks.tsx` | Modify | Fetch hub_users developers, pass to TasksTab |
| `src/app/api/classification/[id]/assign/route.ts` | Create | PM assign endpoint — resolves zpuid and calls assignZohoTask |

## Code Context

### File: `src/components/hub/pm-tabs/tasks-tab.tsx` (key interfaces, lines 158–163)

```tsx
interface Props {
  settings: PMSettings;
  tasks: ClassificationRow[];
  zohoProjectMap?: Record<string, string>;
  reviewerMap?: Record<string, string>;
}
```

Add `developers?: { id: string; display_name: string | null; email: string }[]` to Props.

### File: `src/components/hub/pm-tabs/tasks-tab.tsx` — table headers (line 224)

```tsx
{["Pri", "Task", "Customer", "Type", "AI Confidence", "Status", "Age", "Zoho"].map(h => (
```

Add `"Assign"` column between `"Status"` and `"Age"`.

### File: `src/app/(hub)/dashboard/tasks/_pm-tasks.tsx` — existing data fetches (lines 38–64)

```tsx
Promise.all([
  supabase.from("customer_products").select("customer_id, zoho_project_id").not("zoho_project_id", "is", null),
  supabase.from("hub_users").select("id, display_name"),
]).then(([zohoResult, usersResult]) => { ... });
```

Extend the `hub_users` query to also select `email, role` and filter to `role = "developer"` for the developers list. Pass as a separate prop.

### File: `src/lib/zoho/index.ts` — assignZohoTask signature (lines 419–452)

```ts
export async function assignZohoTask(
  portalId: string,
  projectId: string,
  taskId: string,
  zpuid: string
): Promise<boolean>
```

And `getZohoProjectUsers(projectId)` returns `Record<string, string>` (email lowercase → zpuid).

### New API route pattern — follow `/api/dev/assign/route.ts`

```ts
// POST /api/classification/[id]/assign
// Body: { developerId: string }  (hub_users.id)
// Server lookup chain:
//   1. Verify PM auth
//   2. hub_users → get developer email
//   3. classification_records → get zoho_task_id, customer_id
//   4. customer_products → get zoho_project_id by customer_id
//   5. getZohoProjectUsers(projectId) → zpuid by email
//   6. assignZohoTask(ZOHO_PORTAL_ID, projectId, zoho_task_id, zpuid)
```

## Implementation Steps

1. **New API route** `src/app/api/classification/[id]/assign/route.ts`:
   - Auth check — reject if no session
   - Parse body `{ developerId }`, validate both are present
   - Fetch `hub_users` row for `developerId` → get `email`
   - Fetch `classification_records` row by `id` param → get `zoho_task_id`, `customer_id`
   - Guard: if `zoho_task_id` is null, return 400 `{ error: "no_zoho_task" }`
   - Fetch `customer_products` by `customer_id` → get `zoho_project_id`
   - Guard: if no `zoho_project_id`, return 400 `{ error: "no_zoho_project" }`
   - Call `getZohoProjectUsers(projectId)` → look up `zpuid` by `email.toLowerCase()`
   - Guard: if no `zpuid`, return 400 `{ error: "no_zpuid", hint: "developer not in Zoho project" }`
   - Call `assignZohoTask(ZOHO_PORTAL_ID, projectId, zoho_task_id, zpuid)`
   - Return `{ ok: true, developerName }` or 502 on Zoho failure
   - Use `adminClient` for all DB reads (server route, no RLS needed)

2. **`_pm-tasks.tsx`** — extend the existing `Promise.all`:
   - Change `hub_users` query to `.select("id, display_name, email, role").eq("role", "developer")`
   - Store result as `developers` state
   - Pass `developers` to `<TasksTab />`

3. **`tasks-tab.tsx`** — add Assign column:
   - Add `developers` to Props interface
   - Add `"Assign"` header after `"Status"`
   - In each row: if `t.llm_eligible === "YES"` → render `<span className="text-[11px] text-(--c-muted)">AI</span>`
   - If `llm_eligible !== "YES"` AND `zoho_task_id` is null → render `<span className="text-[11px] text-(--c-muted)">—</span>`
   - If `llm_eligible !== "YES"` AND `zoho_task_id` is set → render `<AssignDropdown>` component
   - `AssignDropdown`: small `<select>` or popover with developer list. On change → POST to `/api/classification/${t.id}/assign` with `{ developerId }`. Show loading spinner, then show assigned developer name on success or red error text on failure.
   - Track per-row assign state with a `Record<string, { loading, assignedName, error }>` state map

## Acceptance Criteria

- [ ] Task rows with `llm_eligible = "YES"` show "AI" in the Assign column (no dropdown)
- [ ] Task rows with `llm_eligible = "NO"` or `"HUMAN_ONLY"` and no `zoho_task_id` show "—"
- [ ] Task rows with `llm_eligible = "NO"` or `"HUMAN_ONLY"` and a `zoho_task_id` show a developer dropdown
- [ ] Selecting a developer and confirming calls the API and shows the assigned name on success
- [ ] If developer is not found in the Zoho project, a clear inline error appears
- [ ] `npx tsc --noEmit` passes

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual:
- Open Tasks page as PM
- Verify YES tasks show "AI" label
- Verify HUMAN_ONLY/NO tasks with zoho_task_id show developer dropdown
- Assign a developer → verify task updates in Zoho Projects

## Notes for Implementation Agent

- **Sonnet recommended** — spans 3 layers (new API route with multi-step server lookup + Zoho API call + UI state), involves a new endpoint pattern, and has multiple guard conditions.
- `adminClient` is correct for all reads inside the new API route (server-side, session already verified at the top).
- `getZohoProjectUsers` makes a live Zoho API call — only call it when you have a valid `zoho_project_id`. It returns `email.toLowerCase() → zpuid`.
- The assign is additive in Zoho (`owners: [{ add: [{ zpuid }] }]`) — it does not replace existing owners.
- Do not show the assign UI for rows that have `llm_eligible = "YES"` — those go through the AI pipeline and have no concept of a human developer assignment at the classification stage.
