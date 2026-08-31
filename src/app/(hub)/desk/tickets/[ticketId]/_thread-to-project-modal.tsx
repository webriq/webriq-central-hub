"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SearchableSelect } from "@/app/(hub)/projects/_shared/_searchable-select";
import { CreateTaskModal } from "@/app/(hub)/projects/_shared/_create-task-modal";
import { CreateIssueModal } from "@/app/(hub)/projects/_shared/_create-issue-modal";
import type { MemberOptionWithRole } from "@/app/(hub)/projects/_shared/_project-detail";
import type { Milestone, Tasklist, Task, Issue } from "@/app/(hub)/projects-old/_pm-shared";
import { sanitizeMessageHtml } from "./_message-html";
import type { MessageItem } from "./_conversation-thread";

// Task 333 — "Create Task" / "File an Issue" from a customer-authored ticket thread message.
// This is the project-picker gate that fronts the Projects New Task / New Issue modals: pick a
// project (searchable), then it loads that project's data bundle and hands off to the real
// modal with Title seeded from the ticket Subject and Description seeded from the message body.
// The Projects modals are reused verbatim (only two optional seed props were added there).

type Mode = "task" | "issue";

type ProjectLite = { id: string; project_id: string; name: string };

type Bundle =
  | { mode: "task"; milestones: Milestone[]; tasklists: Tasklist[]; tasks: Task[]; members: MemberOptionWithRole[] }
  | { mode: "issue"; issues: Issue[]; members: MemberOptionWithRole[] };

export function ThreadToProjectModal({
  mode,
  subject,
  message,
  onClose,
}: {
  mode: Mode;
  subject: string;
  message: MessageItem;
  onClose: () => void;
}) {
  const [projects, setProjects] = useState<ProjectLite[] | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v2/projects");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = (await res.json()) as ProjectLite[];
        if (cancelled) return;
        setProjects(
          rows
            .filter((p) => !!p.project_id)
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      } catch {
        if (!cancelled) setProjectsError("Failed to load projects. Close and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProjectName = projects?.find((p) => p.project_id === projectId)?.name ?? "the project";

  async function loadBundleAndContinue() {
    if (!projectId) return;
    setBundleLoading(true);
    setBundleError(null);
    try {
      const getJson = async <T,>(path: string): Promise<T> => {
        const res = await fetch(`/api/v2/projects/${projectId}${path}`);
        if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
        return res.json() as Promise<T>;
      };
      if (mode === "task") {
        const [milestones, tasklists, tasks, members] = await Promise.all([
          getJson<Milestone[]>("/milestones"),
          getJson<Tasklist[]>("/tasklists"),
          getJson<Task[]>("/tasks"),
          getJson<MemberOptionWithRole[]>("/members"),
        ]);
        setBundle({ mode: "task", milestones, tasklists, tasks, members });
      } else {
        const [issues, members] = await Promise.all([
          getJson<Issue[]>("/issues"),
          getJson<MemberOptionWithRole[]>("/members"),
        ]);
        setBundle({ mode: "issue", issues, members });
      }
    } catch {
      setBundleError("Failed to load that project's data. Try again or pick another project.");
    } finally {
      setBundleLoading(false);
    }
  }

  if (bundle && bundle.mode === "task") {
    return (
      <CreateTaskModal
        projectId={projectId}
        milestones={bundle.milestones}
        tasklists={bundle.tasklists}
        tasks={bundle.tasks}
        allMembers={bundle.members}
        defaults={{}}
        defaultTitle={subject}
        defaultDescription={message.isHtml ? sanitizeMessageHtml(message.body) : message.body}
        onClose={onClose}
        onCreated={() => {
          toast.success(`Task created in ${selectedProjectName}`);
          onClose();
        }}
        onTasklistCreated={() => {}}
      />
    );
  }

  if (bundle && bundle.mode === "issue") {
    return (
      <CreateIssueModal
        projectId={projectId}
        allMembers={bundle.members}
        issues={bundle.issues}
        defaultTitle={subject}
        // Task 338 made the New Issue modal's Description a Tiptap RTE (same as New Task), so it
        // now takes the sanitized message HTML directly — keeping inline images and paragraph
        // spacing — instead of a flattened plain-text conversion.
        defaultDescription={message.isHtml ? sanitizeMessageHtml(message.body) : message.body}
        onClose={onClose}
        onCreated={() => {
          toast.success(`Issue created in ${selectedProjectName}`);
          onClose();
        }}
      />
    );
  }

  const heading = mode === "task" ? "Create Task from message" : "File an Issue from message";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1533]/40 p-4"
      onClick={bundleLoading ? undefined : onClose}
    >
      <div
        className="w-full max-w-md rounded-[14px] bg-white shadow-xl border border-[#E2E7F2] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDF0F7]">
          <h2 className="text-[15px] font-semibold text-[#0B1533]">{heading}</h2>
          <button
            onClick={onClose}
            disabled={bundleLoading}
            aria-label="Close"
            className="p-1 rounded-md text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#F4F6FB] disabled:opacity-40 cursor-pointer transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-[#0B1533]">Project</span>
            {projectsError ? (
              <span className="text-[12px] text-[#C0392B]">{projectsError}</span>
            ) : projects === null ? (
              <span className="inline-flex items-center gap-2 text-[12px] text-[#5F6A88]">
                <Loader2 size={13} className="animate-spin" /> Loading projects…
              </span>
            ) : projects.length === 0 ? (
              <span className="text-[12px] text-[#5F6A88]">No projects available.</span>
            ) : (
              <SearchableSelect
                value={projectId}
                onChange={(v) => {
                  setProjectId(v);
                  setBundleError(null);
                }}
                options={projects.map((p) => ({ value: p.project_id, label: p.name }))}
                placeholder="Select a project…"
                searchPlaceholder="Search projects…"
                disabled={bundleLoading}
              />
            )}
          </label>

          <p className="text-[12px] text-[#5F6A88]">
            The title will be pre-filled from the ticket subject and the description from this
            message — both editable on the next step.
          </p>

          {bundleError && <p className="text-[12px] text-[#C0392B]">{bundleError}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EDF0F7] bg-[#F4F6FB]">
          <button
            onClick={onClose}
            disabled={bundleLoading}
            className="px-4 py-2 rounded-full text-[13px] text-[#3A4565] bg-white border border-[#E2E7F2] hover:border-[#A8C6F5] disabled:opacity-40 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={loadBundleAndContinue}
            disabled={!projectId || bundleLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#007BFF] text-white text-[13px] font-medium hover:bg-[#0063D6] disabled:opacity-45 cursor-pointer transition-colors"
          >
            {bundleLoading && <Loader2 size={14} className="animate-spin" />} Continue
          </button>
        </div>
      </div>
    </div>
  );
}
