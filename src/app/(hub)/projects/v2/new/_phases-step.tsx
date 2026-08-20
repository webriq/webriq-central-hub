"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Classification } from "@/config/customer-phases";
import PhaseBuilder from "./_phase-builder";
import { DateTimePicker } from "./_date-time-picker";
import {
  defaultPhasePlanDraft,
  emptyPhasePlanDraft,
  programmeDurationError,
  extendLastPhaseToDuration,
  scheduledStartError,
  type TypeCardState,
  type PhaseDraft,
} from "./_new-project-types";

// Chat follow-up: shared wording for the "last phase was stretched" notice — fired both when the
// Programme duration field itself is raised past the last phase's end day, and when the "skip
// this phase" checkbox's repack cascade leaves the new last phase short (see PhaseBuilder's
// onLastPhaseExtended). Neutral about the trigger since it isn't always a duration-field edit.
function lastPhaseExtendedNotice(previousDayEnd: number, durationDays: number): string {
  return `The last phase (previously ending Day ${previousDayEnd}) was extended to Day ${durationDays} to fill the full Programme duration.`;
}

// ─── Step 3: Phases & Deliverables ─────────────────────────────────────────────
// Task 244: extracted out of the old Step 2 ("Project Details"), which stacked every selected
// type's full phase/deliverable/checklist tree inline with its name/duration fields — the primary
// source of the wizard's excessive scroll. Each selected type now gets its own collapsible
// section here; the first is expanded by default, the rest start collapsed, so a multi-type
// submission doesn't force scrolling past N full builders to reach the one you're editing.
//
// Task 245/246 (Confirmed UI Requirement 1): duration/start-mode/schedule/"start at phase" now
// render BELOW the phase builder, not above it — "Start at phase" can't be meaningfully chosen
// until the phases it selects among have actually been entered. StackShift II's "generate default
// phases" checkbox stays above the builder (it determines the builder's mode, so must be decided
// first).
//
// selectStartPhase below (Confirmed UI Requirements 2/3): "Start at phase" options come from this
// card's own phasePlan (defaults + any customs, task 246) instead of a hardcoded PROGRAMME_PHASES
// list, and selecting a phase other than the first auto-excludes (included: false) every phase
// before it in the array — the wizard's own summary/preview reflects the cascade immediately,
// before submission.

