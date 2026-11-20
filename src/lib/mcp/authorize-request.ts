import { adminClient } from "@/lib/supabase/admin";

// Shared by the consent page and its Server Actions (task 488) — the actions must
// never trust the hidden form fields the page rendered, so every check lives here
// (and in the pure authorize-rules.ts, re-exported below) and both sides call it.
export { clientRedirectUrl, grantableScopes, isValidCodeChallenge, splitScopes } from "@/lib/mcp/authorize-rules";

export type RegisteredClient = { client_id: string; client_name: string };

// Exact-match redirect_uri against the client's registration (no prefix matching).
export async function loadRegisteredClient(
  clientId: string | undefined | null,
  redirectUri: string | undefined | null
): Promise<RegisteredClient | null> {
  if (!clientId || !redirectUri) return null;
  // Registration doesn't validate URIs; an unparseable one could never be redirected to.
  if (!URL.canParse(redirectUri)) return null;

  const { data: client, error } = await adminClient
    .from("mcp_oauth_clients")
    .select("client_id, client_name, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    console.error("[mcp-authorize] mcp_oauth_clients lookup failed:", error.message);
    return null;
  }
  if (!client || !client.redirect_uris.includes(redirectUri)) return null;
  return { client_id: client.client_id, client_name: client.client_name };
}
