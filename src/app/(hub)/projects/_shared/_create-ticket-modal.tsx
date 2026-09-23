"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { X, Loader2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Ticket, type TicketSeverity, SEVERITY_STYLE } from "@/app/(hub)/projects-old/_pm-shared";
import { CollapsibleSection } from "./_collapsible-section";
import { TaskAttachmentPicker } from "./_task-attachment-picker";
import { TaskDescriptionEditor } from "./_task-description-editor";
import { useUploadQueue, UploadQueuePanel, uploadViaSignedUrl } from "./_attachment-dropzone";
import { extensionInfoFor } from "@/config/attachment-types";
import { formatFileSize } from "./_attachment-grid-tile";
import { AssigneeMultiSelect } from "./_assignee-multi-select";
import { DateTimeFieldPicker } from "./_datetime-field-picker";
import { dueDefaultValue, splitDateTimeValue } from "./_datetime-helpers";
import { STATUS_OPTS, SEVERITY_OPTS, type MemberOptionWithRole } from "./_project-detail";

// New Ticket modal (task 286) — extracted out of `_project-detail.tsx` to match task 274's
// New Task modal treatment: wider dialog, fields regrouped into collapsible sections, Assignee
// made searchable. Title required/duplicate validation (project-wide — tickets have no
// tasklist-style grouping to scope by, unlike tasks) with inline red-border/red-text field
// errors, and a sonner toast on submit.
//
// Task 338 brought the three lagging fields up to the New Task modal's treatment: Description
// and a new optional Notes field are now `TaskDescriptionEditor` rich-text (pointed at the
// tickets image-upload endpoint via its `uploadUrl` prop), and Due is the combined
// `DateTimeFieldPicker` (always-on, defaults 7:00 PM today) split into `due_date` + `due_time`
// at submit. The `tickets.due_time` / `tickets.notes` columns landed in migration 128.

const inputClass = "w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]";
const errorInputClass = "w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#C0392B] bg-white text-[#3A4565] shadow-[0_0_0_3px_rgba(192,57,43,0.08)]";
const labelClass = "text-[11px] font-semibold text-[#0B1533]";

type TicketFieldErrors = { title?: string };

