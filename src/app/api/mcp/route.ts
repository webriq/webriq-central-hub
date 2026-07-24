import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyMcpToken } from "@/lib/mcp/verify-token";
import { getProjectStatus, getProjectStatusInputSchema } from "@/lib/mcp/tools/get-project-status";
import { listOpenTasks, listOpenTasksInputSchema } from "@/lib/mcp/tools/list-open-tasks";
import { listTasks, listTasksInputSchema } from "@/lib/mcp/tools/list-tasks";
import { createTask, createTaskInputSchema } from "@/lib/mcp/tools/create-task";
import { updateTask, updateTaskInputSchema } from "@/lib/mcp/tools/update-task";
import { updateTaskStatus, updateTaskStatusInputSchema } from "@/lib/mcp/tools/update-task-status";
import { assignTask, assignTaskInputSchema } from "@/lib/mcp/tools/assign-task";
import { deleteTask, deleteTaskInputSchema } from "@/lib/mcp/tools/delete-task";
import { listAssignableUsers, listAssignableUsersInputSchema } from "@/lib/mcp/tools/list-assignable-users";
import { listClassifications, listClassificationsInputSchema } from "@/lib/mcp/tools/list-classifications";
import {
  updateClassificationStatus,
  updateClassificationStatusInputSchema,
} from "@/lib/mcp/tools/update-classification-status";
import { listTickets, listTicketsInputSchema } from "@/lib/mcp/tools/list-tickets";
import { runOrchestrationTool, runOrchestrationInputSchema } from "@/lib/mcp/tools/run-orchestration";

// run_orchestration chains multiple sequential LLM calls plus a Sanity write with
// no per-call timeout of its own (src/lib/pipeline/orchestrate.ts) — this reduces
// but does not eliminate truncation risk on slow runs. First maxDuration set in
// this app; confirm it's within the deployed Vercel plan's actual ceiling.
export const maxDuration = 300;

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_project_status",
      {
        title: "Get Project Status",
        description:
          "Look up a customer and their project(s) by customer_id. Requires the projects:read scope.",
        inputSchema: getProjectStatusInputSchema,
      },
      async (args, extra) => getProjectStatus(args, extra.authInfo)
    );

    server.registerTool(
      "list_open_tasks",
      {
        title: "List Open Tasks",
        description:
          "List open (not completed) tasks for a project by project_id. Requires the tasks:read scope.",
        inputSchema: listOpenTasksInputSchema,
      },
      async (args, extra) => listOpenTasks(args, extra.authInfo)
    );

    server.registerTool(
      "list_tasks",
      {
        title: "List Tasks",
        description:
          "List hub tasks with optional status/priority filters, across all projects. Requires the tasks:manage scope.",
        inputSchema: listTasksInputSchema,
      },
      async (args, extra) => listTasks(args, extra.authInfo)
    );

    server.registerTool(
      "create_task",
      {
        title: "Create Task",
        description: "Create a new task in a project. Requires the tasks:manage scope.",
        inputSchema: createTaskInputSchema,
      },
      async (args, extra) => createTask(args, extra.authInfo)
    );

    server.registerTool(
      "update_task",
      {
        title: "Update Task",
        description:
          "Update task details — title, description, priority, labels, due date, or milestone. Does NOT change status (use update_task_status). Requires the tasks:manage scope.",
        inputSchema: updateTaskInputSchema,
      },
      async (args, extra) => updateTask(args, extra.authInfo)
    );

    server.registerTool(
      "update_task_status",
      {
        title: "Update Task Status",
        description: "Update the status of a task. Requires the tasks:manage scope.",
        inputSchema: updateTaskStatusInputSchema,
      },
      async (args, extra) => updateTaskStatus(args, extra.authInfo)
    );

    server.registerTool(
      "assign_task",
      {
        title: "Assign Task",
        description:
          "Set or replace the assignees on a task. Call list_assignable_users first to resolve names to user IDs. Requires the tasks:manage scope.",
        inputSchema: assignTaskInputSchema,
      },
      async (args, extra) => assignTask(args, extra.authInfo)
    );

    server.registerTool(
      "delete_task",
      {
        title: "Delete Task",
        description:
          "Permanently delete a task. Irreversible. You MUST ask the user to confirm before calling this — pass confirm: true only after they say yes. Requires the tasks:delete scope.",
        inputSchema: deleteTaskInputSchema,
      },
      async (args, extra) => deleteTask(args, extra.authInfo)
    );

    server.registerTool(
      "list_assignable_users",
      {
        title: "List Assignable Users",
        description:
          "List hub users that can be assigned to tasks. Call before assign_task or create_task to resolve a name to a user ID. Requires the tasks:manage scope.",
        inputSchema: listAssignableUsersInputSchema,
      },
      async (args, extra) => listAssignableUsers(args, extra.authInfo)
    );

    server.registerTool(
      "list_classifications",
      {
        title: "List Classifications",
        description:
          "List classification records from the AI pipeline queue, with LLM eligibility, type, and status. Requires the classifications:read scope.",
        inputSchema: listClassificationsInputSchema,
      },
      async (args, extra) => listClassifications(args, extra.authInfo)
    );

    server.registerTool(
      "update_classification_status",
      {
        title: "Update Classification Status",
        description:
          "Update the status of a classification record in the pipeline queue. Requires the classifications:write scope.",
        inputSchema: updateClassificationStatusInputSchema,
      },
      async (args, extra) => updateClassificationStatus(args, extra.authInfo)
    );

    server.registerTool(
      "list_tickets",
      {
        title: "List Tickets",
        description: "List client support tickets. Requires the tickets:read scope.",
        inputSchema: listTicketsInputSchema,
      },
      async (args, extra) => listTickets(args, extra.authInfo)
    );

    server.registerTool(
      "run_orchestration",
      {
        title: "Run Orchestration",
        description:
          "Run the automation pipeline on a task: classify → enumerate sub-tasks → lane routing → Sanity execution (lane 1) or queue (lane 2/3). Requires the orchestration:run scope.",
        inputSchema: runOrchestrationInputSchema,
      },
      async (args, extra) => runOrchestrationTool(args, extra.authInfo)
    );
  },
  {
    serverInfo: { name: "webriq-central-hub", version: "0.1.0" },
  },
  {
    // mcp-handler dispatches internally on url.pathname === streamableHttpEndpoint,
    // which defaults to "/mcp" — it does NOT infer this from the route file's own
    // location. Without basePath, an authenticated request to our actual mount
    // point (/api/mcp) passes withMcpAuth's auth check, then 404s inside the
    // library's own dispatcher because "/api/mcp" !== "/mcp". basePath: "/api"
    // makes it derive "/api/mcp" instead. (task 181 — see Implementation Notes.)
    basePath: "/api",
    // Streamable HTTP only — mounted at a fixed path, not app/[transport]/route.ts,
    // so SSE's separate endpoint convention doesn't apply here.
    disableSse: true,
  }
);

const authHandler = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST };
