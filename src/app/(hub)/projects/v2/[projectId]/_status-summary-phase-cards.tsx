"use client";

import { cn } from "@/lib/utils";
import { Chip, PhaseChip } from "@/app/(hub)/dashboard/_components/dashboard-shared";
import type { HealthTone, PhaseStatus, ProjectStatusReportItem } from "@/app/(hub)/projects/v2/status-report/_status-report-types";
import { HEALTH_LABEL, STATUS_LABEL, formatUsedAlloted } from "@/app/(hub)/projects/v2/status-report/_status-report-types";
import { AssigneeCell } from "@/app/(hub)/projects/v2/status-report/_status-report-assignee-cell";
import { NoteCell } from "@/app/(hub)/projects/v2/status-report/_status-report-note-cell";

// Same tone maps as _status-report-row-detail.tsx's table (task 221) — duplicated locally rather
// than shared, matching that file's own convention of page-scoped lookup maps.
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

function StatBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] mb-1">{label}</div>
      <div className="text-[12px]">{children}</div>
    </div>
  );
}

// Splits formatUsedAlloted()'s combined "6/15d (9d remaining)" string so the parenthetical can
// break onto its own line at a smaller size instead of wrapping mid-sentence in the card's
// narrower stat-grid column (the Status Report table's wider cell never needed this).
function UsedAllotedValue({ phase }: { phase: ProjectStatusReportItem["phases"][number] }) {
  const { text, className } = formatUsedAlloted(phase);
  const parenIndex = text.indexOf(" (");
  if (parenIndex === -1) return <span className={cn("font-mono font-bold", className)}>{text}</span>;

  return (
    <span className={cn("font-mono", className)}>
      <span className="font-bold">{text.slice(0, parenIndex)}</span>
      <br />
      <span className="text-[10px]">{text.slice(parenIndex + 1)}</span>
    </span>
  );
}

export function StatusSummaryPhaseCards({
  project,
  canEditNotes,
  onNoteSaved,
}: {
  project: ProjectStatusReportItem;
  canEditNotes: boolean;
  onNoteSaved: (projectId: string, phaseNumber: number, note: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {project.phases.map((ph) => (
        <div
          key={ph.phaseNumber}
          className="rounded-[12px] border border-[#EDF0F7] bg-white p-4"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <PhaseChip phaseNumber={ph.phaseNumber} phaseName={ph.name} />
            <Chip tone={STATUS_TONE[ph.status]} dot={ph.status !== "completed" && ph.status !== "skipped"}>
              {STATUS_LABEL[ph.status]}
            </Chip>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 mb-3">
            <StatBlock label="Started">
              <span className="font-mono text-[#3A4565]">{formatDate(ph.actualStartDate)}</span>
            </StatBlock>
            <StatBlock label="Completed">
              <span className="font-mono text-[#3A4565]">
                {ph.status === "completed" ? formatDate(ph.actualCompletedDate) : "—"}
              </span>
            </StatBlock>
            <StatBlock label="Used / Alloted">
              <UsedAllotedValue phase={ph} />
            </StatBlock>
            <StatBlock label="Assignee">
              <AssigneeCell members={ph.assigneeMembers} placeholder={ph.assigneePlaceholder} />
            </StatBlock>
            <StatBlock label="Health">
              {ph.health ? (
                <Chip tone={HEALTH_TONE[ph.health]} dot>{HEALTH_LABEL[ph.health]}</Chip>
              ) : (
                <span className="text-[#5F6A88]">—</span>
              )}
            </StatBlock>
          </div>

          <div className="pt-3 border-t border-[#EDF0F7]">
            <div className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] mb-1">Notes</div>
            <NoteCell projectId={project.id} phase={ph} canEdit={canEditNotes} onSaved={onNoteSaved} />
          </div>
        </div>
      ))}
    </div>
  );
}
