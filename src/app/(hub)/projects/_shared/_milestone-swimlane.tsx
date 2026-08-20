"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Flag } from "lucide-react";
import { type Milestone, type Tasklist, type Task, decodeHtmlEntities } from "@/app/(hub)/projects-old/_pm-shared";

// Position first (task-239/240-seeded milestones always set it); falls back to start_date, then
// created_at, for any milestone created another way (e.g. directly via MilestonePanel's table)
// that never got a position.
function sortMilestones(milestones: Milestone[]): Milestone[] {
  return [...milestones].sort((a, b) => {
    if (a.position != null || b.position != null) {
      return (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER);
    }
    const aKey = a.start_date ?? a.created_at;
    const bKey = b.start_date ?? b.created_at;
    return aKey.localeCompare(bKey);
  });
}

// ─── Milestone swimlane — task 242 ────────────────────────────────────────────
// One lane per milestone (phase), one card per tasklist (deliverable) in that lane. Read +
// navigate only — no create/edit/delete here, that stays on the existing Table view
// (MilestonePanel). Clicking a tasklist card deep-links into the Tasks tab, scoped to that
// tasklist, reusing task 241's `?tasklist=` contract on `_list-view.tsx`.
export default function MilestoneSwimlane({
  milestones,
  tasklists,
  tasks,
  basePath,
}: {
  milestones: Milestone[];
  tasklists: Tasklist[];
  tasks: Task[];
  // Task 276 — shared between the legacy and v2 project-detail routes; caller passes its own
  // `/projects/legacy/${projectId}` or `/projects/v2/${projectId}` (replaces the old
  // `projectUrlKey` + hardcoded `V2_ROUTES.PROJECTS` combination).
  basePath: string;
}) {
  const router = useRouter();

  // Same counting pattern as MilestonePanel's own `countMap` (mirrored, not imported — that
  // component only keys by milestone_id; this view also needs the tasklist_id breakdown for
  // per-card badges, built in the same single pass over `tasks`).
  const { milestoneCounts, tasklistCounts } = useMemo(() => {
    const milestoneCounts = new Map<string, { total: number; done: number }>();
    const tasklistCounts = new Map<string, { total: number; done: number }>();
    for (const t of tasks) {
      if (t.milestone_id) {
        const entry = milestoneCounts.get(t.milestone_id) ?? { total: 0, done: 0 };
        entry.total++;
        if (t.status === "closed") entry.done++;
        milestoneCounts.set(t.milestone_id, entry);
      }
      if (t.tasklist_id) {
        const entry = tasklistCounts.get(t.tasklist_id) ?? { total: 0, done: 0 };
        entry.total++;
        if (t.status === "closed") entry.done++;
        tasklistCounts.set(t.tasklist_id, entry);
      }
    }
    return { milestoneCounts, tasklistCounts };
  }, [tasks]);

  const tasklistsByMilestone = useMemo(() => {
    const map = new Map<string, Tasklist[]>();
    for (const tl of tasklists) {
      if (!tl.milestone_id) continue;
      const list = map.get(tl.milestone_id) ?? [];
      list.push(tl);
      map.set(tl.milestone_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return map;
  }, [tasklists]);

  const orderedMilestones = useMemo(() => sortMilestones(milestones), [milestones]);

  function openTasklist(tasklistId: string) {
    router.push(`${basePath}/tasks?tasklist=${tasklistId}`);
  }

  if (orderedMilestones.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[12px] border border-dashed border-[#E2E7F2] bg-[#F9FAFC] px-8 py-12 text-center">
        <Flag size={28} className="text-[#B7BFD6]" />
        <div>
          <div className="text-[14px] font-bold text-[#0B1533]">No milestones yet</div>
          <p className="mt-1 text-[13px] text-[#5F6A88]">Switch to Table view to add the first milestone.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {orderedMilestones.map((m) => {
        const counts = milestoneCounts.get(m.id) ?? { total: 0, done: 0 };
        const laneTasklists = tasklistsByMilestone.get(m.id) ?? [];
        return (
          <div key={m.id} className="rounded-[12px] border border-[#E2E7F2] bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold text-[#0B1533]">{decodeHtmlEntities(m.name)}</span>
              <span className="shrink-0 rounded-full bg-[#EDF0F7] px-2.5 py-0.5 text-[11px] font-semibold text-[#5F6A88]">
                {counts.done}/{counts.total} done
              </span>
            </div>

            {laneTasklists.length === 0 ? (
              <div className="flex items-center gap-2 rounded-[9px] border border-dashed border-[#E2E7F2] bg-[#F9FAFC] px-3.5 py-3 text-[12px] text-[#5F6A88]">
                <ClipboardList size={14} className="shrink-0 text-[#B7BFD6]" />
                No deliverables yet
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {laneTasklists.map((tl) => {
                  const tlCounts = tasklistCounts.get(tl.id) ?? { total: 0, done: 0 };
                  return (
                    <button
                      key={tl.id}
                      type="button"
                      onClick={() => openTasklist(tl.id)}
                      className="flex cursor-pointer flex-col items-start gap-1 rounded-[9px] border border-[#E2E7F2] bg-[#F9FAFC] px-3.5 py-3 text-left transition-colors hover:border-[#A8C6F5] hover:bg-[#F0F7FF]"
                    >
                      <span className="text-[12.5px] font-semibold text-[#0B1533]">{decodeHtmlEntities(tl.name)}</span>
                      <span className="text-[11px] text-[#5F6A88]">{tlCounts.done}/{tlCounts.total} tasks done</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
