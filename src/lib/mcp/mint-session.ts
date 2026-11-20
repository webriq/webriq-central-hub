import { createClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";

// Task 488 — every MCP consent gets its OWN Supabase session (own refresh-token
// family), never the browser login's token. Sharing one token between the hub tab
// and MCP tool calls meant each side spent the other's token, and Supabase's reuse
// detection could then revoke the whole session.
//
// generateLink (no email is sent) → verifyOtp on a throwaway, non-persisting client
// yields a fresh session. Same pattern as the recovery flow in (auth)/actions.ts.
// force_logout_user / force_logout_all_except delete all of a user's sessions, so
// deactivation still cuts MCP access. Never log the returned token.
export async function mintMcpSupabaseSession(userId: string): Promise<{ refreshToken: string }> {
  const { data: userData, error: userErr } = await adminClient.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (userErr || !email) {
    throw new Error(`user lookup failed: ${userErr?.message ?? "no email on user"}`);
  }

  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    throw new Error(`generateLink failed: ${linkErr?.message ?? "no hashed_token"}`);
  }

  const bootstrapClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: otpData, error: otpErr } = await bootstrapClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  const session = otpData?.session;
  if (otpErr || !session) {
    throw new Error(`verifyOtp failed: ${otpErr?.message ?? "no session returned"}`);
  }
  if (session.user.id !== userId) {
    throw new Error("minted session belongs to a different user");
  }

  return { refreshToken: session.refresh_token };
}
