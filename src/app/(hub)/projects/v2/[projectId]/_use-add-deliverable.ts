"use client";

import { useState } from "react";

// Task 433 — form state, validation and submit for the "Add deliverable" modal. Day inputs are optional but only valid as a pair; when the
// phase has a day range they must sit inside it (the API re-checks everything). Errors are keyed to the field they belong to.
export type FieldError = { field: "name" | "days" | "form"; message: string };

type Options<Row> = {
  endpoint: string;
  target: Record<string, string | number>;
  phaseDayStart: number | null;
  phaseDayEnd: number | null;
  onAdded: (row: Row) => void;
  onDone: () => void;
};

export function useAddDeliverable<Row>({ endpoint, target, phaseDayStart, phaseDayEnd, onAdded, onDone }: Options<Row>) {
  const [name, setName] = useState("");
  const [dayStart, setDayStart] = useState("");
  const [dayEnd, setDayEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<FieldError | null>(null);

  function validate(): FieldError | null {
    if (!name.trim()) return { field: "name", message: "Name the deliverable." };
    if ((dayStart === "") !== (dayEnd === "")) return { field: "days", message: "Enter both days, or leave both blank." };
    if (dayStart === "") return null;
    const start = Number(dayStart);
    const end = Number(dayEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1) return { field: "days", message: "Days must be whole numbers from 1." };
    if (start > end) return { field: "days", message: "The start day can't be after the end day." };
    if (phaseDayStart !== null && phaseDayEnd !== null && (start < phaseDayStart || end > phaseDayEnd)) {
      return { field: "days", message: `Days must fall within Day ${phaseDayStart}–${phaseDayEnd}.` };
    }
    return null;
  }

  async function submit() {
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...target,
          name: name.trim(),
          ...(dayStart !== "" ? { day_start: Number(dayStart), day_end: Number(dayEnd) } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = typeof data?.error === "string" ? data.error : "The deliverable wasn't added. Try again.";
        setError({ field: res.status === 409 ? "name" : "form", message });
        return;
      }
      onAdded(data as Row);
      onDone();
    } catch {
      setError({ field: "form", message: "The deliverable wasn't added. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  return { name, setName, dayStart, setDayStart, dayEnd, setDayEnd, saving, error, submit };
}
