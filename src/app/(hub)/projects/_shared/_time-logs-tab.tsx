"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { TimePeriodPicker } from "@/app/(hub)/dashboard/timelogs/_time-period-picker";
import { TimeLogsTable } from "@/app/(hub)/dashboard/timelogs/_time-logs-table";
import { TimeLogEntryModal } from "@/app/(hub)/dashboard/timelogs/_time-log-entry-modal";
import { SearchableSelect } from "@/app/(hub)/dashboard/timelogs/_searchable-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  defaultPeriod, periodToRange,
  type PeriodValue, type TimeLogEntry,
} from "@/app/(hub)/dashboard/timelogs/_time-logs-shared";

// Task 276 — Time Logs tab, shared by both the legacy and v2 project-detail routes. Reuses the
// dedicated Time Logs page's table/modal/period-picker (imported directly, not duplicated)
// against the existing `GET /api/v2/time-logs?project_id=` endpoint (no API changes; that route
// already aggregates task-level + issue-level entries for one project). Pre-scoped to `projectId`
// — the project-filter control from the source page is intentionally omitted since this tab's
// scope is already fixed by which project-detail page it's rendered inside.
const VIEW_ALL_ROLES = ["admin", "super_admin", "pm", "hr"];

export function TimeLogsTab({
  projectId, currentUserId, currentUserRole,
}: {
  projectId: string;
  currentUserId: string;
  currentUserRole: string | null;
}) {
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod());
  const [entries, setEntries] = useState<TimeLogEntry[]>([]);
  const [grouped, setGrouped] = useState(currentUserRole ? VIEW_ALL_ROLES.includes(currentUserRole) : false);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [modal, setModal] = useState<"add" | TimeLogEntry | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<TimeLogEntry | null>(null);

  const canAdd = !!currentUserRole && currentUserRole !== "client" && currentUserRole !== "marketing";
  const canFilterByUser = !!currentUserRole && VIEW_ALL_ROLES.includes(currentUserRole);

  const employeeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) {
      if (e.employee_id) seen.set(e.employee_id, e.display_name);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [entries]);

  const filteredEntries = employeeFilter ? entries.filter((e) => e.employee_id === employeeFilter) : entries;

  useEffect(() => {
    const { from, to } = periodToRange(period);
    const params = new URLSearchParams({ from, to, project_id: projectId });
    const ctrl = new AbortController();

    startTransition(async () => {
      try {
        const res = await fetch(`/api/v2/time-logs?${params.toString()}`, { signal: ctrl.signal });
        const data: { entries: TimeLogEntry[]; groupByUser: boolean } = res.ok
          ? await res.json()
          : { entries: [], groupByUser: false };
        setEntries(data.entries);
        setGrouped(data.groupByUser);
        setEmployeeFilter("");
      } catch {
        // aborted (filter changed again) or network error — leave prior entries in place
      }
    });

    return () => ctrl.abort();
  }, [period, projectId]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    const res = await fetch(`/api/v2/time-logs/${target.id}`, { method: "DELETE" });
    if (res.ok) setEntries((prev) => prev.filter((e) => e.id !== target.id));
  }

  function handleSaved(saved: TimeLogEntry) {
    // A newly-added entry might belong to a different project (the modal's own Project field
    // isn't locked to this tab's scope) — only reflect it here if it actually matches.
    if (saved.project_id !== projectId) { setModal(null); return; }
    setEntries((prev) => {
      const exists = prev.some((e) => e.id === saved.id);
      return exists ? prev.map((e) => (e.id === saved.id ? saved : e)) : [saved, ...prev];
    });
    setModal(null);
  }

  return (
    <div className="flex flex-col gap-4 px-8 py-5 overflow-y-auto h-full">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 flex items-center gap-2 flex-wrap min-w-[220px]">
          <TimePeriodPicker value={period} onChange={setPeriod} />
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

        {canAdd && (
          <button
            type="button"
            onClick={() => setModal("add")}
            className="inline-flex items-center gap-1.5 px-3.5 py-[6.5px] rounded-full bg-[#FB914E] text-[#471F02] text-[11px] font-semibold hover:bg-[#E2762F] hover:text-white cursor-pointer transition-colors shrink-0"
          >
            <Plus size={13} /> Add Time Log
          </button>
        )}
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
