import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

const { data, error } = await supabase
  .from("projects")
  .select("id, name, customer_id, created_at, onboarding_visible_at, programme_started_at, scheduled_onboarding_start_at, customers(company_name)")
  .order("created_at", { ascending: false });

if (error) {
  console.error(error);
  process.exit(1);
}

const cutoff = new Date("2026-07-06T00:00:00Z");

for (const p of data) {
  const created = new Date(p.created_at);
  const inRange = created >= cutoff;
  console.log([
    inRange ? "KEEP " : "HIDE ",
    p.created_at,
    p.id,
    p.name,
    p.customer_id,
    p.customers?.company_name ?? "",
    p.onboarding_visible_at ? "visible" : "hidden",
    p.programme_started_at ? "started" : p.scheduled_onboarding_start_at ? "scheduled" : "draft",
  ].join(" | "));
}
console.log("TOTAL:", data.length, "| KEEP (>= Jul 6):", data.filter((p) => new Date(p.created_at) >= cutoff).length);
process.exit(0);
