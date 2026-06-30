import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import UsersTable from "./_table";
import { approveHubUser } from "@/app/(hub)/actions/approve-hub-user";

export default async function UsersPage() {
  await requireRole("/dashboard/users");

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const currentUserId = claims?.claims?.sub ?? null;

  const { data: users } = await adminClient
    .from("hub_users")
    .select("id, email, first_name, last_name, role, external_id, is_invited, created_at")
    .order("created_at", { ascending: false });

  const rows = users ?? [];

  const approveAction = approveHubUser.bind(null, "/dashboard/users");

  return (
    <UsersTable
      users={rows}
      currentUserId={currentUserId ?? ""}
      approveAction={approveAction}
    />
  );
}
