"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2, Loader2 } from "lucide-react";
import {
  type Issue, type IssueSeverity, type TaskStatus,
  STATUS_LABEL, StatusBadge, SeverityBadge, SEVERITY_OPTS,
  normalizeStatus, normalizeSeverity, decodeHtmlEntities,
} from "@/app/(hub)/projects-old/_pm-shared";
import { DescriptionField } from "@/app/(hub)/projects/_shared/_description-field";
import { AccordionCard } from "@/app/(hub)/projects/_shared/_accordion-card";
import { IssueAttachmentsCommentsPanel } from "./_issue-attachments-comments-panel";
import { IssueQuickAccessPanel, type QuickAccessTask, type QuickAccessIssue } from "./_issue-quick-access-panel";
import { getIssueEditPermission } from "@/lib/issues/permissions";
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

export default function IssueDetailClient({
  issue,
  project,
  allMembers,
  currentUserId,
  currentUserRole,
  currentUserName,
  currentUserAvatarUrl,
  quickAccessTasks,
  quickAccessIssues,
}: {
  issue: Issue;
  project: { id: string; name: string; customer_id: string; project_id: string | null };
  allMembers: MemberOption[];
  currentUserId: string;
  currentUserRole: string | null;
  currentUserName: string | null;
  currentUserAvatarUrl: string | null;
  quickAccessTasks: QuickAccessTask[];
  quickAccessIssues: QuickAccessIssue[];
}) {
  const router = useRouter();
  const projectId = project.project_id ?? project.id;

  // Task 234 — creator: full edit. Assignee-only: status limited to in_progress/ready_for_qa +
  // timer access. Neither: fully read-only. Mirrors getTaskEditPermission's shape but is its own
  // function — see src/lib/issues/permissions.ts for why.
  const perm = getIssueEditPermission(currentUserRole, currentUserId, issue);
  // Task 285 — delete now follows the same tier as every other field (`canEditDetails`): the
  // creator-developer or admin/pm/super_admin. Previously hardcoded to admin/pm/super_admin-only
  // (Decision 4, task 234) because issues_pm_write RLS granted no developer delete policy at
  // all, even for a creator — migration 111 (task 285) added `issues_developer_delete`, scoped
  // to `created_by = auth.uid()`, closing that gap.
  const canDelete = perm.canEditDetails;

  const [title, setTitle] = useState(() => decodeHtmlEntities(issue.title));
  const [description, setDescription] = useState(issue.description ?? "");
  const [status, setStatus] = useState<string>(normalizeStatus(issue.status));
  const [severity, setSeverity] = useState<IssueSeverity>(normalizeSeverity(issue.severity));
  const [assigneeId, setAssigneeId] = useState<string>(issue.assignee_id ?? "");
  const [dueDate, setDueDate] = useState(issue.due_date ?? "");
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

  const goToIssues = useCallback(() => {
    if (project.project_id) router.push(`/projects/v2/${project.project_id}/issues`);
  }, [project.project_id, router]);

  const saveField = useCallback(
    async (patch: Partial<Issue>) => {
      await fetch(`/api/v2/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    },
    [issue.id]
  );

  const saveTitle = useCallback(() => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== issue.title) void saveField({ title: trimmed });
  }, [title, issue.title, saveField]);

  function saveAssignee(nextId: string) {
    setAssigneeId(nextId);
    const member = allMembers.find((m) => m.id === nextId);
    // assignee_id is now the source of truth (migration 100); assignee_name is kept in sync for
    // display/back-compat with Zoho-sourced UI, assignee_email is cleared — this selector never
    // sets a free-text-only email, and re-deriving it from a stale value once assignee_id is the
    // real link would just be misleading.
    void saveField({
      assignee_id: nextId || null,
      assignee_name: member?.full_name ?? null,
      assignee_email: null,
    });
  }

  async function handleDelete() {
    setConfirmOpen(false);
    setDeleting(true);
    const res = await fetch(`/api/v2/issues/${issue.id}`, { method: "DELETE" });
    if (!res.ok) {
      setDeleting(false);
      setDeleteError("Failed to delete issue.");
      return;
    }
    goToIssues();
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-8 pt-6 pb-5 bg-white border-b border-[#E2E7F2] shrink-0">
        <button
          onClick={goToIssues}
          className="inline-flex items-center gap-1.5 text-[12px] text-[#5F6A88] hover:text-[#0B1533] mb-3 cursor-pointer transition-colors"
        >
          <ArrowLeft size={14} /> {project.name}
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[11px] font-mono text-[#5F6A88] bg-[#EDF0F7] px-2 py-0.5 rounded-[5px]">
                ISSUE · {issue.display_id ?? issue.prefix ?? issue.id}
              </span>
              <StatusBadge status={status as TaskStatus} />
              <SeverityBadge severity={severity} />
              {perm.canStartTimer && (
                <TaskTimerButton
                  issueId={issue.id}
                  projectId={issue.project_id}
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
                    aria-label="Delete issue"
                  >
                    {deleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                  </button>
                } />
                <TooltipContent side="top">Delete issue</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        {deleteError && <p className="text-[11px] text-[#C0392B] mt-1">{deleteError}</p>}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete this issue?"
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
                      const next = e.target.value as IssueSeverity;
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

                <Meta label="Assignee">
                  <select
                    value={assigneeId}
                    onChange={(e) => saveAssignee(e.target.value)}
                    disabled={!perm.canEditDetails}
                    className={`${inputClass} bg-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <option value="">Unassigned</option>
                    {allMembers.map((m) => (
                      <option key={m.id} value={m.id}>{m.full_name ?? "Unknown"}</option>
                    ))}
                  </select>
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

              </div>
            </AccordionCard>

            <AccordionCard title="Other Assigned" defaultOpen={false}>
              <IssueQuickAccessPanel
                tasks={quickAccessTasks}
                issues={quickAccessIssues}
                projectId={projectId}
              />
            </AccordionCard>
          </div>

          {/* Right — main content */}
          <div className="flex-1 flex flex-col gap-5 min-w-0">
            <AccordionCard title="Description" noPadding>
              <DescriptionField
                uploadUrl={`/api/v2/projects/${projectId}/issues/description-images`}
                value={description}
                readOnly={!perm.canEditDetails}
                fullBleed
                onSave={(html) => {
                  setDescription(html);
                  void saveField({ description: html || null });
                }}
              />
            </AccordionCard>

            <IssueAttachmentsCommentsPanel
              projectId={projectId}
              issueId={issue.id}
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
