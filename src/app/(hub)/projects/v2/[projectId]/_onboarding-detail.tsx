"use client";

import { useEffect, useRef, useState, forwardRef, type HTMLAttributes } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  CalendarClock, PlayCircle, ArrowLeft, Locate, ShieldAlert,
  ClipboardList, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  PROGRAMME_PHASES, DEFAULT_PROGRAMME_DAYS,
  buildOrderedPhasePlan, resolveEffectivePhaseNumber,
  type CustomPhaseSeed,
} from "@/config/customer-phases";
import type { OnboardingInternalDeliverableRow, Database } from "@/types/database";
import { buildDisplayPhases, uiPhaseStatus, type ProgrammeDeliverableRow, type ProgrammePhaseRow } from "@/lib/programme/view-model";
import { isProgrammeComplete } from "@/lib/programme/programme-status";
import { isRoleGatedByMembership, canManagePhase1Membership } from "@/lib/programme/membership-rules";
import OnboardingWizard from "./_onboarding-wizard";
import { DELIVERABLE_WORKSPACE_TARGET, buildWorkspaceQueryString } from "./onboarding-workspace/_workspace-url-params";
import { StatusSummaryDrawer } from "./_status-summary-drawer";
import GenericPhaseView from "./_generic-phase-view";
import Swimlane from "./_swimlane";
import JumpToPhaseMenu from "./_jump-to-phase-menu";
import { GridHeader } from "./_date-column-header";
import { TimelineToolbar } from "./_timeline-toolbar";
import { ReminderStrip, buildReminders } from "./_timeline-reminders";
import { LiveUpdatesNotice, toLiveStatus, type LiveStatus } from "./_live-updates";
import { useGanttZoom } from "./_gantt-zoom-context";
import { useGanttScroll } from "./_use-gantt-scroll";
import { useTimelineFilters } from "./_use-timeline-filters";
import { countStackshift, ownerOptions } from "./_timeline-stats";
import { LABEL_WIDTH } from "./_gantt-shared";
import { currentDisplayDay, phaseAtDisplayDay } from "@/lib/programme/calendar";

// Re-exported so existing importers (progress cards) keep importing from here.
export { TOTAL_DAYS, PHASE_HEX, PHASE_TINT_HEX, addDays } from "./_gantt-shared";

// Shared shape for both project_members and phase_members rows (task 155 gave both an
// is_owner column, mirroring each other exactly). Exported: task 247's _generic-phase-view.tsx
// (same [projectId] route, not a cross-module import) reuses this shape for its own header.
export type MemberRow = { id: string; user_id: string; is_owner: boolean; full_name: string | null; role: string | null; avatar_url: string | null };

interface OnboardingDetailProps {
  project: {
    id: string;
    name: string;
    // Task 277 — uniform header's badge/subtitle fallback for generic-engine projects or before
    // any phase is active (ProjectStatusBadge) and when no classification exists (project_type).
    status: string;
    project_type: string;
    // Already fetched by `_load-detail-data.ts` (Onboarding Workspace's title-row chip) but not
    // previously typed through to this component — the uniform header's subtitle needs it too.
    classification: string | null;
    customer_id: string;
    project_id: string | null;
    company_name: string;
    contact_name: string | null;
    contact_email: string | null;
    primary_contact_phone: string | null;
    // Task 157: real owner display (replacing the static "Owner: Bert" config label) +
    // canManageProjectMembers/canSetProjectOwner's "is this caller the creator" check.
    created_by: string | null;
    created_by_name: string | null;
    // Task 251: the SSR-fetched copy — StackShift I's own not-started screen below still uses its
    // separate client-side fetchProgramme() state (`programmeStartedAt`), so this field is only
    // actually consumed by GenericPhaseView (passed through wholesale via the `project` prop).
    programme_started_at: string | null;
    // Chat follow-up to task 157: surfaces the New Project intake's "Save + Set Schedule" state
    // on the not-started card — when to expect auto-start and which phase, plus a way to
    // override it (start now, at the scheduled phase or a different one).
    scheduled_onboarding_start_at: string | null;
    scheduled_start_phase: number | null;
    // Task 247 — false for every classification except StackShift I (and StackShift II when the
    // PM opted into the engine at intake, task 239's use_default_phase_engine). Decides whether
    // this page renders the specialized customer_phases Timeline/Gantt below, or delegates to
    // _generic-phase-view.tsx for the generic milestones/tasklists/tasks model.
    uses_customer_phases_engine: boolean;
    // Task 248 — the intake-time skip/custom-phase selection (tasks 244/246), persisted
    // regardless of start mode. Drives the "not started"/scheduled screen's dynamic Start button
    // label + skip-aware Jump-to-phase menu, before any customer_phases row exists yet.
    draft_skip_phase_numbers: number[];
    draft_custom_phases: CustomPhaseSeed[];
  };
  // Task 150(c): set when the page's ?phase=&deliverable= query params resolved to a real
  // deliverable key (see _wizard-step-params.ts) — opens the wizard immediately on that step
  // instead of the closed Timeline. Undefined on the plain /portfolio-tracker/[projectId] URL.
  initialWizardStepKey?: string;
  // Task 146: pm/developer can view the Timeline read-only; pm additionally gets the Wizard
  // (read-only on steps 1-5/7, full Step 6 file/folder access) — developer never opens it.
  role: string | null;
  // Task 153/155/157: project/phase membership — gates Wizard entry for marketing/pm, drives
  // the owner/collaborator management UI, and who can manage project members/ownership.
  currentUserId: string;
  phase1Members: MemberRow[];
  projectMembers: MemberRow[];
  // Task 247 — only populated (by _load-detail-data.ts) when uses_customer_phases_engine is
  // false; empty arrays otherwise.
  milestones: Database["public"]["Tables"]["milestones"]["Row"][];
  tasklists: Database["public"]["Tables"]["tasklists"]["Row"][];
  genericTasks: Database["public"]["Tables"]["tasks"]["Row"][];
}


