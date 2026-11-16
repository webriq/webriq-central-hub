import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { orIlike } from "@/lib/postgrest-search";
import { parseIdLists, settingsGate, SUGGESTION_LIMIT } from "../_gate";

// Task 476 — Settings → Test Companies / Test Projects (admin/super_admin or any Test User, D3).
// GET ?kind=customers|projects&q= returns search suggestions for the chip box; PATCH flips `is_test`.
// Reads use adminClient: RLS hides test rows from admins (see _gate.ts).
export async function GET(req: NextRequest) {
  const res = await settingsGate("adminsOrTestUsers");
  if (res) return res;
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q") ?? "";
  return sp.get("kind") === "projects" ? searchProjects(q) : searchCustomers(q);
}

async function searchCustomers(q: string) {
  const search = orIlike(["company_name", "customer_id", "contact_name", "contact_email"], q);
  if (!search) return NextResponse.json({ rows: [] });
  const { data, error } = await adminClient
    .from("customers").select("customer_id, company_name").or(search).order("company_name").limit(SUGGESTION_LIMIT);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

async function searchProjects(q: string) {
  const search = orIlike(["name", "project_id"], q);
  if (!search) return NextResponse.json({ rows: [] });
  // Also match on company name.
  const { data: matched } = await adminClient.from("customers").select("customer_id").or(orIlike(["company_name"], q)!).limit(100);
  const companyIds = (matched ?? []).map((c) => `"${c.customer_id}"`);
  const { data: rows, error } = await adminClient
    .from("projects")
    .select("id, project_id, name, customer_id")
    .neq("status", "deleted")
    .or(companyIds.length ? `${search},customer_id.in.(${companyIds.join(",")})` : search)
    .order("name")
    .limit(SUGGESTION_LIMIT);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const customerIds = [...new Set((rows ?? []).map((r) => r.customer_id))];
  const { data: customers } = customerIds.length
    ? await adminClient.from("customers").select("customer_id, company_name").in("customer_id", customerIds)
    : { data: [] as { customer_id: string; company_name: string }[] };
  const nameById = new Map((customers ?? []).map((c) => [c.customer_id, c.company_name]));
  return NextResponse.json({ rows: (rows ?? []).map((r) => ({ ...r, company_name: nameById.get(r.customer_id) ?? null })) });
}

// Bulk: { kind: "customer" | "project", add: ids[], remove: ids[] } from the Settings chip box.
// Customer changes cascade to their projects (DB trigger, migration 181).
export async function PATCH(req: NextRequest) {
  const res = await settingsGate("adminsOrTestUsers");
  if (res) return res;
  const body = await req.json().catch(() => null) as { kind?: string } | null;
  const ids = parseIdLists(body);
  if (!ids || (body?.kind !== "customer" && body?.kind !== "project")) {
    return NextResponse.json({ error: "kind (customer|project), add and remove (id arrays) are required" }, { status: 400 });
  }
  for (const [list, value] of [[ids.add, true], [ids.remove, false]] as const) {
    if (!list.length) continue;
    const { error } = body.kind === "customer"
      ? await adminClient.from("customers").update({ is_test: value }).in("customer_id", list)
      : await adminClient.from("projects").update({ is_test: value }).in("id", list);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ added: ids.add.length, removed: ids.remove.length });
}
