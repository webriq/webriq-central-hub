"use client";

import { useState } from "react";
import { toast } from "sonner";
import { KIND_LABEL, type HolidayKind, type HolidayRow } from "@/lib/hr/types";
import { Field } from "../_components/field";
import { DateField } from "../_components/date-field";
import { Modal } from "../_components/modal";
import { useHrMutation } from "../_components/use-hr-mutation";
import { btn, fieldClass, fieldErrorClass } from "../_components/ui";

/** Add or edit a holiday. Remount per open (key on the row id) so the draft starts fresh. */
export function HolidayFormModal({ open, holiday, defaultYear, onClose, onSaved }: {
  open: boolean;
  holiday: HolidayRow | null;
  defaultYear: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(holiday?.name ?? "");
  const [date, setDate] = useState(holiday?.holiday_date ?? `${defaultYear}-01-01`);
  const [kind, setKind] = useState<HolidayKind>(holiday?.kind ?? "regular");
  const [note, setNote] = useState(holiday?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const { run, busy } = useHrMutation();

  async function save() {
    if (!name.trim()) return setError("Name the holiday so staff recognise it.");
    setError(null);
    const body = { name, holiday_date: date, kind, note: note.trim() || null };
    const res = holiday ? await run("PATCH", `/api/hr/holidays/${holiday.id}`, body) : await run("POST", "/api/hr/holidays", body);
    if (!res.ok) return setError(res.error);
    toast.success(holiday ? "Holiday updated" : "Holiday added");
    onSaved();
  }

  return (
    <Modal
      open={open}
      title={holiday ? "Edit holiday" : "Add holiday"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btn.ghost} onClick={onClose}>Cancel</button>
          <button type="button" className={btn.cta} onClick={save} disabled={busy}>{busy ? "Saving…" : holiday ? "Save holiday" : "Add holiday"}</button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Field label="Holiday name" htmlFor="h-name" error={error && !name.trim() ? error : null}>
          <input id="h-name" className={`${fieldClass} ${error && !name.trim() ? fieldErrorClass : ""}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Independence Day" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="h-date">
            <DateField id="h-date" value={date} onChange={setDate} />
          </Field>
          <Field label="Type" htmlFor="h-kind">
            <select id="h-kind" className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value as HolidayKind)}>
              {(Object.keys(KIND_LABEL) as HolidayKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Note (optional)" htmlFor="h-note" hint="Shown under the holiday name.">
          <input id="h-note" className={fieldClass} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && name.trim() && <p role="alert" className="text-[11px] text-[#C0392B]">{error}</p>}
      </form>
    </Modal>
  );
}
