"use client";

import { cn } from "@/lib/utils";
import { Chip, PhaseChip } from "@/app/(hub)/dashboard/_components/dashboard-shared";
import type { HealthTone, PhaseStatus, ProjectStatusReportItem } from "./_status-report-types";
import { HEALTH_LABEL, STATUS_LABEL, formatUsedAlloted } from "./_status-report-types";
import { AssigneeCell } from "./_status-report-assignee-cell";
import { NoteCell } from "./_status-report-note-cell";

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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function StatusReportRowDetail({
  project,
  canEditNotes,
  onNoteSaved,
}: {
  project: ProjectStatusReportItem;
  canEditNotes: boolean;
  onNoteSaved: (projectId: string, phaseNumber: number, note: string | null) => void;
}) {
  return (
    <div className="rounded-[10px] border border-[#EDF0F7] bg-white overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-235">
        <thead>
          <tr className="border-b border-[#EDF0F7]">
            <th className="px-3 py-2 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Phase</th>
            <th className="px-3 py-2 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Status</th>
            <th className="px-3 py-2 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Started</th>
            <th className="px-3 py-2 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Completed</th>
            <th className="px-3 py-2 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Used/Alloted</th>
            <th className="px-3 py-2 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Assignee</th>
            <th className="px-3 py-2 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Health</th>
            <th className="px-3 py-2 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Notes</th>
          </tr>
        </thead>
        <tbody>
          {project.phases.map((ph) => (
            <tr key={ph.phaseNumber} className="border-b border-[#EDF0F7] last:border-b-0">
              <td className="px-3 py-2.5"><PhaseChip phaseNumber={ph.phaseNumber} phaseName={ph.name} /></td>
              <td className="px-3 py-2.5">
                <Chip tone={STATUS_TONE[ph.status]} dot={ph.status !== "completed" && ph.status !== "skipped"}>
                  {STATUS_LABEL[ph.status]}
                </Chip>
              </td>
              <td className="px-3 py-2.5 font-mono text-[11px] text-[#3A4565]">{formatDate(ph.actualStartDate)}</td>
              <td className="px-3 py-2.5 font-mono text-[11px] text-[#3A4565]">
                {ph.status === "completed" ? formatDate(ph.actualCompletedDate) : "—"}
              </td>
              <td className={cn("px-3 py-2.5 font-mono text-[11px]", formatUsedAlloted(ph).className)}>
                {formatUsedAlloted(ph).text}
              </td>
              <td className="px-3 py-2.5"><AssigneeCell members={ph.assigneeMembers} placeholder={ph.assigneePlaceholder} /></td>
              <td className="px-3 py-2.5">
                {ph.health ? <Chip tone={HEALTH_TONE[ph.health]} dot>{HEALTH_LABEL[ph.health]}</Chip> : <span className="text-[12px] text-[#5F6A88]">—</span>}
              </td>
              <td className="px-3 py-2.5">
                <NoteCell projectId={project.id} phase={ph} canEdit={canEditNotes} onSaved={onNoteSaved} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
