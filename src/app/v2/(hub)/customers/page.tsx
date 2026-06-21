import { createClient } from "@/lib/supabase/server";
import CustomersIndex, { type CustomerListItem } from "./_customers-index";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const supabase = await createClient();

  const [customersRes, projectsRes] = await Promise.all([
    supabase
      .from("customers")
      .select("customer_id,company_name,contact_name,contact_email,status")
      .order("company_name"),
    supabase.from("projects").select("customer_id"),
  ]);

  // Project count per customer.
  const projectCount = new Map<string, number>();
  for (const p of projectsRes.data ?? []) {
    projectCount.set(p.customer_id, (projectCount.get(p.customer_id) ?? 0) + 1);
  }

  const customers: CustomerListItem[] = (customersRes.data ?? []).map((c) => ({
    customer_id: c.customer_id,
    company_name: c.company_name,
    contact_name: c.contact_name,
    contact_email: c.contact_email,
    status: c.status,
    project_count: projectCount.get(c.customer_id) ?? 0,
  }));

  return <CustomersIndex customers={customers} />;
}
