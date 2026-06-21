# Task 075 — Ops Chat: Full Task CRUD Tools (Create, Update, Assign, Delete)

> **Status:** TESTING
> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Created:** 2026-06-21
> **Completed:** 2026-06-21
> **Implementation Notes:** All 5 tools added to `buildOpsChatTools()` in documented order (`list_assignable_users`, `create_task`, `update_task`, `assign_task`, `delete_task`) after `update_task_status`. System prompt updated with all tools + rules. `npx tsc --noEmit` passes clean. **Deviation:** the task doc assumed `profiles` has `display_name`/`email` columns — it does NOT. The real v2 `profiles` schema is `id, full_name, role, avatar_url, customer_id` (email lives in JWT claims). `list_assignable_users` was implemented against the real schema: selects `id,full_name,role` and filters on `full_name` only (single `.ilike`, no `email` OR-clause). The agent resolves assignees by `full_name`. `update_task` uses the typed `Database["public"]["Tables"]["tasks"]["Update"]` for the patch object instead of `Record<string, unknown>` to satisfy strict typing.

## Overview

Extend Ops Chat's tool set so the agent can manage the full task lifecycle without the user leaving the chat panel. Task 074 already added `update_task_status`. This task adds the remaining four actions: `create_task`, `update_task` (details like title/description/priority/labels/due date), `assign_task` (set assignees by name), and `delete_task`. Together with 074, Ops Chat will have complete task CRUD coverage.

## Requirements

- [ ] Add `create_task` tool — staff only; requires `project_id` + `title`; optional fields match the existing POST route schema
- [ ] Add `update_task` tool — updates title, description, priority, labels, due_date, milestone_id; staff can update any task, developers can update tasks assigned to them (RLS enforced via `supabase` client)
- [ ] Add `assign_task` tool — sets the `assignees` array on a task; staff only; accepts an array of user IDs (agent should call `list_assignable_users` first if names are given — see note below)
- [ ] Add `list_assignable_users` tool — returns hub users (from `profiles`) the agent can use to resolve names to IDs before assigning; staff only
- [ ] Add `delete_task` tool — staff only; requires confirmation text in the input to prevent accidental deletion
- [ ] Update `OPS_CHAT_SYSTEM_PROMPT` in `route.ts` to list all new tools and their access rules
- [ ] All tools return the updated/created/deleted row on success, or a descriptive error on failure
- [ ] No schema migration required — only touches existing columns and tables

## Current State

`src/lib/ai/ops-chat-tools.ts` currently exports these tools from `buildOpsChatTools()`:

| Tool | Access | Action |
|------|--------|--------|
| `list_tasks` | All roles (filtered by RLS) | Read tasks |
| `update_task_status` | Staff + dev (own tasks) | Write — status only |
| `list_classifications` | All roles | Read classification records |
| `update_classification_status` | Staff only | Write — classification status |
| `list_tickets` | Staff only | Read tickets |
| `run_orchestration` | Staff only | Trigger AI pipeline |

**Current Files:**
| File | Purpose |
|------|---------|
| `src/lib/ai/ops-chat-tools.ts` | All Ops Chat tool definitions |
| `src/app/api/ops-chat/route.ts` | System prompt + tool wiring |
| `src/app/api/v2/projects/[projectId]/tasks/route.ts` | POST (create) logic — reference only |
| `src/app/api/v2/tasks/[taskId]/route.ts` | PATCH / DELETE logic — reference only |

**Existing API routes are reference only** — do NOT call them via `fetch()` from within the tool `execute` functions. The `supabase` client in `buildOpsChatTools()` is already the RLS-scoped session client; use it directly (same pattern as `list_tasks`, `update_task_status`).

## Proposed Solution

Add four new tools + one lookup helper to `buildOpsChatTools()`. Follow the exact patterns already established in the file: use `supabase` for anything where RLS should restrict access per user role; use `adminClient` + explicit `isStaff()` guard for staff-only actions where RLS doesn't provide row-level gating.

### Access Matrix

