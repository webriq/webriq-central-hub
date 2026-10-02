# 412: Milestone Creation — Fix "Project not found" + Enhance the Milestones Panel

**Created:** 2026-10-02
**Priority:** HIGH
**Type:** fix
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

The user reported: *"Fix and enhance the Milestone creation, it shows an error — `{"error":"Project not found"}`"* (screenshot: project **Salas Ayala Associates Website** → Milestones tab → Add milestone → Network shows two red `milestones` requests, both `404 {"error":"Project not found"}`; the UI shows nothing — the inline row just stays open).

### Root cause (confirmed by code reading)

An ID-shape mismatch between the client and the API route:

- `src/app/api/v2/projects/[projectId]/milestones/route.ts:14,37` resolves the project with
  `.from("projects").select("id").eq("project_id", projectId)` — i.e. it expects the **display** `project_id` (`<8 chars>-PROJ-NN`, migration 066/088), like every other `/api/v2/projects/[projectId]/*` route (tasks, tickets, tasklists, …).
- `src/app/(hub)/projects/_shared/_project-detail.tsx:711` renders `<MilestonePanel projectId={project.id} … />` — the **UUID**.
- `_milestone-panel.tsx:60` POSTs to `/api/v2/projects/${projectId}/milestones` → UUID never matches `projects.project_id` → `.single()` returns null → **404 "Project not found"**.
- The same file already does it right for the task/ticket modals: lines 773/788 pass `project.project_id ?? project.id`. The milestone panel was simply missed (it was carried over from `projects-old`, where the routes keyed differently).
- Secondary bug: `createMilestone()` / `saveEdit()` / `deleteMilestone()` ignore `!res.ok` entirely — the failure is silent, which is why the user only saw it in DevTools.

Edit (`PATCH /api/v2/milestones/[id]`) and delete (`DELETE …`) key by milestone UUID, so they are **not** affected by the ID bug — only create (and GET, which the panel doesn't call; initial data is SSR'd via `_get-project-detail-data.ts`).

### Enhancement scope ("and enhance")

The create row today is name + due date only, status hard-wired to `planned`, no description/start date, no error feedback, no delete confirmation, and the write controls are shown to developers even though RLS (`milestones_pm_write`, migration 048) only lets `admin`/`super_admin`/`pm` write. This task makes milestone CRUD reliable and complete without redesigning the tab.

## Requirements

**Fix**
1. `MilestonePanel` must call the create route with the display `project_id` (fallback to UUID, mirroring lines 773/788).
2. The milestones collection route must also accept a UUID (resolve by `project_id` first, else by `id` when the param is UUID-shaped) so a project row with a null `project_id` (legacy/pre-backfill) can still create milestones — scoped to this one route file.
3. Every mutation (create / edit / delete) surfaces failures: inline error text next to the row's actions (using the API's `error` message), plus `toast.success` on create/delete (sonner is mounted in `(hub)/layout.tsx`).

