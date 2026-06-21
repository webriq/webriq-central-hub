import { createClient } from "@/lib/supabase/server";
import ProjectsIndex, { type ProjectListItem, type CustomerOption } from "./_projects-index";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const supabase = await createClient();

  const [projectsRes, customersRes, taskCountRes] = await Promise.all([
    supabase
      .from("projects")
      .select("id,name,project_type,status,customer_id,description,updated_at")
      .order("updated_at", { ascending: false }),
    supabase.from("customers").select("customer_id,company_name").order("company_name"),
    supabase.from("tasks").select("project_id,status").is("parent_task_id", null),
  ]);

  const customers = customersRes.data ?? [];
  const nameMap = new Map(customers.map((c) => [c.customer_id, c.company_name]));

  // Aggregate task counts per project (total + done).
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
    description: p.description,
    task_total: counts.get(p.id)?.total ?? 0,
    task_done: counts.get(p.id)?.done ?? 0,
  }));

  const customerOptions: CustomerOption[] = customers.map((c) => ({
    customer_id: c.customer_id,
    company_name: c.company_name,
  }));

  return <ProjectsIndex projects={projects} customers={customerOptions} />;
}
