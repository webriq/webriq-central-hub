"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Info } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { SearchableSelect } from "./_searchable-select";
import { DateFieldPicker } from "./_date-field-picker";
import { NativeTimeInput, DurationInput } from "./_native-time-input";
import { TaskIssuePicker, type TaskIssueValue } from "./_task-issue-picker";
import { TimeLogNotesEditor } from "./_time-log-notes-editor";
import { formatHoursAsHHMM } from "@/lib/timer/format";
import {
  getRecentProjectIds, pushRecentProjectId, toISODate, nowHHmm, combineDateTime, isoToHHmm, parseHHMMToHours,
} from "./_time-logs-shared";
import type { ProjectOption, TimeLogEntry } from "./_time-logs-shared";
import { POPOVER_ROOT_ATTR } from "./_use-popover-position";

// Add/Edit modal for the dedicated Time Logs page (task 226). Task 230 reworked this into a
// guided flow: Add mode hides everything but Project until one is picked (Requirement 3); the
// Task field is now the tabbed Tasks/Issues/General-Log picker (Requirements 5/6); Notes is a
// rich text field (Requirement 7); every required field is validated inline (Requirements 8/9);
// Date/Time labels carry a helper tooltip (Requirement 10); future times are disabled alongside
// the existing future-date guard (Requirement 11); and Edit mode now supports reassigning the
// entry's task/issue/general-log, backed by the unified, non-nested
// `POST /api/v2/time-logs` / `PATCH /api/v2/time-logs/[id]` routes (Requirement 12).
//
// Task 292 — Start Time/End Time switched from the custom Tile-grid `TimeFieldPicker` to native
// `<input type="time">` (`_native-time-input.tsx`); added a Period ⇄ Duration toggle mirroring
// `TaskIssuePicker`'s own General Log toggle, letting a manual entry be logged as elapsed `hh:mm`
// instead of a start/end pair; validation errors now show live per-field (on blur), not only after
// a failed submit; and Add/Save is gated on full validity (`isValid`) rather than "every required
// field has some value" (`requiredFilled`, this file's previous task-230 design — see the removed
// comment this replaces).
//
// Task 348 — the General Log free text is a *Log Title* (stored in `time_logs.log_title`), no
// longer the note. The Notes field now renders for a General Log entry too (previously hidden),
// and `note` is sent independently as optional rich-text notes for every entry kind.

type TimeMode = "period" | "duration";
type TouchedField = "project" | "picker" | "date" | "startTime" | "endTime" | "duration";

function initialPickerValue(initial: TimeLogEntry | undefined): TaskIssueValue | null {
  if (!initial) return null;
  if (initial.entry_kind === "task" && initial.task_id) {
    return { kind: "task", id: initial.task_id, label: initial.task_title, displayId: initial.task_display_id };
  }
  if (initial.entry_kind === "issue" && initial.issue_id) {
    return { kind: "issue", id: initial.issue_id, label: initial.log_title, displayId: initial.issue_display_id };
  }
  // Task 348 — a General Log's free text is its title, stored in `log_title` (not `note`).
  return { kind: "general", text: initial.log_title ?? "" };
}

// An entry with no start_time/end_time was created in Duration mode (task 292) — reopen it the
// same way rather than defaulting back to Period with two empty time fields.
function initialTimeMode(initial: TimeLogEntry | undefined): TimeMode {
  return initial && !initial.start_time && !initial.end_time ? "duration" : "period";
}

