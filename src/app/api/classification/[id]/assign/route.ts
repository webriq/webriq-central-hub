import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { assignZohoTask, getZohoProjectUsers, addZohoProjectUsers, sendCliqNotification } from "@/lib/zoho";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let developerIds: string[];
  try {
    const body = (await req.json()) as { developerIds?: string[] };
    if (!body.developerIds?.length)
      return NextResponse.json({ error: "developerIds required" }, { status: 400 });
    developerIds = body.developerIds;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Fetch all developer profiles and classification record in parallel
  const [developersResult, recordResult] = await Promise.all([
    adminClient
      .from("hub_users")
      .select("id, email, display_name")
      .in("id", developerIds),
    adminClient
      .from("classification_records")
      .select("zoho_task_id, customer_id, title")
      .eq("id", id)
      .single(),
  ]);

  const developers = developersResult.data ?? [];
  if (!developers.length) {
    return NextResponse.json({ error: "developer_not_found" }, { status: 400 });
  }
  if (!recordResult.data) {
    return NextResponse.json({ error: "record_not_found" }, { status: 404 });
  }
  if (!recordResult.data.zoho_task_id) {
    return NextResponse.json({ error: "no_zoho_task" }, { status: 400 });
  }

  const { zoho_task_id, customer_id, title } = recordResult.data;

  const { data: product } = await adminClient
    .from("customer_products")
    .select("zoho_project_id")
    .eq("customer_id", customer_id)
    .not("zoho_project_id", "is", null)
    .limit(1)
    .single();

  if (!product?.zoho_project_id) {
    return NextResponse.json({ error: "no_zoho_project" }, { status: 400 });
  }

  const projectId = product.zoho_project_id;
  const portalId = process.env.ZOHO_PORTAL_ID ?? "";

  // Resolve project-level zpuid for each developer; batch-add missing ones
  let projectUsers = await getZohoProjectUsers(projectId);
  const emailsToAdd = developers
    .map(d => d.email.toLowerCase())
    .filter(e => !projectUsers[e]);

  if (emailsToAdd.length) {
    const added = await addZohoProjectUsers(portalId, projectId, emailsToAdd);
    projectUsers = { ...projectUsers, ...added };
  }

  const zpuids = developers
    .map(d => projectUsers[d.email.toLowerCase()])
    .filter(Boolean) as string[];

  if (!zpuids.length) {
    return NextResponse.json({ error: "add_to_project_failed" }, { status: 502 });
  }

  const ok = await assignZohoTask(portalId, projectId, zoho_task_id, zpuids);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "assign_failed" }, { status: 502 });
  }

  const developerNames = developers.map(d => d.display_name ?? d.email);
  const portalName = process.env.NEXT_PUBLIC_ZOHO_PORTAL_NAME ?? "";
  const taskLink = `https://projects.zoho.com/portal/${portalName}#zp/task-detail/${zoho_task_id}/`;
  await sendCliqNotification(
    `${developerNames.map(n => `@${n}`).join(", ")}\nTask assigned: ${title}\n${taskLink}`
  );

  return NextResponse.json({ ok: true, developerNames });
}
