import { redirect } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";
import { createClient } from "@/lib/supabase/server";
import { getHrViewer, isManager } from "@/lib/hr/access";
import { loadPersonDirectory } from "@/lib/hr/avatars";
import { AvatarUrlProvider } from "./_components/person-avatar";
import { SetupNeeded } from "./_components/setup-needed";

export const dynamic = "force-dynamic";

// Clients have no HR standing; everyone else resolves a tier inside each page via getHrViewer()
// (cached per request), so this layout keeps clients out — and probes `hr_holidays` (a table
// migration 164 creates) so an unexposed schema or unapplied migration renders a setup message
// instead of a raw PostgREST error (PGRST106 / 42P01).
export default async function HrLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getHrViewer();
  if (!viewer) redirect(V2_ROUTES.DASHBOARD);

  const supabase = await createClient();
  const { error } = await supabase.from("hr_holidays").select("id", { head: true, count: "exact" }).limit(1);
  if (error) {
    console.error("[hr] schema probe failed:", error.code, error.message);
    return <SetupNeeded canFix={isManager(viewer)} detail={`${error.code}: ${error.message}`} />;
  }
  const directory = await loadPersonDirectory();
  const avatarUrls = Object.fromEntries(Object.entries(directory).map(([id, e]) => [id, e.avatarUrl]));
  return <AvatarUrlProvider value={avatarUrls}>{children}</AvatarUrlProvider>;
}
