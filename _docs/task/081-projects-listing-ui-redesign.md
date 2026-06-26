# Task 081 — Projects Listing Page UI/UX Redesign

> **Priority:** HIGH
> **Type:** feature (minor — UI + migration with no breaking changes)
> **Recommended Model:** sonnet
> **Investigation:** /understand ran before this spec. Findings embedded below.
> **Status:** TESTING
> **Completed:** 2026-06-25
> **Implementation Notes:** `owner_name` stored as first-class column (not a profiles join) — Zoho-imported rows have `created_by = null` so the column stores `p.owner.full_name` from the import. `AssigneeChip` unchanged (used in `_list-view.tsx` with old `{id, idx}` signature); new `OwnerChip` component handles name+initials for the listing. `CompletionRing` uses inline SVG `transformOrigin` on the `<text>` element to counter-rotate the `-90deg` parent. TypeScript clean (no errors).

---

## Goal

Redesign the v2 Projects listing page (`/v2/projects`) to feel polished and human. Replace the current minimal grid with a dual-view layout (Grid + List), richer card metadata, distinctive status/type colors, completion ring, owner identity, due-date countdown, pagination, and skeleton loading states. Add a `tags` column to `projects` and DB indexes for query performance.

---

## Decisions (resolved pre-spec)

| Question | Decision |
|----------|----------|
| "Not started" status | Visual-only: active + 0% completion → show "Not Started" label + purple/slate color. No new DB status value. |
| Issues count | Skip — `tickets` has no `project_id`; out of scope. |
| Completion % | Computed from `task_done / task_total` (live, always accurate). |
| Tags | New `tags text[]` column on `projects` via migration 036. Populated via create/edit modal. |
| Owner field | `projects.created_by` → join `profiles` for `full_name` + `avatar_url`. |
| Pagination | Server-side `range()` + `count`. Grid: 15/50/90 per page. List: 20/50/100 per page. |

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/036_projects_indexes_tags.sql` | Create | DB indexes on projects + tasks tables; add `tags text[]` to projects |
| `src/app/v2/(hub)/projects/page.tsx` | Modify | Extended query: add `end_date`, `created_by`, `tags`; join `profiles`; server-side pagination via `range()` + count; accept `page` + `pageSize` search params |
| `src/app/v2/(hub)/projects/_projects-index.tsx` | Modify | Full redesign: grid/list toggle, new card fields (owner, tags, ring, tasks, due date), pagination UI, skeleton, project type color chips |
| `src/app/v2/(hub)/projects/_pm-shared.tsx` | Modify | Add `PROJECT_TYPE_STYLE`, update `PROJECT_STATUS_STYLE` (add not_started), update `ProjectStatusBadge` (pct-aware label), add `CompletionRing` SVG, add `businessDaysRemaining()` util, update `AssigneeChip` (accept name + avatarUrl) |
| `src/app/v2/(hub)/projects/loading.tsx` | Create | Next.js App Router skeleton segment for the projects route |

---

## Implementation Steps

### Step 1 — Migration 036: indexes + tags column

Create `supabase/migrations/036_projects_indexes_tags.sql`:

```sql
-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_projects_status     ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_customer   ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated    ON projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_project       ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status        ON tasks(status);

