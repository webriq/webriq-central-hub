"use client";

import { useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useGreeting } from "@/hooks/use-greeting";
import { V2_ROUTES } from "@/config/constants";
import { decodeHtmlEntities, normalizeStatus } from "@/app/(hub)/projects-old/_pm-shared";
import { Plus } from "lucide-react";
import DevStatStrip, { type DevStats } from "./_stat-strip";
import DevRecentlyMoved from "./_recently-moved";
import DevWorkList from "./_work-list";
import DevTimerCard from "./_timer-card";
import DevDigestCard from "./_digest-card";
import DevOverdueCard from "./_overdue-card";
import { HeaviestWorkload, RecentlyWorkedOn } from "./_side-panels";
import { DevStartTimerButton } from "./_start-timer-button";
import { BTN_BASE, BTN_GHOST } from "./_ui";
import { daysLate, decodeNames, dueBucket, sortWorkItems, type DevDashboardData, type DevWorkItem } from "./_types";

// Task 360 — client shell for the developer dashboard. Owns nothing but layout: every number
// below is derived from `data` during render (never stored in state, never computed in an
// effect), and the only stateful children are the work list's tabs and the timer card's context
// subscription.

const RECENTLY_MOVED_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECENTLY_MOVED_MAX = 3;

export default function DevDashboard({ data, displayName }: { data: DevDashboardData; displayName: string | null }) {
  const { text, dateLabel } = useGreeting(displayName);

  // `normalizeStatus` / `decodeHtmlEntities` live in `_pm-shared.tsx` ("use client"), so the
  // server loader cannot call them — both transforms happen here, once, rather than duplicating
  // that file's status map into a server-safe copy. See `DevWorkItem.status`.
  //
  // `sortWorkItems()` runs here too, after normalization, not in the loader — its primary key is
  // status, which only sorts correctly once it's the normalized value (see `_types.ts`).
  const items = useMemo<DevWorkItem[]>(() => {
    const decoded = data.items.map((item) => ({
      ...item,
      title: decodeHtmlEntities(item.title),
      projectName: decodeHtmlEntities(item.projectName),
      status: normalizeStatus(item.status),
    }));
    return sortWorkItems(decoded, data.today);
  }, [data.items, data.today]);

  // Project names come from the same Zoho import as task titles, so they carry the same literal
  // entities — decoded here for the side panels and the timer card's split bar, matching how
  // `_milestone-bar.tsx` / `_list-view.tsx` already treat imported `name` fields.
  const projects = useMemo(() => decodeNames(data.projects, decodeHtmlEntities), [data.projects]);
  const hoursTodayByProject = useMemo(
    () => decodeNames(data.hoursTodayByProject, decodeHtmlEntities),
    [data.hoursTodayByProject]
  );

  // One pass over the list for every bucket the page needs (js-combine-iterations).
  const derived = useMemo(() => {
    const cutoff = new Date(data.generatedAt).getTime() - RECENTLY_MOVED_WINDOW_MS;
    const overdue: DevWorkItem[] = [];
    const inProgress: DevWorkItem[] = [];
    const recentlyMoved: DevWorkItem[] = [];
    let dueTodayTasks = 0;
    let dueTodayIssues = 0;
    let inProgressTasks = 0;
    let inProgressIssues = 0;
    let openCount = 0;
    let closedCount = 0;
    // First due-today item in priority order (`items` arrives pre-sorted, status-group first) —
    // captured here so the Start-timer CTA's fallback below doesn't re-scan the list.
    let firstDueToday: DevWorkItem | null = null;

    for (const item of items) {
      if (item.status === "open") openCount++;
      if (item.status === "closed") closedCount++;

      // A closed item is never "overdue" or "due today" — it's done. Guarded here rather than
      // in `dueBucket()` itself, which stays a pure date comparison with no status knowledge.
      if (item.status !== "closed") {
        const bucket = dueBucket(item.dueDate, data.today);
        if (bucket === "overdue") overdue.push(item);
        if (bucket === "today") {
          if (item.kind === "task") dueTodayTasks++;
          else dueTodayIssues++;
          if (!firstDueToday) firstDueToday = item;
        }
      }

      if (item.status === "in_progress") {
        inProgress.push(item);
        if (item.kind === "task") inProgressTasks++;
        else inProgressIssues++;
        if (Date.parse(item.updatedAt) >= cutoff) recentlyMoved.push(item);
      }
    }

    // Most overdue first — the digest and the warning card both read [0] as "the oldest".
    overdue.sort((a, b) => daysLate(b.dueDate, data.today) - daysLate(a.dueDate, data.today));
    recentlyMoved.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

    const stats: DevStats = {
      dueTodayCount: dueTodayTasks + dueTodayIssues,
      dueTodayTasks,
      dueTodayIssues,
      inProgressCount: inProgress.length,
      inProgressTasks,
      inProgressIssues,
      overdueCount: overdue.length,
      oldestOverdueDays: overdue.length > 0 ? daysLate(overdue[0].dueDate, data.today) : 0,
      hoursToday: data.hoursToday,
      hoursTodayItemCount: data.hoursTodayItemCount,
    };

    return {
      overdue,
      inProgress,
      recentlyMoved: recentlyMoved.slice(0, RECENTLY_MOVED_MAX),
      stats,
      firstDueToday,
      openCount,
      closedCount,
    };
  }, [items, data.today, data.generatedAt, data.hoursToday, data.hoursTodayItemCount]);

  const projectHrefs = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projects) {
      if (p.href) map[p.projectId] = p.href;
    }
    return map;
  }, [projects]);

  // The orange CTA starts the timer on the highest-priority item that is actually actionable —
  // due today or already in progress, falling back to the top of the sorted list. `derived`'s
  // single pass over `items` already found the first in-progress and first due-today rows (in
  // priority order, since `items` arrives pre-sorted from the loader), so this is a plain
  // fallback chain rather than a second/third scan of the list.
  const startTarget = derived.inProgress[0] ?? derived.firstDueToday ?? items[0] ?? null;

  return (
    <div className="py-6.5 px-8 max-lg:px-4 flex flex-col gap-5 bg-[#F4F6FB] min-h-full">
      {/* Page head — always visible; it carries the counts and the page's actions. */}
      <header className="flex items-end justify-between gap-5 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-heading text-[23px] font-bold text-[#0B1533] tracking-[-0.015em] m-0">
            {text ?? " "}
          </h1>
          <p className="text-[13.5px] text-[#5F6A88] mt-1 mb-0">
            {dateLabel ?? " "}
            {derived.stats.dueTodayCount > 0 ? (
              <>
                <span className="mx-2 text-[#C7CEDD]">·</span>
                {derived.stats.dueTodayCount} due today
              </>
            ) : null}
            {derived.stats.overdueCount > 0 ? (
              <>
                <span className="mx-2 text-[#C7CEDD]">·</span>
                <span className="text-[#C0392B] font-semibold">{derived.stats.overdueCount} overdue</span>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href={`${V2_ROUTES.DASHBOARD_TIMELOGS}?new=1`} className={cn(BTN_BASE, BTN_GHOST)}>
            <Plus size={15} />
            Log time
          </Link>
          <DevStartTimerButton target={startTarget} />
        </div>
      </header>

      <DevStatStrip stats={derived.stats} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_336px] gap-[18px] items-start">
        <div className="flex flex-col gap-[18px] min-w-0">
          <DevRecentlyMoved items={derived.recentlyMoved} anchor={data.generatedAt} />
          <DevWorkList
            items={items}
            today={data.today}
            dueTodayCount={derived.stats.dueTodayCount}
            openCount={derived.openCount}
            inProgressCount={derived.stats.inProgressCount}
            closedCount={derived.closedCount}
          />
        </div>

        <aside className="flex flex-col gap-[18px] min-w-0">
          <DevTimerCard
            hoursToday={data.hoursToday}
            hoursTodayByProject={hoursTodayByProject}
            projectHrefs={projectHrefs}
          />
          <DevDigestCard
            overdue={derived.overdue}
            inProgress={derived.inProgress}
            recentlyMoved={derived.recentlyMoved}
            hoursToday={data.hoursToday}
            hoursTodayByProject={hoursTodayByProject}
            today={data.today}
            dateLabel={dateLabel}
          />
          <DevOverdueCard items={derived.overdue} today={data.today} />
          <RecentlyWorkedOn projects={projects} anchor={data.generatedAt} />
          <HeaviestWorkload projects={projects} />
        </aside>
      </div>
    </div>
  );
}
