import { z } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { runScopedTool } from "@/lib/mcp/run-tool";

export const assignTaskInputSchema = {
  task_id: z.string().uuid().describe("UUID of the task"),
  assignees: z
    .array(z.string().uuid())
    .describe("Array of user IDs to assign (replaces current assignees; pass [] to unassign all)"),
};

export async function assignTask(
  { task_id, assignees }: { task_id: string; assignees: string[] },
  authInfo: AuthInfo | undefined
) {
  // tasks_pm_write RLS policy ("for all", admin/super_admin/pm) covers this UPDATE —
  // no adminClient needed, unlike the Ops Chat implementation this was ported from.
  return runScopedTool("assign_task", "tasks:manage", authInfo, async (client) => {
    const { data, error } = await client
      .from("tasks")
      .update({ assignees: assignees.length > 0 ? assignees : null, updated_at: new Date().toISOString() })
      .eq("id", task_id)
      .select("id,title,assignees")
      .single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Task not found");

    return {
      content: [{ type: "text" as const, text: JSON.stringify({ updated: data }, null, 2) }],
    };
  });
}
