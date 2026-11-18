"use client";

// Task 470 — one task-table row, shared by the Tasks listing (`_list-view.tsx`) and the Task Details
// Subtasks tab (`_task-subtasks.tsx`). Moved verbatim from `_list-view.tsx`.
// Task 487 — listing redesign: optional drag handle, drop indicator, ⋯ menu, comment count, density; stronger contrast.
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ListTree, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropLine } from "./_tasks/_drag-parts";
import { STATUS_OPTS } from "./_tasks/_task-options";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  type Task, type TaskStatus,
  STATUS_LABEL, STATUS_STYLE, PRIORITY_STYLE,
  formatDueDate, normalizeStatus, decodeHtmlEntities,
} from "@/app/(hub)/projects-old/_pm-shared";
import { getTaskEditPermission } from "@/lib/tasks/permissions";
import { TaskTimerButton } from "./_task-timer-button";
import { AttachmentIndicator } from "./_attachment-indicator";
import { CopyLinkButton } from "./_copy-link-button";
import { AssigneeMultiSelect } from "./_assignee-multi-select";
import { formatHoursAsHHMM, formatHoursInWords } from "@/lib/timer/format";

// 24px per nesting level (task 487 — the old 16px steps read as alignment noise, not nesting).
const DEPTH_INDENT = ["pl-0", "pl-6", "pl-12", "pl-18", "pl-24", "pl-30", "pl-36"] as const;
const HOVER_ICON = "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 p-1 rounded text-[#5F6A88] hover:text-[#007BFF] hover:bg-[#EDF0F7] transition-colors shrink-0 cursor-pointer";

export type MemberProfile = { id: string; full_name: string | null; avatar_url: string | null };

function getDueColor(due: string | null): string {
  if (!due) return "text-[#5F6A88]";
  const days = Math.ceil((new Date(due).getTime() - Date.now()) / 86400000);
  if (days < 0) return "text-[#C0392B]";
  if (days <= 7) return "text-[#8A5A00]";
  return "text-[#3A4565]";
}

