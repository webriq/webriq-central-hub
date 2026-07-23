import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyMcpToken } from "@/lib/mcp/verify-token";
import { getProjectStatus, getProjectStatusInputSchema } from "@/lib/mcp/tools/get-project-status";
import { listOpenTasks, listOpenTasksInputSchema } from "@/lib/mcp/tools/list-open-tasks";

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
