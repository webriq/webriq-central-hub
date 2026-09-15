import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { sendHubInviteEmail } from "@/lib/email/mailer";
import { VALID_ROLES, ROLE_DISPLAY, PROFILE_ROLE, type ValidRole } from "@/lib/auth/hub-role-map";
import { DEPARTMENT_INVITE_ROLES, type DepartmentName } from "@/lib/auth/department-map";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Creates a brand-new Hub user (no prior sign-in / hub_users row) and immediately sends
// the same recovery-link invite the per-row "Send Invite" button sends (task 365).
//
// `on_auth_user_created` (migration 026 repointed it to the profiles-only handle_new_user())
// is dead, but a SECOND trigger from migration 008 — `on_auth_user_updated`, firing on any
// auth.users.raw_user_meta_data change — was never dropped and still points at
// handle_new_hub_user(). Live testing (task 366) showed adminClient.auth.admin.createUser()
// triggers it (GoTrue appears to update raw_user_meta_data right after insert), so a
// hub_users row for the new id can already exist (via that function's own ON CONFLICT DO
// UPDATE) by the time this route's own insert below runs. Hence upsert, not insert — this
// route's values must win regardless of whether that trigger got there first.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: callerProfile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const callerRole = callerProfile?.role;
  if (callerRole !== "admin" && callerRole !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as { email?: string; role?: string; fullName?: string; departmentId?: string };

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  if (!body.departmentId) {
    return NextResponse.json({ error: "Select a department." }, { status: 400 });
  }
  const { data: department } = await adminClient
    .from("departments")
    .select("id, name")
    .eq("id", body.departmentId)
    .maybeSingle();
  if (!department) {
    return NextResponse.json({ error: "Invalid department." }, { status: 400 });
  }
  const departmentName = department.name as DepartmentName;

  if (!body.role || !(VALID_ROLES as readonly string[]).includes(body.role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  const role = body.role as ValidRole;
  if (!DEPARTMENT_INVITE_ROLES[departmentName].includes(role)) {
    return NextResponse.json(
      { error: `"${ROLE_DISPLAY[role]}" isn't available for the ${departmentName} department.` },
      { status: 400 }
    );
  }
  if (role === "super_admin" && callerRole !== "super_admin") {
    return NextResponse.json({ error: "Only a Super Admin can invite Super Admin users." }, { status: 403 });
  }

  const fullName = body.fullName?.trim() || null;

  // Pre-check for an existing hub_users row — friendlier than surfacing the raw
  // Supabase Auth "already registered" error.
  const { data: existing } = await adminClient
    .from("hub_users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
  }

  // No password set here — the person sets their own via the recovery-link invite
  // email below, same as every other invite path on this page.
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role: PROFILE_ROLE[role],
    },
  });

  if (createErr || !created.user) {
    const message = createErr?.message ?? "Failed to create user.";
    const status = /already|registered|exists/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: status === 409 ? "A user with this email already exists." : message }, { status });
  }

  const newUserId = created.user.id;

  const nameParts = (fullName ?? "").split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || null;
  const lastName = nameParts.slice(1).join(" ") || null;

  const { error: hubUsersErr } = await adminClient
    .from("hub_users")
    .upsert(
      {
        id: newUserId,
        email,
        first_name: firstName,
        last_name: lastName,
        role: ROLE_DISPLAY[role],
        status: "active",
        is_invited: false,
      },
      { onConflict: "id" }
    );

  if (hubUsersErr) {
    console.error("[hub-users/invite] hub_users upsert failed:", hubUsersErr.message, hubUsersErr);
    // Safe to fully roll back — whether or not a hub_users row exists yet for this
    // brand-new id, deleting the just-created auth user cascades to it (migration
    // 007: hub_users.id references auth.users(id) on delete cascade).
    await adminClient.auth.admin.deleteUser(newUserId);
    return NextResponse.json({ error: "Failed to create user record." }, { status: 500 });
  }

  // Belt-and-suspenders — user_metadata.role already seeded this via handle_new_user(),
  // but set it explicitly so this route doesn't silently depend on trigger internals.
  await adminClient
    .from("profiles")
    .update({ role: PROFILE_ROLE[role], full_name: fullName, department_id: department.id })
    .eq("id", newUserId);

  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  const hashedToken = linkData?.properties?.hashed_token;

  if (linkErr || !hashedToken) {
    console.error("[hub-users/invite] generateLink error:", linkErr?.message);
    return NextResponse.json(
      { error: "User created, but the invite email failed to generate. Use \"Send Invite\" on their row to retry." },
      { status: 500 }
    );
  }

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/register?token_hash=${hashedToken}&type=recovery`;

  try {
    await sendHubInviteEmail(email, firstName ?? email.split("@")[0], inviteUrl);
  } catch (emailErr) {
    console.error("[hub-users/invite] sendHubInviteEmail failed:", emailErr);
    return NextResponse.json(
      { error: "User created, but the invite email failed to send. Use \"Send Invite\" on their row to retry." },
      { status: 500 }
    );
  }

  await adminClient.from("hub_users").update({ is_invited: true }).eq("id", newUserId);

  return NextResponse.json({
    user: {
      id: newUserId,
      email,
      first_name: firstName,
      last_name: lastName,
      role: ROLE_DISPLAY[role],
      profile_role: PROFILE_ROLE[role],
      full_name: fullName,
      avatar_url: null,
      department_id: department.id,
      department_name: department.name,
      status: "active",
      is_invited: true,
      joined_at: null,
      external_id: null,
      created_at: new Date().toISOString(),
      otp_locked_until: null,
    },
  });
}
