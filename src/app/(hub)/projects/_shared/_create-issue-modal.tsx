"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Issue, type IssueSeverity, SEVERITY_STYLE } from "@/app/(hub)/projects-old/_pm-shared";
import { CollapsibleSection } from "./_collapsible-section";
import { TaskAttachmentPicker } from "./_task-attachment-picker";
import { TaskDescriptionEditor } from "./_task-description-editor";
import { useUploadQueue, UploadQueuePanel, uploadViaSignedUrl } from "./_attachment-dropzone";
import { extensionInfoFor } from "@/config/attachment-types";
import { SearchableSelect } from "./_searchable-select";
import { DateTimeFieldPicker } from "./_datetime-field-picker";
import { dueDefaultValue, splitDateTimeValue } from "./_datetime-helpers";
import { STATUS_OPTS, SEVERITY_OPTS, type MemberOptionWithRole } from "./_project-detail";

// New Issue modal (task 286) — extracted out of `_project-detail.tsx` to match task 274's
// New Task modal treatment: wider dialog, fields regrouped into collapsible sections, Assignee
// made searchable. Title required/duplicate validation (project-wide — issues have no
// tasklist-style grouping to scope by, unlike tasks) with inline red-border/red-text field
// errors, and a sonner toast on submit.
//
// Task 338 brought the three lagging fields up to the New Task modal's treatment: Description
// and a new optional Notes field are now `TaskDescriptionEditor` rich-text (pointed at the
// issues image-upload endpoint via its `uploadUrl` prop), and Due is the combined
// `DateTimeFieldPicker` (always-on, defaults 7:00 PM today) split into `due_date` + `due_time`
// at submit. The `issues.due_time` / `issues.notes` columns landed in migration 128.

const inputClass = "w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]";
const errorInputClass = "w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#C0392B] bg-white text-[#3A4565] shadow-[0_0_0_3px_rgba(192,57,43,0.08)]";
const labelClass = "text-[11px] font-semibold text-[#0B1533]";

type IssueFieldErrors = { title?: string };

