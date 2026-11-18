"use client";

import { Fragment, useState, useMemo, useEffect, useRef, useId } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { type Task, type Tasklist, type Milestone, normalizeStatus, decodeHtmlEntities } from "@/app/(hub)/projects-old/_pm-shared";
import { getTaskEditPermission } from "@/lib/tasks/permissions";
import { MAX_SUBTASK_DEPTH } from "@/lib/tasks/subtask-tree";
import { sortTasks as sortTaskList, type SortKey, type SortDir } from "@/lib/tasks/task-sort";
import { TaskRow, type MemberProfile } from "./_task-row";
import { TASK_GRID, TaskTableHeader, BulkDeleteBar } from "./_task-table-parts";
import { buildPhases, childrenMap, descendantRollup, groupResolver, phaseKey, NO_LIST, NO_PHASE } from "./_tasks/_task-tree";
import type { TaskCtx } from "./_tasks/_move-rules";
import { dragId } from "./_tasks/_use-task-dnd";
import { useListDnd } from "./_tasks/_use-list-dnd";
import { useListSelection } from "./_tasks/_use-list-selection";
import { DragHandle, DragCard } from "./_tasks/_drag-parts";
import { PhaseSection } from "./_tasks/_phase-section";
import { TasklistGroup } from "./_tasks/_tasklist-group";
import { TaskRowMenu } from "./_tasks/_task-row-menu";
import { MoveTaskDialog } from "./_tasks/_move-task-dialog";
import { ListEmptyState, useStickyHeader } from "./_tasks/_list-chrome";
import { groupStripe } from "./_tasks/_tree-colors";
import type { useTaskMoves } from "./_tasks/_use-task-moves";

// Task 470 — sort types/helpers, the row and the table chrome live in shared modules.
// Task 487 — Phase › Group › Task tree, drag-and-drop moves, row menu; tree/move logic in `_tasks/`.
export type { SortKey, SortDir } from "@/lib/tasks/task-sort";

const ARRANGERS = ["admin", "super_admin", "pm"]; // may reorder lists and phases (tasklists_pm_write RLS)

