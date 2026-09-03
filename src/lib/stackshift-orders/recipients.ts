import { adminClient } from "@/lib/supabase/admin";

// Task 347 — every StackShift order submission notifies a fixed list (Philippe, Danielle,
// Brandon, Alex, Bert — addresses live in STACKSHIFT_ORDER_NOTIFY_EMAILS, "more on this
// later") plus every PM. `profiles` has no email column, so PM addresses come from auth.users
// intersected with profiles.role = 'pm'.
export async function getOrderNotificationRecipients(): Promise<string[]> {
  const out = new Set<string>();

  for (const raw of (process.env.STACKSHIFT_ORDER_NOTIFY_EMAILS ?? "").split(",")) {
    const email = raw.trim().toLowerCase();
    if (email.includes("@")) out.add(email);
  }

  try {
    const { data: pmProfiles } = await adminClient
      .from("profiles")
      .select("id")
      .eq("role", "pm");
    const pmIds = new Set((pmProfiles ?? []).map((p) => p.id));

    if (pmIds.size > 0) {
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
        if (error || !data) break;
        for (const u of data.users) {
          if (u.email && pmIds.has(u.id)) out.add(u.email.toLowerCase());
        }
        if (data.users.length < 1000) break;
      }
    }
  } catch (err) {
    console.error("[stackshift-order] failed to resolve PM recipient emails:", err);
  }

  return [...out];
}
