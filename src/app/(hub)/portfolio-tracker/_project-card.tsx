"use client";

import { useRouter } from "next/navigation";
import { Building2, CalendarClock, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { Chip, PhaseChip, OnboardingStatusPill } from "../dashboard/_components/dashboard-shared";
import { AvatarStack } from "./_avatar-stack";
import { PortfolioCardMenu } from "./_portfolio-card-menu";
import type { OnboardingProjectListItem } from "./_onboarding-list";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Fixed 4-slot layout — header / company / progress-or-status row / phase row / footer — always
// rendered (never conditionally omitted) so every card in a grid row is the same height
// regardless of project state. See task 167.
export function ProjectCard({
  item, editable, canDelete, canManageCollaborators, onDeleted,
}: {
  item: OnboardingProjectListItem;
  editable: boolean;
  canDelete: boolean;
  canManageCollaborators: boolean;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const showMenu = (canDelete && !!item.project_id) || canManageCollaborators;

  const content = (
    <div
      className={cn(
        "h-full flex flex-col rounded-[14px] border bg-white p-4 transition-colors",
        editable ? "border-[#E2E7F2] hover:border-[#A8C6F5] cursor-pointer" : "border-[#EDF0F7]"
      )}
    >
      {/* Header: title + status */}
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[#0B1533] truncate">{item.project_name}</div>
          <div className="inline-flex items-center gap-1 text-[12px] text-[#5F6A88] truncate">
            <Building2 size={11} /> {item.company_name}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <OnboardingStatusPill status={item.status} />
          {/* Reserves room for the overlaid PortfolioCardMenu (rendered as a sibling outside this
              card's button, not nested inside it — see the return below) so the status pill shifts
              left instead of being covered. */}
          {showMenu && <div className="w-6 h-6" />}
        </div>
      </div>

      {/* Progress row — always present */}
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-[#EDF0F7]">
          <div className="h-full rounded-full bg-[#007BFF] transition-[width] duration-300" style={{ width: `${item.current_day ? item.progress_pct : 0}%` }} />
        </div>
        <span className="text-[11px] font-mono shrink-0 text-[#5F6A88]">
          {item.current_day ? `Day ${item.current_day}/${item.programme_duration_days}` : `Day —/${item.programme_duration_days}`}
        </span>
      </div>

      {/* Phase / status line — always present, one line */}
      <div className="flex items-center gap-1.5 text-[11.5px] text-[#5F6A88] min-h-[17px] mb-3">
        {item.current_day ? (
          <>
            {item.current_phase_number && item.current_phase_name ? (
              <PhaseChip phaseNumber={item.current_phase_number} phaseName={item.current_phase_name} />
            ) : (
              <span>Onboarding</span>
            )}
            {item.current_phase_number === 1 && item.target_handover_date && (
              <span>· Handover ~{formatDate(item.target_handover_date)}</span>
            )}
          </>
        ) : item.scheduled_onboarding_start_at ? (
          <span className="inline-flex items-center gap-1.5 text-[#B85512]">
            <CalendarClock size={12} /> Starts {new Date(item.scheduled_onboarding_start_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Clock3 size={12} /> Awaiting kickoff
          </span>
        )}
      </div>

      {/* Footer — always present */}
      <div className="mt-auto pt-2.5 border-t border-[#EDF0F7] flex items-center justify-between gap-2">
        {item.classification ? <Chip tone="neutral">{item.classification}</Chip> : <span className="text-[11px] text-[#5F6A88]">Unclassified</span>}
        <AvatarStack members={item.members} />
      </div>
    </div>
  );

  // The menu is rendered as a sibling here, outside the button below — never nested inside it.
  // A <button> cannot contain another <button> (invalid HTML; browsers force-close the outer one),
  // so PortfolioCardMenu's own trigger button must live outside this card's clickable wrapper,
  // overlaid via absolute positioning instead (task 233).
  return (
    <div className="relative h-full">
      {editable ? (
        <button
          onClick={() => router.push(`${V2_ROUTES.PORTFOLIO_TRACKER}/${item.project_id ?? item.id}`)}
          className="h-full text-left w-full bg-transparent border-none p-0 cursor-pointer"
        >
          {content}
        </button>
      ) : (
        <div className="h-full">{content}</div>
      )}
      {showMenu && (
        <div className="absolute top-4 right-4">
          <PortfolioCardMenu
            projectId={item.project_id}
            projectDbId={item.id}
            projectName={item.project_name}
            canDelete={canDelete && !!item.project_id}
            canManageCollaborators={canManageCollaborators}
            onDeleted={onDeleted}
          />
        </div>
      )}
    </div>
  );
}
