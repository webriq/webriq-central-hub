"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, LayoutGrid, List as ListIcon, Calendar as CalendarIcon,
  Plus, X, Loader2, Search, Check, ChevronDown, ArrowUpDown, ChevronsUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { V2_ROUTES } from "@/config/constants";
import {
  type Project, type Milestone, type Tasklist, type Task, type Issue,
  type TaskStatus, type TaskPriority, type IssueSeverity, ProjectStatusBadge,
  STATUS_LABEL, PRIORITY_STYLE, SEVERITY_STYLE, normalizeStatus, normalizeSeverity,
} from "../_pm-shared";
import BoardView from "./_board-view";
import ListView, { type SortKey, type SortDir } from "./_list-view";
import CalendarView from "./_calendar-view";
import IssueListView, { type IssueSortKey, type IssueSortDir } from "./_issue-list-view";
import IssueBoardView from "./_issue-board-view";
import IssueCalendarView from "./_issue-calendar-view";
import MilestonePanel from "./_milestone-panel";
import MilestoneSwimlane from "./_milestone-swimlane";
import { TaskDescriptionEditor } from "./_task-description-editor";
import { TaskAttachmentPicker } from "./_task-attachment-picker";
import { DeleteProjectAction } from "./_delete-project-action";

type ViewId = "board" | "list" | "calendar";
type PrimaryTab = "tasks" | "issues" | "milestones";

const VIEW_LABELS: Record<ViewId, string> = { list: "List", board: "Board", calendar: "Calendar" };
const VIEW_ICONS: Record<ViewId, React.ReactNode> = {
  list:     <ListIcon size={15} />,
  board:    <LayoutGrid size={15} />,
  calendar: <CalendarIcon size={15} />,
};
const VIEW_ORDER: ViewId[] = ["list", "board", "calendar"];

const PRIMARY_TABS: { id: PrimaryTab; label: string }[] = [
  { id: "tasks",      label: "Tasks" },
  { id: "issues",     label: "Issues" },
  { id: "milestones", label: "Milestones" },
];

