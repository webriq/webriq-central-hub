import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HubSidebar from "@/components/hub/hub-sidebar";
import HubHeader from "@/components/hub/hub-header";
import HubContentShell from "./_hub-content-shell";
import PushPermissionPrompt from "@/components/hub/push-permission-prompt";

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/auth/login");
  }

  const userId = data.claims.sub;
  let userEmail: string | null = null;
  let userRole: string | null = null;
  let userDisplayName: string | null = null;
  let userZohoId: string | null = null;

  if (userId) {
    const { data: profile } = await supabase
      .from("hub_users")
      .select("email, role, display_name, zoho_user_id")
      .eq("id", userId)
      .single();

    if (profile) {
      userEmail = profile.email;
      userRole = profile.role;
      userDisplayName = profile.display_name;
      userZohoId = profile.zoho_user_id;
    }
  }

  if (userRole === "pending") {
    redirect("/auth/pending");
  }

  return (
    <div className="flex min-h-screen">
      <PushPermissionPrompt />
      <HubSidebar userEmail={userEmail} userRole={userRole} userDisplayName={userDisplayName} userZohoId={userZohoId} />
      <HubContentShell>
        <HubHeader displayName={userDisplayName} email={userEmail} zohoUserId={userZohoId} userRole={userRole} />
        {children}
      </HubContentShell>
    </div>
  );
}
