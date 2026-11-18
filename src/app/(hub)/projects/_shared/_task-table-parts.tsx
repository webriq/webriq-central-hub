"use client";

// Task 470 — task-table chrome shared by the Tasks listing and the Task Details Subtasks tab:
// grid template, sortable column header row, and the bulk-delete bar. Moved from `_list-view.tsx`.
import { useState, type ReactNode } from "react";
import { Clock, Trash2, Users, X } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import type { SortKey, SortDir } from "@/lib/tasks/task-sort";

// checkbox · name · status · assignee · due · priority · hours · timer
export const TASK_GRID = "grid-cols-[32px_1fr_148px_156px_108px_80px_64px_48px]";

// Task 487 — 10.5px/700 (the guide's 9.5px is too small for a dense daily table).
const HEADER_LABEL = "flex items-center gap-1 text-[10.5px] font-bold text-[#5F6A88] uppercase tracking-[0.08em]";

function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(HEADER_LABEL, "hover:text-[#0B1533] cursor-pointer transition-colors")}
    >
      {label}
      {active && <span className="text-[9px]">{dir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}

export function TaskTableHeader({
  sortKey, sortDir, onToggleSort, leading, className,
}: {
  sortKey: SortKey | null; // null = no active sort (tree/position order)
  sortDir: SortDir;
  onToggleSort: (key: SortKey) => void;
  leading?: ReactNode; // first (checkbox) column — e.g. a select-all box; empty when omitted
  className?: string;
}) {
  return (
    <div className={cn(`grid ${TASK_GRID} items-center gap-3 px-4 py-2.5 border-b border-[#EDF0F7] bg-[#FAFBFE]`, className)}>
      {leading ?? <div />}
      <SortHeader label="Task Name" active={sortKey === "title"} dir={sortDir} onClick={() => onToggleSort("title")} />
      <SortHeader label="Status" active={sortKey === "status"} dir={sortDir} onClick={() => onToggleSort("status")} />
      <span className={HEADER_LABEL}><Users size={11} /> Assignee</span>
      <SortHeader label="Due Date" active={sortKey === "due_date"} dir={sortDir} onClick={() => onToggleSort("due_date")} />
      <SortHeader label="Priority" active={sortKey === "priority"} dir={sortDir} onClick={() => onToggleSort("priority")} />
      <span className={HEADER_LABEL}><Clock size={11} /></span>
      <div /> {/* timer spacer */}
    </div>
  );
}

// Amber selection strip + confirm dialog. Renders nothing while nothing is selected.
export function BulkDeleteBar({
  count, noun = "task", deleting, onClear, onConfirm, className,
}: {
  count: number;
  noun?: string;
  deleting: boolean;
  onClear: () => void;
  onConfirm: () => void;
  className?: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <>
      {count > 0 && (
        <div className={cn("flex items-center gap-2 py-2 bg-[#FFF3D6] border-b border-[#F5DFA0] shrink-0", className)}>
          <button
            onClick={onClear}
            aria-label="Clear selection"
            className="flex items-center justify-center w-5 h-5 rounded hover:bg-[#F5DFA0] text-[#8A5A00] cursor-pointer transition-colors"
          >
            <X size={12} />
          </button>
          <span className="text-[12px] font-semibold text-[#8A5A00]">{count}</span>
          <div className="w-px h-4 bg-[#F5DFA0] mx-1" />
          <Tooltip>
            <TooltipTrigger render={
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={deleting}
                aria-label="Trash"
                className="flex items-center justify-center w-6 h-6 rounded-full border border-[#C0392B]/40 bg-white text-[#C0392B] hover:bg-[#FDE8E6] cursor-pointer transition-colors disabled:opacity-45"
              >
                <Trash2 size={13} />
              </button>
            } />
            <TooltipContent side="top">Trash</TooltipContent>
          </Tooltip>
        </div>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${count} ${noun}${count === 1 ? "" : "s"}?`}
        body="This action is irreversible."
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        confirmDisabled={deleting}
        onConfirm={() => { setConfirmOpen(false); onConfirm(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
