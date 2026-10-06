import { createClient } from "@/lib/supabase/server";
import { isProjectVisibleToCurrentUser } from "@/app/(hub)/projects-old/_project-access";
import { splitDeletedName } from "@/lib/projects/deleted-name";
import { excludingChecklist } from "@/lib/tasks/exclude-checklist";

// Task 415 — what the deleted-project landing view shows. Built only for a soft-deleted project
// (status = 'deleted') the current user could previously have viewed; anything else is null so the
// caller falls through to the standard 404 (no existence leak).
export type DeletedProjectRow = {
  id: string;
  name: string;
  project_id: string | null;
  status: string;
  customer_id: string | null;
  project_type: string | null;
  updated_at: string;
};

export type DeletedProjectSummary = {
  baseName: string;
  publicId: string | null;
  deletedOn: string;
  customerId: string | null;
  customerName: string | null;
  projectType: string | null;
  counts: { tasks: number; tickets: number; milestones: number };
};

export async function getDeletedProjectSummary(project: DeletedProjectRow): Promise<DeletedProjectSummary | null> {
  if (project.status !== "deleted") return null;
  if (!(await isProjectVisibleToCurrentUser(project.id))) return null;

  const supabase = await createClient();
  const head = { count: "exact", head: true } as const;
  const [customerRes, tasksRes, ticketsRes, milestonesRes] = await Promise.all([
    project.customer_id
      ? supabase.from("customers").select("company_name").eq("customer_id", project.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    excludingChecklist((exclude) => {
      const q = supabase.from("tasks").select("id", head).eq("project_id", project.id);
      return exclude ? q.eq("kind", "task") : q;
    }),
    supabase.from("tickets").select("id", head).eq("project_id", project.id),
    supabase.from("milestones").select("id", head).eq("project_id", project.id),
  ]);

  const { baseName, deletedOn } = splitDeletedName(project.name);
  return {
    baseName,
    publicId: project.project_id,
    deletedOn: deletedOn ?? project.updated_at,
    customerId: customerRes.data ? project.customer_id : null,
    customerName: customerRes.data?.company_name ?? null,
    projectType: project.project_type,
    counts: {
      tasks: tasksRes.count ?? 0,
      tickets: ticketsRes.count ?? 0,
      milestones: milestonesRes.count ?? 0,
    },
  };
}
