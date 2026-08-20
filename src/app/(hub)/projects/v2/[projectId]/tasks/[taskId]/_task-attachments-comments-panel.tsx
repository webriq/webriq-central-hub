"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { TaskAttachments } from "./_task-attachments";
import { TaskComments } from "./_task-comments";
import { TaskTimeLogs } from "./_task-time-logs";

// Attachments and Comments used to be two separate stacked Cards (task 206); task 211 merges
// them into one panel with a tab switcher instead. Task 214 adds a third "Time Logs" tab to
// the same switcher.
// Task 270 — reordered to Comments-first (default tab too) and redesigned from the pill/
// segmented control to an underline-tab treatment with live item counts, matching Issue
// Detail's `_issue-attachments-comments-panel.tsx` exactly (task 257, Requirement G) — the user
// asked for the two pages' tab UI to match. Counts are lifted from each tab's own fetch via
// `onCountChange` rather than a duplicate count-only query, same as the Issue-side pattern.
type PanelTab = "comments" | "attachments" | "timelogs";

const TAB_ORDER: PanelTab[] = ["comments", "attachments", "timelogs"];

const TAB_LABEL: Record<PanelTab, string> = {
  comments: "Comments",
  attachments: "Attachments",
  timelogs: "Time Logs",
};

export function TaskAttachmentsCommentsPanel({
  projectId,
  taskId,
  timeLogsRefreshKey,
}: {
  projectId: string;
  taskId: string;
  // Task 218 — bumped by the header's TaskTimerButton on stop, so the Time Logs tab refetches.
  timeLogsRefreshKey?: number;
}) {
  const [tab, setTab] = useState<PanelTab>("comments");
  const [counts, setCounts] = useState<{ comments: number | null; attachments: number | null }>({
    comments: null,
    attachments: null,
  });
  const onCommentsCount = useCallback((n: number) => setCounts((c) => ({ ...c, comments: n })), []);
  const onAttachmentsCount = useCallback((n: number) => setCounts((c) => ({ ...c, attachments: n })), []);

  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] overflow-hidden">
      <div className="flex items-center gap-5 px-[18px] border-b border-[#E2E7F2]">
        {TAB_ORDER.map((t) => {
          const count = t === "timelogs" ? null : counts[t];
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={active}
              className={cn(
                "relative py-3 text-[12.5px] font-medium transition-colors cursor-pointer border-b-2 -mb-px",
                active
                  ? "text-[#0B1533] border-[#007BFF]"
                  : "text-[#5F6A88] border-transparent hover:text-[#0B1533]"
              )}
            >
              {TAB_LABEL[t]}
              {count != null && <span className="ml-1 font-mono text-[11px] text-[#5F6A88]">({count})</span>}
            </button>
          );
        })}
      </div>
      <div className="p-[18px]">
        {/* All tabs stay mounted — toggling `hidden` instead of conditionally rendering
            keeps each tab's fetched data/subscriptions alive across switches (task 213),
            instead of unmounting the inactive one and forcing a refetch every time. */}
        <div className={cn(tab !== "comments" && "hidden")}>
          <TaskComments taskId={taskId} onCountChange={onCommentsCount} />
        </div>
        <div className={cn(tab !== "attachments" && "hidden")}>
          <TaskAttachments projectId={projectId} taskId={taskId} onCountChange={onAttachmentsCount} />
        </div>
        <div className={cn(tab !== "timelogs" && "hidden")}>
          <TaskTimeLogs taskId={taskId} refreshKey={timeLogsRefreshKey} />
        </div>
      </div>
    </div>
  );
}