export default function ListView(p: {
  tasks: Task[];
  tasklists: Tasklist[];
  milestones: Milestone[];
  getHref: (task: Task) => string; // Task 290 — a real `<Link>` so rows open in a new tab on middle/⌘-click
  onUpdate: (id: string, patch: Partial<Task>) => Promise<boolean>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onAddSubtask?: (parent: Task) => void; // Task 467 — opens the New Subtask modal (owned by ProjectDetail)
  onAddTask?: (tasklistId: string) => void;
  expandRequest?: { id: string; n: number } | null;
  currentUserId: string;
  currentUserRole: string | null;
  profilesById: Record<string, { full_name: string; avatar_url: string | null }>;
  allMembers: MemberProfile[];
  hoursById: Record<string, number>;
  attachmentCountById: Record<string, number>;
  commentCountById: Record<string, number>;
  onHoursLogged: (taskId: string, hours: number) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggleSort: (key: SortKey) => void;
  onManualSort: () => void;
  collapsed: Set<string>;
  onToggleCollapse: (id: string) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onCreateNew?: () => void;
  scrollToTasklistId?: string; // Task 241 — Timeline swimlane deep link (`?tasklist=<id>`)
  compact: boolean;
  moves: ReturnType<typeof useTaskMoves>;
}) {
  const { tasks, tasklists, milestones, collapsed, currentUserId, currentUserRole, moves } = p;
  const dndId = useId();
  const { scrollRef, sentinelRef, headerStuck } = useStickyHeader();
  const [moving, setMoving] = useState<Task | null>(null);

  const permOf = (t: Task) => getTaskEditPermission(currentUserRole, currentUserId, t);
  const canArrange = ARRANGERS.includes(currentUserRole ?? "");
  const anywhereFor = (t: Task) => permOf(t).canEditDetails && !moves.crossDisabled;

  const children = useMemo(() => childrenMap(tasks), [tasks]);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const groupOf = useMemo(() => groupResolver(tasklists), [tasklists]);
  const phases = useMemo(
    () => buildPhases(tasks, tasklists, milestones, (list) => sortTaskList(list, p.sortKey, p.sortDir, normalizeStatus)),
    [tasks, tasklists, milestones, p.sortKey, p.sortDir],
  );
  const groups = useMemo(() => phases.flatMap((ph) => ph.groups), [phases]);
  const ctx: TaskCtx<Task> = { byId, children, groups, phases, groupOf };
  const sel = useListSelection(tasks, groupOf, (t) => permOf(t).canEditDetails);

  // Pre-expand root tasks that have children so subtasks are visible by default (matches Zoho behavior).
  const [expandedRows, setExpandedRows] = useState<Set<string>>(
    () => new Set(tasks.filter((t) => t.depth === 0 && children.has(t.id)).map((t) => t.id)),
  );
  const toggleExpand = (id: string) => setExpandedRows((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // Task 467 — re-expand a parent after a subtask was added to it (a new request token re-expands).
  const [seenExpandN, setSeenExpandN] = useState(0);
  if (p.expandRequest && p.expandRequest.n !== seenExpandN) {
    setSeenExpandN(p.expandRequest.n);
    setExpandedRows((prev) => new Set(prev).add(p.expandRequest!.id));
  }

  const d = useListDnd({
    ctx, milestones, collapsed, onToggleCollapse: p.onToggleCollapse, expandedRows, canArrange, anywhereFor, moves,
    manual: p.sortKey === "position", onManualSort: p.onManualSort,
  });

  // Task 241 — scroll a deep-linked tasklist into view once (expanding its phase first). The ref guard stops
  // later edits (which change `phases`) from scrolling back after the user has moved on.
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!p.scrollToTasklistId || scrolledRef.current) return;
    const ph = phases.find((x) => x.groups.some((g) => g.id === p.scrollToTasklistId));
    if (ph && collapsed.has(phaseKey(ph.key))) { p.onToggleCollapse(phaseKey(ph.key)); return; }
    const node = document.getElementById(`tasklist-group-${p.scrollToTasklistId}`);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    scrolledRef.current = true;
  }, [p.scrollToTasklistId, phases, collapsed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (tasks.length === 0 && (tasklists.length === 0 || p.hasActiveFilters)) {
    return <ListEmptyState filtered={p.hasActiveFilters} onClearFilters={p.onClearFilters} onCreateNew={p.onCreateNew} />;
  }

  function renderRows(list: Task[], depth = 0): React.ReactNode {
    return list.map((t) => {
      const kids = children.get(t.id) ?? [];
      const perm = permOf(t);
      const title = decodeHtmlEntities(t.title);
      const zone = d.zoneOf("task", t.id);
      const addSub = p.onAddSubtask && depth < MAX_SUBTASK_DEPTH && perm.canAddSubtask ? () => p.onAddSubtask!(t) : undefined;
      return (
        <Fragment key={t.id}>
          <TaskRow
            task={t} depth={depth} childrenCount={kids.length}
            rollup={kids.length > 0 ? descendantRollup(t.id, children) : null}
            isExpanded={expandedRows.has(t.id)} onToggleExpand={() => toggleExpand(t.id)}
            selected={sel.selected.has(t.id)} onToggle={() => sel.toggle(t.id)}
            href={p.getHref(t)} onUpdate={p.onUpdate}
            currentUserId={currentUserId} currentUserRole={currentUserRole}
            profilesById={p.profilesById} allMembers={p.allMembers} hoursById={p.hoursById}
            attachmentCount={p.attachmentCountById[t.id]} commentCount={p.commentCountById[t.id]}
            onHoursLogged={p.onHoursLogged} gridClass={TASK_GRID} onAddSubtask={addSub}
            compact={p.compact} dropId={`task:${t.id}`} drop={zone === "into" ? null : zone}
            dragging={d.draggingTask === t.id}
            handle={(perm.canEditDetails || perm.canChangeStatus) && (
              <DragHandle dragId={dragId("task", t.id)} label={`Move ${title}`} active={d.kbd.movingId === t.id} onKeyDown={(e) => d.kbd.onKeyDown(t.id, e)} />
            )}
            menu={
              <TaskRowMenu
                href={p.getHref(t)} title={title} onAddSubtask={addSub}
                onMove={anywhereFor(t) ? () => setMoving(t) : undefined}
                onDelete={perm.canEditDetails ? () => p.onBulkDelete([t.id]) : undefined}
              />
            }
          />
          {expandedRows.has(t.id) && kids.length > 0 && d.draggingTask !== t.id && renderRows(kids, depth + 1)}
        </Fragment>
      );
    });
  }

  const bare = milestones.length === 0;

  return (
    <DndContext id={dndId} {...d.contextProps}>
      <div className="h-full flex flex-col min-h-0">
        <BulkDeleteBar count={sel.selected.size} deleting={sel.deleting} onClear={sel.clear} onConfirm={() => void sel.bulkDelete(p.onBulkDelete)} className="px-8" />
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-light px-8 pb-5">
          {/* Margin (not scroll-container padding) so the sticky header can pin flush — see `useStickyHeader`. */}
          <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-xs mt-4">
            <div ref={sentinelRef} className="h-0" />
            <TaskTableHeader
              sortKey={p.sortKey} sortDir={p.sortDir} onToggleSort={p.onToggleSort}
              className={`sticky top-0 z-10 ${headerStuck ? "rounded-t-none" : "rounded-t-[14px]"}`}
            />
            <div className="overflow-hidden rounded-b-[14px]">
              {phases.map((ph) => {
                const body = ph.groups.length === 0
                  ? <p className="border-b border-[#EDF0F7] py-3 pl-15 text-[12px] text-[#5F6A88]">No task lists in this phase yet.</p>
                  : ph.groups.map((g, i) => (
                      <TasklistGroup
                        key={g.id} id={g.id} name={g.name} count={g.tasks.length} stripe={groupStripe(i)}
                        collapsed={collapsed.has(g.id)} onToggle={() => p.onToggleCollapse(g.id)}
                        check={sel.checkFor([g.id])} compact={p.compact} drop={d.zoneOf("group", g.id)}
                        handle={canArrange && g.id !== NO_LIST && <DragHandle dragId={dragId("group", g.id)} label={`Move list ${decodeHtmlEntities(g.name)}`} />}
                        onAddTask={p.onAddTask && g.id !== NO_LIST ? () => p.onAddTask!(g.id) : undefined}
                      >
                        {g.tasks.length > 0 ? renderRows(g.tasks) : null}
                      </TasklistGroup>
                    ));
                if (bare && ph.key === NO_PHASE) return <Fragment key={ph.key}>{body}</Fragment>;
                return (
                  <PhaseSection
                    key={ph.key} milestone={ph.milestone} number={ph.number} allMilestones={milestones} done={ph.done} total={ph.total}
                    collapsed={collapsed.has(phaseKey(ph.key))} onToggle={() => p.onToggleCollapse(phaseKey(ph.key))}
                    check={sel.checkFor(ph.groups.map((g) => g.id))} compact={p.compact}
                    dropId={`phase:${ph.key}`} drop={d.zoneOf("phase", ph.key)}
                    handle={canArrange && ph.milestone && <DragHandle dragId={dragId("phase", ph.key)} label={`Move phase ${decodeHtmlEntities(ph.milestone.name)}`} />}
                  >
                    {body}
                  </PhaseSection>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {d.overlay && (
          <DragCard
            title={d.overlayTitle}
            extra={d.overlaySubtasks ? `+${d.overlaySubtasks} subtask${d.overlaySubtasks === 1 ? "" : "s"}` : undefined}
            blocked={d.blocked}
          />
        )}
      </DragOverlay>
      <div aria-live="polite" className="sr-only">{d.liveText}</div>
      {moving && (
        <MoveTaskDialog task={moving} ctx={ctx} anywhere={anywhereFor(moving)} onMove={(m) => void moves.moveTask(m)} onClose={() => setMoving(null)} />
      )}
    </DndContext>
  );
}
