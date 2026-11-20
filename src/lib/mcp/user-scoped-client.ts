import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

// Never adminClient for tool data reads — every MCP tool call must run RLS-scoped
// as the connecting user. We re-derive a live Supabase session from the refresh
// token captured at OAuth consent time, then hand the caller a client authenticated
// as that user via the Authorization header (not cookies — there's no browser here).
export async function withUserScopedClient<T>(
  supabaseRefreshToken: string,
  handler: (client: SupabaseClient<Database>, userId: string) => Promise<T>
): Promise<T> {
  const bootstrapClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await bootstrapClient.auth.refreshSession({
    refresh_token: supabaseRefreshToken,
  });

  if (error || !data.session) {
    throw new Error(`mcp: failed to refresh user session: ${error?.message ?? "no session returned"}`);
  }

  // Supabase rotates the refresh token on every use — the one we were just given
  // is already spent. Persist the new one immediately so the *next* tool call
  // doesn't get rejected with a consumed token.
  //
  // Task 488 — written to every row holding the old value, not just the row this
  // call came in on: an MCP refresh grant may have rotated this row into a new one
  // mid-call, and that new row must not keep the spent token. Since each consent
  // now mints its own Supabase session, the token value identifies the lineage.
  const { error: rotateErr } = await adminClient
    .from("mcp_oauth_tokens")
    .update({ supabase_refresh_token: data.session.refresh_token })
    .eq("supabase_refresh_token", supabaseRefreshToken);
  if (rotateErr) {
    console.error("[mcp-user-scoped-client] failed to persist rotated refresh token:", rotateErr.message);
  }

  const scopedClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      },
    }
  );

  return handler(scopedClient, data.session.user.id);
}
