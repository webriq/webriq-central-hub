"use client";

import { useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, X, Check, ChevronDown, ChevronRight, Layers, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyDeliverableDayRanges } from "@/config/customer-phases";
import {
  nextDraftId,
  nextPhaseNumber,
  addCustomPhaseDraft,
  setPhaseIncluded,
  phasePlanValidationErrors,
  extendLastPhaseToDuration,
  phasePlanEmptyNameErrors,
  emptyNameFieldId,
  type PhasePlanDraft,
  type PhaseDraft,
  type DeliverableDraft,
  type EmptyNameError,
} from "./_new-project-types";

// Task 244 follow-up: reused everywhere a list here needs drag-reorder (phases in free-form mode,
// deliverables in either mode, checklist items in free-form mode) — a single sensor config
// mirrors the codebase's existing dnd-kit convention (_board-view.tsx).
function useDragSensors() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
}

type SortableHandleProps = Pick<ReturnType<typeof useSortable>, "attributes" | "listeners">;

function DragHandle({ listeners, attributes }: SortableHandleProps) {
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label="Drag to reorder"
      className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center border-none bg-transparent text-[#B7BFD6] outline-none transition-colors hover:text-[#5F6A88] active:cursor-grabbing"
    >
      <GripVertical size={13} />
    </button>
  );
}

// ─── Small inline-editable row ─────────────────────────────────────────────────
// Task 244 follow-up: unified with Field's own input styling (rounded-[9px], border-[#E2E7F2],
// bg-[#F4F6FB], focus:border-[#007BFF]/bg-white/shadow ring) — was a visually inconsistent
// smaller/tighter input (rounded-[7px], plain white bg, no focus shadow) that read as a different
// component family from the rest of the form.

function InlineRow({
  id,
  value,
  onChange,
  onRemove,
  placeholder,
  removeLabel,
  dense,
  error,
}: {
  // Chat follow-up: DOM id for the input itself — set only where a caller needs it as a
  // scroll-to-field/error target (phase/deliverable/checklist-item name inputs); omitted
  // elsewhere.
  id?: string;
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
  placeholder: string;
  removeLabel: string;
  // Deliverable/checklist rows sit 1-2 nesting levels deep — a slightly more compact size keeps
  // the tree scannable while still sharing the exact same radius/border/focus-color family as
  // every other input in the wizard.
  dense?: boolean;
  // Chat follow-up: an empty-name validation message (phasePlanEmptyNameErrors) — turns the input
  // red and shows the message underneath, same treatment as the day-range/duration fields.
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          className={cn(
            "w-full rounded-[9px] border bg-[#F4F6FB] text-[#0B1533] outline-none transition-colors duration-150",
            error
              ? "border-[#C0392B]"
              : "border-[#E2E7F2] focus:border-[#007BFF] focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,123,255,0.14)]",
            dense ? "px-3 py-2 text-[12.5px]" : "px-3.5 py-[11px] text-sm"
          )}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#5F6A88] transition-colors hover:bg-[#FDE8E6] hover:text-[#C0392B]"
        >
          <X size={12} />
        </button>
      </div>
      {error && <span className="text-[10.5px] text-[#C0392B]">{error}</span>}
    </div>
  );
}

// ─── Checklist item (free-form deliverables only) ──────────────────────────────

function ChecklistItemRow({
  id,
  value,
  onChange,
  onRemove,
  nameErrors,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
  // Chat follow-up: full empty-name error map (see phasePlanEmptyNameErrors) — this row only reads
  // its own entry (keyed by its own `id`), threaded down as the whole map rather than a
  // pre-resolved string so every level along the tree can do the same `.get(id)?.message` lookup.
  nameErrors: Map<string, EmptyNameError>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-1", isDragging && "z-10 opacity-70")}
    >
      <DragHandle listeners={listeners} attributes={attributes} />
      <div className="flex-1">
        <InlineRow
          id={emptyNameFieldId(id, "checklist")}
          value={value}
          onChange={onChange}
          onRemove={onRemove}
          placeholder="Checklist item"
          removeLabel="Remove checklist item"
          dense
          error={nameErrors.get(id)?.message}
        />
      </div>
    </div>
  );
}

// ─── Deliverable (with checklist, free-form mode only) ─────────────────────────

