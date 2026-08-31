"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Milestone, type Tasklist, type Task, type TaskStatus, type TaskPriority } from "@/app/(hub)/projects-old/_pm-shared";
import { CollapsibleSection } from "./_collapsible-section";
import { TaskDescriptionEditor } from "./_task-description-editor";
import { TaskAttachmentPicker } from "./_task-attachment-picker";
import { useUploadQueue, UploadQueuePanel, uploadViaSignedUrl } from "./_attachment-dropzone";
import { extensionInfoFor } from "@/config/attachment-types";
import { SearchableSelect } from "./_searchable-select";
import { DateTimeFieldPicker } from "./_datetime-field-picker";
import { nowDateTimeValue, dueDefaultValue, splitDateTimeValue } from "./_datetime-helpers";
import { STATUS_OPTS, PRIORITY_OPTS, type TaskDefaults, type MemberOptionWithRole } from "./_project-detail";

// New Task modal (task 274) — extracted out of `_project-detail.tsx` (which was 1376 lines,
// past this repo's file-length guideline) as part of a structural redesign: wider dialog,
// Description/Attachments/Task Information as independently collapsible sections
// (`CollapsibleSection` — a flat, borderless/paddingless accordion matching Zoho Projects' New
// Task layout, deliberately not the boxed `AccordionCard` used on Task/Issue Detail; see that
// file's own doc comment), Milestone hidden by default behind a checkbox and moved full-width
// below Attachments (with Tasklist full-width below that), Milestone/Tasklist/Assignee made
// searchable, and Start/Due each replaced by one combined `DateTimeFieldPicker` instead of a
// plain date input. See task doc `_docs/task/274-...md` for the full design rationale (two
// existing components — the Time Logs Add-Time-Log dialog's calendar/time-tile popovers and the
// New Project wizard's `_date-time-picker.tsx` — were synthesized into `DateTimeFieldPicker`
// rather than designed from scratch).
//
// Follow-up fix (same task, post-review): the scrollable content div below was missing
// `min-h-0`. Without it, a flex child's default `min-height: auto` refuses to shrink below its
// own content's intrinsic height, so once the three collapsible sections plus Notes pushed the
// content taller than the modal's `max-h-[90vh]`, the *div* never actually overflowed (it just
// grew past its container) and never showed a scrollbar — it was the *outer* card's
// `overflow-hidden` silently hard-clipping everything past ~90vh instead, making Assignee/Notes
// completely unreachable through normal scrolling. `min-h-0` lets the flex child shrink to the
// space actually available, which is what makes `overflow-y-auto` engage at all.

const inputClass ="w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]";
const errorInputClass = "w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#C0392B] bg-white text-[#3A4565] shadow-[0_0_0_3px_rgba(192,57,43,0.08)]";
const labelClass = "text-[11px] font-semibold text-[#0B1533]";

// Task 286 — field-level errors shown as red border + red text below the field, matching the
// New Project form's `Field` component pattern (`projects/v2/new/_content.tsx`).
type TaskFieldErrors = { title?: string; newTasklistName?: string };

