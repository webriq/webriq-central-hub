import { z } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { runScopedTool } from "@/lib/mcp/run-tool";

export const deleteTaskInputSchema = {
  task_id: z.string().uuid().describe("UUID of the task to delete"),
  confirm: z.literal(true).describe("Must be true — confirms the user approved this destructive action"),
};

export async function deleteTask(
  { task_id }: { task_id: string; confirm: true },
  authInfo: AuthInfo | undefined
) {
  // tasks_pm_write RLS policy is "for all" (admin/super_admin/pm), which covers
  // DELETE too — no adminClient needed, unlike the Ops Chat implementation this
  // was ported from. Note the "confirm: true" schema field is advisory only: the
  // MCP protocol has no mechanism to force a calling client to actually make the
  // caller confirm before sending it, unlike Ops Chat's own fixed system prompt.
  return runScopedTool("delete_task", "tasks:delete", authInfo, async (client) => {
    const { data: task } = await client.from("tasks").select("id,title").eq("id", task_id).single();
    if (!task) throw new Error("Task not found");

    const { error } = await client.from("tasks").delete().eq("id", task_id);
    if (error) throw new Error(error.message);

    return {
      content: [{ type: "text" as const, text: JSON.stringify({ deleted: { id: task.id, title: task.title } }, null, 2) }],
    };
  });
}
