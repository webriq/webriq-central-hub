// dev-only import endpoint — reads _from_zoho/tasklists.json, upserts to tasklists table.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readFromZoho, resolveProjectId, resolveMilestoneId, adminClient, ImportResult } from "@/lib/migrate/zoho-import";

type ZohoTasklistRaw = {
  id?: string;
  id_string?: string;
  name?: string;
  sequence?: { project_sequence?: number; milestone_sequence?: number } | number;
  is_default?: boolean;
  _zoho_project_id?: string;
  milestone?: { id?: string; id_string?: string; name?: string };
  meta_info?: { is_none_milestone_tasklist?: boolean };
  [key: string]: unknown;
};

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let tasklists: ZohoTasklistRaw[];
  try {
    tasklists = readFromZoho<ZohoTasklistRaw>("tasklists.json");
  } catch {
    return NextResponse.json({ error: "Could not read _from_zoho/tasklists.json" }, { status: 400 });
  }

  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };

  for (const tl of tasklists) {
    const externalId = String(tl.id_string ?? tl.id ?? "");
    if (!externalId || !tl.name) { result.skipped++; continue; }

    const projectId = await resolveProjectId(String(tl._zoho_project_id ?? ""));
    if (!projectId) {
      result.errors.push(`tasklist ${externalId}: no Hub project found for zoho_project_id=${tl._zoho_project_id}`);
      result.skipped++;
      continue;
    }

    // Zoho returns sequence as an object; use project_sequence for sort order.
    const position = typeof tl.sequence === "object"
      ? (tl.sequence?.project_sequence ?? null)
      : (tl.sequence ?? null);

    // Tasklists with is_none_milestone_tasklist or milestone.name "None" have no real milestone.
    const isNoneMilestone =
      tl.meta_info?.is_none_milestone_tasklist === true ||
      tl.milestone?.name === "None";
    const milestoneExternalId = !isNoneMilestone
      ? String(tl.milestone?.id_string ?? tl.milestone?.id ?? "")
      : "";
    const milestoneId = milestoneExternalId ? await resolveMilestoneId(milestoneExternalId) : null;

    const { error } = await adminClient.from("tasklists").upsert(
      {
        external_id: externalId,
        project_id: projectId,
        name: tl.name,
        position,
        is_default: tl.is_default ?? false,
        milestone_id: milestoneId,
      },
      { onConflict: "external_id" }
    );

    if (error) {
      result.errors.push(`tasklist ${externalId}: ${error.message}`);
    } else {
      result.imported++;
    }
  }

  return NextResponse.json(result);
}