export function CreateIssueModal({
  projectId,
  allMembers,
  issues,
  defaultTitle,
  defaultDescription,
  onClose,
  onCreated,
}: {
  projectId: string;
  allMembers: MemberOptionWithRole[];
  issues: Issue[];
  // Task 333 — seed Title/Description when opened from outside a project page (e.g. "File an
  // Issue" on a ticket thread message). Optional; blank for the normal flow.
  defaultTitle?: string;
  defaultDescription?: string;
  onClose: () => void;
  onCreated: (i: Issue) => void;
}) {
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [description, setDescription] = useState(defaultDescription ?? "");
  const [status, setStatus] = useState<string>("open");
  const [severity, setSeverity] = useState<IssueSeverity>("None");
  const [assigneeId, setAssigneeId] = useState<string>("");
  // Combined date+time, `"YYYY-MM-DDTHH:mm"` (local) — same shape as the New Task modal's Due
  // field. Always populated (defaults to 7:00 PM today); split into `due_date` + `due_time`
  // at submit. Task 338.
  const [dueValue, setDueValue] = useState<string>(() => dueDefaultValue());
  const [notes, setNotes] = useState<string>("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<IssueFieldErrors>({});
  // Post-creation upload phase (task 273 follow-up) — see CreateTaskModal's identical pattern for
  // why `issueIdRef` (not the `createdIssue` state) is what the upload closure reads.
  const [createdIssue, setCreatedIssue] = useState<Issue | null>(null);
  const issueIdRef = useRef<string | null>(null);
  const uploadQueue = useUploadQueue((file, onProgress) => {
    const base = `/api/v2/projects/${projectId}/issues/${issueIdRef.current}/attachments`;
    return uploadViaSignedUrl({
      signUrl: `${base}/sign`,
      registerUrl: base,
      file,
      mime: extensionInfoFor(file.name)?.mime ?? "application/octet-stream",
      onProgress,
    }).then(() => undefined);
  });
  const uploading = createdIssue !== null;
  const allSettled = uploadQueue.items.length > 0 && uploadQueue.items.every((it) => it.status !== "uploading");
  const hasFailures = uploadQueue.items.some((it) => it.status === "error");

  useEffect(() => {
    if (uploading && allSettled && !hasFailures) onCreated(createdIssue!);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCreated is a stable callback from the parent; only fire once when the queue actually settles
  }, [uploading, allSettled, hasFailures]);

  function validate(): IssueFieldErrors {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return { title: "Title is required" };
    const dupe = issues.some((i) => i.title.trim().toLowerCase() === trimmedTitle.toLowerCase());
    if (dupe) return { title: "An issue with this title already exists." };
    return {};
  }

  async function submit() {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      toast.error("Please fix the errors below before submitting.");
      return;
    }
    setFieldErrors({});
    setSaving(true);
    setError(null);
    const toastId = toast.loading("Creating issue…");

    const assignee = allMembers.find((m) => m.id === assigneeId);
    const { date: dueDate, time: dueTime } = splitDateTimeValue(dueValue);
    const res = await fetch(`/api/v2/projects/${projectId}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        severity,
        assignee_name: assignee?.full_name || undefined,
        due_date: dueDate || undefined,
        due_time: dueTime || undefined,
        notes: notes.trim() || undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = body.error || "Failed to create issue";
      setError(message);
      toast.error(message, { id: toastId });
      setSaving(false);
      return;
    }
    const issue: Issue = await res.json();
    setSaving(false);
    toast.success("Issue created", { id: toastId });

    if (attachmentFiles.length > 0) {
      issueIdRef.current = issue.id;
      setCreatedIssue(issue);
      uploadQueue.enqueue(attachmentFiles);
    } else {
      onCreated(issue);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1533]/40 p-4" onClick={uploading ? undefined : onClose}>
      <div
        className="w-full max-w-2xl rounded-[14px] bg-white shadow-xl border border-[#E2E7F2] overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDF0F7] shrink-0">
          <h2 className="text-[15px] font-semibold text-[#0B1533]">New Issue</h2>
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
                  ? "Issue created — uploading attachments…"
                  : hasFailures
                    ? "Issue created. Some attachments failed to upload — retry or continue without them."
                    : "Issue created — all attachments uploaded."}
              </p>
              <UploadQueuePanel items={uploadQueue.items} onRetry={uploadQueue.retry} onDismiss={uploadQueue.dismiss} />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EDF0F7] bg-[#F4F6FB] shrink-0">
              <button
                onClick={() => onCreated(createdIssue!)}
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
                  placeholder="What's the issue?"
                />
                {fieldErrors.title && <span className="text-xs text-[#C0392B]">{fieldErrors.title}</span>}
              </label>

              <CollapsibleSection title="Description" defaultOpen>
                <TaskDescriptionEditor
                  projectId={projectId}
                  value={description}
                  onChange={setDescription}
                  uploadUrl={`/api/v2/projects/${projectId}/issues/description-images`}
                />
              </CollapsibleSection>

              <CollapsibleSection title="Attachments" defaultOpen={false}>
                <TaskAttachmentPicker files={attachmentFiles} onFilesChange={setAttachmentFiles} />
              </CollapsibleSection>

              <CollapsibleSection title="Issue Information" defaultOpen>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className={labelClass}>Status</span>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className={cn(inputClass, "bg-white capitalize cursor-pointer")}
                    >
                      {STATUS_OPTS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className={labelClass}>Severity</span>
                    <select
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
                      className={cn(inputClass, "bg-white cursor-pointer")}
                    >
                      {SEVERITY_OPTS.map((s) => <option key={s} value={s}>{SEVERITY_STYLE[s].label}</option>)}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <span className={labelClass}>Assignee</span>
                    <SearchableSelect
                      value={assigneeId}
                      onChange={setAssigneeId}
                      options={allMembers.map((m) => ({ value: m.id, label: m.full_name ?? "Unknown" }))}
                      placeholder="Unassigned"
                      searchPlaceholder="Search members…"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className={labelClass}>Due date &amp; time</span>
                    <DateTimeFieldPicker value={dueValue} onChange={setDueValue} />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className={labelClass}>Notes (optional)</span>
                  <TaskDescriptionEditor
                    projectId={projectId}
                    value={notes}
                    onChange={setNotes}
                    uploadUrl={`/api/v2/projects/${projectId}/issues/description-images`}
                  />
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
