import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { withUserScopedClient } from "@/lib/mcp/user-scoped-client";
import { invokeMCPTool } from "@/lib/mcp/logger";
import type { McpAuthInfoExtra } from "@/lib/mcp/verify-token";

type ToolHandler<T> = (client: SupabaseClient<Database>, userId: string) => Promise<T>;

// Shared wrapper for every MCP tool: enforces the required scope, runs the
// handler under an RLS-scoped client (never adminClient), and logs the call
// via invokeMCPTool() regardless of outcome.
export async function runScopedTool<T>(
  toolName: string,
  requiredScope: string,
  authInfo: AuthInfo | undefined,
  handler: ToolHandler<T>
): Promise<T> {
  const started = Date.now();
  const extra = authInfo?.extra as McpAuthInfoExtra | undefined;

  if (!authInfo || !extra) {
    await invokeMCPTool({
      toolName,
      status: "unauthorized",
      errorMessage: "missing auth info",
      durationMs: Date.now() - started,
    });
    throw new Error("Unauthorized: no valid session for this tool call.");
  }

  if (!authInfo.scopes.includes(requiredScope)) {
    await invokeMCPTool({
      userId: extra.supabaseUserId,
      clientId: authInfo.clientId,
      toolName,
      scopesUsed: authInfo.scopes,
      status: "unauthorized",
      errorMessage: `missing required scope: ${requiredScope}`,
      durationMs: Date.now() - started,
    });
    throw new Error(`Unauthorized: missing required scope "${requiredScope}".`);
  }

  try {
    const result = await withUserScopedClient(extra.tokenRecordId, extra.supabaseRefreshToken, handler);
    await invokeMCPTool({
      userId: extra.supabaseUserId,
      clientId: authInfo.clientId,
      toolName,
      scopesUsed: authInfo.scopes,
      status: "success",
      durationMs: Date.now() - started,
    });
    return result;
  } catch (err) {
    await invokeMCPTool({
      userId: extra.supabaseUserId,
      clientId: authInfo.clientId,
      toolName,
      scopesUsed: authInfo.scopes,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    });
    throw err;
  }
}
