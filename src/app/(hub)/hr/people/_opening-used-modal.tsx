"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatDate } from "@/lib/hr/dates";
import type { AdjustmentRow, AllotmentPeriod, EmployeeRow, LeaveTypeRow } from "@/lib/hr/types";
import { Field } from "../_components/field";
import { Modal } from "../_components/modal";
import { useHrMutation } from "../_components/use-hr-mutation";
import { btn, fieldClass } from "../_components/ui";

/** Days a person had already used (e.g. in Zoho People) before the current period began tracking here. */
export function OpeningUsedModal({ open, employee, types, periods, adjustments, onClose, onSaved }: {
  open: boolean;
  employee: EmployeeRow;
  types: LeaveTypeRow[];
  periods: AllotmentPeriod[];
  adjustments: AdjustmentRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(periods.map((p) => [p.id, String(adjustments.find((a) => a.period_id === p.id)?.days_used_before ?? 0)]))
  );
  const [error, setError] = useState<string | null>(null);
  const { run, busy } = useHrMutation();

  async function save() {
    for (const p of periods) {
      const n = Number(values[p.id]);
      if (Number.isNaN(n) || n < 0) return setError("Enter 0 or more days for every leave type.");
    }
    setError(null);
    for (const p of periods) {
      const res = await run("PUT", "/api/hr/leave-adjustments", { employeeId: employee.id, periodId: p.id, daysUsedBefore: Number(values[p.id]) });
      if (!res.ok) return setError(res.error);
    }
    toast.success(`Saved used days for ${employee.full_name}`);
    onSaved();
  }

  return (
    <Modal
      open={open}
      title={`Used days · ${employee.full_name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btn.ghost} onClick={onClose}>Cancel</button>
          <button type="button" className={btn.blue} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save used days"}</button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <p className="text-[12px] text-[#5F6A88]">Days already taken this period outside the Hub. They count toward the credits shown on {employee.full_name.split(" ")[0]}&rsquo;s leave page.</p>
        {periods.map((p) => (
          <Field key={p.id} label={types.find((t) => t.id === p.leave_type_id)?.name ?? "Leave"} htmlFor={`u-${p.id}`} hint={`${formatDate(p.period_start)} → ${formatDate(p.period_end)}`}>
            <input id={`u-${p.id}`} type="number" min={0} step={0.5} inputMode="decimal" className={`${fieldClass} font-mono`} value={values[p.id]} onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))} />
          </Field>
        ))}
        {error && <p role="alert" className="text-[12px] text-[#C0392B]">{error}</p>}
      </form>
    </Modal>
  );
}
