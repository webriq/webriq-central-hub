"use client";

import { useEffect, useState } from "react";
import { Clock, MessageSquare, Pencil, Plus, Timer, Trash2 } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn, formatDate, formatRelativeTime } from "@/lib/utils";
import { formatHoursAsHHMM, formatClockTime } from "@/lib/timer/format";
import type { TimerEvent } from "@/lib/timer/timeline";
import { OwnerChip } from "../../../_pm-shared";
import { TimeLogForm, type TimeLogEntry } from "./_time-log-form";
import { TimerTimelinePopover } from "./_timer-timeline-popover";

// Time Logs tab (task 214; task 215 adds hh:mm formatting, Time Period, the timer-timeline
// popover, a Notes value, and a role-gated Source value) — manual-entry fallback alongside
// `TaskTimerButton`. Every viewer with access to the task sees every entry logged against it
// (migration 094's developer-read-all policy), grouped by date with a per-day subtotal.
// Add/edit/delete is gated on the server; `canAdd`/`can_edit`/`canSeeSource` from the API drive
// which controls render, so PM/admin/hr see a read-only list plus a Source column and nothing
// else write-capable.

function groupByDate(entries: TimeLogEntry[]): [string, TimeLogEntry[]][] {
  const map = new Map<string, TimeLogEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.date_logged) ?? [];
    list.push(entry);
    map.set(entry.date_logged, list);
  }
  return [...map.entries()];
}

function sumHours(entries: TimeLogEntry[]): number {
  return entries.reduce((total, e) => total + e.hours, 0);
}

function timePeriod(entry: TimeLogEntry): React.ReactNode {
  if (!entry.start_time || !entry.end_time) return <span className="text-[#C7CEDD]">—</span>;
  return (
    <span className="whitespace-nowrap font-mono tabular-nums text-[#5F6A88]">
      {formatClockTime(entry.start_time)}
      <span className="mx-1.5 text-[#C7CEDD]">–</span>
      {formatClockTime(entry.end_time)}
    </span>
  );
}

function hasRecordedTimeline(entry: TimeLogEntry): entry is TimeLogEntry & { start_time: string; end_time: string } {
  return entry.source === "timer" && !!entry.start_time && !!entry.end_time && Array.isArray(entry.timeline) && entry.timeline.length > 0;
}

// `formatRelativeTime` (shared, used app-wide by comments etc.) never reverts to an exact
// timestamp — it just counts "Xh ago" up to 23h, then "Xd ago" forever after. That reads fine
// for a comment thread but is ambiguous for a time log ("3h ago" from which day?), so this tab
// scopes its own rule on top: relative within today, exact date+time once it's a prior day.
function formatLoggedAt(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const sameDay = then.getFullYear() === now.getFullYear() && then.getMonth() === now.getMonth() && then.getDate() === now.getDate();
  return sameDay ? formatRelativeTime(iso) : `${formatDate(iso)}, ${formatClockTime(iso)}`;
}

