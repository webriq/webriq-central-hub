import type { ProfileRow } from "@/types/database";

export const MCP_SCOPES = [
  "projects:read",
  "tasks:read",
  "tasks:manage",
  "tasks:delete",
  "classifications:read",
  "classifications:write",
  "tickets:read",
  "orchestration:run",
] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export const MCP_SCOPE_DESCRIPTIONS: Record<McpScope, string> = {
  "projects:read": "View your projects and their status",
  "tasks:read": "View open tasks on your projects",
  "tasks:manage": "View all tasks, create new ones, and update or assign existing ones",
  "tasks:delete": "Permanently delete tasks",
  "classifications:read": "View the AI pipeline classification queue",
  "classifications:write": "Update classification records in the AI pipeline queue",
  "tickets:read": "View client support tickets",
  "orchestration:run": "Run the automation pipeline (classify, enumerate sub-tasks, execute in Sanity) on a task",
};

// task 182 (ops-chat tool parity): admin/super_admin/pm get the full staff
// surface. developer stays at the original read-only grant — none of the new
// scopes are granted to developer in this pass (confirmed with user), even
// for read-only tools, so a developer's MCP token can't reach list_tasks or
// list_classifications despite RLS technically allowing those reads. Widening
// that later is a scope-catalog-only change, no new tool code needed.
// hr/marketing/client get nothing: RLS would still confine them, but no
// use case exists yet for exposing the connector to those roles.
const STAFF_SCOPES: McpScope[] = [
  "projects:read",
  "tasks:read",
  "tasks:manage",
  "tasks:delete",
  "classifications:read",
  "classifications:write",
  "tickets:read",
  "orchestration:run",
];

const ROLE_SCOPE_GRANTS: Record<ProfileRow["role"], McpScope[]> = {
  admin: STAFF_SCOPES,
  super_admin: STAFF_SCOPES,
  pm: STAFF_SCOPES,
  developer: ["projects:read", "tasks:read"],
  hr: [],
  marketing: [],
  client: [],
};

export function allowedScopesForRole(role: ProfileRow["role"]): McpScope[] {
  return ROLE_SCOPE_GRANTS[role] ?? [];
}
