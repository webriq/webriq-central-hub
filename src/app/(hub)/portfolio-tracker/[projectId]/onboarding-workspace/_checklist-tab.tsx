"use client";

import { Check, Loader2, FolderOpen, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeliverableRow, InternalDeliverableRow } from "./_wizard-v2-types";
import { textPrimary, textMuted, cardCls, DueBadge } from "./_shared-ui";
import { getPhaseByNumber, internalDeliverablesForSubPhase } from "@/config/customer-phases";

const PHASE1 = getPhaseByNumber(1);
const DELIVERABLES = PHASE1.deliverables;

// Marketing/admin-only checklist visibility — mirrors ../_onboarding-wizard.tsx's rule exactly
// ("never shown to PM/developer/hr", see src/config/customer-phases.ts's own comment).
const INTERNAL_HIDDEN_ROLES = ["pm", "developer", "hr"];

// Mockup 06's "Attach from Files"/"Attach from Access" evidence links — only these two items are
// shown with a link in the mockup (Branding guides / KB info (raw) / DNS details stay plain
// checkboxes with a PENDING tag), so this mapping intentionally covers exactly those two rather
// than inventing evidence links the design doesn't call for.
const EVIDENCE_LINKS: Record<string, { tab: "files" | "access"; folderName?: string }> = {
  "implementation-file": { tab: "files", folderName: "Migration Checklist" },
  "credentials-external": { tab: "access" },
};

const AVATAR_COLORS = ["#177E48", "#0063D6", "#6A48E0", "#B85512", "#44508A", "#C0392B"];
function initialsFor(name: string): string {
  const parts = name.split(/[\s+]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function ChecklistTab({
  deliverables, internalDeliverables, currentDay, role, canEditInternal, togglingKey, onToggleInternal, onOpenFolder, onGoToAccess,
}: {
  deliverables: DeliverableRow[];
  internalDeliverables: InternalDeliverableRow[];
  currentDay: number;
  role: string | null;
  canEditInternal: boolean;
  togglingKey: string | null;
  onToggleInternal: (key: string, status: "pending" | "in_progress" | "done") => void;
  onOpenFolder: (folderName: string) => void;
  onGoToAccess: () => void;
}) {
  const showInternal = !role || !INTERNAL_HIDDEN_ROLES.includes(role);

  const doneCount = DELIVERABLES.filter((cfg) => deliverables.find((d) => d.deliverable_key === cfg.key)?.status === "done").length;
  const overdueCount = DELIVERABLES.filter((cfg) => {
    const status = deliverables.find((d) => d.deliverable_key === cfg.key)?.status ?? "pending";
    return status !== "done" && currentDay > cfg.dayEnd;
  }).length;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-4 flex-wrap px-1">
        <div>
          <div className={cn("font-heading text-[22px] font-bold tracking-[-0.02em] leading-none", textPrimary)}>
            {doneCount}<span className={cn("text-[15px] font-medium", textMuted)}>/{DELIVERABLES.length}</span>
          </div>
          <div className={cn("text-[11px] mt-1", textMuted)}>Sections complete</div>
        </div>
        <div className="w-px h-8 bg-[#E2E7F2]" />
        <div>
          <div className={cn("text-[22px] font-bold leading-none", overdueCount > 0 ? "text-[#C0392B]" : textPrimary)}>{overdueCount}</div>
          <div className={cn("text-[11px] mt-1", textMuted)}>Overdue</div>
        </div>
        <div className="w-px h-8 bg-[#E2E7F2]" />
        <div>
          {currentDay > PHASE1.dayEnd ? (
            <>
              <div className="text-[18px] font-semibold leading-none text-[#C0392B]">
                {currentDay - PHASE1.dayEnd} Day{currentDay - PHASE1.dayEnd !== 1 ? "s" : ""}
              </div>
              <div className="text-[11px] mt-1 text-[#C0392B]">Overdue</div>
            </>
          ) : (
            <>
              <div className={cn("text-[18px] font-semibold leading-none", textMuted)}>Day {currentDay}</div>
              <div className={cn("text-[11px] mt-1", textMuted)}>of {PHASE1.dayEnd} — {PHASE1.name} phase</div>
            </>
          )}
        </div>
      </div>

      {DELIVERABLES.map((config) => {
        const status = deliverables.find((d) => d.deliverable_key === config.key)?.status ?? "pending";
        const internalItems = internalDeliverablesForSubPhase(config.key);
        return (
          <div key={config.key} className={cn(cardCls, "p-4")}>
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* <span
                  className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ background: colorFor(config.owner) }}
                  title={config.owner}
                >
                  {initialsFor(config.owner)}
                </span> */}
                <span className={cn("text-[13.5px] font-semibold truncate", textPrimary)}>{config.name}</span>
              </div>
              <DueBadge currentDay={currentDay} dayStart={config.dayStart} dayEnd={config.dayEnd} done={status === "done"} />
            </div>
            <p className={cn("text-[12px] mb-3", textMuted)}>{config.description}</p>
            {showInternal && internalItems.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-3 border-t border-[#EDF0F7]">
                {internalItems.map((item) => {
                  const itemStatus = internalDeliverables.find((r) => r.deliverable_key === item.key)?.status ?? "pending";
                  const done = itemStatus === "done";
                  const toggling = togglingKey === item.key;
                  const evidence = EVIDENCE_LINKS[item.key];
                  return (
                    <div key={item.key} className="flex items-center gap-2.5 py-1">
                      <button
                        type="button"
                        disabled={!canEditInternal || toggling}
                        onClick={() => onToggleInternal(item.key, done ? "pending" : "done")}
                        className="flex items-center gap-2.5 text-left cursor-pointer border-none bg-transparent p-0 flex-1 min-w-0 disabled:cursor-default"
                      >
                        {toggling ? (
                          <Loader2 size={17} className="shrink-0 animate-spin text-[#5F6A88]" />
                        ) : (
                          <span className={cn("w-4.25 h-4.25 shrink-0 rounded-[5px] border-[1.5px] flex items-center justify-center", done ? "bg-auth-ok border-auth-ok" : "border-[#C7CEDD]")}>
                            {done && <Check size={11} className="text-white" />}
                          </span>
                        )}
                        <span className={cn("text-[12.5px] truncate", done ? "line-through text-[#5F6A88]" : textPrimary)}>{item.name}</span>
                      </button>
                      {!done && evidence && (
                        <button
                          type="button"
                          onClick={() => (evidence.tab === "files" ? onOpenFolder(evidence.folderName ?? "Business Files") : onGoToAccess())}
                          className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-auth-blue bg-transparent border-none cursor-pointer hover:underline"
                        >
                          {evidence.tab === "files" ? <FolderOpen size={11} /> : <KeyRound size={11} />}
                          Attach from {evidence.tab === "files" ? "Files" : "Access"}
                        </button>
                      )}
                    </div>
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
