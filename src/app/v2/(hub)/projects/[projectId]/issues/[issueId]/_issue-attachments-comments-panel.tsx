"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { IssueAttachments } from "./_issue-attachments";
import { IssueComments } from "./_issue-comments";
import { IssueTimeLogs } from "./_issue-time-logs";

// Task 238 — replaces the three separate Attachments/Comments/Time Logs Cards (235/236/237) with a
// single pill-tab panel, mirroring ../../tasks/[taskId]/_task-attachments-comments-panel.tsx's
// pattern exactly (same tab-switcher visual, same "all tabs stay mounted, toggle `hidden`" behavior
// so each tab's fetched data/subscriptions survive tab switches).
type PanelTab = "attachments" | "comments" | "timelogs";

const TAB_LABEL: Record<PanelTab, string> = {
  attachments: "Attachments",
  comments: "Comments",
  timelogs: "Time Logs",
};

export function IssueAttachmentsCommentsPanel({
  projectId,
  issueId,
  canEdit,
  currentUserId,
  currentUserRole,
  timeLogsRefreshKey,
}: {
  projectId: string;
  issueId: string;
  canEdit: boolean;
  currentUserId: string;
  currentUserRole: string | null;
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
        <div className={cn(tab !== "attachments" && "hidden")}>
          <IssueAttachments projectId={projectId} issueId={issueId} canEdit={canEdit} />
        </div>
        <div className={cn(tab !== "comments" && "hidden")}>
          <IssueComments
            projectId={projectId}
            issueId={issueId}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
          />
        </div>
        <div className={cn(tab !== "timelogs" && "hidden")}>
          <IssueTimeLogs issueId={issueId} refreshKey={timeLogsRefreshKey} />
        </div>
      </div>
    </div>
  );
}
