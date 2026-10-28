// What Zoho-derived data already lives in the Hub's DB? Plain PostgREST — no supabase-js
// (Node 20 here lacks native WebSocket, which supabase-js requires at import time).
// Run: node --env-file=.env _docs/task/zoho-migration-state.mjs

const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!base || !key) {
  console.log("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY");
  process.exit(1);
}

const count = async (table, filter = "") => {
  const res = await fetch(`${base}/rest/v1/${table}?select=id${filter}&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
  });
  const range = res.headers.get("content-range") ?? "";
  return res.ok ? range.split("/")[1] : `ERR ${res.status} ${(await res.text()).slice(0, 80)}`;
};

for (const [label, table] of [
  ["projects", "projects"],
  ["tasks", "tasks"],
  ["issues", "issues"],
  ["attachments (all)", "attachments"],
]) {
  console.log(label.padEnd(22), await count(table));
}

const et = await (
  await fetch(`${base}/rest/v1/attachments?select=entity_type`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
).json();
if (Array.isArray(et)) {
  const t = et.reduce((m, r) => ((m[r.entity_type] = (m[r.entity_type] || 0) + 1), m), {});
  console.log("attachments by type    ", JSON.stringify(t));
}

const buckets = await (
  await fetch(`${base}/storage/v1/bucket`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
).json();
console.log("buckets                ", Array.isArray(buckets) ? buckets.map((b) => b.name).join(", ") : buckets);
