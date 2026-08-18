import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isRoleGatedByMembership, canManageProjectMembers } from "@/lib/programme/membership-rules";
import { getCurrentProgrammeDay, resolveEffectivePhase, DEFAULT_PROGRAMME_DAYS } from "@/config/customer-phases";
import type { OnboardingProjectListItem } from "./_onboarding-list";

// Server-only paginated/filtered/sorted query for the Portfolio Tracker list page (task 263).
// Mirrors src/app/(hub)/projects/page.tsx's searchParams -> Supabase query pattern. Deliberately
// separate from GET /api/onboarding/projects (untouched — shared by pm-dashboard.tsx and
// marketing-dashboard.tsx for unrelated summary widgets, see the task doc's Out of Scope).

const CREATE_ROLES = ["admin", "super_admin", "marketing", "pm"];

export type OnboardingListParams = {
  search: string;
  statusValues: string[] | null; // null = all (unfiltered), [] = explicitly none
  classificationValues: string[] | null;
  sort: string;
  page: number;
  pageSize: number;
};

export type OnboardingPaginationMeta = { page: number; pageSize: number; total: number };

const SORT_MAP: Record<string, { column: "created_at" | "name" | "target_handover_at"; ascending: boolean; nullsFirst: boolean }> = {
  newest: { column: "created_at", ascending: false, nullsFirst: false },
  oldest: { column: "created_at", ascending: true, nullsFirst: false },
  name_asc: { column: "name", ascending: true, nullsFirst: false },
  name_desc: { column: "name", ascending: false, nullsFirst: false },
  due_soonest: { column: "target_handover_at", ascending: true, nullsFirst: false },
};

const ZERO_ROWS_ID = "00000000-0000-0000-0000-000000000000";

