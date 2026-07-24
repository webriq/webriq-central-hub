# 182: Remote MCP Server — Expose Ops Chat Tools for External Clients

**Created:** 2026-07-24
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

Task 181 shipped the public MCP server (`src/app/api/mcp/route.ts`) with exactly two read-only tools (`get_project_status`, `list_open_tasks`), OAuth 2.1/PKCE auth, and a `profiles.role` → scope grant map (`src/lib/mcp/scopes.ts`) — deliberately scoped down to "verify the handshake works" before any write capability shipped.

This task adds the rest of the Ops Chat tool surface (`src/lib/ai/ops-chat-tools.ts`, used today only by the cookie-authenticated `/api/ops-chat` chat route) to that same public MCP server, so external MCP clients (Claude Desktop, ChatGPT, etc.) connected via OAuth can call them too — not just the embedded Ops Chat UI. `src/lib/ai/ops-chat-tools.ts` and `/api/ops-chat` are **not modified**; this is a parallel implementation under the MCP transport, matching how task 181 was scoped ("new infrastructure sharing only the identity store").

**11 tools ported:** `list_tasks`, `create_task`, `update_task`, `update_task_status`, `assign_task`, `delete_task`, `list_assignable_users`, `list_classifications`, `update_classification_status`, `list_tickets`, `run_orchestration`.

**Explicitly excluded:** the Sanity remote-MCP tools (`query_documents`/`create_documents`/`patch_documents`) that Ops Chat separately proxies in from `mcp.sanity.io` — not part of this task.

## Decisions Confirmed With User

Asked via `AskUserQuestion` before writing this doc:

1. **Blast-radius tools (`delete_task`, `run_orchestration`) — include or defer?** → **Include all 11 now.** Both carry real risk (`delete_task` is irreversible; `run_orchestration` chains multiple LLM calls + a Sanity write with no `maxDuration` set anywhere in this app today — see Requirement 9 below for the mitigation this task adds) but the user chose full parity in one pass.
2. **Developer-role access — mirror Ops Chat's per-tool developer allowances, or staff-only for this pass?** → **Staff-only.** None of the 11 new tools are granted to the `developer` role in this pass, even the read-only ones (`list_tasks`, `list_classifications`). Developers keep their existing `projects:read`/`tasks:read` grant (powering `get_project_status`/`list_open_tasks` only, unchanged). Widening specific read tools to `developer` later (RLS already permits it for `list_tasks` and `list_classifications` — see Requirement 3) is a small follow-up, not part of this task.

## Requirements

- [ ] 1. Extend `src/lib/mcp/scopes.ts`: retire the unused `tasks:write` scope (currently in the enum, granted to no role, zero consumers — confirmed via repo-wide search) and add 6 new scopes: `tasks:manage`, `tasks:delete`, `classifications:read`, `classifications:write`, `tickets:read`, `orchestration:run`. `projects:read` and `tasks:read` are unchanged.
- [ ] 2. Update `ROLE_SCOPE_GRANTS`: `admin`, `super_admin`, and `pm` each get all 8 scopes (`projects:read`, `tasks:read`, `tasks:manage`, `tasks:delete`, `classifications:read`, `classifications:write`, `tickets:read`, `orchestration:run`). `developer` stays at `["projects:read", "tasks:read"]`. `hr`/`marketing`/`client` stay `[]`.
  - **Note:** `super_admin` is included here even though Ops Chat's own `STAFF_ROLES = ["admin", "pm"]` (`src/lib/ai/ops-chat-tools.ts:10`) omits it. That looks like an oversight in the original Ops Chat implementation predating the `super_admin` role (task 098) — every RLS policy touched by this task (`tasks_pm_write`, `classification_records_pm_write`) already includes `super_admin` alongside `admin`/`pm`. This task's scope grants follow the RLS/rest-of-app convention. `ops-chat-tools.ts` itself is out of scope for this task — not fixing that discrepancy there.
