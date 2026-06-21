# Task 074 — Ops Chat: update_task_status + update_classification_status Tools

> **Status:** TESTING
> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Created:** 2026-06-21
> **Completed:** 2026-06-21
> **Implementation Notes:** Added `update_task_status` (RLS-scoped `supabase` client + explicit `assignees` constraint for developers, mirroring `list_tasks`) and `update_classification_status` (`adminClient` + `isStaff()` gate). `tasks` update sets `updated_at`; `classification_records` has no `updated_at` column so only `status` is updated. System prompt updated with both tools + rule 6 (auto-close after orchestration). `npx tsc --noEmit` passes clean.

## Overview

Ops Chat currently has read-only tools (`list_tasks`, `list_classifications`). When the agent runs an orchestration pipeline and completes a task, it cannot mark the task as done — it tells the user to do it manually. This task adds two write tools: `update_task_status` for the `tasks` table and `update_classification_status` for `classification_records`, so the agent can close out work without leaving the user to do it themselves.

**Trigger:** After a successful `run_orchestration`, the agent replied: _"I don't currently have a tool available to update task statuses in the Hub. You'll need to manually mark task `4369021c-eee6-404d-b566-e372b8d6914c` — 'Update Page title' — as Done directly in the WebriQ Central Hub."_

## Requirements

- [ ] Add `update_task_status` tool to `buildOpsChatTools()` — updates `tasks.status`; staff can update any task, developers can only update tasks assigned to them
- [ ] Add `update_classification_status` tool to `buildOpsChatTools()` — updates `classification_records.status`; staff only
- [ ] Update `OPS_CHAT_SYSTEM_PROMPT` in `route.ts` to mention both new tools
- [ ] Both tools return the updated row on success, or a descriptive error on failure
- [ ] No schema migration needed — only touches existing columns

## Current State

`src/lib/ai/ops-chat-tools.ts` exports `buildOpsChatTools()` with four tools:
- `list_tasks` — read `tasks` table
- `list_classifications` — read `classification_records` table
- `list_tickets` — read `tickets` table (staff only)
- `run_orchestration` — trigger automation pipeline (staff only)

No write tools exist for task or classification status updates.

**Current Files:**
| File | Purpose |
|------|---------|
| `src/lib/ai/ops-chat-tools.ts` | All Ops Chat tool definitions |
| `src/app/api/ops-chat/route.ts` | System prompt + tool wiring |

## Proposed Solution

Add two new tools to `buildOpsChatTools()`. Use the existing `supabase` client (RLS-scoped) for `update_task_status` so developer row-level access is enforced automatically. Use `adminClient` for `update_classification_status` since classifications aren't row-scoped to a user — staff gate enforced in the tool itself.

### File Changes

| Action | File | Description |
|--------|------|-------------|
| MODIFY | `src/lib/ai/ops-chat-tools.ts` | Add `update_task_status` and `update_classification_status` tools |
| MODIFY | `src/app/api/ops-chat/route.ts` | Add both tools to the system prompt tool list |

## Implementation Steps

### Step 1: Add `update_task_status` to `ops-chat-tools.ts`

Add inside the `return { ... }` block of `buildOpsChatTools()`, after `list_tasks`:

```ts
update_task_status: tool({
  description:
    "Update the status of a task in the Hub. " +
    "Developers can only update tasks assigned to them. Staff can update any task.",
  inputSchema: z.object({
    task_id: z.string().uuid().describe("UUID of the task to update"),
    status: z
      .enum(["backlog", "todo", "in_progress", "for_review", "done", "cancelled"])
      .describe("New status to set"),
  }),
  execute: async ({ task_id, status }) => {
    let q = supabase
      .from("tasks")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", task_id)
      .select("id,title,status")
      .single();
    // RLS enforces developer row access automatically via supabase (not adminClient)
    const { data, error } = await q;
    if (error) return { error: error.message };
    if (!data) return { error: "Task not found or access denied" };
    return { updated: data };
  },
}),
```

