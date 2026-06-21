---
id: "058"
title: "Edit Project Modal — Edit Button on Project Cards with Zoho Rename Sync"
type: "minor"
priority: "HIGH"
status: "testing"
created: "2026-06-09"
completed: "2026-06-09"
---

> **Recommended Model:** sonnet
> **Status:** TESTING
> **Completed:** 2026-06-09
> **Investigation:** /understand ran before this spec. Findings embedded below.

## Implementation Notes

- `updateZohoProject` added to `src/lib/zoho/index.ts` after `createZohoProject` (line ~98) — `PUT /projects/{id}` with `{ name }` body, returns boolean, never throws
- New route `src/app/api/customers/[customerId]/projects/[projectId]/route.ts` — PATCH handler, uses `ProjectUpdate` type from `Database` type for Supabase `.update()` call
- State update uses `setProjects(prev => prev.map(...))` not `router.refresh()` — projects list is lazy-fetched behind `hasFetchedProjectsRef`
- Zoho rename is non-blocking: Supabase write always completes first; if Zoho fails, modal stays open with "Saved, but Zoho rename failed" warning
- Pre-existing `.next/types` TS errors for `zoho-projects` route are unrelated to this task

## Goal

Add an Edit button to each project card in the Projects tab of the customer profile. Clicking it opens a modal to update all project fields. When `project_name` changes and a `zoho_project_id` is set, the API also fires a non-blocking rename in Zoho Projects.

## Requirements

1. Each project card in `activeSection === "projects"` gets an **Edit** button (top-right of card header).
2. The Edit modal exposes all six fields: `project_name`, `project_type`, `zoho_project_id`, `sanity_project_id`, `github_repo`, `dedicated_developers`.
3. `dedicated_developers` is stored as `string[]` — form input is comma-separated; join on open, split on save.
4. On save, call `PATCH /api/customers/[customerId]/projects/[projectId]`.
5. After a successful save, update the local `projects` state array in-place (`setProjects(prev => prev.map(...))`), not `router.refresh()`.
6. If `project_name` changed **and** the project has a `zoho_project_id`, the PATCH route calls `updateZohoProject()` non-blocking — Supabase write succeeds regardless of Zoho outcome. Response includes `zoho_rename_failed: true` when Zoho call fails; UI shows an inline warning.
7. Modal pattern mirrors "Edit Product Metadata" (`client.tsx:718–767`): fixed overlay, `max-w-130` card, `×` close button, Cancel + Save footer.

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `src/app/(hub)/customers/[customerId]/client.tsx` | Modify | Add 4 state vars, `handleOpenEditProject`, `handleSaveProject`, Edit button on cards, Edit Project modal |
| `src/app/api/customers/[customerId]/projects/[projectId]/route.ts` | Create | New PATCH handler |
| `src/lib/zoho/index.ts` | Modify | Add `updateZohoProject(projectId, projectName)` function |

## Implementation Steps

### Step 1 — Add `updateZohoProject` to zoho lib (`src/lib/zoho/index.ts`)

Add after the `createZohoProject` function (after line 97):

```ts
export async function updateZohoProject(projectId: string, projectName: string): Promise<boolean> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) {
    console.warn("[zoho] ZOHO_PORTAL_ID not configured — skipping project rename for", projectId);
    return false;
  }
  const token = await getZohoAccessToken();
  if (!token) return false;

  const res = await fetch(`${ZOHO_PROJECTSAPI_BASE}/projects/${projectId}`, {
    method: "PUT",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: projectName }),
  });

  if (!res.ok) {
    console.error("[zoho] project rename failed:", res.status, await res.text());
    return false;
  }
  return true;
}
```

### Step 2 — Create PATCH route (`src/app/api/customers/[customerId]/projects/[projectId]/route.ts`)

New file. Params: `{ customerId, projectId }`.