export async function loadOnboardingProjectsList(
  userId: string,
  role: string | null,
  params: OnboardingListParams
): Promise<{ projects: OnboardingProjectListItem[]; paginationMeta: OnboardingPaginationMeta; canCreate: boolean }> {
  const supabase = await createClient();
  const sortSpec = SORT_MAP[params.sort] ?? SORT_MAP.newest;
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  // Two-step lookup for classification, since it lives on the joined customer_products row, not
  // on projects itself — mirrors /projects/page.tsx's own two-step customer-name search pattern.
  // "unclassified" covers both projects with no customer_product_id at all AND customer_products
  // rows whose classification is null (legacy/Zoho-imported data, same population the card
  // footer already labels "Unclassified" client-side today).
  let classificationOrParts: string[] | null = null;
  if (params.classificationValues !== null) {
    const wantsUnclassified = params.classificationValues.includes("unclassified");
    const realValues = params.classificationValues.filter((v) => v !== "unclassified");
    const matchingProductIds: string[] = [];
    if (realValues.length > 0) {
      const { data } = await supabase.from("customer_products").select("id").in("classification", realValues);
      matchingProductIds.push(...(data ?? []).map((r) => r.id));
    }
    if (wantsUnclassified) {
      const { data } = await supabase.from("customer_products").select("id").is("classification", null);
      matchingProductIds.push(...(data ?? []).map((r) => r.id));
    }
    classificationOrParts = [];
    if (wantsUnclassified) classificationOrParts.push("customer_product_id.is.null");
    if (matchingProductIds.length > 0) classificationOrParts.push(`customer_product_id.in.(${matchingProductIds.join(",")})`);
  }

  // Task 153: marketing/pm only see projects they're a member of; a project with zero
  // project_members rows is unrestricted (backward compatibility for already in-progress
  // projects that predate this feature) — mirrors GET /api/onboarding/projects exactly.
  // project_members is small (bounded by onboarding project count x ~1-3 members each), unlike
  // the tasks/issues tables this task's fixes target, so an unscoped read here isn't the kind of
  // full-table fetch this task eliminates elsewhere — the untouched GET route has this same
  // characteristic today.
  let excludedProjectIds: string[] = [];
  if (isRoleGatedByMembership(role)) {
    const { data: memberRows } = await supabase.from("project_members").select("project_id, user_id");
    const projectsWithMembers = new Set((memberRows ?? []).map((r) => r.project_id));
    const myMemberProjectIds = new Set((memberRows ?? []).filter((r) => r.user_id === userId).map((r) => r.project_id));
    excludedProjectIds = [...projectsWithMembers].filter((id) => !myMemberProjectIds.has(id));
  }

  let query = supabase
    .from("projects")
    .select(
      `
      id,
      project_id,
      name,
      customer_id,
      programme_started_at,
      programme_duration_days,
      scheduled_onboarding_start_at,
      customer_product_id,
      created_at,
      created_by,
      onboarding_status,
      target_handover_at,
      customers(company_name),
      customer_products(classification)
    `,
      { count: "exact" }
    )
    .gte("created_at", "2026-07-06T00:00:00Z")
    .neq("status", "deleted")
    .order(sortSpec.column, { ascending: sortSpec.ascending, nullsFirst: sortSpec.nullsFirst });

  if (params.statusValues !== null) {
    const statusFilter = params.statusValues.length > 0 ? params.statusValues : ["__none__"];
    query = query.in("onboarding_status", statusFilter);
  }
  if (classificationOrParts !== null) {
    query = classificationOrParts.length > 0
      ? query.or(classificationOrParts.join(","))
      : query.eq("id", ZERO_ROWS_ID);
  }
  if (params.search) {
    const { data: matchedCustomers } = await supabase
      .from("customers")
      .select("customer_id")
      .ilike("company_name", `%${params.search}%`);
    const customerIds = (matchedCustomers ?? []).map((c) => c.customer_id);
    const customerIdFilter = customerIds.length > 0 ? `,customer_id.in.(${customerIds.join(",")})` : "";
    query = query.or(`name.ilike.%${params.search}%${customerIdFilter}`);
  }
  if (excludedProjectIds.length > 0) {
    query = query.not("id", "in", `(${excludedProjectIds.join(",")})`);
  }

  const { data: rows, count } = await query.range(from, to);
  const projectRows = rows ?? [];
  const projectIds = projectRows.map((p) => p.id);

  // Active-phase display info — scoped to this page's project IDs only (bounded to pageSize),
  // unlike GET /api/onboarding/projects, which runs this for every matched row today.
  const activePhaseByProject = new Map<string, number>();
  const activePhaseNameByProject = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: phases } = await supabase
      .from("customer_phases")
      .select("project_id, phase_number, status, custom_name, day_start_override, day_end_override, sort_order")
      .in("project_id", projectIds)
      .eq("status", "active");
    for (const row of phases ?? []) {
      activePhaseByProject.set(row.project_id, row.phase_number);
      activePhaseNameByProject.set(row.project_id, resolveEffectivePhase(row).name);
    }
  }

  // Member avatars — deduped union of project_members + Phase 1 phase_members, same shape as
  // GET /api/onboarding/projects, scoped to this page's project IDs only.
  const memberIdsByProject = new Map<string, Set<string>>();
  if (projectIds.length > 0) {
    const [projMembersRes, phase1MembersRes] = await Promise.all([
      supabase.from("project_members").select("project_id, user_id").in("project_id", projectIds),
      supabase.from("phase_members").select("project_id, user_id").eq("phase_number", 1).in("project_id", projectIds),
    ]);
    for (const row of [...(projMembersRes.data ?? []), ...(phase1MembersRes.data ?? [])]) {
      if (!memberIdsByProject.has(row.project_id)) memberIdsByProject.set(row.project_id, new Set());
      memberIdsByProject.get(row.project_id)!.add(row.user_id);
    }
  }
  const allMemberIds = [...new Set([...memberIdsByProject.values()].flatMap((s) => [...s]))];
  const memberFullNameById = new Map<string, string | null>();
  if (allMemberIds.length > 0) {
    // adminClient: profiles_read_own RLS only lets a caller read their own row (or every row for
    // admin/super_admin) — teammate names would otherwise render "Unnamed" for pm/marketing/
    // developer callers, same exception GET /api/onboarding/projects and /projects/page.tsx use.
    const { data: memberProfiles } = await adminClient.from("profiles").select("id, full_name").in("id", allMemberIds);
    for (const row of memberProfiles ?? []) memberFullNameById.set(row.id, row.full_name);
  }

  const projects: OnboardingProjectListItem[] = projectRows.map((p) => {
    const companyName = (p.customers as unknown as { company_name: string } | null)?.company_name ?? "Unknown";
    const classification = (p.customer_products as unknown as { classification: string | null } | null)?.classification ?? null;
    const activePhaseNumber = activePhaseByProject.get(p.id) ?? null;
    const durationDays = p.programme_duration_days ?? DEFAULT_PROGRAMME_DAYS;
    const currentDay = p.programme_started_at ? Math.min(durationDays, getCurrentProgrammeDay(p.programme_started_at)) : null;

    return {
      id: p.id,
      project_id: p.project_id,
      project_name: p.name,
      company_name: companyName,
      customer_id: p.customer_id,
      classification,
      current_phase_number: activePhaseNumber,
      current_phase_name: activePhaseNumber ? (activePhaseNameByProject.get(p.id) ?? null) : null,
      current_day: currentDay,
      programme_duration_days: durationDays,
      progress_pct: currentDay ? Math.min(100, Math.round((currentDay / durationDays) * 100)) : 0,
      programme_started_at: p.programme_started_at,
      scheduled_onboarding_start_at: p.scheduled_onboarding_start_at,
      target_handover_date: p.target_handover_at,
      created_at: p.created_at,
      status: (p.onboarding_status ?? "draft") as OnboardingProjectListItem["status"],
      members: [...(memberIdsByProject.get(p.id) ?? [])].map((id) => ({ id, full_name: memberFullNameById.get(id) ?? null })),
      canManageCollaborators: canManageProjectMembers(role, p.created_by === userId),
    };
  });

  return {
    projects,
    paginationMeta: { page: params.page, pageSize: params.pageSize, total: count ?? 0 },
    canCreate: !!role && CREATE_ROLES.includes(role),
  };
}
