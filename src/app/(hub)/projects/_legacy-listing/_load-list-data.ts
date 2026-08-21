import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { canManageProjectMembers, canSetProjectOwner } from "@/lib/programme/membership-rules";
import { getDeveloperAccessibleProjectIds } from "@/app/(hub)/projects-old/_project-access";
import type { ProjectListItem, CustomerOption, PaginationMeta } from "./_projects-index";

// Task 276 (Phase 1) — server-side loader for the "Legacy Projects" tab (now `/projects/legacy`,
// task 279), extracted from the old src/app/(hub)/projects-old/page.tsx's inline data-loading
// logic (that file is read-only — this is a parallel copy, not a shared import) so page.tsx
// doesn't balloon past the file-length guidance. Behavior is unchanged from the source: same
// multi-select status/classification
// filters, same sort map, same developer-project-id scoping, same task/issue counts via RPC,
// same member avatar lookups.

export type LegacyListParams = {
  customer: string;
  page: number;
  pageSize: number;
  search: string;
  statusValues: string[] | null; // null = all (unfiltered), [] = explicitly none
  classificationValues: string[] | null;
  sort: string;
};

const SORT_MAP: Record<string, { column: "start_date" | "name" | "end_date" | "updated_at"; ascending: boolean; nullsFirst: boolean }> = {
  newest: { column: "start_date", ascending: false, nullsFirst: false },
  oldest: { column: "start_date", ascending: true, nullsFirst: false },
  name_asc: { column: "name", ascending: true, nullsFirst: false },
  name_desc: { column: "name", ascending: false, nullsFirst: false },
  due_soonest: { column: "end_date", ascending: true, nullsFirst: false },
  updated_desc: { column: "updated_at", ascending: false, nullsFirst: false },
};

