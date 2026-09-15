import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { Toaster } from "@/components/ui/sonner";
import { V2_ROUTES } from "@/config/constants";
import { isPathAllowedForDepartment } from "@/lib/auth/department-map";
import V2HubShell from "./_components/v2-hub-shell";

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "";

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    const returnTo = pathname && pathname.startsWith("/") && !pathname.startsWith("//")
      ? `?returnTo=${encodeURIComponent(pathname)}`
      : "";
    redirect(`/auth/login${returnTo}`);
  }

  const userId = data.claims.sub as string;
  let userRole: string | null = null;
  let userDisplayName: string | null = null;
  let userAvatarUrl: string | null = null;
  let departmentName: string | null = null;

  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, full_name, avatar_url, department_id")
      .eq("id", userId)
      .single();

    if (profile) {
      userRole = profile.role;
      userDisplayName = profile.full_name;
      userAvatarUrl = profile.avatar_url;

      if (profile.department_id) {
        const { data: department } = await supabase
          .from("departments")
          .select("name")
          .eq("id", profile.department_id)
          .maybeSingle();
        departmentName = department?.name ?? null;
      }
    }
  }

  if (!isPathAllowedForDepartment(pathname, departmentName)) {
    redirect(V2_ROUTES.DASHBOARD);
  }

  return (
    <>
      <V2HubShell
        userRole={userRole}
        departmentName={departmentName}
        displayName={userDisplayName}
        avatarUrl={userAvatarUrl}
      >
        {children}
      </V2HubShell>
      <Toaster position="bottom-right" />
    </>
  );
}