- [ ] 3. Create 11 new tool files under `src/lib/mcp/tools/`, one per tool (matches the existing one-file-per-tool convention from `get-project-status.ts`/`list-open-tasks.ts`), each using `runScopedTool()` for auth/scope-check/logging exactly like the existing two tools. Business logic is ported from `ops-chat-tools.ts` (see Code Context), adapted to MCP's `{content: [{type: "text", text}]}` return shape and flat zod-shape `inputSchema` (not `z.object(...)`, matching `getProjectStatusInputSchema`'s existing pattern).
- [ ] 4. Client choice per tool — confirmed against the actual RLS policies (see Code Context), not assumed:

  | Tool | Required Scope | Supabase Client | Why |
  |---|---|---|---|
  | `list_tasks` | `tasks:manage` | RLS session (`withUserScopedClient`) | `tasks_staff_read` covers admin/super_admin/pm |
  | `create_task` | `tasks:manage` | RLS session | `tasks_pm_write` covers insert for admin/super_admin/pm |
  | `update_task` | `tasks:manage` | RLS session | `tasks_pm_write` covers update |
  | `update_task_status` | `tasks:manage` | RLS session | `tasks_pm_write` covers update |
  | `assign_task` | `tasks:manage` | RLS session | `tasks_pm_write` covers update — **improvement over Ops Chat**, which uses `adminClient` here unnecessarily |
  | `delete_task` | `tasks:delete` | RLS session | `tasks_pm_write` is `for all` (covers delete) — **improvement over Ops Chat**, which uses `adminClient` here unnecessarily |
  | `list_assignable_users` | `tasks:manage` | `adminClient` (unchanged from Ops Chat) | `profiles_read_own` RLS only lets `admin`/`super_admin` read other users' rows — **not** `pm`. A `pm` caller's RLS session client cannot read the `profiles` table for other users, so this tool structurally requires `adminClient`. The `tasks:manage` scope gate (only ever granted to admin/pm/super_admin) is the real access control here — matches CLAUDE.md's documented `adminClient` exception ("writes that need service-level access"), extended to this one service-level *read*. |
  | `list_classifications` | `classifications:read` | RLS session | `classification_records_staff_read` covers admin/super_admin/pm |
  | `update_classification_status` | `classifications:write` | RLS session | `classification_records_pm_write` covers admin/super_admin/pm |
  | `list_tickets` | `tickets:read` | RLS session | `tickets_staff_all` covers admin/super_admin/pm |
  | `run_orchestration` | `orchestration:run` | RLS session for the task lookup; delegates to existing `runOrchestration()` (`src/lib/pipeline/orchestrate.ts`, unchanged, uses `adminClient` internally) | Mirrors Ops Chat exactly — `runOrchestration()` is existing pipeline infra, not touched by this task |

