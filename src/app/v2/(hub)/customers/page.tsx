import { createClient } from "@/lib/supabase/server";
import CustomersIndex, { type CustomerListItem, type PaginationMeta } from "./_customers-index";

export const dynamic = "force-dynamic";

const PAGE = 1000; // Supabase/PostgREST default response cap — see CLAUDE.md's pagination convention.

async function fetchAllPaginated<T>(
  query: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; search?: string; status?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const pageSize = Math.max(1, parseInt(params.pageSize ?? "20", 10));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const searchQ = params.search?.trim() ?? "";
  const statusParam = params.status ?? "";

  // Roles that run Phase 1 onboarding (same set as Portfolio Tracker's `editable` gate in
  // `_onboarding-list.tsx`) can see customers still gated behind Phase-1 handover — everyone
  // else (pm/developer) gets the "hidden until handover" behavior below, including in search.
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  let role: string | null = null;
  if (userId) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    role = profile?.role ?? null;
  }
  const canSeeHiddenCustomers = role === "marketing" || role === "admin" || role === "super_admin";

  // A customer is hidden from the default list iff it has at least one project and *every*
  // project is still onboarding-gated (onboarding_visible_at IS NULL). Computed up front so the
  // exclusion can be applied before pagination/count, keeping `total`/`.range()` accurate.
  let fullyHiddenCustomerIds: string[] = [];
  if (!canSeeHiddenCustomers) {
    const allProjects = await fetchAllPaginated<{ customer_id: string; onboarding_visible_at: string | null }>(
      async (f, t) => supabase.from("projects").select("customer_id, onboarding_visible_at").range(f, t)
    );
    const projectsByCustomer = new Map<string, { onboarding_visible_at: string | null }[]>();
    for (const p of allProjects) {
      const list = projectsByCustomer.get(p.customer_id) ?? [];
      list.push({ onboarding_visible_at: p.onboarding_visible_at });
      projectsByCustomer.set(p.customer_id, list);
    }
    fullyHiddenCustomerIds = [...projectsByCustomer.entries()]
      .filter(([, rows]) => rows.length > 0 && rows.every((r) => r.onboarding_visible_at === null))
      .map(([id]) => id);
  }

  let customersQuery = supabase
    .from("customers")
    .select("customer_id,company_name,contact_name,contact_email,status", { count: "exact" })
    .order("company_name");

  if (statusParam) {
    customersQuery = customersQuery.eq("status", statusParam);
  }
  if (searchQ) {
    customersQuery = customersQuery.or(
      `company_name.ilike.%${searchQ}%,contact_name.ilike.%${searchQ}%,contact_email.ilike.%${searchQ}%,customer_id.ilike.%${searchQ}%`
    );
  }
  if (fullyHiddenCustomerIds.length > 0) {
    customersQuery = customersQuery.not("customer_id", "in", `(${fullyHiddenCustomerIds.join(",")})`);
  }

  customersQuery = customersQuery.range(from, to);

  const customersRes = await customersQuery;
  const pageCustomerIds = (customersRes.data ?? []).map((c) => c.customer_id);

  // Project count + onboarding products, scoped to just this page's customers.
  const visibleProjectCount = new Map<string, number>();
  const programmeStartedAtByCustomer = new Map<string, string>();
  const productsByCustomer = new Map<string, CustomerListItem["customer_products"]>();
  const contactCountByCustomer = new Map<string, number>();

  if (pageCustomerIds.length > 0) {
    const [projectsRes, productsRes, contactsRes] = await Promise.all([
      supabase.from("projects").select("customer_id, onboarding_visible_at, programme_started_at").in("customer_id", pageCustomerIds),
      supabase.from("customer_products").select("id,customer_id,product_name,completed_percentage").in("customer_id", pageCustomerIds),
      supabase.from("contacts").select("customer_id").in("customer_id", pageCustomerIds).not("customer_id", "is", null),
    ]);

    for (const p of projectsRes.data ?? []) {
      // Individually-hidden projects (new product on an already-visible customer) still drop out
      // of the count for roles that can't see hidden customers at all — privileged roles
      // (Requirement: canSeeHiddenCustomers) see the true count, matching what they can already
      // see on Portfolio Tracker, instead of a misleading "0 projects" on a customer they know exists.
      if (!canSeeHiddenCustomers && !p.onboarding_visible_at) continue;
      visibleProjectCount.set(p.customer_id, (visibleProjectCount.get(p.customer_id) ?? 0) + 1);
      if (p.programme_started_at) {
        const existing = programmeStartedAtByCustomer.get(p.customer_id);
        if (!existing || p.programme_started_at > existing) {
          programmeStartedAtByCustomer.set(p.customer_id, p.programme_started_at);
        }
      }
    }
    for (const p of productsRes.data ?? []) {
      const list = productsByCustomer.get(p.customer_id) ?? [];
      list.push({ id: p.id, product_name: p.product_name, completed_percentage: p.completed_percentage });
      productsByCustomer.set(p.customer_id, list);
    }
    for (const row of contactsRes.data ?? []) {
      if (!row.customer_id) continue;
      contactCountByCustomer.set(row.customer_id, (contactCountByCustomer.get(row.customer_id) ?? 0) + 1);
    }
  }

  const customers: CustomerListItem[] = (customersRes.data ?? []).map((c) => ({
    customer_id: c.customer_id,
    company_name: c.company_name,
    contact_name: c.contact_name,
    contact_email: c.contact_email,
    status: c.status,
    project_count: visibleProjectCount.get(c.customer_id) ?? 0,
    customer_products: productsByCustomer.get(c.customer_id) ?? [],
    desk_contact_count: contactCountByCustomer.get(c.customer_id) ?? 0,
    programme_started_at: programmeStartedAtByCustomer.get(c.customer_id) ?? null,
  }));

  const paginationMeta: PaginationMeta = {
    page,
    pageSize,
    total: customersRes.count ?? 0,
  };

  return <CustomersIndex customers={customers} paginationMeta={paginationMeta} />;
}