export function CreateTaskModal({
  projectId,
  milestones,
  tasklists,
  tasks,
  allMembers,
  defaults,
  defaultTitle,
  defaultDescription,
  onClose,
  onCreated,
  onTasklistCreated,
}: {
  projectId: string;
  milestones: Milestone[];
  tasklists: Tasklist[];
  tasks: Task[];
  allMembers: MemberOptionWithRole[];
  defaults: TaskDefaults;
  // Task 333 — seed Title/Description when the modal is opened from outside a project page
  // (e.g. "Create Task" on a ticket thread message). Optional; blank for the normal flow.
  defaultTitle?: string;
  defaultDescription?: string;
  onClose: () => void;
  onCreated: (t: Task) => void;
  onTasklistCreated: (tl: Tasklist) => void;
}) {
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [description, setDescription] = useState(defaultDescription ?? "");
  const [status, setStatus] = useState<TaskStatus>(defaults.status ?? "open");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [assignMilestone, setAssignMilestone] = useState<boolean>(!!defaults.milestone_id);
  const [milestoneId, setMilestoneId] = useState<string>(defaults.milestone_id ?? "");
  const [startValue, setStartValue] = useState<string>(() => nowDateTimeValue());
  const [dueValue, setDueValue] = useState<string>(() => dueDefaultValue(defaults.due_date));
  const [tasklistId, setTasklistId] = useState<string>(() => tasklists.find((tl) => tl.is_default)?.id ?? "");
  const [creatingTasklist, setCreatingTasklist] = useState(false);
  const [newTasklistName, setNewTasklistName] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<TaskFieldErrors>({});
  // Post-creation upload phase (task 273 follow-up) — the task must exist before its attachments
  // endpoint accepts uploads, so real per-file progress can only start once `createdTask` is set.
  // `taskIdRef` (not the `createdTask` state) is what the upload closure reads: `useUploadQueue`'s
  // `enqueue` is called synchronously right after `setCreatedTask`, in the same tick, before that
  // state update has re-rendered — a closure over the state would still see the pre-update `null`.
  const [createdTask, setCreatedTask] = useState<Task | null>(null);
  const taskIdRef = useRef<string | null>(null);
  const uploadQueue = useUploadQueue((file, onProgress) => {
    const base = `/api/v2/projects/${projectId}/tasks/${taskIdRef.current}/attachments`;
    return uploadViaSignedUrl({
      signUrl: `${base}/sign`,
      registerUrl: base,
      file,
      mime: extensionInfoFor(file.name)?.mime ?? "application/octet-stream",
      onProgress,
    }).then(() => undefined);
  });
  const uploading = createdTask !== null;
  const allSettled = uploadQueue.items.length > 0 && uploadQueue.items.every((it) => it.status !== "uploading");
  const hasFailures = uploadQueue.items.some((it) => it.status === "error");

  // Auto-advance once every attachment has settled successfully — mirrors the pre-273 behavior of
  // calling onCreated() immediately after the upload loop, just now with visible progress in
  // between. A failure pauses here instead (see the "Done" button below) so the user can see
  // which file failed and retry before leaving.
  useEffect(() => {
    if (uploading && allSettled && !hasFailures) onCreated(createdTask!);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCreated is a stable callback from the parent; only fire once when the queue actually settles
  }, [uploading, allSettled, hasFailures]);

  const developers = allMembers.filter((m) => m.role === "developer");

  function toggleAssignMilestone(checked: boolean) {
    setAssignMilestone(checked);
    if (!checked) setMilestoneId("");
  }

  function validate(): TaskFieldErrors {
    const errs: TaskFieldErrors = {};
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      errs.title = "Title is required";
    } else {
      const dupe = tasks.some(
        (t) => (t.tasklist_id ?? "") === (tasklistId || "") && t.title.trim().toLowerCase() === trimmedTitle.toLowerCase()
      );
      if (dupe) errs.title = "A task with this title already exists in this task list.";
    }
    if (creatingTasklist) {
      const trimmedName = newTasklistName.trim();
      if (!trimmedName) {
        errs.newTasklistName = "Task list name is required.";
      } else if (tasklists.some((tl) => tl.name.trim().toLowerCase() === trimmedName.toLowerCase())) {
        errs.newTasklistName = "A task list with this name already exists.";
      }
    }
    return errs;
  }

  async function submit() {
    const errs = validate();
    const { date: startDate, time: startTime } = splitDateTimeValue(startValue);
    const { date: dueDate, time: dueTime } = splitDateTimeValue(dueValue);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      toast.error("Please fix the errors below before submitting.");
      return;
    }
    setFieldErrors({});
    // Defensive fallback — both pickers always default to a populated value and expose no way to
    // clear back to empty, so this can't currently trigger through normal UI use; kept as the
    // pre-existing generic bottom-of-form error rather than a field-level one (see task 286 doc).
    if (!startDate) { setError("Start date is required"); return; }
    if (!dueDate) { setError("Due date is required"); return; }
    setSaving(true);
    setError(null);
    const toastId = toast.loading("Creating task…");

    let finalTasklistId = tasklistId;
    if (creatingTasklist && newTasklistName.trim()) {
      const tlRes = await fetch(`/api/v2/projects/${projectId}/tasklists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTasklistName.trim() }),
      });
      if (!tlRes.ok) {
        const body = await tlRes.json().catch(() => ({}));
        const message = body.error || "Failed to create task list";
        setError(message);
        toast.error(message, { id: toastId });
        setSaving(false);
        return;
      }
      const newTasklist: Tasklist = await tlRes.json();
      onTasklistCreated(newTasklist);
      finalTasklistId = newTasklist.id;
    }

    const res = await fetch(`/api/v2/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        milestone_id: milestoneId || undefined,
        tasklist_id: finalTasklistId || undefined,
        start_date: startDate,
        due_date: dueDate,
        start_time: startTime,
        due_time: dueTime,
        notes: notes.trim() || undefined,
        assignees: assigneeId ? [assigneeId] : undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = body.error || "Failed to create task";
      setError(message);
      toast.error(message, { id: toastId });
      setSaving(false);
      return;
    }
    const task: Task = await res.json();
    setSaving(false);
    toast.success("Task created", { id: toastId });

    if (attachmentFiles.length > 0) {
      taskIdRef.current = task.id;
      setCreatedTask(task);
      uploadQueue.enqueue(attachmentFiles);
    } else {
      onCreated(task);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1533]/40 p-4" onClick={uploading ? undefined : onClose}>
      <div
        className="w-full max-w-2xl rounded-[14px] bg-white shadow-xl border border-[#E2E7F2] overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDF0F7] shrink-0">
          <h2 className="text-[15px] font-semibold text-[#0B1533]">New Task</h2>
          {!uploading && (
            <button onClick={onClose} className="p-1 rounded-md text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#F4F6FB] cursor-pointer transition-colors">
              <X size={16} />
            </button>
          )}
        </div>
        {uploading ? (
          <>
            <div className="p-5 flex flex-col gap-3 overflow-y-auto min-h-0">
              <p className="text-[13px] text-[#3A4565]">
                {!allSettled
                  ? "Task created — uploading attachments…"
                  : hasFailures
                    ? "Task created. Some attachments failed to upload — retry or continue without them."
                    : "Task created — all attachments uploaded."}
              </p>
              <UploadQueuePanel items={uploadQueue.items} onRetry={uploadQueue.retry} onDismiss={uploadQueue.dismiss} />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EDF0F7] bg-[#F4F6FB] shrink-0">
              <button
                onClick={() => onCreated(createdTask!)}
                disabled={!allSettled}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#007BFF] text-white text-[13px] font-medium hover:bg-[#0063D6] disabled:opacity-45 cursor-pointer transition-colors"
              >
                {!allSettled && <Loader2 size={14} className="animate-spin" />} {allSettled ? "Done" : "Uploading…"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="p-5 flex flex-col gap-4 overflow-y-auto min-h-0">
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>Title</span>
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.title;
                      return next;
                    });
                  }}
                  autoFocus
                  className={fieldErrors.title ? errorInputClass : inputClass}
                  placeholder="What needs to be done?"
                />
                {fieldErrors.title && <span className="text-xs text-[#C0392B]">{fieldErrors.title}</span>}
              </label>

              <CollapsibleSection title="Description" defaultOpen>
                <TaskDescriptionEditor projectId={projectId} value={description} onChange={setDescription} />
              </CollapsibleSection>

              <CollapsibleSection title="Attachments" defaultOpen={false}>
                <TaskAttachmentPicker files={attachmentFiles} onFilesChange={setAttachmentFiles} />
              </CollapsibleSection>

              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-[12px] font-medium text-[#3A4565] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={assignMilestone}
                    onChange={(e) => toggleAssignMilestone(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-[#007BFF] cursor-pointer"
                  />
                  Assign to a specific milestone
                </label>
                {assignMilestone && (
                  <SearchableSelect
                    value={milestoneId}
                    onChange={setMilestoneId}
                    options={milestones.map((m) => ({ value: m.id, label: m.name }))}
                    placeholder="Select milestone…"
                    searchPlaceholder="Search milestones…"
                  />
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className={labelClass}>Task list</span>
                {creatingTasklist ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <input
                        value={newTasklistName}
                        onChange={(e) => {
                          setNewTasklistName(e.target.value);
                          setFieldErrors((prev) => {
                            const next = { ...prev };
                            delete next.newTasklistName;
                            return next;
                          });
                        }}
                        autoFocus
                        placeholder="New task list name"
                        className={fieldErrors.newTasklistName ? errorInputClass : inputClass}
                      />
                      <button
                        type="button"
                        onClick={() => { setCreatingTasklist(false); setNewTasklistName(""); setFieldErrors((prev) => { const next = { ...prev }; delete next.newTasklistName; return next; }); }}
                        aria-label="Cancel new task list"
                        className="p-2 rounded-[10px] text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#F4F6FB] cursor-pointer transition-colors shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {fieldErrors.newTasklistName && <span className="text-xs text-[#C0392B]">{fieldErrors.newTasklistName}</span>}
                  </div>
                ) : (
                  <SearchableSelect
                    value={tasklistId}
                    onChange={setTasklistId}
                    options={tasklists.map((tl) => ({ value: tl.id, label: tl.name }))}
                    placeholder="No task list"
                    searchPlaceholder="Search task lists…"
                    footerAction={{ label: "+ Create new list…", onClick: () => setCreatingTasklist(true) }}
                  />
                )}
              </div>

              <CollapsibleSection title="Task Information" defaultOpen>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className={labelClass}>Status</span>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as TaskStatus)}
                      className={cn(inputClass, "bg-white capitalize cursor-pointer")}
                    >
                      {STATUS_OPTS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className={labelClass}>Priority</span>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as TaskPriority)}
                      className={cn(inputClass, "bg-white capitalize cursor-pointer")}
                    >
                      {PRIORITY_OPTS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <span className={labelClass}>Start date &amp; time</span>
                    <DateTimeFieldPicker value={startValue} onChange={setStartValue} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className={labelClass}>Due date &amp; time</span>
                    <DateTimeFieldPicker value={dueValue} onChange={setDueValue} />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className={labelClass}>Assignee</span>
                  <SearchableSelect
                    value={assigneeId}
                    onChange={setAssigneeId}
                    options={developers.map((m) => ({ value: m.id, label: m.full_name ?? "Unknown" }))}
                    placeholder="Unassigned"
                    searchPlaceholder="Search developers…"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className={labelClass}>Notes (optional)</span>
                  <TaskDescriptionEditor projectId={projectId} value={notes} onChange={setNotes} />
                </div>
              </CollapsibleSection>

              {error && <p className="text-[12px] text-[#C0392B]">{error}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EDF0F7] bg-[#F4F6FB] shrink-0">
              <button onClick={onClose} className="px-4 py-2 rounded-full text-[13px] text-[#3A4565] bg-white border border-[#E2E7F2] hover:border-[#A8C6F5] cursor-pointer transition-colors">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#007BFF] text-white text-[13px] font-medium hover:bg-[#0063D6] disabled:opacity-45 cursor-pointer transition-colors"
              >
                {saving && <Loader2 size={14} className="animate-spin" />} Create
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
