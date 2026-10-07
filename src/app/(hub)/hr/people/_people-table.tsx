"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Users } from "lucide-react";
import { toast } from "sonner";
import { formatDays } from "@/lib/hr/format";
import type { AdjustmentRow, AllotmentPeriod, EmployeeRow, LeaveTypeRow } from "@/lib/hr/types";
import { EmptyState } from "../_components/empty-state";
import { Panel } from "../_components/page-shell";
import { PersonAvatar } from "../_components/person-avatar";
import { useHrMutation } from "../_components/use-hr-mutation";
import { btn, cellClass, fieldClass, tableHeadClass } from "../_components/ui";
import { ManagerSelect, type ManagerOption } from "./_manager-select";
import { OpeningUsedModal } from "./_opening-used-modal";

export function PeopleTable({ employees, adminIds, types, currentPeriods, adjustments }: {
  employees: EmployeeRow[];
  /** Employee ids whose account has an admin role — the only people offered as a reporting manager. */
  adminIds: string[];
  types: LeaveTypeRow[];
  currentPeriods: AllotmentPeriod[];
  adjustments: AdjustmentRow[];
}) {
  const router = useRouter();
  const { run } = useHrMutation();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? employees.filter((e) => e.full_name.toLowerCase().includes(q) || (e.department ?? "").toLowerCase().includes(q)) : employees;
  }, [employees, query]);

  const admins = useMemo(() => employees.filter((m) => adminIds.includes(m.id)), [employees, adminIds]);
  // Admins only, but a manager set before this rule stays visible (and selectable) on that row.
  const managerOptionsFor = (emp: EmployeeRow): ManagerOption[] => {
    const list = admins.filter((m) => m.id !== emp.id);
    const kept = emp.manager_id && !list.some((m) => m.id === emp.manager_id) ? employees.find((m) => m.id === emp.manager_id) : undefined;
    return (kept ? [...list, kept] : list).map((m) => ({ id: m.id, name: m.full_name }));
  };

  const usedSummary = (empId: string) =>
    currentPeriods
      .map((p) => {
        const a = adjustments.find((x) => x.employee_id === empId && x.period_id === p.id);
        return a && a.days_used_before > 0 ? `${types.find((t) => t.id === p.leave_type_id)?.name ?? "Leave"} ${formatDays(a.days_used_before, false)}` : null;
      })
      .filter(Boolean)
      .join(" · ");

  async function setManager(emp: EmployeeRow, managerId: string | null) {
    setPendingId(emp.id);
    const res = await run("PATCH", `/api/hr/people/${emp.id}`, { managerId });
    setPendingId(null);
    if (!res.ok) return toast.error(res.error ?? "Couldn't update the reporting manager.");
    toast.success(`${emp.full_name} now reports to ${managerId ? employees.find((e) => e.id === managerId)?.full_name : "no one"}`);
    router.refresh();
  }

  return (
    <>
      <Panel
        title="Employees"
        hint={`${shown.length} of ${employees.length}`}
        action={
          <div className="relative w-56">
            <Search size={14} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5F6A88]" />
            <input aria-label="Search people" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or department" className={`${fieldClass} !py-1.5 !pl-8 !text-[12px]`} />
          </div>
        }
      >
        {shown.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr>
                  <th className={`${tableHeadClass} pl-[18px]`}>Employee</th>
                  <th className={tableHeadClass}>Reporting to</th>
                  <th className={tableHeadClass}>Used before the Hub</th>
                  <th className={`${tableHeadClass} w-36`}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id} className="transition-colors hover:bg-[#F0F7FF]">
                    <td className={`${cellClass} pl-[18px]`}>
                      <div className="flex items-center gap-3">
                        <PersonAvatar id={e.id} name={e.full_name} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[#0B1533]">{e.full_name}</p>
                          <p className="truncate font-mono text-[10.5px] text-[#5F6A88]">{[e.employee_number, e.department].filter(Boolean).join(" · ") || "No department"}</p>
                        </div>
                      </div>
                    </td>
                    <td className={cellClass}>
                      <ManagerSelect
                        label={`Reporting manager for ${e.full_name}`}
                        value={e.manager_id}
                        options={managerOptionsFor(e)}
                        disabled={pendingId === e.id}
                        onChange={(id) => setManager(e, id)}
                      />
                    </td>
                    <td className={`${cellClass} font-mono text-[11px] text-[#5F6A88]`}>{usedSummary(e.id) || "—"}</td>
                    <td className={`${cellClass} text-right`}>
                      <button type="button" className={`${btn.ghost} ${btn.sm} whitespace-nowrap`} onClick={() => setEditing(e)} disabled={!currentPeriods.length}>Edit used days</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Users} title="No one matches that search" hint="Try a different name or department." />
        )}
      </Panel>
      {!currentPeriods.length && <p className="text-[12px] text-[#5F6A88]">Set an allotment for the current period on Leave credits to enter used days.</p>}

      {editing && (
        <OpeningUsedModal
          key={editing.id}
          open
          employee={editing}
          types={types}
          periods={currentPeriods}
          adjustments={adjustments.filter((a) => a.employee_id === editing.id)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </>
  );
}
