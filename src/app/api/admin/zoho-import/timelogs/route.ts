// dev-only import endpoint — reads _from_zoho/timelogs.json, upserts to time_logs.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  readFromZoho,
  resolveProjectId,
  resolveTaskId,
  resolveUserId,
  buildUserCache,
  clearUserCache,
  parseHours,
  adminClient,
  ImportResult,
} from "@/lib/migrate/zoho-import";

type ZohoTimelogRaw = {
  id?: string;
  log_hours?: string;
  log_date?: string;
  date?: string;
  billing_status?: string;
  note?: string;
  owner?: { name?: string; email?: string };
  task?: { id?: string; id_string?: string };
  _zoho_project_id?: string;
  [key: string]: unknown;
};

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let logs: ZohoTimelogRaw[];
  try {
    logs = readFromZoho<ZohoTimelogRaw>("timelogs.json");
  } catch {
    return NextResponse.json({ error: "Could not read _from_zoho/timelogs.json" }, { status: 400 });
  }

  clearUserCache();
  const userCache = await buildUserCache();
  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };

  for (const log of logs) {
    const externalId = String(log.id ?? "");
    const dateLogged = log.log_date ?? log.date ?? null;
    if (!externalId || !dateLogged) { result.skipped++; continue; }

    const projectId = await resolveProjectId(String(log._zoho_project_id ?? ""));
    if (!projectId) { result.skipped++; continue; }

    const zohoTaskId = log.task?.id_string ?? log.task?.id;
    const taskId = zohoTaskId ? await resolveTaskId(String(zohoTaskId)) : null;
    const employeeId = await resolveUserId(log.owner?.email, userCache);

    const { error } = await adminClient.from("time_logs").upsert(
      {
        external_id: externalId,
        task_id: taskId,
        project_id: projectId,
        employee_id: employeeId,
        owner_name: log.owner?.name ?? null,
        owner_email: log.owner?.email ?? null,
        date_logged: dateLogged,
        hours: parseHours(log.log_hours ?? "0:00"),
        billable: log.billing_status === "billable",
        note: log.note ?? null,
        source: "manual" as const,
      },
      { onConflict: "external_id" }
    );

    if (error) {
      result.errors.push(`timelog ${externalId}: ${error.message}`);
    } else {
      result.imported++;
    }
  }

  return NextResponse.json(result);
}
