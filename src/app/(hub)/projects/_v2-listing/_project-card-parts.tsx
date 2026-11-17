"use client";

// Task 480 — pieces shared by the grid card (_project-card.tsx) and the list row
// (_project-row.tsx), so the progress/phase rules and the open/menu wrapper live in one place.

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PhaseChip } from "../../dashboard/_components/dashboard-shared";
import type { OnboardingProjectListItem } from "./_onboarding-list";
import { useProjectsBase } from "@/app/(hub)/projects/[classification]/[projectId]/_use-projects-base";

export type ProjectListEntryProps = {
  item: OnboardingProjectListItem;
  editable: boolean;
  canDelete: boolean;
  canManageCollaborators: boolean;
  canSetOwner: boolean;
  onDeleted: () => void;
  onSearchName: (name: string) => void;
};

export function showProjectMenu(p: Pick<ProjectListEntryProps, "item" | "canDelete" | "canManageCollaborators" | "canSetOwner">) {
  return (p.canDelete && !!p.item.project_id) || p.canManageCollaborators || p.canSetOwner;
}

// YYYY-MM-DD as a local calendar date (no UTC shift).
function formatYmdShort(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Progress bar + Day label. `barClassName` sizes the bar (flex-1 in the card, fixed in the row).
// `labelClassName` lets the list row give the Day label a fixed width so bars line up across rows.
export function ProjectProgress({ item, className, barClassName = "flex-1", labelClassName }: {
  item: OnboardingProjectListItem;
  className?: string;
  barClassName?: string;
  labelClassName?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("h-1.5 rounded-full overflow-hidden bg-[#EDF0F7]", barClassName)}>
        <div className="h-full rounded-full bg-[#007BFF] transition-[width] duration-300" style={{ width: `${item.current_day ? item.progress_pct : 0}%` }} />
      </div>
      {item.actual_day && item.programme_end_date && item.actual_day > item.programme_duration_days ? (
        <span className={cn("text-[11px] font-mono shrink-0 text-[#C0392B]", labelClassName)}>
          Day {item.actual_day} · ended {formatYmdShort(item.programme_end_date)}
        </span>
      ) : (
        <span className={cn("text-[11px] font-mono shrink-0 text-[#5F6A88]", labelClassName)}>
          {item.current_day ? `Day ${item.current_day}/${item.programme_duration_days}` : `Day —/${item.programme_duration_days}`}
        </span>
      )}
    </div>
  );
}

// Phase / status line — active phase (+ handover in Phase 1), scheduled start, or awaiting kickoff.
export function ProjectPhaseLine({ item, className }: { item: OnboardingProjectListItem; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5 text-[11.5px] text-[#5F6A88] min-h-[17px]", className)}>
      {item.current_day ? (
        <>
          {item.current_phase_number && item.current_phase_name ? (
            <PhaseChip phaseNumber={item.current_phase_number} phaseName={item.current_phase_name} />
          ) : (
            <span>Onboarding</span>
          )}
          {item.current_phase_number === 1 && item.target_handover_date && (
            <span className="whitespace-nowrap">· Handover ~{formatDate(item.target_handover_date)}</span>
          )}
        </>
      ) : item.scheduled_onboarding_start_at ? (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[#B85512]">
          <CalendarClock size={12} /> Starts {new Date(item.scheduled_onboarding_start_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Clock3 size={12} /> Awaiting kickoff
        </span>
      )}
    </div>
  );
}

// The menu is rendered as a sibling here, outside the clickable wrapper below — never nested
// inside it. A <button> cannot contain another <button> (invalid HTML; browsers force-close the
// outer one), so PortfolioCardMenu's own trigger button must live outside the clickable
// wrapper, overlaid via absolute positioning instead (task 233). `menuClassName` positions it.
//
// The wrapper itself is a <div role="button">, not a real <button> (Post-QA Round 4, task 268)
// — the content also nests EditableProjectTitle's `<input>` while renaming, and a real <button>
// element has a native "Space/Enter activates" behavior that fires independent of this
// component's own event handling: it triggered even when a nested descendant (the rename
// input) had focus and called stopPropagation(), reported live as Space/Enter redirecting to
// the project detail page mid-rename instead of typing/saving. A plain div has no such built-in
// default action — keyboard activation (Enter only, matching link/button convention) is
// implemented manually below and correctly respects the input's stopPropagation().
export function ProjectOpenWrapper({ item, editable, menu, menuClassName, className, children }: {
  item: OnboardingProjectListItem;
  editable: boolean;
  menu: ReactNode | null;
  menuClassName: string;
  className?: string;
  children: ReactNode;
}) {
  const projectsBase = useProjectsBase();
  const router = useRouter();
  // Task 282 (item E) — V2's default landing tab is now Timeline, not Overview.
  const open = () => router.push(`${projectsBase}/${item.project_id ?? item.id}/timeline`);

  return (
    <div className={cn("relative", className)}>
      {editable ? (
        <div
          role="button"
          tabIndex={0}
          onClick={open}
          onKeyDown={(e) => { if (e.key === "Enter") open(); }}
          className="h-full text-left w-full bg-transparent border-none p-0 cursor-pointer rounded-[14px] outline-none focus-visible:ring-[3px] focus-visible:ring-[#007BFF]/30"
        >
          {children}
        </div>
      ) : (
        <div className="h-full">{children}</div>
      )}
      {menu && <div className={cn("absolute", menuClassName)}>{menu}</div>}
    </div>
  );
}
