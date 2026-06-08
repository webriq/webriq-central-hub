import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: projects, error } = await adminClient
    .from("customer_projects")
    .select("id, project_name, project_type, zoho_project_id, customer_id")
    .not("zoho_project_id", "is", null)
    .order("project_name");

  if (error) {
    console.error("[api/projects] fetch failed:", error.message);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }

  if (!projects?.length) return NextResponse.json([]);

  const customerIds = [...new Set(projects.map(p => p.customer_id))];
  const { data: customers } = await adminClient
    .from("customers")
    .select("customer_id, company_name")
    .in("customer_id", customerIds);

  const nameMap = Object.fromEntries(
    (customers ?? []).map(c => [c.customer_id, c.company_name as string])
  );

  return NextResponse.json(
    projects.map(p => ({
      id: p.id,
      project_name: p.project_name,
      zoho_project_id: p.zoho_project_id as string,
      customer_id: p.customer_id,
      company_name: nameMap[p.customer_id] ?? p.customer_id,
    }))
  );
}
