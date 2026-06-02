# Task 038 — Pipeline Page Redesign

> **Type:** minor
> **Priority:** HIGH
> **Recommended Model:** sonnet
> **Status:** TESTING
> **Completed:** 2026-06-02
> **Implementation Notes:** All 5 steps complete. Sidebar "AI Chat" → "Pipeline" (GitBranch icon), "Clients" → "Customers". PM pipeline route now redirects to /orchestration. Orchestration page has Pipeline header + All/Assess/Plan stage filter tabs with counts. Customer company names shown on task cards instead of raw IDs (fetched in same Promise.all). PlanRow also gets customerName prop. Dev dashboard priority "none" → displays "NORMAL". TypeScript clean.

## Problem

The current nav has two overlapping pipeline-related items:
- **"Pipeline"** (sidebar) → `/pm/pipeline` (PM dashboard kanban tab) — read-only stub, Plan/Execute/Reply columns show "Sprint 4+" placeholder. Does not support any inline actions.
- **"AI Chat"** (sidebar) → `/orchestration` — the actual functional page where PMs run assessment, generate plans, approve/execute, and send replies. The name misleads users about its purpose.

This creates cognitive overhead. "Pipeline" sounds like the right name for the Classify → Assess → Plan → Execute → Reply flow, but the page actually named that is a stub. The functional page is buried under "AI Chat."

## Goal

1. Rename sidebar **"AI Chat" → "Pipeline"** (pointing to `/orchestration`)
2. Add **stage filter tabs** to the orchestration page so PMs can focus on tasks needing attention at each stage
3. Improve **task card design** — each card shows the current stage and a primary CTA appropriate to that stage
4. Remove the **PM dashboard Pipeline kanban tab** (replaced by the sidebar Pipeline page)
5. Fix minor bug: developer dashboard shows `NONE` for priority — should show `NORMAL` (or actual value)

## Scope

No new routes. No schema changes. UI-only redesign of existing pages + sidebar update.

---

## Implementation Steps

### Step 1 — Sidebar rename

**File:** `src/components/hub/hub-sidebar.tsx`

Change the nav item label and swap the order so Pipeline comes after Tasks:

```
Before:
{ href: `${ROUTES.PM}/pipeline`, label: "Pipeline", icon: GitBranch },
{ href: ROUTES.ORCHESTRATION,   label: "AI Chat",   icon: MessageSquare },

After:
{ href: ROUTES.ORCHESTRATION, label: "Pipeline", icon: GitBranch },
```

Remove the `MessageSquare` import if unused after this change. `GitBranch` icon fits Pipeline.

### Step 2 — Remove PM dashboard Pipeline tab

The PM pipeline kanban at `/pm/pipeline` is replaced by the sidebar Pipeline page. Remove it to avoid confusion.

**Files to change:**
- `src/components/hub/pm-tabs/pipeline-tab.tsx` — can be left in place but deregistered from the tab router
- `src/app/(hub)/pm/pipeline/page.tsx` (if it exists as a route) — redirect to `ROUTES.ORCHESTRATION` or return 404
- Wherever the PM dashboard registers its tab routes — remove the `pipeline` tab entry

Find the PM tab router with:
```bash
grep -rn "pipeline" src/app/\(hub\)/pm/ --include="*.tsx"
```

### Step 3 — Stage filter tabs on the Pipeline (orchestration) page

**File:** `src/app/(hub)/orchestration/page.tsx`

The page already loads all classification records and their related data. Add a stage filter bar at the top.

**Stage definitions** (map to `ClassificationStatus` values):

| Tab label | Included statuses | Badge color |
|-----------|------------------|-------------|
| All | all | — |
| Classify | `pending` | amber |
| Assess | `reviewed`, `classified` | sky |
| Plan | `assessed`, `planning` | violet |
| Approve | `planned` | blue |
| Execute | `approved`, `executing` | orange |
| Done | `complete`, `closed` | green |

Add a `stageFilter` state (default `"all"`). Filter the `tasks` array before rendering. Show count badges on each tab.

Place the filter bar between the page title and the task list:

```tsx
// Stage filter bar — above task list
<div className="flex gap-1.5 flex-wrap mb-4">
  {STAGE_FILTERS.map(s => (
    <button
      key={s.key}
      onClick={() => setStageFilter(s.key)}
      className={cn(
        "text-[12px] font-medium px-3 py-1.5 rounded-full border transition-colors",
        stageFilter === s.key
          ? "bg-brand-blue text-white border-brand-blue"
          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
      )}
    >
      {s.label}
      <span className="ml-1.5 text-[11px] opacity-70">{counts[s.key]}</span>
    </button>
  ))}
</div>
```

### Step 4 — Task card primary CTA

**File:** `src/app/(hub)/orchestration/page.tsx` — `TaskRow` component (L156)

