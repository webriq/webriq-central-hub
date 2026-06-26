import { createClient } from "@/lib/supabase/server";
import ProjectsIndex, { type ProjectListItem, type CustomerOption, type PaginationMeta } from "./_projects-index";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; page?: string; pageSize?: string; view?: string; search?: string; status?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const pageSize = Math.max(1, parseInt(params.pageSize ?? "15", 10));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const searchQ = params.search?.trim() ?? "";
  const statusParam = params.status ?? "";
  const customerParam = params.customer ?? "";

  // Resolve the current user's role for tag management permission.
  const { data: { user } } = await supabase.auth.getUser();
  const profileRes = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : null;
  const role = profileRes?.data?.role;
  const canManageTags = role === "admin" || role === "pm";

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
    .select("id,name,project_type,status,customer_id,end_date,tags,owner_name,updated_at", { count: "exact" })
    .order("updated_at", { ascending: false });

  if (customerParam) {
    projectsQuery = projectsQuery.eq("customer_id", customerParam);
  }
  if (statusParam) {
    projectsQuery = projectsQuery.eq("status", statusParam as "active" | "on_hold" | "completed" | "archived");
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

  const [projectsRes, customersRes, taskCountRes] = await Promise.all([
    projectsQuery,
    supabase.from("customers").select("customer_id,company_name").order("company_name"),
    supabase.from("tasks").select("project_id,status").is("parent_task_id", null),
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

  const projects: ProjectListItem[] = (projectsRes.data ?? []).map((p) => ({
    id: p.id,
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
