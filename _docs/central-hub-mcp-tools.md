# Remote MCP Tools Reference

Live inventory of every tool exposed by the public Remote MCP server at `src/app/api/mcp/route.ts` (`/api/mcp`), used by external MCP clients (Claude Desktop, ChatGPT, etc.) connecting via OAuth 2.1/PKCE.

**Maintenance rule:** any new `server.registerTool(...)` call added to `src/app/api/mcp/route.ts` must add a row to the table below in the same change. See `CLAUDE.md` → Key Conventions for the enforced version of this rule.

Scope catalog (`MCP_SCOPES`, `MCP_SCOPE_DESCRIPTIONS`, `ROLE_SCOPE_GRANTS`) lives in `src/lib/mcp/scopes.ts`. A scope is only usable by a role if `ROLE_SCOPE_GRANTS` grants it — the OAuth consent screen (`src/app/v2/oauth/authorize/page.tsx`) then only offers the intersection of what the connecting client requests and what the signed-in user's role is granted.

## Tools

| Tool | Required Scope | Role Access | Description |
|---|---|---|---|
| `get_project_status` | `projects:read` | admin, super_admin, pm, developer | Look up a customer and their project(s) by `customer_id` |
| `list_open_tasks` | `tasks:read` | admin, super_admin, pm, developer | List open (not completed) tasks for a project by `project_id` |
| `list_tasks` | `tasks:manage` | admin, super_admin, pm | List hub tasks across all projects, with status/priority filters |
| `create_task` | `tasks:manage` | admin, super_admin, pm | Create a new task in a project |
| `update_task` | `tasks:manage` | admin, super_admin, pm | Update task title/description/priority/labels/due date/milestone (not status) |
| `update_task_status` | `tasks:manage` | admin, super_admin, pm | Update a task's status |
| `assign_task` | `tasks:manage` | admin, super_admin, pm | Set or replace a task's assignees |
| `list_assignable_users` | `tasks:manage` | admin, super_admin, pm | List hub users to resolve names → user IDs before assigning |
| `delete_task` | `tasks:delete` | admin, super_admin, pm | Permanently delete a task — irreversible, requires `confirm: true` |
| `list_classifications` | `classifications:read` | admin, super_admin, pm | List AI pipeline classification records |
| `update_classification_status` | `classifications:write` | admin, super_admin, pm | Update a classification record's pipeline status |
| `list_tickets` | `tickets:read` | admin, super_admin, pm | List client support tickets |
| `run_orchestration` | `orchestration:run` | admin, super_admin, pm | Run the automation pipeline on a task (classify → sub-tasks → lane routing → Sanity execution) |

`developer` gets only `projects:read`/`tasks:read` (`get_project_status`/`list_open_tasks`) — no write/manage scopes are granted to `developer` via MCP. `hr`, `marketing`, and `client` are granted no scopes and cannot use any tool on this server.
