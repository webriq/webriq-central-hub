// dev-only import endpoint — reads _from_zoho/tasklists.json, upserts to tasklists table.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readFromZoho, adminClient, ImportResult } from "@/lib/migrate/zoho-import";

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

type TasklistRow = {
  external_id: string;
  project_id: string;
  name: string;
  position: number | null;
  is_default: boolean;
  milestone_id: string | null;
};

const CHUNK_SIZE = 50;
const CHUNK_DELAY_MS = 100;

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

  // Pre-build lookup maps — two DB queries instead of one per row
  const { data: projectRows } = await adminClient.from("projects").select("id, zoho_project_id");
  const projectMap = new Map((projectRows ?? []).map((p) => [String(p.zoho_project_id), p.id]));

  const { data: milestoneRows } = await adminClient.from("milestones").select("id, external_id");
  const milestoneMap = new Map((milestoneRows ?? []).map((m) => [String(m.external_id), m.id]));

  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
  const rows: TasklistRow[] = [];

  for (const tl of tasklists) {
    const externalId = String(tl.id_string ?? tl.id ?? "");
    if (!externalId || !tl.name) { result.skipped++; continue; }

    const projectId = projectMap.get(String(tl._zoho_project_id ?? "")) ?? null;
    if (!projectId) {
      result.errors.push(`tasklist ${externalId}: no Hub project for zoho_project_id=${tl._zoho_project_id}`);
      result.skipped++;
      continue;
    }

    const position = typeof tl.sequence === "object"
      ? (tl.sequence?.project_sequence ?? null)
      : (tl.sequence ?? null);

    const isNoneMilestone =
      tl.meta_info?.is_none_milestone_tasklist === true ||
      tl.milestone?.name === "None";
    const milestoneExternalId = !isNoneMilestone
      ? String(tl.milestone?.id_string ?? tl.milestone?.id ?? "")
      : "";
    const milestoneId = milestoneExternalId ? (milestoneMap.get(milestoneExternalId) ?? null) : null;

    rows.push({ external_id: externalId, project_id: projectId, name: tl.name, position, is_default: tl.is_default ?? false, milestone_id: milestoneId });
  }

  // Batch upsert in chunks
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await adminClient.from("tasklists").upsert(chunk, { onConflict: "external_id" });
    if (error) {
      result.errors.push(`chunk ${i}–${i + chunk.length - 1}: ${error.message}`);
    } else {
      result.imported += chunk.length;
    }
    if (i + CHUNK_SIZE < rows.length) {
      await new Promise<void>((r) => setTimeout(r, CHUNK_DELAY_MS));
    }
  }

  return NextResponse.json(result);
}
