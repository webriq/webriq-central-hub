"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ClipboardList, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { Chip, PhaseChip } from "../../dashboard/_components/dashboard-shared";
import type { HealthTone, PhaseStatus, ProjectStatusReportItem } from "./_status-report-types";
import { HEALTH_LABEL, STATUS_LABEL, formatUsedAlloted } from "./_status-report-types";
import { AssigneeCell } from "./_status-report-assignee-cell";
import StatusReportRowDetail from "./_status-report-row-detail";

const STATUS_TONE: Record<PhaseStatus, "neutral" | "ok" | "late"> = {
  pending: "neutral",
  in_progress: "ok",
  completed: "ok",
  overdue: "late",
  skipped: "neutral",
};

const HEALTH_TONE: Record<Exclude<HealthTone, null>, "ok" | "warn" | "late"> = {
  on_track: "ok",
  at_risk: "warn",
  needs_attention: "late",
  ahead_of_schedule: "ok",
};

function PhaseMiniStrip({ project }: { project: ProjectStatusReportItem }) {
  return (
    <div className="flex items-center gap-1">
      {project.phases.map((ph) => (
        <div
          key={ph.phaseNumber}
          title={`${ph.name}: ${STATUS_LABEL[ph.status]}`}
          className={cn(
            "h-1.5 w-5 rounded-full",
            ph.status === "completed" && "bg-[#177E48]",
            ph.status === "overdue" && "bg-[#C0392B]",
            ph.status === "in_progress" && "bg-[#007BFF]",
            (ph.status === "pending" || ph.status === "skipped") && "bg-[#EDF0F7]"
          )}
        />
      ))}
    </div>
  );
}

type Props = {
  projects: ProjectStatusReportItem[];
  loading: boolean;
  canEditNotes: boolean;
  onNoteSaved: (projectId: string, phaseNumber: number, note: string | null) => void;
  hasAnyProjects: boolean;
  roleForEmptyState: string | null;
};

export default function StatusReportTable({ projects, loading, canEditNotes, onNoteSaved, hasAnyProjects, roleForEmptyState }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 rounded-[14px] animate-pulse motion-reduce:animate-none bg-[#EDF0F7]" />
        ))}
      </div>
    );
  }

  if (!hasAnyProjects) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center rounded-[14px] border border-[#E2E7F2] bg-white">
        <ClipboardList size={28} className="text-[#5F6A88] mb-3" />
        <p className="text-[13px] font-medium text-[#0B1533] mb-1">No clients in the 120-day programme yet</p>
        <p className="text-[12px] text-[#5F6A88] max-w-sm">
          {roleForEmptyState === "pm" || roleForEmptyState === "developer"
            ? "Projects appear here once their programme has started."
            : "Start a project's programme from the Portfolio Tracker to see it here."}
        </p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center rounded-[14px] border border-[#E2E7F2] bg-white">
        <ClipboardList size={28} className="text-[#5F6A88] mb-3" />
        <p className="text-[13px] font-medium text-[#0B1533] mb-1">No projects match these filters</p>
        <p className="text-[12px] text-[#5F6A88]">Try clearing search or filters.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[1080px]">
        <thead>
          <tr className="bg-[#FAFBFE] border-b border-[#EDF0F7]">
            <th className="w-8" />
            <th className="px-[18px] py-2.5 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Project</th>
            <th className="px-3 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Phases</th>
            <th className="px-3 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Current phase</th>
            <th className="px-3 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Used/Alloted</th>
            <th className="px-3 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Days left</th>
            <th className="px-3 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Assignee</th>
            <th className="px-3 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Health</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const isOpen = expanded.has(project.id);
            const cp = project.currentPhase;
            return (
              <Fragment key={project.id}>
                <tr
                  onClick={() => toggle(project.id)}
                  className="border-b border-[#EDF0F7] last:border-b-0 hover:bg-[#F0F7FF] transition-colors cursor-pointer"
                >
                  <td className="pl-[18px]">
                    <button
                      type="button"
                      aria-label={isOpen ? "Collapse phase detail" : "Expand phase detail"}
                      onClick={(e) => { e.stopPropagation(); toggle(project.id); }}
                      className="flex items-center justify-center w-6 h-6 rounded-full text-[#5F6A88] hover:bg-white cursor-pointer transition-colors"
                    >
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={`${V2_ROUTES.PORTFOLIO_TRACKER}/${project.projectId ?? project.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[13px] font-semibold text-[#0B1533] hover:text-[#007BFF] transition-colors"
                    >
                      {project.projectName}
                    </Link>
                    <div className="flex items-center gap-1 text-[11px] text-[#5F6A88] mt-0.5">
                      <Building2 size={11} /> {project.companyName}
                    </div>
                  </td>
                  <td className="px-3 py-3"><PhaseMiniStrip project={project} /></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <PhaseChip phaseNumber={cp.phaseNumber} phaseName={cp.name} />
                      <Chip tone={STATUS_TONE[cp.status]} dot={cp.status !== "completed" && cp.status !== "skipped"}>
                        {STATUS_LABEL[cp.status]}
                      </Chip>
                    </div>
                  </td>
                  <td className={cn("px-3 py-3 font-mono text-[11px]", formatUsedAlloted(cp).className)}>
                    {formatUsedAlloted(cp).text}
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px] text-[#3A4565]">
                    {project.isFullyCompleted ? "Complete" : `${project.programmeDaysLeft}d left`}
                  </td>
                  <td className="px-3 py-3"><AssigneeCell members={cp.assigneeMembers} placeholder={cp.assigneePlaceholder} /></td>
                  <td className="px-3 py-3">
                    {project.health ? (
                      <Chip tone={HEALTH_TONE[project.health]} dot>{HEALTH_LABEL[project.health]}</Chip>
                    ) : (
                      <span className="text-[12px] text-[#5F6A88]">—</span>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr key={`${project.id}-detail`} className="border-b border-[#EDF0F7] last:border-b-0">
                    <td colSpan={8} className="bg-[#FAFBFE] px-[18px] py-4">
                      <StatusReportRowDetail project={project} canEditNotes={canEditNotes} onNoteSaved={onNoteSaved} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
