// dev-only import endpoint — reads _from_zoho/tasks.json, upserts to tasks table.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  readFromZoho,
  resolveProjectId,
  resolveTasklistId,
  resolveUserId,
  buildUserCache,
  clearUserCache,
  mapPriority,
  mapTaskStatus,
  adminClient,
  ImportResult,
} from "@/lib/migrate/zoho-import";

type ZohoTaskRaw = {
  id?: string;
  id_string?: string;
  name?: string;
  description?: string;
  priority?: string;
  status?: { name?: string };
  completed?: boolean;
  is_completed?: boolean;
  due_date?: string;
  end_date?: string;
  start_date?: string;
  tasklist?: { id?: string; id_string?: string };
  owners_and_work?: { owners?: Array<{ email?: string; name?: string }> };
  _zoho_project_id?: string;
  [key: string]: unknown;
};

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let tasks: ZohoTaskRaw[];
  try {
    tasks = readFromZoho<ZohoTaskRaw>("tasks.json");
  } catch {
    return NextResponse.json({ error: "Could not read _from_zoho/tasks.json" }, { status: 400 });
  }

  clearUserCache();
  const userCache = await buildUserCache();
  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };

  for (const t of tasks) {
    const externalId = String(t.id_string ?? t.id ?? "");
    if (!externalId || !t.name) { result.skipped++; continue; }

    const projectId = await resolveProjectId(String(t._zoho_project_id ?? ""));
    if (!projectId) { result.skipped++; continue; }

    const zohoTasklistId = t.tasklist?.id_string ?? t.tasklist?.id;
    const tasklistId = zohoTasklistId
      ? await resolveTasklistId(String(zohoTasklistId))
      : null;

    const owners = t.owners_and_work?.owners ?? [];
    const assignees: string[] = [];
    for (const owner of owners) {
      const uid = await resolveUserId(owner.email, userCache);
      if (uid) assignees.push(uid);
    }

    const isCompleted = !!(t.completed ?? t.is_completed ?? false);

    const { error } = await adminClient.from("tasks").upsert(
      {
        external_id: externalId,
        project_id: projectId,
        tasklist_id: tasklistId,
        title: t.name,
        description: t.description ?? null,
        priority: mapPriority(t.priority ?? ""),
        status: mapTaskStatus(t.status?.name ?? "", isCompleted),
        due_date: t.due_date ?? t.end_date ?? null,
        start_date: t.start_date ?? null,
        assignees: assignees.length > 0 ? assignees : null,
      },
      { onConflict: "external_id" }
    );

    if (error) {
      result.errors.push(`task ${externalId}: ${error.message}`);
    } else {
      result.imported++;
    }
  }

  return NextResponse.json(result);
}
