import { NextResponse } from "next/server";
import { MCP_SCOPES } from "@/lib/mcp/scopes";

// RFC 8414 Authorization Server Metadata — mcp-handler only ships a helper for
// the *protected resource* side (protectedResourceHandler); the AS metadata
// document is ours to serve since we are the authorization server.
export async function GET() {
  const issuer = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return NextResponse.json({
    issuer,
    authorization_endpoint: `${issuer}/v2/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    registration_endpoint: `${issuer}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: MCP_SCOPES,
  });
}