- [ ] 5. `list_tasks`, `create_task`, `update_task`, `update_task_status`, `assign_task`, `list_assignable_users`, `delete_task` — copy the exact status/priority zod enums from `ops-chat-tools.ts` verbatim (they mirror real DB text-constraint values): status `open|in_progress|ready_for_qa|testing_completed|for_client_approval|ready_to_merge|post_live_qa|closed`, priority `low|normal|high|critical`.
- [ ] 6. `list_classifications`/`update_classification_status` — copy the exact status enum (`pending|reviewed|planning|planned|approved|open|on_hold|active|review|closed`) and `llm_eligible` enum (`YES|NO|HUMAN_ONLY`) from `ops-chat-tools.ts` verbatim.
- [ ] 7. `list_tickets` — copy the exact status enum (`new|open|waiting_on_client|waiting_on_us|resolved|closed`) from `ops-chat-tools.ts` verbatim.
- [ ] 8. `delete_task` keeps the `confirm: z.literal(true)` schema field and the "you MUST ask the user to confirm before calling this" language in its `description`, matching `ops-chat-tools.ts`. Flag explicitly in Implementation Notes that this is advisory only — the MCP protocol has no mechanism to force a calling client to actually honor it, unlike Ops Chat's fixed system prompt talking to a model we control.
- [ ] 9. Add `export const maxDuration = 300;` (or whatever the deployed Vercel plan's practical ceiling is — confirm at implementation time) to `src/app/api/mcp/route.ts`. No route in this app sets `maxDuration` today (confirmed via search); `run_orchestration` chains `classifyTask` → `enumerateSubTasks` → `buildContextChain` → `executeSanityPlan` (`src/lib/pipeline/orchestrate.ts`, 176 lines, multiple sequential LLM calls) with no timeout override, so this is a real mitigation, not boilerplate — go in eyes-open that it reduces but does not eliminate truncation risk on slow orchestration runs.
- [ ] 10. Register all 11 new tools in `src/app/api/mcp/route.ts` via `server.registerTool(...)`, following the exact shape of the two existing registrations.
- [ ] 11. No changes needed to `src/app/v2/oauth/authorize/page.tsx`, `src/app/api/oauth/token/route.ts`, or `src/app/.well-known/oauth-authorization-server/route.ts` — confirmed by reading all three: the consent screen renders `MCP_SCOPE_DESCRIPTIONS`/`allowedScopesForRole()` generically (no hardcoded scope list), the token endpoint passes `scopes` through opaquely, and the AS metadata endpoint's `scopes_supported` is `MCP_SCOPES` directly. New scopes flow through automatically once `scopes.ts` is updated.

## Out of Scope / Must-Not-Change

- `src/lib/ai/ops-chat-tools.ts` and `src/app/api/ops-chat/route.ts` — not modified. Business logic is *ported*, not shared/refactored into a common module (different auth model, different SDK, different return shape — forcing a shared core is a bigger, riskier change not needed here).
- Sanity remote-MCP tools (`query_documents`, `create_documents`, `patch_documents`) proxied in from `mcp.sanity.io` — not exposed via the public `/api/mcp` server.
- No RLS migration changes — every client-choice decision in Requirement 4 uses RLS policies *as they exist today* (confirmed by reading the actual `CREATE POLICY` statements in `supabase/migrations/026_rls_policies_v2.sql`, `048_super_admin_rls.sql`, `084_tighten_pipeline_rls.sql`). If a policy turns out not to cover a case as expected during implementation, stop and flag it — do not paper over with a new migration or a silent `adminClient` swap without noting why.
- `developer` role scope grants — not widened in this task (see Decisions Confirmed With User #2).
- Do not touch `hub_users`/v1 role-access (`src/lib/auth/role-access.ts`, `require-role.ts`) — this is v2/`profiles`-only, consistent with task 181.
- Consent screen (`/v2/oauth/authorize`), token endpoint, and `.well-known` metadata routes — no code changes (Requirement 11), only benefit from the new scope catalog automatically.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/mcp/scopes.ts` | Modify | Retire `tasks:write`; add `tasks:manage`, `tasks:delete`, `classifications:read`, `classifications:write`, `tickets:read`, `orchestration:run`; update `ROLE_SCOPE_GRANTS` |
| `src/lib/mcp/tools/list-tasks.ts` | Create | Port of `list_tasks` |
| `src/lib/mcp/tools/create-task.ts` | Create | Port of `create_task` |
| `src/lib/mcp/tools/update-task.ts` | Create | Port of `update_task` |
| `src/lib/mcp/tools/update-task-status.ts` | Create | Port of `update_task_status` |
| `src/lib/mcp/tools/assign-task.ts` | Create | Port of `assign_task` |
| `src/lib/mcp/tools/delete-task.ts` | Create | Port of `delete_task` |
| `src/lib/mcp/tools/list-assignable-users.ts` | Create | Port of `list_assignable_users` |
| `src/lib/mcp/tools/list-classifications.ts` | Create | Port of `list_classifications` |
| `src/lib/mcp/tools/update-classification-status.ts` | Create | Port of `update_classification_status` |
| `src/lib/mcp/tools/list-tickets.ts` | Create | Port of `list_tickets` |
| `src/lib/mcp/tools/run-orchestration.ts` | Create | Port of `run_orchestration`, delegates to existing `runOrchestration()` |
| `src/app/api/mcp/route.ts` | Modify | Register 11 new tools; add `maxDuration` export |

## Code Context

### `src/lib/mcp/run-tool.ts` — shared wrapper every new tool must use (unchanged, already exists)

```ts
export async function runScopedTool<T>(
  toolName: string,
  requiredScope: string,
  authInfo: AuthInfo | undefined,
  handler: ToolHandler<T>
): Promise<T> {
  // checks authInfo.scopes.includes(requiredScope), then either throws Unauthorized
  // or runs handler(scopedClient, userId) via withUserScopedClient(...), logging
  // every outcome (success/error/unauthorized) via invokeMCPTool(). Do not duplicate
  // this logic inline in the new tool files — call it, same as the existing two tools.
}
```

### Existing tool file shape to match exactly — `src/lib/mcp/tools/get-project-status.ts`

```ts
import { z } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { runScopedTool } from "@/lib/mcp/run-tool";

export const getProjectStatusInputSchema = {
  customer_id: z.string().describe("The customer_id (e.g. WRQ-CLIENT-XXXX) to look up."),
};

export async function getProjectStatus(
  { customer_id }: { customer_id: string },
  authInfo: AuthInfo | undefined
) {
  return runScopedTool("get_project_status", "projects:read", authInfo, async (client) => {
    // ... query via `client` (RLS-scoped) ...
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ customer, projects }, null, 2) }],
    };
  });
}
```
Note the input schema is a **flat shape object** (`{ customer_id: z.string()... }`), not `z.object({...})` — `server.registerTool` wraps it itself. Every new tool file must match this shape, not the `z.object(...)` style used in `ops-chat-tools.ts`.

### Registration site — `src/app/api/mcp/route.ts` (current, to be extended)

```ts
const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_project_status",
      { title: "Get Project Status", description: "...", inputSchema: getProjectStatusInputSchema },
      async (args, extra) => getProjectStatus(args, extra.authInfo)
    );
    server.registerTool(
      "list_open_tasks",
      { title: "List Open Tasks", description: "...", inputSchema: listOpenTasksInputSchema },
      async (args, extra) => listOpenTasks(args, extra.authInfo)
    );
    // ADD 11 new server.registerTool(...) calls here, same shape
  },
  { serverInfo: { name: "webriq-central-hub", version: "0.1.0" } },
  { basePath: "/api", disableSse: true }
);
```
`basePath: "/api"` must stay — task 181's Implementation Notes documents a real post-deploy 404 bug when this was missing (`mcp-handler` defaults its internal dispatch path to `/mcp`).

### Business logic to port — `src/lib/ai/ops-chat-tools.ts` (read in full already; representative examples below, port all 11)

```ts
// list_tasks (developer-branch below is NOT ported — this task's tools are staff-only,
// so the `if (role === "developer") q = q.contains(...)` branch has no equivalent caller)
list_tasks: tool({
  inputSchema: z.object({
    status: z.enum([...]).optional(),
    priority: z.enum([...]).optional(),
    limit: z.number().min(1).max(50).default(20),
  }),
  execute: async ({ status, priority, limit }) => {
    let q = supabase.from("tasks").select("id,title,status,priority,due_date,assignees,project_id,description")
      .order("updated_at", { ascending: false }).limit(limit);
    if (status) q = q.eq("status", status);
    if (priority) q = q.eq("priority", priority);
    const { data, error } = await q;
    if (error) return { error: error.message };
    return { tasks: data ?? [], count: (data ?? []).length };
  },
}),

