"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { generateToken } from "@/lib/mcp/pkce";
import {
  clientRedirectUrl,
  grantableScopes,
  isValidCodeChallenge,
  loadRegisteredClient,
  splitScopes,
} from "@/lib/mcp/authorize-request";
import { mintMcpSupabaseSession } from "@/lib/mcp/mint-session";

const AUTHORIZATION_CODE_TTL_MS = 60_000;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

// Task 488 — nothing from the posted form is trusted: the client, its redirect_uri,
// the PKCE challenge and the scopes are all re-validated here, because the hidden
// inputs the consent page rendered can be edited before submit.
export async function approveConsent(formData: FormData) {
  const clientId = field(formData, "client_id");
  const redirectUri = field(formData, "redirect_uri");
  const state = field(formData, "state");
  const codeChallenge = field(formData, "code_challenge");
  const postedScopes = splitScopes(field(formData, "scopes"));

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/auth/login");
  const userId = claims.claims.sub as string;

  const client = await loadRegisteredClient(clientId, redirectUri);
  if (!client || !isValidCodeChallenge(codeChallenge)) redirect("/dashboard");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  const scopes = grantableScopes(postedScopes, profile?.role ?? "client");
  if (scopes.length === 0) {
    redirect(clientRedirectUrl(redirectUri, { error: "access_denied", state }));
  }

  // A separate Supabase session for this connection — never the browser's token,
  // and no fallback to it if minting fails (see mint-session.ts).
  let refreshToken: string | null = null;
  try {
    ({ refreshToken } = await mintMcpSupabaseSession(userId));
  } catch (err) {
    console.error("[mcp-consent] session mint failed:", err instanceof Error ? err.message : err);
  }
  if (!refreshToken) {
    redirect(clientRedirectUrl(redirectUri, { error: "server_error", state }));
  }

  const code = generateToken();
  const { error } = await adminClient.from("mcp_oauth_authorization_codes").insert({
    code,
    client_id: client.client_id,
    user_id: userId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    scopes,
    supabase_refresh_token: refreshToken,
    expires_at: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS).toISOString(),
  });

  if (error) {
    console.error("[mcp-consent] authorization code insert failed:", error.message);
    redirect(clientRedirectUrl(redirectUri, { error: "server_error", state }));
  }

  redirect(clientRedirectUrl(redirectUri, { code, state }));
}

export async function denyConsent(formData: FormData) {
  const clientId = field(formData, "client_id");
  const redirectUri = field(formData, "redirect_uri");
  const state = field(formData, "state");

  // Only bounce back to a redirect_uri this client actually registered —
  // otherwise this action is an open redirect.
  const client = await loadRegisteredClient(clientId, redirectUri);
  if (!client) redirect("/dashboard");

  redirect(clientRedirectUrl(redirectUri, { error: "access_denied", state }));
}
