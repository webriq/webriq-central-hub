import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { sendHubInviteEmail } from "@/lib/email/mailer";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  // Auth + v2 admin guard (profiles.role, not hub_users.role)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: callerProfile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerProfile?.role !== "admin" && callerProfile?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch target user
  const { data: target } = await adminClient
    .from("hub_users")
    .select("email, first_name, last_name, role, is_invited")
    .eq("id", userId)
    .single();

  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!target.role) return NextResponse.json({ error: "Assign a role before sending invite" }, { status: 400 });

  // Generate a recovery token. We extract hashed_token and build the invite URL
  // ourselves so we don't depend on Supabase redirect URL allowlist configuration.
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email: target.email,
  });

  const hashedToken = linkData?.properties?.hashed_token;
  if (linkErr || !hashedToken) {
    console.error("[hub-invite] generateLink error:", linkErr?.message);
    return NextResponse.json({ error: "Failed to generate invite link" }, { status: 500 });
  }

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/v2/auth/register?token_hash=${hashedToken}&type=recovery`;

  await sendHubInviteEmail(
    target.email,
    target.first_name ?? target.email.split("@")[0],
    inviteUrl
  );

  await adminClient
    .from("hub_users")
    .update({ is_invited: true })
    .eq("id", userId);

  return NextResponse.json({ ok: true });
}
