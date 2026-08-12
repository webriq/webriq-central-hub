"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Download, Loader2, Plus } from "lucide-react";
import { TimePeriodPicker } from "./_time-period-picker";
import { TimeLogsTable } from "./_time-logs-table";
import { TimeLogEntryModal } from "./_time-log-entry-modal";
import { SearchableSelect } from "./_searchable-select";
import { ConfirmDialog } from "./_confirm-dialog";
import { exportTimeLogsToPdf } from "./_export-pdf";
import {
  defaultPeriod, periodToRange,
  type PeriodValue, type ProjectOption, type TimeLogEntry,
} from "./_time-logs-shared";

// Client shell for the dedicated Time Logs page (task 226) — toolbar (period picker, project
// filter, Export PDF, Add Time Log) + fetch-on-filter-change + the table. `role`/`currentUserId`
// come from the server-component `page.tsx` guard (mirrors `portfolio-tracker/page.tsx`'s
// pattern), so this component never re-derives auth itself.
const VIEW_ALL_ROLES = ["admin", "super_admin", "pm", "hr"];

export function TimeLogsContent({ role, currentUserId }: { role: string | null; currentUserId: string }) {
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod());
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectFilter, setProjectFilter] = useState("");
  const [entries, setEntries] = useState<TimeLogEntry[]>([]);
  const [grouped, setGrouped] = useState(role ? VIEW_ALL_ROLES.includes(role) : false);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [modal, setModal] = useState<"add" | TimeLogEntry | null>(null);
  const [exporting, setExporting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<TimeLogEntry | null>(null);

  const canAdd = !!role && role !== "client" && role !== "marketing";
  // Task 227 — same "view every employee" role group task 226 already established
  // (`time_logs_manager_read`); the User filter is only meaningful for roles that see more than
  // just their own entries.
  const canFilterByUser = !!role && VIEW_ALL_ROLES.includes(role);

  const employeeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) {
      if (e.employee_id) seen.set(e.employee_id, e.display_name);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [entries]);

  const filteredEntries = employeeFilter ? entries.filter((e) => e.employee_id === employeeFilter) : entries;

  useEffect(() => {
    fetch("/api/v2/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ProjectOption[]) => setProjects(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const { from, to } = periodToRange(period);
    const params = new URLSearchParams({ from, to });
    if (projectFilter) params.set("project_id", projectFilter);
    const ctrl = new AbortController();

    // React 19 async transition — `isPending` stays true for the duration of this async function,
    // which keeps every setState call here nested inside a callback rather than directly in the
    // effect body (react-hooks/set-state-in-effect flags synchronous top-level setState in effects).
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v2/time-logs?${params.toString()}`, { signal: ctrl.signal });
        const data: { entries: TimeLogEntry[]; groupByUser: boolean } = res.ok
          ? await res.json()
          : { entries: [], groupByUser: false };
        setEntries(data.entries);
        setGrouped(data.groupByUser);
        setEmployeeFilter(""); // period/project changed — a stale User selection may no longer apply
      } catch {
        // aborted (filter changed again) or network error — leave prior entries in place
      }
    });

    return () => ctrl.abort();
  }, [period, projectFilter]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    // Task 230 — unified, non-nested route (`/api/v2/time-logs/[id]`), not the old task-scoped
    // one, so General Log/Issue-linked entries (which have no task_id) are deletable too.
    const res = await fetch(`/api/v2/time-logs/${target.id}`, { method: "DELETE" });
    if (res.ok) setEntries((prev) => prev.filter((e) => e.id !== target.id));
  }

  function handleSaved(saved: TimeLogEntry) {
    setEntries((prev) => {
      const exists = prev.some((e) => e.id === saved.id);
      return exists ? prev.map((e) => (e.id === saved.id ? saved : e)) : [saved, ...prev];
    });
    setModal(null);
  }

  async function handleExport() {
    const selectedProject = projects.find((p) => p.id === projectFilter);
    setExporting(true);
    try {
      await exportTimeLogsToPdf(filteredEntries, {
        period,
        projectName: selectedProject?.name ?? null,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 py-6.5 px-8">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-heading text-[22px] font-bold text-[#0B1533] tracking-[-0.015em] shrink-0">
          Time Logs
        </h1>

        <div className="flex-1 flex items-center justify-center gap-2 flex-wrap min-w-[280px]">
          <TimePeriodPicker value={period} onChange={setPeriod} />
          <SearchableSelect
            value={projectFilter}
            onChange={setProjectFilter}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="All Projects"
            searchPlaceholder="Search projects…"
            label="Project"
          />
          {canFilterByUser && (
            <SearchableSelect
              value={employeeFilter}
              onChange={setEmployeeFilter}
              options={employeeOptions.map((o) => ({ value: o.id, label: o.name }))}
              placeholder="All Employees"
              searchPlaceholder="Search employees…"
              label="Employee"
            />
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={filteredEntries.length === 0 || exporting}
            className="inline-flex items-center gap-1.5 px-3 py-[6.5px] rounded-full border border-[#E2E7F2] bg-white text-[11px] font-semibold text-[#3A4565] hover:border-[#A8C6F5] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {exporting ? "Exporting…" : "Export PDF"}
          </button>
          {canAdd && (
            <button
              type="button"
              onClick={() => setModal("add")}
              className="inline-flex items-center gap-1.5 px-3.5 py-[6.5px] rounded-full bg-[#FB914E] text-[#471F02] text-[11px] font-semibold hover:bg-[#E2762F] hover:text-white cursor-pointer transition-colors"
            >
              <Plus size={13} /> Add Time Log
            </button>
          )}
        </div>
      </div>

      {isPending ? (
        <div className="flex items-center justify-center py-16 text-[#5F6A88]">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : (
        <TimeLogsTable
          entries={filteredEntries}
          grouped={grouped}
          canAdd={canAdd}
          currentUserId={currentUserId}
          onAdd={() => setModal("add")}
          onEdit={(entry) => setModal(entry)}
          onDelete={(entry) => setDeleteTarget(entry)}
          onInlineSave={handleSaved}
        />
      )}

      {modal && (
        <TimeLogEntryModal
          currentUserId={currentUserId}
          initial={modal === "add" ? undefined : modal}
          onSaved={handleSaved}
          onClose={() => setModal(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete time log entry?"
        body="This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