// ─── Stat chip ─────────────────────────────────────────────────────────────────

export function StatChip({ icon: Icon, label, value }: { icon?: LucideIcon; label: string; value: string | number }) {
  return (
    <div className="flex h-full items-center gap-2 rounded-lg border border-[#E2E7F2] bg-[#F4F6FB] px-3.5">
      {Icon && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[#5F6A88]">
          <Icon size={12} />
        </span>
      )}
      <div>
        <div className={cn("font-mono text-xl font-bold leading-tight text-[#0B1533]")}>{value}</div>
        <div className="whitespace-nowrap text-[9px] uppercase tracking-wide text-[#5F6A88]">{label}</div>
      </div>
    </div>
  );
}

// ─── Project settings: owner + collaborators (task 153/155/157) ───────────────────────────────
// Task 157: split into two independently-triggered panels (Set Project Owner / Add
// Collaborators) behind a Gear "Project Settings" menu, replacing the single merged panel
// behind an "Access" text button. Read-only avatar display lives in the header row itself
// (AvatarCircle/CollaboratorAvatars below); these panels are the management surfaces.

// Real shadcn/Base UI Tooltip (not a native `title` attribute) — mirrors `_onboarding-wizard.tsx`'s
// `IconTip` pattern (thin wrapper around Tooltip/TooltipTrigger's `render` prop).
function AvatarTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

// forwardRef so this can be used directly as an AvatarTip/TooltipTrigger render target (Base UI
// clones the child and attaches a ref + event handlers — a plain function component can't
// receive either) for the single-avatar call sites (Owner row, OwnerPanel's current owner).
export const AvatarCircle = forwardRef<HTMLDivElement, { name: string | null; avatarUrl?: string | null; size?: number; ring?: boolean } & HTMLAttributes<HTMLDivElement>>(
  ({ name, avatarUrl, size = 22, ring, className, style, ...props }, ref) => {
    const initials = (name ?? "?").split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
    const colors = ["#0063D6", "#6A48E0", "#0B8A93", "#B85512", "#177E48", "#44508A"];
    const bg = colors[(name ?? "?").charCodeAt(0) % colors.length];
    return (
      <div
        ref={ref}
        className={cn("flex shrink-0 items-center justify-center rounded-full font-bold text-white overflow-hidden", ring && "ring-2 ring-white", className)}
        style={{ width: size, height: size, fontSize: Math.max(8, size * 0.4), background: avatarUrl ? undefined : bg, ...style }}
        {...props}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Supabase-auth-provider avatar URL, not a static/optimizable asset
          <img src={avatarUrl} alt={name ?? "Unnamed"} className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </div>
    );
  }
);
AvatarCircle.displayName = "AvatarCircle";

