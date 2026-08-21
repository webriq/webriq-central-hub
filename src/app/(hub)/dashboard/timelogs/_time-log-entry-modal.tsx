"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Info } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { SearchableSelect } from "./_searchable-select";
import { DateFieldPicker } from "./_date-field-picker";
import { TimeFieldPicker } from "./_time-field-picker";
import { TaskIssuePicker, type TaskIssueValue } from "./_task-issue-picker";
import { TimeLogNotesEditor } from "./_time-log-notes-editor";
import { getRecentProjectIds, pushRecentProjectId, toISODate, nowHHmm, combineDateTime, isoToHHmm } from "./_time-logs-shared";
import type { ProjectOption, TimeLogEntry } from "./_time-logs-shared";

// Add/Edit modal for the dedicated Time Logs page (task 226). Task 230 reworks this into a
// guided flow: Add mode hides everything but Project until one is picked (Requirement 3); the
// Task field is now the tabbed Tasks/Issues/General-Log picker (Requirements 5/6); Notes is a
// rich text field (Requirement 7); every required field is validated inline (Requirements 8/9);
// Date/Time labels carry a helper tooltip (Requirement 10); future times are disabled alongside
// the existing future-date guard (Requirement 11); and Edit mode now supports reassigning the
// entry's task/issue/general-log, backed by the new unified, non-nested
// `POST /api/v2/time-logs` / `PATCH /api/v2/time-logs/[id]` routes (Requirement 12) — Project
// itself stays read-only in Edit mode (task doc Assumption 7's read of the user's request).
function initialPickerValue(initial: TimeLogEntry | undefined): TaskIssueValue | null {
  if (!initial) return null;
  if (initial.entry_kind === "task" && initial.task_id) {
    return { kind: "task", id: initial.task_id, label: initial.task_title, displayId: initial.task_display_id };
  }
  if (initial.entry_kind === "issue" && initial.issue_id) {
    return { kind: "issue", id: initial.issue_id, label: initial.log_title, displayId: initial.issue_display_id };
  }
  return { kind: "general", text: initial.note ?? "" };
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

  const [date, setDate] = useState(initial?.date_logged ?? toISODate(new Date()));
  const [startTime, setStartTime] = useState(isoToHHmm(initial?.start_time ?? null));
  const [endTime, setEndTime] = useState(isoToHHmm(initial?.end_time ?? null));
  const [notesHtml, setNotesHtml] = useState(initial && initial.entry_kind !== "general" ? initial.note ?? "" : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Requirement 9 disables Add/Save until every required field has *some* value (`requiredFilled`
  // below) — deliberately not full validity: a semantic problem like "end time before start time"
  // only gets flagged once the user actually tries to save (`submitAttempted`), not the instant
  // they've picked a Start/End combination that happens to be invalid mid-edit. Showing that error
  // live, before any save attempt, read as the form complaining prematurely.
  const [submitAttempted, setSubmitAttempted] = useState(false);

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
  const maxTime = isToday ? nowHHmm() : undefined;

  const requiredFilled =
    (!!initial || !!projectPublicId) &&
    !!pickerValue &&
    (pickerValue.kind !== "general" || !!pickerValue.text.trim()) &&
    !!date && !!startTime && !!endTime;

  const errors: { project?: string; picker?: string; date?: string; startTime?: string; endTime?: string } = {};
  if (!initial && !projectPublicId) errors.project = "Project is required.";
  if (!pickerValue) {
    errors.picker = "Select a task or issue, or enter a general log.";
  } else if (pickerValue.kind === "general" && !pickerValue.text.trim()) {
    errors.picker = "A description is required for a General Log entry.";
  }
  if (!date) errors.date = "Date is required.";
  if (!startTime) errors.startTime = "Start time is required.";
  if (!endTime) errors.endTime = "End time is required.";
  if (date && startTime && endTime) {
    const startIso = combineDateTime(date, startTime);
    const endIso = combineDateTime(date, endTime);
    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      errors.endTime = "End time must be after start time.";
    }
  }
  const isValid = Object.keys(errors).length === 0;
  const showErrors = submitAttempted;

  async function handleSave() {
    setSubmitAttempted(true);
    if (!isValid || !pickerValue) return;

    setSaving(true);
    setError(null);

    const startIso = combineDateTime(date, startTime);
    const endIso = combineDateTime(date, endTime);
    const noteToSend = pickerValue.kind === "general" ? pickerValue.text.trim() : notesHtml || null;
    const selectedProject = projects.find((p) => p.project_id === projectPublicId);

    const body = {
      project_id: initial ? initial.project_id : selectedProject?.id ?? "",
      task_id: pickerValue.kind === "task" ? pickerValue.id : null,
      issue_id: pickerValue.kind === "issue" ? pickerValue.id : null,
      date_logged: date,
      start_time: startIso,
      end_time: endIso,
      note: noteToSend,
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
      <div className="w-full max-w-[420px] rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[#0B1533]">{initial ? "Edit Time Log" : "Add Time Log"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-full text-[#5F6A88] hover:bg-[#F4F6FB] cursor-pointer transition-colors">
            <X size={16} />
          </button>
        </div>

        {initial ? (
          <div>
            <FieldLabel>Project</FieldLabel>
            <div className="rounded-[10px] bg-[#F9FAFD] border border-[#E2E7F2] px-2.5 py-1.5 text-[12px] font-medium text-[#0B1533]">
              {initial.project_name}
            </div>
          </div>
        ) : (
          <div>
            <FieldLabel required>Project</FieldLabel>
            <SearchableSelect
              value={projectPublicId}
              onChange={handleProjectChange}
              options={projects.map((p) => ({ value: p.project_id, label: p.name }))}
              placeholder="Select project…"
              searchPlaceholder="Search projects…"
              recentValues={getRecentProjectIds(currentUserId)}
              fullWidth
            />
            <FieldError message={showErrors ? errors.project : undefined} />
          </div>
        )}

        {showRestOfForm && (
          <>
            <div>
              <FieldLabel required>Task/Issue</FieldLabel>
              <TaskIssuePicker
                projectId={projectPublicId}
                currentUserId={currentUserId}
                value={pickerValue}
                onChange={setPickerValue}
              />
              <FieldError message={showErrors ? errors.picker : undefined} />
            </div>

            <div className="flex gap-2.5">
              <div className="flex-1">
                <FieldLabel required hint="Time logging is not allowed for future dates">Date</FieldLabel>
                <DateFieldPicker value={date} onChange={setDate} />
                <FieldError message={showErrors ? errors.date : undefined} />
              </div>
              <div className="flex-1">
                <FieldLabel required hint="Time logging is not allowed for future times">Start Time</FieldLabel>
                <TimeFieldPicker value={startTime} onChange={setStartTime} maxTime={maxTime} />
                <FieldError message={showErrors ? errors.startTime : undefined} />
              </div>
              <div className="flex-1">
                <FieldLabel required hint="Time logging is not allowed for future times">End Time</FieldLabel>
                <TimeFieldPicker value={endTime} onChange={setEndTime} maxTime={maxTime} />
                <FieldError message={showErrors ? errors.endTime : undefined} />
              </div>
            </div>

            {pickerValue?.kind !== "general" && (
              <div>
                <FieldLabel>Notes (optional)</FieldLabel>
                <TimeLogNotesEditor content={notesHtml} onChange={setNotesHtml} />
              </div>
            )}
          </>
        )}

        {error && <p className="text-[11px] text-[#C0392B]">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-full text-[12px] font-medium text-[#5F6A88] hover:text-[#0B1533] cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !requiredFilled}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#FB914E] text-[#471F02] text-[12px] font-semibold hover:bg-[#E2762F] hover:text-white disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            {initial ? "Save changes" : "Add Time Log"}
          </button>
        </div>
      </div>
    </div>
  );
}
