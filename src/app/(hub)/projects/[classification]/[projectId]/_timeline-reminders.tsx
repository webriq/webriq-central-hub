import { AlertTriangle, Bell, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_PROGRAMME_DAYS, type PhaseConfig } from "@/config/customer-phases";
import { asReferenceDay, createProgrammeCalendar, phaseAtDisplayDay } from "@/lib/programme/calendar";
import { deliverableHealth } from "@/lib/programme/deliverable-health";

export type ReminderItem = { key: string; type: "warning" | "reminder" | "info" | "success"; title: string; body: string };

const MAX_REMINDERS = 5;

const REMINDER_STYLE: Record<ReminderItem["type"], { bg: string; border: string; title: string; icon: React.ReactNode }> = {
  warning: { bg: "bg-[#FFF3D6]", border: "border-[#F0D896]", title: "text-[#8A5A00]", icon: <AlertTriangle size={13} className="text-[#8A5A00]" /> },
  reminder: { bg: "bg-[#E5F1FF]", border: "border-[#BBDCFF]", title: "text-[#0063D6]", icon: <Bell size={13} className="text-[#007BFF]" /> },
  info: { bg: "bg-[#EDF0F7]", border: "border-[#E2E7F2]", title: "text-[#0B1533]", icon: <Info size={13} className="text-[#5F6A88]" /> },
  success: { bg: "bg-[#E3F5EA]", border: "border-[#BEE7CD]", title: "text-[#177E48]", icon: <CheckCircle2 size={13} className="text-[#177E48]" /> },
};

// Task 246: takes orderedPhases (this project's actual phase set, defaults + any customs,
// resolved + ordered by sort_order) instead of calling getPhaseByNumber directly — that call
// throws for a custom phase's number, which has no PROGRAMME_PHASES entry to look up.
// Task 429: expects DISPLAY-scale phases (stored days are already skip-compressed and duration-scaled) — a skipped phase's own
// dayStart/dayEnd is irrelevant here since phaseStatus never marks one "active".
// Task 422: deliverable reminders now cover whichever phase is active (previously Phase 1 only),
// worst first, capped at MAX_REMINDERS with the overflow count returned as `more`.
export function buildReminders(
  day: number,
  phaseStatus: Map<number, string>,
  deliverableStatus: Map<string, string>,
  orderedPhases: (PhaseConfig & { sortOrder: number })[],
  durationDays: number = DEFAULT_PROGRAMME_DAYS
): { items: ReminderItem[]; more: number } {
  // The fixed Phase 1 window (reference day 15) is the only value that still needs reference → display conversion.
  const calendar = createProgrammeCalendar({ durationDays });
  const toDisplay = (d: number) => d;
  const lastPhase = orderedPhases[orderedPhases.length - 1];
  if (lastPhase && phaseStatus.get(lastPhase.number) === "completed") {
    return { items: [{ key: "done", type: "success", title: "Programme complete", body: `All ${orderedPhases.length} phases delivered.` }], more: 0 };
  }
  const activePhaseNumber = [...phaseStatus.entries()].find(([, status]) => status === "active")?.[0];
  const phase =
    orderedPhases.find((p) => p.number === activePhaseNumber) ??
    orderedPhases.find((p) => day >= toDisplay(p.dayStart) && day <= toDisplay(p.dayEnd)) ??
    orderedPhases[0] ??
    phaseAtDisplayDay(day, durationDays);
  const items: ReminderItem[] = [];
  const phase1End = calendar.referenceToDisplay(asReferenceDay(15));
  // Phase 1 is a fixed window (15 reference days) — if it's still active well past that, this
  // project should already be in a later phase (e.g. a CSV-imported Kickoff Date that's more
  // than 15 days old). One clear phase-level warning here is more useful than 5+ individual
  // "Overdue: {deliverable}" entries competing for the reminder strip's slots.
  if (phase.number === 1 && day > phase1End) {
    items.push({
      key: "phase1-overdue",
      type: "warning",
      title: "Phase 1 Overdue",
      body: `Day ${day} — past the ${phase1End}-day Onboarding window. This project should already be in a later phase.`,
    });
  } else {
    const due: { item: ReminderItem; rank: number }[] = [];
    for (const d of phase.deliverables) {
      const status = deliverableStatus.get(d.key);
      const dStart = toDisplay(d.dayStart);
      const dEnd = toDisplay(d.dayEnd);
      const health = deliverableHealth({ dayStart: dStart, dayEnd: dEnd, currentDay: day, percentage: status === "done" ? 100 : 0 });
      const diff = dEnd - day;
      if (health === "overdue") {
        due.push({ rank: diff, item: { key: `overdue-${d.key}`, type: "warning", title: `Overdue: ${d.name}`, body: `Was due by Day ${dEnd}.` } });
      } else if (health !== "done" && diff <= 5) {
        const title = diff === 0 ? `Due today: ${d.name}` : `Due in ${diff} day${diff === 1 ? "" : "s"}: ${d.name}`;
        due.push({ rank: diff, item: { key: `due-${d.key}`, type: diff <= 2 ? "warning" : "reminder", title, body: d.description } });
      }
    }
    // Most overdue first, then soonest due.
    items.push(...due.sort((a, b) => a.rank - b.rank).map((x) => x.item));
  }
  if (day === phase1End && phaseStatus.get(1) !== "completed") items.push({ key: "gate15", type: "warning", title: `Gate — Day ${phase1End}`, body: "Client sign-off due before Phase 2 begins." });
  if (items.length === 0) {
    const daysLeft = Math.max(0, toDisplay(phase.dayEnd) - day);
    items.push({ key: "ontrack", type: "info", title: `On track — Phase ${phase.number}: ${phase.name}`, body: `${daysLeft} days remaining. Owner: ${phase.owner}.` });
  }
  return { items: items.slice(0, MAX_REMINDERS), more: Math.max(0, items.length - MAX_REMINDERS) };
}

export function ReminderStrip({ items, more }: { items: ReminderItem[]; more: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((r) => {
        const s = REMINDER_STYLE[r.type];
        return (
          <div key={r.key} className={cn("flex max-w-[320px] items-start gap-2 rounded-lg border px-3 py-2", s.bg, s.border)}>
            <div className="mt-0.5 shrink-0">{s.icon}</div>
            <div className="min-w-0">
              <div className={cn("text-[11.5px] font-semibold", s.title)}>{r.title}</div>
              <div className="text-[11px] text-[#5F6A88]">{r.body}</div>
            </div>
          </div>
        );
      })}
      {more > 0 && (
        <div className="flex items-center rounded-lg border border-[#E2E7F2] bg-[#EDF0F7] px-3 py-2 text-[11.5px] font-semibold text-[#5F6A88]">
          +{more} more
        </div>
      )}
    </div>
  );
}