const STATUS_OPTS: TaskStatus[] = [
  "open", "in_progress", "ready_for_qa", "testing_completed",
  "for_client_approval", "ready_to_merge", "post_live_qa", "closed",
];
const PRIORITY_OPTS: TaskPriority[] = ["low", "normal", "high", "critical"];

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
const SEVERITY_OPTS: IssueSeverity[] = ["Show stopper", "Critical", "Major", "Minor", "None"];
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
  companyName,
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
}: {
  project: Project;
  companyName: string;
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
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-8 pt-6 pb-0 bg-white shrink-0">
        <button
          onClick={() => router.push(V2_ROUTES.PROJECTS)}
          className="inline-flex items-center gap-1.5 text-[12px] text-[#5F6A88] hover:text-[#0B1533] mb-3 cursor-pointer transition-colors"
          suppressHydrationWarning
        >
          <ArrowLeft size={14} /> All projects
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="font-heading text-[22px] font-bold text-[#0B1533] tracking-[-0.02em] truncate">
                {project.name}
              </h1>
              <ProjectStatusBadge status={project.status} />
            </div>
            <p className="text-[13px] text-[#5F6A88] mt-0.5">
              {companyName} · {project.project_type}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <DeleteProjectAction
              projectId={project.project_id}
              projectName={project.name}
              currentUserRole={currentUserRole}
            />
            <button
              onClick={() => (primaryTab === "issues" ? setCreateIssueOpen(true) : setCreateDefaults({}))}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#FB914E] text-[#471F02] text-[13px] font-medium hover:bg-[#E2762F] hover:text-white transition-colors cursor-pointer"
            >
              <Plus size={16} /> {primaryTab === "issues" ? "New Issue" : "New Task"}
            </button>
          </div>
        </div>

        {/* Primary tabs */}
        <div className="flex items-center mt-4">
          <div className="flex items-center gap-1 bg-[#F4F6FB] rounded-full p-1">
            {PRIMARY_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => router.push(`/projects/${project.project_id}/${tab.id}`)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer",
                  primaryTab === tab.id
                    ? "bg-white text-[#0B1533] shadow-[0_1px_2px_rgba(7,17,51,.05)]"
                    : "text-[#5F6A88] hover:text-[#0B1533]"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content area */}
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
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {view === "board" && (
                <BoardView
                  tasks={filteredTasks}
                  onMove={async (id, status, position) => { await updateTask(id, { status, position }); }}
                  onOpen={(task) => router.push(`/projects/${project.project_id}/tasks/${task.display_id}`)}
                  onAddInColumn={(status) => setCreateDefaults({ status })}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                />
              )}
              {view === "list" && (
                <ListView
                  tasks={filteredTasks}
                  tasklists={tasklists}
                  onOpen={(task) => router.push(`/projects/${project.project_id}/tasks/${task.display_id}`)}
                  onUpdate={updateTask}
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
                  onOpen={(task) => router.push(`/projects/${project.project_id}/tasks/${task.display_id}`)}
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
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {issueView === "board" && (
                <IssueBoardView
                  issues={filteredIssues}
                  onMove={async (id, status) => { await updateIssue(id, { status }); }}
                  onOpen={(issue) => router.push(`/projects/${project.project_id}/issues/${issue.display_id}`)}
                />
              )}
              {issueView === "list" && (
                <IssueListView
                  issues={filteredIssues}
                  onOpen={(issue) => router.push(`/projects/${project.project_id}/issues/${issue.display_id}`)}
                  onUpdate={updateIssue}
                  onBulkDelete={bulkDeleteIssues}
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
                  onOpen={(issue) => router.push(`/projects/${project.project_id}/issues/${issue.display_id}`)}
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
                projectSlug={project.project_id ?? project.id}
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
                projectUrlKey={project.project_id ?? project.id}
              />
            )}
          </div>
        )}
      </div>

      {/* Create task modal */}
      {createDefaults && (
        <CreateTaskModal
          projectId={project.project_id ?? project.id}
          milestones={milestones}
          tasklists={tasklists}
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
          onClose={() => setCreateIssueOpen(false)}
          onCreated={(i) => { addIssue(i); setCreateIssueOpen(false); }}
        />
      )}

    </div>
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

// ─── Create Task modal ────────────────────────────────────────────────────────

type MemberOptionWithRole = { id: string; full_name: string | null; avatar_url: string | null; role: string };

function CreateTaskModal({
  projectId,
  milestones,
  tasklists,
  allMembers,
  defaults,
  onClose,
  onCreated,
  onTasklistCreated,
}: {
  projectId: string;
  milestones: Milestone[];
  tasklists: Tasklist[];
  allMembers: MemberOptionWithRole[];
  defaults: TaskDefaults;
  onClose: () => void;
  onCreated: (t: Task) => void;
  onTasklistCreated: (tl: Tasklist) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(defaults.status ?? "open");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [milestoneId, setMilestoneId] = useState<string>(defaults.milestone_id ?? "");
  const [startDate, setStartDate] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>(defaults.due_date ?? "");
  const [tasklistId, setTasklistId] = useState<string>(() => tasklists.find((tl) => tl.is_default)?.id ?? "");
  const [creatingTasklist, setCreatingTasklist] = useState(false);
  const [newTasklistName, setNewTasklistName] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachmentWarning, setAttachmentWarning] = useState<string | null>(null);

  const developers = allMembers.filter((m) => m.role === "developer");

  async function submit() {
    if (!title.trim()) { setError("Title is required"); return; }
    if (!startDate) { setError("Start date is required"); return; }
    if (!dueDate) { setError("Due date is required"); return; }
    setSaving(true);
    setError(null);
    setAttachmentWarning(null);

    let finalTasklistId = tasklistId;
    if (creatingTasklist && newTasklistName.trim()) {
      const tlRes = await fetch(`/api/v2/projects/${projectId}/tasklists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTasklistName.trim() }),
      });
      if (!tlRes.ok) {
        const body = await tlRes.json().catch(() => ({}));
        setError(body.error || "Failed to create task list");
        setSaving(false);
        return;
      }
      const newTasklist: Tasklist = await tlRes.json();
      onTasklistCreated(newTasklist);
      finalTasklistId = newTasklist.id;
    }

    const res = await fetch(`/api/v2/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        milestone_id: milestoneId || undefined,
        tasklist_id: finalTasklistId || undefined,
        start_date: startDate,
        due_date: dueDate,
        assignees: assigneeId ? [assigneeId] : undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Failed to create task");
      setSaving(false);
      return;
    }
    const task: Task = await res.json();

    if (attachmentFiles.length > 0) {
      const results = await Promise.allSettled(attachmentFiles.map((file) => {
        const fd = new FormData();
        fd.append("file", file);
        return fetch(`/api/v2/projects/${projectId}/tasks/${task.id}/attachments`, { method: "POST", body: fd });
      }));
      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
      if (failed > 0) {
        setAttachmentWarning(`Task created — ${failed} of ${attachmentFiles.length} attachment(s) failed to upload.`);
      }
    }

    onCreated(task);
  }

  const inputClass = "w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]";
  const labelClass = "text-[11px] font-semibold text-[#0B1533]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1533]/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-[14px] bg-white shadow-xl border border-[#E2E7F2] overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDF0F7] shrink-0">
          <h2 className="text-[15px] font-semibold text-[#0B1533]">New Task</h2>
          <button onClick={onClose} className="p-1 rounded-md text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#F4F6FB] cursor-pointer transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              className={inputClass}
              placeholder="What needs to be done?"
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>Description (optional)</span>
            <TaskDescriptionEditor projectId={projectId} value={description} onChange={setDescription} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>Attachments (optional)</span>
            <TaskAttachmentPicker files={attachmentFiles} onFilesChange={setAttachmentFiles} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className={cn(inputClass, "bg-white capitalize cursor-pointer")}
              >
                {STATUS_OPTS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className={cn(inputClass, "bg-white capitalize cursor-pointer")}
              >
                {PRIORITY_OPTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Milestone</span>
              <select
                value={milestoneId}
                onChange={(e) => setMilestoneId(e.target.value)}
                className={cn(inputClass, "bg-white cursor-pointer")}
              >
                <option value="">None</option>
                {milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Start date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Due date</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className={labelClass}>Task list</span>
              {creatingTasklist ? (
                <div className="flex items-center gap-1.5">
                  <input
                    value={newTasklistName}
                    onChange={(e) => setNewTasklistName(e.target.value)}
                    autoFocus
                    placeholder="New task list name"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => { setCreatingTasklist(false); setNewTasklistName(""); }}
                    aria-label="Cancel new task list"
                    className="p-2 rounded-[10px] text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#F4F6FB] cursor-pointer transition-colors shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <select
                  value={tasklistId}
                  onChange={(e) => {
                    if (e.target.value === "__create__") { setCreatingTasklist(true); return; }
                    setTasklistId(e.target.value);
                  }}
                  className={cn(inputClass, "bg-white cursor-pointer")}
                >
                  <option value="">No task list</option>
                  {tasklists.map((tl) => <option key={tl.id} value={tl.id}>{tl.name}</option>)}
                  <option value="__create__">+ Create new list…</option>
                </select>
              )}
            </div>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Assignee</span>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className={cn(inputClass, "bg-white cursor-pointer")}
              >
                <option value="">Unassigned</option>
                {developers.map((m) => <option key={m.id} value={m.id}>{m.full_name ?? "Unknown"}</option>)}
              </select>
            </label>
          </div>
          {error && <p className="text-[12px] text-[#C0392B]">{error}</p>}
          {attachmentWarning && <p className="text-[12px] text-[#8A5A00]">{attachmentWarning}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EDF0F7] bg-[#F4F6FB] shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-[13px] text-[#3A4565] bg-white border border-[#E2E7F2] hover:border-[#A8C6F5] cursor-pointer transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#007BFF] text-white text-[13px] font-medium hover:bg-[#0063D6] disabled:opacity-45 cursor-pointer transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />} Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Issue modal ───────────────────────────────────────────────────────

type MemberOption = { id: string; full_name: string | null; avatar_url: string | null };

function CreateIssueModal({
  projectId,
  allMembers,
  onClose,
  onCreated,
}: {
  projectId: string;
  allMembers: MemberOption[];
  onClose: () => void;
  onCreated: (i: Issue) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<string>("open");
  const [severity, setSeverity] = useState<IssueSeverity>("None");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);
    const assignee = allMembers.find((m) => m.id === assigneeId);
    const res = await fetch(`/api/v2/projects/${projectId}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        severity,
        assignee_name: assignee?.full_name || undefined,
        due_date: dueDate || undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Failed to create issue");
      setSaving(false);
      return;
    }
    onCreated(await res.json());
  }

  const inputClass = "w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]";
  const labelClass = "text-[11px] font-semibold text-[#0B1533]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1533]/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-[14px] bg-white shadow-xl border border-[#E2E7F2] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDF0F7]">
          <h2 className="text-[15px] font-semibold text-[#0B1533]">New Issue</h2>
          <button onClick={onClose} className="p-1 rounded-md text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#F4F6FB] cursor-pointer transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              className={inputClass}
              placeholder="What's the issue?"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Description (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={cn(inputClass, "resize-none")}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={cn(inputClass, "bg-white capitalize cursor-pointer")}
              >
                {STATUS_OPTS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Severity</span>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
                className={cn(inputClass, "bg-white cursor-pointer")}
              >
                {SEVERITY_OPTS.map((s) => <option key={s} value={s}>{SEVERITY_STYLE[s].label}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Assignee</span>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className={cn(inputClass, "bg-white cursor-pointer")}
              >
                <option value="">Unassigned</option>
                {allMembers.map((m) => <option key={m.id} value={m.id}>{m.full_name ?? "Unknown"}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Due date</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
          {error && <p className="text-[12px] text-[#C0392B]">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EDF0F7] bg-[#F4F6FB]">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-[13px] text-[#3A4565] bg-white border border-[#E2E7F2] hover:border-[#A8C6F5] cursor-pointer transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#007BFF] text-white text-[13px] font-medium hover:bg-[#0063D6] disabled:opacity-45 cursor-pointer transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />} Create
          </button>
        </div>
      </div>
    </div>
  );
}
