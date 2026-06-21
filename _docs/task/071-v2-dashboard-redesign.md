# Task 071 — v2 Dashboard: Role-Aware PM/Dev/Admin Dashboards (Zoho Decommission + Design Refresh)

> **Type:** feature
> **Priority:** HIGH
> **Version impact:** minor
> **Recommended Model:** sonnet
> **Investigation:** /understand ran before this spec. Findings embedded below.
> **Status:** TESTING
> **Completed:** 2026-06-19
> **Implementation Notes:** All 7 files created. v2 layout migrated from hub_users → profiles. No zoho imports anywhere. recharts 3.8.1 installed. TypeScript check passes clean. classification_records has no assigned_developer_id — dev kanban shows all open/active records with a TODO comment. digest_logs uses digest_type (not type) field. confidence_score multiplied by 100 for percentage display.

---

## Goal

Replace the stub `src/app/v2/(hub)/dashboard/page.tsx` with fully functional, role-aware dashboards for PM, Developer, and Admin roles. All Zoho data dependencies are removed; data comes exclusively from Supabase (`classification_records`, `projects`, `profiles`, `requirements_assessments`, `digest_logs`, `llm_invocation_logs`). UI follows the design reference at `/Users/brandondwite/Downloads/Design Central Hub Platform/src` translated to Tailwind CSS v4 + CSS variable tokens (no `style={{}}`).

---

## Requirements

1. **Three role-specific dashboards:** PM (`pm`, `admin`), Developer (`developer`), Admin (`admin` gets PM dashboard with extra admin widgets). Render based on `profiles.role`.
2. **Zoho completely removed** from v2 dashboard — no imports from `@/lib/zoho`, no Zoho task links, no `zoho_user_id` display.
3. **profiles migration in v2 layout** — switch from `hub_users` to `profiles` table. Email comes from JWT claims (`data.claims.email`). `full_name` maps to displayName.
4. **v2-specific sidebar** — new file using `V2_ROUTES`, expanded nav groups matching the design reference. Does NOT modify the shared `hub-sidebar.tsx` (which v1 still uses).
5. **Desk Pulse → Classification Status chart** — `recharts` BarChart showing `classification_records` status distribution.
6. **OpsChat panel** — right-side aside stub with visual shell ("Coming soon"). No chat wiring.
7. **recharts installed** for the Dev weekly hours bar chart and PM classification chart. HR leave calendar is stubbed.
8. All layout uses Tailwind CSS v4 classes + CSS variable tokens (`bg-(--c-card)`, `text-(--c-blue)`, etc.). No inline `style={{}}` except where CLAUDE.md explicitly permits (runtime-computed widths on progress bars).

---

## Decisions (from clarification)

| Question | Decision |
|----------|----------|
| User data source | `profiles` table (not `hub_users`) |
| Desk Pulse replacement | `classification_records` status distribution chart |
| OpsChat panel | Stub with visual shell ("Coming soon") |
| recharts | Install via `pnpm add recharts`; HR leave calendar stubbed |

---

## File Changes

| Action | File | Notes |
|--------|------|-------|
| Modify | `src/app/v2/(hub)/layout.tsx` | Switch from `hub_users` → `profiles`; email from JWT claims; drop `zoho_user_id`; import v2-sidebar |
| Create | `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` | V2-specific sidebar using `V2_ROUTES`, expanded nav groups |
| Modify | `src/app/v2/(hub)/dashboard/page.tsx` | Role-aware server component — fetches profile, renders correct dashboard |
| Create | `src/app/v2/(hub)/dashboard/_components/dashboard-shared.tsx` | KpiCard, SectionCard, StatusChip, AIChip, ConfidenceBar — Tailwind only |
| Create | `src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx` | PM dashboard client component |
| Create | `src/app/v2/(hub)/dashboard/_components/dev-dashboard.tsx` | Dev dashboard client component (Zoho-free) |
| Create | `src/app/v2/(hub)/dashboard/_components/admin-dashboard.tsx` | Admin dashboard client component |