// delete_task — port as-is but swap adminClient → RLS session client (see Requirement 4)
delete_task: tool({
  inputSchema: z.object({
    task_id: z.string().uuid(),
    confirm: z.literal(true).describe("Must be true — confirms the user approved this destructive action"),
  }),
  execute: async ({ task_id }) => {
    const { data: task } = await adminClient.from("tasks").select("id,title").eq("id", task_id).single();
    if (!task) return { error: "Task not found" };
    const { error } = await adminClient.from("tasks").delete().eq("id", task_id);
    if (error) return { error: error.message };
    return { deleted: { id: task.id, title: task.title } };
  },
}),

// run_orchestration — port as-is, calls the same runOrchestration()
run_orchestration: tool({
  inputSchema: z.object({ task_id: z.string().uuid() }),
  execute: async ({ task_id }) => {
    const { data: task } = await supabase.from("tasks").select("id,title,description,project_id").eq("id", task_id).single();
    const { data: project } = await adminClient.from("projects")
      .select("id,sanity_project_id,dataset,vercel_project_id,github_repo").eq("id", task.project_id).single();
    return runOrchestration({ task_id, title: task.title, description: task.description ?? "", project: orchestrationProject, userId });
  },
}),
```
Every `if (!staff) return {error}` check in the original file has no equivalent in the ported MCP versions — the scope gate in `runScopedTool` (Requirement 1/2) is the access control, since these scopes are never granted to non-staff roles. Do not port the app-level `if (!staff)`/`if (role === "developer")` branches; they'd be dead code given the scope catalog.

### RLS policies backing Requirement 4's client-choice table (already confirmed by reading the migrations — do not re-derive, just cite)

```sql
-- supabase/migrations/048_super_admin_rls.sql
create policy "tasks_pm_write" on tasks for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));
-- covers create_task/update_task/update_task_status/assign_task/delete_task (INSERT/UPDATE/DELETE, "for all")