export function CollaboratorAvatars({ members, max = 5 }: { members: MemberRow[]; max?: number }) {
  if (members.length === 0) return <span className="text-[11.5px] text-[#5F6A88]">None yet</span>;

  // A single collaborator has nothing to lift above — tooltip only, no hover animation.
  if (members.length === 1) {
    const m = members[0];
    return (
      <AvatarTip label={m.full_name ?? "Unnamed"}>
        <AvatarCircle name={m.full_name} avatarUrl={m.avatar_url} size={22} ring />
      </AvatarTip>
    );
  }

  const visible = members.slice(0, max);
  const overflow = members.length - visible.length;
  return (
    <div className="flex items-center">
      {visible.map((m, i) => (
        <AvatarTip key={m.user_id} label={m.full_name ?? "Unnamed"}>
          <motion.div
            className={cn("cursor-default", i > 0 && "-ml-1.5")}
            whileHover={{ y: -4, zIndex: 10 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
          >
            <AvatarCircle name={m.full_name} avatarUrl={m.avatar_url} size={22} ring />
          </motion.div>
        </AvatarTip>
      ))}
      {overflow > 0 && (
        <div className="-ml-1.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#E2E7F2] text-[9px] font-bold text-[#5F6A88] ring-2 ring-white">
          +{overflow}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingDetail({
  project, initialWizardStepKey, role, currentUserId, phase1Members: initialPhase1Members, projectMembers: initialProjectMembers,
  milestones: initialMilestones, tasklists: initialTasklists, genericTasks: initialGenericTasks,
}: OnboardingDetailProps) {
  const router = useRouter();
  // Task 150(b): the URL segment is the human-readable project_id, not the UUID — falls back
  // to id for the rare legacy row where project_id is unexpectedly null (migration 066).
  const projectUrlKey = project.project_id ?? project.id;
  // Task 146: marketing/admin/super_admin keep full phase-management actions (Start/Jump);
  // pm/developer are view-only at the phase-status level — pm's one write surface is Step 6's
  // file/folder actions inside the Wizard, not anything here on the Timeline.
  const canManagePhases = role !== "pm" && role !== "developer";
  const canOpenWizard = role !== "developer";
  // Task 148: schedule drag-resize/move follows customer_deliverables' own write RLS
  // (migration 070/071) — admin/super_admin/marketing only, independent of canManagePhases.
  const canEditSchedule = role === "admin" || role === "super_admin" || role === "marketing";
  // Task 433: adding a programme deliverable also allows pm (the API inserts with adminClient — see its route comment).
  const canAddDeliverable = canEditSchedule || role === "pm";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [programmeStartedAt, setProgrammeStartedAt] = useState<string | null>(null);
  // Task 239 — StackShift I's configurable programme length; defaults to 120 until the fetch
  // below resolves, matching every project's DB default.
  const [programmeDurationDays, setProgrammeDurationDays] = useState<number>(DEFAULT_PROGRAMME_DAYS);
  const [phases, setPhases] = useState<ProgrammePhaseRow[]>([]);
  const [deliverables, setDeliverables] = useState<ProgrammeDeliverableRow[]>([]);
  const [internalDeliverables, setInternalDeliverables] = useState<OnboardingInternalDeliverableRow[]>([]);
  const [collapsedPhases, setCollapsedPhases] = useState<Set<number>>(new Set());
  // Chat follow-up: default collapse state — only the active phase starts expanded, every other
  // phase (skipped, not-started, or completed) starts collapsed. Applied once, the first time
  // `phases` loads, so it doesn't fight a PM's own later manual expand/collapse on refetch (e.g.
  // after a Jump-to-phase action).
  const collapseDefaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (collapseDefaultsAppliedRef.current || phases.length === 0) return;
    collapseDefaultsAppliedRef.current = true;
    const active = phases.find((p) => p.status === "active")?.phase_number;
    setCollapsedPhases(new Set(phases.filter((p) => p.phase_number !== active).map((p) => p.phase_number)));
  }, [phases]);
  const [expandedDeliverable, setExpandedDeliverable] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(!!initialWizardStepKey);
  const [wizardStartStepKey, setWizardStartStepKey] = useState<string | undefined>(initialWizardStepKey);
  const [starting, setStarting] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpNote, setJumpNote] = useState("");
  const [jumping, setJumping] = useState(false);
  // Scheduled-start card's "Select Phase" alternative — excludes the already-scheduled phase.
  // Task 248: now sourced from this project's actual orderedPlan (defaults + any customs from
  // project.draft_custom_phases, computed inline below) instead of the static PROGRAMME_PHASES —
  // closes the previously-documented gap where a project's intake-time custom phases were only
  // ever persisted for an immediate mode:"start" submission, never for one reaching this
  // "not started yet" screen later. number (not 1|2|3|4|5) since resolveEffectivePhaseNumber's
  // generalized signature takes a plain number.
  const [altPhase, setAltPhase] = useState<number | null>(null);
  const isMountedRef = useRef(true);
  const phasesRef = useRef<ProgrammePhaseRow[]>([]);
  useEffect(() => { phasesRef.current = phases; }, [phases]);
  const { dayWidth } = useGanttZoom();
  const gantt = useGanttScroll(dayWidth);
  const { filters, update: updateFilters, clear: clearFilters } = useTimelineFilters();
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("live");

  // ─── Task 153/155/157: project/phase membership ────────────────────────────
  const [phase1Members, setPhase1Members] = useState<MemberRow[]>(initialPhase1Members);
  const [projectMembers, setProjectMembers] = useState<MemberRow[]>(initialProjectMembers);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [membershipError, setMembershipError] = useState<string | null>(null);

  const myPhase1Membership = phase1Members.find((m) => m.user_id === currentUserId) ?? null;
  const isPhase1Member = !!myPhase1Membership;
  const isPhase1Owner = !!myPhase1Membership?.is_owner;
  const phase1HasMembers = phase1Members.length > 0;
  const isProjectMember = projectMembers.some((m) => m.user_id === currentUserId);
  // pm is the project's manager, not a phase-specific contributor like marketing — being on the
  // project (project_members) is sufficient for them, so they don't need a separate opt-in to
  // the phase_members(phase_number=1) table just to see their own project's Phase 1 content.
  // marketing stays phase-gated on phase1Members alone, per task 153 requirement 4's explicit
  // "marketing is also phase-gated, not just pm."
  const hasPhase1Access = isPhase1Member || (role === "pm" && isProjectMember);
  // Gated per requirement 4: marketing/pm without membership are blocked once the phase actually
  // has members; a phase with zero members is unrestricted (backward compatibility, see task
  // 153 doc — avoids locking out every already-in-progress onboarding on ship).
  const isPhase1Restricted = isRoleGatedByMembership(role) && phase1HasMembers && !hasPhase1Access;
  const canManagePhase1 = canManagePhase1Membership(role, { isMember: isPhase1Member, isOwner: isPhase1Owner });

  const refetchPhase1Members = async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/phases/1/members`);
      if (!res.ok) return;
      const data: { id: string; user_id: string; is_owner: boolean; profiles: { full_name: string | null; role: string; avatar_url: string | null } | null }[] = await res.json();
      setPhase1Members(
        data.map((m) => ({ id: m.id, user_id: m.user_id, is_owner: m.is_owner, full_name: m.profiles?.full_name ?? null, role: m.profiles?.role ?? null, avatar_url: m.profiles?.avatar_url ?? null }))
      );
    } catch { /* leave current state */ }
  };

  const refetchProjectMembers = async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/members`);
      if (!res.ok) return;
      const data: { id: string; user_id: string; is_owner: boolean; profiles: { full_name: string | null; role: string; avatar_url: string | null } | null }[] = await res.json();
      setProjectMembers(
        data.map((m) => ({ id: m.id, user_id: m.user_id, is_owner: m.is_owner, full_name: m.profiles?.full_name ?? null, role: m.profiles?.role ?? null, avatar_url: m.profiles?.avatar_url ?? null }))
      );
    } catch { /* leave current state */ }
  };

  const handleAddPhase1Member = async (userId: string) => {
    setMembershipBusy(true);
    setMembershipError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/phases/1/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) throw new Error();
      await refetchPhase1Members();
    } catch {
      setMembershipError("Failed to add phase member.");
    } finally {
      setMembershipBusy(false);
    }
  };

  const handleRemovePhase1Member = async (userId: string) => {
    setMembershipBusy(true);
    setMembershipError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/phases/1/members?user_id=${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to remove phase member");
      }
      await refetchPhase1Members();
    } catch (err) {
      setMembershipError(err instanceof Error ? err.message : "Failed to remove phase member.");
    } finally {
      setMembershipBusy(false);
    }
  };

  const handleTransferPhaseOwnership = async (userId: string) => {
    setMembershipBusy(true);
    setMembershipError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/phases/1/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) throw new Error();
      await refetchPhase1Members();
    } catch {
      setMembershipError("Failed to transfer phase ownership.");
    } finally {
      setMembershipBusy(false);
    }
  };

  const fetchProgramme = async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/programme`);
      if (!res.ok) throw new Error("Failed to load programme data");
      const data = await res.json();
      if (!isMountedRef.current) return;
      setProgrammeStartedAt(data.programme_started_at ?? null);
      setProgrammeDurationDays(data.project?.programme_duration_days ?? DEFAULT_PROGRAMME_DAYS);
      setPhases(data.phases ?? []);
      setDeliverables(data.deliverables ?? []);
      setInternalDeliverables(data.internal_deliverables ?? []);
      setError(null);
    } catch {
      if (isMountedRef.current) setError("Failed to load onboarding programme data.");
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    // Task 247: a generic-engine project never has customer_phases/programme_started_at data —
    // fetching it here would be a wasted request. loading defaults to true above only for the
    // customer_phases path; the generic branch (below, after all hooks) doesn't read `loading`.
    if (!project.uses_customer_phases_engine) return;
    isMountedRef.current = true;
    fetch(`/api/projects/${project.id}/programme`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load programme data");
        const data = await res.json();
        if (!isMountedRef.current) return;
        setProgrammeStartedAt(data.programme_started_at ?? null);
        setProgrammeDurationDays(data.project?.programme_duration_days ?? DEFAULT_PROGRAMME_DAYS);
        setPhases(data.phases ?? []);
        setDeliverables(data.deliverables ?? []);
        setInternalDeliverables(data.internal_deliverables ?? []);
        setError(null);
      })
      .catch(() => { if (isMountedRef.current) setError("Failed to load onboarding programme data."); })
      .finally(() => { if (isMountedRef.current) setLoading(false); });
    return () => { isMountedRef.current = false; };
  }, [project.id, project.uses_customer_phases_engine]);

  useEffect(() => {
    if (!project.uses_customer_phases_engine) return;
    let cancelled = false;
    const supabase = createClient();
    const channel = supabase
      .channel(`v2_onboarding_${project.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_phases", filter: `project_id=eq.${project.id}` }, (payload) => {
        const row = payload.new as ProgrammePhaseRow;
        if (!row?.id || row.source !== "programme") return;
        // The change feed carries the table row only — keep the flattened state columns we already hold.
        setPhases((prev) => {
          const idx = prev.findIndex((p) => p.id === row.id);
          if (idx === -1) return [...prev, { ...row, wizard_data: {}, is_manual_override: false, override_note: null, delay_note: null }].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
          const next = [...prev];
          next[idx] = { ...prev[idx], ...row };
          return next.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "project_deliverables", filter: `project_id=eq.${project.id}` }, (payload) => {
        const row = payload.new as ProgrammeDeliverableRow;
        if (!row?.id || row.source !== "programme") return;
        // The change feed carries no phase_number — derive it from the phase this row belongs to.
        setDeliverables((prev) => {
          const idx = prev.findIndex((d) => d.id === row.id);
          if (idx === -1) {
            const phaseNumber = phasesRef.current.find((p) => p.id === row.phase_id)?.phase_number;
            return phaseNumber == null ? prev : [...prev, { ...row, phase_number: phaseNumber }];
          }
          const next = [...prev];
          next[idx] = { ...prev[idx], ...row };
          return next;
        });
      })
      .subscribe((status) => {
        const next = toLiveStatus(status);
        if (!cancelled && next) setLiveStatus(next);
      });
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [project.id, project.uses_customer_phases_engine]);

  const handleStart = async () => {
    setStarting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/start`, { method: "POST" });
      if (!res.ok) throw new Error();
      await fetchProgramme();
    } catch {
      setError("Failed to start the 120-Day Programme.");
    } finally {
      setStarting(false);
    }
  };

  const handleJump = async (phaseNumber: number) => {
    setJumping(true);
    try {
      // Task 248: relay this project's persisted intake-time skip/custom-phase selection —
      // the route already supports both fields (its not-started branch seeds through
      // seedProgrammeAtPhase using them), but this call site never sent them, so a Draft
      // project's skip/custom configuration was previously lost the moment a PM used "Jump to
      // phase" instead of the plain Start button. Harmless to always include: the route's
      // already-started branch re-statuses from the DB's own stored phases and ignores both
      // fields entirely.
      const res = await fetch(`/api/projects/${project.id}/programme/phase`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase_number: phaseNumber,
          note: jumpNote.trim() || undefined,
          skip_phase_numbers: project.draft_skip_phase_numbers,
          custom_phases: project.draft_custom_phases,
        }),
      });
      if (!res.ok) throw new Error();
      setJumpOpen(false);
      setJumpNote("");
      await fetchProgramme();
    } catch {
      setError("Failed to update the programme phase.");
    } finally {
      setJumping(false);
    }
  };

  // Scheduled-start card's "Start ... Anyway" and "Proceed" both need this: Phase 1 goes
  // through handleStart (assigns the starter as Phase 1 owner, task 153) same as the normal
  // Start Onboarding button; any other phase goes through the existing Jump-to-phase override,
  // which never assigns phase ownership — phase_members only has a concept for Phase 1.
  const startAtPhase = (phaseNumber: number) => (phaseNumber === 1 ? handleStart() : handleJump(phaseNumber));

  // Task 222 — swimlane deliverable cards now open the Onboarding Workspace (tabbed rebuild)
  // instead of the inline Onboarding Wizard, deep-linked to that deliverable's mapped
  // tab/folder (see _workspace-url-params.ts). The inline Wizard (wizardOpen/OnboardingWizard
  // below) stays reachable only via a direct ?phase=&deliverable= URL hit — untouched here.
  const handleOpenWizardStep = (deliverableKey: string) => {
    const target = DELIVERABLE_WORKSPACE_TARGET[deliverableKey] ?? { tab: "business-info" as const };
    const qs = buildWorkspaceQueryString(target.tab, target.folderPath);
    // Task 276 (Phase 3) — was `${V2_ROUTES.PORTFOLIO_TRACKER}/${projectUrlKey}/onboarding-workspace?...`.
    router.push(`/projects/v2/${projectUrlKey}/onboarding-workspace?${qs}`, { scroll: false });
  };

  // Task 241 — Phase 1 keeps its task-222 destination (Onboarding Workspace) unchanged; Phase 2-5
  // deliverable cards (newly interactive) go to Projects > Tasks instead, scoped to that
  // deliverable's tasklist when the mapping is known. A project whose programme started before
  // this shipped has no Phase 2-5 tasklists seeded — falls back to a bare /tasks link rather than
  // erroring.
  const handleOpenPhaseDeliverable = (phaseNumber: number, deliverableKey: string) => {
    if (phaseNumber === 1) {
      handleOpenWizardStep(deliverableKey);
      return;
    }
    // Task 429: a programme deliverable row IS the tasklist (same id), so no external_id lookup.
    const tasklistId = deliverables.find((d) => d.phase_number === phaseNumber && d.deliverable_key === deliverableKey)?.id;
    // Task 276 (Phase 3) — was `${V2_ROUTES.PROJECTS}/...` (legacy `/projects-old` module). This
    // V2 project now has its own Tasks tab under the same basePath, so the deliverable card should
    // stay within the unified `/projects/v2` detail page rather than leaving it.
    router.push(
      tasklistId ? `/projects/v2/${projectUrlKey}/tasks?tasklist=${tasklistId}` : `/projects/v2/${projectUrlKey}/tasks`
    );
  };

  // Task 433: merge a freshly-added deliverable; the realtime INSERT event may deliver the same row, so dedupe by id.
  const handleDeliverableAdded = (row: ProgrammeDeliverableRow) =>
    setDeliverables((prev) => (prev.some((d) => d.id === row.id) ? prev : [...prev, row]));

  // Task 429 (decision D-B): rows store display-scale days, which is exactly what the drag UI works in — no conversion either way.
  // Task 421: resolves false on failure (after reverting) so the card can show its own inline error.
  const handleScheduleChange = async (phaseNumber: number, deliverableKey: string, dayStart: number, dayEnd: number): Promise<boolean> => {
    const previous = deliverables;
    setDeliverables((prev) =>
      prev.map((d) =>
        d.phase_number === phaseNumber && d.deliverable_key === deliverableKey
          ? { ...d, day_start: dayStart, day_end: dayEnd }
          : d
      )
    );
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/deliverables/${deliverableKey}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase_number: phaseNumber, day_start: dayStart, day_end: dayEnd }),
      });
      if (!res.ok) throw new Error();
      return true;
    } catch {
      setDeliverables(previous);
      setError("Failed to save the schedule change — reverted.");
      return false;
    }
  };

  // Task 160: whether Phase 1 is still the DB's active phase — computed from `phases` directly
  // (not the later `phaseStatusMap`, which is declared further down and unreachable from the
  // early-return branches below due to `const` temporal-dead-zone rules).
  const isPhaseActive = phases.find((p) => p.phase_number === 1)?.status === "active";

  // Task 283 — the header (title/badge/subtitle/secondary row/settings gear/tab strip) is now
  // rendered once by `(tabs)/layout.tsx`, not per-page — was previously bundled into a `backLink`/
  // `mainBackLink` JSX const referenced from every render branch below (main, restricted,
  // wizardOpen, loading, not-started) AND passed as a prop into `GenericPhaseView`, which fully
  // unmounted/remounted on every tab click (visible header flash). "Set Project Owner"/"Manage
  // Collaborators" now route to the Members tab (via the shared header) instead of opening
  // Timeline's own inline OwnerPanel/CollaboratorsPanel below, since the header lives in a
  // separate React subtree from this page's content and can't reach into it directly.

  // Task 247: a project not on the specialized customer_phases engine never has a Wizard, a
  // customer_phases-backed Timeline, or a `programme_started_at` — delegate entirely to the
  // generic milestones/tasklists/tasks view instead of falling into the StackShift-shaped
  // "not started" screen below. Placed after every hook above (Rules of Hooks) but before any
  // StackShift-only state (wizardOpen/isPhase1Restricted/programmeStartedAt) is used.
  if (!project.uses_customer_phases_engine) {
    return (
      <GenericPhaseView
        project={project}
        projectUrlKey={projectUrlKey}
        initialMilestones={initialMilestones}
        tasklists={initialTasklists}
        tasks={initialGenericTasks}
        canManagePhases={canManagePhases}
        canAddDeliverable={canAddDeliverable}
      />
    );
  }

  if (wizardOpen && isPhase1Restricted) {
    return (
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#F4F6FB] px-7 py-8">
          <div className={cn("mx-auto max-w-[560px] rounded-2xl border p-10 text-center", "border-[#F5C6C2] bg-white shadow-[0_4px_24px_rgba(15,23,42,0.07)]")}>
            <ShieldAlert size={32} className="mx-auto mb-4 text-[#C0392B]" />
            <div className={cn("mb-2 text-lg font-bold", "text-[#0B1533]")}>Restricted</div>
            <p className={cn("mx-auto max-w-md text-[13px]", "text-[#5F6A88]")}>
              You are restricted from accessing this phase. If this is an error, please contact
              your administrator.
            </p>
            <button
              type="button"
              onClick={() => { setWizardOpen(false); router.push(`/projects/v2/${projectUrlKey}/timeline`, { scroll: false }); }}
              className={cn("mt-6 inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors", "border-[#E2E7F2] bg-white text-[#3A4565] hover:bg-[#F4F6FB]")}
            >
              <ArrowLeft size={14} /> Back to Timeline
            </button>
          </div>
        </div>
    );
  }

  if (wizardOpen) {
    return (
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#F4F6FB] px-7 py-8">
          <OnboardingWizard
            project={project}
            deliverables={deliverables.filter((d) => d.phase_number === 1)}
            internalDeliverables={internalDeliverables}
            wizardData={(phases.find((p) => p.phase_number === 1)?.wizard_data as Record<string, unknown>) ?? {}}
            currentDay={programmeStartedAt ? currentDisplayDay(programmeStartedAt) : 1}
            role={role}
            isPhaseActive={isPhaseActive}
            initialStepKey={wizardStartStepKey}
            onBack={() => {
              setWizardOpen(false);
              setWizardStartStepKey(undefined);
              router.push(`/projects/v2/${projectUrlKey}/timeline`, { scroll: false });
              fetchProgramme();
              // Task 157 fix: adding a phase member inside the Wizard's own PhaseAccessPanel
              // also auto-adds a project_members row (task 156) — without this, the Timeline's
              // own projectMembers/phase1Members state went stale until a full page reload.
              refetchPhase1Members();
              refetchProjectMembers();
            }}
            onDeliverableChange={(updated) => setDeliverables((prev) => prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)))}
            onInternalDeliverableChange={(updated) => setInternalDeliverables((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))}
            canManagePhase1={canManagePhase1}
            phase1Members={phase1Members}
            phase1Busy={membershipBusy}
            phase1Error={membershipError}
            onAddPhase1Member={handleAddPhase1Member}
            onRemovePhase1Member={handleRemovePhase1Member}
            onTransferPhaseOwnership={handleTransferPhaseOwnership}
          />
        </div>
    );
  }

  if (loading) {
    return (
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#F4F6FB] px-7 py-8">
          <div className="py-12 text-center text-[13px] text-[#5F6A88]">Loading onboarding programme…</div>
        </div>
    );
  }

  if (!programmeStartedAt) {
    const hasSchedule = !!project.scheduled_onboarding_start_at;
    // Task 248: this project's actual phase set (defaults minus any skipped, plus any customs
    // configured at intake) — merged and sort_order-ordered the same way seed.ts's own
    // buildSeedPhaseEntries resolves it at actual seed time, so the button label/Jump-to-phase
    // menu shown here never disagrees with what clicking them will actually seed.
    const orderedPlan = buildOrderedPhasePlan(project.draft_custom_phases);
    const skipSet = new Set(project.draft_skip_phase_numbers);
    const firstActivePhase = orderedPlan.find((p) => !skipSet.has(p.number)) ?? orderedPlan[0] ?? PROGRAMME_PHASES[0];

    // scheduled_start_phase (the literal phase a schedule targets) stays capped to the 5 defaults
    // by POST /api/onboarding/projects' own validation (1-5). It defaults to Phase 1 whenever the
    // New Project form's "Start at phase" selector was left untouched — including when the PM
    // instead skipped Phase 1 via the phase builder's own per-phase checkbox, which doesn't sync
    // that selector. Resolved the same way seedAndStartProgramme itself resolves it at actual
    // auto-start time (resolveEffectivePhaseNumber's before/target/after cascade), so this card
    // never advertises a phase that will never run — it shows whichever phase will actually start.
    const rawScheduledPhaseNumber = (project.scheduled_start_phase ?? 1) as number;
    const scheduledPhaseNumber = resolveEffectivePhaseNumber(orderedPlan, rawScheduledPhaseNumber, project.draft_skip_phase_numbers);
    const scheduledPhase = orderedPlan.find((p) => p.number === scheduledPhaseNumber) ?? firstActivePhase;
    const scheduledDate = project.scheduled_onboarding_start_at ? new Date(project.scheduled_onboarding_start_at) : null;
    const busy = starting || jumping;

    return (
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#F4F6FB] px-7 py-8">
        <div className="mx-auto max-w-[560px] rounded-2xl border border-[#E2E7F2] bg-white p-10 text-center shadow-[0_4px_24px_rgba(15,23,42,0.07)]">
          <CalendarClock size={32} className="mx-auto mb-4 text-[#5F6A88]" />
          <div className={cn("text-lg font-bold text-[#0B1533]")}>{project.name}</div>
          <div className="mb-3 text-[13px] text-[#5F6A88]">{project.company_name}</div>

          {hasSchedule ? (
            <div className="mx-auto mb-6 max-w-md rounded-[10px] border border-[#F0D896] bg-[#FFF3D6] px-4 py-3 text-left">
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#8A5A00]">
                <CalendarClock size={14} /> Scheduled to auto-start
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#8A5A00]">
                Phase {scheduledPhaseNumber}: {scheduledPhase.name} will start automatically on{" "}
                {scheduledDate?.toLocaleString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
                .
              </p>
            </div>
          ) : (
            <p className="mx-auto mb-6 max-w-md text-[13px] text-[#5F6A88]">
              Start the {programmeDurationDays}-day programme to begin tracking Phase 1 — or jump straight to whichever phase they&apos;re actually starting from.
            </p>
          )}

          {error && <p className="mb-3 text-xs text-[#C0392B]">{error}</p>}

          {canManagePhases ? (
            hasSchedule ? (
              <div className="flex flex-col items-center gap-4">
                <button
                  type="button"
                  onClick={() => startAtPhase(scheduledPhaseNumber)}
                  disabled={busy}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-[#007BFF] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(0,123,255,0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <PlayCircle size={15} /> {busy ? "Starting…" : `Start Phase ${scheduledPhaseNumber}: ${scheduledPhase.name} Anyway`}
                </button>

                <div className="flex w-full items-center gap-3">
                  <div className="h-px flex-1 bg-[#E2E7F2]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#5F6A88]">OR</span>
                  <div className="h-px flex-1 bg-[#E2E7F2]" />
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <select
                      value={altPhase ?? ""}
                      onChange={(e) => setAltPhase(e.target.value ? Number(e.target.value) : null)}
                      disabled={busy}
                      className="h-9 cursor-pointer appearance-none rounded-[9px] border-[1.5px] border-[#E2E7F2] bg-white py-1.5 pl-3 pr-8 text-[13px] text-[#0B1533] outline-none transition-colors focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] disabled:cursor-not-allowed disabled:opacity-60"
                      style={{
                        backgroundImage:
                          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2394a3b8'/%3E%3C/svg%3E\")",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 12px center",
                      }}
                    >
                      <option value="">Select Phase</option>
                      {orderedPlan
                        .filter((p) => p.number !== scheduledPhaseNumber)
                        .map((p) => (
                          <option key={p.number} value={p.number} disabled={skipSet.has(p.number)}>
                            Phase {p.number}: {p.name}
                            {skipSet.has(p.number) ? " (Skipped)" : ""}
                          </option>
                        ))}
                    </select>
                  </div>
                  {altPhase && (
                    <button
                      type="button"
                      onClick={() => startAtPhase(altPhase)}
                      disabled={busy}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-[#007BFF] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(0,123,255,0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      <PlayCircle size={15} /> {busy ? "Starting…" : "Proceed"}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => startAtPhase(firstActivePhase.number)}
                  disabled={starting}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-[#007BFF] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(0,123,255,0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <PlayCircle size={15} /> {starting ? "Starting…" : `Start ${firstActivePhase.name}`}
                </button>
                <JumpToPhaseMenu
                  open={jumpOpen}
                  setOpen={setJumpOpen}
                  note={jumpNote}
                  setNote={setJumpNote}
                  onJump={handleJump}
                  jumping={jumping}
                  phases={orderedPlan}
                  skipSet={skipSet}
                />
              </div>
            )
          ) : (
            <p className="text-[12.5px] text-[#5F6A88]">Not started yet — Marketing manages the programme start date.</p>
          )}
        </div>
        </div>
    );
  }

  const currentDay = currentDisplayDay(programmeStartedAt);
  const startDate = new Date(programmeStartedAt);
  // Task 429 (WP5): rows already hold display-scale, skip-compressed days (decision D-B), so the phase set is built straight from them —
  // no reference → compressed → display pipeline. Permanently skipped phases keep status `skipped` and draw no days.
  const displayPhases = buildDisplayPhases(phases, deliverables);
  const activePhaseNumber = phases.find((p) => p.status === "active")?.phase_number ?? phaseAtDisplayDay(currentDay, programmeDurationDays).number;
  const isComplete = isProgrammeComplete(phases);
  // The Swimlane/toolbar/reminder helpers speak the legacy status vocabulary (a bypassed phase renders as skipped, as before).
  const phaseStatusMap = new Map(phases.map((p) => [p.phase_number, uiPhaseStatus(p.status)]));
  // This project's *permanently* excluded phases (intake-time `draft_skip_phase_numbers`) — a merely time-bypassed phase keeps its days
  // and stays jumpable.
  const startedSkipNumbers = project.draft_skip_phase_numbers;
  // Grid columns: the last planned display day, never shorter than the programme's own displayed length.
  const permanentlySkipped = new Set(phases.filter((p) => p.status === "skipped").map((p) => p.phase_number));
  const visibleDurationDays = Math.max(1, ...displayPhases.filter((p) => !permanentlySkipped.has(p.number)).map((p) => p.dayEnd));
  // Task 281 — progress-bar/stat-chip stats (progressPct, programmeOverdue, daysOverdue120,
  // totalDeliverables, doneDeliverables, phasesCompleted, daysRemaining) moved to the Overview
  // tab (`_use-programme-progress.ts` computes the identical values via the same
  // `@/config/customer-phases` functions) — Timeline no longer renders that card, so they're no
  // longer computed here.
  const deliverableStatusMap = new Map(deliverables.map((d) => [d.deliverable_key, d.status]));
  const { items: reminders, more: remindersMore } = buildReminders(currentDay, phaseStatusMap, deliverableStatusMap, displayPhases, programmeDurationDays);
  const internalByKey = new Map(internalDeliverables.map((d) => [d.deliverable_key, d]));

  // Task 253: the grid's own axis is now visibleDurationDays (real, scaled days — see the `days`
  // array below), the same scale currentDay already lives on, so the "today" marker needs no
  // conversion anymore — it used to unscale onto the (skip-)compressed *reference* scale the grid
  // used to render on before this task moved the grid itself onto the display-scaled axis.
  const gridMarkerDay = currentDay;

  // Task 422: filter toolbar inputs — phases whose DB status is "skipped" show no cards.
  const skippedPhaseNumbers = new Set(phases.filter((p) => p.status === "skipped").map((p) => p.phase_number));
  const filterCount = countStackshift(displayPhases, skippedPhaseNumbers, deliverableStatusMap, internalByKey, currentDay, filters);

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto bg-[#F4F6FB] px-7 py-8">
      <div className="flex flex-col gap-4">
        {error && <p className="text-xs text-[#C0392B]">{error}</p>}

        {/* Task 281 (items 6/8) — Reminders + Jump to Phase / Onboarding Workspace / Status
            Summary, one row above the swimlane, vertically centered together. Previously the
            Reminders strip was its own row and the buttons lived in the now-removed Header card. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-start gap-2">
            <ReminderStrip items={reminders} more={remindersMore} />
            <LiveUpdatesNotice status={liveStatus} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canManagePhases && (
              <JumpToPhaseMenu
                open={jumpOpen}
                setOpen={setJumpOpen}
                note={jumpNote}
                setNote={setJumpNote}
                onJump={handleJump}
                jumping={jumping}
                phases={displayPhases}
                skipSet={new Set(startedSkipNumbers)}
                currentPhaseNumber={activePhaseNumber}
              />
            )}
            <button
              type="button"
              onClick={() => setSummaryOpen(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#E2E7F2] bg-white px-3.5 py-2 text-[12px] font-semibold text-[#3A4565] transition-colors hover:border-[#A8C6F5] hover:text-[#007BFF]"
            >
              <ClipboardList size={13} /> Status Summary
            </button>
            {/* Task 282 (item H) — moved after Status Summary so it's the last (rightmost)
                button in this row. Chat follow-up: also requires Phase 1's own row not be
                skipped — every project still gets a phase_number 1 row regardless (seed.ts), so
                the bare existence check alone can't tell a real Phase 1 apart from an excluded
                one. */}
            {!isComplete && phases.some((p) => p.phase_number === 1 && p.status !== "skipped") && canOpenWizard && (
              <button
                type="button"
                onClick={() => {
                  router.push(`/projects/v2/${projectUrlKey}/onboarding-workspace`);
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-[#007BFF] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(0,123,255,0.3)] transition-colors hover:bg-[#0063D6]"
              >
                <PlayCircle size={14} /> {activePhaseNumber === 1 ? "Onboarding Workspace" : "View Onboarding Workspace"}
              </button>
            )}
          </div>
        </div>

        <TimelineToolbar
          filters={filters}
          onChange={updateFilters}
          onClear={clearFilters}
          shown={filterCount.shown}
          total={filterCount.total}
          owners={ownerOptions(displayPhases)}
        />

        {/* Gantt grid */}
        <div className="relative rounded-2xl border border-[#E2E7F2] bg-white pt-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <div
            ref={gantt.bindGrid(gridMarkerDay)}
            className="overflow-x-auto rounded-2xl"
          >
            <div className="relative" style={{ width: LABEL_WIDTH + visibleDurationDays * dayWidth }}>
              <GridHeader startDate={startDate} totalDays={visibleDurationDays} todayDay={gridMarkerDay} />

              {gridMarkerDay <= visibleDurationDays && (
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-2 w-0 border-l-2 border-dashed border-[#FB914E]"
                  style={{ left: LABEL_WIDTH + (gridMarkerDay - 1) * dayWidth + dayWidth / 2 }}
                >
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded border border-[#F9C9A0] bg-[#FFEFE3] px-1.5 py-0.5 text-[9px] font-bold text-[#FB914E]">
                    Day {gridMarkerDay}
                  </div>
                </div>
              )}

              {displayPhases.map((phase, index) => (
                <Swimlane
                  key={phase.number}
                  phase={phase}
                  dbStatus={phaseStatusMap.get(phase.number) ?? "not_started"}
                  deliverableStatusMap={deliverableStatusMap}
                  internalByKey={internalByKey}
                  collapsed={collapsedPhases.has(phase.number)}
                  onToggleCollapse={() =>
                    setCollapsedPhases((prev) => {
                      const next = new Set(prev);
                      if (next.has(phase.number)) next.delete(phase.number);
                      else next.add(phase.number);
                      return next;
                    })
                  }
                  onOpenDeliverable={handleOpenPhaseDeliverable}
                  expandedDeliverable={expandedDeliverable}
                  onExpandDeliverable={setExpandedDeliverable}
                  canEditSchedule={canEditSchedule}
                  onScheduleChange={handleScheduleChange}
                  index={index}
                  startDate={startDate}
                  role={role}
                  totalDays={visibleDurationDays}
                  currentDay={currentDay}
                  filters={filters}
                  projectId={project.id}
                  onDeliverableAdded={canAddDeliverable ? handleDeliverableAdded : undefined}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      </div>

      <button
        type="button"
        onClick={() => gantt.scrollToToday(gridMarkerDay)}
        aria-label="Jump to today"
        className="fixed bottom-8 right-8 z-40 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-none bg-[#FB914E] text-white shadow-[0_4px_16px_rgba(251,145,78,0.4)] transition-transform hover:scale-105"
      >
        <Locate size={20} />
      </button>

      <StatusSummaryDrawer open={summaryOpen} onClose={() => setSummaryOpen(false)} projectUuid={project.id} />
    </>
  );
}
