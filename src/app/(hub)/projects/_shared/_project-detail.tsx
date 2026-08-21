"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutGrid, List as ListIcon, Calendar as CalendarIcon,
  Plus, X, Search, Check, ChevronDown, ArrowUpDown, ChevronsUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  type Project, type Milestone, type Tasklist, type Task, type Issue,
  type TaskStatus, type TaskPriority, type IssueSeverity,
  STATUS_LABEL, PRIORITY_STYLE, SEVERITY_STYLE, normalizeStatus, normalizeSeverity,
} from "@/app/(hub)/projects-old/_pm-shared";
import BoardView from "./_board-view";
import ListView, { type SortKey, type SortDir } from "./_list-view";
import CalendarView from "./_calendar-view";
import IssueListView, { type IssueSortKey, type IssueSortDir } from "./_issue-list-view";
import IssueBoardView from "./_issue-board-view";
import IssueCalendarView from "./_issue-calendar-view";
import MilestonePanel from "./_milestone-panel";
import MilestoneSwimlane from "./_milestone-swimlane";
import { CreateTaskModal } from "./_create-task-modal";
import { CreateIssueModal } from "./_create-issue-modal";
import { MembersTab } from "./_members-tab";
import { StatusReportTab } from "./_status-report-tab";
import { TimeLogsTab } from "./_time-logs-tab";
import { FilesTab } from "./_files-tab";
import { AccessTab } from "./_access-tab";

// Task 276 — ported ONCE from the old `/projects/[projectId]/_project-detail.tsx` (now
// `/projects-old`, originally 1078 lines, single file rendering both its own tab-strip nav AND
// the tab body content) into `projects/_shared/` so it can be shared by BOTH
// `/projects/legacy/[projectId]` (this task's scope) and `/projects/v2/[projectId]` (a later
// task) instead of duplicating it.
// `basePath`/`variant` (new props, see bottom of the prop list below) replace every hardcoded
// `/projects/${projectId}` route string the source file had — `variant="v2"` additionally
// renders an Overview tab that a later task owns; this file only guarantees `variant` is
// accepted and doesn't break the `"legacy"` case, which has no Overview tab.

type ViewId = "board" | "list" | "calendar";
type PrimaryTab = "tasks" | "issues" | "milestones" | "files" | "access" | "members" | "status_report" | "time_logs";

const VIEW_LABELS: Record<ViewId, string> = { list: "List", board: "Board", calendar: "Calendar" };
const VIEW_ICONS: Record<ViewId, React.ReactNode> = {
  list:     <ListIcon size={15} />,
  board:    <LayoutGrid size={15} />,
  calendar: <CalendarIcon size={15} />,
};
const VIEW_ORDER: ViewId[] = ["list", "board", "calendar"];

// Task 276 — 5 new tabs (Files/Access/Members/Status Report/Time Logs) alongside the ported
// Tasks/Issues/Milestones. Each new tab's actual body lives in its own `_shared/_*-tab.tsx` file
// (see imports above) — this file only gains a conditional render per tab, per the task doc's
// file-length guidance. The tab-strip's own entry list now lives in
// `_project-detail-tab-strip.tsx` (Phase 3 extraction — see `ProjectDetailTabStrip` usage below).

// Exported (task 274) — `_create-task-modal.tsx` (extracted out of this file) reuses these
// same Status/Priority option lists rather than duplicating them.
export const STATUS_OPTS: TaskStatus[] = [
  "open", "in_progress", "ready_for_qa", "testing_completed",
  "for_client_approval", "ready_to_merge", "post_live_qa", "closed",
];
export const PRIORITY_OPTS: TaskPriority[] = ["low", "normal", "high", "critical"];

const STATUS_FILTER_OPTIONS = STATUS_OPTS.map((s) => ({ value: s, label: STATUS_LABEL[s] }));
const PRIORITY_FILTER_OPTIONS = PRIORITY_OPTS.map((p) => ({ value: p, label: PRIORITY_STYLE[p].label }));

