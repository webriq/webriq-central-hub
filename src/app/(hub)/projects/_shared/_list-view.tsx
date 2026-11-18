"use client";

import { MAX_SUBTASK_DEPTH } from "@/lib/tasks/subtask-tree";
import { Fragment, useState, useMemo, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, SearchX, ClipboardList, Plus } from "lucide-react";
import {
  type Task, type Tasklist,
  normalizeStatus, decodeHtmlEntities,
} from "@/app/(hub)/projects-old/_pm-shared";
import { getTaskEditPermission } from "@/lib/tasks/permissions";
import { sortTasks as sortTaskList, type SortKey, type SortDir } from "@/lib/tasks/task-sort";
import { TaskRow, type MemberProfile } from "./_task-row";
import { TASK_GRID, TaskTableHeader, BulkDeleteBar } from "./_task-table-parts";

// Task 470 — sort types/helpers, the row and the table chrome now live in shared modules.
export type { SortKey, SortDir } from "@/lib/tasks/task-sort";

/** Task 486 — the project's "General" list (name match as migration 183's is_general_tasklist; with or without a
 *  phase, no-phase preferred like its keeper order), if visible. */
export function generalTasklistId(tasklists: Tasklist[]): string | undefined {
  const generals = tasklists.filter((tl) => tl.name.trim().toLowerCase() === "general");
  return (generals.find((tl) => !tl.milestone_id) ?? generals[0])?.id;
}

// ─── ListView ─────────────────────────────────────────────────────────────────