export async function loadLegacyProjectsList(params: LegacyListParams): Promise<{
  projects: ProjectListItem[];
  customers: CustomerOption[];
  paginationMeta: PaginationMeta;
  canManageTags: boolean;
  canCreateProject: boolean;
  canDeleteProjects: boolean;
}> {
  const supabase = await createClient();
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;
  const sortSpec = SORT_MAP[params.sort] ?? SORT_MAP.newest;

  const { data: { user } } = await supabase.auth.getUser();
  const profileRes = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : null;
  const role = profileRes?.data?.role;
  const canManageTags = role === "admin" || role === "pm" || role === "super_admin";
  const canCreateProject = role === "admin" || role === "pm" || role === "super_admin";
  const canDeleteProjects = role === "admin" || role === "pm" || role === "super_admin";

  const developerProjectIds = role === "developer" && user
    ? await getDeveloperAccessibleProjectIds(user.id)
    : null;

  let searchCustomerIds: string[] | null = null;
  if (params.search) {
    const { data: matchedCustomers } = await supabase
      .from("customers")
      .select("customer_id")
      .ilike("company_name", `%${params.search}%`);
    searchCustomerIds = (matchedCustomers ?? []).map((c) => c.customer_id);
  }

  let projectsQuery = supabase
    .from("projects")
    .select("id,project_id,name,project_type,status,customer_id,end_date,tags,owner_name,updated_at,external_project_id,customer_product_id,created_by,customer_products(classification)", { count: "exact" })
    .neq("status", "deleted")
    .order(sortSpec.column, { ascending: sortSpec.ascending, nullsFirst: sortSpec.nullsFirst });

  if (params.customer) {
    projectsQuery = projectsQuery.eq("customer_id", params.customer);
  }
  if (developerProjectIds !== null) {
    projectsQuery = projectsQuery.in("id", developerProjectIds.length > 0 ? developerProjectIds : ["00000000-0000-0000-0000-000000000000"]);
  }
  if (params.statusValues !== null) {
    const statusFilter = (params.statusValues.length > 0 ? params.statusValues : ["__none__"]) as ("active" | "on_hold" | "completed" | "archived")[];
    projectsQuery = projectsQuery.in("status", statusFilter);
  }
  if (params.classificationValues !== null) {
    const hasLegacy = params.classificationValues.includes("legacy");
    const hasVersion2 = params.classificationValues.includes("version2");
    if (hasLegacy && !hasVersion2) {
      projectsQuery = projectsQuery.not("external_project_id", "is", null);
    } else if (!hasLegacy && hasVersion2) {
      projectsQuery = projectsQuery.is("external_project_id", null);
    } else if (!hasLegacy && !hasVersion2) {
      projectsQuery = projectsQuery.eq("id", "00000000-0000-0000-0000-000000000000");
    }
  }
  if (params.search) {
    const customerIdFilter = searchCustomerIds && searchCustomerIds.length > 0
      ? `customer_id.in.(${searchCustomerIds.join(",")})`
      : "";
    const orFilter = customerIdFilter
      ? `name.ilike.%${params.search}%,project_id.ilike.%${params.search}%,${customerIdFilter}`
      : `name.ilike.%${params.search}%,project_id.ilike.%${params.search}%`;
    projectsQuery = projectsQuery.or(orFilter);
  }

  projectsQuery = projectsQuery.range(from, to);

  const [projectsRes, customersRes] = await Promise.all([
    projectsQuery,
    supabase.from("customers").select("customer_id,company_name").order("company_name"),
  ]);

  const customers = customersRes.data ?? [];
  const nameMap = new Map(customers.map((c) => [c.customer_id, c.company_name]));

  const projectIds = (projectsRes.data ?? []).map((p) => p.id);

  const [taskCountRes, issueCountRes] = projectIds.length > 0
    ? await Promise.all([
        supabase.rpc("get_project_task_counts", { p_project_ids: projectIds }),
        supabase.rpc("get_project_issue_counts", { p_project_ids: projectIds }),
      ])
    : [{ data: [] as { project_id: string; total: number; done: number }[] }, { data: [] as { project_id: string; total: number; done: number }[] }];

  const counts = new Map<string, { total: number; done: number }>();
  for (const row of taskCountRes.data ?? []) {
    counts.set(row.project_id, { total: row.total, done: row.done });
  }

  const issueCounts = new Map<string, { total: number; done: number }>();
  for (const row of issueCountRes.data ?? []) {
    issueCounts.set(row.project_id, { total: row.total, done: row.done });
  }

  const memberIdsByProject = new Map<string, string[]>();
  const fullNameMap = new Map<string, string | null>();
  const avatarUrlMap = new Map<string, string | null>();
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
      const { data: memberProfiles } = await adminClient.from("profiles").select("id,full_name,avatar_url").in("id", allMemberIds);
      for (const row of memberProfiles ?? []) {
        fullNameMap.set(row.id, row.full_name);
        avatarUrlMap.set(row.id, row.avatar_url);
      }
    }
  }

  // `owner_name` is Zoho-imported free text (migration 036) with no FK — AvatarStack's
  // fallback bubble (shown when a legacy project has zero project_members rows) has no id to
  // look up avatar_url with directly. Best-effort name match against real Hub profiles, same
  // approach `_issue-list-view.tsx`'s assignee-name matching uses — a project whose Zoho owner
  // name happens to match a real profile's full_name gets that profile's avatar_url.
  const ownerAvatarUrlByName = new Map<string, string | null>();
  const ownerNames = [...new Set((projectsRes.data ?? []).map((p) => p.owner_name).filter((n): n is string => !!n))];
  if (ownerNames.length > 0) {
    const { data: ownerProfiles } = await adminClient.from("profiles").select("full_name,avatar_url").in("full_name", ownerNames);
    for (const row of ownerProfiles ?? []) {
      if (row.full_name) ownerAvatarUrlByName.set(row.full_name, row.avatar_url);
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
    owner_avatar_url: p.owner_name ? ownerAvatarUrlByName.get(p.owner_name) ?? null : null,
    task_total: counts.get(p.id)?.total ?? 0,
    task_done: counts.get(p.id)?.done ?? 0,
    issue_total: issueCounts.get(p.id)?.total ?? 0,
    issue_done: issueCounts.get(p.id)?.done ?? 0,
    classification: p.external_project_id ? "legacy" : "version2",
    productClassification: (p.customer_products as unknown as { classification: string | null } | null)?.classification ?? null,
    hasProduct: !!p.customer_product_id,
    members: (memberIdsByProject.get(p.id) ?? []).map((id) => ({ id, full_name: fullNameMap.get(id) ?? null, avatar_url: avatarUrlMap.get(id) ?? null })),
    canManageCollaborators: canManageProjectMembers(role ?? null, !!user && p.created_by === user.id),
    canSetOwner: canSetProjectOwner(role ?? null, !!user && p.created_by === user.id),
  }));

  const customerOptions: CustomerOption[] = customers.map((c) => ({
    customer_id: c.customer_id,
    company_name: c.company_name,
  }));

  const paginationMeta: PaginationMeta = {
    page: params.page,
    pageSize: params.pageSize,
    total: projectsRes.count ?? 0,
  };

  return { projects, customers: customerOptions, paginationMeta, canManageTags, canCreateProject, canDeleteProjects };
}
