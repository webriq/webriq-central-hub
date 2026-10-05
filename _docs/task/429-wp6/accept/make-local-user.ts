// Local-only: creates a confirmed admin test user in the DISPOSABLE local stack for the browser acceptance run. Refuses non-local targets.
import { createClient } from "@supabase/supabase-js";
const url = process.env.LOCAL_URL ?? "";
if (!/127\.0\.0\.1|localhost/.test(url)) { console.error("REFUSING: LOCAL_URL must be local"); process.exit(2); }
const sb = createClient(url, process.env.LOCAL_SERVICE_KEY!, { auth: { persistSession: false } });
const [email, password] = (process.env.LOCAL_CRED ?? "").split(" ");
(async () => {
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (error && !/already/i.test(error.message)) throw error;
  const id = data?.user?.id ?? (await sb.auth.admin.listUsers()).data.users.find((u) => u.email === email)!.id;
  const { error: pe } = await sb.from("profiles").update({ role: "admin", full_name: "Local Admin" }).eq("id", id);
  if (pe) throw pe;
  console.log("local admin ready");
})().catch((e) => { console.error(e.message ?? e); process.exit(1); });
