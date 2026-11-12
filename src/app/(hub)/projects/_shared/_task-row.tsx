"use client";

// Task 470 — one task-table row, shared by the Tasks listing (`_list-view.tsx`) and the Task Details
// Subtasks tab (`_task-subtasks.tsx`). Moved verbatim from `_list-view.tsx`.
import Link from "next/link";
import { ChevronDown, ChevronRight, ListTree } from "lucide-react";
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

const STATUS_OPTS: TaskStatus[] = [
  "open", "in_progress", "ready_for_qa", "testing_completed",
  "for_client_approval", "ready_to_merge", "post_live_qa", "closed",
];

const DEPTH_INDENT = ["pl-0", "pl-4", "pl-8", "pl-12", "pl-16", "pl-20", "pl-24"] as const;

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
}) {
  const norm = normalizeStatus(task.status);
  const ss = STATUS_STYLE[norm] ?? STATUS_STYLE["open"];
  const ps = PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE["normal"];
  const due = formatDueDate(task.due_date);
  const dueColor = getDueColor(task.due_date);
  const totalHours = hoursById[task.id] ?? 0;
  const isAssignedToMe = task.assignees?.includes(currentUserId) ?? false;

  // Task 209 — creator: full edit. Assignee-only: status limited to in_progress/ready_for_qa.
  // Neither: fully read-only.
  const perm = getTaskEditPermission(currentUserRole, currentUserId, task);
  const statusOptions = perm.allowedStatusValues === "all"
    ? STATUS_OPTS
    : Array.from(new Set([norm as TaskStatus, ...perm.allowedStatusValues]));

  return (
    <div className={`grid ${gridClass} items-center gap-3 pl-4 pr-3 py-2.5 border-b border-[#EDF0F7] last:border-0 transition-colors group/row ${
      selected ? "bg-[#F0F7FF]" : "hover:bg-[#F0F7FF]/60"
    }`}>
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
          <span className="text-[13px] text-[#3A4565] truncate block group-hover:text-[#007BFF] transition-colors font-medium">
            {decodeHtmlEntities(task.title)}
          </span>
        </Link>
        <AttachmentIndicator count={attachmentCount} variant="row" />
        <CopyLinkButton
          url={href}
          size={13}
          className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 p-1 rounded text-[#94A0BE] hover:text-[#007BFF] hover:bg-[#EDF0F7] transition-colors shrink-0 cursor-pointer"
        />
        {onAddSubtask && perm.canAddSubtask && (
          <button
            type="button"
            onClick={onAddSubtask}
            aria-label={`Add subtask under ${task.title}`}
            title="Add subtask"
            className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 p-1 rounded text-[#94A0BE] hover:text-[#007BFF] hover:bg-[#EDF0F7] transition-colors shrink-0 cursor-pointer"
          >
            <ListTree size={13} />
          </button>
        )}
        {rollup && (
          <span title="Closed / total subtasks" className="text-[10px] font-semibold text-[#5F6A88] bg-[#EDF0F7] rounded-full px-1.5 py-0.5 leading-none shrink-0 tabular-nums">
            {rollup.done}/{rollup.total}
          </span>
        )}
      </div>

      {/* Status */}
      <select
        value={norm}
        onChange={(e) => void onUpdate(task.id, { status: e.target.value as TaskStatus })}
        disabled={!perm.canChangeStatus}
        className="text-[11px] font-semibold rounded-full border px-2.5 py-0.5 outline-none cursor-pointer appearance-none w-full truncate disabled:cursor-not-allowed disabled:opacity-60"
        style={{ color: ss.text, background: ss.bg, borderColor: ss.border }}
      >
        {statusOptions.map((s) => (
          <option key={s} value={s} className="bg-white text-[#3A4565]">{STATUS_LABEL[s]}</option>
        ))}
      </select>

      {/* Assignee picker */}
      <AssigneeMultiSelect
        value={task.assignees ?? []}
        members={allMembers}
        nameById={profilesById}
        editable={perm.canEditDetails}
        onChange={(ids) => void onUpdate(task.id, { assignees: ids })}
      />

      {/* Due date */}
      <span className={`text-[12px] font-medium tabular-nums ${dueColor}`}>{due ?? "—"}</span>

      {/* Priority */}
      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: ps.text }}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ps.dot }} />
        {ps.label}
      </span>

      {/* Hours logged */}
      {totalHours > 0 ? (
        <Tooltip>
          <TooltipTrigger render={
            <span className="text-[12px] font-medium text-[#5F6A88] tabular-nums cursor-default">
              {formatHoursAsHHMM(totalHours)}
            </span>
          } />
          <TooltipContent side="top">{formatHoursInWords(totalHours)}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="text-[12px] font-medium text-[#5F6A88] tabular-nums">—</span>
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
