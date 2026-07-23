"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { generateToken } from "@/lib/mcp/pkce";

const AUTHORIZATION_CODE_TTL_MS = 60_000;

export async function approveConsent(formData: FormData) {
  const clientId = formData.get("client_id") as string;
  const redirectUri = formData.get("redirect_uri") as string;
  const state = (formData.get("state") as string) ?? "";
  const codeChallenge = formData.get("code_challenge") as string;
  const scopes = ((formData.get("scopes") as string) ?? "").split(" ").filter(Boolean);

  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const { data: claims } = await supabase.auth.getClaims();

  if (!sessionData.session || !claims?.claims) {
    redirect("/v2/auth/login");
  }

  const code = generateToken();

  // Captures the user's live Supabase refresh token at consent time — this is
  // what lets every later MCP tool call run RLS-scoped as this user instead of
  // through adminClient. See _docs/task/181-remote-mcp-server-oauth-scaffold.md.
  const { error } = await adminClient.from("mcp_oauth_authorization_codes").insert({
    code,
    client_id: clientId,
    user_id: claims.claims.sub as string,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    scopes,
    supabase_refresh_token: sessionData.session.refresh_token,
    expires_at: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS).toISOString(),
  });

  if (error) {
    redirect(`${redirectUri}?error=server_error&state=${encodeURIComponent(state)}`);
  }

  redirect(`${redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
}

export async function denyConsent(formData: FormData) {
  const redirectUri = formData.get("redirect_uri") as string;
  const state = (formData.get("state") as string) ?? "";
  redirect(`${redirectUri}?error=access_denied&state=${encodeURIComponent(state)}`);
}
