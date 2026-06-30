import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

const VALID_ROLES = ["admin", "hr", "pm", "developer", "client", "other"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

const ROLE_DISPLAY: Record<ValidRole, string> = {
  admin: "Admin",
  hr: "HR",
  pm: "PM",
  developer: "Developer",
  client: "Client",
  other: "Other",
};

// "other" maps to "client" in profiles (closest enum value for non-standard roles)
const PROFILE_ROLE: Record<ValidRole, "admin" | "hr" | "pm" | "developer" | "client"> = {
  admin: "admin",
  hr: "hr",
  pm: "pm",
  developer: "developer",
  client: "client",
  other: "client",
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: callerProfile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerProfile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as { role?: string; status?: string };

  if (body.role !== undefined) {
    if (!(VALID_ROLES as readonly string[]).includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    const role = body.role as ValidRole;

    // Write to both tables atomically — profiles.role (auth enum) + hub_users.role (display string)
    const [profileRes, hubRes] = await Promise.all([
      adminClient.from("profiles").update({ role: PROFILE_ROLE[role] }).eq("id", userId),
      adminClient.from("hub_users").update({ role: ROLE_DISPLAY[role] }).eq("id", userId),
    ]);

    if (profileRes.error) return NextResponse.json({ error: profileRes.error.message }, { status: 500 });
    if (hubRes.error) return NextResponse.json({ error: hubRes.error.message }, { status: 500 });
  }

  if (body.status !== undefined) {
    const { error } = await adminClient
      .from("hub_users")
      .update({ status: body.status })
      .eq("id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
