"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import Link from "next/link";
import { Users, SearchX, Check, X, Trash2, Bug, Plus } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  type Issue, type TaskStatus, type IssueSeverity,
  STATUS_LABEL, STATUS_STYLE, SEVERITY_STYLE,
  formatDueDate, normalizeStatus, normalizeSeverity, decodeHtmlEntities,
} from "@/app/(hub)/projects-old/_pm-shared";
import { getIssueEditPermission } from "@/lib/issues/permissions";
import { CopyLinkButton } from "./_copy-link-button";
import { TaskTimerButton } from "./_task-timer-button";

export type IssueSortKey = "title" | "status" | "severity" | "due_date";
export type IssueSortDir = "asc" | "desc";

const SEVERITY_ORDER: Record<string, number> = { "Show stopper": 0, "Critical": 1, "Major": 2, "Minor": 3, "None": 4 };
const STATUS_ORDER: Record<string, number> = {
  open: 0, in_progress: 1, ready_for_qa: 2, testing_completed: 3,
  for_client_approval: 4, ready_to_merge: 5, post_live_qa: 6, closed: 7,
};

const STATUS_OPTS: TaskStatus[] = [
  "open", "in_progress", "ready_for_qa", "testing_completed",
  "for_client_approval", "ready_to_merge", "post_live_qa", "closed",
];

const AVATAR_COLORS = ["#0063D6", "#6A48E0", "#0B8A93", "#B85512", "#177E48", "#44508A"];

type MemberProfile = { id: string; full_name: string | null; avatar_url: string | null };

function getDueColor(due: string | null): string {
  if (!due) return "text-[#5F6A88]";
  const days = Math.ceil((new Date(due).getTime() - Date.now()) / 86400000);
  if (days < 0) return "text-[#C0392B]";
  if (days <= 7) return "text-[#8A5A00]";
  return "text-[#3A4565]";
}

function nameInitials(name: string | null | undefined): string {
  if (name) return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return "?";
}

// ─── IssueAssigneePicker — single-select (unlike tasks' multi-select AssigneePicker) ─
// Writes assignee_name from the chosen member's full_name; assignee_email is cleared
// (Hub has no reliable email source for members — see task 192 doc's Out of Scope).

