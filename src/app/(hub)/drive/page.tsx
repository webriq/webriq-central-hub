import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";
import { createClient } from "@/lib/supabase/server";
import { isDriveStaffRole } from "@/lib/drive/constants";
import type { DriveView } from "@/lib/drive/types";
import { DriveShell } from "./_drive-shell";
import { SetupNeeded } from "./_setup-needed";

export const metadata: Metadata = { title: "Drive" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (v: string | undefined) => (v && UUID.test(v) ? v : null);

export default async function DrivePage({ searchParams }: { searchParams: Promise<{ view?: string; folder?: string; file?: string }> }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.claims.sub as string).maybeSingle();
  // Clients have no Drive (also enforced by every /api/drive route and by RLS).
  if (!isDriveStaffRole(profile?.role as string | null)) redirect(V2_ROUTES.DASHBOARD);

  // Probe a Drive table so an unapplied migration 166 shows a setup note instead of a raw error.
  const { error } = await supabase.from("drive_folders").select("id", { head: true, count: "exact" }).limit(1);
  if (error) {
    console.error("[drive] schema probe failed:", error.code, error.message);
    return <SetupNeeded detail={`${error.code}: ${error.message}`} />;
  }

  const sp = await searchParams;
  const view: DriveView = sp.view === "shared" ? "shared" : "mine";
  return <DriveShell initialView={view} initialFolderId={uuidOrNull(sp.folder)} initialFileId={uuidOrNull(sp.file)} />;
}
