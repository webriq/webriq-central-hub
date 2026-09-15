"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { TicketAttachments } from "./_ticket-attachments";
import { TicketComments } from "./_ticket-comments";
import { TicketTimeLogs } from "./_ticket-time-logs";
import { useAttachmentDeepLink } from "@/app/(hub)/projects/_shared/_use-attachment-deeplink";

// Task 238 — replaces the three separate Attachments/Comments/Time Logs Cards (235/236/237) with a
// single tab panel, mirroring ../../tasks/[taskId]/_task-attachments-comments-panel.tsx's pattern
// (same "all tabs stay mounted, toggle `hidden`" behavior so each tab's fetched data/subscriptions
// survive tab switches).
// Task 257, Requirement G — reordered to Comments-first (matching Zoho's own reference layout,
// where Comments is the default/leftmost tab), tab labels now show live item counts, and the
// switcher moved from a pill/segmented control to an underline-tab treatment closer to the
// reference. Counts are lifted from each tab's own fetch via `onCountChange` rather than a
// duplicate count-only query.
type PanelTab = "comments" | "attachments" | "timelogs";

const TAB_ORDER: PanelTab[] = ["comments", "attachments", "timelogs"];

const TAB_LABEL: Record<PanelTab, string> = {
  comments: "Comments",
  attachments: "Attachments",
  timelogs: "Time Logs",
};

export function TicketAttachmentsCommentsPanel({
  projectId,
  ticketId,
  canEdit,
  currentUserId,
  currentUserRole,
  currentUserName,
  currentUserAvatarUrl,
  timeLogsRefreshKey,
}: {
  projectId: string;
  ticketId: string;
  canEdit: boolean;
  currentUserId: string;
  currentUserRole: string | null;
  currentUserName: string | null;
  currentUserAvatarUrl: string | null;
  timeLogsRefreshKey?: number;
}) {
  // Task 368, R8 — a `?attachment=<id>` deep link lands directly on the Attachments tab; the
  // `useState` initializer only reads it once, matching the Files tab's `?file=` one-shot pattern
  // (no re-forcing the tab back to Attachments if the viewer manually switches away afterward).
  const { deepLinkedAttachmentId, copyAttachmentUrl } = useAttachmentDeepLink();
  const [tab, setTab] = useState<PanelTab>(() => (deepLinkedAttachmentId ? "attachments" : "comments"));
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
        <div className={cn(tab !== "comments" && "hidden")}>
          <TicketComments
            projectId={projectId}
            ticketId={ticketId}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            currentUserName={currentUserName}
            currentUserAvatarUrl={currentUserAvatarUrl}
            onCountChange={onCommentsCount}
            copyAttachmentUrl={copyAttachmentUrl}
          />
        </div>
        <div className={cn(tab !== "attachments" && "hidden")}>
          <TicketAttachments
            projectId={projectId}
            ticketId={ticketId}
            canEdit={canEdit}
            onCountChange={onAttachmentsCount}
            autoOpenAttachmentId={deepLinkedAttachmentId}
            copyAttachmentUrl={copyAttachmentUrl}
          />
        </div>
        <div className={cn(tab !== "timelogs" && "hidden")}>
          <TicketTimeLogs ticketId={ticketId} refreshKey={timeLogsRefreshKey} />
        </div>
      </div>
    </div>
  );
}
