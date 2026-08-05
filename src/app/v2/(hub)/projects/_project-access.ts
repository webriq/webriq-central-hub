import { createClient } from "@/lib/supabase/server";

// Task 208 — developer-only project visibility. A developer can see/open a project if either
// they have a project_members row for it, or they're assigned to at least one task in it
// (tasks.assignees). project_members alone is too sparse to gate on: it's only populated by
// starting the onboarding programme or an explicit "Add Collaborators" call, not by task
// assignment, so most legacy Zoho-imported projects have zero rows there. Every other role
// (pm/marketing/admin/super_admin/client) is unrestricted.

export async function getDeveloperAccessibleProjectIds(userId: string): Promise<string[]> {
  const supabase = await createClient();

  const [{ data: memberRows }, { data: taskRows }] = await Promise.all([
    supabase.from("project_members").select("project_id").eq("user_id", userId),
    supabase.from("tasks").select("project_id").contains("assignees", [userId]),
  ]);

  const ids = new Set<string>();
  for (const row of memberRows ?? []) ids.add(row.project_id);
  for (const row of taskRows ?? []) ids.add(row.project_id);
  return [...ids];
}

export async function isProjectVisibleToCurrentUser(projectRowId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;
  if (!userId) return false;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (profile?.role !== "developer") return true;

  const [{ data: membership }, { data: assignedTask }] = await Promise.all([
    supabase.from("project_members").select("id").eq("project_id", projectRowId).eq("user_id", userId).maybeSingle(),
    supabase.from("tasks").select("id").eq("project_id", projectRowId).contains("assignees", [userId]).limit(1).maybeSingle(),
  ]);

  return !!membership || !!assignedTask;
}
