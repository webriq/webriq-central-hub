import { z } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { runScopedTool } from "@/lib/mcp/run-tool";

export const listOpenTasksInputSchema = {
  project_id: z.string().describe("The projects.id (UUID) to list open tasks for."),
};

export async function listOpenTasks(
  { project_id }: { project_id: string },
  authInfo: AuthInfo | undefined
) {
  return runScopedTool("list_open_tasks", "tasks:read", authInfo, async (client) => {
    const { data: tasks, error } = await client
      .from("tasks")
      .select("id, title, status, priority, due_date, assignees")
      .eq("project_id", project_id)
      .eq("is_completed", false)
      .order("position", { ascending: true, nullsFirst: false });

    if (error) throw new Error(error.message);

    return {
      content: [{ type: "text" as const, text: JSON.stringify(tasks ?? [], null, 2) }],
    };
  });
}
