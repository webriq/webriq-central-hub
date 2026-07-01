// dev-only import endpoint — reads _from_zoho/milestones.json, upserts to milestones table.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readFromZoho, resolveProjectId, adminClient, ImportResult } from "@/lib/migrate/zoho-import";

type ZohoMilestoneRaw = {
  id?: string;
  id_string?: string;
  name?: string;
  start_date?: string;
  end_date?: string;
  status?: { name?: string } | string;
  _zoho_project_id?: string;
  [key: string]: unknown;
};

function mapMilestoneStatus(raw: unknown): "planned" | "active" | "completed" {
  const s = (
    raw && typeof raw === "object" && "name" in raw
      ? ((raw as { name?: string }).name ?? "")
      : String(raw ?? "")
  ).toLowerCase();
  if (s.includes("complet")) return "completed";
  if (s === "active" || s.includes("progress")) return "active";
  return "planned";
}

// Normalises Zoho date strings to YYYY-MM-DD for PostgreSQL date columns.
// Handles ISO (YYYY-MM-DD) and Zoho's MM-DD-YYYY format.
function normalizeDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;
  return null;
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let milestones: ZohoMilestoneRaw[];
  try {
    milestones = readFromZoho<ZohoMilestoneRaw>("milestones.json");
  } catch {
    return NextResponse.json({ error: "Could not read _from_zoho/milestones.json" }, { status: 400 });
  }

  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };

  for (const m of milestones) {
    const externalId = String(m.id_string ?? m.id ?? "");
    if (!externalId || !m.name) { result.skipped++; continue; }

    const projectId = await resolveProjectId(String(m._zoho_project_id ?? ""));
    if (!projectId) {
      result.errors.push(`milestone ${externalId}: no Hub project found for zoho_project_id=${m._zoho_project_id}`);
      result.skipped++;
      continue;
    }

    const { error } = await adminClient.from("milestones").upsert(
      {
        external_id: externalId,
        project_id: projectId,
        name: m.name,
        start_date: normalizeDate(m.start_date),
        due_date: normalizeDate(m.end_date),
        status: mapMilestoneStatus(m.status),
        created_by: null,
      },
      { onConflict: "external_id" }
    );

    if (error) {
      result.errors.push(`milestone ${externalId}: ${error.message}`);
    } else {
      result.imported++;
    }
  }

  return NextResponse.json(result);
}
