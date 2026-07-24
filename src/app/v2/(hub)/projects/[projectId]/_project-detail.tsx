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
  type Project, type Milestone, type Tasklist, type Task,
  type TaskStatus, type TaskPriority, ProjectStatusBadge,
  STATUS_LABEL, PRIORITY_STYLE, normalizeStatus,
} from "../_pm-shared";
import BoardView from "./_board-view";
import ListView, { type SortKey, type SortDir } from "./_list-view";
import CalendarView from "./_calendar-view";
import MilestonePanel from "./_milestone-panel";

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
  currentUserId,
  profilesById,
  allMembers,
  initialHoursById,
}: {
  project: Project;
  companyName: string;
  initialMilestones: Milestone[];
  initialTasklists: Tasklist[];
  initialTasks: Task[];
  currentUserId: string;
  profilesById: Record<string, { full_name: string; avatar_url: string | null }>;
  allMembers: { id: string; full_name: string | null; avatar_url: string | null }[];
  initialHoursById: Record<string, number>;
}) {
  const router = useRouter();
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>("tasks");
  const [view, setView] = useState<ViewId>("list");
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones);
  const [tasklists] = useState<Tasklist[]>(initialTasklists);
  const [createDefaults, setCreateDefaults] = useState<TaskDefaults | null>(null);
  const [hoursById, setHoursById] = useState<Record<string, number>>(initialHoursById);

  // ─── Task toolbar state (search / status / priority / sort / collapse-all) ─
  const [taskSearch, setTaskSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>(() => STATUS_OPTS.map((s) => s as string));
  const [priorityFilter, setPriorityFilter] = useState<string[]>(() => PRIORITY_OPTS.map((p) => p as string));
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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

  const handleTimerStop = useCallback(async (taskId: string, hours: number) => {
    setHoursById((prev) => ({ ...prev, [taskId]: (prev[taskId] ?? 0) + hours }));
    await fetch(`/api/v2/tasks/${taskId}/timelog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours, project_id: project.id }),
    });
  }, [project.id]);

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
          <button
            onClick={() => setCreateDefaults({})}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#FB914E] text-[#471F02] text-[13px] font-medium hover:bg-[#E2762F] hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <Plus size={16} /> New Task
          </button>
        </div>

        {/* Primary tabs */}
        <div className="flex items-center mt-4">
          <div className="flex items-center gap-1 bg-[#F4F6FB] rounded-full p-1">
            {PRIMARY_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPrimaryTab(tab.id)}
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
                <SortSelect value={sortValue} onChange={handleSortChange} />

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

              {/* Straight-line List/Board/Calendar toggle — matches /v2/projects's Grid/List toggle */}
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
                  onOpen={(task) => router.push(`/v2/projects/${project.project_id}/tasks/${task.display_id}`)}
                  onAddInColumn={(status) => setCreateDefaults({ status })}
                />
              )}
              {view === "list" && (
                <ListView
                  tasks={filteredTasks}
                  tasklists={tasklists}
                  onOpen={(task) => router.push(`/v2/projects/${project.project_id}/tasks/${task.display_id}`)}
                  onUpdate={updateTask}
                  currentUserId={currentUserId}
                  profilesById={profilesById}
                  allMembers={allMembers}
                  hoursById={hoursById}
                  onTimerStop={handleTimerStop}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onToggleSort={toggleSort}
                  collapsed={collapsedGroups}
                  onToggleCollapseGroup={toggleGroupCollapse}
                  hasActiveFilters={hasActiveFilters}
                  onClearFilters={clearFilters}
                />
              )}
              {view === "calendar" && (
                <CalendarView
                  tasks={filteredTasks}
                  onOpen={(task) => router.push(`/v2/projects/${project.project_id}/tasks/${task.display_id}`)}
                  onAddOnDay={(due_date) => setCreateDefaults({ due_date })}
                />
              )}
            </div>
          </>
        )}

        {/* ── Issues tab ── */}
        {primaryTab === "issues" && (
          <div className="flex items-center justify-center h-full">
            <p className="text-[13px] text-[#5F6A88]">Issues coming soon.</p>
          </div>
        )}

        {/* ── Milestones tab ── */}
        {primaryTab === "milestones" && (
          <div className="px-8 py-5 overflow-y-auto h-full">
            <MilestonePanel
              projectId={project.id}
              milestones={milestones}
              tasks={tasks}
              onUpsert={upsertMilestone}
              onRemove={removeMilestone}
            />
          </div>
        )}
      </div>

      {/* Create task modal */}
      {createDefaults && (
        <CreateTaskModal
          projectId={project.id}
          milestones={milestones}
          defaults={createDefaults}
          onClose={() => setCreateDefaults(null)}
          onCreated={(t) => { addTask(t); setCreateDefaults(null); }}
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

function SortSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative shrink-0">
      <ArrowUpDown size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5F6A88] pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[30px] pl-7 pr-7 rounded-full border border-[#E2E7F2] bg-white text-[11px] font-semibold text-[#3A4565] outline-none focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] cursor-pointer appearance-none"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235F6A88'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
      >
        {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ─── Create Task modal ────────────────────────────────────────────────────────

function CreateTaskModal({
  projectId,
  milestones,
  defaults,
  onClose,
  onCreated,
}: {
  projectId: string;
  milestones: Milestone[];
  defaults: TaskDefaults;
  onClose: () => void;
  onCreated: (t: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(defaults.status ?? "open");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [milestoneId, setMilestoneId] = useState<string>(defaults.milestone_id ?? "");
  const [dueDate, setDueDate] = useState<string>(defaults.due_date ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/v2/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        milestone_id: milestoneId || undefined,
        due_date: dueDate || undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Failed to create task");
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
          <h2 className="text-[15px] font-semibold text-[#0B1533]">New Task</h2>
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
              placeholder="What needs to be done?"
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
          <div className="grid grid-cols-2 gap-3">
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