**Enhance**
4. Create row gains **Status** (planned/active/completed select, default planned), **Start date**, and an optional **Description** (single-line input, or expandable second line under the name — implementer's choice, keep it compact).
5. Edit row gains **Start date** and **Description** (same controls as create).
6. Validation — client and server: name required and ≤ 200 chars; if both dates present, `start_date <= due_date` (server returns 400 `"start date must be on or before due date"`); server validates `status` on POST against `planned|active|completed` (PATCH already does).
7. POST route accepts `start_date` (currently dropped).
8. Delete requires an inline two-step confirm (trash → "Delete? ✓ ✕" in the row), not `window.confirm()`. Copy should mention linked tasks are unassigned, not deleted (`tasks.milestone_id … on delete set null`, migration 033) when the row has tasks.
9. Write controls (Add milestone, edit, delete) render only for `admin | super_admin | pm` — pass `currentUserRole` from `_project-detail.tsx` (already a prop there). Developers keep read-only view + links.
10. Show a **Start** column in the table (between Status and Due) and render the description as a muted sub-line under the name when present.
11. Accessibility/polish per CLAUDE.md UI conventions: `aria-label` on every icon-only button (save, cancel, edit, delete, confirm), `transition-colors` hover states, disabled + spinner while saving, Enter/Escape keyboard behaviour preserved.
12. Replace the `style={{ color, background, borderColor }}` status pill with a static Tailwind class map (CLAUDE.md "never `style={{}}`" rule) — same colors.
13. Prevent double submission (the screenshot shows two POSTs): guard on `saving` already exists, but the Enter handler and the button both call `createMilestone`; make sure `saving` is set before any await and the button is `type="button"`.

## Out of Scope / Must-Not-Change

- `src/app/(hub)/projects-old/**` (incl. its own `_milestone-panel.tsx` / `_milestone-bar.tsx`) — legacy, untouched.
- `_shared/_milestone-bar.tsx` — not imported anywhere in `projects/`; leave it (note as dead code in Implementation Notes, don't delete).
- Swimlane view (`_milestone-swimlane.tsx`), generic-phase swimlane, milestone detail pages (`.../milestones/[milestoneId]/_milestone-detail.tsx`) — unchanged.
- No DB migration; no RLS change (columns `description`, `start_date`, `status` already exist — migrations 033/038).
- No drag-to-reorder, no milestone-level progress bars, no task assignment from this panel.
- Other `/api/v2/projects/[projectId]/*` routes keep display-ID-only resolution (don't generalize the UUID fallback across the codebase here).
- v2 theming: this panel is light-only today (no `isDark` prop); don't introduce one or `dark:` classes.

## Proposed File Changes

| File | Change |
|------|--------|
| `src/app/(hub)/projects/_shared/_project-detail.tsx` | Pass `projectId={project.project_id ?? project.id}` and `currentUserRole={currentUserRole}` to `MilestonePanel` (line ~711). |
| `src/app/(hub)/projects/_shared/_milestone-panel.tsx` | Error state, start date/description/status in create + edit, Start column, description sub-line, inline delete confirm, role-gated controls, aria-labels, Tailwind status map, toasts. Keep under ~400 lines; if it grows past that, extract the create/edit row into `_milestone-row-form.tsx` in the same folder. |
| `src/app/api/v2/projects/[projectId]/milestones/route.ts` | Resolve project by `project_id` then UUID fallback (both GET + POST, shared local helper); accept `start_date`; validate name length, status, date order. |
| `src/app/api/v2/milestones/[milestoneId]/route.ts` | Add the same name-length + date-order validation to PATCH (needs the current row's dates when only one date is patched — fetch `start_date, due_date` first). |

## Code Context

### Bug site — `_project-detail.tsx:709-717`
```tsx
{milestoneView === "table" ? (
  <MilestonePanel
    projectId={project.id}            // ← UUID; route expects display project_id
    basePath={basePath}
    milestones={milestones}
    tasks={tasks}
    onUpsert={upsertMilestone}
    onRemove={removeMilestone}
  />
```
Correct precedent in the same file, lines 773/788: `projectId={project.project_id ?? project.id}`.
`currentUserRole: string | null` is already a prop of `ProjectDetail` (line 137).

### Route — `api/v2/projects/[projectId]/milestones/route.ts`
```ts
const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
...
.insert({ project_id: project.id, name, description, due_date, status: body.status || "planned",
          position: typeof body.position === "number" ? body.position : Date.now(), created_by: user.id })
```
Suggested helper (local to the file):
```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function resolveProject(supabase, key: string) {
  const { data } = await supabase.from("projects").select("id").eq("project_id", key).maybeSingle();
  if (data) return data;
  if (!UUID_RE.test(key)) return null;
  const { data: byId } = await supabase.from("projects").select("id").eq("id", key).maybeSingle();
  return byId;
}
```
Use `.maybeSingle()` (not `.single()`) so a miss isn't a PostgREST error.

### Panel — current create (silent failure)
```ts
async function createMilestone() {
  if (!newName.trim() || saving) return;
  setSaving(true);
  const res = await fetch(`/api/v2/projects/${projectId}/milestones`, { method: "POST", … });
  if (res.ok) { onUpsert(await res.json()); … setAdding(false); }
  setSaving(false);            // ← no else branch: error swallowed
}
```
Status pill currently uses `style={{ color: style.text, background: style.bg, borderColor: style.border }}` from `M_STATUS_STYLE` hex map — convert to e.g. `planned: "text-slate-500 bg-slate-50 border-slate-200"`, `active: "text-blue-600 bg-blue-50 border-blue-200"`, `completed: "text-green-600 bg-green-50 border-green-200"`.

### Data / RLS
- `milestones` row: `id, project_id (uuid FK, on delete cascade), name, description, start_date, due_date, status ('planned'|'active'|'completed'), position, day_start, day_end, created_by, created_at, updated_at` (`src/types/database.ts:1888`).
- RLS (048): read `admin|super_admin|pm|developer`; write (`for all`) `admin|super_admin|pm`.
- `tasks.milestone_id … on delete set null` (033) — deleting a milestone unassigns tasks; `removeMilestone` in `_project-detail.tsx:316` already mirrors that client-side.

### Conventions
- Plain `useState` + inline `fetch` + inline error text; `toast` from `sonner` for transient confirmations (CLAUDE.md UI Polish).
- `<button type="button">`, `aria-label` on icon-only buttons, lucide icons only, no emoji.
- Dates are `date` columns — send `YYYY-MM-DD` strings; display with existing `formatDueDate` from `projects-old/_pm-shared`.

## Implementation Steps

1. **Route (collection):** add `resolveProject()` helper; use in GET + POST. In POST: trim/validate name (required, ≤200), validate `status` ∈ set (default `planned`), accept `start_date`, reject `start_date > due_date` with 400.
2. **Route (item PATCH):** add name-length check; when either date is in the body, load the row's current `start_date/due_date`, merge, and reject if start > due.
3. **`_project-detail.tsx`:** fix `projectId` prop; pass `currentUserRole`.
4. **`_milestone-panel.tsx`:**
   a. Add `currentUserRole` prop → `canWrite = ["admin","super_admin","pm"].includes(role ?? "")`; hide Add/edit/delete when false (empty-state copy for read-only: "No milestones yet.").
   b. Add `error` state per form (create / edit / delete-row) shown as `text-[11px] text-red-600` under the row; clear on next attempt / cancel.
   c. Create row: name + description input, status select, start date, due date. Edit row: same.
   d. Client-side date-order check before fetch (same message as server).
   e. Table: add Start column, description sub-line (`text-[11px] text-slate-400 truncate`, `decodeHtmlEntities`).
   f. Inline delete confirm state (`confirmDeleteId`), with linked-task-count hint.
   g. Tailwind status class map; remove `style={{}}`.
   h. `type="button"` + `aria-label` on all icon buttons; `toast.success("Milestone created")` / `("Milestone deleted")`.
5. If the panel exceeds ~400 lines, extract the shared create/edit form row to `_shared/_milestone-row-form.tsx`.
6. `npx tsc --noEmit` and `pnpm lint`.

## Acceptance Criteria

- [ ] On a v2 project (e.g. Salas Ayala Associates Website), Milestones → Add milestone → enter name → ✓ creates the milestone (201), it appears in the table immediately, and survives a reload.
- [ ] Same works on a `/projects/legacy/[projectId]/milestones` project.
- [ ] Create with status `active`, a start date, a due date, and a description — all four persist and display (Start column, description sub-line, status pill).
- [ ] Start date after due date → inline error, no request sent; same payload via devtools/curl → 400 from the API (POST and PATCH).
- [ ] Forcing a server error (e.g. 404/400) shows the API's message inline next to the row; the form stays open with the input intact.
- [ ] Pressing Enter in the name field and clicking ✓ in quick succession creates only **one** milestone.
- [ ] Delete shows an inline confirm; cancelling keeps the row; confirming removes it, toasts, and unassigns its tasks (task count elsewhere updates).
- [ ] As a `developer`, the Milestones table is visible with links, but no Add/edit/delete controls.
- [ ] No `style={{}}` left in the panel; all icon-only buttons have `aria-label`.
- [ ] Swimlane view, milestone detail page, and `projects-old` are unchanged.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Browser (as PM/admin): /projects/v2/<project_id>/milestones → create / edit / delete per Acceptance Criteria;
#   DevTools Network: POST /api/v2/projects/<project_id>/milestones → 201.
# Browser (legacy): /projects/legacy/<project_id>/milestones → create.
# Browser (as developer): confirm read-only.
# API: POST with start_date > due_date → 400; POST with UUID path param → 201 (fallback).
```

## Compatibility Touchpoints

- `_project-detail.tsx` is shared by the v2 and legacy project routes — both get the fix.
- `/api/v2/projects/[projectId]/milestones` GET has no current UI caller found by grep, but keep its response shape unchanged.
- No MCP tool registration change (`_docs/mcp-tools.md` untouched). No migration. CLAUDE.md needs no update unless the implementer generalizes the UUID fallback (out of scope).

## Open Questions (defaults assumed unless the user says otherwise)

1. **Enhancement scope** — assumed "enhance" = complete the create/edit form (status, start date, description), error feedback, delete confirm, role gating, and polish. If you instead meant a create **modal** (like Create Task) or drag-reorder/progress bars, say so before implementation.
2. **Description input** — assumed a single-line text input (not the Tiptap rich-text editor used for task descriptions).
3. **Developer write access** — assumed read-only per current RLS; not widening RLS.

## Implementation Notes

### What Changed
- **Root-cause fix:** `_project-detail.tsx` now passes `project.project_id ?? project.id` (display ID, matching the task/ticket modals at lines 773/788) to `MilestonePanel`, plus `currentUserRole`.
- **Collection route** resolves the project via a local `resolveProject()` (display `project_id` first, `.maybeSingle()`; UUID `id` fallback only when the param is UUID-shaped) for GET + POST. POST now accepts `start_date`, validates name (required, ≤200), `status` (∈ planned/active/completed), and `start_date <= due_date`.
- **Item PATCH** validates name (non-empty, ≤200) and, when either date is patched, merges with the stored row's dates and rejects start > due (404 if the row isn't visible).
- **Panel:** create + edit rows now carry name, description, status, start date, due date (shared `MilestoneFormRow`); client-side validation mirrors the server; API errors render inline (`role="alert"`) and the form stays open with inputs intact; `toast.success` on create/delete; inline two-step delete confirm with "N tasks will be unassigned, not deleted" hint; Start column + description sub-line; write controls hidden for non `admin|super_admin|pm`; status pill moved from `style={{}}` to a Tailwind class map; `type="button"` + `aria-label` on every icon button; `transition-colors` hovers.
- **Double submit:** a `useRef` synchronous guard (`withSaving`) — the `saving` state alone can't stop Enter + click firing two POSTs before the re-render.
- Edit now sends cleared dates/description as `null` (previously `undefined`, which `JSON.stringify` drops — clearing a due date was impossible).

### Files Changed
- `src/app/(hub)/projects/_shared/_project-detail.tsx` — correct `projectId` prop; pass `currentUserRole`.
- `src/app/(hub)/projects/_shared/_milestone-panel.tsx` — rewritten per requirements 3–13 (≈330 lines).
- `src/app/(hub)/projects/_shared/_milestone-row-form.tsx` — **new**: shared create/edit `<tr>` form + draft helpers (`validateMilestoneDraft`, `draftToPayload`, `draftFromMilestone`).
- `src/app/api/v2/projects/[projectId]/milestones/route.ts` — `resolveProject()`, `start_date`, validation.
- `src/app/api/v2/milestones/[milestoneId]/route.ts` — name + date-order validation on PATCH.
- `.impeccable/config.json` — narrow `gray-on-color` ignore scoped to `_milestone-panel.tsx` (design-hook false positive: idle `text-slate-300` delete icon switches to `text-red-500` together with `hover:bg-red-50`; pattern pre-existed).

### Deviations From Plan
- Extracted `_milestone-row-form.tsx` up front (allowed by step 5) rather than waiting for the panel to cross ~400 lines — create and edit share identical controls, so one component avoids duplicating ~100 lines.
- Description input is a second line under the name input in the form row (the plan left placement to the implementer).
- `_shared/_milestone-bar.tsx` confirmed unimported anywhere under `projects/` (dead code) — left untouched per Out of Scope.

### Verification Run
- `npx tsc --noEmit` — PASS for all changed files. 5 pre-existing unrelated errors remain: stale `.next/**/validator.ts` references to `kb/page` + `desk/inbox/[ticketId]/page` (moved routes), and `wiki/_wiki-rte.tsx` missing `@tiptap/extension-list`.
- `npx eslint` on the 5 changed files — PASS (0 problems).
- Browser acceptance — NOT RUN (deferred to the `test` stage).

## Quality Gate Notes

### Result
PASS

### Standards Review
- Changed files reviewed (from Implementation Notes; `git diff` not used per CLAUDE.md "never run git commands"): `_project-detail.tsx`, `_milestone-panel.tsx`, `_milestone-row-form.tsx`, both milestone API routes.
- No unused imports/code, no `any`, no debug logging (the two `console.error` calls on DB failure pre-existed and match the route convention). Guard clauses used throughout; nesting is shallow.
- Responsibilities are clear: the form row owns draft shape, client validation and payload mapping; the panel owns fetch/state/role gating; routes own authoritative validation. Client and server validation messages match.
- Errors are handled intentionally: non-OK responses surface the API `error` text inline, network failures have their own message, and the synchronous `savingRef` guard prevents duplicate submits.
- Conventions: plain `useState` + inline `fetch`, `sonner` toasts, no `style={{}}`, no `dark:` classes, lucide icons, `type="button"` + `aria-label` on icon buttons. The `projects-old` imports (`formatDueDate`, `decodeHtmlEntities`, types) were already the panel's existing dependency.
- **Fixed during gate (1 line):** POST used `body.status ?? "planned"`, so an empty-string status returned 400, a regression from the original `body.status || "planned"`. Changed to `||`; ESLint re-run PASS.
- Not blocking: dates aren't format-validated in the route (the Postgres `date` column rejects malformed values, and the client sends `<input type="date">` values). Unchanged from before.

### Deviations
- Minor — `_milestone-row-form.tsx` extracted up front rather than at the ~400-line threshold. Step 5 allowed this, and it removes duplicated create/edit markup.
- Minor — description sits on a second line in the form row (the plan left placement open).
- Minor — `.impeccable/config.json` gained a file-scoped `gray-on-color` ignore for a design-hook false positive. This is tooling config, not product scope.
- No Medium/Major deviations. Out-of-scope boundaries held: `projects-old`, the swimlane, the detail pages, `_milestone-bar.tsx`, RLS/migrations and other v2 routes are untouched.

### Required Fixes
- None.
