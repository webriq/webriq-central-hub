import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isProjectVisibleToCurrentUser } from "../_project-access";
import type { Project, Milestone, Tasklist, Task, Issue } from "../_pm-shared";

export type ProjectDetailData = {
  project: Project;
  companyName: string;
  initialMilestones: Milestone[];
  initialTasklists: Tasklist[];
  initialTasks: Task[];
  initialIssues: Issue[];
  currentUserId: string;
  currentUserRole: string | null;
  profilesById: Record<string, { full_name: string; avatar_url: string | null }>;
  allMembers: { id: string; full_name: string | null; avatar_url: string | null; role: string }[];
  initialHoursById: Record<string, number>;
};

export async function getProjectDetailData(projectId: string): Promise<ProjectDetailData | null> {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("project_id", projectId)
    .single();

  if (!project) return null;
  if (!(await isProjectVisibleToCurrentUser(project.id))) return null;

  const { data: claimsData } = await supabase.auth.getClaims();
  const currentUserId = (claimsData?.claims?.sub as string | undefined) ?? "";

  const [milestonesRes, tasklistsRes, tasksRes, issuesRes, customerRes, profilesRes, timeLogsRes] = await Promise.all([
    supabase
      .from("milestones")
      .select("*")
      .eq("project_id", project.id)
      .order("position", { ascending: true, nullsFirst: false }),
    supabase
      .from("tasklists")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("tasks")
      .select("*")
      .eq("project_id", project.id)
      .order("position", { ascending: true, nullsFirst: false }),
    supabase
      .from("issues")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false }),
    supabase.from("customers").select("company_name").eq("customer_id", project.customer_id).single(),
    // profiles' own RLS (profiles_read_own) only lets a caller read their own row —
    // adminClient bypasses that for this read-only display lookup (assignee/member names).
    adminClient.from("profiles").select("id, full_name, avatar_url, role").in("role", ["developer", "pm", "admin", "super_admin"]).order("full_name", { ascending: true }),
    supabase.from("time_logs").select("task_id, hours").eq("project_id", project.id),
  ]);

  const profilesById: Record<string, { full_name: string; avatar_url: string | null }> = {};
  for (const p of (profilesRes.data ?? [])) {
    profilesById[p.id] = { full_name: p.full_name ?? "", avatar_url: p.avatar_url ?? null };
  }

  const hoursById: Record<string, number> = {};
  for (const row of (timeLogsRes.data ?? [])) {
    if (row.task_id) hoursById[row.task_id] = (hoursById[row.task_id] ?? 0) + row.hours;
  }

  // Task 209 — derived from allMembers (already fetched above), no extra query.
  const currentUserRole = (profilesRes.data ?? []).find((p) => p.id === currentUserId)?.role ?? null;

  return {
    project,
    companyName: customerRes.data?.company_name ?? project.customer_id,
    initialMilestones: milestonesRes.data ?? [],
    initialTasklists: tasklistsRes.data ?? [],
    initialTasks: tasksRes.data ?? [],
    initialIssues: issuesRes.data ?? [],
    currentUserId,
    currentUserRole,
    profilesById,
    allMembers: profilesRes.data ?? [],
    initialHoursById: hoursById,
  };
}
