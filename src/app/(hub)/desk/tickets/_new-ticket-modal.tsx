"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SearchableSelect } from "@/app/(hub)/projects/_shared/_searchable-select";
import { CreateTicketModal } from "@/app/(hub)/projects/_shared/_create-ticket-modal";
import type { MemberOptionWithRole } from "@/app/(hub)/projects/_shared/_project-detail";
import type { Ticket } from "@/app/(hub)/projects-old/_pm-shared";

// Task 383 — "New Ticket" from the Desk > Tickets cross-project listing. Same project-picker
// gate shape as the Inbox page's `_thread-to-project-modal.tsx` ("File a Ticket"), but with no
// subject/message to seed — a genuinely blank ticket, scoped only by the picked project. Kept as
// its own copy rather than a shared abstraction (page-scoped UI convention) since the two gates
// live on different pages with different seed data.
//
// Omitting `sourceTicketId` when handing off to `CreateTicketModal` is what makes the created
// ticket "Manual" (`tickets.source_inbox_id` stays null) — see `_filed-issues-table.tsx`'s
// Origin column.

type ProjectLite = { id: string; project_id: string; name: string };

type Bundle = { tickets: Ticket[]; members: MemberOptionWithRole[] };

export function NewTicketModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
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
      const [tickets, members] = await Promise.all([
        getJson<Ticket[]>("/tickets"),
        getJson<MemberOptionWithRole[]>("/members"),
      ]);
      setBundle({ tickets, members });
    } catch {
      setBundleError("Failed to load that project's data. Try again or pick another project.");
    } finally {
      setBundleLoading(false);
    }
  }

  if (bundle) {
    return (
      <CreateTicketModal
        projectId={projectId}
        allMembers={bundle.members}
        tickets={bundle.tickets}
        onClose={onClose}
        onCreated={() => {
          toast.success(`Ticket created in ${selectedProjectName}`);
          onCreated();
        }}
      />
    );
  }

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
          <h2 className="text-[15px] font-semibold text-[#0B1533]">New Ticket</h2>
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
            Pick which project this ticket belongs to — everything else (title, description,
            severity, assignee, due date) is filled in on the next step.
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
