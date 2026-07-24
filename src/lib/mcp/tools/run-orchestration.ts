import { z } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { runScopedTool } from "@/lib/mcp/run-tool";
import { adminClient } from "@/lib/supabase/admin";
import { runOrchestration, type OrchestrationProject } from "@/lib/pipeline/orchestrate";

export const runOrchestrationInputSchema = {
  task_id: z.string().uuid().describe("UUID of the task to orchestrate"),
};

export async function runOrchestrationTool(
  { task_id }: { task_id: string },
  authInfo: AuthInfo | undefined
) {
  return runScopedTool("run_orchestration", "orchestration:run", authInfo, async (client, userId) => {
    const { data: task, error: taskErr } = await client
      .from("tasks")
      .select("id,title,description,project_id")
      .eq("id", task_id)
      .single();
    if (taskErr || !task) throw new Error("Task not found");
    if (!task.title) throw new Error("Task has no title — cannot orchestrate");

    // adminClient here so sanity_project_id/dataset/etc. are readable regardless of
    // RLS — matches ops-chat-tools.ts's run_orchestration exactly. runOrchestration()
    // itself is existing pipeline infra (src/lib/pipeline/orchestrate.ts), unchanged.
    const { data: project, error: projErr } = await adminClient
      .from("projects")
      .select("id,sanity_project_id,dataset,vercel_project_id,github_repo")
      .eq("id", task.project_id)
      .single();
    if (projErr || !project) throw new Error("Project not found for this task");

    const orchestrationProject: OrchestrationProject = {
      id: project.id,
      sanity_project_id: project.sanity_project_id ?? undefined,
      dataset: project.dataset ?? undefined,
      vercel_project_id: project.vercel_project_id ?? undefined,
      github_repo: project.github_repo ?? undefined,
    };

    const result = await runOrchestration({
      task_id,
      title: task.title,
      description: task.description ?? "",
      project: orchestrationProject,
      userId,
    });

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  });
}
