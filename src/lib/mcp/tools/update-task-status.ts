import { z } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { runScopedTool } from "@/lib/mcp/run-tool";

const TASK_STATUS = [
  "open",
  "in_progress",
  "ready_for_qa",
  "testing_completed",
  "for_client_approval",
  "ready_to_merge",
  "post_live_qa",
  "closed",
] as const;

export const updateTaskStatusInputSchema = {
  task_id: z.string().uuid().describe("UUID of the task to update"),
  status: z.enum(TASK_STATUS).describe("New status to set"),
};

export async function updateTaskStatus(
  { task_id, status }: { task_id: string; status: (typeof TASK_STATUS)[number] },
  authInfo: AuthInfo | undefined
) {
  return runScopedTool("update_task_status", "tasks:manage", authInfo, async (client) => {
    const { data, error } = await client
      .from("tasks")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", task_id)
      .select("id,title,status")
      .single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Task not found or access denied");

    return {
      content: [{ type: "text" as const, text: JSON.stringify({ updated: data }, null, 2) }],
    };
  });
}
