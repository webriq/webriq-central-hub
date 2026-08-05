"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { Json } from "@/types/database";

// Shared inline add/edit form for the Time Logs tab (task 214; task 215 replaces the single
// decimal-hours input with Date + Start Time + End Time — hours is always computed server-side
// from the period, never trusted from the client). One component for both flows, switched by
// whether `initial` is passed, mirroring `_comment-editor.tsx`'s reuse pattern. Editing a
// timer-sourced entry's period only corrects `start_time`/`end_time`/`hours`/`date_logged` — its
// `timeline` event history is left untouched server-side (task 215 decision).
const inputClass =
  "w-full px-2.5 py-1.5 rounded-[10px] border text-[12px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]";

export type TimeLogEntry = {
  id: string;
  date_logged: string;
  hours: number;
  note: string | null;
  source: "timer" | "manual";
  start_time: string | null;
  end_time: string | null;
  timeline: Json | null;
  created_at: string;
  display_name: string;
  can_edit: boolean;
};

// <input type="time"> wants local "HH:MM" (24h) — null/legacy entries with no recorded period
// come back blank, forcing the user to explicitly pick both times rather than guess-filling one.
function toTimeInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function combineDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

export function TimeLogForm({
  taskId,
  initial,
  onSaved,
  onCancel,
}: {
  taskId: string;
  initial?: TimeLogEntry;
  onSaved: (entry: TimeLogEntry) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(initial?.date_logged ?? new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState(toTimeInputValue(initial?.start_time ?? null));
  const [endTime, setEndTime] = useState(toTimeInputValue(initial?.end_time ?? null));
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!date || !startTime || !endTime) {
      setError("Date, start time, and end time are required.");
      return;
    }
    const startIso = combineDateTime(date, startTime);
    const endIso = combineDateTime(date, endTime);
    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      setError("End time must be after start time.");
      return;
    }
    setSaving(true);
    setError(null);

    const url = initial
      ? `/api/v2/tasks/${taskId}/time-logs/${initial.id}`
      : `/api/v2/tasks/${taskId}/time-logs`;
    const res = await fetch(url, {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date_logged: date, start_time: startIso, end_time: endIso, note: note.trim() || null }),
    });

    if (res.ok) {
      const saved = await res.json();
      onSaved({
        id: initial?.id ?? saved.id,
        date_logged: saved.date_logged,
        hours: saved.hours,
        note: saved.note,
        source: saved.source ?? initial?.source ?? "manual",
        start_time: saved.start_time ?? startIso,
        end_time: saved.end_time ?? endIso,
        timeline: saved.timeline ?? initial?.timeline ?? null,
        created_at: saved.created_at ?? initial?.created_at ?? new Date().toISOString(),
        display_name: saved.display_name ?? initial?.display_name ?? "You",
        can_edit: true,
      });
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Failed to save time log.");
    }
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-[10px] border border-[#E2E7F2] bg-[#F9FAFD] p-3">
      <div className="flex gap-2.5">
        <div className="flex-1">
          <label className="text-[11px] font-semibold text-[#0B1533] mb-1 block">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} bg-white`} />
        </div>
        <div className="flex-1">
          <label className="text-[11px] font-semibold text-[#0B1533] mb-1 block">Start Time</label>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={`${inputClass} bg-white`} />
        </div>
        <div className="flex-1">
          <label className="text-[11px] font-semibold text-[#0B1533] mb-1 block">End Time</label>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={`${inputClass} bg-white`} />
        </div>
      </div>
      <div>
        <label className="text-[11px] font-semibold text-[#0B1533] mb-1 block">Notes (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="What did you work on?"
          className={`${inputClass} bg-white resize-none`}
        />
      </div>
      {error && <p className="text-[11px] text-[#C0392B]">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-full text-[12px] font-medium text-[#5F6A88] hover:text-[#0B1533] cursor-pointer transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#007BFF] text-white text-[12px] font-semibold hover:bg-[#0063D6] disabled:opacity-45 cursor-pointer transition-colors"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : null}
          {initial ? "Save changes" : "Add Time Log"}
        </button>
      </div>
    </div>
  );
}