create policy "profiles_read_own" on profiles for select to authenticated
  using (auth.uid() = id or get_my_role() in ('admin', 'super_admin'));
-- pm is NOT included — list_assignable_users cannot use an RLS session client for a pm caller

-- supabase/migrations/084_tighten_pipeline_rls.sql
create policy "classification_records_pm_write" on classification_records for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

-- supabase/migrations/026_rls_policies_v2.sql (as amended by 048)
create policy "tickets_staff_all" on tickets for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));
-- developer is covered by RLS here but NOT granted the tickets:read scope in this task — scope
-- gate is intentionally narrower than RLS, matching Ops Chat's own narrower app-level "staff" gate.
```

## Implementation Steps

1. Update `src/lib/mcp/scopes.ts` (Requirements 1–2).
2. Build the 11 new tool files under `src/lib/mcp/tools/`, one at a time, in this order (cheapest/lowest-risk first): `list-tasks.ts`, `list-classifications.ts`, `list-tickets.ts`, `list-assignable-users.ts`, `create-task.ts`, `update-task.ts`, `update-task-status.ts`, `assign-task.ts`, `update-classification-status.ts`, `delete-task.ts`, `run-orchestration.ts`.
3. Wire all 11 into `src/app/api/mcp/route.ts` via `server.registerTool(...)`; add the `maxDuration` export (Requirement 9).
4. Run verification (below).

## Acceptance Criteria

- [ ] `pnpm build` and `npx tsc --noEmit` pass.
- [ ] All 11 new tools appear in the MCP server's tool list (verify via a client's tool-discovery call or `curl`).
- [ ] A `pm`-role token can successfully call every tool except none (full access, matching admin).
- [ ] A `developer`-role token gets `Unauthorized: missing required scope "..."` on all 11 new tools, and unchanged success on the existing `get_project_status`/`list_open_tasks`.
- [ ] `list_assignable_users` still returns results for a `pm`-role caller (regression check on the `adminClient`-required path from Requirement 4).
- [ ] `delete_task` and `assign_task` succeed for an `admin`/`pm`/`super_admin`-role token under the RLS session client (regression check that the client-choice change from Ops Chat's `adminClient` doesn't silently 0-row-fail).
- [ ] Every call to all 11 new tools produces a row in `mcp_tool_invocation_logs`, including unauthorized/error calls (same as the existing two tools).
- [ ] No `adminClient` usage in any new tool's data path except `list_assignable_users` (profiles read) and `run_orchestration`'s delegation into the existing, unchanged `runOrchestration()`.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm build            # do not remove --webpack
pnpm dev
```

### Manual testing (post-implementation)

1. Reconnect (or re-approve scopes on) the existing custom connector from task 181 — confirm the consent screen now lists 8 scope lines instead of 2, using an `admin`/`pm` test account.
2. Call each of the 11 new tools once via the connected client; spot-check `list_assignable_users` (pm caller, adminClient path) and `delete_task`/`assign_task` (RLS session client path) specifically, since those are the client-choice changes most likely to have a subtle RLS mismatch.
3. Attempt `run_orchestration` on a real task; confirm it completes within the new `maxDuration` window and produces the same `task_log_id`/result shape Ops Chat's in-app version produces.
4. Switch to (or simulate) a `developer`-role token; confirm all 11 new tool calls fail with the expected scope error, and the two task-181 tools still work.
5. Check `mcp_tool_invocation_logs` for entries from steps 2–4, including the expected unauthorized rows from step 4.

## Compatibility Touchpoints

- Consent screen, token endpoint, `.well-known` AS metadata — no code changes needed (Requirement 11), but their *output* changes (more scopes listed/advertised) — worth a visual check during manual testing.
- Adds `maxDuration` route config to `src/app/api/mcp/route.ts` for the first time in this app — confirm the deployed Vercel plan actually supports the chosen value before relying on it as a real mitigation.
- No new runtime dependencies — reuses `mcp-handler`/`@modelcontextprotocol/sdk` already installed in task 181.

## Implementation Notes

### What Changed

