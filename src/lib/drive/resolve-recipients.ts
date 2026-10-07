import { adminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type ProfileRole = Database["public"]["Tables"]["profiles"]["Row"]["role"];

export type ShareGrantee = { userId: string } | { role: string };
export type ShareRecipient = { id: string; name: string | null; email: string };

// Task 437 — who should hear about a share: the named person, or every current member of the role
// (membership is resolved at share time only). Never the sharer, never `client` accounts, never
// anyone without an email. adminClient: profiles has no email column (it lives in auth.users) and
// profiles RLS doesn't let every staff role read other people's rows; only id/name/email come out.
export async function resolveShareRecipients(grantee: ShareGrantee, sharerId: string): Promise<ShareRecipient[]> {
  let query = adminClient.from("profiles").select("id, full_name").neq("role", "client").neq("id", sharerId);
  query = "userId" in grantee ? query.eq("id", grantee.userId) : query.eq("role", grantee.role as ProfileRole);
  const { data: profiles, error } = await query;
  if (error || !profiles || profiles.length === 0) {
    if (error) console.error("[drive-share] recipient lookup failed:", error.message);
    return [];
  }

  const wanted = new Map(profiles.map((p) => [p.id, p.full_name as string | null]));
  const emails = new Map<string, string>();
  if (wanted.size === 1) {
    const [id] = wanted.keys();
    const { data } = await adminClient.auth.admin.getUserById(id);
    if (data.user?.email) emails.set(id, data.user.email);
  } else {
    // One paged listing beats N lookups for a role fan-out (staff headcount is small).
    for (let page = 1; ; page += 1) {
      const { data, error: listError } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (listError || !data) { console.error("[drive-share] email lookup failed:", listError?.message); break; }
      for (const u of data.users) if (u.email && wanted.has(u.id)) emails.set(u.id, u.email);
      if (data.users.length < 1000) break;
    }
  }

  return [...wanted].flatMap(([id, name]) => (emails.has(id) ? [{ id, name, email: emails.get(id)! }] : []));
}
