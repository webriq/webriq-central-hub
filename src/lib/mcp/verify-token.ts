import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { adminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/mcp/pkce";

export type McpAuthInfoExtra = {
  tokenRecordId: string;
  supabaseUserId: string;
  supabaseRefreshToken: string;
};

// Passed to withMcpAuth — verifies the bearer token against mcp_oauth_tokens
// (never the Supabase session itself; that's derived lazily per tool call
// from the stored supabase_refresh_token, see user-scoped-client.ts).
export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const tokenHash = hashToken(bearerToken);

  const { data: tokenRow, error } = await adminClient
    .from("mcp_oauth_tokens")
    .select("id, client_id, user_id, scopes, supabase_refresh_token, access_token_expires_at, revoked_at")
    .eq("access_token_hash", tokenHash)
    .maybeSingle();

  // A genuine query failure (bad key, RLS misconfig, missing table) must not
  // look identical to "token not found" in the logs — both currently 401 the
  // same way to the client (that part is correct), but only one of them is a
  // config problem worth knowing about.
  if (error) {
    console.error("[mcp-verify-token] mcp_oauth_tokens lookup failed:", error.message);
    return undefined;
  }
  if (!tokenRow) return undefined;
  if (tokenRow.revoked_at) return undefined;
  if (new Date(tokenRow.access_token_expires_at).getTime() <= Date.now()) return undefined;

  const extra: McpAuthInfoExtra = {
    tokenRecordId: tokenRow.id,
    supabaseUserId: tokenRow.user_id,
    supabaseRefreshToken: tokenRow.supabase_refresh_token,
  };

  return {
    token: bearerToken,
    clientId: tokenRow.client_id,
    scopes: tokenRow.scopes,
    expiresAt: Math.floor(new Date(tokenRow.access_token_expires_at).getTime() / 1000),
    extra,
  };
}