---

## Implementation Steps

### Step 1 — Install recharts
```bash
pnpm add recharts
```

### Step 2 — Create v2-hub-sidebar.tsx

Create `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` as a v2-specific fork of `src/components/hub/hub-sidebar.tsx`. Key differences:
- Import `V2_ROUTES` instead of `ROUTES`
- Expand nav groups per design reference:
  ```
  Work:       Home (V2_ROUTES.DASHBOARD), Customers, Tasks, Pipeline, AI Chat
  Operations: Orchestration (V2_ROUTES.ORCHESTRATION)
  Knowledge:  Wiki (V2_ROUTES.KB)
  Admin:      Users (admin role only, V2_ROUTES.DASHBOARD_USERS)
  ```
- Use same collapse/expand, light/dark, and `usePMSettings()` logic as the original
- Props: `userRole: string | null` (email/displayName/zohoId props can be removed — sidebar only needs role for nav gating)
- The "Work" group label should be omitted if section only has one group (matches design reference minimal look)

### Step 3 — Update v2 layout.tsx

File: `src/app/v2/(hub)/layout.tsx`

Current query (hub_users):
```ts
const { data: profile } = await supabase
  .from("hub_users")
  .select("email, role, display_name, zoho_user_id")
  .eq("id", userId)
  .single();
// userEmail = profile.email
// userRole = profile.role
// userDisplayName = profile.display_name
// userZohoId = profile.zoho_user_id
```

Replace with (profiles):
```ts
const userEmail = (data.claims as Record<string, string>).email ?? null;

const { data: profile } = await supabase
  .from("profiles")
  .select("role, full_name")
  .eq("id", userId)
  .single();

if (profile) {
  userRole = profile.role;
  userDisplayName = profile.full_name;
}
// userZohoId → remove entirely, pass null to HubHeader
```

Also:
- Remove `let userZohoId` variable
- Remove the `if (userRole === "pending") redirect(...)` block — `profiles.role` has no `pending` value; `client` role users are valid
- Change `import HubSidebar from "@/components/hub/hub-sidebar"` → `import HubSidebar from "./_components/v2-hub-sidebar"`
- Pass `userZohoId={null}` to HubHeader (the Zoho ID block in header is already conditional on truthiness — passing null hides it automatically, no HubHeader change needed)

### Step 4 — Create dashboard-shared.tsx

File: `src/app/v2/(hub)/dashboard/_components/dashboard-shared.tsx`

Build these primitives using `bg-(--c-card)`, `border-(--c-border)`, `text-(--c-text)`, `text-(--c-blue)` etc. CSS variable Tailwind classes. No `style={{}}` except progress bar widths.

```
KpiCard({ label, value, delta?, deltaDir?, icon?, accentClass? })
  - Rounded card, border, bg-(--c-card)
  - Large value number, small label, optional delta chip (green/red based on deltaDir)
  - Optional icon in top-right corner

SectionCard({ title, action?, children })
  - Card wrapper with title row + optional action button slot

StatusChip({ status })
  - Maps status strings to color classes (static lookup map)
  - Uses same CSS var pattern as pm-tabs/shared.tsx STATUS_CLASSES

AIChip()
  - Small "AI" badge, bg-(--c-blue-tint) text-(--c-blue), rounded-full text-[10px]

ConfidenceBar({ pct, label })
  - Labeled horizontal bar — reuse ProgressBar from pm-tabs/shared.tsx pattern
  - Width via style={{ width: `${pct}%` }} (documented exception for runtime %)
```

### Step 5 — Create pm-dashboard.tsx

File: `src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx`

Client component. Fetches own data via Supabase browser client on mount (useEffect).

**Data queries:**
```ts
// KPI counts
const { data: classificationCounts } = await supabase
  .from("classification_records")
  .select("status")

// Plans awaiting approval
const { data: pendingPlans } = await supabase
  .from("implementation_plans")
  .select("id, title, customer_id, confidence_score, created_at")
  .eq("status", "PENDING_APPROVAL")
  .limit(5)

// Latest PM digest
const { data: digest } = await supabase
  .from("digest_logs")
  .select("*")
  .eq("type", "pm")
  .order("created_at", { ascending: false })
  .limit(1)
  .single()
```

