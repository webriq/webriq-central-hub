"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Clock, ExternalLink, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Avatar } from "../_components/dashboard-shared";
import { decodeHtmlEntities } from "@/app/(hub)/projects-old/_pm-shared";
import { cn, formatDate } from "@/lib/utils";
import { formatHoursAsHHMM, formatClockTime } from "@/lib/timer/format";
import { groupByEmployee, sumHours, toISODate, nowHHmm, combineDateTime, isoToHHmm, type TimeLogEntry } from "./_time-logs-shared";
import { DateFieldPicker } from "./_date-field-picker";
import { TimePeriodInlineEditor } from "./_time-period-inline-editor";
import { TaskIssuePicker, type TaskIssueValue } from "./_task-issue-picker";
import { POPOVER_ROOT_ATTR } from "./_use-popover-position";

// Table body for the dedicated Time Logs page (task 226). View-all roles (admin/super_admin/pm/
// hr) get a collapsible per-user grouping with a period subtotal, matching the reference
// screenshot's default state; the developer's self-only view is always a flat list (grouping by
// "just me" would be a no-op header) — see the task doc's Assumption 3.
//
// Task 230 — row actions only reveal on hover (Requirement 13); the Log Title, Time Period, and
// Date cells are inline-editable on click (Requirement 14), each committing through the unified
// `PATCH /api/v2/time-logs/[id]` route; a task/issue-linked Log Title also shows a detail-link
// icon on hover (Requirement 15). Every write here uses the same-shaped `TimeLogEntry` the modal
// already produces so `onInlineSave` can reuse `_time-logs-content.tsx`'s existing
// `handleSaved`-style merge.

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function avatarIdx(name: string): number {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return sum;
}

function withDate(iso: string | null, dateStr: string): string | null {
  if (!iso) return iso;
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return combineDateTime(dateStr, `${hh}:${mm}`);
}

function maxTimeFor(dateStr: string): string | undefined {
  return dateStr === toISODate(new Date()) ? nowHHmm() : undefined;
}

