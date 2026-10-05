import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const tables = ["customer_products", "customer_phases", "customer_deliverables", "milestones", "tasklists", "tasks", "phase_members", "onboarding_internal_deliverables"];
const results = {};
await Promise.all(tables.map((t) => new Promise((resolve) => {
  const ch = sb.channel(`probe_${t}`).on("postgres_changes", { event: "*", schema: "public", table: t }, () => {}).subscribe((status, err) => {
    if (status === "SUBSCRIBED") { results[t] = "in publication (subscribe OK)"; sb.removeChannel(ch); resolve(); }
    else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { results[t] = `${status}: ${(err?.message ?? "").slice(0, 140)}`; sb.removeChannel(ch); resolve(); }
  });
  setTimeout(() => { if (!results[t]) { results[t] = "no response (10s)"; resolve(); } }, 10000);
})));
console.log(JSON.stringify(results, null, 1));
process.exit(0);
