import { MCP_SCOPES, allowedScopesForRole, type McpScope } from "@/lib/mcp/scopes";
import type { ProfileRow } from "@/types/database";

// Pure consent rules (task 488) — no I/O, so _docs/task/488-mcp-authorize.check.ts
// can import them. The DB-backed client check lives in authorize-request.ts.

function isMcpScope(scope: string): scope is McpScope {
  return (MCP_SCOPES as readonly string[]).includes(scope);
}

// Requested ∩ known scopes ∩ what the role may grant, de-duplicated, request order kept.
export function grantableScopes(requested: string[], role: ProfileRow["role"]): McpScope[] {
  const allowed = allowedScopesForRole(role);
  return [...new Set(requested)].filter(
    (scope): scope is McpScope => isMcpScope(scope) && allowed.includes(scope)
  );
}

export function splitScopes(raw: string | null | undefined): string[] {
  return (raw ?? "").split(" ").filter(Boolean);
}

// RFC 7636: S256 challenge is base64url, 43–128 chars.
export function isValidCodeChallenge(challenge: string | undefined | null): boolean {
  return typeof challenge === "string" && /^[A-Za-z0-9_-]{43,128}$/.test(challenge);
}

// Appends params without clobbering a query string the registered URI already has.
export function clientRedirectUrl(redirectUri: string, params: Record<string, string>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}