- Retired the unused `tasks:write` scope and added 6 new scopes (`tasks:manage`, `tasks:delete`, `classifications:read`, `classifications:write`, `tickets:read`, `orchestration:run`) in `src/lib/mcp/scopes.ts`, granted to `admin`/`super_admin`/`pm` only — `developer` stays at the original `["projects:read", "tasks:read"]`, per the confirmed decision to keep this pass staff-only.
- Ported all 11 Ops Chat tools into standalone files under `src/lib/mcp/tools/`, each following the existing `get-project-status.ts`/`list-open-tasks.ts` shape: a flat zod-shape `inputSchema` export, an async function that calls `runScopedTool(toolName, requiredScope, authInfo, handler)`, and a `{content: [{type: "text", text: JSON.stringify(...)}]}` return.
- Per the task doc's Requirement 4 client-choice table, used the RLS-scoped session client (not `adminClient`) for every tool except `list_assignable_users` (profiles RLS structurally blocks `pm` from reading other users' rows) and `run_orchestration`'s project lookup (mirrors Ops Chat exactly, existing pipeline infra). This is tighter than Ops Chat's own implementation for `assign_task` and `delete_task`, which used `adminClient` where RLS (`tasks_pm_write`, `for all`) already covers the operation.
- None of the ported tools carry over Ops Chat's inline `if (!staff)` / `if (role === "developer")` app-level checks — the scope gate inside `runScopedTool` is the sole access control, since the new scopes are never granted to non-staff roles.
- Registered all 11 new tools in `src/app/api/mcp/route.ts` via `server.registerTool(...)`, matching the existing two registrations' shape (title/description/inputSchema, `extra.authInfo` passthrough).
- Added `export const maxDuration = 300;` to `src/app/api/mcp/route.ts` — first `maxDuration` set anywhere in this app, mitigating (not eliminating) timeout risk on `run_orchestration`'s multi-step LLM chain.
- Confirmed (by reading, not assuming) that the consent screen (`src/app/v2/oauth/authorize/page.tsx`), token endpoint, and `.well-known/oauth-authorization-server` metadata route all derive their scope handling from `scopes.ts` exports with no hardcoded scope list — no changes needed to any of them.

### Files Changed

- `src/lib/mcp/scopes.ts` — retired `tasks:write`, added 6 new scopes + descriptions, updated `ROLE_SCOPE_GRANTS`
- `src/lib/mcp/tools/list-tasks.ts` — new, scope `tasks:manage`
- `src/lib/mcp/tools/create-task.ts` — new, scope `tasks:manage`
- `src/lib/mcp/tools/update-task.ts` — new, scope `tasks:manage`
- `src/lib/mcp/tools/update-task-status.ts` — new, scope `tasks:manage`
- `src/lib/mcp/tools/assign-task.ts` — new, scope `tasks:manage`, RLS session client (not `adminClient`)
- `src/lib/mcp/tools/delete-task.ts` — new, scope `tasks:delete`, RLS session client (not `adminClient`)
- `src/lib/mcp/tools/list-assignable-users.ts` — new, scope `tasks:manage`, `adminClient` (required — see Requirement 4)
- `src/lib/mcp/tools/list-classifications.ts` — new, scope `classifications:read`
- `src/lib/mcp/tools/update-classification-status.ts` — new, scope `classifications:write`
- `src/lib/mcp/tools/list-tickets.ts` — new, scope `tickets:read`
- `src/lib/mcp/tools/run-orchestration.ts` — new, scope `orchestration:run`, delegates to existing `runOrchestration()`
- `src/app/api/mcp/route.ts` — registered 11 new tools, added `maxDuration` export

### Deviations From Plan

- None. Implementation followed the task doc's Requirements and client-choice table as written.

### Verification Run

- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS
- `pnpm build` (`--webpack`, exit code confirmed 0) — PASS, `/api/mcp` present in the route manifest alongside all existing routes
- `pnpm dev` / manual OAuth reconnect + live tool calls — SKIPPED, requires a deployed/tunneled instance and a real MCP client (Claude Desktop/ChatGPT) reconnecting through the consent screen; not runnable from this session. See Manual Testing steps above for the exact post-deploy checklist, in particular the `list_assignable_users`/`assign_task`/`delete_task` regression checks called out as highest-risk for a subtle RLS mismatch.
