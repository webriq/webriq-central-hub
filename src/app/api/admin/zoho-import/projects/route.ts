// dev-only import endpoint — reads _from_zoho/projects.json, upserts Zoho-origin metadata
// onto existing Hub project rows. Additive only: never overwrites Hub-managed fields
// (customer_id, project_type, status, name). Zoho-specific operational data goes into
// source_meta as a single blob; genuinely useful data gets first-class columns.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  readFromZoho,
  adminClient,
  ImportResult,
  ZohoTag,
  buildCustomerNameMap,
  inferProjectType,
  mapProjectStatus,
  extractZohoCustomerName,
} from "@/lib/migrate/zoho-import";

type ZohoProjectRaw = {
  id?: string;
  id_string?: string;
  name?: string;
  description?: string;
  is_completed?: boolean;
  status?: { name?: string; id?: string; is_closed_type?: boolean };
  owner?: { zpuid?: string; email?: string; full_name?: string };
  modified_time?: string;
  completed_time?: string;
  created_time?: string;
  start_date?: string;
  end_date?: string;
  percent_complete?: number;
  project_group?: { name?: string };
  layout?: { name?: string; id?: string };
  tags?: ZohoTag[];
  existing_website?: string;
  development_site?: string;
  [key: string]: unknown;
};

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let projects: ZohoProjectRaw[];
  try {
    projects = readFromZoho<ZohoProjectRaw>("projects.json");
  } catch {
    return NextResponse.json({ error: "Could not read _from_zoho/projects.json" }, { status: 400 });
  }

  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
  const now = new Date().toISOString();
  const customerMap = await buildCustomerNameMap();

  for (const p of projects) {
    const zohoId = String(p.id_string ?? p.id ?? "");
    if (!zohoId) { result.skipped++; continue; }

    const { data: existing } = await adminClient
      .from("projects")
      .select("id")
      .eq("zoho_project_id", zohoId)
      .maybeSingle();

    if (!existing) {
      const zohoName = String(p.name ?? "").trim();
      const customerName = extractZohoCustomerName(zohoName);
      const customerId = customerMap.get(customerName.toLowerCase());
      if (!customerId) {
        result.errors.push(`no customer match for project "${zohoName}" → "${customerName}" (zoho_id: ${zohoId})`);
        result.skipped++;
        continue;
      }

      const typeInference = inferProjectType(p.tags ?? [], p.layout?.name, zohoName);
      const newStatus = mapProjectStatus(p.status?.name, p.status?.is_closed_type, p.is_completed);

      const { error: insertError } = await adminClient.from("projects").insert({
        customer_id: customerId,
        name: zohoName,
        project_type: typeInference.value,
        status: newStatus,
        description: p.description ?? null,
        created_by: null,
        zoho_project_id: zohoId,
        dedicated_developers: [],
        start_date: p.start_date ?? null,
        end_date: p.end_date ?? null,
        percent_complete: Number(p.percent_complete ?? 0),
        existing_website: p.existing_website ?? null,
        development_site: p.development_site ?? null,
        tags: (p.tags ?? []).map((t) => t.name).filter((n): n is string => Boolean(n)),
        owner_name: p.owner?.full_name ?? p.owner?.email ?? null,
        source_meta: {
          status_name: p.status?.name ?? null,
          status_id: p.status?.id ? String(p.status.id) : null,
          is_closed: p.status?.is_closed_type ?? false,
          owner_zpuid: p.owner?.zpuid ? String(p.owner.zpuid) : null,
          owner_email: p.owner?.email ?? null,
          project_group: p.project_group?.name ?? null,
          tags: (p.tags ?? []) as import("@/types/database").Json[],
          modified_at: p.modified_time ?? null,
          completed_at: p.completed_time ?? null,
          synced_at: now,
          project_type_inferred: true,
          project_type_source: typeInference.source,
          customer_name_zoho: zohoName,
          customer_name_resolved: customerName,
        },
      });

      if (insertError) {
        result.errors.push(`create project "${zohoName}" (${zohoId}): ${insertError.message}`);
      } else {
        result.imported++;
      }
      continue;
    }

    const updateTypeInference = inferProjectType(p.tags ?? [], p.layout?.name, String(p.name ?? "").trim());
    const updateStatus = mapProjectStatus(p.status?.name, p.status?.is_closed_type, p.is_completed);

    const { error } = await adminClient
      .from("projects")
      .update({
        // Re-apply derived fields so re-runs pick up inference fixes
        status: updateStatus,
        project_type: updateTypeInference.value,
        start_date: p.start_date ?? null,
        end_date: p.end_date ?? null,
        percent_complete: Number(p.percent_complete ?? 0),
        existing_website: p.existing_website ?? null,
        development_site: p.development_site ?? null,
        description: (p.description as string | undefined) ?? null,
        tags: (p.tags ?? []).map((t) => t.name).filter((n): n is string => Boolean(n)),
        owner_name: p.owner?.full_name ?? p.owner?.email ?? null,
        source_meta: {
          status_name: p.status?.name ?? null,
          status_id: p.status?.id ? String(p.status.id) : null,
          is_closed: p.status?.is_closed_type ?? false,
          owner_zpuid: p.owner?.zpuid ? String(p.owner.zpuid) : null,
          owner_email: p.owner?.email ?? null,
          project_group: p.project_group?.name ?? null,
          tags: (p.tags ?? []) as import("@/types/database").Json[],
          modified_at: p.modified_time ?? null,
          completed_at: p.completed_time ?? null,
          synced_at: now,
          project_type_inferred: true,
          project_type_source: updateTypeInference.source,
        },
      })
      .eq("zoho_project_id", zohoId);

    if (error) {
      result.errors.push(`project ${zohoId}: ${error.message}`);
    } else {
      result.updated++;
    }
  }

  return NextResponse.json(result);
}
