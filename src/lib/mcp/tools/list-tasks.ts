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

const TASK_PRIORITY = ["low", "normal", "high", "critical"] as const;

export const listTasksInputSchema = {
  status: z.enum(TASK_STATUS).optional().describe("Filter by task status"),
  priority: z.enum(TASK_PRIORITY).optional().describe("Filter by priority"),
  limit: z.number().min(1).max(50).default(20).describe("Max results to return"),
};

export async function listTasks(
  { status, priority, limit }: { status?: (typeof TASK_STATUS)[number]; priority?: (typeof TASK_PRIORITY)[number]; limit: number },
  authInfo: AuthInfo | undefined
) {
  return runScopedTool("list_tasks", "tasks:manage", authInfo, async (client) => {
    let q = client
      .from("tasks")
      .select("id,title,status,priority,due_date,assignees,project_id,description")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);
    if (priority) q = q.eq("priority", priority);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    return {
      content: [
        { type: "text" as const, text: JSON.stringify({ tasks: data ?? [], count: (data ?? []).length }, null, 2) },
      ],
    };
  });
}