async function patchEntry(
  id: string,
  body: Record<string, unknown>
): Promise<{ ok: true; data: { hours: number; start_time: string | null; end_time: string | null; date_logged: string; note: string | null; log_title: string | null } } | { ok: false; error: string }> {
  const res = await fetch(`/api/v2/time-logs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true, data: await res.json() };
  const err = await res.json().catch(() => ({}));
  return { ok: false, error: err.error || "Failed to save time log." };
}

function basePatchBody(entry: TimeLogEntry) {
  return {
    task_id: entry.task_id,
    issue_id: entry.issue_id,
    date_logged: entry.date_logged,
    start_time: entry.start_time,
    end_time: entry.end_time,
    note: entry.note,
    log_title: entry.log_title,
  };
}

function detailHref(entry: TimeLogEntry): string | null {
  if (!entry.project_public_id) return null;
  if (entry.entry_kind === "task" && entry.task_display_id) {
    return `/projects/${entry.project_public_id}/tasks/${entry.task_display_id}`;
  }
  if (entry.entry_kind === "issue" && entry.issue_display_id) {
    return `/projects/${entry.project_public_id}/issues/${entry.issue_display_id}`;
  }
  return null;
}

function TimePeriodCell({ entry }: { entry: TimeLogEntry }) {
  if (!entry.start_time || !entry.end_time) return <span className="text-[#C7CEDD]">—</span>;
  return (
    <span className="whitespace-nowrap font-mono tabular-nums text-[#5F6A88]">
      {formatClockTime(entry.start_time)}
      <span className="mx-1.5 text-[#C7CEDD]">–</span>
      {formatClockTime(entry.end_time)}
    </span>
  );
}

function pickerValueFromEntry(entry: TimeLogEntry): TaskIssueValue {
  if (entry.entry_kind === "task" && entry.task_id) {
    return { kind: "task", id: entry.task_id, label: entry.task_title, displayId: entry.task_display_id };
  }
  if (entry.entry_kind === "issue" && entry.issue_id) {
    return { kind: "issue", id: entry.issue_id, label: entry.log_title, displayId: entry.issue_display_id };
  }
  // Task 348 — a General Log's title lives in `log_title`, not `note`.
  return { kind: "general", text: entry.log_title ?? "" };
}

// Inline editor for the Log Title cell — reassigns an entry between task/issue/General Log in
// place. Task/issue picks commit immediately (mirrors `TaskIssuePicker`'s own close-on-pick);
// General Log needs an explicit Save/Cancel since it's free text, not a single click.
function LogTitleEditor({
  entry, currentUserId, onSaved, onCancel,
}: {
  entry: TimeLogEntry;
  currentUserId: string;
  onSaved: (updated: TimeLogEntry) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<TaskIssueValue | null>(() => pickerValueFromEntry(entry));
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function commit(value: TaskIssueValue) {
    setSaving(true);
    const taskId = value.kind === "task" ? value.id : null;
    const issueId = value.kind === "issue" ? value.id : null;
    // Task 348 — this cell edits the Log Title only: a General Log title goes to `log_title`,
    // the entry's notes (`note`) are left untouched and edited via the modal instead.
    const logTitle = value.kind === "general" ? value.text.trim() : null;
    const result = await patchEntry(entry.id, { ...basePatchBody(entry), task_id: taskId, issue_id: issueId, log_title: logTitle });
    setSaving(false);
    if (result.ok) {
      onSaved({
        ...entry,
        task_id: taskId,
        issue_id: issueId,
        entry_kind: value.kind,
        task_title: value.kind === "task" ? value.label : "—",
        task_display_id: value.kind === "task" ? value.displayId : null,
        issue_display_id: value.kind === "issue" ? value.displayId : null,
        log_title: value.kind === "general" ? value.text.trim() || "General log" : value.label,
        note: result.data.note,
        hours: result.data.hours,
        start_time: result.data.start_time,
        end_time: result.data.end_time,
      });
    }
  }

  function handleChange(v: TaskIssueValue | null) {
    if (!v) {
      // Only reachable via `TaskIssuePicker`'s "switch to General Log" toggle with no text typed
      // yet, or "switch back to picker" with nothing previously selected — keep the draft as an
      // empty General Log rather than losing the in-progress toggle.
      setDraft({ kind: "general", text: "" });
      return;
    }
    setDraft(v);
    if (v.kind !== "general") void commit(v);
  }

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      // `TaskIssuePicker`'s own dropdown panel is portaled to `document.body` — outside this
      // wrapper's DOM subtree even while a task/issue row inside it is being clicked. Without this
      // check, that `mousedown` reads as "outside" and cancels the whole inline edit before the
      // row's own `onClick` (the actual pick) can fire, which was silently breaking reassignment
      // from a General Log to a task/issue (task/issue -> General Log worked, since that path only
      // ever interacts with non-portaled elements already inside `containerRef`).
      if (target instanceof Element && target.closest(`[${POPOVER_ROOT_ATTR}]`)) return;
      onCancel();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onCancel]);

  return (
    <div ref={containerRef} className="min-w-[220px]">
      <TaskIssuePicker
        projectId={entry.project_public_id ?? ""}
        currentUserId={currentUserId}
        value={draft}
        onChange={handleChange}
      />
      {draft?.kind === "general" && (
        <div className="flex items-center gap-2 mt-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-2 py-1 rounded-full text-[10px] font-medium text-[#5F6A88] hover:text-[#0B1533] cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void commit(draft)}
            disabled={saving || !draft.text.trim()}
            className="px-2.5 py-1 rounded-full bg-[#FB914E] text-[#471F02] text-[10px] font-semibold hover:bg-[#E2762F] hover:text-white disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}

type EditingField = "title" | "period" | "date";

function EntryRow({
  entry, currentUserId, editing, onStartEdit, onStopEdit, onInlineSave, onEdit, onDelete,
}: {
  entry: TimeLogEntry;
  currentUserId: string;
  editing: EditingField | null;
  onStartEdit: (field: EditingField) => void;
  onStopEdit: () => void;
  onInlineSave: (updated: TimeLogEntry) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const href = detailHref(entry);

  async function saveDate(nextDate: string) {
    const result = await patchEntry(entry.id, {
      ...basePatchBody(entry),
      date_logged: nextDate,
      start_time: withDate(entry.start_time, nextDate),
      end_time: withDate(entry.end_time, nextDate),
    });
    onStopEdit();
    if (result.ok) {
      onInlineSave({ ...entry, date_logged: result.data.date_logged, start_time: result.data.start_time, end_time: result.data.end_time, hours: result.data.hours });
    }
  }

  async function savePeriod(next: { startTime: string; endTime: string }) {
    const result = await patchEntry(entry.id, {
      ...basePatchBody(entry),
      start_time: combineDateTime(entry.date_logged, next.startTime),
      end_time: combineDateTime(entry.date_logged, next.endTime),
    });
    onStopEdit();
    if (result.ok) {
      onInlineSave({ ...entry, start_time: result.data.start_time, end_time: result.data.end_time, hours: result.data.hours });
    }
  }

  return (
    <tr className="group border-b border-[#EDF0F7] hover:bg-[#F0F7FF] transition-colors">
      <td className="py-2.5 pl-[18px] pr-3">
        {editing === "title" ? (
          <LogTitleEditor entry={entry} currentUserId={currentUserId} onSaved={(updated) => { onInlineSave(updated); onStopEdit(); }} onCancel={onStopEdit} />
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => entry.can_edit && onStartEdit("title")}
              disabled={!entry.can_edit}
              className={cn(
                "text-left text-[13px] font-medium text-[#0B1533] min-w-0",
                entry.can_edit ? "cursor-pointer hover:text-[#007BFF]" : "cursor-default"
              )}
            >
              <span className="truncate max-w-[220px] block">{decodeHtmlEntities(entry.log_title)}</span>
            </button>
            {href && (
              // Sibling to the edit trigger, not nested inside it — a `<button>` cannot contain
              // interactive content like an `<a>` (invalid HTML / hydration risk).
              <Link
                href={href}
                aria-label="View details"
                className="opacity-0 group-hover:opacity-100 shrink-0 text-[#5F6A88] hover:text-[#007BFF] transition-opacity"
              >
                <ExternalLink size={12} />
              </Link>
            )}
          </div>
        )}
      </td>
      <td className="py-2.5 px-3 text-[13px] text-[#5F6A88]">{entry.project_name}</td>
      <td className="py-2.5 px-3 font-mono text-[13px] font-semibold text-[#3A4565] whitespace-nowrap">{formatHoursAsHHMM(entry.hours)}</td>
      <td className="py-2.5 px-3 text-[13px] relative">
        {editing === "period" ? (
          <TimePeriodInlineEditor
            date={entry.date_logged}
            startTime={isoToHHmm(entry.start_time)}
            endTime={isoToHHmm(entry.end_time)}
            maxTime={maxTimeFor(entry.date_logged)}
            onSave={(next) => void savePeriod(next)}
            onClose={onStopEdit}
          />
        ) : null}
        <button
          type="button"
          onClick={() => entry.can_edit && onStartEdit("period")}
          disabled={!entry.can_edit}
          className={cn("text-left", entry.can_edit ? "cursor-pointer hover:text-[#007BFF]" : "cursor-default")}
        >
          <TimePeriodCell entry={entry} />
        </button>
      </td>
      <td className="py-2.5 px-3 text-[13px] text-[#5F6A88] whitespace-nowrap">
        {editing === "date" ? (
          <DateFieldPicker
            value={entry.date_logged}
            onChange={(v) => void saveDate(v)}
            autoOpen
            onClose={onStopEdit}
          />
        ) : (
          <button
            type="button"
            onClick={() => entry.can_edit && onStartEdit("date")}
            disabled={!entry.can_edit}
            className={cn("cursor-pointer hover:text-[#007BFF]", !entry.can_edit && "cursor-default")}
          >
            {formatDate(entry.date_logged)}
          </button>
        )}
      </td>
      <td className="py-2.5 px-3">
        <span
          className={cn(
            "text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 leading-none",
            entry.source === "manual"
              ? "bg-[#F4F6FB] text-[#5F6A88] border-[#E2E7F2]"
              : "bg-[#E5F1FF] text-[#0063D6] border-[#CFE4FF]"
          )}
        >
          {entry.source === "manual" ? "Manual" : "Timer"}
        </span>
      </td>
      <td className="py-2.5 px-3">
        {entry.note ? (
          <Tooltip>
            <TooltipTrigger render={
              <button type="button" aria-label="View notes" className="flex items-center justify-center text-[#5F6A88] hover:text-[#007BFF] cursor-pointer transition-colors">
                <MessageSquare size={13} />
              </button>
            } />
            <TooltipContent side="top">
              {/* Task 317 — `note` is Tiptap-authored HTML (`_time-log-notes-editor.tsx`), same
                  staff-authored trust boundary already rendered via dangerouslySetInnerHTML for
                  task/issue comments (`_task-comments.tsx`). Rendering it as plain text prints the
                  literal tags instead of formatted content. Zoho-imported notes are already
                  HTML-stripped at import (`zoho-import/timelogs/route.ts`), so this is a no-op for
                  those (no tags to interpret). The HTML lives on this inner span, not directly on
                  `TooltipContent`'s own props — that component always renders its own `{children}`
                  alongside its arrow element, so a `dangerouslySetInnerHTML` prop spread onto it
                  would collide with that non-empty `children` and throw at runtime. */}
              <span
                className="[&_p]:my-0.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-4 [&_ol]:pl-4 [&_li]:my-0.5"
                dangerouslySetInnerHTML={{ __html: entry.note }}
              />
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-[#C7CEDD]">—</span>
        )}
      </td>
      <td className="py-2.5 pl-3 pr-[18px]">
        {entry.can_edit && (
          <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button type="button" onClick={onEdit} aria-label="Edit time log" className="p-1.5 rounded-full text-[#5F6A88] hover:text-[#007BFF] hover:bg-[#E5F1FF] cursor-pointer transition-colors">
              <Pencil size={13} />
            </button>
            <button type="button" onClick={onDelete} aria-label="Delete time log" className="p-1.5 rounded-full text-[#5F6A88] hover:text-[#C0392B] hover:bg-[#FDE8E6] cursor-pointer transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

const HEADER_CLASS = "text-left text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] bg-[#FAFBFE] py-2.5";

function TableHead() {
  return (
    <thead>
      <tr className="border-b border-[#EDF0F7]">
        <th className={cn(HEADER_CLASS, "pl-[18px] pr-3")}>Log Title</th>
        <th className={cn(HEADER_CLASS, "px-3")}>Project</th>
        <th className={cn(HEADER_CLASS, "px-3")}>Daily Log Hours</th>
        <th className={cn(HEADER_CLASS, "px-3")}>Time Period</th>
        <th className={cn(HEADER_CLASS, "px-3")}>Date</th>
        <th className={cn(HEADER_CLASS, "px-3")}>Type</th>
        <th className={cn(HEADER_CLASS, "px-3")}>Notes</th>
        <th className={cn(HEADER_CLASS, "pl-3 pr-[18px]")} />
      </tr>
    </thead>
  );
}

function EmptyState({ canAdd, onAdd }: { canAdd: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <Clock size={22} className="text-[#C7CEDD]" />
      <p className="text-[13px] text-[#5F6A88]">No time logged for this period</p>
      {canAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0063D6] hover:underline cursor-pointer"
        >
          <Plus size={13} /> Add Time Log
        </button>
      )}
    </div>
  );
}

export function TimeLogsTable({
  entries, grouped, canAdd, currentUserId, onAdd, onEdit, onDelete, onInlineSave,
}: {
  entries: TimeLogEntry[];
  grouped: boolean;
  canAdd: boolean;
  currentUserId: string;
  onAdd: () => void;
  onEdit: (entry: TimeLogEntry) => void;
  onDelete: (entry: TimeLogEntry) => void;
  onInlineSave: (updated: TimeLogEntry) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingRow, setEditingRow] = useState<{ id: string; field: EditingField } | null>(null);

  function rowProps(entry: TimeLogEntry) {
    return {
      currentUserId,
      editing: editingRow?.id === entry.id ? editingRow.field : null,
      onStartEdit: (field: EditingField) => setEditingRow({ id: entry.id, field }),
      onStopEdit: () => setEditingRow(null),
      onInlineSave,
      onEdit: () => onEdit(entry),
      onDelete: () => onDelete(entry),
    };
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)]">
        <EmptyState canAdd={canAdd} onAdd={onAdd} />
      </div>
    );
  }

  if (!grouped) {
    return (
      <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] overflow-x-auto">
        <table className="w-full border-collapse">
          <TableHead />
          <tbody>
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} {...rowProps(entry)} />
            ))}
          </tbody>
          {/* Task 317 — the flat (ungrouped) table is reached exclusively by the `developer` role
              (client/marketing are redirected off this page in page.tsx; every other role gets
              `groupByUser: true` and its own per-employee subtotal in the grouped branch below), so
              this total is scoped to that self-view per the task doc's confirmed scope. */}
          <tfoot>
            <tr className="border-t border-[#EDF0F7] bg-[#F9FAFD]">
              <td className="py-2.5 pl-[18px] pr-3 text-[13px] font-semibold text-[#0B1533]">Total</td>
              <td className="py-2.5 px-3" />
              <td className="py-2.5 px-3 font-mono text-[13px] font-semibold text-[#3A4565] whitespace-nowrap">
                {formatHoursAsHHMM(sumHours(entries))}
              </td>
              <td colSpan={5} />
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  const groups = groupByEmployee(entries);

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] overflow-x-auto">
      <table className="w-full border-collapse">
        <TableHead />
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.key);
          return (
            <tbody key={group.key}>
              <tr
                className="cursor-pointer bg-[#F9FAFD] border-b border-[#EDF0F7]"
                onClick={() => toggle(group.key)}
              >
                <td colSpan={8} className="py-2 pl-[18px] pr-[18px]">
                  <div className="flex items-center gap-2.5">
                    <ChevronDown size={13} className={cn("text-[#5F6A88] transition-transform", isCollapsed && "-rotate-90")} />
                    <Avatar initials={initialsOf(group.name)} avatarUrl={group.avatarUrl} size={6} idx={avatarIdx(group.name)} />
                    <span className="text-[12px] font-semibold text-[#0B1533]">{group.name}</span>
                    <span className="ml-auto font-mono text-[12px] font-semibold text-[#3A4565]">
                      {formatHoursAsHHMM(sumHours(group.entries))}
                    </span>
                  </div>
                </td>
              </tr>
              {!isCollapsed && group.entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} {...rowProps(entry)} />
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