> Note: Use `supabase` (not `adminClient`) so that RLS restricts developers to tasks in their `assignees` array. Staff bypass RLS naturally via their session role policies.

### Step 2: Add `update_classification_status` to `ops-chat-tools.ts`

Add after `list_classifications`:

```ts
update_classification_status: tool({
  description:
    "Update the status of a classification record in the pipeline queue. Staff only. " +
    "Use this to close, re-open, or move a classification through pipeline stages.",
  inputSchema: z.object({
    classification_id: z.string().uuid().describe("UUID of the classification record"),
    status: z
      .enum(["pending", "reviewed", "planning", "planned", "approved", "open", "on_hold", "active", "review", "closed"])
      .describe("New status to set"),
  }),
  execute: async ({ classification_id, status }) => {
    if (!staff) {
      return { error: "Access denied — classification updates are restricted to staff roles" };
    }
    const { data, error } = await adminClient
      .from("classification_records")
      .update({ status })
      .eq("id", classification_id)
      .select("id,title,status")
      .single();
    if (error) return { error: error.message };
    if (!data) return { error: "Classification record not found" };
    return { updated: data };
  },
}),
```

### Step 3: Update `OPS_CHAT_SYSTEM_PROMPT` in `route.ts`

Add the two new tools to the tool list in the system prompt:

```ts
const OPS_CHAT_SYSTEM_PROMPT = `
You are WebriQ Ops AI, a workspace assistant embedded in the WebriQ Central Hub.

You have access to the following tools:
- list_tasks: Read hub tasks (developers see only their own; staff see all)
- update_task_status: Update a task's status (developers: own tasks only; staff: any task)
- list_classifications: Read the AI pipeline queue (classification records)
- update_classification_status: Update a classification record's status (staff only)
- list_tickets: Read client support tickets (staff only)
- run_orchestration: Execute the automation pipeline on a task (staff only)
- Sanity MCP tools: query_documents, create_documents, patch_documents, etc. (staff only)

Rules:
1. Always call tools to ground factual answers — never invent task IDs, statuses, or content.
2. Sanity writes: create and patch DRAFTS only. NEVER call publish_documents. Report what was created/patched and request human review before publishing.
3. run_orchestration, update_classification_status, and Sanity write tools are staff-only (admin/pm/hr). Politely refuse if the user's role is developer or client.
4. Be concise. Reference task IDs when listing results. Report what you did and what needs human review.
5. When in doubt, do less and ask for clarification.
6. After completing an orchestration run, use update_task_status or update_classification_status to close the task — do not ask the user to do it manually.
`.trim();
```

## Testing Checklist

- [ ] Staff user asks Ops Chat to mark a task as done — agent calls `update_task_status` and confirms
- [ ] Developer user asks to mark their own task as done — succeeds
- [ ] Developer user asks to mark another user's task as done — returns access denied
- [ ] Staff user asks to close a classification record — agent calls `update_classification_status` and confirms
- [ ] Developer user asks to update a classification — returns staff-only error
- [ ] After `run_orchestration`, agent automatically closes the classification without prompting the user

## Notes for Implementation Agent

- Use `supabase` (RLS-scoped session client) for `update_task_status`, NOT `adminClient` — this is what enforces the developer-can-only-update-own-tasks rule via RLS
- Use `adminClient` for `update_classification_status` with explicit `isStaff()` guard in the tool — classifications don't have user-scoped RLS
- Add `updated_at: new Date().toISOString()` only to `tasks` update (has this column); `classification_records` may not — check `src/types/database.ts` before adding
- `tasks.status` enum: `backlog | todo | in_progress | for_review | done | cancelled`
- `classification_records.status` enum: `pending | reviewed | planning | planned | approved | open | on_hold | active | review | closed`
- Both tools are already covered by the existing `isStaff()` helper — reuse it, don't duplicate