```ts
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { updateZohoProject } from "@/lib/zoho";

const VALID_PROJECT_TYPES = ["Content Site", "Ecommerce (B2C)", "Ecommerce (B2B)", "Custom App"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string; projectId: string }> }
) {
  try {
    const { customerId, projectId } = await params;
    const body = await request.json();
    const { project_name, project_type, zoho_project_id, sanity_project_id, github_repo, dedicated_developers } = body;

    if (project_name !== undefined && !project_name?.trim()) {
      return NextResponse.json({ error: "project_name cannot be empty" }, { status: 400 });
    }
    if (project_type !== undefined && !VALID_PROJECT_TYPES.includes(project_type)) {
      return NextResponse.json(
        { error: `project_type must be one of: ${VALID_PROJECT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // Fetch current row to compare project_name for Zoho rename
    const { data: current, error: fetchError } = await adminClient
      .from("customer_projects")
      .select("project_name, zoho_project_id")
      .eq("id", projectId)
      .eq("customer_id", customerId)
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (project_name !== undefined) updates.project_name = project_name.trim();
    if (project_type !== undefined) updates.project_type = project_type;
    if (zoho_project_id !== undefined) updates.zoho_project_id = zoho_project_id || null;
    if (sanity_project_id !== undefined) updates.sanity_project_id = sanity_project_id || null;
    if (github_repo !== undefined) updates.github_repo = github_repo || null;
    if (dedicated_developers !== undefined) {
      updates.dedicated_developers = Array.isArray(dedicated_developers) ? dedicated_developers : [];
    }

    const { data, error } = await adminClient
      .from("customer_projects")
      .update(updates)
      .eq("id", projectId)
      .eq("customer_id", customerId)
      .select()
      .single();

    if (error) {
      console.error("PATCH /api/customers/[customerId]/projects/[projectId] error:", error);
      return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
    }

    // Non-blocking Zoho rename when project_name changed and zoho_project_id is set
    let zohoRenameFailed = false;
    const effectiveZohoId = updates.zoho_project_id ?? current.zoho_project_id;
    const nameChanged = project_name !== undefined && project_name.trim() !== current.project_name;
    if (nameChanged && effectiveZohoId) {
      const ok = await updateZohoProject(String(effectiveZohoId), project_name.trim());
      if (!ok) zohoRenameFailed = true;
    }

    return NextResponse.json({ ...data, zoho_rename_failed: zohoRenameFailed });
  } catch (err) {
    console.error("PATCH /api/customers/[customerId]/projects/[projectId] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

### Step 3 — Add state vars to `client.tsx`

Add four state vars near the existing `editProduct` group (around line 200). Search for `const [editProduct,` and add below it:

```ts
const [editProject, setEditProject] = useState<CustomerProjectRow | null>(null);
const [editProjectForm, setEditProjectForm] = useState({ project_name: "", project_type: "", zoho_project_id: "", sanity_project_id: "", github_repo: "", dedicated_developers: "" });
const [editProjectSaving, setEditProjectSaving] = useState(false);
const [editProjectError, setEditProjectError] = useState<string | null>(null);
```

`CustomerProjectRow` is already imported at `client.tsx:11`.

### Step 4 — Add `handleOpenEditProject` and `handleSaveProject`

Add near `handleOpenEditProduct` / `handleSaveProduct` (around line 305):

```ts
const handleOpenEditProject = (proj: CustomerProjectRow) => {
  setEditProjectForm({
    project_name: proj.project_name,
    project_type: proj.project_type,
    zoho_project_id: proj.zoho_project_id ?? "",
    sanity_project_id: proj.sanity_project_id ?? "",
    github_repo: proj.github_repo ?? "",
    dedicated_developers: proj.dedicated_developers.join(", "),
  });
  setEditProjectError(null);
  setEditProject(proj);
};

const handleSaveProject = async () => {
  if (!editProject) return;
  setEditProjectSaving(true);
  setEditProjectError(null);
  try {
    const res = await fetch(
      `/api/customers/${customer.customer_id}/projects/${editProject.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_name: editProjectForm.project_name,
          project_type: editProjectForm.project_type,
          zoho_project_id: editProjectForm.zoho_project_id || null,
          sanity_project_id: editProjectForm.sanity_project_id || null,
          github_repo: editProjectForm.github_repo || null,
          dedicated_developers: editProjectForm.dedicated_developers
            .split(",")
            .map(s => s.trim())
            .filter(Boolean),
        }),
      }
    );
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? "Save failed");
    }
    const updated = await res.json();
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
    if (updated.zoho_rename_failed) {
      setEditProjectError("Saved, but Zoho rename failed. Update Zoho manually.");
      return; // leave modal open to show warning
    }
    setEditProject(null);
  } catch (err) {
    setEditProjectError(err instanceof Error ? err.message : "Save failed");
  } finally {
    setEditProjectSaving(false);
  }
};
```

### Step 5 — Add Edit button to each project card

In the project card render block (`client.tsx:1821–1826`), replace the header `<div className="flex items-start justify-between gap-2">` block with:

```tsx
<div className="flex items-start justify-between gap-2">
  <div>
    <p className={cn("text-sm font-semibold", textPrimary)}>{proj.project_name}</p>
    <p className="text-[11px] text-slate-400 mt-0.5">{proj.project_type}</p>
  </div>
  <button
    onClick={() => handleOpenEditProject(proj)}
    className="text-[11px] font-semibold text-slate-400 hover:text-brand border border-slate-200 rounded-full px-2.5 py-0.5 hover:border-brand/30 transition-colors cursor-pointer bg-transparent shrink-0"
  >
    Edit
  </button>