function IssueAssigneePicker({
  issue,
  allMembers,
  onUpdate,
}: {
  issue: Issue;
  allMembers: MemberProfile[];
  onUpdate: (id: string, patch: Partial<Issue>) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPanelPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(true);
  }

  function assign(member: MemberProfile) {
    setOpen(false);
    void onUpdate(issue.id, { assignee_name: member.full_name, assignee_email: null });
  }

  function unassign() {
    setOpen(false);
    void onUpdate(issue.id, { assignee_name: null, assignee_email: null });
  }

  // Issue assignment is name-string-based (`assignee_name`), not a resolved `assignee_id`
  // FK — matching against `allMembers` by name is the only avatar_url lookup available here
  // without a broader data-layer change.
  const assignedMember = issue.assignee_name ? allMembers.find((m) => m.full_name === issue.assignee_name) : undefined;

  return (
    <div className="flex items-center">
      <button ref={btnRef} onClick={handleOpen} className="flex items-center gap-1.5 cursor-pointer group min-w-0">
        {issue.assignee_name ? (
          <>
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white shrink-0 overflow-hidden"
              style={assignedMember?.avatar_url ? undefined : { background: AVATAR_COLORS[issue.assignee_name.charCodeAt(0) % AVATAR_COLORS.length] }}
            >
              {assignedMember?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- external Supabase-auth-provider avatar URL, not a static/optimizable asset
                <img src={assignedMember.avatar_url} alt={issue.assignee_name} className="w-full h-full object-cover" />
              ) : (
                nameInitials(issue.assignee_name)
              )}
            </div>
            <span className="text-[12px] text-[#3A4565] truncate">{issue.assignee_name}</span>
          </>
        ) : (
          <span className="text-[#C7CEDD] group-hover:text-[#5F6A88] transition-colors">
            <Users size={14} />
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 w-52 rounded-[10px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] overflow-hidden"
            style={{ top: panelPos.top, left: panelPos.left }}
          >
            <div className="px-3 py-2.5 border-b border-[#EDF0F7] flex items-center justify-between">
              <p className="text-[11px] font-semibold text-[#5F6A88] uppercase tracking-wide">Assign to</p>
              {issue.assignee_name && (
                <button onClick={unassign} className="text-[11px] text-[#C0392B] hover:underline cursor-pointer">
                  Unassign
                </button>
              )}
            </div>
            <div className="max-h-52 overflow-y-auto">
              {allMembers.map((m, mi) => {
                const isAssigned = issue.assignee_name === m.full_name;
                return (
                  <button
                    key={m.id}
                    onClick={() => assign(m)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] hover:bg-[#F4F6FB] cursor-pointer transition-colors text-left ${
                      isAssigned ? "bg-[#F0F7FF]" : ""
                    }`}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white shrink-0 overflow-hidden"
                      style={m.avatar_url ? undefined : { background: AVATAR_COLORS[mi % AVATAR_COLORS.length] }}
                    >
                      {m.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- external Supabase-auth-provider avatar URL, not a static/optimizable asset
                        <img src={m.avatar_url} alt={m.full_name ?? "Unknown"} className="w-full h-full object-cover" />
                      ) : (
                        nameInitials(m.full_name)
                      )}
                    </div>
                    <span className={`flex-1 truncate ${isAssigned ? "font-medium text-[#0B1533]" : "text-[#3A4565]"}`}>
                      {m.full_name ?? "Unknown"}
                    </span>
                    {isAssigned && <Check size={13} className="text-[#007BFF] shrink-0" />}
                  </button>
                );
              })}
              {allMembers.length === 0 && (
                <p className="text-[12px] text-[#5F6A88] px-3 py-3">No members found</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── IssueListView ────────────────────────────────────────────────────────────

export default function IssueListView({
  issues,
  getHref,
  onUpdate,
  onBulkDelete,
  currentUserId,
  currentUserRole,
  allMembers,
  sortKey,
  sortDir,
  onToggleSort,
  hasActiveFilters,
  onClearFilters,
  onCreateNew,
}: {
  issues: Issue[];
  // Task 290 — a real `<Link>` (not a button + router.push) so users can middle-click /
  // Cmd-click a row to open the issue in a new tab.
  getHref: (issue: Issue) => string;
  onUpdate: (id: string, patch: Partial<Issue>) => Promise<boolean>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  currentUserId: string;
  currentUserRole: string | null;
  allMembers: MemberProfile[];
  sortKey: IssueSortKey;
  sortDir: IssueSortDir;
  onToggleSort: (key: IssueSortKey) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onCreateNew?: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // ─── Sticky-header "stuck" detection ───────────────────────────────────────
  // A zero-height sentinel sits at the card's top edge, just above the sticky
  // header. Once it scrolls out of the scroll container's view, the header has
  // pinned flush against the toolbar above (no gap) — square off its top
  // corners at that point; restore the rounded corners once it un-sticks.
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickySentinelRef = useRef<HTMLDivElement>(null);
  const [headerStuck, setHeaderStuck] = useState(false);

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = stickySentinelRef.current;
    if (!root || !sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeaderStuck(!entry.isIntersecting),
      { root, threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const dir = sortDir === "asc" ? 1 : -1;
  const sorted = [...issues].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "title")         cmp = a.title.localeCompare(b.title);
    else if (sortKey === "status")   cmp = (STATUS_ORDER[normalizeStatus(a.status)] ?? 0) - (STATUS_ORDER[normalizeStatus(b.status)] ?? 0);
    else if (sortKey === "severity") cmp = (SEVERITY_ORDER[normalizeSeverity(a.severity)] ?? 4) - (SEVERITY_ORDER[normalizeSeverity(b.severity)] ?? 4);
    else if (sortKey === "due_date") cmp = (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
    return cmp * dir;
  });

  // Task 285 — only issues the current user can delete (creator, or admin/pm/super_admin)
  // participate in selection; mirrors the Issue Detail page's `perm.canEditDetails` delete gate.
  const selectableIds = useMemo(() => {
    const ids = new Set<string>();
    for (const i of issues) {
      if (getIssueEditPermission(currentUserRole, currentUserId, i).canEditDetails) ids.add(i.id);
    }
    return ids;
  }, [issues, currentUserRole, currentUserId]);

  const allIds = useMemo(
    () => sorted.map((i) => i.id).filter((id) => selectableIds.has(id)),
    [sorted, selectableIds]
  );
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  async function handleBulkTrash() {
    setConfirmOpen(false);
    setDeleting(true);
    await onBulkDelete(Array.from(selected));
    setDeleting(false);
    setSelected(new Set());
  }

  if (issues.length === 0 && !hasActiveFilters) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-10 h-10 rounded-full bg-[#EDF0F7] flex items-center justify-center">
          <Bug size={18} className="text-[#5F6A88]" />
        </div>
        <p className="text-[13px] text-[#5F6A88]">No issues yet.</p>
        {onCreateNew && (
          <button
            onClick={onCreateNew}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#007BFF] hover:text-[#0063D6] cursor-pointer transition-colors"
          >
            <Plus size={13} /> New Issue
          </button>
        )}
      </div>
    );
  }

  if (issues.length === 0 && hasActiveFilters) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-10 h-10 rounded-full bg-[#EDF0F7] flex items-center justify-center">
          <SearchX size={18} className="text-[#5F6A88]" />
        </div>
        <p className="text-[13px] text-[#5F6A88]">No issues match your filters.</p>
        <button
          onClick={onClearFilters}
          className="text-[12px] font-semibold text-[#007BFF] hover:text-[#0063D6] cursor-pointer transition-colors"
        >
          Clear filters
        </button>
      </div>
    );
  }

  const GRID = "grid-cols-[32px_1fr_160px_160px_108px_120px_48px]";

  return (
    <div className="h-full flex flex-col min-h-0">
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-8 py-2 bg-[#FFF3D6] border-b border-[#F5DFA0] shrink-0">
          <button
            onClick={() => setSelected(new Set())}
            className="flex items-center justify-center w-5 h-5 rounded hover:bg-[#F5DFA0] text-[#8A5A00] cursor-pointer transition-colors"
          >
            <X size={12} />
          </button>
          <span className="text-[12px] font-semibold text-[#8A5A00]">{selected.size}</span>
          <div className="w-px h-4 bg-[#F5DFA0] mx-1" />
          <Tooltip>
            <TooltipTrigger render={
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={deleting}
                aria-label="Trash"
                className="flex items-center justify-center w-6 h-6 rounded-full border border-[#C0392B]/40 bg-white text-[#C0392B] hover:bg-[#FDE8E6] cursor-pointer transition-colors disabled:opacity-45"
              >
                <Trash2 size={13} />
              </button>
            } />
            <TooltipContent side="top">Trash</TooltipContent>
          </Tooltip>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${selected.size} issue${selected.size === 1 ? "" : "s"}?`}
        body="This action is irreversible."
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        confirmDisabled={deleting}
        onConfirm={() => void handleBulkTrash()}
        onCancel={() => setConfirmOpen(false)}
      />

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-8 pb-5">
        {/* No overflow-hidden here — it would create its own clipping/scroll-container
            box and break the header's `sticky` positioning against the real scrolling
            ancestor above. Corner rounding is applied directly to the header (top) and
            the rows wrapper (bottom) instead. Top spacing is a margin on this card, not
            padding on the scroll container above — padding-top on a scroll container is
            part of its own scrollport padding box, so a `sticky top-0` descendant can
            never rise above it, leaving a permanent gap once stuck. Margin has no such
            floor: it scrolls away completely, then the header sticks flush. */}
        <div className="rounded-[14px] border border-[#E2E7F2] bg-white mt-5">

          <div ref={stickySentinelRef} className="h-0" />

          {/* Column headers */}
          <div className={`sticky top-0 z-10 grid ${GRID} items-center gap-3 px-4 py-2.5 border-b border-[#EDF0F7] bg-[#FAFBFE] ${headerStuck ? "rounded-t-none" : "rounded-t-[14px]"}`}>
            <input
              type="checkbox"
              checked={allSelected}
              disabled={allIds.length === 0}
              onChange={toggleAll}
              className="w-3.5 h-3.5 rounded border-[#A8B0C8] cursor-pointer accent-[#007BFF] disabled:cursor-not-allowed disabled:opacity-40"
            />
            <SortHeader label="Issue Name" active={sortKey === "title"} dir={sortDir} onClick={() => onToggleSort("title")} />
            <SortHeader label="Status" active={sortKey === "status"} dir={sortDir} onClick={() => onToggleSort("status")} />
            <span className="flex items-center gap-1 text-[11px] font-semibold text-[#5F6A88] uppercase tracking-wide">
              <Users size={11} /> Assignee
            </span>
            <SortHeader label="Due Date" active={sortKey === "due_date"} dir={sortDir} onClick={() => onToggleSort("due_date")} />
            <SortHeader label="Severity" active={sortKey === "severity"} dir={sortDir} onClick={() => onToggleSort("severity")} />
            <div /> {/* timer spacer */}
          </div>

          <div className="overflow-hidden rounded-b-[14px]">
          {sorted.map((issue) => {
            const norm = normalizeStatus(issue.status);
            const ss = STATUS_STYLE[norm] ?? STATUS_STYLE["open"];
            const sev = normalizeSeverity(issue.severity);
            const sv = SEVERITY_STYLE[sev] ?? SEVERITY_STYLE["None"];
            const due = formatDueDate(issue.due_date);
            const dueColor = getDueColor(issue.due_date);
            const isSelected = selected.has(issue.id);
            const perm = getIssueEditPermission(currentUserRole, currentUserId, issue);

            return (
              <div
                key={issue.id}
                className={`grid ${GRID} items-center gap-3 pl-4 pr-3 py-2.5 border-b border-[#EDF0F7] last:border-0 transition-colors group/row ${
                  isSelected ? "bg-[#F0F7FF]" : "hover:bg-[#F0F7FF]/60"
                }`}
              >
                {/* Checkbox — Task 285: only the creator (or admin/pm/super_admin) may select an
                    issue for bulk delete. Tooltip lives on a non-disabled <span> wrapper since a
                    disabled input doesn't reliably fire hover events in Chromium. */}
                {selectableIds.has(issue.id) ? (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleRow(issue.id)}
                    className="w-3.5 h-3.5 rounded border-[#E2E7F2] cursor-pointer accent-[#007BFF]"
                  />
                ) : (
                  <Tooltip>
                    <TooltipTrigger render={
                      <span className="inline-flex cursor-not-allowed">
                        <input
                          type="checkbox"
                          disabled
                          className="w-3.5 h-3.5 rounded border-[#E2E7F2] opacity-40 pointer-events-none"
                        />
                      </span>
                    } />
                    <TooltipContent side="top">You&apos;re restricted from taking action on this issue</TooltipContent>
                  </Tooltip>
                )}

                <div className="flex items-center gap-1 min-w-0">
                  <Link href={getHref(issue)} className="text-left min-w-0 cursor-pointer group flex-1">
                    <span className="text-[13px] text-[#3A4565] truncate block group-hover:text-[#007BFF] transition-colors font-medium">
                      {decodeHtmlEntities(issue.title)}
                    </span>
                  </Link>
                  <CopyLinkButton
                    url={getHref(issue)}
                    size={13}
                    className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 p-1 rounded text-[#94A0BE] hover:text-[#007BFF] hover:bg-[#EDF0F7] transition-colors shrink-0 cursor-pointer"
                  />
                </div>

                <select
                  value={norm}
                  onChange={(e) => void onUpdate(issue.id, { status: e.target.value })}
                  className="text-[11px] font-semibold rounded-full border px-2.5 py-0.5 outline-none cursor-pointer appearance-none w-full truncate"
                  style={{ color: ss.text, background: ss.bg, borderColor: ss.border }}
                >
                  {STATUS_OPTS.map((s) => (
                    <option key={s} value={s} className="bg-white text-[#3A4565]">{STATUS_LABEL[s]}</option>
                  ))}
                </select>

                <IssueAssigneePicker issue={issue} allMembers={allMembers} onUpdate={onUpdate} />

                <span className={`text-[12px] font-medium tabular-nums ${dueColor}`}>{due ?? "—"}</span>

                <select
                  value={sev}
                  onChange={(e) => void onUpdate(issue.id, { severity: e.target.value as IssueSeverity })}
                  className="text-[12px] font-medium outline-none cursor-pointer appearance-none bg-transparent w-full"
                  style={{ color: sv.text }}
                >
                  {(["Show stopper", "Critical", "Major", "Minor", "None"] as const).map((s) => (
                    <option key={s} value={s} className="bg-white text-[#3A4565]">{SEVERITY_STYLE[s].label}</option>
                  ))}
                </select>

                <div className="flex items-center justify-center">
                  {perm.canStartTimer && (
                    <TaskTimerButton
                      issueId={issue.id}
                      projectId={issue.project_id}
                      prominent
                    />
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SortHeader({
  label, active, dir, onClick,
}: {
  label: string; active: boolean; dir: IssueSortDir; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-[11px] font-semibold text-[#5F6A88] uppercase tracking-wide hover:text-[#0B1533] cursor-pointer transition-colors"
    >
      {label}
      {active && <span className="text-[9px]">{dir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}