Each task card should show a prominent primary action button based on its current stage, so PMs can act without expanding every row:

| Stage | CTA | Action |
|-------|-----|--------|
| `pending` | "Classify" | triggers classify API |
| `reviewed` / `classified` | "Assess" | calls `runAssessment()` |
| `assessed` | "Generate Plan" | calls plan API |
| `planned` | "Review Plan" | expands row to plan section |
| `approved` | "Execute" | expands row to execution section |
| `complete` | "View Reply" | expands row to reply section |

Add the CTA button to the right side of the collapsed card header (already has a gap for action buttons at L206). The button replaces the expand-on-click-only model with a clear visual affordance.

### Step 5 — Add customer name to task cards

Currently task cards show `record.customer_id` (e.g. `WRQ-CLIENT-0FAA`) which is hard to scan. The page already loads customer data — pass customer display names into `TaskRow` as a prop and show the company name instead of the ID.

```tsx
// In card metadata row (L198-202)
// Replace: <span className="text-[10px] font-mono text-gray-400">{record.customer_id}</span>
// With:    <span className="text-[11px] text-gray-500">{customerName}</span>
```

Load customer names from a `customers` Supabase query in the main page component (already fetching related data). Build a `Record<customerId, companyName>` lookup map.

### Step 6 — Fix developer dashboard priority display

**File:** `src/app/(hub)/dev/page.tsx` or the dev dashboard client component

Tasks show `NONE` for priority — this happens when `priority` is `null` in the DB. Map `null` → display as `NORMAL` with a neutral style, not a `NONE` badge.

```tsx
// Replace "NONE" badge with:
const displayPriority = priority ?? "NORMAL";
```

---

## File Changes

| File | Action |
|------|--------|
| `src/components/hub/hub-sidebar.tsx` | Remove old Pipeline item, rename AI Chat → Pipeline |
| `src/app/(hub)/orchestration/page.tsx` | Add stage filter tabs + task card CTA buttons + customer name |
| `src/app/(hub)/pm/pipeline/page.tsx` | Redirect or remove (check if file exists first) |
| `src/app/(hub)/dev/page.tsx` or dev client | Fix `null` priority → display as NORMAL |

---

## Code Context

### hub-sidebar.tsx — current navGroups (L27–38)
```tsx
const navGroups: { section: string; items: NavItem[] }[] = [
  {
    section: "Main",
    items: [
      { href: ROUTES.PM, label: "Home", icon: LayoutDashboard, exact: true },
      { href: `${ROUTES.PM}/customers`, label: "Clients", icon: Users },
      { href: `${ROUTES.PM}/tasks`, label: "Tasks", icon: ListChecks },
      { href: `${ROUTES.PM}/pipeline`, label: "Pipeline", icon: GitBranch },
      { href: ROUTES.ORCHESTRATION, label: "AI Chat", icon: MessageSquare },
    ],
  },
];
```

### orchestration/page.tsx — main state (L852–859)
```tsx
const [tasks, setTasks] = useState<ClassificationRecordRow[]>([]);
const [assessments, setAssessments] = useState<Record<string, RequirementsAssessmentRow>>({});
const [plans, setPlans] = useState<Record<string, ImplementationPlanRow>>({});
const [executions, setExecutions] = useState<Record<string, ExecutionRecordRow>>({});
const [customerPaused, setCustomerPaused] = useState<Record<string, boolean>>({});
const [replyDrafts, setReplyDrafts] = useState<Record<string, ReplyDraftRow>>({});
const [zohoProjects, setZohoProjects] = useState<Record<string, string>>({});
const [loading, setLoading] = useState(true);
```

### ClassificationStatus values (src/types/hub.ts L48–59)
```tsx
export type ClassificationStatus =
  | "pending" | "reviewed" | "rejected" | "planning" | "planned"
  | "approved" | "open" | "on_hold" | "active" | "review" | "closed";
```

---

## Notes for Implementation Agent

- Sonnet recommended: this touches sidebar nav, the core PM workflow page, PM dashboard tab routing, and the dev dashboard — 4+ unrelated files with cross-cutting changes.
- The `/orchestration` route stays as-is — only the sidebar label changes. No redirect needed.
- `ROUTES.ORCHESTRATION = "/orchestration"` (constants.ts L6) — use this, do not hardcode the path.
- For stage filter counts, compute from the already-loaded `tasks` array — no extra API call.
- The `tasks-tab.tsx` (PM dashboard) is separate from this change — leave it alone.
- For the PM pipeline tab removal: if `src/app/(hub)/pm/pipeline/page.tsx` doesn't exist as a standalone route file (it may be rendered via the tab router), find the tab registration and remove the pipeline entry from there.
- Do NOT remove `pipeline-tab.tsx` file itself — just deregister it from the tab router. The file can stay as dead code.
