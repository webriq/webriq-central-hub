// Shared date+time helpers for the New Task / New Issue modals (task 338 — extracted from
// `_create-task-modal.tsx` where they were defined inline). Both modals use `DateTimeFieldPicker`,
// whose value shape is a local (not UTC) `"YYYY-MM-DDTHH:mm"` string; these helpers seed and
// split that value without ever round-tripping through a timezone conversion.

export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

// Local "YYYY-MM-DDTHH:mm" for right now.
export function nowDateTimeValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// Due defaults to the given date (or today when none is passed — e.g. Calendar view's
// "add on day" pre-fills one) with the time fixed to 7:00 PM, per task 274's explicit
// "only the time will default to 7:00 PM" instruction.
export function dueDefaultValue(dueDate?: string | null): string {
  const datePart = dueDate || nowDateTimeValue().slice(0, 10);
  return `${datePart}T19:00`;
}

// Split a `DateTimeFieldPicker` value into its date + time halves for a split-column payload.
export function splitDateTimeValue(v: string): { date: string; time: string } {
  const [date, time] = v.split("T");
  return { date: date ?? "", time: time ?? "" };
}