export default function PhasesStep({
  selectedTypes,
  cardsByType,
  onChangeCard,
  getDisplayName,
  canManagePhases,
  scheduleMin,
  scheduleMax,
}: {
  selectedTypes: Classification[];
  cardsByType: Partial<Record<Classification, TypeCardState>>;
  onChangeCard: (classification: Classification, next: TypeCardState) => void;
  // Chat follow-up: same name-resolution _content.tsx's TypeConfigCard already uses (company name
  // + type-derived suffix, unless the PM typed their own) — reused here so each section's header
  // reads "ABC Company Test Website · StackShift I" instead of just the bare type.
  getDisplayName: (classification: Classification, card: TypeCardState) => string;
  canManagePhases: boolean;
  scheduleMin: Date;
  scheduleMax: Date;
}) {
  const [expanded, setExpanded] = useState<Set<Classification>>(() => new Set(selectedTypes.slice(0, 1)));
  // Task 249 follow-up (extension notice): fires only at the moment a Programme duration edit
  // actually stretches the last phase's end day (see the duration input's onChange below) — not
  // re-derived from card state on every render, since once the stretch is applied the "gap" it
  // describes is gone (last phase's dayEnd now equals durationDays), so there'd be nothing left to
  // detect afterward. Cleared whenever a duration edit doesn't need a stretch.
  const [extendNotice, setExtendNotice] = useState<Partial<Record<Classification, string>>>({});

  function toggle(c: Classification) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  // Confirmed UI Requirement 3: picking a phase other than the first one excludes every phase
  // before it in the draft's own array order — mirrors seed.ts's before/target/after cascade, but
  // applied to the wizard's preview immediately, so the "N of M phases included" summary already
  // reflects it before the PM ever submits.
  function selectStartPhase(type: Classification, card: TypeCardState, phaseNumber: number) {
    const index = card.phasePlan.phases.findIndex((p) => p.phaseNumber === phaseNumber);
    const phases: PhaseDraft[] = card.phasePlan.phases.map((p, i) => (index > 0 && i < index ? { ...p, included: false } : p));
    onChangeCard(type, { ...card, startPhase: phaseNumber, phasePlan: { phases } });
  }

  return (
    <div className="flex flex-col gap-3">
      {selectedTypes.map((type) => {
        const card = cardsByType[type];
        if (!card) return null;
        const isStackShiftI = type === "StackShift I";
        const isStackShiftII = type === "StackShift II";
        const builderMode: "fixed-phases" | "free-form" =
          isStackShiftI || (isStackShiftII && card.useDefaultPhases) ? "fixed-phases" : "free-form";
        // Task 249 follow-up: the Programme duration field's own error — reciprocal of the
        // per-phase overflow check PhaseBuilder shows next to the last phase's day range. Only
        // meaningful in fixed-phases mode, which is the only mode with a real day concept.
        const durationError = builderMode === "fixed-phases" ? programmeDurationError(card.phasePlan, card.durationDays) : undefined;
        // Task 251: required + must-be-in-the-future validation for the Scheduled start field —
        // only meaningful once startMode === "scheduled" (scheduledStartError itself is a no-op
        // otherwise).
        const scheduleError = scheduledStartError(card.startMode, card.scheduledStartAt, scheduleMin);
        const isOpen = expanded.has(type);
        const displayName = getDisplayName(type, card).trim();
        const phaseCount = card.phasePlan.phases.length;
        const includedCount = card.phasePlan.phases.filter((p) => p.included).length;
        const summary =
          builderMode === "fixed-phases"
            ? `${includedCount} of ${phaseCount} phase${phaseCount === 1 ? "" : "s"} included`
            : phaseCount === 0
              ? "No phases yet — skipped for now"
              : `${phaseCount} phase${phaseCount === 1 ? "" : "s"} planned`;

        return (
          <div key={type} id={`phases-step-${type}`} className="overflow-hidden rounded-[12px] border border-[#E2E7F2] bg-[#F9FAFC]">
            <button
              type="button"
              onClick={() => toggle(type)}
              aria-expanded={isOpen}
              className="flex w-full cursor-pointer items-center justify-between gap-2 border-none bg-transparent px-4 py-3.5 text-left transition-colors hover:bg-[#F4F6FB]"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {displayName && <span className="truncate text-[13px] font-bold text-[#0B1533]">{displayName}</span>}
                  {displayName && <span className="text-[#B7BFD6]">·</span>}
                  <span className="inline-flex shrink-0 items-center rounded-md bg-[#E5F1FF] px-2 py-0.5 text-[11px] font-semibold text-[#007BFF]">
                    {type}
                  </span>
                </div>
                <div className="text-[11px] text-[#5F6A88]">{summary}</div>
              </div>
              {isOpen ? (
                <ChevronDown size={15} className="shrink-0 text-[#5F6A88]" />
              ) : (
                <ChevronRight size={15} className="shrink-0 text-[#5F6A88]" />
              )}
            </button>
            {isOpen && (
              <div className="flex flex-col gap-4 border-t border-[#E2E7F2] p-4">
                {isStackShiftII && (
                  <label className="flex w-fit cursor-pointer items-center gap-2 text-[12.5px] font-medium text-[#0B1533]">
                    <input
                      type="checkbox"
                      checked={card.useDefaultPhases}
                      onChange={(e) => {
                        const useDefaultPhases = e.target.checked;
                        onChangeCard(type, {
                          ...card,
                          useDefaultPhases,
                          phasePlan: useDefaultPhases ? defaultPhasePlanDraft() : emptyPhasePlanDraft(),
                        });
                        // The phase plan just got reset wholesale — any prior "last phase was
                        // stretched" notice no longer describes anything real.
                        setExtendNotice((prev) => ({ ...prev, [type]: undefined }));
                      }}
                      className="h-4 w-4 cursor-pointer accent-[#007BFF]"
                    />
                    Generate default phases &amp; deliverables (same as StackShift I)
                  </label>
                )}

                <div>
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[#5F6A88]">
                    {builderMode === "fixed-phases" ? "Phases & deliverables" : "Phases, deliverables & checklist"}
                  </div>
                  <PhaseBuilder
                    mode={builderMode}
                    phasePlan={card.phasePlan}
                    durationDays={card.durationDays}
                    collapseAllButFirst={isStackShiftI}
                    onChange={(phasePlan) => onChangeCard(type, { ...card, phasePlan })}
                    onLastPhaseExtended={(previousDayEnd) =>
                      setExtendNotice((prev) => ({
                        ...prev,
                        [type]: previousDayEnd != null ? lastPhaseExtendedNotice(previousDayEnd, card.durationDays) : undefined,
                      }))
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`duration-${type}`} className="text-[13px] font-medium text-[#0B1533]">
                      {isStackShiftI || (isStackShiftII && card.useDefaultPhases) ? "Programme duration (days)" : "Target duration (days)"}
                    </label>
                    <input
                      id={`duration-${type}`}
                      type="number"
                      min={1}
                      value={card.durationDays}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n) || n <= 0) return;
                        const durationDays = Math.round(n);
                        if (builderMode === "fixed-phases") {
                          const { phasePlan, extended, previousDayEnd } = extendLastPhaseToDuration(card.phasePlan, durationDays);
                          onChangeCard(type, { ...card, durationDays, phasePlan });
                          setExtendNotice((prev) => ({
                            ...prev,
                            [type]: extended && previousDayEnd != null ? lastPhaseExtendedNotice(previousDayEnd, durationDays) : undefined,
                          }));
                        } else {
                          onChangeCard(type, { ...card, durationDays });
                        }
                      }}
                      aria-invalid={durationError ? true : undefined}
                      className={cn(
                        "w-full rounded-[9px] border bg-[#F4F6FB] px-3.5 py-[11px] text-sm text-[#0B1533] outline-none transition-colors duration-150",
                        durationError
                          ? "border-[#C0392B]"
                          : "border-[#E2E7F2] focus:border-[#007BFF] focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,123,255,0.14)]"
                      )}
                    />
                    {durationError && <span className="text-[10.5px] text-[#C0392B]">{durationError}</span>}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-medium text-[#0B1533]">Start</label>
                    <div className="flex h-[42px] w-full items-center gap-1 rounded-lg bg-[#EDF0F7] p-1">
                      {(["draft", "now", "scheduled"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => onChangeCard(type, { ...card, startMode: m })}
                          className={cn(
                            "flex-1 cursor-pointer rounded-md border-none px-2 py-1.5 text-[11.5px] font-medium transition-colors",
                            card.startMode === m ? "bg-white text-[#0B1533] shadow-sm" : "bg-transparent text-[#5F6A88] hover:text-[#0B1533]"
                          )}
                        >
                          {m === "draft" ? "Draft" : m === "now" ? "Now" : "Scheduled"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {builderMode === "fixed-phases" && extendNotice[type] && (
                  <p className="rounded-[9px] border border-[#FDE8C8] bg-[#FFF8EC] px-3 py-2 text-[11.5px] leading-relaxed text-[#B45309]">
                    {extendNotice[type]}
                  </p>
                )}

                {card.startMode === "scheduled" && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`schedule-${type}`} className="text-[13px] font-medium text-[#0B1533]">
                      Scheduled start
                    </label>
                    <DateTimePicker
                      id={`schedule-${type}`}
                      value={card.scheduledStartAt}
                      onChange={(v) => onChangeCard(type, { ...card, scheduledStartAt: v })}
                      min={scheduleMin}
                      max={scheduleMax}
                    />
                    {scheduleError && <span className="text-[10.5px] text-[#C0392B]">{scheduleError}</span>}
                  </div>
                )}

                {(isStackShiftI || (isStackShiftII && card.useDefaultPhases)) && canManagePhases && card.startMode !== "draft" && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`start-phase-${type}`} className="text-[13px] font-medium text-[#0B1533]">
                      Start at phase
                    </label>
                    <select
                      id={`start-phase-${type}`}
                      value={card.startPhase}
                      onChange={(e) => selectStartPhase(type, card, Number(e.target.value))}
                      className="h-[42px] w-full cursor-pointer appearance-none rounded-[9px] border border-[#E2E7F2] bg-[#F4F6FB] px-3.5 pr-8 text-sm text-[#0B1533] outline-none transition-colors duration-150 focus:border-[#007BFF] focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,123,255,0.14)]"
                      style={{
                        backgroundImage:
                          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235F6A88'/%3E%3C/svg%3E\")",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 14px center",
                      }}
                    >
                      {card.phasePlan.phases
                        .filter((p) => p.included)
                        .map((p) => (
                          <option key={p.phaseNumber} value={p.phaseNumber}>
                            Phase {p.phaseNumber}: {p.name || (p.isCustom ? "Untitled custom phase" : "")}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
