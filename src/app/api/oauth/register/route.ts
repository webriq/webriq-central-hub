import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { adminClient } from "@/lib/supabase/admin";

// Dynamic Client Registration (RFC 7591) — MCP clients (e.g. Claude's custom
// connector flow) self-register before starting the OAuth handshake. Public
// clients only (PKCE, no client secret) — token_endpoint_auth_method: "none".
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || !Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "redirect_uris is required" },
      { status: 400 }
    );
  }

  const clientId = randomUUID();
  const clientName = typeof body.client_name === "string" ? body.client_name : "Unnamed MCP Client";

  const { error } = await adminClient.from("mcp_oauth_clients").insert({
    client_id: clientId,
    client_name: clientName,
    redirect_uris: body.redirect_uris,
    token_endpoint_auth_method: "none",
  });

  if (error) {
    return NextResponse.json({ error: "server_error", error_description: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: body.redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201 }
  );
}
