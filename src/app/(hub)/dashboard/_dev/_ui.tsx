"use client";

import React from "react";
import Link from "next/link";
import { Bug, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, STATUS_STYLE, PRIORITY_STYLE } from "@/app/(hub)/projects-old/_pm-shared";
import { dueBucket, daysLate, type DevPriority, type DevWorkKind } from "./_types";

// Task 360 — presentational primitives shared by the developer dashboard panels.
// Fixed-light, literal v2.0 hex, `cn()` for conditionals — this page has no theme toggle, so it
// never uses `dark:` variants or the `isDark` prop pattern that themed v2 pages use.
//
// Status colours come from `_pm-shared.tsx`'s STATUS_STYLE, not `dashboard-shared.tsx`'s `Chip`:
// that component's onboard/migrate/publish/ai/optimize tones are reserved for programme phase
// hues (design system §1, enforced by tasks 183/185) and must never carry a task/issue status.

const TRANSITION = "transition-colors duration-150 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none";

// ─── Panel ────────────────────────────────────────────────────────────────────

export function Panel({
  title,
  hint,
  children,
  foot,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  foot?: React.ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap px-[18px] pt-4 pb-3">
        <h2 className="font-heading text-[15px] font-semibold text-[#0B1533] tracking-[-0.01em] m-0">{title}</h2>
        {hint ? <span className="text-[12px] font-medium text-[#5F6A88]">{hint}</span> : null}
      </div>
      {children}
      {foot ? <div className="px-[18px] py-3 border-t border-[#EDF0F7]">{foot}</div> : null}
    </section>
  );
}

// ─── Optional link ────────────────────────────────────────────────────────────
// A row that may or may not have a href (a project/task/issue whose display id isn't
// resolvable yet still renders, just unlinked) — shared by every panel that has this shape
// instead of each one hand-rolling the same `href ? <Link> : <div>` ternary.

export function OptionalLink({
  href,
  className,
  children,
}: {
  href: string | null;
  className: string;
  children: React.ReactNode;
}) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
// Design system §6 — empty states teach: say what will appear here and when.

export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 px-5 text-center">
      <div className="w-9 h-9 rounded-xl bg-[#F0F7FF] text-[#007BFF] flex items-center justify-center">{icon}</div>
      <p className="text-[12.5px] font-bold text-[#0B1533] m-0">{title}</p>
      <p className="text-[11.5px] text-[#5F6A88] max-w-[260px] m-0 leading-relaxed">{body}</p>
    </div>
  );
}

// ─── Priority dot ─────────────────────────────────────────────────────────────

const PRIORITY_RING: Record<DevPriority, string> = {
  critical: "shadow-[0_0_0_3px_#FDE8E6]",
  high: "shadow-[0_0_0_3px_#FFF3D6]",
  normal: "shadow-[0_0_0_3px_#E5F1FF]",
  low: "shadow-[0_0_0_3px_#EDF0F7]",
};

export function PriorityDot({ priority, label }: { priority: DevPriority; label: string }) {
  return (
    <span
      className={cn("w-[9px] h-[9px] rounded-full shrink-0", PRIORITY_RING[priority])}
      style={{ background: PRIORITY_STYLE[priority]?.dot ?? "#E2E7F2" }}
      title={label}
      aria-label={label}
      role="img"
    />
  );
}

// ─── Type icon ────────────────────────────────────────────────────────────────

export function TypeIcon({ kind }: { kind: DevWorkKind }) {
  const isTask = kind === "task";
  return (
    <span
      className={cn(
        "w-[26px] h-[26px] rounded-[7px] flex items-center justify-center shrink-0",
        isTask ? "bg-[#E5F1FF] text-[#0063D6]" : "bg-[#FDE8E6] text-[#C0392B]"
      )}
      title={isTask ? "Task" : "Ticket"}
      aria-label={isTask ? "Task" : "Ticket"}
      role="img"
    >
      {isTask ? <ClipboardCheck size={14} /> : <Bug size={14} />}
    </span>
  );
}

// ─── Running badge ────────────────────────────────────────────────────────────
// Marks the one row whose task/issue is the hub's active timer. Deliberately just a static
// pill + a pulsing dot — no elapsed-time text. The live clock belongs on the timer card and the
// header widget only; putting it inline in a list row is what widened the row and broke the
// layout in the first place.

export function RunningBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold px-2 py-[3px] rounded-full bg-[#E5F1FF] text-[#0063D6] whitespace-nowrap shrink-0">
      <span className="w-[6px] h-[6px] rounded-full bg-[#007BFF] animate-pulse motion-reduce:animate-none" />
      Currently running
    </span>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────

export function StatusPill({ status }: { status: string }) {
  const c = STATUS_STYLE[status] ?? STATUS_STYLE.open;
  return (
    <span
      className="inline-flex items-center text-[10.5px] font-bold px-2 py-[3px] rounded-full whitespace-nowrap shrink-0"
      style={{ color: c.text, background: c.bg }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

// ─── Due pill ─────────────────────────────────────────────────────────────────

export function DueLabel({
  due,
  today,
  closed = false,
}: {
  due: string | null;
  today: string;
  /** A closed/done item never reads as overdue or due-today — it just shows the plain date. */
  closed?: boolean;
}) {
  const bucket = closed ? "future" : dueBucket(due, today);

  if (bucket === "overdue") {
    const n = daysLate(due, today);
    return (
      <span className="text-[11.5px] font-semibold text-[#C0392B] whitespace-nowrap shrink-0 w-[82px] text-right">
        {n}d overdue
      </span>
    );
  }
  if (bucket === "today") {
    return (
      <span className="text-[11.5px] font-semibold text-[#8A5A00] whitespace-nowrap shrink-0 w-[82px] text-right">
        Due today
      </span>
    );
  }
  return (
    <span className="text-[11.5px] font-medium text-[#5F6A88] whitespace-nowrap shrink-0 w-[82px] text-right">
      {due ? new Date(`${due}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
    </span>
  );
}

// ─── Buttons ──────────────────────────────────────────────────────────────────
// Design system §4 — pill radius (999px). One orange CTA per screen; ghost for everything else.

export const BTN_BASE =
  `inline-flex items-center justify-center gap-2 text-[13px] font-semibold px-[15px] py-2 rounded-full border ${TRANSITION} ` +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF] disabled:opacity-45 disabled:pointer-events-none";

export const BTN_GHOST = "bg-white border-[#E2E7F2] text-[#3A4565] hover:border-[#A8C6F5]";
export const BTN_CTA = "bg-[#FB914E] border-transparent text-[#471F02] hover:bg-[#E2762F] hover:text-white";

export { TRANSITION };
