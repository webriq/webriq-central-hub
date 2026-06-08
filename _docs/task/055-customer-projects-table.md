# Task 055 — New `customer_projects` Table

> **Type:** minor
> **Priority:** HIGH
> **Recommended Model:** sonnet
> **Status:** COMPLETED
> **Completed:** 2026-06-08
> **Investigation:** /understand ran before this spec. Findings embedded below.

> **Implementation Notes:**
> - Migration `024_customer_projects_table.sql` applied to production via `pnpm dlx supabase db push`.
> - `zoho-projects/` route deleted; replaced by `src/app/api/customers/[customerId]/projects/route.ts`.
> - All downstream references to old columns (`zoho_project_id`, `sanity_project_id`, `github_repo`, `dedicated_developers` on `customer_products`) updated across: `lib/zoho/index.ts`, `api/execution/route.ts`, `api/execution/[id]/revert/route.ts`, `api/classification/[id]/assign/route.ts`, `api/webhooks/route.ts`, `api/zoho/route.ts`, `dashboard/tasks/_pm-tasks.tsx`, `orchestration/_content.tsx`.
> - **Bug fix during testing:** `createZohoProject` in `lib/zoho/index.ts` was parsing `json?.projects?.[0]?.id` but the Zoho V3 API returns a flat object `{ id, name, ... }` at the root level (not nested). Fixed to `json?.projects?.[0] ?? json?.project ?? json` so the root object is the fallback. Zoho project ID now saves correctly.
> - **Bug fix during testing:** API route stored `createZohoProject`'s `""` failure return as an empty string in the DB. Fixed to `resolvedZohoId || null`. Route now also returns `zoho_creation_failed: true` in the response body if Zoho creation was requested but failed, so the UI can surface a warning without blocking the row insert.
> - TypeScript: 0 errors in source.

---

## Problem

`customer_products` carries four columns (`zoho_project_id`, `sanity_project_id`, `github_repo`, `dedicated_developers`) that are meaningless for products like PipelineForge and PublishForge. A Zoho project is a customer-level concept that spans engagement type, not a per-product attribute. Additionally, `POST /api/customers/[customerId]/products` currently auto-creates a Zoho project on every product add — causing multiple spurious Zoho projects for WRQ-CUST-253E with incorrect names and unsaved IDs.

## Goal

1. Create a `customer_projects` table with `customer_id` FK, `project_name`, `project_type`, `zoho_project_id`, `sanity_project_id`, `github_repo`, `dedicated_developers`.
2. Drop the four columns from `customer_products` (clean drop, no data migration).
3. Remove the auto-Zoho-creation block from the products POST route.
4. Add a **Projects** tab to the customer profile with an Add Project dialog (project_type dropdown drives auto-generated name suffix).
5. Replace the old per-product Zoho dialog with the new Projects tab flow.

---

## Requirements

- A customer can have zero or more projects (many-to-many not needed; `customer_id` FK is sufficient).
- `project_type` required, values: `Content Site` | `Ecommerce (B2C)` | `Ecommerce (B2B)` | `Custom App`.
- Auto-generate button: uses `project_type` + `company_name` to produce the name suffix per business rules (see Notes).
- Optional fields on create: `zoho_project_id`, `sanity_project_id`, `github_repo`, `dedicated_developers`.
- If `create_zoho_project: true` is passed on the POST, the API calls `createZohoProject` and saves the returned ID.
- After successful Zoho project creation, update `customers.status = 'active'` (preserve existing behavior from `zoho-projects/route.ts`).
- Existing `zoho-projects/route.ts` is rendered unused by this change — delete it.
- Projects tab uses lazy-load (same pattern as Assets tab).

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/024_customer_projects_table.sql` | CREATE | New table + drop old columns |
| `src/types/database.ts` | UPDATE | Add `customer_projects` type, remove 4 cols from `customer_products`, add `CustomerProjectRow` export |
| `src/app/api/customers/[customerId]/products/route.ts` | UPDATE | Remove auto-creation block (lines 3, 53–55, 68–76); remove old cols from insert |
| `src/app/api/customers/[customerId]/projects/route.ts` | CREATE | `GET` (list) + `POST` (create + optional Zoho) |
| `src/app/api/customers/[customerId]/zoho-projects/route.ts` | DELETE | Replaced by `/projects` route |
| `src/app/(hub)/customers/[customerId]/client.tsx` | UPDATE | Projects tab, new dialog, remove old cols from product forms/display |

---

## Implementation Steps

### Step 1 — Migration `024_customer_projects_table.sql`

```sql
-- 024_customer_projects_table.sql

