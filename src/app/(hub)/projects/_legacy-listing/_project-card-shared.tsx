"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Chip } from "../../dashboard/_components/dashboard-shared";

// ─── v2.0 avatar stack (page-scoped, extracted from _projects-index.tsx — task 263) ───────────
// Mirrors _onboarding-list.tsx's own local AvatarStack/AvatarTip implementation —
// not shared, since the Projects list and Onboarding are unrelated feature areas
// (same "page-scoped UI" reasoning that file's own comment documents), and
// _pm-shared.tsx's OwnerChip is still v1-styled and shared by the not-yet-migrated
// Projects kanban/detail views (see task 185's blast-radius boundary).

const AVATAR_COLORS = ["#0063D6", "#6A48E0", "#0B8A93", "#B85512", "#177E48", "#44508A"];
const MAX_VISIBLE_AVATARS = 5;

function initialsFor(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function colorFor(name: string | null): string {
  if (!name) return "#5F6A88";
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function AvatarTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

// Falls back to a single owner_name-derived bubble when a project has no project_members
// rows (expected for Legacy/Zoho-imported projects, which predate native membership).
export function AvatarStack({ members, fallbackName }: { members: { id: string; full_name: string | null }[]; fallbackName: string | null }) {
  if (members.length === 0) {
    if (!fallbackName) return <span className="text-[11px] text-[#5F6A88]">Unassigned</span>;
    return (
      <AvatarTip label={fallbackName}>
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white ring-2 ring-white shrink-0"
          style={{ background: colorFor(fallbackName) }}
        >
          {initialsFor(fallbackName)}
        </div>
      </AvatarTip>
    );
  }

  if (members.length === 1) {
    const m = members[0];
    return (
      <AvatarTip label={m.full_name ?? "Unnamed"}>
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white ring-2 ring-white shrink-0"
          style={{ background: colorFor(m.full_name) }}
        >
          {initialsFor(m.full_name)}
        </div>
      </AvatarTip>
    );
  }

  const visible = members.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = members.length - visible.length;
  return (
    <div className="flex items-center">
      {visible.map((m, i) => (
        <AvatarTip key={m.id} label={m.full_name ?? "Unnamed"}>
          <motion.div
            className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white ring-2 ring-white shrink-0 cursor-default", i > 0 && "-ml-2")}
            style={{ background: colorFor(m.full_name) }}
            whileHover={{ y: -4, zIndex: 10 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
          >
            {initialsFor(m.full_name)}
          </motion.div>
        </AvatarTip>
      ))}
      {overflow > 0 && (
        <div className="w-6 h-6 -ml-2 rounded-full flex items-center justify-center text-[9px] font-semibold ring-2 ring-white shrink-0 text-[#5F6A88] bg-[#EDF0F7]">
          +{overflow}
        </div>
      )}
    </div>
  );
}

// ─── v2.0 status / type chips (page-scoped) ─────────────────────────────────────
// _pm-shared.tsx's ProjectStatusBadge/ProjectTypeBadge stay untouched (still v1,
// shared by the not-yet-migrated kanban/detail views) — these are new, local
// equivalents built on the shared v2.0 Chip primitive from dashboard-shared.tsx.

export function ProjectStatusChip({ status, pct }: { status: string; pct: number }) {
  if (status === "active" && pct === 0) return <Chip tone="neutral">Not Started</Chip>;
  if (status === "completed") {
    return (
      <Chip tone="ok">
        <Check size={9} strokeWidth={3} className="shrink-0" /> Completed
      </Chip>
    );
  }
  if (status === "active") return <Chip tone="ok" dot>Active</Chip>;
  if (status === "on_hold") return <Chip tone="warn" dot>On Hold</Chip>;
  if (status === "archived") return <Chip tone="neutral">Archived</Chip>;
  return <Chip tone="neutral">{status}</Chip>;
}

export function ProjectTypeChip({ type }: { type: string }) {
  return <Chip tone="neutral">{type}</Chip>;
}

// ─── v2.0 progress ring (page-scoped) ───────────────────────────────────────────
// _pm-shared.tsx's CompletionRing stays untouched (v1 colors, shared by kanban/detail
// views) — this is a smaller, v2.0-token sibling used twice per card (tasks + issues).

export function ProgressRing({ pct, size = 34 }: { pct: number; size?: number }) {
  const strokeWidth = 3;
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const cx = size / 2;
  const cy = size / 2;
  const fillColor = pct === 100 ? "#177E48" : "#007BFF";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EDF0F7" strokeWidth={strokeWidth} />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={fillColor} strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
      />
      <text
        x={cx} y={cy}
        dominantBaseline="middle" textAnchor="middle"
        className="font-mono"
        style={{ fontSize: size * 0.26, fill: "#3A4565", fontWeight: 600, transform: "rotate(90deg)", transformOrigin: `${cx}px ${cy}px` }}
      >
        {pct}%
      </text>
    </svg>
  );
}

// Task 268 — `href`/`tooltipLabel` make this its own click target (tasks/issues regions on the
// Projects grid card, each navigating independently of the rest of the card). A <button> here,
// never a nested <a> — the card itself is already a <Link>/<a>, and HTML forbids nested anchors
// (browsers force-close them), the same nested-interactive-element bug class task 264's Round 2
// fix (createPortal) worked around for the collaborators modal.
export function ProgressStat({ label, done, total, href, tooltipLabel }: {
  label: string; done: number; total: number; href?: string; tooltipLabel?: string;
}) {
  const router = useRouter();
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const content = (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <ProgressRing pct={pct} />
      <span className="text-[10px] font-mono whitespace-nowrap text-[#5F6A88] group-hover:text-[#007BFF] transition-colors">{done}/{total} {label}</span>
    </div>
  );

  if (!href) return content;

  const trigger = (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(href); }}
      className="group cursor-pointer border-none bg-transparent p-0"
    >
      {content}
    </button>
  );

  if (!tooltipLabel) return trigger;

  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent side="top">{tooltipLabel}</TooltipContent>
    </Tooltip>
  );
}