type SortValue = "status_asc" | "status_desc" | "name_asc" | "name_desc" | "due_soonest" | "due_latest" | "priority_high" | "priority_low";

const SORT_OPTIONS: { value: SortValue; label: string; key: SortKey; dir: SortDir }[] = [
  { value: "status_asc",    label: "Status (pipeline order)",  key: "status",   dir: "asc" },
  { value: "status_desc",   label: "Status (reverse order)",   key: "status",   dir: "desc" },
  { value: "name_asc",      label: "Task name (A–Z)",          key: "title",    dir: "asc" },
  { value: "name_desc",     label: "Task name (Z–A)",          key: "title",    dir: "desc" },
  { value: "due_soonest",   label: "Due date (soonest)",       key: "due_date", dir: "asc" },
  { value: "due_latest",    label: "Due date (latest)",        key: "due_date", dir: "desc" },
  { value: "priority_high", label: "Priority (highest first)", key: "priority", dir: "asc" },
  { value: "priority_low",  label: "Priority (lowest first)",  key: "priority", dir: "desc" },
];

// ─── Issues tab — status pipeline is shared with tasks (see task 192 doc); severity
// is a separate 5-value Zoho vocabulary, not the task priority enum. ────────────────
// Exported (task 286) — `_create-issue-modal.tsx` (extracted out of this file) reuses this
// same Severity option list rather than duplicating it, same as STATUS_OPTS/PRIORITY_OPTS.
export const SEVERITY_OPTS: IssueSeverity[] = ["Show stopper", "Critical", "Major", "Minor", "None"];
const SEVERITY_FILTER_OPTIONS = SEVERITY_OPTS.map((s) => ({ value: s, label: SEVERITY_STYLE[s].label }));

type IssueSortValue = "istatus_asc" | "istatus_desc" | "iname_asc" | "iname_desc" | "idue_soonest" | "idue_latest" | "severity_high" | "severity_low";

const ISSUE_SORT_OPTIONS: { value: IssueSortValue; label: string; key: IssueSortKey; dir: IssueSortDir }[] = [
  { value: "istatus_asc",    label: "Status (pipeline order)",   key: "status",   dir: "asc" },
  { value: "istatus_desc",   label: "Status (reverse order)",    key: "status",   dir: "desc" },
  { value: "iname_asc",      label: "Issue name (A–Z)",          key: "title",    dir: "asc" },
  { value: "iname_desc",     label: "Issue name (Z–A)",          key: "title",    dir: "desc" },
  { value: "idue_soonest",   label: "Due date (soonest)",        key: "due_date", dir: "asc" },
  { value: "idue_latest",    label: "Due date (latest)",         key: "due_date", dir: "desc" },
  { value: "severity_high",  label: "Severity (highest first)",  key: "severity", dir: "asc" },
  { value: "severity_low",   label: "Severity (lowest first)",   key: "severity", dir: "desc" },
];

export type TaskDefaults = {
  status?: TaskStatus;
  milestone_id?: string | null;
  due_date?: string | null;
};

