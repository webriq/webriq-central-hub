"use client";

import { Activity } from "lucide-react";
import { Panel, EmptyState, OptionalLink, PriorityDot, StatusPill, TRANSITION } from "./_ui";
import { PRIORITY_STYLE } from "@/app/(hub)/projects-old/_pm-shared";
import { formatRelativeToAnchor, type DevWorkItem } from "./_types";

// Task 360 — the "Recently moved to In progress" strip.
//
// There is no status-transition history in this schema (`audit_logs` exists but nothing in
// `src/` writes to it), so this is an approximation: items that ARE in progress and were touched
// in the last 24 hours. The panel hint says "Updated in the last 24 hours" rather than claiming a
// transition it cannot actually prove. A real transition log is a noted follow-up.

function RecentCard({ item, anchor }: { item: DevWorkItem; anchor: string }) {
  const priorityLabel = PRIORITY_STYLE[item.priority]?.label ?? "Normal";

  return (
    <OptionalLink
      href={item.href}
      className={`block border border-[#E2E7F2] rounded-[10px] px-3.5 py-3 ${TRANSITION} hover:border-[#A8C6F5] hover:bg-[#F0F7FF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]`}
    >
      <div className="flex items-center gap-2 mb-2">
        <PriorityDot priority={item.priority} label={priorityLabel} />
        <span className="ml-auto">
          <StatusPill status={item.status} />
        </span>
      </div>
      <p className="text-[13px] font-semibold text-[#0B1533] leading-snug line-clamp-2 min-h-[35px] m-0">
        {item.title}
      </p>
      <div className="flex items-center justify-between gap-2 text-[11.5px] text-[#5F6A88] mt-1.5">
        <span className="font-semibold truncate">{item.projectName}</span>
        <span className="shrink-0">{formatRelativeToAnchor(item.updatedAt, anchor)}</span>
      </div>
    </OptionalLink>
  );
}

export default function DevRecentlyMoved({ items, anchor }: { items: DevWorkItem[]; anchor: string }) {
  return (
    <Panel title="Recently moved to In progress" hint="Updated in the last 24 hours">
      {items.length === 0 ? (
        <EmptyState
          icon={<Activity size={16} />}
          title="No recent movement"
          body="Work you move into In progress shows up here for 24 hours."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 px-[18px] pb-[18px]">
          {items.map((item) => (
            <RecentCard key={`${item.kind}-${item.id}`} item={item} anchor={anchor} />
          ))}
        </div>
      )}
    </Panel>
  );
}