-- Tags column
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
```

Apply with: `pnpm supabase db push` or paste into Supabase SQL editor.

### Step 2 — Update `src/types/database.ts`

Add `tags: string[] | null` to `projects` Row and Insert/Update types. This is a generated file — add manually only to the `projects` table Row, Insert, and Update interfaces.

### Step 3 — Update `_pm-shared.tsx`

**3a. `PROJECT_STATUS_STYLE`** — add `not_started` entry (visual alias, not a DB value):
```ts
export const PROJECT_STATUS_STYLE: Record<string, { text: string; bg: string; border: string; label: string }> = {
  not_started: { text: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE", label: "Not Started" },
  active:      { text: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE", label: "Active" },
  on_hold:     { text: "#D97706", bg: "#FFFBEB", border: "#FDE68A", label: "On Hold" },
  completed:   { text: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0", label: "Completed" },
  archived:    { text: "#94A3B8", bg: "#F8FAFC", border: "#E2E8F0", label: "Archived" },
};
```
Note the status color changes from the investigation: active moves from green → blue (green is now "completed"), not_started gets purple.

**3b. `PROJECT_TYPE_STYLE`** — static lookup map with distinctive colors:
```ts
export const PROJECT_TYPE_STYLE: Record<string, { text: string; bg: string; border: string }> = {
  "Content Site":      { text: "#0D9488", bg: "#F0FDFA", border: "#99F6E4" },
  "Ecommerce (B2C)":   { text: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
  "Ecommerce (B2B)":   { text: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  "Custom App":        { text: "#EA580C", bg: "#FFF7ED", border: "#FED7AA" },
};
```

**3c. `ProjectStatusBadge`** — accept `pct?: number` to derive the display key:
```ts
export function ProjectStatusBadge({ status, pct }: { status: string; pct?: number }) {
  const key = status === "active" && (pct ?? 1) === 0 ? "not_started" : status;
  const c = PROJECT_STATUS_STYLE[key] ?? PROJECT_STATUS_STYLE.active;
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap"
      style={{ color: c.text, background: c.bg, borderColor: c.border }}
    >
      {c.label}
    </span>
  );
}
```

**3d. `ProjectTypeBadge`** — new component using the style map:
```ts
export function ProjectTypeBadge({ type }: { type: string }) {
  const c = PROJECT_TYPE_STYLE[type] ?? { text: "#64748B", bg: "#F8FAFC", border: "#E2E8F0" };
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-md border whitespace-nowrap"
      style={{ color: c.text, background: c.bg, borderColor: c.border }}
    >
      {type}
    </span>
  );
}
```

**3e. `CompletionRing`** — pure SVG circle (no recharts):
```tsx
export function CompletionRing({ pct, size = 40 }: { pct: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={3} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={pct === 100 ? "#16A34A" : "#2563EB"}
        strokeWidth={3} strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
      />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
        className="rotate-90" style={{ fontSize: size * 0.24, fill: "#334155", fontWeight: 600, transform: `rotate(90deg) translate(0, 0)` }}>
        {pct}%
      </text>
    </svg>
  );
}
```
Note: SVG `<text>` needs `rotate(90deg)` to counter the parent `-rotate-90`. Use inline `style` on the `<text>` element because Tailwind classes don't work inside SVG `<text>`. The parent SVG uses `-rotate-90` to start the arc from the top (12 o'clock).

**3f. `businessDaysRemaining(endDate: string | null)`** — utility:
```ts
export function businessDaysRemaining(endDate: string | null): number | null {
  if (!endDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate + "T00:00:00");
  if (isNaN(end.getTime())) return null;
  let days = 0;
  const dir = end >= today ? 1 : -1;
  const cur = new Date(today);
  while (cur.getTime() !== end.getTime()) {
    cur.setDate(cur.getDate() + dir);
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days += dir;
  }
  return days; // negative = overdue
}
```

**3g. `AssigneeChip`** — update to accept `name` + `avatarUrl`:
```tsx
export function AssigneeChip({ name, avatarUrl, idx }: { name: string; avatarUrl?: string | null; idx: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white border-2 border-white overflow-hidden shrink-0"
      style={{ background: avatarUrl ? "transparent" : AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
      title={name}
    >
      {avatarUrl
        ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        : initials}
    </div>
  );
}
```

### Step 4 — Update `page.tsx` (server component)

The server component needs to:
1. Read `page` and `pageSize` from `searchParams`
2. Query `projects` with extended fields + pagination
3. Join `profiles` for owner info
4. Pass total count + owner map to client

```ts
// Accept search params for pagination
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; page?: string; pageSize?: string; view?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  // Default page size: grid=15, list=20 — server doesn't know the view, so use 15 (client picks the active default)
  const pageSize = parseInt(params.pageSize ?? "15", 10);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Parallel queries: projects (paginated), customers, task counts, profiles (for owners)
  const [projectsRes, customersRes, taskCountRes] = await Promise.all([
    supabase
      .from("projects")
      .select("id,name,project_type,status,customer_id,end_date,created_by,tags,updated_at", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(from, to),
    supabase.from("customers").select("customer_id,company_name").order("company_name"),
    supabase.from("tasks").select("project_id,status").is("parent_task_id", null),
  ]);

  // Fetch profiles for owners of current page only
  const ownerIds = [...new Set((projectsRes.data ?? []).map((p) => p.created_by).filter(Boolean))];
  const profilesRes = ownerIds.length > 0
    ? await supabase.from("profiles").select("id,full_name,avatar_url").in("id", ownerIds)
    : { data: [] };

  const profileMap = new Map((profilesRes.data ?? []).map((pr) => [pr.id, pr]));
  // ... rest of aggregation same as before, add owner fields and tags
}
```

Key changes to `ProjectListItem` type (in `_projects-index.tsx`):
```ts
export type ProjectListItem = {
  id: string;
  name: string;
  project_type: string;
  status: string;
  customer_id: string;
  company_name: string;
  task_total: number;
  task_done: number;
  // New fields:
  end_date: string | null;
  tags: string[];
  owner_name: string | null;
  owner_avatar: string | null;
};

// New props for pagination:
export type PaginationMeta = { page: number; pageSize: number; total: number };
```

Pass `paginationMeta: PaginationMeta` and `initialView: "grid" | "list"` as props to `ProjectsIndex`.

### Step 5 — Redesign `_projects-index.tsx`

**5a. State additions:**
```ts
const [view, setView] = useState<"grid" | "list">(initialView ?? "grid");
const [page, setPage] = useState(paginationMeta.page);
```

**5b. View toggle UI** — add to the filters bar:
```tsx
<div className="flex items-center gap-1 border border-slate-200 rounded-lg p-0.5 bg-white">
  <button onClick={() => setView("grid")} className={cn(/* grid icon button */)}>
    <LayoutGrid size={15} />
  </button>
  <button onClick={() => setView("list")} className={cn(/* list icon button */)}>
    <List size={15} />
  </button>
</div>
```
Import `LayoutGrid, List` from `lucide-react`.

When view changes, push updated `?view=` + `?pageSize=` to URL (so server can default the page size correctly on next load). Use `router.push` with the updated search params.

**5c. Grid card redesign** — replace the current card body:

```tsx
// Grid card (use <Link> instead of <button> for better semantics):
<Link href={`${V2_ROUTES.PROJECTS}/${p.id}`} key={p.id}
  className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-5 hover:border-slate-300 hover:shadow-md transition-all flex flex-col gap-3 group"
>
  {/* Row 1: Title + Status */}
  <div className="flex items-start justify-between gap-2">
    <div className="min-w-0 flex-1">
      <div className="text-[15px] font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
        {p.name}
      </div>
      <div className="text-[12px] text-slate-400 mt-0.5 truncate">{p.company_name}</div>
    </div>
    <ProjectStatusBadge status={p.status} pct={pct} />
  </div>

  {/* Row 2: Project type */}
  <ProjectTypeBadge type={p.project_type} />

  {/* Row 3: Tags (if any) */}
  {p.tags.length > 0 && (
    <div className="flex flex-wrap gap-1">
      {p.tags.slice(0, 3).map((tag) => (
        <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
          {tag}
        </span>
      ))}
      {p.tags.length > 3 && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
          +{p.tags.length - 3}
        </span>
      )}
    </div>
  )}

  {/* Row 4: Bottom row — owner + ring + tasks + due date */}
  <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
    {/* Owner */}
    <div className="flex items-center gap-1.5 min-w-0">
      {p.owner_name && <AssigneeChip name={p.owner_name} avatarUrl={p.owner_avatar} idx={0} />}
      <span className="text-[11px] text-slate-500 truncate">{p.owner_name ?? "Unassigned"}</span>
    </div>

    {/* Completion ring + tasks count */}
    <div className="flex items-center gap-2 shrink-0">
      <div className="text-right">
        <div className="text-[11px] text-slate-500">{p.task_done}/{p.task_total} tasks</div>
        {daysLeft !== null && (
          <div className={cn("text-[10px] font-medium mt-0.5", daysLeft < 0 ? "text-red-600" : daysLeft <= 3 ? "text-amber-600" : "text-slate-400")}>
            {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
          </div>
        )}
      </div>
      <CompletionRing pct={pct} size={38} />
    </div>
  </div>
</Link>
```

Switch grid card from `<button>` to `<Link href={...}>` from `next/link`. Import `Link` from `next/link`.

**5d. List view** — render a structured table:

```tsx
// List view
<div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
  <table className="w-full text-[13px]">
    <thead>
      <tr className="border-b border-slate-100 bg-slate-50">
        <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Project</th>
        <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
        <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Type</th>
        <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</th>
        <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Owner</th>
        <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Progress</th>
        <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Due</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-100">
      {filtered.map((p) => (
        <tr key={p.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => router.push(...)}>
          <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
          <td className="px-4 py-3 text-slate-500">{p.company_name}</td>
          <td className="px-4 py-3"><ProjectTypeBadge type={p.project_type} /></td>
          <td className="px-4 py-3"><ProjectStatusBadge status={p.status} pct={pct} /></td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-1.5">
              {p.owner_name && <AssigneeChip name={p.owner_name} avatarUrl={p.owner_avatar} idx={0} />}
              <span className="text-slate-500">{p.owner_name ?? "—"}</span>
            </div>
          </td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[11px] text-slate-400 font-mono">{pct}%</span>
            </div>
          </td>
          <td className="px-4 py-3 text-[12px]">
            {daysLeft !== null
              ? <span className={daysLeft < 0 ? "text-red-600 font-medium" : "text-slate-500"}>
                  {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d`}
                </span>
              : <span className="text-slate-300">—</span>}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

**5e. Pagination UI** — below the grid/list:

```tsx
// Page size options differ by view
const PAGE_SIZE_OPTIONS = view === "grid" ? [15, 50, 90] : [20, 50, 100];

// Pagination bar
<div className="flex items-center justify-between mt-6 text-[13px]">
  <div className="flex items-center gap-2 text-slate-500">
    <span>Show</span>
    {PAGE_SIZE_OPTIONS.map((n) => (
      <button key={n} onClick={() => handlePageSizeChange(n)}
        className={cn("px-2.5 py-1 rounded-md text-[12px]", pageSize === n ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer")}
      >
        {n}
      </button>
    ))}
  </div>
  <div className="flex items-center gap-1">
    <span className="text-slate-400 text-[12px] mr-2">
      {from + 1}–{Math.min(to + 1, total)} of {total}
    </span>
    <button onClick={() => handlePageChange(page - 1)} disabled={page <= 1} className="p-1.5 rounded-md border border-slate-200 disabled:opacity-30 hover:bg-slate-50 cursor-pointer">
      <ChevronLeft size={14} />
    </button>
    <button onClick={() => handlePageChange(page + 1)} disabled={to + 1 >= total} className="p-1.5 rounded-md border border-slate-200 disabled:opacity-30 hover:bg-slate-50 cursor-pointer">
      <ChevronRight size={14} />
    </button>
  </div>
</div>
```

Page/pageSize changes navigate with `router.push(url_with_new_params)` which triggers server-side refetch via Next.js dynamic routing. Import `ChevronLeft, ChevronRight` from `lucide-react`.

**5f. `CreateProjectModal`** — add `tags` field:
Add a tags input (comma-separated text → split into array on submit). Include in the POST body.

### Step 6 — `loading.tsx` skeleton

Create `src/app/v2/(hub)/projects/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectsLoading() {
  return (
    <div className="px-8 py-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="flex items-center gap-3 mb-5">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-9 w-56 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3.5 w-28" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-5 w-24 rounded-md" />
            <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-7 w-7 rounded-full" />
                <Skeleton className="h-3.5 w-20" />
              </div>
              <Skeleton className="h-9 w-9 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Code Context

### `page.tsx` — current query pattern (lines 9–16)
```ts
const [projectsRes, customersRes, taskCountRes] = await Promise.all([
  supabase
    .from("projects")
    .select("id,name,project_type,status,customer_id,description,updated_at")
    .order("updated_at", { ascending: false }),
  supabase.from("customers").select("customer_id,company_name").order("company_name"),
  supabase.from("tasks").select("project_id,status").is("parent_task_id", null),
]);
```
→ Extend with `end_date,created_by,tags` and add `{ count: "exact" }` + `.range(from, to)`.

### `_projects-index.tsx` — `ProjectListItem` type (lines 9–19)
```ts
export type ProjectListItem = {
  id: string;
  name: string;
  project_type: string;
  status: string;
  customer_id: string;
  company_name: string;
  description: string | null;
  task_total: number;
  task_done: number;
};
```
→ Add `end_date`, `tags`, `owner_name`, `owner_avatar`; remove `description`.

### `_pm-shared.tsx` — `PROJECT_STATUS_STYLE` and `PROJECT_TYPES` (lines 55–67)
```ts
export const PROJECT_STATUS_STYLE: Record<string, { text: string; bg: string; border: string }> = {
  active:    { text: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  on_hold:   { text: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  completed: { text: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  archived:  { text: "#94A3B8", bg: "#F8FAFC", border: "#E2E8F0" },
};
export const PROJECT_TYPES = ["Content Site","Ecommerce (B2C)","Ecommerce (B2B)","Custom App"] as const;
```
→ Add `not_started` variant; swap `active` color to blue; swap `completed` to green; add `label` field; add `PROJECT_TYPE_STYLE` map.

### `_pm-shared.tsx` — `AssigneeChip` (lines 114–125)
```tsx
export function AssigneeChip({ id, idx }: { id: string; idx: number }) {
  const initials = id.replace(/-/g, "").slice(0, 2).toUpperCase();
  return (
    <div className="w-6 h-6 rounded-full ..." style={{ background: ... }} title={id}>
      {initials}
    </div>
  );
}
```
→ Replace with `name` + `avatarUrl` params. Show `<img>` when `avatarUrl` is not null.

### `_pm-shared.tsx` — `ProjectStatusBadge` (lines 100–110)
```tsx
export function ProjectStatusBadge({ status }: { status: string }) {
  const c = PROJECT_STATUS_STYLE[status] ?? PROJECT_STATUS_STYLE.active;
  return <span ... style={{ color: c.text, background: c.bg, borderColor: c.border }}>{status.replace("_", " ")}</span>;
}
```
→ Accept `pct?: number`; derive `key = status === "active" && pct === 0 ? "not_started" : status`; render `c.label` instead of raw `status.replace`.

---

## Notes for Implementation Agent

- **Recommended model: sonnet** — cross-cutting change spans DB migration, server component data pipeline, shared component library, and full client component redesign. Multiple judgment calls in layout/interaction.
- **No `CREATE INDEX` exists for `projects` or `tasks`** in any migration (confirmed across all 035 migration files). Migration 036 is the first to add them — do not check for existing indexes.
- **`tags` is a new column**: it will be `null` for existing rows until the migration adds it. The query + type should treat it as `string[] | null`; coerce to `[]` in the mapping step: `tags: p.tags ?? []`.
- **`profiles.avatar_url` may be null** — `AssigneeChip` should fall back to initials. Do not render a broken `<img>` tag.
- **SVG `<text>` rotation trick**: the parent `<svg>` has Tailwind `-rotate-90` to start the arc at 12 o'clock. The `<text>` element must counter-rotate. Use `transform="rotate(90, cx, cy)"` as an SVG attribute on the `<text>` element, not a Tailwind class, since Tailwind transforms don't apply to SVG child elements.
- **Pagination is URL-driven** (`?page=2&pageSize=15`). When page/size changes, push new URL → Next.js re-runs the server component. Client maintains page state as derived from URL params, not independent state, to avoid stale data.
- **`filter` is still client-side** (search + status + customer filter) applied to the current page's data. This is intentional: server paginates by `updated_at`, client filters the current page. Full server-side filtering (with search param) is out of scope for this task.
- **`AssigneeChip` is also used in task views** (`_pm-shared.tsx:114` is imported elsewhere). Update the signature carefully — check for other callers with `Grep("AssigneeChip")` before changing the props interface. If other callers pass the old `id` prop, update them too or add a default.
- **`loading.tsx` requires `<Skeleton>`** from shadcn. Run `npx shadcn add skeleton` if `src/components/ui/skeleton.tsx` does not exist.
- **All new Tailwind color classes must be complete class strings** — no dynamic construction. Use the `style={{}}` pattern (already established in `_pm-shared.tsx`) for dynamic palette values.
- **`description` field**: remove from `ProjectListItem` type and from the query; it moves to the detail page. The `CreateProjectModal` can keep its description textarea for creation, but description is not displayed on the listing.
- **Project type badge vs. status badge shape**: use `rounded-md` for type badge (square-ish), `rounded-full` for status badge (pill) — visually differentiates the two.
- **`export const dynamic = "force-dynamic"`** must remain in `page.tsx` — it reads search params on every request.

---

## Acceptance Criteria

- [ ] Migration 036 applies cleanly (no errors); `projects` has `tags` column; 5 indexes created
- [ ] Grid view shows: owner avatar + name, tags (up to 3 + overflow count), completion ring with %, task count (done/total), due-date countdown or overdue indicator
- [ ] List view shows: tabular layout with project name, customer, type badge, status badge, owner, progress bar + %, due
- [ ] Grid/List toggle persists view choice in URL (`?view=grid|list`)
- [ ] Status badges: Not Started (purple), Active (blue), On Hold (amber), Completed (green), Archived (gray)
- [ ] Project type badges have distinctive colors per type
- [ ] Pagination works: correct page size options per view (grid: 15/50/90, list: 20/50/100); prev/next buttons; "N–M of total" label
- [ ] Skeleton loading shows during navigation (loading.tsx)
- [ ] CreateProjectModal includes tags field (comma-separated input → array on submit)
- [ ] No inline `style={{}}` for Tailwind-expressible properties; dynamic palette values stay in `style={{}}`
- [ ] TypeScript check passes: `npx tsc --noEmit`
