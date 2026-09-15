"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2, Loader2 } from "lucide-react";
import {
  type Ticket, type TicketSeverity, type TaskStatus,
  STATUS_LABEL, StatusBadge, SeverityBadge, SEVERITY_OPTS,
  normalizeStatus, normalizeSeverity, decodeHtmlEntities,
} from "@/app/(hub)/projects-old/_pm-shared";
import { DescriptionField } from "@/app/(hub)/projects/_shared/_description-field";
import { AccordionCard } from "@/app/(hub)/projects/_shared/_accordion-card";
import { TicketAttachmentsCommentsPanel } from "./_ticket-attachments-comments-panel";
import { TicketQuickAccessPanel, type QuickAccessTask, type QuickAccessTicket } from "./_ticket-quick-access-panel";
import { getTicketEditPermission, ticketAssigneeIds } from "@/lib/tickets/permissions";
import { AssigneeMultiSelect } from "@/app/(hub)/projects/_shared/_assignee-multi-select";
import { TaskTimerButton } from "@/app/(hub)/projects/_shared/_task-timer-button";
import { CopyLinkButton } from "@/app/(hub)/projects/_shared/_copy-link-button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const STATUS_OPTS = [
  "open", "in_progress", "ready_for_qa", "testing_completed",
  "for_client_approval", "ready_to_merge", "post_live_qa", "closed",
] as const;

type MemberOption = { id: string; full_name: string | null; avatar_url: string | null };

// Forms-spec input class (DESIGN.md §4) — matches `_task-detail.tsx`'s own `inputClass` exactly
// for visual parity between the two detail pages (task 234).
const inputClass =
  "w-full px-2.5 py-1.5 rounded-[10px] border text-[12px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]";

