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

export const createTaskInputSchema = {
  project_id: z.string().uuid().describe("UUID of the project to create the task in"),
  title: z.string().min(1).describe("Task title"),
  description: z.string().optional().describe("Optional task description"),
  status: z.enum(TASK_STATUS).default("open").describe("Initial status (defaults to open)"),
  priority: z.enum(TASK_PRIORITY).default("normal").describe("Task priority (defaults to normal)"),
  assignees: z.array(z.string().uuid()).optional().describe("Array of user IDs to assign"),
  due_date: z.string().optional().describe("Due date in YYYY-MM-DD format"),
  labels: z.array(z.string()).optional().describe("Labels/tags for the task"),
  milestone_id: z.string().uuid().optional().describe("Optional milestone UUID"),
};

export async function createTask(
  args: {
    project_id: string;
    title: string;
    description?: string;
    status: (typeof TASK_STATUS)[number];
    priority: (typeof TASK_PRIORITY)[number];
    assignees?: string[];
    due_date?: string;
    labels?: string[];
    milestone_id?: string;
  },
  authInfo: AuthInfo | undefined
) {
  return runScopedTool("create_task", "tasks:manage", authInfo, async (client, userId) => {
    const { data, error } = await client
      .from("tasks")
      .insert({
        project_id: args.project_id,
        title: args.title.trim(),
        description: args.description?.trim() || null,
        status: args.status ?? "open",
        priority: args.priority ?? "normal",
        assignees: args.assignees ?? null,
        due_date: args.due_date ?? null,
        labels: args.labels ?? null,
        milestone_id: args.milestone_id ?? null,
        position: Date.now(),
        created_by: userId,
      })
      .select("id,title,status,priority,project_id,assignees,due_date")
      .single();
    if (error) throw new Error(error.message);

    return {
      content: [{ type: "text" as const, text: JSON.stringify({ created: data }, null, 2) }],
    };
  });
}