**Layout (3 regions):**
```
[Header] Greeting + date (reuse greeting helpers pattern from home-tab.tsx)

[KPI Row — 4 KpiCards]
  1. Open classifications (status in [open, pending])
  2. Active tasks (status = active)
  3. Plans awaiting approval (PENDING_APPROVAL count) + AIChip
  4. Total customers (query customers table count)

[Main body — flex gap-5]
  [Left column — flex-1]
    SectionCard "Needs Your Decision"
      - List of pendingPlans (up to 5)
      - Each row: task title, customer_id chip, ConfidenceBar, "Approve" + "Review" buttons (link to /v2/orchestration)
      - Empty state: "No pending plans"

    SectionCard "Priority Tasks"
      - Table: checkbox, classification id, customer, priority dot, status chip, created_at
      - Rows: classification_records where status in [open, pending, planning], ordered by priority CRITICAL→LOW, limit 8
      - PriorityDot and StatusChip from dashboard-shared.tsx

  [Right rail — w-72 shrink-0]
    SectionCard "Classification Pulse" (replaces Desk Pulse)
      - recharts BarChart — status distribution from classificationCounts
      - Map statuses to colors using CSS var values

    SectionCard "Daily Digest"  
      - Amber left-border card (border-l-4 border-(--c-amber))
      - digest?.content?.summary text, relative timestamp
      - "No digest yet" empty state

    SectionCard "Leave Calendar"
      - Stub: "HR data coming soon" with a calendar icon placeholder

[OpsChat aside — fixed right edge, collapsible]
  - Stub panel: collapsed by default, toggle button
  - Expanded: shows "OpsChat — AI assistant coming soon" message
  - Visual: matches design reference right-side 372px panel shell
```

### Step 6 — Create dev-dashboard.tsx

File: `src/app/v2/(hub)/dashboard/_components/dev-dashboard.tsx`

Client component. No Zoho imports.

**Data queries:**
```ts
// Tasks assigned to current dev (via profiles.id)
const { data: myTasks } = await supabase
  .from("classification_records")
  .select("id, title, customer_id, status, priority, due_date, created_at")
  .eq("assigned_developer_id", userId)  // or similar FK — check schema

// If no assigned_developer_id column exists, fetch all open tasks as a fallback
// and note in a TODO comment
```

**Layout:**
```
[KPI Row — 5 KpiCards]
  1. Open tasks
  2. In Progress (status = active)
  3. For Review (status = review)
  4. Due Today
  5. Hours Billed (stub "—" until HR timesheets are wired)

[Main body — flex gap-5]
  [Left — flex-1]
    SectionCard "My Tasks"
      - Kanban-style 3-col grid (To Do / In Progress / For Review)
      - Each col: task cards showing title, customer chip, priority dot, due date
      - Max 4 cards per col, "See all" link

  [Right — w-72 shrink-0]
    SectionCard "Weekly Hours"
      - recharts BarChart with 2 series (billable / internal)
      - Stub with placeholder data (7 days × 2 bars)
      - Note: real data from hr.timesheets in future task

    SectionCard "Team Pool"
      - Unassigned tasks list (classification_records where assigned_developer_id IS NULL)
      - Each row: task title, customer, "Pick up" button (PATCH to update assigned_developer_id)
      - Limit 5 items
```

### Step 7 — Create admin-dashboard.tsx

File: `src/app/v2/(hub)/dashboard/_components/admin-dashboard.tsx`

Client component. Admin role only.

