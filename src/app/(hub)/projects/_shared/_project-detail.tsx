"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type Project, type Milestone, type Tasklist, type Task, type Ticket,
  type TaskStatus, type TicketSeverity,
  STATUS_LABEL, SEVERITY_STYLE, normalizeStatus, normalizeSeverity,
} from "@/app/(hub)/projects-old/_pm-shared";
import BoardView from "./_board-view";
import ListView from "./_list-view";
import CalendarView from "./_calendar-view";
import TicketListView, { type TicketSortKey, type TicketSortDir } from "./_ticket-list-view";
import TicketBoardView from "./_ticket-board-view";
import TicketCalendarView from "./_ticket-calendar-view";
import MilestonePanel from "./_milestone-panel";
import MilestoneSwimlane from "./_milestone-swimlane";
import { CreateTaskModal } from "./_create-task-modal";
import { CreateTicketModal } from "./_create-ticket-modal";
import { MembersTab } from "./_members-tab";
import { StatusReportTab } from "./_status-report-tab";
import { TimeLogsTab } from "./_time-logs-tab";
import { FilesTab } from "./_files-tab";
import { NotesTab } from "./_notes-tab";
import { AccessTab } from "./_access-tab";
import { FilterMultiSelect, SortSelect } from "./_list-toolbar-controls";
import { buildAssigneeFilterOptions, buildMemberIdByName, ticketMatchesAssigneeFilter } from "./_assignee-filter";
import { STATUS_OPTS } from "./_tasks/_task-options";
import { useTaskFilters } from "./_tasks/_use-task-filters";
import { useTaskMoves } from "./_tasks/_use-task-moves";
import { TasksToolbar, ViewToggle, type ViewId, type Density } from "./_tasks/_tasks-toolbar";
import { TasksProgressStrip } from "./_tasks/_tasks-progress-strip";

// Task 276 — ported ONCE from the old `/projects/[projectId]/_project-detail.tsx` (now
// `/projects-old`, originally 1078 lines, single file rendering both its own tab-strip nav AND
// the tab body content) into `projects/_shared/` so it can be shared by BOTH
// `/projects/legacy/[projectId]` (this task's scope) and `/projects/[classification]/[projectId]` (a later
// task) instead of duplicating it.
// `basePath`/`variant` (new props, see bottom of the prop list below) replace every hardcoded
// `/projects/${projectId}` route string the source file had — `variant="v2"` additionally
// renders an Overview tab that a later task owns; this file only guarantees `variant` is
// accepted and doesn't break the `"legacy"` case, which has no Overview tab.

type PrimaryTab = "tasks" | "tickets" | "milestones" | "files" | "notes" | "access" | "members" | "status_report" | "time_logs";

// Task 276 — 5 new tabs (Files/Access/Members/Status Report/Time Logs) alongside the ported
// Tasks/Tickets/Milestones. Each new tab's actual body lives in its own `_shared/_*-tab.tsx` file
// (see imports above) — this file only gains a conditional render per tab, per the task doc's
// file-length guidance. The tab-strip's own entry list now lives in
// `_project-detail-tab-strip.tsx` (Phase 3 extraction — see `ProjectDetailTabStrip` usage below).

// Task 487 — moved to `_tasks/_task-options.ts`; re-exported for `_create-task-modal.tsx`.
export { STATUS_OPTS, PRIORITY_OPTS } from "./_tasks/_task-options";

const STATUS_FILTER_OPTIONS = STATUS_OPTS.map((s) => ({ value: s, label: STATUS_LABEL[s] }));

// ─── Tickets tab — status pipeline is shared with tasks (see task 192 doc); severity
// is a separate 5-value Zoho vocabulary, not the task priority enum. ────────────────
// Exported (task 286) — `_create-ticket-modal.tsx` (extracted out of this file) reuses this
// same Severity option list rather than duplicating it, same as STATUS_OPTS/PRIORITY_OPTS.
export const SEVERITY_OPTS: TicketSeverity[] = ["Show stopper", "Critical", "Major", "Minor", "None"];
const SEVERITY_FILTER_OPTIONS = SEVERITY_OPTS.map((s) => ({ value: s, label: SEVERITY_STYLE[s].label }));

