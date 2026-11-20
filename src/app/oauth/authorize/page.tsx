import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthSplitShell } from "@/components/auth/auth-split-shell";
import { MCP_SCOPE_DESCRIPTIONS } from "@/lib/mcp/scopes";
import {
  grantableScopes,
  isValidCodeChallenge,
  loadRegisteredClient,
  splitScopes,
} from "@/lib/mcp/authorize-request";
import { approveConsent, denyConsent } from "./actions";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function asString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OAuthAuthorizePage({ searchParams }: PageProps) {
  const params = await searchParams;

  const responseType = asString(params.response_type);
  const clientId = asString(params.client_id);
  const redirectUri = asString(params.redirect_uri);
  const state = asString(params.state);
  const codeChallenge = asString(params.code_challenge);
  const codeChallengeMethod = asString(params.code_challenge_method) ?? "S256";
  const requestedScope = asString(params.scope) ?? "";

  // Same challenge-format check approveConsent applies (task 488), so a malformed
  // request fails here instead of after the user clicks Approve.
  if (responseType !== "code" || !clientId || !redirectUri || !isValidCodeChallenge(codeChallenge)) {
    return (
      <AuthSplitShell
        title="Invalid Request"
        subtitle="This authorization request is missing required parameters."
      >
        <p className="text-sm text-muted-foreground">
          Missing one or more of: response_type=code, client_id, redirect_uri, code_challenge.
        </p>
      </AuthSplitShell>
    );
  }

  if (codeChallengeMethod !== "S256") {
    return (
      <AuthSplitShell title="Unsupported PKCE Method" subtitle="Only S256 code_challenge_method is supported.">
        <p className="text-sm text-muted-foreground">
          The connecting client requested &ldquo;{codeChallengeMethod}&rdquo;, which this server does not support.
        </p>
      </AuthSplitShell>
    );
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    const query = new URLSearchParams(
      Object.entries(params).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : []))
    ).toString();
    // postLoginGate() only trusts a returnTo that's a same-site relative path
    // (open-redirect guard) — this route's own root-relative path satisfies that.
    redirect(`/auth/login?returnTo=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }

  const userId = claims.claims.sub as string;

  const client = await loadRegisteredClient(clientId, redirectUri);

  if (!client) {
    return (
      <AuthSplitShell
        title="Unknown Connector"
        subtitle="This app isn't registered, or its redirect URL doesn't match what's on file."
      >
        <p className="text-sm text-muted-foreground">
          Ask the connecting client to reconnect — its registration may be out of date.
        </p>
      </AuthSplitShell>
    );
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();

  const requestedScopes = splitScopes(requestedScope);
  const scopesToGrant = grantableScopes(requestedScopes, profile?.role ?? "client");
  const deniedScopes = requestedScopes.filter((scope) => !(scopesToGrant as string[]).includes(scope));

  return (
    <AuthSplitShell
      title="Authorize Access"
      subtitle={`"${client.client_name}" wants to connect to your WebriQ Central Hub account.`}
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">This will allow {client.client_name} to:</p>
          {scopesToGrant.length > 0 ? (
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {scopesToGrant.map((scope) => (
                <li key={scope} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#007BFF]" />
                  {MCP_SCOPE_DESCRIPTIONS[scope]}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing — your role doesn&apos;t have access to any of the scopes this client requested.
            </p>
          )}
        </div>

        {deniedScopes.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Not granted (your role doesn&apos;t have access): {deniedScopes.join(", ")}
          </p>
        )}

        <div className="space-y-3">
          <form action={approveConsent}>
            <input type="hidden" name="client_id" value={clientId} />
            <input type="hidden" name="redirect_uri" value={redirectUri} />
            <input type="hidden" name="state" value={state ?? ""} />
            <input type="hidden" name="code_challenge" value={codeChallenge} />
            <input type="hidden" name="scopes" value={scopesToGrant.join(" ")} />
            <button
              type="submit"
              disabled={scopesToGrant.length === 0}
              className="w-full rounded-lg bg-[#FB914E] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#e8813f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Approve
            </button>
          </form>

          <form action={denyConsent}>
            <input type="hidden" name="client_id" value={clientId} />
            <input type="hidden" name="redirect_uri" value={redirectUri} />
            <input type="hidden" name="state" value={state ?? ""} />
            <button
              type="submit"
              className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Deny
            </button>
          </form>
        </div>
      </div>
    </AuthSplitShell>
  );
}
