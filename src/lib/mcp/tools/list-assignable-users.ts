import { z } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { runScopedTool } from "@/lib/mcp/run-tool";
import { adminClient } from "@/lib/supabase/admin";

export const listAssignableUsersInputSchema = {
  search: z.string().optional().describe("Optional name filter (case-insensitive)"),
};

export async function listAssignableUsers(
  { search }: { search?: string },
  authInfo: AuthInfo | undefined
) {
  // adminClient is required here, not the RLS-scoped session client: profiles RLS
  // ("profiles_read_own") only lets admin/super_admin read other users' rows, not
  // pm — so a pm caller's scoped client can't see this data at all. The tasks:manage
  // scope gate (only ever granted to admin/pm/super_admin) is the real access control.
  return runScopedTool("list_assignable_users", "tasks:manage", authInfo, async () => {
    let q = adminClient
      .from("profiles")
      .select("id,full_name,role")
      .in("role", ["admin", "super_admin", "pm", "hr", "developer"])
      .order("full_name");
    if (search) {
      q = q.ilike("full_name", `%${search}%`);
    }

    const { data, error } = await q.limit(30);
    if (error) throw new Error(error.message);

    return {
      content: [{ type: "text" as const, text: JSON.stringify({ users: data ?? [] }, null, 2) }],
    };
  });
}