type TicketSortValue = "istatus_asc" | "istatus_desc" | "iname_asc" | "iname_desc" | "idue_soonest" | "idue_latest" | "severity_high" | "severity_low";

const TICKET_SORT_OPTIONS: { value: TicketSortValue; label: string; key: TicketSortKey; dir: TicketSortDir }[] = [
  { value: "istatus_asc",    label: "Status (pipeline order)",   key: "status",   dir: "asc" },
  { value: "istatus_desc",   label: "Status (reverse order)",    key: "status",   dir: "desc" },
  { value: "iname_asc",      label: "Ticket name (A–Z)",          key: "title",    dir: "asc" },
  { value: "iname_desc",     label: "Ticket name (Z–A)",          key: "title",    dir: "desc" },
  { value: "idue_soonest",   label: "Due date (soonest)",        key: "due_date", dir: "asc" },
  { value: "idue_latest",    label: "Due date (latest)",         key: "due_date", dir: "desc" },
  { value: "severity_high",  label: "Severity (highest first)",  key: "severity", dir: "asc" },
  { value: "severity_low",   label: "Severity (lowest first)",   key: "severity", dir: "desc" },
];

export type TaskDefaults = {
  status?: TaskStatus;
  // Task 487 — group "+ Add task" preselects its task list.
  tasklist_id?: string;
  milestone_id?: string | null;
  due_date?: string | null;
};