export function TaskTimeLogs({ taskId, refreshKey }: { taskId: string; refreshKey?: number }) {
  const [entries, setEntries] = useState<TimeLogEntry[]>([]);
  const [canAdd, setCanAdd] = useState(false);
  const [canSeeSource, setCanSeeSource] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const apiBasePath = `/api/v2/tasks/${taskId}/time-logs`;

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(apiBasePath, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { entries: [], canAdd: false, canSeeSource: false }))
      .then((data: { entries: TimeLogEntry[]; canAdd: boolean; canSeeSource: boolean }) => {
        setEntries(data.entries);
        setCanAdd(data.canAdd);
        setCanSeeSource(data.canSeeSource);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
    // Task 218 — `refreshKey` refetches after the header TaskTimerButton logs an entry via stop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, refreshKey]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this time log entry? This cannot be undone.")) return;
    const res = await fetch(`${apiBasePath}/${id}`, { method: "DELETE" });
    if (res.ok) setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <div className="h-10 animate-pulse bg-[#F4F6FB] rounded-[8px]" />
        <div className="h-10 animate-pulse bg-[#F4F6FB] rounded-[8px]" />
      </div>
    );
  }

  const groups = groupByDate(entries);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-[#5F6A88]">
          Total logged: <span className="font-mono font-semibold text-[#0B1533]">{formatHoursAsHHMM(sumHours(entries))}</span>
        </span>
        {canAdd && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#007BFF] text-white text-[12px] font-semibold hover:bg-[#0063D6] cursor-pointer transition-colors"
          >
            <Plus size={13} /> Add Time Log
          </button>
        )}
      </div>

      {adding && (
        <TimeLogForm
          apiBasePath={apiBasePath}
          onSaved={(entry) => {
            setEntries((prev) => [entry, ...prev]);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-4 text-center">
          <Clock size={18} className="text-[#C7CEDD]" />
          <p className="text-[12px] text-[#5F6A88]">No time logged yet</p>
          {canAdd && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-1 text-[12px] font-semibold text-[#0063D6] hover:underline cursor-pointer"
            >
              + Add Time Log
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([date, dayEntries]) => (
            <div key={date} className="flex flex-col gap-2">
              <div className="flex items-center justify-between border-b border-[#EDF0F7] pb-1.5">
                <span className="text-[11px] font-semibold text-[#0B1533]">{formatDate(date)}</span>
                <span className="text-[11px] font-mono text-[#5F6A88]">{formatHoursAsHHMM(sumHours(dayEntries))}</span>
              </div>
              <ul className="flex flex-col gap-3">
                {dayEntries.map((entry) =>
                  editingId === entry.id ? (
                    <TimeLogForm
                      key={entry.id}
                      apiBasePath={apiBasePath}
                      initial={entry}
                      onSaved={(updated) => {
                        setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
                        setEditingId(null);
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <li key={entry.id} className="flex items-center gap-2.5">
                      <OwnerChip name={entry.display_name} />
                      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                        <span className="text-[12px] font-semibold text-[#0B1533] leading-none">{entry.display_name}</span>
                        <span className="text-[12px] font-mono font-semibold text-[#3A4565] leading-none">{formatHoursAsHHMM(entry.hours)}</span>
                        <span className="text-[11px] leading-none">{timePeriod(entry)}</span>

                        {hasRecordedTimeline(entry) && (
                          <TimerTimelinePopover
                            hours={entry.hours}
                            startTime={entry.start_time}
                            endTime={entry.end_time}
                            timeline={entry.timeline as unknown as TimerEvent[]}
                          >
                            <button
                              type="button"
                              aria-label="View timer details"
                              className="flex items-center justify-center text-[#5F6A88] hover:text-[#007BFF] cursor-pointer transition-colors"
                            >
                              <Timer size={13} />
                            </button>
                          </TimerTimelinePopover>
                        )}

                        {entry.note && (
                          <Tooltip>
                            <TooltipTrigger render={
                              <button
                                type="button"
                                aria-label="View notes"
                                className="flex items-center justify-center text-[#5F6A88] hover:text-[#007BFF] cursor-pointer transition-colors"
                              >
                                <MessageSquare size={13} />
                              </button>
                            } />
                            <TooltipContent side="top" className="whitespace-pre-wrap">{entry.note}</TooltipContent>
                          </Tooltip>
                        )}

                        {canSeeSource && (
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
                        )}
                        <span className="text-[10px] font-mono text-[#5F6A88] ml-auto shrink-0 leading-none">{formatLoggedAt(entry.created_at)}</span>
                      </div>
                      {entry.can_edit && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingId(entry.id)}
                            aria-label="Edit time log"
                            className="p-1.5 rounded-full text-[#5F6A88] hover:text-[#007BFF] hover:bg-[#E5F1FF] cursor-pointer transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(entry.id)}
                            aria-label="Delete time log"
                            className="p-1.5 rounded-full text-[#5F6A88] hover:text-[#C0392B] hover:bg-[#FDE8E6] cursor-pointer transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </li>
                  )
                )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
