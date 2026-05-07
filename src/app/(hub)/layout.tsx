import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HubSidebar from "@/components/hub/hub-sidebar";

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/signin");
  }

  return (
    <div className="flex min-h-screen bg-page-bg">
      <HubSidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-page-bg">
        {children}
      </div>
    </div>
  );
}