// ─── Local layout helpers — outside component per rerender-no-inline-components ─
// Task 257, Requirement C — the local `Card` helper is replaced by the shared, collapsible
// `AccordionCard` (`../../_accordion-card.tsx`); `Meta` stays, still used inside Details fields.

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold text-[#0B1533]">{label}</span>
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TicketDetailClient({
  ticket,
  project,
  allMembers,
  assigneeProfiles,
  currentUserId,
  currentUserRole,
  currentUserName,
  currentUserAvatarUrl,
  quickAccessTasks,
  quickAccessTickets,
}: {
  ticket: Ticket;
  project: { id: string; name: string; customer_id: string; project_id: string | null };
  allMembers: MemberOption[];
  // Task 351 — every current assignee's name/avatar, even any who've left the member pool.
  assigneeProfiles: MemberOption[];
  currentUserId: string;
  currentUserRole: string | null;
  currentUserName: string | null;
  currentUserAvatarUrl: string | null;
  quickAccessTasks: QuickAccessTask[];
  quickAccessTickets: QuickAccessTicket[];
}) {
  const router = useRouter();
  const projectId = project.project_id ?? project.id;

  // Task 234 — creator: full edit. Assignee-only: status limited to in_progress/ready_for_qa +
  // timer access. Neither: fully read-only. Mirrors getTaskEditPermission's shape but is its own
  // function — see src/lib/tickets/permissions.ts for why.
  const perm = getTicketEditPermission(currentUserRole, currentUserId, ticket);
  // Task 285 — delete now follows the same tier as every other field (`canEditDetails`): the
  // creator-developer or admin/pm/super_admin. Previously hardcoded to admin/pm/super_admin-only
  // (Decision 4, task 234) because issues_pm_write RLS granted no developer delete policy at
  // all, even for a creator — migration 111 (task 285) added `issues_developer_delete`, scoped
  // to `created_by = auth.uid()`, closing that gap.
  const canDelete = perm.canEditDetails;

  const [title, setTitle] = useState(() => decodeHtmlEntities(ticket.title));
  const [description, setDescription] = useState(ticket.description ?? "");
  const [status, setStatus] = useState<string>(normalizeStatus(ticket.status));
  const [severity, setSeverity] = useState<TicketSeverity>(normalizeSeverity(ticket.severity));
  const [assignees, setAssignees] = useState<string[]>(() => ticketAssigneeIds(ticket));
  const [dueDate, setDueDate] = useState(ticket.due_date ?? "");
  // Task 338 — the time half of the due date + an optional internal notes field
  // (`tickets.due_time` / `tickets.notes`, migration 128).
  const [dueTime, setDueTime] = useState(ticket.due_time ?? "");
  const [notes, setNotes] = useState(ticket.notes ?? "");
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Task 237 — bumped whenever the header timer button logs an entry, so the Time Logs tab
  // (which fetches its own data on mount and has no other refresh hook) picks it up live.
  // Mirrors `_task-detail.tsx`'s identical `timeLogsRefreshKey` wiring; task 234 left this as a
  // no-op placeholder since the Time Logs tab didn't exist yet.
  const [timeLogsRefreshKey, setTimeLogsRefreshKey] = useState(0);
  const handleHoursLogged = useCallback(() => {
    setTimeLogsRefreshKey((k) => k + 1);
  }, []);

  const statusOptions = perm.allowedStatusValues === "all"
    ? STATUS_OPTS
    : Array.from(new Set([status, ...perm.allowedStatusValues]));

  const goToTickets = useCallback(() => {
    if (project.project_id) router.push(`/projects/legacy/${project.project_id}/tickets`);
  }, [project.project_id, router]);

  const saveField = useCallback(
    async (patch: Partial<Ticket>) => {
      await fetch(`/api/v2/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    },
    [ticket.id]
  );

  const saveTitle = useCallback(() => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== ticket.title) void saveField({ title: trimmed });
  }, [title, ticket.title, saveField]);

  function saveAssignees(nextIds: string[]) {
    setAssignees(nextIds);
    // Task 351 — tickets are multi-assignee (`tickets.assignees`); the PATCH route derives the
    // synced scalar `assignee_id`/`assignee_name` columns from this array.
    void saveField({ assignees: nextIds });
  }

  async function handleDelete() {
    setConfirmOpen(false);
    setDeleting(true);
    const res = await fetch(`/api/v2/tickets/${ticket.id}`, { method: "DELETE" });
    if (!res.ok) {
      setDeleting(false);
      setDeleteError("Failed to delete ticket.");
      return;
    }
    goToTickets();
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-8 pt-6 pb-5 bg-white border-b border-[#E2E7F2] shrink-0">
        <button
          onClick={goToTickets}
          className="inline-flex items-center gap-1.5 text-[12px] text-[#5F6A88] hover:text-[#0B1533] mb-3 cursor-pointer transition-colors"
        >
          <ArrowLeft size={14} /> {project.name}
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[11px] font-mono text-[#5F6A88] bg-[#EDF0F7] px-2 py-0.5 rounded-[5px]">
                TICKET · {ticket.display_id ?? ticket.prefix ?? ticket.id}
              </span>
              <StatusBadge status={status as TaskStatus} />
              <SeverityBadge severity={severity} />
              {perm.canStartTimer && (
                <TaskTimerButton
                  issueId={ticket.id}
                  projectId={ticket.project_id}
                  onHoursLogged={handleHoursLogged}
                  prominent
                />
              )}
            </div>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              readOnly={!perm.canEditDetails}
              rows={2}
              className="font-heading text-[22px] font-bold text-[#0B1533] tracking-[-0.02em] outline-none resize-none leading-snug w-full border-0 focus:bg-[#F4F6FB] rounded-lg px-2 -mx-2 transition-colors read-only:focus:bg-transparent"
            />
          </div>
          <div className="flex items-center gap-1 shrink-0 mt-1">
            <CopyLinkButton className="p-2 rounded-full text-[#5F6A88] hover:text-[#007BFF] hover:bg-[#E5F1FF] cursor-pointer transition-colors" />
            {canDelete && (
              <Tooltip>
                <TooltipTrigger render={
                  <button
                    onClick={() => setConfirmOpen(true)}
                    disabled={deleting}
                    className="p-2 rounded-full text-[#5F6A88] hover:text-[#C0392B] hover:bg-[#FDE8E6] cursor-pointer transition-colors disabled:opacity-45"
                    aria-label="Delete ticket"
                  >
                    {deleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                  </button>
                } />
                <TooltipContent side="top">Delete ticket</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        {deleteError && <p className="text-[11px] text-[#C0392B] mt-1">{deleteError}</p>}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete this ticket?"
        body="This action is irreversible."
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        confirmDisabled={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Content */}
      <div className="bg-[#F4F6FB] flex-1 overflow-y-auto p-8">
        <div className="flex gap-6">

          {/* Left — sidebar */}
          <div className="w-72 shrink-0 flex flex-col gap-5">
            <AccordionCard title="Details">
              <div className="flex flex-col gap-4">

                <Meta label="Status">
                  <select
                    value={status}
                    onChange={(e) => {
                      const next = e.target.value;
                      setStatus(next);
                      void saveField({ status: next });
                    }}
                    disabled={!perm.canChangeStatus}
                    className={`${inputClass} bg-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s as TaskStatus] ?? s}</option>
                    ))}
                  </select>
                </Meta>

                <Meta label="Severity">
                  <select
                    value={severity}
                    onChange={(e) => {
                      const next = e.target.value as TicketSeverity;
                      setSeverity(next);
                      void saveField({ severity: next });
                    }}
                    disabled={!perm.canEditDetails}
                    className={`${inputClass} bg-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {SEVERITY_OPTS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Meta>

                <Meta label={assignees.length > 1 ? "Assignees" : "Assignee"}>
                  <AssigneeMultiSelect
                    value={assignees}
                    members={allMembers}
                    nameById={Object.fromEntries(
                      assigneeProfiles.map((p) => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }])
                    )}
                    editable={perm.canEditDetails}
                    onChange={saveAssignees}
                  />
                </Meta>

                <Meta label="Due date">
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => {
                      const next = e.target.value;
                      setDueDate(next);
                      void saveField({ due_date: next || null });
                    }}
                    disabled={!perm.canEditDetails}
                    className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
                  />
                </Meta>

                <Meta label="Due time">
                  <input
                    type="time"
                    value={dueTime}
                    onChange={(e) => {
                      const next = e.target.value;
                      setDueTime(next);
                      void saveField({ due_time: next || null });
                    }}
                    disabled={!perm.canEditDetails}
                    className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
                  />
                </Meta>

              </div>
            </AccordionCard>

            <AccordionCard title="Other Assigned" defaultOpen={false}>
              <TicketQuickAccessPanel
                tasks={quickAccessTasks}
                tickets={quickAccessTickets}
                projectId={projectId}
              />
            </AccordionCard>
          </div>

          {/* Right — main content */}
          <div className="flex-1 flex flex-col gap-5 min-w-0">
            <AccordionCard title="Description" noPadding>
              <DescriptionField
                uploadUrl={`/api/v2/projects/${projectId}/tickets/description-images`}
                value={description}
                readOnly={!perm.canEditDetails}
                fullBleed
                onSave={(html) => {
                  setDescription(html);
                  void saveField({ description: html || null });
                }}
              />
            </AccordionCard>

            {/* Task 338 — optional internal notes (tickets.notes, migration 128). */}
            <AccordionCard title="Notes" noPadding defaultOpen={false}>
              <DescriptionField
                uploadUrl={`/api/v2/projects/${projectId}/tickets/description-images`}
                value={notes}
                readOnly={!perm.canEditDetails}
                fullBleed
                onSave={(html) => {
                  setNotes(html);
                  void saveField({ notes: html || null });
                }}
              />
            </AccordionCard>

            <TicketAttachmentsCommentsPanel
              projectId={projectId}
              ticketId={ticket.id}
              canEdit={perm.canEditDetails}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              currentUserName={currentUserName}
              currentUserAvatarUrl={currentUserAvatarUrl}
              timeLogsRefreshKey={timeLogsRefreshKey}
            />
          </div>

        </div>
      </div>
    </div>
  );
}
