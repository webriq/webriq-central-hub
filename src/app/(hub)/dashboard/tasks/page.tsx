import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import { buildProjectHref, buildItemHref } from "@/lib/projects/deep-links";
import AllTasksIndex, { type AllTasksPaginationMeta, type AllTaskListItem } from "./_all-tasks-index";

// Task 385 — cross-project Tasks table (all tasks from all projects, sorted by created_at DESC).
// Replaces the Sprint 1A stub. Mirrors `src/app/(hub)/desk/tickets/page.tsx`'s exact shape
// (same role gate, same pagination/search pattern, same projects join) against `tasks` instead
// of `tickets` — Desk > Tickets is the precedent for a cross-project, non-project-scoped listing
// in this codebase.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tasks" };

type TaskRow = {
  id: string;
  title: string;
  display_id: string | null;
  status: string;
  priority: string | null;
  assignees: string[] | null;
  due_date: string | null;
  created_at: string;
  projects: { project_id: string; external_project_id: string | null; name: string } | null;
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; search?: string }>;
}) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = claims.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;

  // Same gate as Desk > Tickets (task 363) — developers keep their existing task view via the Dev
  // Dashboard "My Tasks" instead of this cross-project listing.
  if (role !== "admin" && role !== "super_admin" && role !== "pm") redirect(V2_ROUTES.DASHBOARD);

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const pageSize = Math.max(1, parseInt(params.pageSize ?? "20", 10));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const searchQ = params.search?.trim() ?? "";

  let query = supabase
    .from("tasks")
    .select(
      "id, title, display_id, status, priority, assignees, due_date, created_at, projects(project_id, external_project_id, name)",
      { count: "exact" }
    );
  if (searchQ) {
    const esc = searchQ.replace(/[%,()]/g, "");
    query = query.or(`title.ilike.%${esc}%,display_id.ilike.%${esc}%`);
  }

  const { data, count } = await query.order("created_at", { ascending: false }).range(from, to);
  const rows = (data ?? []) as unknown as TaskRow[];

  const tasks: AllTaskListItem[] = rows.map((t) => {
    const projectHref = buildProjectHref({
      projectDisplayId: t.projects?.project_id ?? null,
      isLegacy: !!t.projects?.external_project_id,
    });
    return {
      id: t.id,
      title: t.title,
      displayId: t.display_id,
      status: t.status,
      priority: t.priority,
      assignees: t.assignees,
      dueDate: t.due_date,
      createdAt: t.created_at,
      projectName: t.projects?.name ?? "—",
      projectHref,
      taskHref: buildItemHref(projectHref, "task", t.display_id),
    };
  });

  const paginationMeta: AllTasksPaginationMeta = { page, pageSize, total: count ?? 0 };

  return <AllTasksIndex tasks={tasks} paginationMeta={paginationMeta} />;
}
