"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, CheckCircle2, ChevronDown, Eye, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITY_STYLE, SEVERITY_STYLE } from "@/app/(hub)/projects-old/_pm-shared";
import { TaskTimerButton } from "@/app/(hub)/projects/_shared/_task-timer-button";
import { useTimer } from "@/app/(hub)/_components/timer-context";
import { Panel, EmptyState, PriorityDot, RunningBadge, StatusPill, TypeIcon, DueLabel, TRANSITION } from "./_ui";
import { matchesTab, type DevWorkItem, type DevWorkTab } from "./_types";

// Task 360 — "My Tasks": the developer's assigned tasks and tickets in one status-grouped,
// priority-sorted list. The mockup's third row action ("Edit") is deliberately dropped — editing
// lives on the detail page, and duplicating `getTaskEditPermission` gating here would buy nothing.

const COLLAPSED_ROWS = 12;

const TABS: { id: DevWorkTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Due today" },
  { id: "open", label: "Open" },
  { id: "progress", label: "In progress" },
  { id: "review", label: "For review" },
  { id: "closed", label: "Closed" },
];

/**
 * The one row that IS the hub's active timer gets a compact stop-only control instead of
 * `TaskTimerButton` — no ticking elapsed-time text inline in the row (see `RunningBadge`'s
 * comment for why). Isolated to its own leaf so only this single row, not the whole list,
 * re-renders on the timer's per-second tick.
 */
function RunningRowStop() {
  const { stopTimer } = useTimer();
  return (
    <button
      type="button"
      onClick={() => void stopTimer()}
      aria-label="Stop timer"
      title="Stop timer"
      className={cn(
        "w-7 h-7 rounded-[7px] flex items-center justify-center text-[#C0392B]",
        TRANSITION,
        "hover:bg-[#FDE8E6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]"
      )}
    >
      <Square size={12} fill="currentColor" />
    </button>
  );
}