export default function ProjectDetail({
  project,
  initialMilestones,
  initialTasklists,
  initialTasks,
  initialTickets,
  currentUserId,
  currentUserRole,
  profilesById,
  allMembers,
  initialHoursById,
  attachmentCountById,
  commentCountById = {},
  tasksDensity = "comfortable",
  activeTab,
  initialScrollTasklistId,
  basePath,
}: {
  project: Project;
  initialMilestones: Milestone[];
  initialTasklists: Tasklist[];
  initialTasks: Task[];
  initialTickets: Ticket[];
  currentUserId: string;
  currentUserRole: string | null;
  profilesById: Record<string, { full_name: string; avatar_url: string | null }>;
  allMembers: { id: string; full_name: string | null; avatar_url: string | null; role: string }[];
  initialHoursById: Record<string, number>;
  attachmentCountById: Record<string, number>;
  commentCountById?: Record<string, number>;
  tasksDensity?: Density;
  activeTab: PrimaryTab;
  // Task 241 — `?tasklist=<id>` deep-link from the StackShift Timeline's Phase 2-5 swimlane cards.
  initialScrollTasklistId?: string;
  // Task 276 — replaces every hardcoded `/projects/${projectId}` route string from the source
  // file. Callers pass `/projects/legacy/${projectId}` or `/projects/<slug>/${projectId}`.
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

  const [density, setDensity] = useState<Density>(tasksDensity);

  // ─── Ticket state (own view/toolbar state — independent of the Tasks tab) ───
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
  const [ticketView, setTicketView] = useState<ViewId>("list");
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string[]>(() => STATUS_OPTS.map((s) => s as string));
  const [severityFilter, setSeverityFilter] = useState<string[]>(() => SEVERITY_OPTS.map((s) => s as string));
  const [ticketSortKey, setTicketSortKey] = useState<TicketSortKey>("status");
  const [ticketSortDir, setTicketSortDir] = useState<TicketSortDir>("asc");
  const [createTicketOpen, setCreateTicketOpen] = useState(false);

  // ─── Assignee filter (task 346) — one shared option list, independent state per tab ─
  const assigneeOptions = useMemo(
    () => buildAssigneeFilterOptions(allMembers, currentUserId, profilesById),
    [allMembers, currentUserId, profilesById],
  );
  const memberIdByName = useMemo(() => buildMemberIdByName(allMembers), [allMembers]);
  const [ticketAssigneeFilter, setTicketAssigneeFilter] = useState<string[]>(() => assigneeOptions.map((o) => o.value));
  const assigneeValues = useMemo(() => assigneeOptions.map((o) => o.value), [assigneeOptions]);
  const f = useTaskFilters(tasks, tasklists, milestones, assigneeValues);
  const moves = useTaskMoves({ tasks, setTasks, tasklists, setTasklists, milestones, setMilestones });

  // Task 487 D7 — saved per account; a failed save keeps the choice for this session, silently.
  function changeDensity(d: Density) {
    setDensity(d);
    void fetch("/api/v2/me/preferences", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tasks_density: d }),
    }).catch(() => {});
  }

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
      .channel(`project_tickets_${project.id}`)
      .on(
        "postgres_changes",
        // NOTE: `table: "issues"` is the real DB table name (unchanged by task 364's Ticket
        // rename — see the task doc's Out of Scope) — do not "fix" this to "tickets", that is a
        // *different* table (Desk helpdesk emails).
        { event: "*", schema: "public", table: "issues", filter: `project_id=eq.${project.id}` },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setTickets((prev) =>
              prev.map((i) => (i.id === (payload.new as Ticket).id ? { ...i, ...(payload.new as Ticket) } : i))
            );
          } else if (payload.eventType === "INSERT") {
            const incoming = payload.new as Ticket;
            setTickets((prev) =>
              prev.some((i) => i.id === incoming.id) ? prev : [...prev, incoming]
            );
          } else if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id: string }).id;
            setTickets((prev) => prev.filter((i) => i.id !== deletedId));
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

  // Task 467 — "Add subtask" from a listing row opens the New Task modal in subtask mode.
  const [subtaskParent, setSubtaskParent] = useState<Task | null>(null);
  const [expandRequest, setExpandRequest] = useState<{ id: string; n: number } | null>(null);

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

  // ─── Ticket mutations (optimistic) ────────────────────────────────────────
  const updateTicket = useCallback(async (id: string, patch: Partial<Ticket>) => {
    const snapshot = tickets;
    setTickets((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const res = await fetch(`/api/v2/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) { setTickets(snapshot); return false; }
    const updated: Ticket = await res.json();
    setTickets((prev) => prev.map((i) => (i.id === id ? updated : i)));
    return true;
  }, [tickets]);

  const addTicket = useCallback((ticket: Ticket) => {
    setTickets((prev) => [...prev, ticket]);
  }, []);

  const bulkDeleteTickets = useCallback(async (ids: string[]) => {
    const results = await Promise.all(
      ids.map(async (id) => {
        const res = await fetch(`/api/v2/tickets/${id}`, { method: "DELETE" });
        return { id, ok: res.ok };
      })
    );
    const deletedIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
    setTickets((prev) => prev.filter((i) => !deletedIds.has(i.id)));
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

  // ─── Ticket search / filter ────────────────────────────────────────────────
  const filteredTickets = useMemo(() => {
    const q = ticketSearch.trim().toLowerCase();
    const statusSet = new Set(ticketStatusFilter);
    const severitySet = new Set(severityFilter);
    const assigneeSet = new Set(ticketAssigneeFilter);
    const assigneeAll = ticketAssigneeFilter.length >= assigneeOptions.length;
    return tickets.filter((i) => {
      if (!statusSet.has(normalizeStatus(i.status))) return false;
      if (!severitySet.has(normalizeSeverity(i.severity))) return false;
      if (!ticketMatchesAssigneeFilter(i, memberIdByName, assigneeSet, assigneeAll)) return false;
      if (!q) return true;
      return i.title.toLowerCase().includes(q) || (i.assignee_name?.toLowerCase().includes(q) ?? false);
    });
  }, [tickets, ticketSearch, ticketStatusFilter, severityFilter, ticketAssigneeFilter, assigneeOptions.length, memberIdByName]);

  const hasActiveTicketFilters =
    ticketSearch.trim().length > 0 ||
    ticketStatusFilter.length < STATUS_OPTS.length ||
    severityFilter.length < SEVERITY_OPTS.length ||
    ticketAssigneeFilter.length < assigneeOptions.length;

  function clearTicketFilters() {
    setTicketSearch("");
    setTicketStatusFilter(STATUS_OPTS.map((s) => s as string));
    setSeverityFilter(SEVERITY_OPTS.map((s) => s as string));
    setTicketAssigneeFilter(assigneeOptions.map((o) => o.value));
  }

  const ticketSortValue: TicketSortValue =
    TICKET_SORT_OPTIONS.find((o) => o.key === ticketSortKey && o.dir === ticketSortDir)?.value ?? "istatus_asc";

  function handleTicketSortChange(value: string) {
    const opt = TICKET_SORT_OPTIONS.find((o) => o.value === value);
    if (!opt) return;
    setTicketSortKey(opt.key);
    setTicketSortDir(opt.dir);
  }

  function toggleTicketSort(key: TicketSortKey) {
    if (ticketSortKey === key) setTicketSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setTicketSortKey(key); setTicketSortDir("asc"); }
  }

  return (
    <>
      {/* Content area — the header (title/badge/subtitle/secondary row/settings gear/tab
          strip) is rendered once by `(tabs)/layout.tsx`, task 283, not per-page. */}
      <div className="flex-1 min-h-0 overflow-hidden bg-[#F4F6FB] flex flex-col">

        {/* ── Tasks tab ── */}
        {primaryTab === "tasks" && (
          <>
            <TasksToolbar
              f={f}
              assigneeOptions={assigneeOptions}
              view={view}
              onView={setView}
              density={density}
              onDensity={changeDensity}
              onNewTask={() => setCreateDefaults({})}
            />
            {view === "list" && <TasksProgressStrip tasks={tasks} milestones={milestones} projectEndDate={project.end_date ?? null} />}
            <div className="flex-1 min-h-0 overflow-hidden">
              {view === "board" && (
                <BoardView
                  tasks={f.filteredTasks}
                  onMove={async (id, status, position) => { await updateTask(id, { status, position }); }}
                  onOpen={(task) => router.push(`${basePath}/tasks/${task.display_id}`)}
                  onAddInColumn={(status) => setCreateDefaults({ status })}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                  attachmentCountById={attachmentCountById}
                />
              )}
              {view === "list" && (
                <ListView
                  tasks={f.filteredTasks}
                  tasklists={tasklists}
                  milestones={milestones}
                  getHref={(task) => `${basePath}/tasks/${task.display_id}`}
                  onUpdate={updateTask}
                  onBulkDelete={bulkDeleteTasks}
                  onAddSubtask={(t) => setSubtaskParent(t)}
                  onAddTask={(tasklist_id) => setCreateDefaults({ tasklist_id, milestone_id: tasklists.find((l) => l.id === tasklist_id)?.milestone_id ?? null })}
                  expandRequest={expandRequest}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                  profilesById={profilesById}
                  allMembers={allMembers}
                  hoursById={hoursById}
                  attachmentCountById={attachmentCountById}
                  commentCountById={commentCountById}
                  onHoursLogged={handleHoursLogged}
                  sortKey={f.sortKey}
                  sortDir={f.sortDir}
                  onToggleSort={f.toggleSort}
                  onManualSort={() => { f.setSortKey("position"); f.setSortDir("asc"); }}
                  collapsed={f.collapsed}
                  onToggleCollapse={f.toggleCollapse}
                  onCreateNew={() => setCreateDefaults({})}
                  hasActiveFilters={f.hasActiveFilters}
                  onClearFilters={f.clearFilters}
                  scrollToTasklistId={initialScrollTasklistId}
                  compact={density === "compact"}
                  moves={moves}
                />
              )}
              {view === "calendar" && (
                <CalendarView
                  tasks={f.filteredTasks}
                  onOpen={(task) => router.push(`${basePath}/tasks/${task.display_id}`)}
                  onAddOnDay={(due_date) => setCreateDefaults({ due_date })}
                />
              )}
            </div>
          </>
        )}

        {/* ── Tickets tab ── */}
        {primaryTab === "tickets" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 px-8 py-2.5 bg-white border-b border-[#E2E7F2] shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5F6A88] pointer-events-none" />
                  <input
                    value={ticketSearch}
                    onChange={(e) => setTicketSearch(e.target.value)}
                    placeholder="Search tickets…"
                    className="w-56 pl-8 pr-3 py-[6.5px] rounded-[10px] border text-[12px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] placeholder:text-[#5F6A88]"
                  />
                </div>

                <FilterMultiSelect label="Status" options={STATUS_FILTER_OPTIONS} selected={ticketStatusFilter} onChange={setTicketStatusFilter} />
                <FilterMultiSelect label="Severity" options={SEVERITY_FILTER_OPTIONS} selected={severityFilter} onChange={setSeverityFilter} />
                <FilterMultiSelect label="Assignee" options={assigneeOptions} selected={ticketAssigneeFilter} onChange={setTicketAssigneeFilter} />
                <SortSelect value={ticketSortValue} onChange={handleTicketSortChange} options={TICKET_SORT_OPTIONS} />

                {hasActiveTicketFilters && (
                  <button
                    onClick={clearTicketFilters}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] hover:bg-[#F0F7FF] cursor-pointer shrink-0 transition-colors"
                  >
                    <X size={13} /> Clear filters
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <ViewToggle value={ticketView} onChange={setTicketView} />
                {/* Task 282 (item F) — moved here from the page header, vertically centered
                    with the view toggle. */}
                <button
                  onClick={() => setCreateTicketOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FB914E] text-[#471F02] text-[12.5px] font-medium hover:bg-[#E2762F] hover:text-white transition-colors cursor-pointer shrink-0"
                >
                  <Plus size={15} /> New Ticket
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {ticketView === "board" && (
                <TicketBoardView
                  tickets={filteredTickets}
                  onMove={async (id, status) => { await updateTicket(id, { status }); }}
                  onOpen={(ticket) => router.push(`${basePath}/tickets/${ticket.display_id}`)}
                  attachmentCountById={attachmentCountById}
                />
              )}
              {ticketView === "list" && (
                <TicketListView
                  tickets={filteredTickets}
                  getHref={(ticket) => `${basePath}/tickets/${ticket.display_id}`}
                  onUpdate={updateTicket}
                  onBulkDelete={bulkDeleteTickets}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                  allMembers={allMembers}
                  profilesById={profilesById}
                  attachmentCountById={attachmentCountById}
                  sortKey={ticketSortKey}
                  sortDir={ticketSortDir}
                  onToggleSort={toggleTicketSort}
                  onCreateNew={() => setCreateTicketOpen(true)}
                  hasActiveFilters={hasActiveTicketFilters}
                  onClearFilters={clearTicketFilters}
                />
              )}
              {ticketView === "calendar" && (
                <TicketCalendarView
                  tickets={filteredTickets}
                  onOpen={(ticket) => router.push(`${basePath}/tickets/${ticket.display_id}`)}
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
                projectId={project.project_id ?? project.id}
                basePath={basePath}
                milestones={milestones}
                tasks={tasks}
                currentUserRole={currentUserRole}
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

        {/* ── Notes tab (task 311 — shared with V2 detail) ── */}
        {primaryTab === "notes" && (
          <NotesTab
            projectId={project.id}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            allMembers={allMembers}
          />
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

      {subtaskParent && (
        <CreateTaskModal
          projectId={project.project_id ?? project.id}
          milestones={milestones}
          tasklists={tasklists}
          tasks={tasks}
          allMembers={allMembers}
          defaults={{ status: "open" }}
          parent={subtaskParent}
          onClose={() => setSubtaskParent(null)}
          onCreated={(t) => {
            const parentId = subtaskParent.id;
            // The API also adds the subtask's assignees to the parent — mirror that locally (realtime would catch up anyway).
            setTasks((prev) => {
              const merged = prev.map((p) => (p.id === parentId ? { ...p, assignees: [...new Set([...(p.assignees ?? []), ...(t.assignees ?? [])])] } : p));
              return merged.some((p) => p.id === t.id) ? merged : [...merged, t];
            });
            setExpandRequest((r) => ({ id: parentId, n: (r?.n ?? 0) + 1 }));
            setSubtaskParent(null);
          }}
          onTasklistCreated={addTasklist}
        />
      )}

      {/* Create ticket modal */}
      {createTicketOpen && (
        <CreateTicketModal
          projectId={project.project_id ?? project.id}
          allMembers={allMembers}
          tickets={tickets}
          onClose={() => setCreateTicketOpen(false)}
          onCreated={(i) => { addTicket(i); setCreateTicketOpen(false); }}
        />
      )}
    </>
  );
}

// `CreateTaskModal` extracted to `_create-task-modal.tsx` (task 274), `CreateTicketModal`
// extracted to `_create-ticket-modal.tsx` (task 286) — exported here since both extracted files
// import this type back for their own props.
export type MemberOptionWithRole = { id: string; full_name: string | null; avatar_url: string | null; role: string };
