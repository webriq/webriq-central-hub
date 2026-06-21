import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { createClient } from "@/lib/supabase/server";
import { getModel, getModelConfig } from "@/lib/ai/model-config";
import { logLLMInvocation } from "@/lib/ai/logger";
import { buildOpsChatTools } from "@/lib/ai/ops-chat-tools";

function buildSystemPrompt(role: string, name: string | null): string {
  const identity = name ? `${name} (${role})` : role;
  return `
You are WebriQ Ops AI, a workspace assistant embedded in the WebriQ Central Hub.

The current user is: ${identity}
Their role is: ${role}
You already know their role — never ask the user what their role is.

You have access to the following tools:
- list_tasks: Read hub tasks (developers see only their own; staff see all)
- update_task_status: Update a task's status (developers: own tasks only; staff: any task)
- list_assignable_users: List hub users to resolve names to IDs before assigning (staff only)
- create_task: Create a new task in a project (staff only)
- update_task: Update task details — title, description, priority, labels, due date, milestone (staff: any task; developers: own tasks only)
- assign_task: Set assignees on a task (staff only) — call list_assignable_users first to resolve names
- delete_task: Permanently delete a task (staff only) — always confirm with the user before calling
- list_classifications: Read the AI pipeline queue (classification records)
- update_classification_status: Update a classification record's status (staff only)
- list_tickets: Read client support tickets (staff only)
- run_orchestration: Execute the automation pipeline on a task — classify → subtasks → Sanity execution (staff only)
- Sanity MCP tools: query_documents, create_documents, patch_documents, etc. (staff only)

Rules:
1. Always call tools to ground factual answers — never invent task IDs, statuses, or content.
2. Sanity writes: create and patch DRAFTS only. NEVER call publish_documents. Report what was created/patched and request human review before publishing.
3. create_task, assign_task, delete_task, run_orchestration, update_classification_status, and Sanity write tools are staff-only (admin/pm/hr). You already know the user's role — apply the restriction silently without asking.
4. Before assigning by name, call list_assignable_users to resolve the name to a user ID — never guess UUIDs.
5. Before calling delete_task, always ask the user to confirm the deletion. Only pass confirm: true after they explicitly say yes.
6. Be concise. Reference task IDs when listing results. Report what you did and what needs human review.
7. When in doubt, do less and ask for clarification.
8. After completing an orchestration run, use update_task_status or update_classification_status to close the task — do not ask the user to do it manually.
`.trim();
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Fetch role in parallel with model config (async-parallel rule)
  const [profileResult, modelResult] = await Promise.all([
    supabase.from("profiles").select("role,full_name").eq("id", user.id).single(),
    Promise.all([getModel("ops_chat"), getModelConfig("ops_chat")]),
  ]);

  const role = (profileResult.data?.role ?? "client") as
    | "admin" | "pm" | "hr" | "developer" | "client";
  const fullName = profileResult.data?.full_name ?? null;
  const [model, config] = modelResult;

  const body = await req.json().catch(() => ({}));
  const messages: UIMessage[] = Array.isArray(body.messages) ? body.messages : [];

  // Open Sanity MCP client (only if token is configured)
  const token = process.env.SANITY_GLOBAL_TOKEN;
  const sanityMCP = token
    ? await createMCPClient({
        transport: {
          type: "http",
          url: "https://mcp.sanity.io",
          headers: { Authorization: `Bearer ${token}` },
        },
      })
    : null;

  const localTools = buildOpsChatTools({ supabase, userId: user.id, role });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mcpTools = sanityMCP ? ((await sanityMCP.tools()) as any) : {};

  const startMs = Date.now();

  const result = streamText({
    model,
    system: buildSystemPrompt(role, fullName),
    messages: await convertToModelMessages(messages),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: { ...localTools, ...mcpTools } as any,
    stopWhen: stepCountIs(8),
    onFinish: async ({ usage }) => {
      // Always close MCP client — non-fatal if it fails
      await sanityMCP?.close().catch(() => {});
      // Always log LLM invocation — project rule, never skip
      await logLLMInvocation({
        layer: "ops_chat",
        modelUsed: config.model_id,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        durationMs: Date.now() - startMs,
        status: "success",
        referenceType: "ops_chat",
      });
    },
    onError: async () => {
      await sanityMCP?.close().catch(() => {});
    },
  });

  return result.toUIMessageStreamResponse();
}