export default function ProjectDetail({
  project,
  initialMilestones,
  initialTasklists,
  initialTasks,
  initialIssues,
  currentUserId,
  currentUserRole,
  profilesById,
  allMembers,
  initialHoursById,
  activeTab,
  initialScrollTasklistId,
  basePath,
}: {
  project: Project;
  initialMilestones: Milestone[];
  initialTasklists: Tasklist[];
  initialTasks: Task[];
  initialIssues: Issue[];
  currentUserId: string;
  currentUserRole: string | null;
  profilesById: Record<string, { full_name: string; avatar_url: string | null }>;
  allMembers: { id: string; full_name: string | null; avatar_url: string | null; role: string }[];
  initialHoursById: Record<string, number>;
  activeTab: PrimaryTab;
  // Task 241 — `?tasklist=<id>` deep-link from the StackShift Timeline's Phase 2-5 swimlane cards.
  initialScrollTasklistId?: string;
  // Task 276 — replaces every hardcoded `/projects/${projectId}` route string from the source
  // file. Callers pass `/projects/legacy/${projectId}` or `/projects/v2/${projectId}`.
  basePath: string;
}) {
  const router = useRouter();
  const primaryTab = activeTab;
  const [view, setView] = useState<ViewId>("list");
  // Task 242 — Table (existing MilestonePanel, default) vs. Swimlane (new, read + navigate only).
  const [milestoneView, setMilestoneView] = useState<"table" | "swimlane">("table");
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones);
  const [tasklists, setTasklists] = useState<Tasklist[]>(initialTasklists);
  const [createDefaults, setCreateDefaults] = useState<TaskDefaults | null>(null);
  const [hoursById, setHoursById] = useState<Record<string, number>>(initialHoursById);

  // ─── Task toolbar state (search / status / priority / sort / collapse-all) ─
  const [taskSearch, setTaskSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>(() => STATUS_OPTS.map((s) => s as string));
  const [priorityFilter, setPriorityFilter] = useState<string[]>(() => PRIORITY_OPTS.map((p) => p as string));
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // ─── Issue state (own view/toolbar state — independent of the Tasks tab) ───
  const [issues, setIssues] = useState<Issue[]>(initialIssues);
  const [issueView, setIssueView] = useState<ViewId>("list");
  const [issueSearch, setIssueSearch] = useState("");
  const [issueStatusFilter, setIssueStatusFilter] = useState<string[]>(() => STATUS_OPTS.map((s) => s as string));
  const [severityFilter, setSeverityFilter] = useState<string[]>(() => SEVERITY_OPTS.map((s) => s as string));
  const [issueSortKey, setIssueSortKey] = useState<IssueSortKey>("status");
  const [issueSortDir, setIssueSortDir] = useState<IssueSortDir>("asc");
  const [createIssueOpen, setCreateIssueOpen] = useState(false);

  // ─── Realtime sync ────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`project_tasks_${project.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${project.id}` },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setTasks((prev) =>
              prev.map((t) => (t.id === (payload.new as Task).id ? { ...t, ...(payload.new as Task) } : t))
            );
          } else if (payload.eventType === "INSERT") {
            const incoming = payload.new as Task;
            setTasks((prev) =>
              prev.some((t) => t.id === incoming.id) ? prev : [...prev, incoming]
            );
          } else if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id: string }).id;
            setTasks((prev) => prev.filter((t) => t.id !== deletedId));
          }
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [project.id]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`project_issues_${project.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "issues", filter: `project_id=eq.${project.id}` },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setIssues((prev) =>
              prev.map((i) => (i.id === (payload.new as Issue).id ? { ...i, ...(payload.new as Issue) } : i))
            );
          } else if (payload.eventType === "INSERT") {
            const incoming = payload.new as Issue;
            setIssues((prev) =>
              prev.some((i) => i.id === incoming.id) ? prev : [...prev, incoming]
            );
          } else if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id: string }).id;
            setIssues((prev) => prev.filter((i) => i.id !== deletedId));
          }
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [project.id]);

  // ─── Task mutations (optimistic) ─────────────────────────────────────────
  const updateTask = useCallback(async (id: string, patch: Partial<Task>) => {
    const snapshot = tasks;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const res = await fetch(`/api/v2/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) { setTasks(snapshot); return false; }
    const updated: Task = await res.json();
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    return true;
  }, [tasks]);

  const addTask = useCallback((task: Task) => {
    setTasks((prev) => [...prev, task]);
  }, []);

  const bulkDeleteTasks = useCallback(async (ids: string[]) => {
    const results = await Promise.all(
      ids.map(async (id) => {
        const res = await fetch(`/api/v2/tasks/${id}`, { method: "DELETE" });
        return { id, ok: res.ok };
      })
    );
    const deletedIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
    setTasks((prev) => prev.filter((t) => !deletedIds.has(t.id)));
  }, []);

  const addTasklist = useCallback((tasklist: Tasklist) => {
    setTasklists((prev) => [...prev, tasklist]);
  }, []);

  // ─── Issue mutations (optimistic) ────────────────────────────────────────
  const updateIssue = useCallback(async (id: string, patch: Partial<Issue>) => {
    const snapshot = issues;
    setIssues((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const res = await fetch(`/api/v2/issues/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) { setIssues(snapshot); return false; }
    const updated: Issue = await res.json();
    setIssues((prev) => prev.map((i) => (i.id === id ? updated : i)));
    return true;
  }, [issues]);

  const addIssue = useCallback((issue: Issue) => {
    setIssues((prev) => [...prev, issue]);
  }, []);

  const bulkDeleteIssues = useCallback(async (ids: string[]) => {
    const results = await Promise.all(
      ids.map(async (id) => {
        const res = await fetch(`/api/v2/issues/${id}`, { method: "DELETE" });
        return { id, ok: res.ok };
      })
    );
    const deletedIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
    setIssues((prev) => prev.filter((i) => !deletedIds.has(i.id)));
  }, []);

  // ─── Milestone mutations ──────────────────────────────────────────────────
  const upsertMilestone = useCallback((m: Milestone) => {
    setMilestones((prev) => {
      const exists = prev.some((x) => x.id === m.id);
      return exists ? prev.map((x) => (x.id === m.id ? m : x)) : [...prev, m];
    });
  }, []);

  const removeMilestone = useCallback((id: string) => {
    setMilestones((prev) => prev.filter((m) => m.id !== id));
    setTasks((prev) => prev.map((t) => (t.milestone_id === id ? { ...t, milestone_id: null } : t)));
  }, []);

  // Task 209 — timer start/pause/resume/stop now goes through the hub-wide TimerContext
  // (server-persisted `active_timers`, so it survives navigation/refresh and can be seen from
  // the floating break widget). This only receives the resulting hours to update the local
  // display total once a stop actually happens.
  const handleHoursLogged = useCallback((taskId: string, hours: number) => {
    setHoursById((prev) => ({ ...prev, [taskId]: (prev[taskId] ?? 0) + hours }));
  }, []);

  // ─── Search / filter — root-task match, whole subtree follows ────────────
  // Filtering is evaluated against root tasks (no parent, depth 0). If a root
  // matches, its entire subtree is included unconditionally — a subtask's own
  // status/priority is not independently filterable. Deliberate simplification:
  // per-row filtering would let a matching subtask "orphan" under a non-matching
  // parent that never renders, silently hiding it.
  const filteredTasks = useMemo(() => {
    const tasklistNameById = new Map(tasklists.map((tl) => [tl.id, tl.name]));
    const childrenByParent = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.parent_task_id) continue;
      const list = childrenByParent.get(t.parent_task_id) ?? [];
      list.push(t);
      childrenByParent.set(t.parent_task_id, list);
    }

    const q = taskSearch.trim().toLowerCase();
    const statusSet = new Set(statusFilter);
    const prioritySet = new Set(priorityFilter);

    function rootMatches(t: Task): boolean {
      if (!statusSet.has(normalizeStatus(t.status))) return false;
      if (!prioritySet.has(t.priority)) return false;
      if (!q) return true;
      const tlName = t.tasklist_id ? tasklistNameById.get(t.tasklist_id) : null;
      return t.title.toLowerCase().includes(q) || (tlName?.toLowerCase().includes(q) ?? false);
    }

    function collectSubtree(root: Task, out: Task[]) {
      out.push(root);
      for (const child of childrenByParent.get(root.id) ?? []) collectSubtree(child, out);
    }

    const out: Task[] = [];
    for (const t of tasks) {
      if (t.parent_task_id || t.depth !== 0) continue;
      if (rootMatches(t)) collectSubtree(t, out);
    }
    return out;
  }, [tasks, tasklists, taskSearch, statusFilter, priorityFilter]);

  const hasActiveFilters =
    taskSearch.trim().length > 0 ||
    statusFilter.length < STATUS_OPTS.length ||
    priorityFilter.length < PRIORITY_OPTS.length;

  function clearFilters() {
    setTaskSearch("");
    setStatusFilter(STATUS_OPTS.map((s) => s as string));
    setPriorityFilter(PRIORITY_OPTS.map((p) => p as string));
  }

  // ─── Sort (drives ListView only — Board/Calendar keep their own ordering) ──
  const sortValue: SortValue =
    SORT_OPTIONS.find((o) => o.key === sortKey && o.dir === sortDir)?.value ?? "status_asc";

  function handleSortChange(value: string) {
    const opt = SORT_OPTIONS.find((o) => o.value === value);
    if (!opt) return;
    setSortKey(opt.key);
    setSortDir(opt.dir);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  // ─── Issue search / filter ────────────────────────────────────────────────
  const filteredIssues = useMemo(() => {
    const q = issueSearch.trim().toLowerCase();
    const statusSet = new Set(issueStatusFilter);
    const severitySet = new Set(severityFilter);
    return issues.filter((i) => {
      if (!statusSet.has(normalizeStatus(i.status))) return false;
      if (!severitySet.has(normalizeSeverity(i.severity))) return false;
      if (!q) return true;
      return i.title.toLowerCase().includes(q) || (i.assignee_name?.toLowerCase().includes(q) ?? false);
    });
  }, [issues, issueSearch, issueStatusFilter, severityFilter]);

  const hasActiveIssueFilters =
    issueSearch.trim().length > 0 ||
    issueStatusFilter.length < STATUS_OPTS.length ||
    severityFilter.length < SEVERITY_OPTS.length;

  function clearIssueFilters() {
    setIssueSearch("");
    setIssueStatusFilter(STATUS_OPTS.map((s) => s as string));
    setSeverityFilter(SEVERITY_OPTS.map((s) => s as string));
  }

  const issueSortValue: IssueSortValue =
    ISSUE_SORT_OPTIONS.find((o) => o.key === issueSortKey && o.dir === issueSortDir)?.value ?? "istatus_asc";

  function handleIssueSortChange(value: string) {
    const opt = ISSUE_SORT_OPTIONS.find((o) => o.value === value);
    if (!opt) return;
    setIssueSortKey(opt.key);
    setIssueSortDir(opt.dir);
  }

  function toggleIssueSort(key: IssueSortKey) {
    if (issueSortKey === key) setIssueSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setIssueSortKey(key); setIssueSortDir("asc"); }
  }

  // ─── Collapse / expand all tasklist groups ───────────────────────────────
  const allGroupIds = useMemo(() => {
    const ids = tasklists.map((tl) => tl.id);
    const tasklistIds = new Set(ids);
    const hasUnassigned = tasks.some(
      (t) => !t.parent_task_id && t.depth === 0 && (!t.tasklist_id || !tasklistIds.has(t.tasklist_id))
    );
    return hasUnassigned ? [...ids, "__none"] : ids;
  }, [tasks, tasklists]);

  const anyCollapsed = collapsedGroups.size > 0;

  function toggleCollapseAll() {
    setCollapsedGroups(anyCollapsed ? new Set() : new Set(allGroupIds));
  }

  function toggleGroupCollapse(groupId: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  }

  return (
    <>
      {/* Content area — the header (title/badge/subtitle/secondary row/settings gear/tab
          strip) is rendered once by `(tabs)/layout.tsx`, task 283, not per-page. */}
      <div className="flex-1 min-h-0 overflow-hidden bg-[#F4F6FB] flex flex-col">

        {/* ── Tasks tab ── */}
        {primaryTab === "tasks" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 px-8 py-2.5 bg-white border-b border-[#E2E7F2] shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5F6A88] pointer-events-none" />
                  <input
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    placeholder="Search tasks or tasklists…"
                    className="w-56 pl-8 pr-3 py-[6.5px] rounded-[10px] border text-[12px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] placeholder:text-[#5F6A88]"
                  />
                </div>

                <FilterMultiSelect label="Status" options={STATUS_FILTER_OPTIONS} selected={statusFilter} onChange={setStatusFilter} />
                <FilterMultiSelect label="Priority" options={PRIORITY_FILTER_OPTIONS} selected={priorityFilter} onChange={setPriorityFilter} />
                <SortSelect value={sortValue} onChange={handleSortChange} options={SORT_OPTIONS} />

                {view === "list" && (
                  <button
                    onClick={toggleCollapseAll}
                    className="inline-flex items-center gap-1.5 px-3 py-[6.5px] rounded-full border border-[#E2E7F2] bg-white text-[11px] font-semibold text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533] transition-colors cursor-pointer shrink-0"
                  >
                    <ChevronsUpDown size={12} />
                    {anyCollapsed ? "Expand all" : "Collapse all"}
                  </button>
                )}

                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] hover:bg-[#F0F7FF] cursor-pointer shrink-0 transition-colors"
                  >
                    <X size={13} /> Clear filters
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Straight-line List/Board/Calendar toggle — matches /projects's Grid/List toggle */}
                <div className="flex items-center gap-0.5 border border-[#E2E7F2] rounded-full p-1 bg-white shrink-0">
                  {VIEW_ORDER.map((v) => (
                    <Tooltip key={v}>
                      <TooltipTrigger render={
                        <button
                          onClick={() => setView(v)}
                          aria-label={`${VIEW_LABELS[v]} view`}
                          className={cn(
                            "p-1.5 rounded-full transition-colors cursor-pointer",
                            view === v ? "bg-[#071133] text-white" : "text-[#5F6A88] hover:text-[#0B1533]"
                          )}
                        >
                          {VIEW_ICONS[v]}
                        </button>
                      } />
                      <TooltipContent side="top">{VIEW_LABELS[v]} view</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
                {/* Task 282 (item F) — moved here from the page header, vertically centered
                    with the view toggle. */}
                <button
                  onClick={() => setCreateDefaults({})}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FB914E] text-[#471F02] text-[12.5px] font-medium hover:bg-[#E2762F] hover:text-white transition-colors cursor-pointer shrink-0"
                >
                  <Plus size={15} /> New Task
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {view === "board" && (
                <BoardView
                  tasks={filteredTasks}
                  onMove={async (id, status, position) => { await updateTask(id, { status, position }); }}
                  onOpen={(task) => router.push(`${basePath}/tasks/${task.display_id}`)}
                  onAddInColumn={(status) => setCreateDefaults({ status })}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                />
              )}
              {view === "list" && (
                <ListView
                  tasks={filteredTasks}
                  tasklists={tasklists}
                  getHref={(task) => `${basePath}/tasks/${task.display_id}`}
                  onUpdate={updateTask}
                  onBulkDelete={bulkDeleteTasks}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                  profilesById={profilesById}
                  allMembers={allMembers}
                  hoursById={hoursById}
                  onHoursLogged={handleHoursLogged}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onToggleSort={toggleSort}
                  collapsed={collapsedGroups}
                  onToggleCollapseGroup={toggleGroupCollapse}
                  onCreateNew={() => setCreateDefaults({})}
                  hasActiveFilters={hasActiveFilters}
                  onClearFilters={clearFilters}
                  scrollToTasklistId={initialScrollTasklistId}
                />
              )}
              {view === "calendar" && (
                <CalendarView
                  tasks={filteredTasks}
                  onOpen={(task) => router.push(`${basePath}/tasks/${task.display_id}`)}
                  onAddOnDay={(due_date) => setCreateDefaults({ due_date })}
                />
              )}
            </div>
          </>
        )}

        {/* ── Issues tab ── */}
        {primaryTab === "issues" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 px-8 py-2.5 bg-white border-b border-[#E2E7F2] shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5F6A88] pointer-events-none" />
                  <input
                    value={issueSearch}
                    onChange={(e) => setIssueSearch(e.target.value)}
                    placeholder="Search issues…"
                    className="w-56 pl-8 pr-3 py-[6.5px] rounded-[10px] border text-[12px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] placeholder:text-[#5F6A88]"
                  />
                </div>

                <FilterMultiSelect label="Status" options={STATUS_FILTER_OPTIONS} selected={issueStatusFilter} onChange={setIssueStatusFilter} />
                <FilterMultiSelect label="Severity" options={SEVERITY_FILTER_OPTIONS} selected={severityFilter} onChange={setSeverityFilter} />
                <SortSelect value={issueSortValue} onChange={handleIssueSortChange} options={ISSUE_SORT_OPTIONS} />

                {hasActiveIssueFilters && (
                  <button
                    onClick={clearIssueFilters}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] hover:bg-[#F0F7FF] cursor-pointer shrink-0 transition-colors"
                  >
                    <X size={13} /> Clear filters
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-0.5 border border-[#E2E7F2] rounded-full p-1 bg-white shrink-0">
                  {VIEW_ORDER.map((v) => (
                    <Tooltip key={v}>
                      <TooltipTrigger render={
                        <button
                          onClick={() => setIssueView(v)}
                          aria-label={`${VIEW_LABELS[v]} view`}
                          className={cn(
                            "p-1.5 rounded-full transition-colors cursor-pointer",
                            issueView === v ? "bg-[#071133] text-white" : "text-[#5F6A88] hover:text-[#0B1533]"
                          )}
                        >
                          {VIEW_ICONS[v]}
                        </button>
                      } />
                      <TooltipContent side="top">{VIEW_LABELS[v]} view</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
                {/* Task 282 (item F) — moved here from the page header, vertically centered
                    with the view toggle. */}
                <button
                  onClick={() => setCreateIssueOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FB914E] text-[#471F02] text-[12.5px] font-medium hover:bg-[#E2762F] hover:text-white transition-colors cursor-pointer shrink-0"
                >
                  <Plus size={15} /> New Issue
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {issueView === "board" && (
                <IssueBoardView
                  issues={filteredIssues}
                  onMove={async (id, status) => { await updateIssue(id, { status }); }}
                  onOpen={(issue) => router.push(`${basePath}/issues/${issue.display_id}`)}
                />
              )}
              {issueView === "list" && (
                <IssueListView
                  issues={filteredIssues}
                  getHref={(issue) => `${basePath}/issues/${issue.display_id}`}
                  onUpdate={updateIssue}
                  onBulkDelete={bulkDeleteIssues}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                  allMembers={allMembers}
                  sortKey={issueSortKey}
                  sortDir={issueSortDir}
                  onToggleSort={toggleIssueSort}
                  onCreateNew={() => setCreateIssueOpen(true)}
                  hasActiveFilters={hasActiveIssueFilters}
                  onClearFilters={clearIssueFilters}
                />
              )}
              {issueView === "calendar" && (
                <IssueCalendarView
                  issues={filteredIssues}
                  onOpen={(issue) => router.push(`${basePath}/issues/${issue.display_id}`)}
                />
              )}
            </div>
          </>
        )}

        {/* ── Milestones tab ── */}
        {primaryTab === "milestones" && (
          <div className="px-8 py-5 overflow-y-auto h-full">
            <div className="mb-3 flex justify-end">
              <div className="flex items-center gap-0.5 border border-[#E2E7F2] rounded-full p-1 bg-white shrink-0">
                {(["table", "swimlane"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMilestoneView(v)}
                    className={cn(
                      "cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-medium capitalize transition-colors",
                      milestoneView === v ? "bg-[#071133] text-white" : "text-[#5F6A88] hover:text-[#0B1533]"
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            {milestoneView === "table" ? (
              <MilestonePanel
                projectId={project.id}
                basePath={basePath}
                milestones={milestones}
                tasks={tasks}
                onUpsert={upsertMilestone}
                onRemove={removeMilestone}
              />
            ) : (
              <MilestoneSwimlane
                milestones={milestones}
                tasklists={tasklists}
                tasks={tasks}
                basePath={basePath}
              />
            )}
          </div>
        )}

        {/* ── Files tab (task 276 — shared with V2 detail) ── */}
        {primaryTab === "files" && (
          <FilesTab projectId={project.id} customerId={project.customer_id} currentUserRole={currentUserRole} />
        )}

        {/* ── Access tab (task 276 — shared with V2 detail) ── */}
        {primaryTab === "access" && (
          <AccessTab projectId={project.id} customerId={project.customer_id} currentUserRole={currentUserRole} />
        )}

        {/* ── Members tab (task 276 — shared with V2 detail) ── */}
        {primaryTab === "members" && (
          <MembersTab
            projectDbId={project.id}
            projectName={project.name}
            currentUserRole={currentUserRole}
            isCreator={project.created_by === currentUserId}
          />
        )}

        {/* ── Status Report tab (task 276 — shared with V2 detail) ── */}
        {primaryTab === "status_report" && (
          <StatusReportTab projectId={project.id} currentUserRole={currentUserRole} />
        )}

        {/* ── Time Logs tab (task 276 — shared with V2 detail) ── */}
        {primaryTab === "time_logs" && (
          <TimeLogsTab projectId={project.id} currentUserId={currentUserId} currentUserRole={currentUserRole} />
        )}
      </div>

      {/* Create task modal */}
      {createDefaults && (
        <CreateTaskModal
          projectId={project.project_id ?? project.id}
          milestones={milestones}
          tasklists={tasklists}
          tasks={tasks}
          allMembers={allMembers}
          defaults={createDefaults}
          onClose={() => setCreateDefaults(null)}
          onCreated={(t) => { addTask(t); setCreateDefaults(null); }}
          onTasklistCreated={addTasklist}
        />
      )}

      {/* Create issue modal */}
      {createIssueOpen && (
        <CreateIssueModal
          projectId={project.project_id ?? project.id}
          allMembers={allMembers}
          issues={issues}
          onClose={() => setCreateIssueOpen(false)}
          onCreated={(i) => { addIssue(i); setCreateIssueOpen(false); }}
        />
      )}
    </>
  );
}

// ─── Filter multi-select (page-scoped copy of _projects-index.tsx's pattern) ──

type FilterOption = { value: string; label: string };

function FilterCheckRow({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left text-[12px] text-[#3A4565] transition-colors hover:bg-[#F4F6FB] cursor-pointer"
    >
      <span className={cn(
        "flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        checked ? "bg-[#071133] border-[#071133]" : "bg-white border-[#E2E7F2]"
      )}>
        {checked && <Check size={11} strokeWidth={3} className="text-white" />}
      </span>
      {label}
    </button>
  );
}

function FilterMultiSelect({
  label, options, selected, onChange,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function place() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 190) });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  const allChecked = selected.length === options.length;
  const summary = allChecked
    ? "All"
    : selected.length === 0
      ? "None"
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label
        : `${selected.length} selected`;

  function toggleOption(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }
  function toggleAll() {
    onChange(allChecked ? [] : options.map((o) => o.value));
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-[6.5px] rounded-full border text-[11px] font-semibold transition-colors cursor-pointer shrink-0",
          !allChecked ? "border-[#007BFF] bg-[#F0F7FF] text-[#0063D6]" : "border-[#E2E7F2] bg-white text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533]"
        )}
      >
        {label}: <span className="font-mono font-normal">{summary}</span>
        <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
      </button>

      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="z-50 overflow-hidden rounded-[10px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] p-1"
          >
            <FilterCheckRow label="All" checked={allChecked} onClick={toggleAll} />
            <div className="my-1 h-px bg-[#EDF0F7]" />
            {options.map((o) => (
              <FilterCheckRow key={o.value} label={o.label} checked={selected.includes(o.value)} onClick={() => toggleOption(o.value)} />
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  );
}

// ─── Sort select (page-scoped) ─────────────────────────────────────────────

function SortSelect({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative shrink-0">
      <ArrowUpDown size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5F6A88] pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[30px] pl-7 pr-7 rounded-full border border-[#E2E7F2] bg-white text-[11px] font-semibold text-[#3A4565] outline-none focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] cursor-pointer appearance-none"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235F6A88'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// `CreateTaskModal` extracted to `_create-task-modal.tsx` (task 274), `CreateIssueModal`
// extracted to `_create-issue-modal.tsx` (task 286) — exported here since both extracted files
// import this type back for their own props.
export type MemberOptionWithRole = { id: string; full_name: string | null; avatar_url: string | null; role: string };
