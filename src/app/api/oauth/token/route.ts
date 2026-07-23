import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { generateToken, hashToken, verifyPkceChallenge } from "@/lib/mcp/pkce";

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: NextRequest) {
  const body = await parseBody(req);
  const grantType = body.grant_type as string | undefined;

  if (grantType === "authorization_code") {
    return handleAuthorizationCodeGrant(body);
  }
  if (grantType === "refresh_token") {
    return handleRefreshTokenGrant(body);
  }

  return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
}

async function parseBody(req: NextRequest): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await req.json().catch(() => ({}))) as Record<string, unknown>;
  }
  const formData = await req.formData().catch(() => new FormData());
  return Object.fromEntries(formData.entries());
}

async function handleAuthorizationCodeGrant(body: Record<string, unknown>) {
  const code = body.code as string | undefined;
  const codeVerifier = body.code_verifier as string | undefined;
  const redirectUri = body.redirect_uri as string | undefined;

  if (!code || !codeVerifier || !redirectUri) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data: authCode } = await adminClient
    .from("mcp_oauth_authorization_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (
    !authCode ||
    authCode.used_at ||
    new Date(authCode.expires_at).getTime() <= Date.now() ||
    authCode.redirect_uri !== redirectUri
  ) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  if (!verifyPkceChallenge(codeVerifier, authCode.code_challenge)) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "PKCE verification failed" },
      { status: 400 }
    );
  }

  // Mark used immediately so the code cannot be replayed.
  await adminClient
    .from("mcp_oauth_authorization_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code", code);

  return issueTokenPair({
    clientId: authCode.client_id,
    userId: authCode.user_id,
    scopes: authCode.scopes,
    supabaseRefreshToken: authCode.supabase_refresh_token,
  });
}

async function handleRefreshTokenGrant(body: Record<string, unknown>) {
  const refreshToken = body.refresh_token as string | undefined;
  if (!refreshToken) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data: tokenRow } = await adminClient
    .from("mcp_oauth_tokens")
    .select("*")
    .eq("refresh_token_hash", hashToken(refreshToken))
    .maybeSingle();

  if (!tokenRow || tokenRow.revoked_at) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  // Rotate: revoke the old token record, issue a fresh pair carrying the same
  // (possibly since-rotated by a tool call) Supabase refresh token forward.
  await adminClient
    .from("mcp_oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  return issueTokenPair({
    clientId: tokenRow.client_id,
    userId: tokenRow.user_id,
    scopes: tokenRow.scopes,
    supabaseRefreshToken: tokenRow.supabase_refresh_token,
  });
}

async function issueTokenPair(params: {
  clientId: string;
  userId: string;
  scopes: string[];
  supabaseRefreshToken: string;
}) {
  const accessToken = generateToken();
  const refreshToken = generateToken();
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);

  const { error } = await adminClient.from("mcp_oauth_tokens").insert({
    access_token_hash: hashToken(accessToken),
    refresh_token_hash: hashToken(refreshToken),
    client_id: params.clientId,
    user_id: params.userId,
    scopes: params.scopes,
    supabase_refresh_token: params.supabaseRefreshToken,
    access_token_expires_at: expiresAt.toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: "server_error", error_description: error.message }, { status: 500 });
  }

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refreshToken,
    scope: params.scopes.join(" "),
  });
}
