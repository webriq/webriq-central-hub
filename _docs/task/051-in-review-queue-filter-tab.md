# 051: In Review Queue — Tasks Ready for Checking Filter Tab

**Created:** 2026-06-03
**Priority:** HIGH
**Type:** feature
**Recommended Model:** haiku
**Status:** TESTING
**Completed:** 2026-06-03

> **Investigation:** /understand ran before this spec. Findings embedded below.

---

## Overview

When a developer finishes a task, the PM sets it to `review` status (via the PM Actions buttons in the Orchestration page). There is currently no dedicated view that surfaces these tasks for PM verification. This task adds an "In Review" filter tab to the Task Queue that shows exactly those tasks.

The existing "Needs Review" tab is kept as-is — it surfaces AI low-confidence tasks and is a separate concern.

## Requirements

- [ ] New "In Review" filter tab in the Task Queue header
- [ ] Tab shows tasks where `classification_records.status === "review"`
- [ ] Tab shows a count badge (same pattern as other tabs)
- [ ] "In Review" tab is visually distinct from "Needs Review" (different label, different intent)
- [ ] Existing tabs ("All", "Needs Review", "Classified") remain unchanged

## Out of Scope / Must-Not-Change

- Do not rename or alter the "Needs Review" tab — it serves AI confidence review, not PM QA
- Do not add a new API route — the existing task data already includes `status`
- Do not modify the Orchestration page PM Actions — setting `review` status already works via `/api/zoho`

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/components/hub/pm-tabs/tasks-tab.tsx` | Modify | Add `"in_review"` to `FilterTab`, new tab button, filter logic |

## Code Context

### `src/components/hub/pm-tabs/tasks-tab.tsx` — FilterTab type and filter logic (lines 250–266)

```ts
type FilterTab = "all" | "review" | "classified";

export default function TasksTab(...) {
  const [tab, setTab] = useState<FilterTab>("all");
  ...

  const shown = tab === "all"
    ? displayTasks
    : tab === "review"
    ? displayTasks.filter(t => t.status === "pending" || (t.confidence_score ?? 100) < 75)
    : displayTasks.filter(t => t.status === "reviewed");

  const reviewCount = displayTasks.filter(t =>
    t.status === "pending" || (t.confidence_score ?? 100) < 75
  ).length;
```

Add `"in_review"` to the union. Add a new filter branch. Add `inReviewCount`.

### `src/components/hub/pm-tabs/tasks-tab.tsx` — tab button render (lines 280–297)

```tsx
<div className="flex gap-1.5">
  {([
    ["all", "All", displayTasks.length],
    ["review", "Needs Review", reviewCount],
    ["classified", "Classified", displayTasks.filter(t => t.status === "reviewed").length],
  ] as const).map(([k, l, count]) => (
    <button
      key={k}
      onClick={() => setTab(k)}
      className={`text-xs font-semibold rounded-lg px-3.5 py-1.75 cursor-pointer border transition-colors ${
        tab === k
          ? "text-white bg-(--c-blue) border-(--c-blue)"
          : "text-(--c-sub) bg-(--c-card) border-(--c-border)"
      }`}
    >
      {l}{count > 0 ? ` (${count})` : ""}
    </button>
  ))}
</div>
```

Add `["in_review", "In Review", inReviewCount]` to the array.

### `src/app/api/zoho/route.ts` — ACTION_TO_STATUS (lines 9–16)

```ts
const ACTION_TO_STATUS: Record<PmAction, string> = {
  open: "open",
  on_hold: "on_hold",
  active: "active",
  review: "review",     // ← sets classification_records.status to "review"
  close: "closed",
  reopen: "pending",
};
```

`review` status is already being set correctly by PM actions. No change needed here.

### `src/app/(hub)/dashboard/tasks/_pm-tasks.tsx` — Supabase realtime (lines 67–74)

```ts
const channel = supabase
  .channel("dashboard_tasks_classification")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "classification_records" },
    fetchTasks
  )
  .subscribe();
```

Realtime already picks up status changes — when PM sets a task to `review` in Orchestration, it will appear in the "In Review" tab without a refresh. No changes needed.

## Implementation Steps

1. **`src/components/hub/pm-tabs/tasks-tab.tsx`**:
   - Add `"in_review"` to the `FilterTab` type: `type FilterTab = "all" | "review" | "classified" | "in_review"`
   - Add `inReviewCount` computed value: `displayTasks.filter(t => t.status === "review").length`
   - Add `"in_review"` branch to `shown`: `tab === "in_review" ? displayTasks.filter(t => t.status === "review") : ...`
   - Add `["in_review", "In Review", inReviewCount]` entry to the tab button array (place between "Classified" and end, or after "Needs Review" — logical order: All → Needs Review → In Review → Classified)

## Acceptance Criteria

- [ ] "In Review" tab appears in the Task Queue header
- [ ] Tab shows tasks where `status === "review"` only
- [ ] Count badge shows the correct number of in-review tasks
- [ ] Setting a task to "review" in the Orchestration page makes it appear in this tab (realtime, no refresh)
- [ ] Existing "All", "Needs Review", and "Classified" tabs are unaffected
- [ ] `npx tsc --noEmit` passes

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual:
- Open Task Queue → "In Review" tab visible
- In Orchestration page, set a task to "Review" via the PM action button
- Switch to Task Queue → task appears in "In Review" tab without refresh

## Notes for Implementation Agent

- **haiku is sufficient** — single file change, pure UI filter addition, no new API or data fetching.
- The tab key `"in_review"` (with underscore) differs from the status value `"review"` (no underscore) — do not confuse them.
- The existing `"review"` key in `FilterTab` is the "Needs Review" AI-confidence tab. Do NOT rename or change it — changing the key would reset the active tab for any users currently on it.
- Tab order recommendation: All → Needs Review → In Review → Classified. This groups both review-related tabs together.
- The `shown` variable is computed as a chain of ternaries — add the `in_review` branch before the final `else` (classified).