create table if not exists customer_projects (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          text not null references customers (customer_id) on delete cascade,
  project_name         text not null,
  project_type         text not null check (project_type in ('Content Site', 'Ecommerce (B2C)', 'Ecommerce (B2B)', 'Custom App')),
  zoho_project_id      text,
  sanity_project_id    text,
  github_repo          text,
  dedicated_developers text[] not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_customer_projects_customer_id on customer_projects (customer_id);

-- Drop migrated columns from customer_products (clean drop, no data to preserve)
alter table customer_products
  drop column if exists zoho_project_id,
  drop column if exists sanity_project_id,
  drop column if exists github_repo,
  drop column if exists dedicated_developers;
```

Apply RLS on `customer_projects` matching the `customer_products` pattern in `003_rls_policies.sql` — enable RLS, add authenticated read policy, service-role full access.

### Step 2 — Update `src/types/database.ts`

**Remove from `customer_products` Row/Insert/Update:**
- `zoho_project_id: string | null`
- `sanity_project_id: string | null`
- `github_repo: string | null`
- `dedicated_developers: string[]`

**Add new table block** (after `customer_products`):
```ts
customer_projects: {
  Row: {
    id: string;
    customer_id: string;
    project_name: string;
    project_type: string;
    zoho_project_id: string | null;
    sanity_project_id: string | null;
    github_repo: string | null;
    dedicated_developers: string[];
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    customer_id: string;
    project_name: string;
    project_type: string;
    zoho_project_id?: string | null;
    sanity_project_id?: string | null;
    github_repo?: string | null;
    dedicated_developers?: string[];
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    customer_id?: string;
    project_name?: string;
    project_type?: string;
    zoho_project_id?: string | null;
    sanity_project_id?: string | null;
    github_repo?: string | null;
    dedicated_developers?: string[];
    updated_at?: string;
  };
  Relationships: [
    {
      foreignKeyName: "customer_projects_customer_id_fkey";
      columns: ["customer_id"];
      isOneToOne: false;
      referencedRelation: "customers";
      referencedColumns: ["customer_id"];
    }
  ];
};
```

**Add export** near line 761:
```ts
export type CustomerProjectRow = Database["public"]["Tables"]["customer_projects"]["Row"];
```

### Step 3 — Fix `products/route.ts`

Remove:
- Line 3: `import { createZohoProject } from "@/lib/zoho";`
- Lines 53–55 from the insert body: `sanity_project_id`, `zoho_project_id`, `github_repo`
- Lines 68–76: the entire Zoho auto-creation block

After removal the `POST` handler should end at `return NextResponse.json(data, { status: 201 });` right after the insert.

### Step 4 — Create `src/app/api/customers/[customerId]/projects/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createZohoProject } from "@/lib/zoho";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const { customerId } = await params;
  const { data, error } = await adminClient
    .from("customer_projects")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const { customerId } = await params;
  const body = await request.json();
  const { project_name, project_type, zoho_project_id, sanity_project_id, github_repo,
          dedicated_developers, create_zoho_project } = body;

  if (!project_name?.trim() || !project_type) {
    return NextResponse.json({ error: "project_name and project_type are required" }, { status: 400 });
  }

  const VALID_TYPES = ["Content Site", "Ecommerce (B2C)", "Ecommerce (B2B)", "Custom App"];
  if (!VALID_TYPES.includes(project_type)) {
    return NextResponse.json({ error: "Invalid project_type" }, { status: 400 });
  }

  let resolvedZohoId = zoho_project_id ?? null;
  if (create_zoho_project && !resolvedZohoId) {
    resolvedZohoId = await createZohoProject(customerId, project_name.trim());
    if (resolvedZohoId) {
      await adminClient
        .from("customers")
        .update({ status: "active" })
        .eq("customer_id", customerId);
    }
  }

  const { data, error } = await adminClient
    .from("customer_projects")
    .insert({
      customer_id: customerId,
      project_name: project_name.trim(),
      project_type,
      zoho_project_id: resolvedZohoId,
      sanity_project_id: sanity_project_id ?? null,
      github_repo: github_repo ?? null,
      dedicated_developers: dedicated_developers ?? [],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

### Step 5 — Delete `zoho-projects/route.ts`

Delete `src/app/api/customers/[customerId]/zoho-projects/route.ts` — replaced by Step 4.

### Step 6 — Update `client.tsx`

#### 6a. Types and constants (top of file)

Import `CustomerProjectRow` from `@/types/database`.

Replace `ZOHO_PROJECT_DEFAULTS` (lines 51–55) with:
```ts
const PROJECT_TYPE_SUFFIXES: Record<string, string> = {
  "Content Site":      "Content Site",
  "Ecommerce (B2C)":   "Ecommerce",
  "Ecommerce (B2B)":   "Ecommerce B2B",
  "Custom App":        "App",
};
const PROJECT_TYPES = ["Content Site", "Ecommerce (B2C)", "Ecommerce (B2B)", "Custom App"] as const;
```

Update `NavSection` type (line 17):
```ts
type NavSection = "company" | "contact" | "products" | "assets" | "activity" | "projects" | "settings";
```

#### 6b. State additions

Add to component state (near existing dialog states):
```ts
const [projects, setProjects] = useState<CustomerProjectRow[]>([]);
const hasFetchedProjectsRef = useRef(false);
const [addProjectDialogOpen, setAddProjectDialogOpen] = useState(false);
const [addProjectForm, setAddProjectForm] = useState({
  project_type: "", project_name: "", zoho_project_id: "",
  sanity_project_id: "", github_repo: "", dedicated_developers: "",
});
const [addProjectCreating, setAddProjectCreating] = useState(false);
const [addProjectError, setAddProjectError] = useState<string | null>(null);
const [createZohoWithProject, setCreateZohoWithProject] = useState(false);
```

#### 6c. Lazy-load effect for projects (add alongside assets effect at ~line 213)

```ts
useEffect(() => {
  if (activeSection !== "projects" || hasFetchedProjectsRef.current) return;
  hasFetchedProjectsRef.current = true;
  fetch(`/api/customers/${customer.customer_id}/projects`)
    .then(r => r.json())
    .then(d => setProjects(Array.isArray(d) ? d : []))
    .catch(() => {});
}, [activeSection, customer.customer_id]);
```

#### 6d. Add Project handlers

```ts
const handleGenerateProjectName = () => {
  if (!addProjectForm.project_type) return;
  const suffix = PROJECT_TYPE_SUFFIXES[addProjectForm.project_type] ?? addProjectForm.project_type;
  setAddProjectForm(f => ({ ...f, project_name: `${customer.company_name} ${suffix}` }));
};

const handleAddProject = async () => {
  if (!addProjectForm.project_name.trim() || !addProjectForm.project_type) {
    setAddProjectError("Project name and type are required.");
    return;
  }
  setAddProjectCreating(true);
  setAddProjectError(null);
  try {
    const res = await fetch(`/api/customers/${customer.customer_id}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_name: addProjectForm.project_name,
        project_type: addProjectForm.project_type,
        zoho_project_id: addProjectForm.zoho_project_id || null,
        sanity_project_id: addProjectForm.sanity_project_id || null,
        github_repo: addProjectForm.github_repo || null,
        dedicated_developers: addProjectForm.dedicated_developers
          ? addProjectForm.dedicated_developers.split(",").map(s => s.trim()).filter(Boolean)
          : [],
        create_zoho_project: createZohoWithProject,
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? "Failed to create project");
    }
    const newProject: CustomerProjectRow = await res.json();
    setProjects(p => [newProject, ...p]);
    setAddProjectDialogOpen(false);
    setAddProjectForm({ project_type: "", project_name: "", zoho_project_id: "",
                        sanity_project_id: "", github_repo: "", dedicated_developers: "" });
    setCreateZohoWithProject(false);
    router.refresh();
  } catch (err) {
    setAddProjectError(err instanceof Error ? err.message : "Failed to create project");
  } finally {
    setAddProjectCreating(false);
  }
};
```

#### 6e. Nav items (line 551)

Add between "assets" and "activity":
```ts
{ id: "projects", label: "Projects" },
```

#### 6f. Product forms — remove old columns

Remove these fields from the **edit product form** UI (lines 741–764):
- Zoho Project ID input (line 741–743)
- Sanity Project ID input (line 753–755)
- GitHub Repo input (line 763–765)

Remove these fields from the **add product form** UI (lines 842–865):
- Same three inputs

Remove from edit form state init (line 259–261) and reset (line 319).
Remove from API call bodies (lines 279–281, 309–311).

#### 6g. Product display card — remove old column display

Remove lines 1561–1607 which render `dedicated_developers`, `sanity_project_id`, `zoho_project_id`, `github_repo` from product cards.

#### 6h. Replace Zoho Projects dialog with Add Project dialog (lines 1082–1150)

Replace the old "Create Zoho Projects" dialog with:

```tsx
{addProjectDialogOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-130 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-slate-900">Add Project</h2>
          <p className="text-xs text-slate-400 mt-0.5">{customer.company_name}</p>
        </div>
        <button
          onClick={() => { setAddProjectDialogOpen(false); setAddProjectError(null); }}
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors border-none bg-transparent cursor-pointer text-lg leading-none"
        >×</button>
      </div>
      <div className="px-6 py-5 space-y-4">
        <div>
          <label className={labelCls}>Project Type <span className="text-red-400">*</span></label>
          <select
            value={addProjectForm.project_type}
            onChange={e => setAddProjectForm(f => ({ ...f, project_type: e.target.value }))}
            className={inputCls}
          >
            <option value="">Select type…</option>
            {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Project Name <span className="text-red-400">*</span></label>
          <div className="flex gap-2">
            <input
              type="text"
              value={addProjectForm.project_name}
              onChange={e => setAddProjectForm(f => ({ ...f, project_name: e.target.value }))}
              className={cn(inputCls, "flex-1")}
              placeholder="e.g. Acme Corp Content Site"
            />
            <button
              onClick={handleGenerateProjectName}
              disabled={!addProjectForm.project_type}
              className="py-2 px-3 text-[11px] font-semibold text-brand border border-brand/30 rounded-lg hover:bg-brand/5 transition-colors cursor-pointer bg-transparent whitespace-nowrap disabled:opacity-40"
            >Generate</button>
          </div>
        </div>
        <div>
          <label className={labelCls}>GitHub Repo</label>
          <input type="text" value={addProjectForm.github_repo}
            onChange={e => setAddProjectForm(f => ({ ...f, github_repo: e.target.value }))}
            className={inputCls} placeholder="https://github.com/org/repo" />
        </div>
        <div>
          <label className={labelCls}>Sanity Project ID</label>
          <input type="text" value={addProjectForm.sanity_project_id}
            onChange={e => setAddProjectForm(f => ({ ...f, sanity_project_id: e.target.value }))}
            className={inputCls} placeholder="abc123" />
        </div>
        <div>
          <label className={labelCls}>Dedicated Developers</label>
          <input type="text" value={addProjectForm.dedicated_developers}
            onChange={e => setAddProjectForm(f => ({ ...f, dedicated_developers: e.target.value }))}
            className={inputCls} placeholder="dev1@webriq.com, dev2@webriq.com (comma-separated)" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={createZohoWithProject}
            onChange={e => setCreateZohoWithProject(e.target.checked)}
            className="rounded border-slate-300" />
          Create Zoho Project now
        </label>
        {addProjectError && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {addProjectError}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
        <button
          onClick={() => { setAddProjectDialogOpen(false); setAddProjectError(null); }}
          className="font-[inherit] py-2 px-4 bg-transparent text-slate-600 text-sm font-medium border border-slate-200 rounded-full cursor-pointer hover:border-slate-300 transition-colors"
        >Cancel</button>
        <button
          onClick={handleAddProject}
          disabled={addProjectCreating}
          className="font-[inherit] py-2 px-5 bg-brand text-white text-sm font-semibold border-none rounded-full cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60"
        >{addProjectCreating ? "Creating…" : "Add Project"}</button>
      </div>
    </div>
  </div>
)}
```

#### 6i. Projects tab section (add after `{activeSection === "activity" && ...}` block, before settings)

```tsx
{activeSection === "projects" && (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <h3 className={sectionTitleCls}>Projects</h3>
      <button
        onClick={() => { setAddProjectDialogOpen(true); setAddProjectError(null); }}
        className="text-[11px] font-semibold text-brand border border-brand/30 rounded-full px-3 py-1 hover:bg-brand/5 transition-colors cursor-pointer bg-transparent"
      >+ Add Project</button>
    </div>
    {projects.length === 0 ? (
      <p className="text-sm text-slate-400">No projects yet.</p>
    ) : (
      <div className="space-y-3">
        {projects.map(proj => (
          <div key={proj.id} className="border border-slate-200 rounded-xl p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">{proj.project_name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{proj.project_type}</p>
              </div>
            </div>
            {proj.zoho_project_id && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="font-medium">Zoho:</span>
                <a
                  href={`https://projects.zoho.com/portal/${zohoPortalName}#zp/projects/${proj.zoho_project_id}/dashboard`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-brand hover:underline font-mono"
                >{proj.zoho_project_id}</a>
              </div>
            )}
            {proj.github_repo && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="font-medium">GitHub:</span>
                <a href={proj.github_repo} target="_blank" rel="noopener noreferrer"
                  className="text-brand hover:underline truncate">{proj.github_repo}</a>
              </div>
            )}
            {proj.sanity_project_id && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="font-medium">Sanity:</span>
                <span className="font-mono">{proj.sanity_project_id}</span>
              </div>
            )}
            {proj.dedicated_developers.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="font-medium">Devs:</span>
                <span>{proj.dedicated_developers.join(", ")}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

#### 6j. Remove the "Create Zoho Projects" button trigger

Find the button that calls `handleOpenZohoDialog` (currently in the products tab or header area) and either remove it or replace it with one that calls `setActiveSection("projects")` + `setAddProjectDialogOpen(true)`. If the button was shown only on `status === "completed_onboarding"`, that condition can be removed — the Projects tab is always accessible.

---

## Code Context

### Auto-creation block to delete (`products/route.ts:68–76`)

```ts
// Attempt Zoho Project creation — no-op if env vars absent (blocked on O3)
const zohoProjectId = await createZohoProject(customerId, `${productName} — ${customerId}`);
if (zohoProjectId) {
  await adminClient
    .from("customer_products")
    .update({ zoho_project_id: zohoProjectId })
    .eq("id", data.id);
  data.zoho_project_id = zohoProjectId;
}
```

### `ZOHO_PROJECT_DEFAULTS` to replace (`client.tsx:51–55`)

```ts
const ZOHO_PROJECT_DEFAULTS: Record<string, string> = {
  StackShift: "App",
  PublishForge: "Content Site",
  PipelineForge: "Pipeline",
};
```

### Current `handleCreateZohoProjects` calls `zoho-projects` route (`client.tsx:485`)

```ts
const res = await fetch(`/api/customers/${customer.customer_id}/zoho-projects`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ projects: zohoProjectNames }),
});
```
→ Replace with call to `/api/customers/${customer.customer_id}/projects`.

### Existing `zoho-projects/route.ts` that maps `customer_products` (to be deleted)

Currently iterates `{ projects: Record<productName, projectName> }` and saves `zoho_project_id` to `customer_products` rows. This entire file is deleted in Step 5.

### `NavSection` current definition (line 17)

```ts
type NavSection = "company" | "contact" | "products" | "assets" | "activity" | "settings";
```
→ Add `"projects"` before `"settings"`.

---

## Notes for Implementation Agent

- **Sonnet required**: this is a schema migration touching DB, 2 API routes, and a large client component across ~15 distinct edit sites.
- **Migration order**: apply `024_customer_projects_table.sql` before touching TypeScript files. The `ALTER TABLE ... DROP COLUMN` will fail if TS code still references those columns — update `database.ts` types first, then client code.
- Do **not** touch `onboarding/route.ts` — completion flow is correct and separate.
- Do **not** touch the `customers.status` transition logic other than moving it into the new `/projects` POST handler.
- The `handleOpenZohoDialog` state (`zohoDialogOpen`, `zohoProjectNames`, `zohoError`, `zohoCreating`) and related handlers can all be removed from client state once the old dialog is replaced.
- Products section still shows product cards — just without the four removed fields. Do not remove the product cards themselves.
- The Projects tab lazy-load should use the same `useRef` guard pattern as the Assets tab (`hasFetchedAssetsRef`).
- RLS: check `003_rls_policies.sql` for the pattern applied to `customer_products` and mirror it for `customer_projects`.
- Project name generation suffix rules (from business spec):
  - `Content Site` → `"{Company} Content Site"` (StackShift pure content)
  - `Ecommerce (B2C)` → `"{Company} Ecommerce"` (StackShift + Medusa/Swell B2C)
  - `Ecommerce (B2B)` → `"{Company} Ecommerce B2B"` (StackShift + B2B)
  - `Custom App` → `"{Company} App"` (pure custom dev)
