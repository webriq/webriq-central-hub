"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import type { Milestone, Tasklist, Task } from "@/app/(hub)/projects-old/_pm-shared";
import type { MemberOptionWithRole } from "@/app/(hub)/projects/_shared/_project-detail";
import { CreateTaskModal } from "@/app/(hub)/projects/_shared/_create-task-modal";
import { SearchableSelect } from "@/app/(hub)/projects/_shared/_searchable-select";
import { useProjectsBase } from "@/app/(hub)/projects/[classification]/[projectId]/_use-projects-base";
import type { ProjectStatusReportItem } from "./_status-report-types";

// Task 479 — "New task" from the Status Report. Project picker gate (skipped when launched from a
// row's Tasks panel) → loads the project's milestones / task lists / members / tasks in parallel →
// hands off to the existing New Task modal, unchanged. Mirrors the Inbox "File a Ticket" gate
// (`desk/inbox/[inboxId]/_thread-to-project-modal.tsx`).

type Bundle = { milestones: Milestone[]; tasklists: Tasklist[]; members: MemberOptionWithRole[]; tasks: Task[] };

async function loadBundle(code: string): Promise<Bundle> {
  const getJson = async <T,>(path: string): Promise<T> => {
    const res = await fetch(`/api/v2/projects/${encodeURIComponent(code)}${path}`);
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return res.json() as Promise<T>;
  };
  const [milestones, tasklists, members, tasks] = await Promise.all([
    getJson<Milestone[]>("/milestones"),
    getJson<Tasklist[]>("/tasklists"),
    getJson<MemberOptionWithRole[]>("/members"),
    getJson<Task[]>("/tasks"),
  ]);
  return { milestones, tasklists, members, tasks };
}

export function NewTaskLauncher({
  project,
  pickable,
  onClose,
  onCreated,
}: {
  project: ProjectStatusReportItem | null;
  pickable: ProjectStatusReportItem[];
  onClose: () => void;
  onCreated: (projectCode: string) => void;
}) {
  const router = useRouter();
  const projectsBase = useProjectsBase();
  const [code, setCode] = useState(project?.projectId ?? "");
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);
  const target = project ?? pickable.find((p) => p.projectId === code) ?? null;

  function load(projectCode: string) {
    startTransition(async () => {
      try {
        setError(null);
        setBundle(await loadBundle(projectCode));
      } catch {
        setError(`Couldn't load this project's task lists and members. Try again${project ? "" : ", or pick another project"}.`);
      }
    });
  }

  // Launched from a row: there's nothing to pick, so start loading straight away.
  const fixedCode = project?.projectId ?? null;
  useEffect(() => {
    if (fixedCode) load(fixedCode);
    // `load` is recreated each render but only wraps stable setters; re-running on it would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedCode]);

  // Gate dialog keyboard: initial focus, Escape closes, Tab stays inside. The New Task modal
  // handles its own keyboard once it takes over.
  useEffect(() => {
    if (!bundle) dialogRef.current?.focus();
  }, [bundle]);

  useEffect(() => {
    if (bundle) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
      if (e.key !== "Tab" || !dialogRef.current) return;
      const items = dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])");
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bundle, loading, onClose]);

  if (bundle && target?.projectId) {
    const projectCode = target.projectId;
    return (
      <CreateTaskModal
        projectId={projectCode}
        milestones={bundle.milestones}
        tasklists={bundle.tasklists}
        tasks={bundle.tasks}
        allMembers={bundle.members}
        defaults={{}}
        onClose={onClose}
        onCreated={(t) => {
          const href = t.display_id ? `${projectsBase}/${projectCode}/tasks/${t.display_id}` : `${projectsBase}/${projectCode}/tasks`;
          toast.success(`Task created in ${target.projectName}`, { action: { label: "View", onClick: () => router.push(href) } });
          onCreated(projectCode);
        }}
        onTasklistCreated={(tl) => setBundle((b) => (b ? { ...b, tasklists: [...b.tasklists, tl] } : b))}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1533]/40 p-4" onClick={loading ? undefined : onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sr-new-task-title"
        className="w-full max-w-md rounded-[14px] bg-white border border-[#E2E7F2] shadow-[0_8px_24px_rgba(7,17,51,0.10)] overflow-hidden flex flex-col outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDF0F7]">
          <h2 id="sr-new-task-title" className="font-heading text-[15px] font-semibold tracking-[-0.01em] text-[#0B1533]">New task</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
            className="p-1 rounded-md text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#F4F6FB] disabled:opacity-45 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span id="sr-new-task-project" className="text-[11px] font-semibold text-[#0B1533]">Project</span>
            {project ? (
              <div aria-labelledby="sr-new-task-project" className="px-3 py-2 rounded-[10px] border border-[#E2E7F2] bg-[#F4F6FB] text-[13px] text-[#3A4565]">
                {project.projectName} <span className="text-[#5F6A88]">· {project.companyName}</span>
              </div>
            ) : pickable.length === 0 ? (
              <span className="text-[12px] text-[#5F6A88]">No projects in this report have a project code yet.</span>
            ) : (
              <SearchableSelect
                value={code}
                onChange={(v) => { setCode(v); setError(null); }}
                options={pickable.map((p) => ({ value: p.projectId as string, label: `${p.projectName} · ${p.companyName}` }))}
                placeholder="Select a project…"
                searchPlaceholder="Search projects…"
                disabled={loading}
              />
            )}
          </div>
          {error ? (
            <p role="alert" className="text-[12px] text-[#C0392B]">{error}</p>
          ) : (
            <p className="text-[12px] text-[#5F6A88]">The task is added to this project&apos;s Tasks tab.</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#EDF0F7] bg-[#FAFBFE]">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-full border border-[#E2E7F2] bg-white text-[12px] font-medium text-[#3A4565] hover:border-[#A8C6F5] disabled:opacity-45 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => code && load(code)}
            disabled={!code || loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#007BFF] text-white text-[12px] font-medium hover:bg-[#0063D6] disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]"
          >
            {loading && <Loader2 size={13} className="animate-spin motion-reduce:animate-none" />}
            {loading ? "Loading project…" : error ? "Try again" : "Continue to task details"}
          </button>
        </div>
      </div>
    </div>
  );
}
