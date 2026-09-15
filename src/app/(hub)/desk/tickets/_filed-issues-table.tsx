import Link from "next/link";
import { Clock } from "lucide-react";
import {
  STATUS_LABEL, STATUS_STYLE, SEVERITY_STYLE,
  normalizeStatus, normalizeSeverity, decodeHtmlEntities,
  type TaskStatus,
} from "@/app/(hub)/projects-old/_pm-shared";
import { ticketAssigneeIds } from "@/lib/tickets/permissions";
import { AssigneeMultiSelect, type AssigneeMember } from "@/app/(hub)/projects/_shared/_assignee-multi-select";
import { STATUS_FILTER_OPTIONS } from "./_status-filter";
import type { FiledIssueListItem } from "./_filed-issues-index";

// Task 363 — row rendering for the Desk > Tickets tab. Status + assignees are editable (PATCH
// `/api/v2/tickets/[ticketId]`, wired by the parent's `onUpdate`); everything else here — origin
// ticket, responded/due, severity, created, logged hours — is read-only, per the locked decision
// that time-tracking actions stay on the issue detail page / Dev Dashboard.
//
// Follow-up (still task 363) — Ticket ID/Responded/Due Date moved here from the Inbox list table.
// "Owner" (the Desk agent on the email) was dropped rather than moved — this tab already has
// Assignees (who's fixing it), a different concept.
//
// Task 370 — the read-only "Ticket status" column (the origin ticket's own open/on_hold/
// escalated/closed status, distinct from this issue's dev-workflow `status` column above) moved
// back to the Inbox table, now editable there in place, since that's the origin ticket's own row.

const GRID_COLS = "grid-cols-[1fr_170px_130px_150px_130px_100px_100px_100px_120px_90px] min-w-[1540px]";

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

export function FiledIssuesTable({
  issues,
  allMembers,
  onUpdate,
}: {
  issues: FiledIssueListItem[];
  allMembers: AssigneeMember[];
  onUpdate: (id: string, patch: { status?: string; assignees?: string[] }) => Promise<boolean>;
}) {
  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden">
      {/* Wide grid (10 columns) — horizontal scroll on narrower viewports, per the design
          system's "wrap in overflow-x: auto for mobile" table rule. */}
      <div className="overflow-x-auto">
        <div className={`grid ${GRID_COLS} items-center gap-3 px-5 py-2.5 border-b border-[#EDF0F7] bg-[#FAFBFE]`}>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Ticket</span>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Origin</span>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Project</span>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Assignees</span>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Status</span>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Severity</span>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Responded</span>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Due date</span>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Created</span>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Logged</span>
        </div>
        {issues.map((issue) => {
          const norm = normalizeStatus(issue.status);
          const ss = STATUS_STYLE[norm] ?? STATUS_STYLE["open"];
          const sev = normalizeSeverity(issue.severity);
          const sv = SEVERITY_STYLE[sev] ?? SEVERITY_STYLE["None"];

          return (
            <div
              key={issue.id}
              className={`grid ${GRID_COLS} items-center gap-3 px-5 py-3 border-b border-[#EDF0F7] last:border-0 hover:bg-[#F0F7FF]/60 transition-colors`}
            >
              {/* Ticket title + display id — links to the filed ticket's own detail page under
                  Projects (legacy/v2-aware, task 369's buildItemHref). */}
              {issue.ticketHref ? (
                <Link href={issue.ticketHref} className="min-w-0 block group/ticket">
                  <div
                    className="text-[13px] font-medium text-[#0B1533] group-hover/ticket:text-[#007BFF] truncate transition-colors"
                    title={decodeHtmlEntities(issue.title)}
                  >
                    {decodeHtmlEntities(issue.title)}
                  </div>
                  {issue.displayId && (
                    <div className="text-[10.5px] font-mono text-[#5F6A88] truncate">{issue.displayId}</div>
                  )}
                </Link>
              ) : (
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[#0B1533] truncate" title={decodeHtmlEntities(issue.title)}>
                    {decodeHtmlEntities(issue.title)}
                  </div>
                  {issue.displayId && (
                    <div className="text-[10.5px] font-mono text-[#5F6A88] truncate">{issue.displayId}</div>
                  )}
                </div>
              )}

              {/* Origin — the subject of the Inbox thread it was filed from, linking back to that
                  thread (the mono ticket-id line was dropped once the header shortened to
                  "Origin"; the subject + hover state alone carry the relationship). */}
              {issue.ticketId ? (
                <Link
                  href={`/desk/inbox/${issue.ticketId}`}
                  className="min-w-0 block text-[12px] text-[#007BFF] hover:text-[#0063D6] hover:underline truncate transition-colors"
                  title={issue.ticketSubject}
                >
                  {issue.ticketSubject || issue.ticketId}
                </Link>
              ) : (
                <span className="text-[12px] text-[#5F6A88]">—</span>
              )}

              {/* Owning project */}
              {issue.projectHref ? (
                <Link
                  href={issue.projectHref}
                  className="text-[12px] text-[#3A4565] hover:text-[#007BFF] truncate transition-colors"
                  title={issue.projectName}
                >
                  {issue.projectName}
                </Link>
              ) : (
                <span className="text-[12px] text-[#5F6A88]">{issue.projectName}</span>
              )}

              {/* Assignees — editable */}
              <AssigneeMultiSelect
                value={ticketAssigneeIds({ assignees: issue.assignees, assignee_id: issue.assigneeId })}
                members={allMembers}
                editable
                onChange={(ids) => void onUpdate(issue.id, { assignees: ids })}
              />

              {/* Status — editable (dev-workflow status) */}
              <select
                value={norm}
                onChange={(e) => void onUpdate(issue.id, { status: e.target.value })}
                className="text-[11px] font-semibold rounded-full border px-2.5 py-0.5 outline-none cursor-pointer appearance-none w-full truncate"
                style={{ color: ss.text, background: ss.bg, borderColor: ss.border }}
              >
                {STATUS_FILTER_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value} className="bg-white text-[#3A4565]">
                    {STATUS_LABEL[s.value as TaskStatus] ?? s.label}
                  </option>
                ))}
              </select>

              {/* Severity — read-only */}
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium truncate" style={{ color: sv.text }}>
                <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: sv.dot }} />
                {sv.label}
              </span>

              {/* Responded — the origin ticket's first response time, read-only */}
              <span className="text-[11px] font-mono text-[#5F6A88] truncate">
                {issue.ticketRespondedAt ? formatDateTime(issue.ticketRespondedAt) : "—"}
              </span>

              {/* Due date — the origin ticket's SLA due time, read-only, overdue in red */}
              <span className={`text-[11px] font-mono truncate ${issue.ticketOverdue ? "text-[#C0392B] font-semibold" : "text-[#5F6A88]"}`}>
                {issue.ticketDueAt ? formatDateTime(issue.ticketDueAt) : "—"}
              </span>

              {/* Created date + time — always full, mono (design-system "Data" type role) */}
              <span className="text-[11px] font-mono text-[#5F6A88] truncate" title={formatDateTime(issue.createdAt)}>
                {formatDateTime(issue.createdAt)}
              </span>

              {/* Total logged hours — read-only figure only; no timer/log-time action lives here,
                  that stays on the issue detail page and the Dev Dashboard (locked decision). */}
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#5F6A88]">
                <Clock size={11} className="shrink-0" />
                {issue.totalHours > 0 ? `${issue.totalHours.toFixed(1)}h` : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
