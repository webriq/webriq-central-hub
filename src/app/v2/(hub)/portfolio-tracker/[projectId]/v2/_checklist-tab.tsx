"use client";

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeliverableRow, InternalDeliverableRow } from "./_wizard-v2-types";
import { textPrimary, textMuted, cardCls, DueBadge } from "./_shared-ui";
import { getPhaseByNumber, internalDeliverablesForSubPhase } from "@/config/customer-phases";

const DELIVERABLES = getPhaseByNumber(1).deliverables;

// Marketing/admin-only checklist visibility — mirrors ../_onboarding-wizard.tsx's rule exactly
// ("never shown to PM/developer/hr", see src/config/customer-phases.ts's own comment).
const INTERNAL_HIDDEN_ROLES = ["pm", "developer", "hr"];

export function ChecklistTab({
  deliverables, internalDeliverables, currentDay, role, canEditInternal, togglingKey, onToggleInternal,
}: {
  deliverables: DeliverableRow[];
  internalDeliverables: InternalDeliverableRow[];
  currentDay: number;
  role: string | null;
  canEditInternal: boolean;
  togglingKey: string | null;
  onToggleInternal: (key: string, status: "pending" | "in_progress" | "done") => void;
}) {
  const showInternal = !role || !INTERNAL_HIDDEN_ROLES.includes(role);

  return (
    <div className="flex flex-col gap-3">
      {DELIVERABLES.map((config) => {
        const status = deliverables.find((d) => d.deliverable_key === config.key)?.status ?? "pending";
        const internalItems = internalDeliverablesForSubPhase(config.key);
        return (
          <div key={config.key} className={cn(cardCls, "p-4")}>
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className={cn("text-[13.5px] font-semibold", textPrimary)}>{config.name}</span>
              <DueBadge currentDay={currentDay} dayStart={config.dayStart} dayEnd={config.dayEnd} done={status === "done"} />
            </div>
            <p className={cn("text-[12px] mb-3", textMuted)}>{config.description}</p>
            {showInternal && internalItems.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-3 border-t border-[#EDF0F7]">
                {internalItems.map((item) => {
                  const itemStatus = internalDeliverables.find((r) => r.deliverable_key === item.key)?.status ?? "pending";
                  const done = itemStatus === "done";
                  const toggling = togglingKey === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      disabled={!canEditInternal || toggling}
                      onClick={() => onToggleInternal(item.key, done ? "pending" : "done")}
                      className="flex items-center gap-2.5 text-left cursor-pointer border-none bg-transparent py-1 disabled:cursor-default"
                    >
                      {toggling ? (
                        <Loader2 size={17} className="shrink-0 animate-spin text-[#5F6A88]" />
                      ) : (
                        <span className={cn("w-[17px] h-[17px] shrink-0 rounded-[5px] border-[1.5px] flex items-center justify-center", done ? "bg-[#177E48] border-[#177E48]" : "border-[#C7CEDD]")}>
                          {done && <Check size={11} className="text-white" />}
                        </span>
                      )}
                      <span className={cn("text-[12.5px]", done ? "line-through text-[#5F6A88]" : textPrimary)}>{item.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
