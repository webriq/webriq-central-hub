import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { ensureEmployee } from "./employees";
import { tierForRole } from "./roles";
import type { HrViewer } from "./types";

export { MANAGER_ROLES, tierForRole } from "./roles";

/** Resolves the signed-in user's HR standing; null when signed out or a `client`. */
export const getHrViewer = cache(async (): Promise<HrViewer | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const profileId = claims?.claims?.sub as string | undefined;
  if (!profileId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", profileId)
    .maybeSingle();
  const role = profile?.role ?? null;
  const tier = role ? tierForRole(role) : null;
  if (!role || !tier) return null;

  const employeeId = await ensureEmployee(profileId, profile?.full_name ?? null);
  let hasDirectReports = false;
  if (employeeId) {
    const { count } = await supabase
      
      .from("hr_employees")
      .select("id", { count: "exact", head: true })
      .eq("manager_id", employeeId);
    hasDirectReports = (count ?? 0) > 0;
  }

  return { profileId, role, tier, employeeId, hasDirectReports, fullName: profile?.full_name ?? null };
});

export const isManager = (v: HrViewer) => v.tier === "manager";
/** Can this viewer see the all-requests queue (managers) or a direct-reports queue (A12)? */
export const canReviewRequests = (v: HrViewer) => v.tier === "manager" || v.hasDirectReports;
export const canSeeCalendar = (v: HrViewer) => v.tier === "manager" || v.tier === "pm";