</div>
```

### Step 6 — Add Edit Project modal

Add below the Edit Product modal (`client.tsx:767`) and before the `{/* Add Product Modal */}` comment:

```tsx
{editProject && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-130 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-slate-900">Edit Project</h2>
          <p className="text-xs text-slate-400 mt-0.5">{editProject.project_name}</p>
        </div>
        <button
          onClick={() => setEditProject(null)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors border-none bg-transparent cursor-pointer text-lg leading-none"
        >
          ×
        </button>
      </div>
      <div className="px-6 py-5 space-y-4">
        <div>
          <label className={labelCls}>Project Name</label>
          <input
            type="text"
            value={editProjectForm.project_name}
            onChange={e => setEditProjectForm(f => ({ ...f, project_name: e.target.value }))}
            className={inputCls}
            placeholder="e.g. My Ecommerce Site"
          />
        </div>
        <div>
          <label className={labelCls}>Project Type</label>
          <select
            value={editProjectForm.project_type}
            onChange={e => setEditProjectForm(f => ({ ...f, project_type: e.target.value }))}
            className={inputCls}
          >
            {PROJECT_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Zoho Project ID</label>
          <input
            type="text"
            value={editProjectForm.zoho_project_id}
            onChange={e => setEditProjectForm(f => ({ ...f, zoho_project_id: e.target.value }))}
            className={inputCls}
            placeholder="e.g. 123456789"
          />
        </div>
        <div>
          <label className={labelCls}>Sanity Project ID</label>
          <input
            type="text"
            value={editProjectForm.sanity_project_id}
            onChange={e => setEditProjectForm(f => ({ ...f, sanity_project_id: e.target.value }))}
            className={inputCls}
            placeholder="e.g. abc12def"
          />
        </div>
        <div>
          <label className={labelCls}>GitHub Repo</label>
          <input
            type="text"
            value={editProjectForm.github_repo}
            onChange={e => setEditProjectForm(f => ({ ...f, github_repo: e.target.value }))}
            className={inputCls}
            placeholder="owner/repo"
          />
        </div>
        <div>
          <label className={labelCls}>Dedicated Developers (comma-separated)</label>
          <input
            type="text"
            value={editProjectForm.dedicated_developers}
            onChange={e => setEditProjectForm(f => ({ ...f, dedicated_developers: e.target.value }))}
            className={inputCls}
            placeholder="e.g. dev1@example.com, dev2@example.com"
          />
        </div>
        {editProjectError && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {editProjectError}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
        <button
          onClick={() => setEditProject(null)}
          className="py-2 px-4 bg-transparent text-slate-600 text-sm font-medium border border-slate-200 rounded-full cursor-pointer hover:border-slate-300 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveProject}
          disabled={editProjectSaving}
          className="py-2 px-5 bg-brand text-white text-sm font-semibold border-none rounded-full cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {editProjectSaving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  </div>
)}
```

## Code Context

### Project card render block (target for Edit button injection) — `client.tsx:1816–1868`

```tsx
{projects.map(proj => (
  <div key={proj.id} className={cn("rounded-xl p-4 space-y-2 border", isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-slate-200 bg-white")}>
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className={cn("text-sm font-semibold", textPrimary)}>{proj.project_name}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">{proj.project_type}</p>
      </div>
    </div>
    {/* ... field rows ... */}
  </div>
))}
```

### Edit Product Metadata modal pattern (mirror this) — `client.tsx:718–767`

```tsx
{editProduct && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-130 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        ...header with × close button...
      </div>
      <div className="px-6 py-5 space-y-4">
        ...fields + error display...
      </div>
      <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
        ...Cancel + Save buttons...
      </div>
    </div>
  </div>
)}
```

### handleSaveProduct pattern (open/save/error flow) — `client.tsx:278–304`

```ts
const handleSaveProduct = async () => {
  if (!editProduct) return;
  setEditProductSaving(true);
  setEditProductError(null);
  try {
    const res = await fetch(..., { method: "PATCH", ... });
    if (!res.ok) { const json = await res.json().catch(() => ({})); throw new Error(json.error ?? "Save failed"); }
    setEditProduct(null);
    router.refresh();
  } catch (err) {
    setEditProductError(err instanceof Error ? err.message : "Save failed");
  } finally {
    setEditProductSaving(false);
  }
};
```

Note: `handleSaveProject` uses `setProjects(prev => prev.map(...))` instead of `router.refresh()` — see Notes below.

### `inputCls` / `labelCls` — `client.tsx:76–77`

```ts
const inputCls = "font-[inherit] w-full text-sm py-2.5 px-3.5 border border-slate-200 rounded-lg ...";
const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5";
```

### `PROJECT_TYPES` — `client.tsx:51`

```ts
const PROJECT_TYPES = ["Content Site", "Ecommerce (B2C)", "Ecommerce (B2B)", "Custom App"] as const;
```

### Existing PATCH product route pattern — `src/app/api/customers/[customerId]/products/[productName]/route.ts`

Reads body, validates, calls `adminClient.from(...).update({...}).eq(...).select().single()`, returns updated row or error JSON.

### `CustomerProjectRow` type — `src/types/database.ts:102–147`

Already imported in `client.tsx:11`. Has: `id`, `customer_id`, `project_name`, `project_type`, `zoho_project_id`, `sanity_project_id`, `github_repo`, `dedicated_developers` (string[]), `created_at`, `updated_at`.

## Notes for Implementation Agent

- **Model rationale (sonnet):** Changes span three files including a new API route and a Zoho lib addition. Zoho rename non-blocking pattern requires judgment on error handling.
- **`dedicated_developers` serialization:** DB stores `string[]`. Form input is comma-separated. On `handleOpenEditProject`: join array → string. On save: split string → array, trim, filter empty.
- **Use `setProjects(prev => prev.map(...))` not `router.refresh()`:** The projects list is lazily fetched behind `hasFetchedProjectsRef` — a soft refresh won't re-fetch it. Update state directly with the returned row.
- **New API route path:** `src/app/api/customers/[customerId]/projects/[projectId]/route.ts` — the `[projectId]` directory is a new dynamic segment under the existing `projects/` directory.
- **`adminClient` for DB writes:** Consistent with the existing GET/POST in `projects/route.ts`.
- **Zoho rename is non-blocking:** The Supabase `.update()` must complete first and succeed before attempting Zoho. If Zoho fails, return `{ ...data, zoho_rename_failed: true }`. The UI modal stays open and shows the error string from Step 4 ("Saved, but Zoho rename failed…") — user must close it manually.
- **Only rename Zoho when `project_name` actually changed:** Compare `project_name.trim()` against the fetched `current.project_name` before calling `updateZohoProject`. Skip if unchanged.
- **`updateZohoProject` endpoint:** `PUT ${ZOHO_PROJECTSAPI_BASE}/projects/${projectId}` with body `{ name: projectName }`. Returns `boolean`. Logs error on failure, never throws.
- **`ZOHO_PROJECTSAPI_BASE`** is a module-private const in `zoho/index.ts` (line 5) — `updateZohoProject` can reference it directly since it lives in the same file.