**Layout:**
```
[Header] Same greeting as PM

[KPI Row — same 4 cards as PM dashboard]

[PM Dashboard content — reuse PMDashboard component]
  Pass isDev=false, include all PM sections

[Admin extras — below PM content]
  SectionCard "LLM Spend by Customer"
    - Query llm_invocation_logs, group by customer_id, sum cost_usd
    - Budget bars (ProgressBar per customer)
    - Limit top 8 customers

  SectionCard "Event Bus Health"
    - classification_records counts by status
    - 3 stat chips: Pending, Processing, Failed

  SectionCard "Model Config"
    - Static table of current llm_config rows
    - "Edit in Settings" link — no inline editing here
```

### Step 8 — Create/update dashboard/page.tsx

File: `src/app/v2/(hub)/dashboard/page.tsx`

Server component. Fetches role from profiles, renders correct dashboard.

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PMDashboard from "./_components/pm-dashboard";
import DevDashboard from "./_components/dev-dashboard";
import AdminDashboard from "./_components/admin-dashboard";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/v2/auth/login");

  const userId = data.claims.sub;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", userId)
    .single();

  const role = profile?.role ?? "client";
  const displayName = profile?.full_name ?? null;

  if (role === "developer") return <DevDashboard userId={userId} displayName={displayName} />;
  if (role === "admin") return <AdminDashboard userId={userId} displayName={displayName} />;
  if (role === "pm" || role === "hr") return <PMDashboard userId={userId} displayName={displayName} />;

  // client role or unknown — show minimal view
  return (
    <div className="py-6.5 px-8">
      <p className="text-sm text-(--c-sub)">Dashboard access is not configured for your role.</p>
    </div>
  );
}
```

---

## Code Context

### profiles table (src/types/database.ts:498–506)
```ts
profiles: {
  Row: {
    id: string;
    role: "admin" | "hr" | "pm" | "developer" | "client";
    full_name: string | null;
    avatar_url: string | null;
    customer_id: string | null;
    created_at: string;
    updated_at: string;
  };
```
Note: **no `email` column on profiles** — get email from `data.claims.email` (JWT).

### CSS variable token reference (src/app/globals.css:220–244)
Light:  `--c-card: #ffffff`, `--c-border: rgba(0,0,0,0.08)`, `--c-blue: #3358F4`, `--c-orange: #d45e09`, `--c-violet: #4f46e5`, `--c-green: #15803d`, `--c-amber: #a16207`, `--c-red: #b91c1c`
Dark:   `--c-card: #121726`, `--c-blue: #5b7fff`, `--c-orange: #f97316`, `--c-violet: #818cf8`, `--c-green: #4ade80`
Tints:  `--c-blue-tint`, `--c-blue-bd`, `--c-orange-tint`, `--c-green-tint`, etc.
Usage:  `bg-(--c-card)`, `text-(--c-blue)`, `border-(--c-border)` — Tailwind v4 CSS variable syntax.

### Card base class pattern (src/components/hub/pm-tabs/home-tab.tsx:50)
```ts
const CARD = "rounded-[14px] border border-(--c-border) shadow-[0_1px_4px_rgba(0,0,0,0.05)] bg-(--c-card)";
```

### Static class map pattern (src/components/hub/pm-tabs/home-tab.tsx:54–60)
```ts
const PIPELINE_CLASSES: Record<string, { bar: string; num: string }> = {
  violet: { bar: "bg-(--c-violet)", num: "text-(--c-violet)" },
  sky:    { bar: "bg-(--c-sky)",    num: "text-(--c-sky)" },
  // ... always complete class strings, never construct dynamically
};
```

### v2 layout.tsx current query (src/app/v2/(hub)/layout.tsx:22–33)
```ts
const { data: profile } = await supabase
  .from("hub_users")
  .select("email, role, display_name, zoho_user_id")
  .eq("id", userId)
  .single();
```
Replace with: `.from("profiles").select("role, full_name")` + email from JWT claims.

### V2_ROUTES available paths (src/config/constants.ts)
```ts
V2_ROUTES.DASHBOARD, V2_ROUTES.DASHBOARD_CUSTOMERS, V2_ROUTES.DASHBOARD_TASKS,
V2_ROUTES.DASHBOARD_PIPELINE, V2_ROUTES.DASHBOARD_CHAT, V2_ROUTES.DASHBOARD_TIMELOGS,
V2_ROUTES.DASHBOARD_SETTINGS, V2_ROUTES.DASHBOARD_USERS,
V2_ROUTES.ORCHESTRATION, V2_ROUTES.KB
```

### HubSidebar interface (src/components/hub/hub-sidebar.tsx:57–62)
```ts
interface HubSidebarProps {
  userEmail: string | null;
  userRole: string | null;
  userDisplayName: string | null;
  userZohoId: string | null;
}
```
The new v2-hub-sidebar.tsx should simplify to just `{ userRole: string | null }`.

### HubHeader zohoUserId is already conditional (src/components/hub/hub-header.tsx:136–140)
```tsx
{shownZoho && (
  <div className={`text-[10px] text-slate-400 rounded-md px-2.5 py-1.5 font-mono ${...}`}>
    Zoho ID: {shownZoho}
  </div>
)}
```
Passing `zohoUserId={null}` from the updated layout automatically hides this — no HubHeader changes needed.

---

## Notes for Implementation Agent

- **sonnet required:** This task spans 7 files, introduces a new data source migration, installs a new library, and builds 3 role-specific dashboards with new component architecture.
- **Never import from `@/lib/zoho`** in any v2 dashboard file.
- **CSS variable Tailwind syntax is `bg-(--c-card)`** (parentheses), not `bg-[var(--c-card)]` (bracket-with-var). Both work but the parenthesis form is the project standard.
- **`style={{}}` is only acceptable for runtime-computed widths** (progress bar `width: ${pct}%`). All other layout, spacing, color must be Tailwind classes.
- **`profiles.role` enum does NOT include "pending"** — the v1 layout's `if (userRole === "pending") redirect` logic must be removed from the v2 layout. `client` role is a valid auth state.
- **`profiles` has no `email` column.** Get email from `(data.claims as Record<string, string>).email ?? null` after `supabase.auth.getClaims()`.
- **Dev role in profiles is `"developer"`** (not `"dev"` as used in v1 hub_users). Update any role comparisons accordingly.
- **Do not modify `src/components/hub/hub-sidebar.tsx`** — v1 still uses it. Create `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` as a v2-only fork.
- **recharts BarChart usage:** Use `BarChart` from `recharts`, wrap with `ResponsiveContainer`. Use hex values from the CSS token system for bar fills (pass as string literals since recharts doesn't read CSS vars). Map: blue → `#3358F4` (light) / `#5b7fff` (dark). Detect theme via `usePMSettings()`.
- **`assigned_developer_id` column:** Check `classification_records` schema in `src/types/database.ts` before writing the dev dashboard query. If the column doesn't exist, query all tasks with status `open|planning` as the dev kanban data and leave a TODO comment.
- **The v2 layout.tsx currently has no `_components/` directory** — create it as part of this task when adding v2-hub-sidebar.tsx.
- **OpsChat stub:** Visual shell only. A fixed-position (or absolute) right panel, 372px wide when expanded, collapsed to a tab/button. Use `useState` to toggle. Content: icon + "OpsChat — AI assistant coming soon" message. No API calls.
- **`implementation_plans.confidence_score` may be null** — display "—" in the ConfidenceBar if null.

---

## Acceptance Criteria

- [ ] `pnpm build` passes with no TypeScript errors
- [ ] Visiting `/v2/dashboard` as PM role shows KPI row, "Needs Your Decision" section, priority tasks table, classification pulse chart, digest card
- [ ] Visiting `/v2/dashboard` as developer role shows dev KPI row, kanban board, weekly hours chart stub
- [ ] Visiting `/v2/dashboard` as admin role shows PM dashboard + admin extras (LLM spend, event bus health)
- [ ] No "Zoho ID:" text visible anywhere on v2 dashboard
- [ ] Sidebar nav links all resolve to `/v2/*` paths (not v1 paths)
- [ ] Light/dark theme toggle works on all new components
- [ ] No inline `style={{}}` except progress bar widths
