import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { assignZohoTask, getZohoProjectUsers, sendCliqNotification } from "@/lib/zoho";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await adminClient
    .from("hub_users")
    .select("external_id, first_name, last_name")
    .eq("id", user.id)
    .single();

  const body = (await req.json()) as {
    projectId: string;
    taskId: string;
    taskName: string;
    projectName: string;
  };

  const email = user.email ?? "";
  if (!email) {
    return NextResponse.json({ error: "no_email" }, { status: 400 });
  }

  const projectUsers = await getZohoProjectUsers(body.projectId);
  const zpuid = projectUsers[email.toLowerCase()];
  if (!zpuid) {
    return NextResponse.json({ error: "no_zpuid", hint: `${email} not found in project ${body.projectId}` }, { status: 400 });
  }

  const portalId = process.env.ZOHO_PORTAL_ID ?? "";
  const isAssigned = await assignZohoTask(portalId, body.projectId, body.taskId, zpuid);

  if (!isAssigned) {
    return NextResponse.json({ ok: false, error: "assign_failed" }, { status: 502 });
  }

  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "A developer";
  const portalName = process.env.NEXT_PUBLIC_ZOHO_PORTAL_NAME ?? "";
  const taskLink = `https://projects.zoho.com/portal/${portalName}#zp/task-detail/${body.taskId}/`;
  await sendCliqNotification(
    `@${displayName}\nSelf-assigned: ${body.taskName}\n${taskLink}`,
    "pm"
  );

  return NextResponse.json({ ok: true });
}