function WorkRow({ item, today, isActiveTimer }: { item: DevWorkItem; today: string; isActiveTimer: boolean }) {
  const isClosed = item.status === "closed";
  // A ticket shows Zoho's own severity vocabulary; a task shows the priority enum. The dot
  // colour is the mapped priority in both cases, so ordering and colour stay consistent.
  const priorityLabel =
    item.kind === "ticket"
      ? SEVERITY_STYLE[item.rawSeverity ?? "None"]?.label ?? "None"
      : PRIORITY_STYLE[item.priority]?.label ?? "Normal";

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-[18px] py-3 border-t border-[#EDF0F7]",
        TRANSITION,
        "hover:bg-[#F0F7FF]"
      )}
    >
      <PriorityDot priority={item.priority} label={priorityLabel} />
      <TypeIcon kind={item.kind} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {item.href ? (
            <Link
              href={item.href}
              className="min-w-0 truncate text-[13.5px] font-semibold text-[#0B1533] hover:text-[#0063D6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF] rounded-sm"
            >
              {item.title}
            </Link>
          ) : (
            <span className="min-w-0 truncate text-[13.5px] font-semibold text-[#0B1533]">{item.title}</span>
          )}
          {isActiveTimer ? <RunningBadge /> : null}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-[#5F6A88] min-w-0">
          <span className="truncate">{item.projectName}</span>
          {item.displayId ? (
            <>
              <span className="text-[#E2E7F2]" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-[10.5px] shrink-0">{item.displayId}</span>
            </>
          ) : null}
        </div>
      </div>

      <span className="hidden sm:block">
        <StatusPill status={item.status} />
      </span>
      <span className="hidden md:block">
        <DueLabel due={item.dueDate} today={today} closed={isClosed} />
      </span>

      <div className="flex items-center gap-1.5 shrink-0">
        <span className="flex items-center justify-center w-7 h-7">
          {isActiveTimer ? (
            <RunningRowStop />
          ) : item.kind === "task" ? (
            <TaskTimerButton taskId={item.id} projectId={item.projectId} />
          ) : (
            <TaskTimerButton issueId={item.id} projectId={item.projectId} />
          )}
        </span>
        {item.href ? (
          <Link
            href={item.href}
            aria-label={`View ${item.title}`}
            title="View details"
            className={cn(
              "w-7 h-7 rounded-[7px] flex items-center justify-center text-[#5F6A88]",
              TRANSITION,
              "hover:bg-[#EDF0F7] hover:text-[#0B1533] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]"
            )}
          >
            <Eye size={14} />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default function DevWorkList({
  items,
  today,
  dueTodayCount,
  openCount,
  inProgressCount,
  closedCount,
}: {
  items: DevWorkItem[];
  today: string;
  /**
   * The parent's `_dev-dashboard.tsx` already computes these totals in its own single pass over
   * this same `items` array (same predicates as the matching tabs below) — passed down rather
   * than re-derived here, so only the "review" tab (which the parent doesn't track) needs its
   * own scan.
   */
  dueTodayCount: number;
  openCount: number;
  inProgressCount: number;
  closedCount: number;
}) {
  const [tab, setTab] = useState<DevWorkTab>("all");
  const [expanded, setExpanded] = useState(false);
  // Only read for its task/ticket *identity* — see `activeKey` below — but React context has no
  // per-field subscription, so this component (and therefore its visible rows) still re-renders
  // once a second while a timer is running, the same as every row's own `TaskTimerButton`
  // already does today. Centralizing the subscription here (one `useTimer()` call instead of one
  // per row) is still strictly better than the status quo.
  const { timer } = useTimer();

  // Derived during render (no effect, no duplicated state) — `rerender-derived-state-no-effect`.
  const counts = useMemo(() => {
    let review = 0;
    for (const item of items) {
      if (matchesTab(item, "review", today)) review++;
    }
    return { all: items.length, today: dueTodayCount, open: openCount, progress: inProgressCount, review, closed: closedCount };
  }, [items, today, dueTodayCount, openCount, inProgressCount, closedCount]);

  const activeKey = timer?.task_id ? `task:${timer.task_id}` : timer?.issue_id ? `ticket:${timer.issue_id}` : null;

  // The item with the running timer floats to the top of whichever tab it's visible in,
  // overriding the normal status/priority order — it stays the one thing you're actually doing
  // right now, regardless of where its status would otherwise sort it.
  const filtered = useMemo(() => {
    const base = tab === "all" ? items : items.filter((i) => matchesTab(i, tab, today));
    if (!activeKey) return base;
    const idx = base.findIndex((i) => `${i.kind}:${i.id}` === activeKey);
    if (idx <= 0) return base;
    const reordered = base.slice();
    const [active] = reordered.splice(idx, 1);
    reordered.unshift(active);
    return reordered;
  }, [items, tab, today, activeKey]);

  const visible = expanded ? filtered : filtered.slice(0, COLLAPSED_ROWS);
  const hiddenCount = filtered.length - visible.length;

  return (
    <Panel
      title="My Tasks"
      hint={
        <div className="flex gap-1 bg-[#EDF0F7] p-[3px] rounded-[9px] flex-wrap" role="tablist" aria-label="Filter my tasks">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setExpanded(false);
              }}
              className={cn(
                "flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-[7px]",
                TRANSITION,
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]",
                tab === t.id
                  ? "bg-white text-[#0B1533] shadow-[0_1px_2px_rgba(7,17,51,0.05)]"
                  : "text-[#5F6A88] hover:text-[#3A4565]"
              )}
            >
              {t.label}
              <span className="font-mono text-[11px] opacity-75">{counts[t.id]}</span>
            </button>
          ))}
        </div>
      }
      foot={
        hiddenCount > 0 || expanded ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={cn(
              "flex items-center justify-center gap-1.5 w-full text-[12.5px] font-semibold text-[#0063D6] rounded-sm",
              TRANSITION,
              "hover:text-[#007BFF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]"
            )}
          >
            {expanded ? "Show less" : `View all ${filtered.length} assigned`}
            <ChevronDown size={13} className={cn("transition-transform motion-reduce:transition-none", expanded && "rotate-180")} />
          </button>
        ) : null
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={16} />}
          title="No work assigned"
          body="Tasks and tickets assigned to you across every project will appear here."
        />
      ) : (
        <>
          <div className="flex items-center gap-2 px-[18px] pb-3 text-[12px] font-medium text-[#5F6A88]">
            <ArrowDownUp size={13} className="shrink-0" />
            Grouped by <b className="font-semibold text-[#3A4565]">status</b>, highest priority then latest first
            within each — tasks and tickets combined
          </div>
          {visible.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 size={16} />}
              title="Nothing in this view"
              body="No assigned work matches this filter right now."
            />
          ) : (
            <div className="flex flex-col">
              {visible.map((item) => (
                <WorkRow
                  key={`${item.kind}-${item.id}`}
                  item={item}
                  today={today}
                  isActiveTimer={`${item.kind}:${item.id}` === activeKey}
                />
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
