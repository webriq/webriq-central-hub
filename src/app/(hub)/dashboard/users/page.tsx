import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import UsersTable from "./_table";

async function approveHubUser(formData: FormData) {
  "use server";
  const { createClient: createServerClient } = await import("@/lib/supabase/server");
  const supabase = await createServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return;

  const { data: caller } = await supabase
    .from("hub_users")
    .select("role")
    .eq("id", claims.claims.sub)
    .single();
  if (caller?.role !== "admin") return;

  const userId = formData.get("userId") as string;
  const role = formData.get("role") as string;
  if (!userId || !["admin", "pm", "dev"].includes(role)) return;

  const { adminClient } = await import("@/lib/supabase/admin");
  await adminClient.from("hub_users").update({ role }).eq("id", userId);
  revalidatePath("/dashboard/users");
}

export default async function UsersPage() {
  await requireRole("/dashboard/users");

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const currentUserId = claims?.claims?.sub ?? null;

  const { data: users } = await adminClient
    .from("hub_users")
    .select("id, email, display_name, role, zoho_user_id, created_at")
    .order("created_at", { ascending: false });

  const rows = users ?? [];

  return (
    <UsersTable
      users={rows}
      currentUserId={currentUserId ?? ""}
      approveAction={approveHubUser}
    />
  );
}
