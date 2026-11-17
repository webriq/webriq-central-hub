"use client";

import Link from "next/link";
import { ArrowRight, ListTodo, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Chip } from "@/app/(hub)/dashboard/_components/dashboard-shared";
import { PriorityBadge, STATUS_LABEL, decodeHtmlEntities, normalizeStatus, type Task, type TaskStatus } from "@/app/(hub)/projects-old/_pm-shared";
import { useProjectsBase } from "@/app/(hub)/projects/[classification]/[projectId]/_use-projects-base";
import type { ProjectStatusReportItem } from "./_status-report-types";
import { useStatusReportTasks } from "./_status-report-tasks-context";
import { PREVIEW_LIMIT, useProjectOpenTasks } from "./_use-project-open-tasks";

// Task 479 — the expanded row's Tasks panel: the project's most urgent open tasks, a link through
// to its Tasks tab, and "New task". Renders nothing outside `StatusReportTasksProvider` (the
// project's own Status Report tab), where the Tasks tab is already one click away.

const headLabel = "text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]";
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]";

// Same chip vocabulary as the phase table above: ok = moving, warn = waiting on review/sign-off.
const TASK_TONE: Record<string, "neutral" | "ok" | "warn"> = {
  open: "neutral",
  in_progress: "ok",
  testing_completed: "ok",
  ready_to_merge: "ok",
  ready_for_qa: "warn",
  for_client_approval: "warn",
  post_live_qa: "warn",
};

function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The row's due tag says how urgent it is in words, not just color: "3d overdue", "Due today", "Nov 21".
function dueTag(due: string | null): { text: string; className: string } {
  if (!due) return { text: "—", className: "text-[#5F6A88]" };
  const now = new Date();
  const today = localYmd(now);
  if (due === today) return { text: "Due today", className: "text-[#8A5A00] font-semibold" };
  const [y, m, d] = due.split("-").map(Number);
  const dueDate = new Date(y, m - 1, d);
  if (due < today) {
    const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - dueDate.getTime()) / 86_400_000);
    return { text: `${days}d overdue`, className: "text-[#C0392B] font-semibold" };
  }
  return { text: dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }), className: "text-[#3A4565]" };
}

function TaskPreviewRow({ task, href }: { task: Task; href: string }) {
  const title = decodeHtmlEntities(task.title);
  const due = dueTag(task.due_date?.slice(0, 10) ?? null);
  const status = normalizeStatus(task.status) as TaskStatus;
  // The whole row is the link's hit area (after:inset-0), so the hover tint never promises more than it delivers.
  return (
    <li className="relative flex items-center gap-3 px-3 py-2 border-b border-[#EDF0F7] last:border-b-0 hover:bg-[#F0F7FF] transition-colors">
      <span className="w-20 shrink-0 font-mono text-[10.5px] text-[#5F6A88] truncate">{task.display_id ?? "—"}</span>
      <Link href={href} title={title} className={cn("flex-1 min-w-0 truncate text-[13px] font-medium text-[#0B1533] hover:text-[#007BFF] transition-colors rounded-sm after:absolute after:inset-0", focusRing)}>
        {title}
      </Link>
      <span className="shrink-0"><Chip tone={TASK_TONE[status] ?? "neutral"} dot>{STATUS_LABEL[status] ?? status}</Chip></span>
      <span className="w-16 shrink-0"><PriorityBadge priority={task.priority} /></span>
      <span className={cn("w-24 shrink-0 text-right font-mono text-[11px]", due.className)}>{due.text}</span>
    </li>
  );
}

function NewTaskButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[11px] font-medium text-[#3A4565] hover:border-[#A8C6F5] hover:text-[#0B1533] cursor-pointer transition-colors", focusRing)}
    >
      <Plus size={12} aria-hidden="true" /> New task
    </button>
  );
}

function PanelBody({ project, ctx }: { project: ProjectStatusReportItem; ctx: NonNullable<ReturnType<typeof useStatusReportTasks>> }) {
  const projectsBase = useProjectsBase();
  const code = project.projectId;
  const { preview, openCount, totalCount, loading, error, retry } = useProjectOpenTasks(code, code ? ctx.refreshKey(code) : 0);
  const tasksHref = `${projectsBase}/${code}/tasks`;
  const showSkeleton = loading && preview.length === 0 && !error;

  return (
    <section aria-label={`Tasks for ${project.projectName}`} className="rounded-[10px] border border-[#EDF0F7] bg-white">
      <header className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[#EDF0F7]">
        <div className="flex items-center gap-2">
          <span className={headLabel}>Open tasks</span>
          {code && !showSkeleton && !error && (
            <span className="font-mono text-[10px] font-semibold px-1.5 py-px rounded-full bg-[#E5F1FF] text-[#0063D6]">{openCount}</span>
          )}
        </div>
        {/* The empty state carries its own New task button — don't show two. */}
        {code && (preview.length > 0 || showSkeleton || error) && <NewTaskButton onClick={() => ctx.openNewTask(project)} />}
      </header>

      {!code ? (
        <p className="px-3 py-4 text-[12px] text-[#5F6A88]">Tasks unavailable — add a project code to this project to track its tasks here.</p>
      ) : showSkeleton ? (
        <div className="p-3 space-y-2" role="status" aria-busy="true">
          <span className="sr-only">Loading tasks</span>
          {Array.from({ length: PREVIEW_LIMIT }, (_, i) => (
            <div key={i} className="h-5 rounded-md bg-[#EDF0F7] animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 px-3 py-4">
          <p role="alert" className="text-[12px] text-[#C0392B]">{error}</p>
          <button type="button" onClick={retry} className={cn("text-[12px] font-semibold text-[#0063D6] hover:text-[#007BFF] cursor-pointer transition-colors rounded-sm", focusRing)}>
            Retry
          </button>
        </div>
      ) : preview.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
          <ListTodo size={20} className="text-[#5F6A88]" aria-hidden="true" />
          <p className="text-[12px] text-[#3A4565]">No open tasks — add the next step for {project.projectName}.</p>
          <NewTaskButton onClick={() => ctx.openNewTask(project)} />
        </div>
      ) : (
        <ul>
          {preview.map((t) => (
            <TaskPreviewRow key={t.id} task={t} href={t.display_id ? `${tasksHref}/${t.display_id}` : tasksHref} />
          ))}
        </ul>
      )}

      {code && !error && totalCount > 0 && (
        <footer className="flex justify-end px-3 py-2 border-t border-[#EDF0F7] bg-[#FAFBFE] rounded-b-[10px]">
          <Link href={tasksHref} className={cn("inline-flex items-center gap-1 text-[12px] font-semibold text-[#0063D6] hover:text-[#007BFF] transition-colors rounded-sm", focusRing)}>
            {openCount > PREVIEW_LIMIT ? `See all ${openCount} open tasks` : "Open Tasks tab"}
            <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </footer>
      )}
    </section>
  );
}

export function StatusReportTasksPanel({ project }: { project: ProjectStatusReportItem }) {
  const ctx = useStatusReportTasks();
  if (!ctx) return null;
  return <PanelBody project={project} ctx={ctx} />;
}