| Tool | Client | Staff gate? | Dev access |
|------|--------|-------------|------------|
| `list_assignable_users` | `adminClient` | Yes — staff only | None |
| `create_task` | `supabase` | Yes — RLS blocks non-staff inserts | None |
| `update_task` | `supabase` | No — RLS enforces per-row | Own tasks only |
| `assign_task` | `adminClient` | Yes — explicit `isStaff()` check | None |
| `delete_task` | `adminClient` | Yes — explicit `isStaff()` check | None |

### File Changes

| Action | File | Description |
|--------|------|-------------|
| MODIFY | `src/lib/ai/ops-chat-tools.ts` | Add 5 new tools |
| MODIFY | `src/app/api/ops-chat/route.ts` | Update system prompt tool list + rules |

## Implementation Steps

### Step 1: Add `list_assignable_users` to `ops-chat-tools.ts`

Add after `update_task_status` (before `list_classifications`). This is the lookup tool the agent must call before `assign_task` when the user gives a name rather than a UUID:

```ts
list_assignable_users: tool({
  description:
    "List hub users that can be assigned to tasks. Returns user IDs and display names. " +
    "Call this before assign_task when you need to resolve a name to a user ID. Staff only.",
  inputSchema: z.object({
    search: z.string().optional().describe("Optional name/email filter"),
  }),
  execute: async ({ search }) => {
    if (!staff) {
      return { error: "Access denied — staff only" };
    }
    let q = adminClient
      .from("profiles")
      .select("id,display_name,email,role")
      .in("role", ["admin", "pm", "hr", "developer"])
      .order("display_name");
    if (search) {
      q = q.or(`display_name.ilike.%${search}%,email.ilike.%${search}%`);
    }
    const { data, error } = await q.limit(30);
    if (error) return { error: error.message };
    return { users: data ?? [] };
  },
}),
```

### Step 2: Add `create_task` to `ops-chat-tools.ts`

Add after `list_assignable_users`:

```ts
create_task: tool({
  description:
    "Create a new task in a project. Staff only (PM/Admin). " +
    "Requires project_id and title. Use list_assignable_users first to resolve assignee names to IDs.",
  inputSchema: z.object({
    project_id: z.string().uuid().describe("UUID of the project to create the task in"),
    title: z.string().min(1).describe("Task title"),
    description: z.string().optional().describe("Optional task description"),
    status: z
      .enum(["backlog", "todo", "in_progress", "for_review", "done", "cancelled"])
      .default("backlog")
      .describe("Initial status (defaults to backlog)"),
    priority: z
      .enum(["low", "normal", "high", "critical"])
      .default("normal")
      .describe("Task priority (defaults to normal)"),
    assignees: z.array(z.string().uuid()).optional().describe("Array of user IDs to assign"),
    due_date: z.string().optional().describe("Due date in YYYY-MM-DD format"),
    labels: z.array(z.string()).optional().describe("Labels/tags for the task"),
    milestone_id: z.string().uuid().optional().describe("Optional milestone UUID"),
  }),
  execute: async ({ project_id, title, description, status, priority, assignees, due_date, labels, milestone_id }) => {
    if (!staff) {
      return { error: "Access denied — task creation is restricted to staff roles" };
    }
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        project_id,
        title: title.trim(),
        description: description?.trim() || null,
        status: status ?? "backlog",
        priority: priority ?? "normal",
        assignees: assignees ?? null,
        due_date: due_date ?? null,
        labels: labels ?? null,
        milestone_id: milestone_id ?? null,
        position: Date.now(),
        created_by: userId,
      })
      .select("id,title,status,priority,project_id,assignees,due_date")
      .single();
    if (error) return { error: error.message };
    return { created: data };
  },
}),
```

### Step 3: Add `update_task` to `ops-chat-tools.ts`

Add after `create_task`. This updates task details (NOT status — `update_task_status` handles that). Use `supabase` (RLS-scoped) so developers can only update tasks in their `assignees` array:

