import type { ProfileRow } from "@/types/database";

export const MCP_SCOPES = ["projects:read", "tasks:read", "tasks:write"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export const MCP_SCOPE_DESCRIPTIONS: Record<McpScope, string> = {
  "projects:read": "View your projects and their status",
  "tasks:read": "View open tasks on your projects",
  "tasks:write": "Create and update tasks (not yet enabled — no tool exposes this)",
};

// tasks:write is intentionally granted to no role yet — this session ships
// read-only tools only. Client role gets nothing: RLS would still confine a
// client user to their own customer_id, but no client-facing MCP use case
// exists yet, so there's no reason to expose the connector to that role.
const ROLE_SCOPE_GRANTS: Record<ProfileRow["role"], McpScope[]> = {
  admin: ["projects:read", "tasks:read"],
  super_admin: ["projects:read", "tasks:read"],
  pm: ["projects:read", "tasks:read"],
  developer: ["projects:read", "tasks:read"],
  hr: [],
  marketing: [],
  client: [],
};

export function allowedScopesForRole(role: ProfileRow["role"]): McpScope[] {
  return ROLE_SCOPE_GRANTS[role] ?? [];
}