function FieldLabel({ children, required, hint }: { children: React.ReactNode; required?: boolean; hint?: string }) {
  return (
    <span className="flex items-center gap-1 mb-1">
      <span className="text-[11px] font-semibold text-[#0B1533]">
        {children}
        {required && <span className="text-[#C0392B]"> *</span>}
      </span>
      {hint && (
        <Tooltip>
          <TooltipTrigger render={
            <button type="button" aria-label={`About ${children}`} className="flex items-center justify-center text-[#5F6A88] hover:text-[#007BFF] cursor-pointer transition-colors">
              <Info size={11} />
            </button>
          } />
          <TooltipContent side="top">{hint}</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[10px] text-[#C0392B] mt-1">{message}</p>;
}

export function TimeLogEntryModal({
  currentUserId, initial, onSaved, onClose,
}: {
  currentUserId: string;
  initial?: TimeLogEntry;
  onSaved: (entry: TimeLogEntry) => void;
  onClose: () => void;
}) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectPublicId, setProjectPublicId] = useState(initial?.project_public_id ?? "");
  const [pickerValue, setPickerValue] = useState<TaskIssueValue | null>(() => initialPickerValue(initial));

  const [timeMode, setTimeMode] = useState<TimeMode>(() => initialTimeMode(initial));
  const [date, setDate] = useState(initial?.date_logged ?? toISODate(new Date()));
  const [startTime, setStartTime] = useState(isoToHHmm(initial?.start_time ?? null));
  const [endTime, setEndTime] = useState(isoToHHmm(initial?.end_time ?? null));
  const [duration, setDuration] = useState(() =>
    initial && initialTimeMode(initial) === "duration" ? formatHoursAsHHMM(initial.hours) : ""
  );
  // Task 348 — `note` is now optional rich-text notes for every entry kind, including General
  // Log (whose title lives in `log_title`), so it seeds from `initial.note` unconditionally.
  const [notesHtml, setNotesHtml] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Task 292 — per-field "has this been interacted with" tracking, so a field's own error shows
  // as soon as the user leaves it (blur), not only after a failed submit attempt. Monotonic (once
  // touched, stays touched) and set via each field's wrapping `<div onBlur>` — `onBlur` bubbles
  // from any focusable descendant, so this needs no changes to the field components themselves,
  // including the portaled popovers (SearchableSelect/TaskIssuePicker/DateFieldPicker), where a
  // click on a portaled option still fires focusout on the way there.
  const [touched, setTouched] = useState<Partial<Record<TouchedField, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  function markTouched(field: TouchedField) {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }

  function shows(field: TouchedField): boolean {
    return !!touched[field] || submitAttempted;
  }

  // Task 294 — the Project/Task-Issue/Date fields each open a `createPortal`-ed popover (tagged
  // `[data-popover-root]`) that lives outside this field's own wrapping `<div>` in the DOM tree.
  // `SearchableSelect`'s dropdown in particular auto-focuses its own search input the instant it
  // opens, which blurs this field's trigger before the user has made a choice or left the field —
  // an unguarded `onBlur` here would mark the field touched (and show its error) on open, not on
  // leave. Skip marking touched when focus is moving into that same field's own popover; the
  // popover components each call an `onClose` prop (wired below) when they actually close, which
  // is the correct "genuinely done with this field" signal instead.
  function guardedBlur(field: TouchedField) {
    return (e: React.FocusEvent<HTMLDivElement>) => {
      const next = e.relatedTarget as Node | null;
      if (next && (e.currentTarget.contains(next) || (next as Element).closest?.(`[${POPOVER_ROOT_ATTR}]`))) return;
      markTouched(field);
    };
  }

  useEffect(() => {
    if (initial) return; // Edit mode's project is fixed — no project-list fetch needed
    fetch("/api/v2/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ProjectOption[]) => setProjects(data))
      .catch(() => {});
  }, [initial]);

  function handleProjectChange(v: string) {
    setProjectPublicId(v);
    setPickerValue(null);
    if (v) pushRecentProjectId(currentUserId, v);
  }

  const isToday = date === toISODate(new Date());
  const nowTime = nowHHmm();

  const errors: { project?: string; picker?: string; date?: string; startTime?: string; endTime?: string; duration?: string } = {};
  if (!initial && !projectPublicId) errors.project = "Project is required.";
  if (!pickerValue) {
    errors.picker = "Select a task or issue, or enter a general log.";
  } else if (pickerValue.kind === "general" && !pickerValue.text.trim()) {
    errors.picker = "A title is required for a General Log entry.";
  }
  if (!date) errors.date = "Date is required.";

  if (timeMode === "period") {
    if (!startTime) errors.startTime = "Start time is required.";
    else if (isToday && startTime > nowTime) errors.startTime = "Time logging is not allowed for future times.";
    if (!endTime) errors.endTime = "End time is required.";
    else if (isToday && endTime > nowTime) errors.endTime = "Time logging is not allowed for future times.";
    if (!errors.startTime && !errors.endTime && date && startTime && endTime) {
      const startIso = combineDateTime(date, startTime);
      const endIso = combineDateTime(date, endTime);
      if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
        errors.endTime = "End time must be after start time.";
      }
    }
  } else {
    const durationHours = parseHHMMToHours(duration);
    if (!duration) errors.duration = "Duration is required.";
    else if (durationHours === null || durationHours <= 0) errors.duration = "Enter a valid duration greater than 00:00.";
    else if (durationHours > 24) errors.duration = "Duration cannot exceed 24 hours.";
  }
  const isValid = Object.keys(errors).length === 0;

  async function handleSave() {
    setSubmitAttempted(true);
    if (!isValid || !pickerValue) return;

    setSaving(true);
    setError(null);

    const startIso = timeMode === "period" ? combineDateTime(date, startTime) : null;
    const endIso = timeMode === "period" ? combineDateTime(date, endTime) : null;
    const durationHours = timeMode === "duration" ? parseHHMMToHours(duration) : null;
    const noteToSend = notesHtml || null;
    const logTitleToSend = pickerValue.kind === "general" ? pickerValue.text.trim() : null;
    const selectedProject = projects.find((p) => p.project_id === projectPublicId);

    const body = {
      project_id: initial ? initial.project_id : selectedProject?.id ?? "",
      task_id: pickerValue.kind === "task" ? pickerValue.id : null,
      issue_id: pickerValue.kind === "issue" ? pickerValue.id : null,
      date_logged: date,
      ...(timeMode === "period" ? { start_time: startIso, end_time: endIso } : { duration_hours: durationHours }),
      note: noteToSend,
      log_title: logTitleToSend,
    };

    const url = initial ? `/api/v2/time-logs/${initial.id}` : "/api/v2/time-logs";
    const res = await fetch(url, {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const saved = await res.json();
      const entryKind = pickerValue.kind;
      const logTitle =
        entryKind === "general" ? pickerValue.text.trim() || "General log" : pickerValue.label;

      onSaved({
        id: initial?.id ?? saved.id,
        task_id: entryKind === "task" ? pickerValue.id : null,
        issue_id: entryKind === "issue" ? pickerValue.id : null,
        entry_kind: entryKind,
        project_id: initial?.project_id ?? selectedProject?.id ?? "",
        project_name: initial?.project_name ?? selectedProject?.name ?? "Unknown project",
        project_public_id: initial?.project_public_id ?? selectedProject?.project_id ?? null,
        task_title: entryKind === "task" ? pickerValue.label : "—",
        task_display_id: entryKind === "task" ? pickerValue.displayId : null,
        issue_display_id: entryKind === "issue" ? pickerValue.displayId : null,
        log_title: logTitle,
        date_logged: saved.date_logged,
        hours: saved.hours,
        note: saved.note,
        source: saved.source ?? initial?.source ?? "manual",
        start_time: saved.start_time ?? startIso,
        end_time: saved.end_time ?? endIso,
        created_at: saved.created_at ?? initial?.created_at ?? new Date().toISOString(),
        display_name: saved.display_name ?? initial?.display_name ?? "You",
        avatar_url: saved.avatar_url ?? initial?.avatar_url ?? null,
        employee_id: initial?.employee_id ?? currentUserId,
        can_edit: true,
      });
    } else {
      const responseBody = await res.json().catch(() => ({}));
      setError(responseBody.error || "Failed to save time log.");
    }
    setSaving(false);
  }

  const showRestOfForm = !!initial || !!projectPublicId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1533]/40 p-4">
      <div className="w-full max-w-md rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDF0F7]">
          <h2 className="font-heading text-[15px] font-semibold text-[#0B1533]">{initial ? "Edit Time Log" : "Add Time Log"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-full text-[#5F6A88] hover:bg-[#F4F6FB] cursor-pointer transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          {initial ? (
            <div>
              <FieldLabel>Project</FieldLabel>
              <div className="rounded-[10px] bg-[#F9FAFD] border border-[#E2E7F2] px-3 py-2 text-[13px] font-medium text-[#0B1533]">
                {initial.project_name}
              </div>
            </div>
          ) : (
            <div onBlur={guardedBlur("project")}>
              <FieldLabel required>Project</FieldLabel>
              <SearchableSelect
                value={projectPublicId}
                onChange={handleProjectChange}
                options={projects.map((p) => ({ value: p.project_id, label: p.name }))}
                placeholder="Select project…"
                searchPlaceholder="Search projects…"
                recentValues={getRecentProjectIds(currentUserId)}
                fullWidth
                size="md"
                onClose={() => markTouched("project")}
              />
              <FieldError message={shows("project") ? errors.project : undefined} />
            </div>
          )}

          {showRestOfForm && (
            <>
              <div onBlur={guardedBlur("picker")}>
                <FieldLabel required>Task/Issue</FieldLabel>
                <TaskIssuePicker
                  projectId={projectPublicId}
                  currentUserId={currentUserId}
                  value={pickerValue}
                  onChange={setPickerValue}
                  onClose={() => markTouched("picker")}
                />
                <FieldError message={shows("picker") ? errors.picker : undefined} />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wide text-[#5F6A88]">
                  {timeMode === "period" ? "Start & End Time" : "Duration"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTimeMode((m) => (m === "period" ? "duration" : "period"));
                    // Task 294 — switching modes swaps which time field(s) are on screen; clear any
                    // stale touched/submit state so the newly-revealed field doesn't immediately show
                    // an error left over from the mode the user just switched away from.
                    setTouched((prev) => ({ ...prev, startTime: false, endTime: false, duration: false }));
                    setSubmitAttempted(false);
                  }}
                  className="text-[11px] font-semibold text-[#0063D6] hover:underline cursor-pointer"
                >
                  {timeMode === "period" ? "Enter duration manually" : "Set start and end time"}
                </button>
              </div>

              <div className="flex gap-2.5">
                <div className="flex-1" onBlur={guardedBlur("date")}>
                  <FieldLabel required hint="Time logging is not allowed for future dates">Date</FieldLabel>
                  <DateFieldPicker value={date} onChange={setDate} onClose={() => markTouched("date")} />
                  <FieldError message={shows("date") ? errors.date : undefined} />
                </div>

                {timeMode === "period" ? (
                  <>
                    <div className="flex-1" onBlur={() => markTouched("startTime")}>
                      <FieldLabel required hint="Time logging is not allowed for future times">Start Time</FieldLabel>
                      <NativeTimeInput value={startTime} onChange={setStartTime} />
                      <FieldError message={shows("startTime") ? errors.startTime : undefined} />
                    </div>
                    <div className="flex-1" onBlur={() => markTouched("endTime")}>
                      <FieldLabel required hint="Time logging is not allowed for future times">End Time</FieldLabel>
                      <NativeTimeInput value={endTime} onChange={setEndTime} />
                      <FieldError message={shows("endTime") ? errors.endTime : undefined} />
                    </div>
                  </>
                ) : (
                  <div className="flex-1" onBlur={() => markTouched("duration")}>
                    <FieldLabel required hint="Enter the total time worked, e.g. 01:30 for 1 hour 30 minutes">Duration</FieldLabel>
                    <DurationInput value={duration} onChange={setDuration} placeholder="00:00" />
                    <FieldError message={shows("duration") ? errors.duration : undefined} />
                  </div>
                )}
              </div>

              {/* Task 348 — Notes shows for every entry kind, including General Log: the
                  General Log free text is a Log Title (the tabbed picker above), separate
                  from these optional rich-text notes. */}
              <div>
                <FieldLabel>Notes (optional)</FieldLabel>
                <TimeLogNotesEditor content={notesHtml} onChange={setNotesHtml} />
              </div>
            </>
          )}

          {error && <p className="text-[11px] text-[#C0392B]">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EDF0F7] bg-[#F4F6FB]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full text-[13px] font-semibold text-[#3A4565] border border-[#E2E7F2] bg-white hover:border-[#A8C6F5] hover:text-[#0B1533] cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !isValid}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#FB914E] text-[#471F02] text-[13px] font-semibold hover:bg-[#E2762F] hover:text-white disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            {initial ? "Save changes" : "Add Time Log"}
          </button>
        </div>
      </div>
    </div>
  );
}
