import { z } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Database } from "@/types/database";
import { runScopedTool } from "@/lib/mcp/run-tool";

const TASK_PRIORITY = ["low", "normal", "high", "critical"] as const;

export const updateTaskInputSchema = {
  task_id: z.string().uuid().describe("UUID of the task to update"),
  title: z.string().min(1).optional().describe("New title"),
  description: z.string().optional().describe("New description (pass empty string to clear)"),
  priority: z.enum(TASK_PRIORITY).optional().describe("New priority"),
  due_date: z.string().optional().describe("New due date in YYYY-MM-DD format (pass empty string to clear)"),
  labels: z.array(z.string()).optional().describe("Replace labels array (pass [] to clear)"),
  milestone_id: z.string().uuid().optional().describe("New milestone UUID (pass empty string to clear)"),
};

export async function updateTask(
  args: {
    task_id: string;
    title?: string;
    description?: string;
    priority?: (typeof TASK_PRIORITY)[number];
    due_date?: string;
    labels?: string[];
    milestone_id?: string;
  },
  authInfo: AuthInfo | undefined
) {
  return runScopedTool("update_task", "tasks:manage", authInfo, async (client) => {
    const patch: Database["public"]["Tables"]["tasks"]["Update"] = {
      updated_at: new Date().toISOString(),
    };
    if (args.title !== undefined) patch.title = args.title.trim();
    if (args.description !== undefined) patch.description = args.description.trim() || null;
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.due_date !== undefined) patch.due_date = args.due_date || null;
    if (args.labels !== undefined) patch.labels = args.labels.length > 0 ? args.labels : null;
    if (args.milestone_id !== undefined) patch.milestone_id = args.milestone_id || null;

    const { data, error } = await client
      .from("tasks")
      .update(patch)
      .eq("id", args.task_id)
      .select("id,title,priority,status,due_date,labels,milestone_id")
      .single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Task not found or access denied");

    return {
      content: [{ type: "text" as const, text: JSON.stringify({ updated: data }, null, 2) }],
    };
  });
}
