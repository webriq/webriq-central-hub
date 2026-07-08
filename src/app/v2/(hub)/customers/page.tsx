import { createClient } from "@/lib/supabase/server";
import CustomersIndex, { type CustomerListItem, type PaginationMeta } from "./_customers-index";

export const dynamic = "force-dynamic";

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

  customersQuery = customersQuery.range(from, to);

  const customersRes = await customersQuery;
  const pageCustomerIds = (customersRes.data ?? []).map((c) => c.customer_id);

  // Project count + onboarding products, scoped to just this page's customers.
  const projectCount = new Map<string, number>();
  const productsByCustomer = new Map<string, CustomerListItem["customer_products"]>();
  const contactCountByCustomer = new Map<string, number>();

  if (pageCustomerIds.length > 0) {
    const [projectsRes, productsRes, contactsRes] = await Promise.all([
      supabase.from("projects").select("customer_id").in("customer_id", pageCustomerIds),
      supabase.from("customer_products").select("id,customer_id,product_name,completed_percentage").in("customer_id", pageCustomerIds),
      supabase.from("contacts").select("customer_id").in("customer_id", pageCustomerIds).not("customer_id", "is", null),
    ]);

    for (const p of projectsRes.data ?? []) {
      projectCount.set(p.customer_id, (projectCount.get(p.customer_id) ?? 0) + 1);
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
    project_count: projectCount.get(c.customer_id) ?? 0,
    customer_products: productsByCustomer.get(c.customer_id) ?? [],
    desk_contact_count: contactCountByCustomer.get(c.customer_id) ?? 0,
  }));

  const paginationMeta: PaginationMeta = {
    page,
    pageSize,
    total: customersRes.count ?? 0,
  };

  return <CustomersIndex customers={customers} paginationMeta={paginationMeta} />;
}