export default function ListView({
  tasks,
  tasklists,
  getHref,
  onUpdate,
  onBulkDelete,
  onAddSubtask,
  expandRequest,
  currentUserId,
  currentUserRole,
  profilesById,
  allMembers,
  hoursById,
  attachmentCountById,
  onHoursLogged,
  sortKey,
  sortDir,
  onToggleSort,
  collapsed,
  onToggleCollapseGroup,
  hasActiveFilters,
  onClearFilters,
  onCreateNew,
  scrollToTasklistId,
}: {
  tasks: Task[];
  tasklists: Tasklist[];
  // Task 290 — a real `<Link>` (not a button + router.push) so users can middle-click /
  // Cmd-click a row to open the task in a new tab.
  getHref: (task: Task) => string;
  onUpdate: (id: string, patch: Partial<Task>) => Promise<boolean>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  // Task 467 — opens the New Subtask modal for this parent (owned by ProjectDetail).
  onAddSubtask?: (parent: Task) => void;
  expandRequest?: { id: string; n: number } | null;
  currentUserId: string;
  currentUserRole: string | null;
  profilesById: Record<string, { full_name: string; avatar_url: string | null }>;
  allMembers: MemberProfile[];
  hoursById: Record<string, number>;
  attachmentCountById: Record<string, number>;
  onHoursLogged: (taskId: string, hours: number) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggleSort: (key: SortKey) => void;
  collapsed: Set<string>;
  onToggleCollapseGroup: (groupId: string) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onCreateNew?: () => void;
  // Task 241 — deep-link target from a Timeline swimlane deliverable card (`?tasklist=<id>`):
  // scrolls that tasklist's group into view once its rows are on the page.
  scrollToTasklistId?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // Task 285 — a developer may only bulk-delete tasks they created (mirrors the single-task
  // delete gate on the Task Detail page, `perm.canEditDetails`); admin/pm/super_admin are never
  // restricted. Drives both the row checkbox disable state and the per-group "select all".
  const selectableIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tasks) {
      if (getTaskEditPermission(currentUserRole, currentUserId, t).canEditDetails) ids.add(t.id);
    }
    return ids;
  }, [tasks, currentUserRole, currentUserId]);

  // ─── Sticky-header "stuck" detection ───────────────────────────────────────
  // A zero-height sentinel sits at the card's top edge, just above the sticky
  // header. Once it scrolls out of the scroll container's view, the header has
  // pinned flush against the toolbar above (no gap) — square off its top
  // corners at that point; restore the rounded corners once it un-sticks.
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickySentinelRef = useRef<HTMLDivElement>(null);
  const [headerStuck, setHeaderStuck] = useState(false);

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = stickySentinelRef.current;
    if (!root || !sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeaderStuck(!entry.isIntersecting),
      { root, threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Pre-expand all root tasks that have children so subtasks are visible by default (matches Zoho behavior)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => {
    const childParentIds = new Set<string>();
    for (const t of tasks) {
      if (t.parent_task_id) childParentIds.add(t.parent_task_id);
    }
    const initial = new Set<string>();
    for (const t of tasks) {
      if (t.depth === 0 && childParentIds.has(t.id)) initial.add(t.id);
    }
    return initial;
  });

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleGroup(groupId: string, ids: string[]) {
    // Task 285 — only selectable (deletable-by-me) tasks participate in "select all"; a
    // restricted task never enters `selected` even via the group header checkbox.
    const selectableGroupIds = ids.filter((id) => selectableIds.has(id));
    setSelected((prev) => {
      const allSelected = selectableGroupIds.length > 0 && selectableGroupIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) selectableGroupIds.forEach((id) => next.delete(id));
      else selectableGroupIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function handleBulkTrash() {
    setDeleting(true);
    await onBulkDelete(Array.from(selected));
    setDeleting(false);
    setSelected(new Set());
  }

  const sortTasks = (list: Task[]) => sortTaskList(list, sortKey, sortDir, normalizeStatus);


  const groups = useMemo(() => {
    const tasklistIds = new Set(tasklists.map((tl) => tl.id));
    const buckets = new Map<string, Task[]>();
    // Task 486 — tasks with no (visible) list belong to "General"; migration 183 moves them there in the data.
    const fallbackId = generalTasklistId(tasklists) ?? "__none";

    for (const t of tasks.filter((t) => !t.parent_task_id && t.depth === 0)) {
      const key = t.tasklist_id && tasklistIds.has(t.tasklist_id) ? t.tasklist_id : fallbackId;
      const bucket = buckets.get(key) ?? [];
      bucket.push(t);
      buckets.set(key, bucket);
    }

    const out: { id: string; name: string; tasks: Task[] }[] = [];
    for (const tl of tasklists) {
      out.push({ id: tl.id, name: tl.name, tasks: sortTasks(buckets.get(tl.id) ?? []) });
    }
    const unassigned = buckets.get("__none");
    if (unassigned?.length) {
      out.push({ id: "__none", name: "General", tasks: sortTasks(unassigned) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, tasklists, sortKey, sortDir]);

  // Task 241 — scroll a deep-linked tasklist group into view once, the first time its rows are on
  // the page. Groups start expanded by default (`collapsed` is only ever populated by an explicit
  // user toggle), so no auto-expand is needed — the id just needs to exist in the DOM. Guarded by
  // a ref (not just a `[scrollToTasklistId]` dep) because `groups` — needed in the dep array so
  // the effect re-checks after the group's rows actually render — changes on every task edit/sort
  // for the lifetime of the page; without the guard, any later edit would re-trigger a jarring
  // scroll back to this group even after the user had scrolled elsewhere.
  const scrolledToTasklistRef = useRef(false);
  useEffect(() => {
    if (!scrollToTasklistId || scrolledToTasklistRef.current) return;
    const node = document.getElementById(`tasklist-group-${scrollToTasklistId}`);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    scrolledToTasklistRef.current = true;
  }, [scrollToTasklistId, groups]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.parent_task_id) continue;
      const siblings = map.get(t.parent_task_id) ?? [];
      siblings.push(t);
      map.set(t.parent_task_id, siblings);
    }
    for (const [key, kids] of map) {
      map.set(key, kids.sort((a, b) => ((a.position ?? 0) - (b.position ?? 0))));
    }
    return map;
  }, [tasks]);

  // Task 467 — inline "Add subtask" input under the row it was opened from.
  // Expand a parent after a subtask was added to it ("derive state from props": a new request token re-expands).
  const [seenExpandN, setSeenExpandN] = useState(0);
  if (expandRequest && expandRequest.n !== seenExpandN) {
    setSeenExpandN(expandRequest.n);
    setExpandedRows((prev) => new Set(prev).add(expandRequest.id));
  }

  function toggleExpand(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (tasks.length === 0 && tasklists.length === 0 && !hasActiveFilters) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-10 h-10 rounded-full bg-[#EDF0F7] flex items-center justify-center">
          <ClipboardList size={18} className="text-[#5F6A88]" />
        </div>
        <p className="text-[13px] text-[#5F6A88]">No tasks yet.</p>
        {onCreateNew && (
          <button
            onClick={onCreateNew}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#007BFF] hover:text-[#0063D6] cursor-pointer transition-colors"
          >
            <Plus size={13} /> New Task
          </button>
        )}
      </div>
    );
  }

  if (tasks.length === 0 && hasActiveFilters) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-10 h-10 rounded-full bg-[#EDF0F7] flex items-center justify-center">
          <SearchX size={18} className="text-[#5F6A88]" />
        </div>
        <p className="text-[13px] text-[#5F6A88]">No tasks match your filters.</p>
        <button
          onClick={onClearFilters}
          className="text-[12px] font-semibold text-[#007BFF] hover:text-[#0063D6] cursor-pointer transition-colors"
        >
          Clear filters
        </button>
      </div>
    );
  }

  // Task 467 — done/total over ALL descendants (closed = done), not just direct children.
  function descendantRollup(id: string): { done: number; total: number } {
    let done = 0, total = 0;
    for (const c of childrenByParent.get(id) ?? []) {
      const sub = descendantRollup(c.id);
      total += 1 + sub.total;
      done += (c.status === "closed" ? 1 : 0) + sub.done;
    }
    return { done, total };
  }

  function renderRows(list: Task[], depth = 0): React.ReactNode {
    return list.map((t) => {
      const children = childrenByParent.get(t.id) ?? [];
      const isExpanded = expandedRows.has(t.id);
      return (
        <Fragment key={t.id}>
          <TaskRow
            task={t}
            depth={depth}
            childrenCount={children.length}
            rollup={children.length > 0 ? descendantRollup(t.id) : null}
            isExpanded={isExpanded}
            onToggleExpand={() => toggleExpand(t.id)}
            selected={selected.has(t.id)}
            onToggle={() => toggleRow(t.id)}
            href={getHref(t)}
            onUpdate={onUpdate}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            profilesById={profilesById}
            allMembers={allMembers}
            hoursById={hoursById}
            attachmentCount={attachmentCountById[t.id]}
            onHoursLogged={onHoursLogged}
            gridClass={TASK_GRID}
            onAddSubtask={onAddSubtask && depth < MAX_SUBTASK_DEPTH ? () => onAddSubtask(t) : undefined}
          />
          {isExpanded && children.length > 0 && renderRows(children, depth + 1)}
        </Fragment>
      );
    });
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <BulkDeleteBar
        count={selected.size}
        deleting={deleting}
        onClear={() => setSelected(new Set())}
        onConfirm={() => void handleBulkTrash()}
        className="px-8"
      />

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-light px-8 pb-5">
        {/* No overflow-hidden here — it would create its own clipping/scroll-container
            box and break the header's `sticky` positioning against the real scrolling
            ancestor above. Corner rounding is applied directly to the header (top) and
            the rows wrapper (bottom) instead. Top spacing is a margin on this card, not
            padding on the scroll container above — padding-top on a scroll container is
            part of its own scrollport padding box, so a `sticky top-0` descendant can
            never rise above it, leaving a permanent gap once stuck. Margin has no such
            floor: it scrolls away completely, then the header sticks flush. */}
        <div className="rounded-[14px] border border-[#E2E7F2] bg-white mt-5">

          <div ref={stickySentinelRef} className="h-0" />

          {/* Column headers */}
          <TaskTableHeader
            sortKey={sortKey}
            sortDir={sortDir}
            onToggleSort={onToggleSort}
            className={`sticky top-0 z-10 ${headerStuck ? "rounded-t-none" : "rounded-t-[14px]"}`}
          />

          <div className="overflow-hidden rounded-b-[14px]">
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.id);
            const groupTaskIds = g.tasks.map((t) => t.id);
            // Task 285 — only selectable tasks count toward "all selected"/toggling; a group made
            // up entirely of tasks the current user can't delete gets a disabled header checkbox.
            const selectableGroupIds = groupTaskIds.filter((id) => selectableIds.has(id));
            const allGroupSelected = selectableGroupIds.length > 0 && selectableGroupIds.every((id) => selected.has(id));

            return (
              <div key={g.id} id={`tasklist-group-${g.id}`}>
                <div className="flex items-center bg-[#F4F6FB] border-b border-[#E2E7F2]">
                  <div className="w-8 shrink-0 flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={allGroupSelected}
                      disabled={selectableGroupIds.length === 0}
                      onChange={() => toggleGroup(g.id, groupTaskIds)}
                      className="w-3.5 h-3.5 rounded border-[#A8B0C8] cursor-pointer accent-[#007BFF] disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </div>
                  <div className="w-0.5 h-5 bg-[#A8B0C8] rounded-full mr-2 shrink-0" />
                  <button
                    onClick={() => onToggleCollapseGroup(g.id)}
                    className="flex items-center gap-2 flex-1 py-2 pr-4 cursor-pointer hover:opacity-75 text-left"
                  >
                    {isCollapsed
                      ? <ChevronRight size={13} className="text-[#5F6A88] shrink-0" />
                      : <ChevronDown size={13} className="text-[#5F6A88] shrink-0" />}
                    <span className="text-[12px] font-bold text-[#3A4565]">{decodeHtmlEntities(g.name)}</span>
                    <span className="text-[10px] font-semibold text-[#5F6A88] bg-[#EDF0F7] rounded-full px-1.5 py-0.5 leading-none">
                      {g.tasks.length}
                    </span>
                  </button>
                </div>

                {!isCollapsed && (
                  g.tasks.length > 0
                    ? renderRows(g.tasks)
                    : (
                      <div className="pl-10 pr-4 py-3 border-b border-[#EDF0F7]">
                        <p className="text-[12px] text-[#A8B0C8]">No tasks in this list.</p>
                      </div>
                    )
                )}
              </div>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}
