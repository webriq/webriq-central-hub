"use client";

import Link from "next/link";
import { Flag, CalendarClock, PlayCircle } from "lucide-react";

// Task 420 — extracted verbatim from `_generic-phase-view.tsx` (file-length guidance); no behaviour
// change. Both screens share the same centered-card shell.
function EmptyShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#F4F6FB] px-7 py-8">
      <div className="mx-auto max-w-[560px] rounded-2xl border border-[#E2E7F2] bg-white p-10 text-center shadow-[0_4px_24px_rgba(15,23,42,0.07)]">
        {children}
      </div>
    </div>
  );
}

const PRIMARY_BTN =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-[#007BFF] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(0,123,255,0.3)] transition-opacity hover:opacity-90";

export function GenericNotStartedScreen({
  name, companyName, scheduledStartAt, canManagePhases, starting, startError, onStart,
}: {
  name: string;
  companyName: string;
  scheduledStartAt: string | null;
  canManagePhases: boolean;
  starting: boolean;
  startError: string | null;
  onStart: () => void;
}) {
  const hasSchedule = !!scheduledStartAt;
  const scheduledDate = scheduledStartAt ? new Date(scheduledStartAt) : null;

  return (
    <EmptyShell>
      <CalendarClock size={32} className="mx-auto mb-4 text-[#5F6A88]" />
      <div className="text-lg font-bold text-[#0B1533]">{name}</div>
      <div className="mb-3 text-[13px] text-[#5F6A88]">{companyName}</div>

      {hasSchedule ? (
        <div className="mx-auto mb-6 max-w-md rounded-[10px] border border-[#F0D896] bg-[#FFF3D6] px-4 py-3 text-left">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#8A5A00]">
            <CalendarClock size={14} /> Scheduled to auto-start
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[#8A5A00]">
            Onboarding will start automatically on{" "}
            {scheduledDate?.toLocaleString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
            })}
            .
          </p>
        </div>
      ) : (
        <p className="mx-auto mb-6 max-w-md text-[13px] text-[#5F6A88]">
          Start onboarding to begin tracking this project&apos;s phases.
        </p>
      )}

      {startError && <p className="mb-3 text-xs text-[#C0392B]">{startError}</p>}

      {canManagePhases ? (
        <button type="button" onClick={onStart} disabled={starting} className={`${PRIMARY_BTN} disabled:opacity-50`}>
          <PlayCircle size={15} /> {starting ? "Starting…" : hasSchedule ? "Start Anyway" : "Start Onboarding"}
        </button>
      ) : (
        <p className="text-[12.5px] text-[#5F6A88]">Not started yet — Marketing manages the programme start date.</p>
      )}
    </EmptyShell>
  );
}

export function GenericNoPhasesScreen({
  name, companyName, projectUrlKey,
}: {
  name: string;
  companyName: string;
  projectUrlKey: string;
}) {
  return (
    <EmptyShell>
      <Flag size={32} className="mx-auto mb-4 text-[#5F6A88]" />
      <div className="text-lg font-bold text-[#0B1533]">{name}</div>
      <div className="mb-3 text-[13px] text-[#5F6A88]">{companyName}</div>
      <p className="mx-auto mb-6 max-w-md text-[13px] text-[#5F6A88]">
        No phases have been set up for this project yet. Add phases and set their Start and Due dates
        from the project&apos;s Milestones tab to start tracking progress here.
      </p>
      <Link href={`/projects/v2/${projectUrlKey}/milestones`} className={PRIMARY_BTN}>
        Go to Milestones
      </Link>
    </EmptyShell>
  );
}
