"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { AllotmentPeriod, LeaveTypeRow } from "@/lib/hr/types";
import { Field } from "../_components/field";
import { DateField } from "../_components/date-field";
import { Modal } from "../_components/modal";
import { useHrMutation } from "../_components/use-hr-mutation";
import { btn, fieldClass } from "../_components/ui";

export function AllotmentFormModal({ open, types, period, onClose, onSaved }: {
  open: boolean;
  types: LeaveTypeRow[];
  period: AllotmentPeriod | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [typeId, setTypeId] = useState(period?.leave_type_id ?? types[0]?.id ?? "");
  const [start, setStart] = useState(period?.period_start ?? "");
  const [end, setEnd] = useState(period?.period_end ?? "");
  const [unlimited, setUnlimited] = useState(period ? period.days_allotted === null : false);
  const [days, setDays] = useState(period?.days_allotted != null ? String(period.days_allotted) : "");
  const [error, setError] = useState<string | null>(null);
  const { run, busy } = useHrMutation();

  async function save() {
    if (!start || !end) return setError("Choose both a start and an end date.");
    if (!unlimited && (days.trim() === "" || Number.isNaN(Number(days)))) return setError("Enter the number of days, or mark it unlimited.");
    setError(null);
    const body = { leave_type_id: typeId, period_start: start, period_end: end, days_allotted: unlimited ? null : Number(days) };
    const res = period ? await run("PATCH", `/api/hr/leave-allotments/${period.id}`, body) : await run("POST", "/api/hr/leave-allotments", body);
    if (!res.ok) return setError(res.error);
    toast.success(period ? "Allotment updated" : "Allotment saved");
    onSaved();
  }

  return (
    <Modal
      open={open}
      title={period ? "Edit allotment" : "Set allotment"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btn.ghost} onClick={onClose}>Cancel</button>
          <button type="button" className={btn.cta} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save allotment"}</button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Field label="Leave type" htmlFor="a-type">
          <select id="a-type" className={fieldClass} value={typeId} onChange={(e) => setTypeId(e.target.value)} disabled={!!period}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Period starts" htmlFor="a-start"><DateField id="a-start" value={start} onChange={setStart} /></Field>
          <Field label="Period ends" htmlFor="a-end"><DateField id="a-end" min={start || undefined} value={end} onChange={setEnd} /></Field>
        </div>
        <Field label="Days" htmlFor="a-days" hint="Half days count as 0.5, so 4.5 is fine.">
          <input id="a-days" type="number" min={0} step={0.5} inputMode="decimal" className={`${fieldClass} font-mono`} value={days} onChange={(e) => setDays(e.target.value)} disabled={unlimited} placeholder="12" />
        </Field>
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#3A4565]">
          <input type="checkbox" className="size-4 accent-[#007BFF]" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
          Unlimited for this period (no credit limit)
        </label>
        {error && <p role="alert" className="text-[12px] text-[#C0392B]">{error}</p>}
      </form>
    </Modal>
  );
}