```ts
update_task: tool({
  description:
    "Update task details — title, description, priority, labels, due date, or milestone. " +
    "Does NOT change status (use update_task_status for that). " +
    "Developers can only update tasks assigned to them; staff can update any task.",
  inputSchema: z.object({
    task_id: z.string().uuid().describe("UUID of the task to update"),
    title: z.string().min(1).optional().describe("New title"),
    description: z.string().optional().describe("New description (pass empty string to clear)"),
    priority: z
      .enum(["low", "normal", "high", "critical"])
      .optional()
      .describe("New priority"),
    due_date: z.string().optional().describe("New due date in YYYY-MM-DD format (pass empty string to clear)"),
    labels: z.array(z.string()).optional().describe("Replace labels array (pass [] to clear)"),
    milestone_id: z.string().uuid().optional().describe("New milestone UUID (pass empty string to clear)"),
  }),
  execute: async ({ task_id, title, description, priority, due_date, labels, milestone_id }) => {
    // Build patch with only provided fields
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) patch.title = title.trim();
    if (description !== undefined) patch.description = description.trim() || null;
    if (priority !== undefined) patch.priority = priority;
    if (due_date !== undefined) patch.due_date = due_date || null;
    if (labels !== undefined) patch.labels = labels.length > 0 ? labels : null;
    if (milestone_id !== undefined) patch.milestone_id = milestone_id || null;

    // Use supabase (RLS session client) — developers are constrained to their own assignees rows
    let q = supabase.from("tasks").update(patch).eq("id", task_id);
    if (role === "developer") q = q.contains("assignees", [userId]);
    const { data, error } = await q
      .select("id,title,priority,status,due_date,labels,milestone_id")
      .single();
    if (error) return { error: error.message };
    if (!data) return { error: "Task not found or access denied" };
    return { updated: data };
  },
}),
```

### Step 4: Add `assign_task` to `ops-chat-tools.ts`

Add after `update_task`. Staff only — assigning is a PM action. Use `adminClient` since the `assignees` column is not user-row-scoped in RLS:

```ts
assign_task: tool({
  description:
    "Set or replace the assignees on a task. Staff only. " +
    "Pass an empty array to remove all assignees. " +
    "Use list_assignable_users first to resolve names to user IDs.",
  inputSchema: z.object({
    task_id: z.string().uuid().describe("UUID of the task"),
    assignees: z.array(z.string().uuid()).describe("Array of user IDs to assign (replaces current assignees; pass [] to unassign all)"),
  }),
  execute: async ({ task_id, assignees }) => {
    if (!staff) {
      return { error: "Access denied — task assignment is restricted to staff roles" };
    }
    const { data, error } = await adminClient
      .from("tasks")
      .update({ assignees: assignees.length > 0 ? assignees : null, updated_at: new Date().toISOString() })
      .eq("id", task_id)
      .select("id,title,assignees")
      .single();
    if (error) return { error: error.message };
    if (!data) return { error: "Task not found" };
    return { updated: data };
  },
}),
```

### Step 5: Add `delete_task` to `ops-chat-tools.ts`

Add after `assign_task`, before `list_tickets`. Requires a `confirm` field to prevent accidental deletion:

```ts
delete_task: tool({
  description:
    "Permanently delete a task and all its subtasks. Staff only. Irreversible. " +
    "You MUST ask the user to confirm before calling this — pass confirm: true only after they say yes.",
  inputSchema: z.object({
    task_id: z.string().uuid().describe("UUID of the task to delete"),
    confirm: z.literal(true).describe("Must be true — confirms the user approved this destructive action"),
  }),
  execute: async ({ task_id }) => {
    if (!staff) {
      return { error: "Access denied — task deletion is restricted to staff roles" };
    }
    // Fetch title first so we can report what was deleted
    const { data: task } = await adminClient
      .from("tasks")
      .select("id,title")
      .eq("id", task_id)
      .single();
    if (!task) return { error: "Task not found" };

    const { error } = await adminClient.from("tasks").delete().eq("id", task_id);
    if (error) return { error: error.message };
    return { deleted: { id: task.id, title: task.title } };
  },
}),
```

### Step 6: Update `OPS_CHAT_SYSTEM_PROMPT` in `route.ts`

Replace the tools section of the system prompt:

```ts
const OPS_CHAT_SYSTEM_PROMPT = `
You are WebriQ Ops AI, a workspace assistant embedded in the WebriQ Central Hub.

