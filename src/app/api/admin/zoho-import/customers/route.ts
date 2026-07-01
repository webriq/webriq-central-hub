// dev-only import endpoint — derives unique customer names from _from_zoho/projects.json
// and creates customers rows for any that don't already exist (matched by company_name).
// Run this BEFORE the projects import so every project can resolve a customer_id.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readFromZoho, adminClient, ImportResult, extractZohoCustomerName } from "@/lib/migrate/zoho-import";

type ZohoProjectName = { name?: string };

async function generateCustomerIdAdmin(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
    const id = `WRQ-CUST-${suffix}`;
    const { data } = await adminClient
      .from("customers")
      .select("customer_id")
      .eq("customer_id", id)
      .maybeSingle();
    if (!data) return id;
  }
  return `WRQ-CUST-${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let projects: ZohoProjectName[];
  try {
    projects = readFromZoho<ZohoProjectName>("projects.json");
  } catch {
    return NextResponse.json({ error: "Could not read _from_zoho/projects.json" }, { status: 400 });
  }

  // Derive unique customer names from project names
  const customerNames = new Set<string>();
  for (const p of projects) {
    const name = p.name?.trim() ?? "";
    if (!name) continue;
    customerNames.add(extractZohoCustomerName(name));
  }

  // Load existing customers to skip already-present company_names
  const { data: existing } = await adminClient.from("customers").select("company_name");
  const existingNames = new Set((existing ?? []).map((c) => c.company_name.toLowerCase().trim()));

  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };

  for (const name of customerNames) {
    if (existingNames.has(name.toLowerCase().trim())) {
      result.skipped++;
      continue;
    }

    const customerId = await generateCustomerIdAdmin();

    const { error } = await adminClient.from("customers").insert({
      customer_id: customerId,
      company_name: name,
      contact_name: null,
      contact_email: null,
      status: "active",
      automation_toggle: false,
      llm_excluded: false,
      communication_tone: "formal",   // constraint: formal | casual | technical
      onboarding_status: {},
      automation_paused: false,
    });

    if (error) {
      result.errors.push(`create customer "${name}": ${error.message}`);
    } else {
      result.imported++;
    }
  }

  return NextResponse.json(result);
}