function DeliverableRow({
  deliverable,
  showChecklist,
  dayRange,
  nameErrors,
  onChange,
  onRemove,
}: {
  deliverable: DeliverableDraft;
  showChecklist: boolean;
  // Task 249 (Requirement B), widened by task 252 to free-form mode too — this deliverable's
  // computed [dayStart, dayEnd] from applyDeliverableDayRanges, read-only/display-only. Undefined
  // only for Phase 1/Onboard (fixed-phases mode's one exception — never redistributed).
  dayRange?: { dayStart: number; dayEnd: number };
  // Chat follow-up: see ChecklistItemRow — same full map, this row resolves its own entry plus
  // forwards it to each checklist item.
  nameErrors: Map<string, EmptyNameError>;
  onChange: (next: DeliverableDraft) => void;
  onRemove: () => void;
}) {
  // Chat follow-up: starts expanded when one of this deliverable's own checklist items has an
  // empty-name error at mount — otherwise the "scroll to field" target for that item wouldn't
  // exist in the DOM yet (checklist starts collapsed) and the scroll would silently no-op.
  const [expanded, setExpanded] = useState(() => deliverable.checklist.some((c) => nameErrors.has(c.id)));
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deliverable.id });
  const sensors = useDragSensors();

  function handleChecklistDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = deliverable.checklist.findIndex((c) => c.id === active.id);
    const newIndex = deliverable.checklist.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange({ ...deliverable, checklist: arrayMove(deliverable.checklist, oldIndex, newIndex) });
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("rounded-[9px] border border-[#E2E7F2] bg-[#F9FAFC] p-2", isDragging && "z-10 opacity-70 shadow-[0_4px_12px_rgba(7,17,51,0.10)]")}
    >
      <div className="flex items-center gap-1">
        <DragHandle listeners={listeners} attributes={attributes} />
        {showChecklist && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? "Collapse checklist" : "Expand checklist"}
            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#5F6A88] hover:bg-[#EDF0F7]"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        )}
        <div className="flex-1">
          <InlineRow
            id={emptyNameFieldId(deliverable.id, "deliverable")}
            value={deliverable.name}
            onChange={(name) => onChange({ ...deliverable, name })}
            onRemove={onRemove}
            placeholder="Deliverable name"
            removeLabel="Remove deliverable"
            dense
            error={nameErrors.get(deliverable.id)?.message}
          />
        </div>
        {dayRange && (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-[#EDF0F7] px-2 py-1 text-[10px] font-medium text-[#5F6A88]">
            Day {dayRange.dayStart}
            {dayRange.dayEnd !== dayRange.dayStart ? `–${dayRange.dayEnd}` : ""}
          </span>
        )}
      </div>

      {showChecklist && expanded && (
        <div className="mt-2 ml-7 flex flex-col gap-1.5">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleChecklistDragEnd}>
            <SortableContext items={deliverable.checklist.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {deliverable.checklist.map((item) => (
                <ChecklistItemRow
                  key={item.id}
                  id={item.id}
                  value={item.title}
                  onChange={(title) =>
                    onChange({ ...deliverable, checklist: deliverable.checklist.map((c) => (c.id === item.id ? { ...c, title } : c)) })
                  }
                  onRemove={() => onChange({ ...deliverable, checklist: deliverable.checklist.filter((c) => c.id !== item.id) })}
                  nameErrors={nameErrors}
                />
              ))}
            </SortableContext>
          </DndContext>
          <button
            type="button"
            onClick={() =>
              onChange({ ...deliverable, checklist: [...deliverable.checklist, { id: nextDraftId(), title: "" }] })
            }
            className="flex w-fit cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-[11.5px] font-medium text-[#007BFF] transition-colors hover:text-[#0063D6]"
          >
            <Plus size={11} /> Add checklist item
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Phase section ──────────────────────────────────────────────────────────────

function PhaseSection({
  phase,
  mode,
  error,
  nameErrors,
  isCollapsed,
  onToggleCollapsed,
  onChange,
  onToggleIncluded,
  onRemove,
  onInsertAfter,
}: {
  phase: PhaseDraft;
  mode: "fixed-phases" | "free-form";
  // Task 249 (Requirement D) — fixed-phases mode only: this phase's day-range validation message,
  // if any (see phasePlanValidationErrors, _new-project-types.ts).
  error?: string;
  // Chat follow-up: see ChecklistItemRow/DeliverableRow — same full empty-name error map, this
  // section resolves its own (name-editable phases only) entry plus forwards it to each
  // deliverable/checklist item.
  nameErrors: Map<string, EmptyNameError>;
  // Chat follow-up: collapsible phases (same pattern as PhasesStep's per-type sections) — the
  // header (name/drag handle/included toggle) and the "Insert custom phase after this one" link
  // always stay visible; only the day-range editor and deliverable list collapse.
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onChange: (next: PhaseDraft) => void;
  // Chat follow-up to task 249 — fixed-phases mode only: routes the "Included"/"Skip this phase"
  // checkbox through setPhaseIncluded's whole-draft cascade instead of `onChange`'s single-phase
  // replace, so every other included phase's day range re-packs immediately.
  onToggleIncluded?: (included: boolean) => void;
  onRemove?: () => void;
  // Task 246 — fixed-phases mode only: "Add custom phase" positioned right after this one.
  onInsertAfter?: () => void;
}) {
  const sensors = useDragSensors();
  // Task 244 follow-up: phases are only draggable in free-form mode — fixed-phases mode's 5
  // phases stay in their StackShift-I-defined sequence (their day ranges are positional, not
  // reorderable, until a future task extends that engine); the drag handle is simply not shown
  // there, matching how the phase-name field itself is read-only text in that mode.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: phase.id,
    disabled: mode !== "free-form",
  });

  function updateDeliverable(id: string, next: DeliverableDraft) {
    onChange({ ...phase, deliverables: phase.deliverables.map((d) => (d.id === id ? next : d)) });
  }
  function removeDeliverable(id: string) {
    onChange({ ...phase, deliverables: phase.deliverables.filter((d) => d.id !== id) });
  }
  function addDeliverable() {
    onChange({ ...phase, deliverables: [...phase.deliverables, { id: nextDraftId(), name: "", checklist: [] }] });
  }
  function handleDeliverableDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = phase.deliverables.findIndex((d) => d.id === active.id);
    const newIndex = phase.deliverables.findIndex((d) => d.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange({ ...phase, deliverables: arrayMove(phase.deliverables, oldIndex, newIndex) });
  }

  // Task 244: fixed-phases mode only — lets a PM opt this default phase out of this one project
  // (StackShift I: excluded from `skip_phase_numbers`; StackShift II-with-default: dropped from
  // the generic `phase_plan`). The phase row itself is never removed here — only its `included`
  // flag flips — so unchecking then rechecking loses no deliverable edits.
  const included = mode === "fixed-phases" ? phase.included : true;

  // Task 249 (Requirement B), widened by task 252 to free-form mode too — fixed-phases mode,
  // phase 2+ only (Phase 1/Onboard's deliverables are never redistributed; free-form has no such
  // exception, every phase there gets the same treatment): a pure derivation from the phase's own
  // dayStart/dayEnd/deliverable count, recomputed on every render — not separately-stored
  // per-deliverable state, so there's no second source of truth to drift out of sync when the
  // phase's day range or deliverable list changes (including via drag reorder, since order
  // determines which deliverables get the "extra day" slots first).
  const deliverableDayRanges =
    (mode === "free-form" || (mode === "fixed-phases" && phase.phaseNumber !== 1)) && phase.dayStart != null && phase.dayEnd != null
      ? applyDeliverableDayRanges(phase.dayStart, phase.dayEnd, phase.deliverables.length)
      : undefined;

  // Chat follow-up: collapsed-state summary — duration, deliverable count, and included/skipped
  // status, so a collapsed phase still communicates its shape without expanding it. Task 252:
  // the day-range part is no longer fixed-phases-only — free-form phases carry a real day range now too.
  const deliverableCount = phase.deliverables.filter((d) => d.name.trim()).length;
  const durationDays = phase.dayStart != null && phase.dayEnd != null ? phase.dayEnd - phase.dayStart + 1 : null;
  const collapsedSummary = [
    phase.dayStart != null && phase.dayEnd != null
      ? `Day ${phase.dayStart}–${phase.dayEnd} (${durationDays} day${durationDays === 1 ? "" : "s"})`
      : null,
    `${deliverableCount} deliverable${deliverableCount === 1 ? "" : "s"}`,
    mode === "fixed-phases" ? (included ? "Included" : "Skipped") : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  return (
    <div
      id={`phase-${phase.id}`}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-[9px] border border-[#E2E7F2] bg-white p-3",
        mode === "fixed-phases" && !included && "opacity-50",
        isDragging && "z-10 opacity-70 shadow-[0_4px_12px_rgba(7,17,51,0.10)]"
      )}
    >
      <div className="mb-2 flex items-center gap-1">
        {mode === "free-form" && <DragHandle listeners={listeners} attributes={attributes} />}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "Expand phase" : "Collapse phase"}
          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#5F6A88] transition-colors hover:bg-[#EDF0F7]"
        >
          {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>
        {mode === "free-form" || (mode === "fixed-phases" && phase.isCustom) ? (
          <div className="flex-1">
            <InlineRow
              id={emptyNameFieldId(phase.id, "phase")}
              value={phase.name}
              onChange={(name) => onChange({ ...phase, name })}
              onRemove={onRemove ?? (() => {})}
              placeholder="Phase name"
              removeLabel="Remove phase"
              dense
              error={nameErrors.get(phase.id)?.message}
            />
          </div>
        ) : (
          <span className="flex-1 text-[12.5px] font-bold text-[#0B1533]">{phase.name}</span>
        )}
        {mode === "fixed-phases" && (
          <label
            className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-[#5F6A88]"
            title={included ? "Skip this phase" : "Include this phase"}
          >
            <input
              type="checkbox"
              checked={included}
              onChange={(e) => onToggleIncluded?.(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer accent-[#007BFF]"
            />
            {included ? (
              <span className="inline-flex items-center gap-0.5 text-[#177E48]">
                <Check size={11} strokeWidth={2.5} /> Included
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-[#C0392B]">
                <X size={11} strokeWidth={2.5} /> Skipped
              </span>
            )}
          </label>
        )}
      </div>
      {isCollapsed ? (
        collapsedSummary && <div className="mb-1 pl-7 text-[11px] text-[#5F6A88]">{collapsedSummary}</div>
      ) : (
        <>
          {/* Task 252: the day-range editor is no longer fixed-phases-only — a free-form phase
              (Access/Access Plus/Discrete Development/StackShift II without the default-engine
              opt-in) now gets the same "Day X to Y" control, feeding the Portfolio Tracker
              Swimlane/Overview these project types previously had no calendar timeline for. */}
          <div className="mb-2 flex flex-col gap-1 pl-1">
            <div
              className={cn(
                "flex w-fit items-center gap-2 rounded-[9px] border bg-[#F4F6FB] px-3 py-1.5 transition-colors duration-150",
                error
                  ? "border-[#C0392B]"
                  : "border-[#E2E7F2] focus-within:border-[#007BFF] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(0,123,255,0.14)]"
              )}
            >
              <span className="text-[11px] font-medium text-[#5F6A88]">Day</span>
              <input
                type="number"
                min={1}
                value={phase.dayStart ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n > 0) onChange({ ...phase, dayStart: n });
                }}
                aria-label="Day start"
                className="w-10 border-none bg-transparent text-center text-[12.5px] font-semibold text-[#0B1533] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="text-[11px] text-[#5F6A88]">to</span>
              <input
                type="number"
                min={phase.dayStart ?? 1}
                value={phase.dayEnd ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n > 0) onChange({ ...phase, dayEnd: n });
                }}
                aria-label="Day end"
                className="w-10 border-none bg-transparent text-center text-[12.5px] font-semibold text-[#0B1533] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            {error && <span className="text-[10.5px] text-[#C0392B]">{error}</span>}
          </div>
          <div className={cn("flex flex-col gap-1.5", mode === "fixed-phases" && !included && "pointer-events-none")}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDeliverableDragEnd}>
              <SortableContext items={phase.deliverables.map((d) => d.id)} strategy={verticalListSortingStrategy}>
                {phase.deliverables.map((d, i) => (
                  <DeliverableRow
                    key={d.id}
                    deliverable={d}
                    showChecklist={mode === "free-form"}
                    dayRange={deliverableDayRanges?.[i]}
                    nameErrors={nameErrors}
                    onChange={(next) => updateDeliverable(d.id, next)}
                    onRemove={() => removeDeliverable(d.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
          {included && (
            <button
              type="button"
              onClick={addDeliverable}
              className="mt-2 flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-[11.5px] font-medium text-[#007BFF] transition-colors hover:text-[#0063D6]"
            >
              <Plus size={11} /> Add deliverable
            </button>
          )}
        </>
      )}
      {mode === "fixed-phases" && onInsertAfter && (
        <button
          type="button"
          onClick={onInsertAfter}
          className="mt-2 flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-[10.5px] font-medium text-[#5F6A88] transition-colors hover:text-[#007BFF]"
        >
          <Plus size={10} /> Insert custom phase after this one
        </button>
      )}
    </div>
  );
}

// ─── Phase builder (top-level) ────────────────────────────────────────────────
// mode="fixed-phases": StackShift I always, StackShift II when "generate default" is checked —
// phasePlan.phases is pre-seeded with the 5 programme phases and never gains/loses a phase here,
// only deliverables within each. mode="free-form": Access / Access Plus / Discrete Development,
// and StackShift II when its checkbox is unchecked — phases themselves are addable/removable/
// reorderable, and each deliverable also carries an editable, reorderable checklist.

export default function PhaseBuilder({
  mode,
  phasePlan,
  durationDays,
  onChange,
  onLastPhaseExtended,
  collapseAllButFirst,
}: {
  mode: "fixed-phases" | "free-form";
  phasePlan: PhasePlanDraft;
  // Task 249 follow-up — fixed-phases mode only: the card's Programme duration (days), fed into
  // phasePlanValidationErrors so any phase's day range that overruns it gets flagged inline.
  // Ignored in free-form mode, which has no day concept.
  durationDays: number;
  onChange: (next: PhasePlanDraft) => void;
  // Chat follow-up — fixed-phases mode only: the "skip this phase" checkbox re-packs every other
  // included phase's day range (setPhaseIncluded's cascade below), which can leave the new last
  // included phase short of durationDays — the same gap the Programme duration field's own
  // extend-on-raise behavior handles, just triggered by a different action. Called on every toggle
  // with the pre-extension dayEnd when that repack needed the same auto-extend, or `null` when it
  // didn't — so _phases-step.tsx can both surface and clear the matching notice.
  onLastPhaseExtended?: (previousDayEnd: number | null) => void;
  // Task 251 — StackShift I only (wired from _phases-step.tsx): Phases 2-5 start collapsed,
  // Phase 1 stays expanded, so the section reads as a compact overview instead of 5 fully-open
  // day-range/deliverable editors. Ignored for every other card. Lazy-init only — a StackShift I
  // card's phasePlan is a fixed 5-phase array from initTypeCardState, so there's no "phasePlan
  // changed under us" case to react to the way StackShift II's checkbox-reset needs.
  collapseAllButFirst?: boolean;
}) {
  const sensors = useDragSensors();
  // Task 249 (Requirement D), widened by task 252 to free-form mode too — free-form phases now
  // carry a real day range, but (unlike fixed-phases) have no fixed card-level Programme duration
  // to overrun, since the project's total length is simply derived from the plan's own latest
  // dayEnd; the durationDays ceiling check is skipped there by omitting the argument
  // (phasePlanValidationErrors treats a missing durationDays as "no ceiling to check").
  const validationErrors = mode === "fixed-phases" ? phasePlanValidationErrors(phasePlan, durationDays) : phasePlanValidationErrors(phasePlan);
  // Chat follow-up: empty phase/deliverable/checklist-item name errors — unlike validationErrors
  // above, this applies in both modes (a blank name is just as much a silent-drop risk in a
  // free-form builder as a fixed one).
  const nameErrors = phasePlanEmptyNameErrors(phasePlan, mode);
  // Chat follow-up: per-phase collapse state, same pattern as PhasesStep's per-type `expanded` set
  // — nothing collapsed by default, so the builder's existing fully-expanded look is unchanged
  // until a PM collapses a phase themselves. Task 251: collapseAllButFirst seeds every phase
  // except the first as collapsed instead.
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(
    () => new Set(collapseAllButFirst ? phasePlan.phases.slice(1).map((p) => p.id) : [])
  );
  function toggleCollapsed(id: string) {
    setCollapsedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updatePhase(id: string, next: PhaseDraft) {
    onChange({ phases: phasePlan.phases.map((p) => (p.id === id ? next : p)) });
  }
  // Chat follow-up to task 249: whole-draft cascade recompute, not a single-phase replace — see
  // setPhaseIncluded's own doc comment. Chat follow-up: the repack can leave the new last included
  // phase short of durationDays (e.g. skipping a middle phase pulls everything after it forward) —
  // extendLastPhaseToDuration closes that gap the same way a duration-field raise does.
  // onLastPhaseExtended is called on every toggle (not just extending ones), with `null` when this
  // toggle didn't need a stretch, so the parent can clear a stale notice left over from an earlier
  // toggle instead of only ever setting one.
  function toggleIncluded(id: string, included: boolean) {
    const repacked = setPhaseIncluded(phasePlan, id, included);
    if (mode !== "fixed-phases") {
      onChange(repacked);
      return;
    }
    const { phasePlan: extended, extended: wasExtended, previousDayEnd } = extendLastPhaseToDuration(repacked, durationDays);
    onChange(extended);
    onLastPhaseExtended?.(wasExtended && previousDayEnd != null ? previousDayEnd : null);
  }
  function removePhase(id: string) {
    onChange({ phases: phasePlan.phases.filter((p) => p.id !== id) });
  }
  // Task 252: free-form mode now has a day concept too (mirrors addCustomPhaseDraft's own "append
  // after the latest known end, 2-week default span" default for fixed-phases custom phases) — a
  // newly-added phase starts the day after whichever existing phase currently ends latest, so the
  // Swimlane/Overview timeline this feeds always has a real (PM-adjustable) day range instead of
  // falling back to Day 1 for every new phase.
  function addPhase() {
    const latestKnownDayEnd = phasePlan.phases.reduce((max, p) => (p.dayEnd != null ? Math.max(max, p.dayEnd) : max), 0);
    const dayStart = latestKnownDayEnd + 1;
    onChange({
      phases: [
        ...phasePlan.phases,
        { id: nextDraftId(), phaseNumber: nextPhaseNumber(phasePlan), name: "", included: true, isCustom: false, dayStart, dayEnd: dayStart + 13, deliverables: [] },
      ],
    });
  }
  // Task 246 — fixed-phases mode's "Add custom phase", positioned right after `afterId`.
  function addCustomPhase(afterId: string) {
    onChange(addCustomPhaseDraft(phasePlan, afterId));
  }
  function handlePhaseDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = phasePlan.phases.findIndex((p) => p.id === active.id);
    const newIndex = phasePlan.phases.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange({ phases: arrayMove(phasePlan.phases, oldIndex, newIndex) });
  }

  if (mode === "free-form" && phasePlan.phases.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[9px] border border-dashed border-[#E2E7F2] bg-[#F9FAFC] px-4 py-5 text-center">
        <Layers size={18} className="text-[#B7BFD6]" />
        <p className="max-w-xs text-[11.5px] leading-relaxed text-[#5F6A88]">
          No phases yet — skip for now and add them later from the project&apos;s Milestones tab, or start building the plan now.
        </p>
        <button
          type="button"
          onClick={addPhase}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#E2E7F2] bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#3A4565] transition-colors hover:border-[#A8C6F5] hover:text-[#007BFF]"
        >
          <Plus size={12} /> Add first phase
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePhaseDragEnd}>
        <SortableContext items={phasePlan.phases.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          {phasePlan.phases.map((p) => (
            <PhaseSection
              key={p.id}
              phase={p}
              mode={mode}
              error={validationErrors.get(p.id)}
              nameErrors={nameErrors}
              isCollapsed={collapsedPhases.has(p.id)}
              onToggleCollapsed={() => toggleCollapsed(p.id)}
              onChange={(next) => updatePhase(p.id, next)}
              onToggleIncluded={(included) => toggleIncluded(p.id, included)}
              onRemove={() => removePhase(p.id)}
              onInsertAfter={mode === "fixed-phases" ? () => addCustomPhase(p.id) : undefined}
            />
          ))}
        </SortableContext>
      </DndContext>
      {mode === "free-form" && (
        <button
          type="button"
          onClick={addPhase}
          className={cn(
            "flex w-fit cursor-pointer items-center gap-1.5 rounded-full border border-[#E2E7F2] bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#3A4565] transition-colors hover:border-[#A8C6F5] hover:text-[#007BFF]"
          )}
        >
          <Plus size={12} /> Add phase
        </button>
      )}
    </div>
  );
}