export function TaskRow({
  task, selected, onToggle, href, onUpdate,
  currentUserId, currentUserRole, profilesById, allMembers, hoursById, attachmentCount, onHoursLogged, gridClass,
  depth, childrenCount, isExpanded, onToggleExpand, onAddSubtask, rollup,
  commentCount, compact, handle, menu, drop, dragging, dropId,
}: {
  task: Task;
  selected: boolean;
  onToggle: () => void;
  href: string;
  onUpdate: (id: string, patch: Partial<Task>) => Promise<boolean>;
  currentUserId: string;
  currentUserRole: string | null;
  profilesById: Record<string, { full_name: string; avatar_url: string | null }>;
  allMembers: MemberProfile[];
  hoursById: Record<string, number>;
  attachmentCount: number | undefined;
  onHoursLogged: (taskId: string, hours: number) => void;
  gridClass: string;
  depth: number;
  childrenCount: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onAddSubtask?: () => void;
  rollup: { done: number; total: number } | null;
  // Task 487 — all optional; the Subtasks tab passes none of them.
  commentCount?: number;
  compact?: boolean;
  handle?: ReactNode;
  menu?: ReactNode;
  drop?: "before" | "after" | "nest" | null;
  dragging?: boolean;
  dropId?: string;
}) {
  const norm = normalizeStatus(task.status);
  const ss = STATUS_STYLE[norm] ?? STATUS_STYLE["open"];
  const ps = PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE["normal"];
  const due = formatDueDate(task.due_date);
  const dueColor = getDueColor(task.due_date);
  const totalHours = hoursById[task.id] ?? 0;
  const isAssignedToMe = task.assignees?.includes(currentUserId) ?? false;
  const closed = norm === "closed";
  const title = decodeHtmlEntities(task.title);

  // Task 209 — creator: full edit. Assignee-only: status limited to in_progress/ready_for_qa.
  // Neither: fully read-only.
  const perm = getTaskEditPermission(currentUserRole, currentUserId, task);
  const statusOptions = perm.allowedStatusValues === "all"
    ? STATUS_OPTS
    : Array.from(new Set([norm as TaskStatus, ...perm.allowedStatusValues]));

  return (
    <div
      data-drop-id={dropId}
      className={cn(
        `relative grid ${gridClass} items-center gap-3 pl-4 pr-3 border-b border-[#EDF0F7] last:border-0 transition-colors group/row`,
        compact ? "py-1.5" : "py-2.5",
        selected ? "bg-[#E5F1FF]" : "hover:bg-[#F0F7FF]",
        drop === "nest" && "bg-[#F0F7FF] ring-1 ring-inset ring-[#007BFF]",
        dragging && "opacity-40",
      )}
    >
      {/* Hover/focus accent (a state cue, not a resting stripe) + drag handle in the left gutter. */}
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-[#007BFF] opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100" />
      {handle && <div className="absolute left-0 top-1/2 -translate-y-1/2">{handle}</div>}
      {(drop === "before" || drop === "after") && <DropLine edge={drop === "before" ? "top" : "bottom"} depth={depth} />}
      {drop === "nest" && (
        <span className="pointer-events-none absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-[5px] bg-[#007BFF] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
          → subtask
        </span>
      )}
      {/* Checkbox — Task 285: only the creator (or admin/pm/super_admin) may select a task for
          bulk delete. Disabled inputs don't reliably fire hover/mouse events in Chromium, so the
          tooltip/restricted-cursor lives on a non-disabled <span> wrapper around the input. */}
      {perm.canEditDetails ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="w-3.5 h-3.5 rounded border-[#E2E7F2] cursor-pointer accent-[#007BFF]"
        />
      ) : (
        <Tooltip>
          <TooltipTrigger render={
            <span className="inline-flex cursor-not-allowed">
              <input
                type="checkbox"
                disabled
                className="w-3.5 h-3.5 rounded border-[#E2E7F2] opacity-40 pointer-events-none"
              />
            </span>
          } />
          <TooltipContent side="top">You&apos;re restricted from taking action on this task</TooltipContent>
        </Tooltip>
      )}

      {/* Task name */}
      <div className={`flex items-center min-w-0 gap-1 ${DEPTH_INDENT[Math.min(depth, 6)] ?? "pl-0"}`}>
        {childrenCount > 0 ? (
          <button
            onClick={onToggleExpand}
            title={isExpanded ? "Collapse" : `Expand ${childrenCount} subtask${childrenCount === 1 ? "" : "s"}`}
            className="flex items-center justify-center w-5 h-5 rounded text-[#5F6A88] hover:bg-[#EDF0F7] hover:text-[#0B1533] transition-colors cursor-pointer shrink-0"
          >
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="w-5 h-5 shrink-0" />
        )}
        <Link href={href} className="text-left min-w-0 cursor-pointer group flex-1">
          <span className={cn(
            "text-[13px] truncate block group-hover:text-[#007BFF] transition-colors font-medium",
            closed ? "text-[#5F6A88] line-through decoration-[#5F6A88]/60" : "text-[#0B1533]",
          )}>
            {title}
          </span>
        </Link>
        {rollup && (
          <span title="Closed / total subtasks" className="text-[10.5px] font-mono font-semibold text-[#3A4565] bg-[#EDF0F7] rounded-full px-1.5 py-0.5 leading-none shrink-0 tabular-nums">
            {rollup.done}/{rollup.total}
          </span>
        )}
        <AttachmentIndicator count={attachmentCount} variant="row" />
        {!!commentCount && (
          <Tooltip>
            <TooltipTrigger render={
              <span role="img" aria-label={`${commentCount} comment${commentCount === 1 ? "" : "s"}`} className="inline-flex items-center gap-0.5 text-[11px] font-mono tabular-nums text-[#5F6A88] shrink-0">
                <MessageSquare size={12} aria-hidden /><span aria-hidden>{commentCount}</span>
              </span>
            } />
            <TooltipContent side="top">{commentCount} comment{commentCount === 1 ? "" : "s"}</TooltipContent>
          </Tooltip>
        )}
        <CopyLinkButton url={href} size={13} className={HOVER_ICON} />
        {onAddSubtask && perm.canAddSubtask && (
          <button
            type="button"
            onClick={onAddSubtask}
            aria-label={`Add subtask under ${title}`}
            title="Add subtask"
            className={HOVER_ICON}
          >
            <ListTree size={13} />
          </button>
        )}
        {menu}
      </div>

      {/* Status — pill with a leading dot (task 487); the dot sits over the native select. */}
      <div className="relative min-w-0">
        <span aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-(--status-fg)" style={{ "--status-fg": ss.text } as React.CSSProperties} />
        <select
          value={norm}
          onChange={(e) => void onUpdate(task.id, { status: e.target.value as TaskStatus })}
          disabled={!perm.canChangeStatus}
          aria-label={`Status of ${title}`}
          className="text-[11px] font-semibold rounded-full border pl-5 pr-2.5 py-0.5 outline-none cursor-pointer appearance-none w-full truncate focus-visible:ring-2 focus-visible:ring-[#007BFF] disabled:cursor-not-allowed disabled:opacity-60"
          style={{ color: ss.text, background: ss.bg, borderColor: ss.border }}
        >
          {statusOptions.map((s) => (
            <option key={s} value={s} className="bg-white text-[#3A4565]">{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>

      {/* Assignee picker */}
      <AssigneeMultiSelect
        value={task.assignees ?? []}
        members={allMembers}
        nameById={profilesById}
        editable={perm.canEditDetails}
        onChange={(ids) => void onUpdate(task.id, { assignees: ids })}
      />

      {/* Due date */}
      <span className={`font-mono text-[11.5px] font-medium tabular-nums ${dueColor}`}>{due ?? "—"}</span>

      {/* Priority */}
      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: ps.text }}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ps.dot }} />
        {ps.label}
      </span>

      {/* Hours logged */}
      {totalHours > 0 ? (
        <Tooltip>
          <TooltipTrigger render={
            <span className="font-mono text-[11.5px] font-medium text-[#3A4565] tabular-nums cursor-default">
              {formatHoursAsHHMM(totalHours)}
            </span>
          } />
          <TooltipContent side="top">{formatHoursInWords(totalHours)}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="font-mono text-[11.5px] font-medium text-[#5F6A88] tabular-nums">—</span>
      )}

      {/* Timer */}
      <div className="flex items-center justify-center">
        {isAssignedToMe && (
          <TaskTimerButton
            taskId={task.id}
            projectId={task.project_id}
            onHoursLogged={(hours) => onHoursLogged(task.id, hours)}
            prominent
          />
        )}
      </div>
    </div>
  );
}
