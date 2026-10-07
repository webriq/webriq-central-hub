"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, CalendarRange } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDate } from "@/lib/hr/dates";
import { formatDays } from "@/lib/hr/format";
import type { AllotmentPeriod, LeaveTypeRow } from "@/lib/hr/types";
import { LeaveTypeChip } from "../_components/chips";
import { EmptyState } from "../_components/empty-state";
import { Panel } from "../_components/page-shell";
import { useHrMutation } from "../_components/use-hr-mutation";
import { btn, cellClass, iconBtn, monoDate, tableHeadClass } from "../_components/ui";
import { AllotmentFormModal } from "./_allotment-form-modal";

function phase(p: AllotmentPeriod, today: string): { label: string; cls: string } {
  if (today < p.period_start) return { label: "Upcoming", cls: "bg-[#EDF0F7] text-[#5F6A88]" };
  if (today > p.period_end) return { label: "Ended", cls: "bg-[#EDF0F7] text-[#5F6A88]" };
  return { label: "Current", cls: "bg-[#E3F5EA] text-[#177E48]" };
}

export function AllotmentsView({ types, periods, today }: { types: LeaveTypeRow[]; periods: AllotmentPeriod[]; today: string }) {
  const router = useRouter();
  const { run, busy } = useHrMutation();
  const [editing, setEditing] = useState<AllotmentPeriod | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<AllotmentPeriod | null>(null);
  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? "Leave";

  async function confirmDelete() {
    if (!deleting) return;
    const res = await run("DELETE", `/api/hr/leave-allotments/${deleting.id}`);
    if (!res.ok) return toast.error(res.error ?? "Couldn't delete the allotment.");
    toast.success("Allotment deleted");
    setDeleting(null);
    router.refresh();
  }

  return (
    <>
      <Panel
        title="Allotments"
        hint={`${periods.length} ${periods.length === 1 ? "period" : "periods"}`}
        action={<button type="button" className={`${btn.cta} ${btn.sm}`} onClick={() => setAdding(true)}><Plus size={13} aria-hidden /> Set allotment</button>}
      >
        {periods.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse">
              <thead>
                <tr>
                  <th className={`${tableHeadClass} pl-[18px]`}>Leave type</th>
                  <th className={tableHeadClass}>Period</th>
                  <th className={tableHeadClass}>Days</th>
                  <th className={tableHeadClass}>Status</th>
                  <th className={`${tableHeadClass} w-24`}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => {
                  const ph = phase(p, today);
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-[#F0F7FF]">
                      <td className={`${cellClass} pl-[18px]`}><LeaveTypeChip name={typeName(p.leave_type_id)} /></td>
                      <td className={`${cellClass} ${monoDate}`}>{formatDate(p.period_start)} → {formatDate(p.period_end)}</td>
                      <td className={`${cellClass} ${monoDate}`}>{formatDays(p.days_allotted)}</td>
                      <td className={cellClass}><span className={`rounded-[5px] px-2 py-[3px] text-[10px] font-bold ${ph.cls}`}>{ph.label}</span></td>
                      <td className={`${cellClass} text-right`}>
                        <button type="button" className={iconBtn} aria-label={`Edit ${typeName(p.leave_type_id)} allotment`} onClick={() => setEditing(p)}><Pencil size={14} /></button>
                        <button type="button" className={iconBtn} aria-label={`Delete ${typeName(p.leave_type_id)} allotment`} onClick={() => setDeleting(p)}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={CalendarRange} title="No allotments yet" hint="Pick a leave type and a date range to give everyone their days. Credits appear on each person's leave page right away." />
        )}
      </Panel>

      {(adding || editing) && (
        <AllotmentFormModal
          key={editing?.id ?? "new"}
          open
          types={types}
          period={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); router.refresh(); }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        title="Delete this allotment?"
        body="People lose these days from their credits for that range, and any opening-used entries tied to it are removed. Approved leave isn't changed."
        confirmLabel="Delete allotment"
        confirmDisabled={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
