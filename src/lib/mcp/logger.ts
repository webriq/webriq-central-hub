import { adminClient } from "@/lib/supabase/admin";

type InvokeMcpToolParams = {
  userId?: string | null;
  clientId?: string | null;
  toolName: string;
  scopesUsed?: string[];
  durationMs: number;
  status?: "success" | "error" | "unauthorized";
  errorMessage?: string;
};

// Mirrors logLLMInvocation() — audit trail of who called which MCP tool.
export async function invokeMCPTool(params: InvokeMcpToolParams): Promise<void> {
  const { error } = await adminClient.from("mcp_tool_invocation_logs").insert({
    user_id: params.userId ?? null,
    client_id: params.clientId ?? null,
    tool_name: params.toolName,
    scopes_used: params.scopesUsed ?? null,
    status: params.status ?? "success",
    error_message: params.errorMessage ?? null,
    duration_ms: params.durationMs,
  });

  if (error) {
    // Non-fatal — log to stderr but never throw; we must not disrupt the tool call
    console.error("[mcp-logger] failed to write invocation log:", error.message);
  }
}