export function CreateTicketModal({
  projectId,
  allMembers,
  tickets,
  defaultTitle,
  defaultDescription,
  sourceTicketId,
  copyAttachmentsFrom,
  onClose,
  onCreated,
}: {
  projectId: string;
  allMembers: MemberOptionWithRole[];
  tickets: Ticket[];
  // Task 333 — seed Title/Description when opened from outside a project page (e.g. "File a
  // Ticket" on a ticket thread message). Optional; blank for the normal flow.
  defaultTitle?: string;
  defaultDescription?: string;
  // Task 363 — the Desk ticket's UUID `id` when this modal was opened via "File a Ticket" on a
  // ticket thread message. Stamps `tickets.source_inbox_id` so the ticket surfaces on the Desk >
  // Tickets tab. Omitted for the normal (project-page) New Ticket flow.
  sourceTicketId?: string;
  // Task 394 — attachments already sitting on the source Desk Inbox message (not new browser
  // files the user is picking here) — copied server-side onto the new ticket after creation via
  // a separate, non-blocking call. Omitted for the normal (project-page) New Ticket flow.
  copyAttachmentsFrom?: { id: string; filename: string; size: number | null }[];
  onClose: () => void;
  onCreated: (i: Ticket) => void;
}) {
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [description, setDescription] = useState(defaultDescription ?? "");
  const [status, setStatus] = useState<string>("open");
  const [severity, setSeverity] = useState<TicketSeverity>("None");
  const [assignees, setAssignees] = useState<string[]>([]);
  // Combined date+time, `"YYYY-MM-DDTHH:mm"` (local) — same shape as the New Task modal's Due
  // field. Always populated (defaults to 7:00 PM today); split into `due_date` + `due_time`
  // at submit. Task 338.
  const [dueValue, setDueValue] = useState<string>(() => dueDefaultValue());
  const [notes, setNotes] = useState<string>("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  // Task 394 follow-up — surfaces the source Desk message's attachments in the form itself
  // (rather than only copying them silently after creation) so the user can see, and optionally
  // exclude, what's coming along before clicking Create. Defaults to all selected.
  const [copiedAttachmentIds, setCopiedAttachmentIds] = useState<Set<string>>(
    () => new Set((copyAttachmentsFrom ?? []).map((a) => a.id))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<TicketFieldErrors>({});
  // Post-creation upload phase (task 273 follow-up) — see CreateTaskModal's identical pattern for
  // why `ticketIdRef` (not the `createdTicket` state) is what the upload closure reads.
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null);
  const ticketIdRef = useRef<string | null>(null);
  const uploadQueue = useUploadQueue((file, onProgress) => {
    const base = `/api/v2/projects/${projectId}/tickets/${ticketIdRef.current}/attachments`;
    return uploadViaSignedUrl({
      signUrl: `${base}/sign`,
      registerUrl: base,
      file,
      mime: extensionInfoFor(file.name)?.mime ?? "application/octet-stream",
      onProgress,
    }).then(() => undefined);
  });
  const uploading = createdTicket !== null;
  const allSettled = uploadQueue.items.length > 0 && uploadQueue.items.every((it) => it.status !== "uploading");
  const hasFailures = uploadQueue.items.some((it) => it.status === "error");

  useEffect(() => {
    if (uploading && allSettled && !hasFailures) onCreated(createdTicket!);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCreated is a stable callback from the parent; only fire once when the queue actually settles
  }, [uploading, allSettled, hasFailures]);

  function validate(): TicketFieldErrors {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return { title: "Title is required" };
    const dupe = tickets.some((i) => i.title.trim().toLowerCase() === trimmedTitle.toLowerCase());
    if (dupe) return { title: "A ticket with this title already exists." };
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
    const toastId = toast.loading("Creating ticket…");

    const { date: dueDate, time: dueTime } = splitDateTimeValue(dueValue);
    const res = await fetch(`/api/v2/projects/${projectId}/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        severity,
        // Task 351 — tickets are now multi-assignee (`tickets.assignees`); the API derives the
        // synced scalar `assignee_id`/`assignee_name` columns from this array.
        assignees: assignees.length > 0 ? assignees : undefined,
        due_date: dueDate || undefined,
        due_time: dueTime || undefined,
        notes: notes.trim() || undefined,
        source_inbox_id: sourceTicketId || undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = body.error || "Failed to create ticket";
      setError(message);
      toast.error(message, { id: toastId });
      setSaving(false);
      return;
    }
    const ticket: Ticket = await res.json();
    setSaving(false);
    toast.success("Ticket created", { id: toastId });

    // Task 394 — non-blocking: doesn't gate onCreated()/the upload-queue phase below, mirrors
    // how attachmentFiles upload failures already don't roll back the ticket itself. Only the
    // still-selected subset (the user may have removed some in the Attachments section below).
    const selectedCopyIds = (copyAttachmentsFrom ?? [])
      .filter((a) => copiedAttachmentIds.has(a.id))
      .map((a) => a.id);
    if (selectedCopyIds.length > 0) {
      fetch(`/api/v2/projects/${projectId}/tickets/${ticket.id}/attachments/copy-from-inbox`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentIds: selectedCopyIds }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data: { copied: number; errors: string[] }) => {
          if (data.errors.length > 0) {
            toast.warning(
              data.copied > 0
                ? `${data.copied} of ${selectedCopyIds.length} attachments copied — some couldn't be copied`
                : "Couldn't copy the message's attachments"
            );
          }
        })
        .catch(() => toast.warning("Couldn't copy the message's attachments"));
    }

    if (attachmentFiles.length > 0) {
      ticketIdRef.current = ticket.id;
      setCreatedTicket(ticket);
      uploadQueue.enqueue(attachmentFiles);
    } else {
      onCreated(ticket);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1533]/40 p-4" onClick={uploading ? undefined : onClose}>
      <div
        className="w-full max-w-2xl rounded-[14px] bg-white shadow-xl border border-[#E2E7F2] overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDF0F7] shrink-0">
          <h2 className="text-[15px] font-semibold text-[#0B1533]">New Ticket</h2>
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
                  ? "Ticket created — uploading attachments…"
                  : hasFailures
                    ? "Ticket created. Some attachments failed to upload — retry or continue without them."
                    : "Ticket created — all attachments uploaded."}
              </p>
              <UploadQueuePanel items={uploadQueue.items} onRetry={uploadQueue.retry} onDismiss={uploadQueue.dismiss} />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EDF0F7] bg-[#F4F6FB] shrink-0">
              <button
                onClick={() => onCreated(createdTicket!)}
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
                  placeholder="What's the ticket?"
                />
                {fieldErrors.title && <span className="text-xs text-[#C0392B]">{fieldErrors.title}</span>}
              </label>

              <CollapsibleSection title="Description" defaultOpen>
                <TaskDescriptionEditor
                  projectId={projectId}
                  value={description}
                  onChange={setDescription}
                  uploadUrl={`/api/v2/projects/${projectId}/tickets/description-images`}
                />
              </CollapsibleSection>

              <CollapsibleSection title="Attachments" defaultOpen={(copyAttachmentsFrom?.length ?? 0) > 0}>
                {copyAttachmentsFrom && copyAttachmentsFrom.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-3">
                    <span className="text-[11px] font-semibold text-[#5F6A88]">
                      From this message ({copiedAttachmentIds.size})
                    </span>
                    <div className="rounded-[10px] border border-[#E2E7F2] bg-white divide-y divide-[#EDF0F7]">
                      {copyAttachmentsFrom.map((a) => {
                        const selected = copiedAttachmentIds.has(a.id);
                        return (
                          <div key={a.id} className="flex items-center gap-3 px-3.5 py-2.5">
                            <span className="w-7.5 h-7.5 rounded-[7px] shrink-0 flex items-center justify-center bg-[#E5F1FF] text-[#007BFF]">
                              <FileText size={15} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className={cn("text-[12px] font-semibold truncate", selected ? "text-[#3A4565]" : "text-[#C7CEDD] line-through")}>
                                {a.filename}
                              </p>
                              <p className="text-[10.5px] text-[#5F6A88]">
                                {formatFileSize(a.size)} · Will be copied
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setCopiedAttachmentIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(a.id)) next.delete(a.id);
                                  else next.add(a.id);
                                  return next;
                                })
                              }
                              aria-label={selected ? `Don't copy ${a.filename}` : `Copy ${a.filename}`}
                              className="shrink-0 bg-transparent border-none cursor-pointer text-[#5F6A88] hover:text-[#C0392B] transition-colors"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <TaskAttachmentPicker files={attachmentFiles} onFilesChange={setAttachmentFiles} />
              </CollapsibleSection>

              <CollapsibleSection title="Ticket Information" defaultOpen>
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
                      onChange={(e) => setSeverity(e.target.value as TicketSeverity)}
                      className={cn(inputClass, "bg-white cursor-pointer")}
                    >
                      {SEVERITY_OPTS.map((s) => <option key={s} value={s}>{SEVERITY_STYLE[s].label}</option>)}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <span className={labelClass}>Assignee</span>
                    <AssigneeMultiSelect
                      variant="field"
                      value={assignees}
                      members={allMembers}
                      editable
                      onChange={setAssignees}
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
                    uploadUrl={`/api/v2/projects/${projectId}/tickets/description-images`}
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