You have access to the following tools:
- list_tasks: Read hub tasks (developers see only their own; staff see all)
- update_task_status: Update a task's status (developers: own tasks only; staff: any task)
- list_assignable_users: List hub users to resolve names to IDs before assigning (staff only)
- create_task: Create a new task in a project (staff only)
- update_task: Update task details — title, description, priority, labels, due date, milestone (staff: any task; developers: own tasks only)
- assign_task: Set assignees on a task (staff only) — call list_assignable_users first to resolve names
- delete_task: Permanently delete a task (staff only) — always confirm with the user before calling
- list_classifications: Read the AI pipeline queue (classification records)
- update_classification_status: Update a classification record's status (staff only)
- list_tickets: Read client support tickets (staff only)
- run_orchestration: Execute the automation pipeline on a task (staff only)
- Sanity MCP tools: query_documents, create_documents, patch_documents, etc. (staff only)

Rules:
1. Always call tools to ground factual answers — never invent task IDs, statuses, or content.
2. Sanity writes: create and patch DRAFTS only. NEVER call publish_documents. Report what was created/patched and request human review before publishing.
3. create_task, assign_task, delete_task, update_classification_status, and Sanity write tools are staff-only (admin/pm/hr). Politely refuse if the user's role is developer or client.
4. Before assigning by name, call list_assignable_users to resolve the name to a user ID — never guess UUIDs.
5. Before calling delete_task, always ask the user to confirm the deletion. Only pass confirm: true after they explicitly say yes.
6. Be concise. Reference task IDs when listing results. Report what you did and what needs human review.
7. When in doubt, do less and ask for clarification.
8. After completing an orchestration run, use update_task_status or update_classification_status to close the task — do not ask the user to do it manually.
`.trim();
```

## Testing Checklist

- [ ] Staff creates a task via Ops Chat — `create_task` succeeds and the kanban board shows it (via realtime)
- [ ] Staff updates a task title and priority — `update_task` succeeds and the drawer reflects the change
- [ ] Developer updates their own task description — succeeds
- [ ] Developer tries to update another user's task — returns access denied
- [ ] Staff assigns a task by asking "assign task X to [name]" — agent calls `list_assignable_users` first, resolves the ID, then calls `assign_task`
- [ ] Staff reassigns: pass `[]` as assignees — task is unassigned
- [ ] Staff attempts to delete a task — agent asks for confirmation, then calls `delete_task` with `confirm: true`
- [ ] Developer attempts to delete a task — returns staff-only error
- [ ] All mutations reflect live in the kanban/list (existing Supabase realtime channel from task 075 propagates changes)

## Notes for Implementation Agent

- **Do NOT call `/api/v2/...` routes via `fetch()`** — use the `supabase` or `adminClient` directly, same as every other tool in this file
- **`update_task` vs `update_task_status`** — keep them separate. `update_task_status` has a tighter input schema (only the status enum) and is used by the post-orchestration auto-close rule. `update_task` handles all other fields. The agent learns the boundary from the tool descriptions.
- **`assign_task` uses `adminClient`** — the `assignees` column is a `text[]` array, not a FK join table, so RLS can't row-scope it per user. The `isStaff()` guard is the access control here.
- **`delete_task` cascades subtasks** — the DB foreign key on `subtasks.parent_task_id` has `ON DELETE CASCADE` (from migration 025). No manual subtask deletion needed.
- **`confirm: z.literal(true)`** in `delete_task` is intentional — it forces the model to explicitly pass `true` in the JSON, which is only possible after the user agrees. The schema rejects anything else at the Zod layer before `execute` runs.
- **`list_assignable_users` search** uses `.ilike` which is case-insensitive in PostgreSQL — no need to lowercase the search term.
- **Insertion order in `return { ... }`** — add tools in this order after `update_task_status`: `list_assignable_users`, `create_task`, `update_task`, `assign_task`, `delete_task`. Then `list_classifications`, `update_classification_status`, `list_tickets`, `run_orchestration` (unchanged).
- **`profiles` table columns** — `id`, `display_name`, `email`, `role`. `display_name` can be null (fallback to `email` in the agent's response if needed).
