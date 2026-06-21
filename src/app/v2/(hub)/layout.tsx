import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import V2HubShell from "./_components/v2-hub-shell";

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    const pathname = (await headers()).get("x-pathname") ?? "";
    const returnTo = pathname.startsWith("/v2/")
      ? `?returnTo=${encodeURIComponent(pathname)}`
      : "";
    redirect(`/v2/auth/login${returnTo}`);
  }

  const userId = data.claims.sub as string;
  const userEmail = (data.claims.email as string | undefined) ?? null;
  let userRole: string | null = null;
  let userDisplayName: string | null = null;

  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", userId)
      .single();

    if (profile) {
      userRole = profile.role;
      userDisplayName = profile.full_name;
    }
  }

  return (
    <V2HubShell
      userRole={userRole}
      displayName={userDisplayName}
      email={userEmail}
    >
      {children}
    </V2HubShell>
  );
}
