import { createClient } from "@/lib/supabase/server";
import ProjectsIndex, { type ProjectListItem, type CustomerOption, type PaginationMeta } from "./_projects-index";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; page?: string; pageSize?: string; view?: string; search?: string; status?: string; classification?: string; sort?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const pageSize = Math.max(1, parseInt(params.pageSize ?? "15", 10));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const searchQ = params.search?.trim() ?? "";
  const customerParam = params.customer ?? "";

  // Multi-select status/classification filters: param absent = "All" (unfiltered);
  // param present but empty string = explicitly zero selected (matches nothing);
  // otherwise a comma-separated list of the checked values. Mirrors the checkbox
  // "All" convenience the FilterMultiSelect UI implements client-side.
  const statusValues = params.status === undefined ? null : params.status === "" ? [] : params.status.split(",");
  const classificationValues = params.classification === undefined ? null : params.classification === "" ? [] : params.classification.split(",");

  const SORT_MAP: Record<string, { column: "start_date" | "name" | "end_date" | "updated_at"; ascending: boolean; nullsFirst: boolean }> = {
    newest: { column: "start_date", ascending: false, nullsFirst: false },
    oldest: { column: "start_date", ascending: true, nullsFirst: false },
    name_asc: { column: "name", ascending: true, nullsFirst: false },
    name_desc: { column: "name", ascending: false, nullsFirst: false },
    due_soonest: { column: "end_date", ascending: true, nullsFirst: false },
    updated_desc: { column: "updated_at", ascending: false, nullsFirst: false },
  };
  const sortSpec = SORT_MAP[params.sort ?? "newest"] ?? SORT_MAP.newest;

  // Resolve the current user's role for tag management permission.
  const { data: { user } } = await supabase.auth.getUser();
  const profileRes = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : null;
  const role = profileRes?.data?.role;
  const canManageTags = role === "admin" || role === "pm" || role === "super_admin";

  // Two-step lookup: resolve company-name search to customer_ids first (only when searching).
  let searchCustomerIds: string[] | null = null;
  if (searchQ) {
    const { data: matchedCustomers } = await supabase
      .from("customers")
      .select("customer_id")
      .ilike("company_name", `%${searchQ}%`);
    searchCustomerIds = (matchedCustomers ?? []).map((c) => c.customer_id);
  }

  // Build filtered projects query — count: "exact" on the filtered query returns filtered total.
  let projectsQuery = supabase
    .from("projects")
    .select("id,project_id,name,project_type,status,customer_id,end_date,tags,owner_name,updated_at,external_project_id,customer_product_id", { count: "exact" })
    .order(sortSpec.column, { ascending: sortSpec.ascending, nullsFirst: sortSpec.nullsFirst });

  if (customerParam) {
    projectsQuery = projectsQuery.eq("customer_id", customerParam);
  }
  if (statusValues !== null) {
    // .in() with an empty array is unspecified across PostgREST clients — force a
    // guaranteed-zero-rows match instead of risking a silent "no filter" fallback.
    const statusFilter = (statusValues.length > 0 ? statusValues : ["__none__"]) as ("active" | "on_hold" | "completed" | "archived")[];
    projectsQuery = projectsQuery.in("status", statusFilter);
  }
  // Legacy = Zoho-origin rows (external_project_id set by the Zoho Projects import);
  // Version 2 = created natively via the Hub's own New Project flow (never set).
  if (classificationValues !== null) {
    const hasLegacy = classificationValues.includes("legacy");
    const hasVersion2 = classificationValues.includes("version2");
    if (hasLegacy && !hasVersion2) {
      projectsQuery = projectsQuery.not("external_project_id", "is", null);
    } else if (!hasLegacy && hasVersion2) {
      projectsQuery = projectsQuery.is("external_project_id", null);
    } else if (!hasLegacy && !hasVersion2) {
      projectsQuery = projectsQuery.eq("id", "00000000-0000-0000-0000-000000000000"); // zero rows
    }
    // both selected → equivalent to All, no filter needed
  }
  if (searchQ) {
    const customerIdFilter = searchCustomerIds && searchCustomerIds.length > 0
      ? `customer_id.in.(${searchCustomerIds.join(",")})`
      : "";
    const orFilter = customerIdFilter
      ? `name.ilike.%${searchQ}%,${customerIdFilter}`
      : `name.ilike.%${searchQ}%`;
    projectsQuery = projectsQuery.or(orFilter);
  }

  projectsQuery = projectsQuery.range(from, to);

  const [projectsRes, customersRes, taskCountRes, issueCountRes] = await Promise.all([
    projectsQuery,
    supabase.from("customers").select("customer_id,company_name").order("company_name"),
    supabase.from("tasks").select("project_id,status").is("parent_task_id", null),
    supabase.from("issues").select("project_id,status"),
  ]);

  const customers = customersRes.data ?? [];
  const nameMap = new Map(customers.map((c) => [c.customer_id, c.company_name]));

  const counts = new Map<string, { total: number; done: number }>();
  for (const t of taskCountRes.data ?? []) {
    const c = counts.get(t.project_id) ?? { total: 0, done: 0 };
    c.total += 1;
    if (t.status === "closed") c.done += 1;
    counts.set(t.project_id, c);
  }

  const issueCounts = new Map<string, { total: number; done: number }>();
  for (const i of issueCountRes.data ?? []) {
    const c = issueCounts.get(i.project_id) ?? { total: 0, done: 0 };
    c.total += 1;
    if (i.status === "closed") c.done += 1;
    issueCounts.set(i.project_id, c);
  }

  // Multi-member avatars — mirrors /api/onboarding/projects's member-map pattern
  // (project_members → profiles full_name), without the phase_members union
  // (onboarding-specific, not applicable to the native Projects module).
  const projectIds = (projectsRes.data ?? []).map((p) => p.id);
  const memberIdsByProject = new Map<string, string[]>();
  const fullNameMap = new Map<string, string | null>();
  if (projectIds.length > 0) {
    const { data: memberRows } = await supabase
      .from("project_members")
      .select("project_id,user_id")
      .in("project_id", projectIds);
    for (const row of memberRows ?? []) {
      const arr = memberIdsByProject.get(row.project_id) ?? [];
      arr.push(row.user_id);
      memberIdsByProject.set(row.project_id, arr);
    }
    const allMemberIds = [...new Set((memberRows ?? []).map((r) => r.user_id))];
    if (allMemberIds.length > 0) {
      const { data: memberProfiles } = await supabase.from("profiles").select("id,full_name").in("id", allMemberIds);
      for (const row of memberProfiles ?? []) fullNameMap.set(row.id, row.full_name);
    }
  }

  const projects: ProjectListItem[] = (projectsRes.data ?? []).map((p) => ({
    id: p.id,
    project_id: p.project_id,
    name: p.name,
    project_type: p.project_type,
    status: p.status,
    customer_id: p.customer_id,
    company_name: nameMap.get(p.customer_id) ?? p.customer_id,
    end_date: p.end_date ?? null,
    tags: p.tags ?? [],
    owner_name: p.owner_name ?? null,
    task_total: counts.get(p.id)?.total ?? 0,
    task_done: counts.get(p.id)?.done ?? 0,
    issue_total: issueCounts.get(p.id)?.total ?? 0,
    issue_done: issueCounts.get(p.id)?.done ?? 0,
    classification: p.external_project_id ? "legacy" : "version2",
    members: (memberIdsByProject.get(p.id) ?? []).map((id) => ({ id, full_name: fullNameMap.get(id) ?? null })),
  }));

  const customerOptions: CustomerOption[] = customers.map((c) => ({
    customer_id: c.customer_id,
    company_name: c.company_name,
  }));

  const paginationMeta: PaginationMeta = {
    page,
    pageSize,
    total: projectsRes.count ?? 0,
  };

  return (
    <ProjectsIndex
      projects={projects}
      customers={customerOptions}
      paginationMeta={paginationMeta}
      initialView={(params.view === "list" ? "list" : "grid") as "grid" | "list"}
      canManageTags={canManageTags}
    />
  );
}
