import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HubSidebar from "@/components/hub/hub-sidebar";
import HubHeader from "@/components/hub/hub-header";

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/signin");
  }

  const userId = data.claims.sub;
  let userEmail: string | null = null;
  let userRole: string | null = null;

  if (userId) {
    const { data: profile } = await supabase
      .from("hub_users")
      .select("email, role")
      .eq("id", userId)
      .single();

    if (profile) {
      userEmail = profile.email;
      userRole = profile.role;
    }
  }

  return (
    <div className="flex min-h-screen bg-page-bg">
      <HubSidebar userEmail={userEmail} userRole={userRole} />
      <div className="flex-1 flex flex-col min-w-0 bg-page-bg">
        <HubHeader />
        {children}
      </div>
    </div>
  );
}
