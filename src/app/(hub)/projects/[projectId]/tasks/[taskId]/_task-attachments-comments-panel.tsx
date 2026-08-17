"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { TaskAttachments } from "./_task-attachments";
import { TaskComments } from "./_task-comments";
import { TaskTimeLogs } from "./_task-time-logs";

// Attachments and Comments used to be two separate stacked Cards (task 206); task 211 merges
// them into one panel with a pill-tab switcher instead. Pill-tab visual pattern mirrors
// ../../_project-detail.tsx's primary-tabs switcher (same subtree, same active-state colors) —
// not the portfolio-tracker's PillTabs component, which is a different feature directory with a
// different active-state color. Task 214 adds a third "Time Logs" tab to the same switcher.
type PanelTab = "attachments" | "comments" | "timelogs";

const TAB_LABEL: Record<PanelTab, string> = {
  attachments: "Attachments",
  comments: "Comments",
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
  const [tab, setTab] = useState<PanelTab>("attachments");

  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] overflow-hidden">
      <div className="flex items-center px-[18px] py-3 border-b border-[#EDF0F7]">
        <div className="flex items-center gap-1 bg-[#F4F6FB] rounded-full p-1">
          {(["attachments", "comments", "timelogs"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={cn(
                "px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer",
                tab === t
                  ? "bg-white text-[#0B1533] shadow-[0_1px_2px_rgba(7,17,51,.05)]"
                  : "text-[#5F6A88] hover:text-[#0B1533]"
              )}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="p-[18px]">
        {/* All tabs stay mounted — toggling `hidden` instead of conditionally rendering
            keeps each tab's fetched data/subscriptions alive across switches (task 213),
            instead of unmounting the inactive one and forcing a refetch every time. */}
        <div className={cn(tab !== "attachments" && "hidden")}>
          <TaskAttachments projectId={projectId} taskId={taskId} />
        </div>
        <div className={cn(tab !== "comments" && "hidden")}>
          <TaskComments taskId={taskId} />
        </div>
        <div className={cn(tab !== "timelogs" && "hidden")}>
          <TaskTimeLogs taskId={taskId} refreshKey={timeLogsRefreshKey} />
        </div>
      </div>
    </div>
  );
}
