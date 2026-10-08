"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { buildActivity, type ActivityRow, type ActivityTone } from "@/lib/timer/activity";
import { formatClockTime, formatDurationShort } from "@/lib/timer/format";
import type { TimerEvent } from "@/lib/timer/timeline";

// Task 439 — the Activity stream: when a timer was started, paused, resumed, broken
// and stopped, with the length of each stretch and Worked / Paused / On break totals. Shared by
// the per-time-log Activity panel (task + ticket Time Logs, Dashboard → Time logs) and the live
// session in the header timer widget. Meaning is always carried by label text — the tone dot is
// reinforcement, never the only signal (Design System v2.0).

const DOT: Record<ActivityTone, string> = {
  ok: "bg-[#177E48]",
  warn: "bg-[#8A5A00]",
  late: "bg-[#C0392B]",
  neutral: "bg-[#8A93AC]",
};

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

function Stat({ label, seconds }: { label: string; seconds: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[7px] bg-[#F4F6FB] px-2 py-1.5">
      <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">{label}</span>
      <span className="font-mono text-[12px] font-semibold tabular-nums text-[#0B1533]">{formatDurationShort(seconds)}</span>
    </div>
  );
}

function Row({ row, showDate, last }: { row: ActivityRow; showDate: boolean; last: boolean }) {
  return (
    <li className="relative grid grid-cols-[64px_12px_1fr] items-start gap-x-2.5 pb-3 last:pb-0">
      <div className="flex flex-col pt-px text-right">
        <span className="font-mono text-[11px] font-semibold tabular-nums text-[#3A4565]">{formatClockTime(row.at)}</span>
        {showDate && <span className="font-mono text-[9px] tabular-nums text-[#8A93AC]">{shortDate(row.at)}</span>}
      </div>
      <div className="relative flex self-stretch justify-center pt-1">
        <span className={cn("z-10 h-2 w-2 shrink-0 rounded-full", DOT[row.tone])} />
        {!last && <span aria-hidden className="absolute bottom-[-12px] top-3 w-px bg-[#E2E7F2]" />}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-semibold leading-tight text-[#0B1533]">{row.label}</span>
          {row.durationSeconds !== null && row.durationSeconds >= 1 && (
            <span className="rounded-[5px] bg-[#EDF0F7] px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none tabular-nums text-[#5F6A88]">
              {formatDurationShort(row.durationSeconds)}{row.ongoing ? " so far" : ""}
            </span>
          )}
        </div>
        {row.detail && <span className="text-[11px] leading-snug text-[#5F6A88]">{row.detail}</span>}
      </div>
    </li>
  );
}

export function TimerActivityStream({
  timeline,
  endAt,
  nowMs,
  className,
}: {
  timeline: TimerEvent[];
  /** Session end (time-log rows). Omit for a live session and pass `nowMs` instead. */
  endAt?: string | null;
  nowMs?: number;
  className?: string;
}) {
  const { rows, totals } = useMemo(() => buildActivity(timeline, endAt, nowMs), [timeline, endAt, nowMs]);

  if (rows.length === 0) {
    return <p className={cn("text-[12px] text-[#5F6A88]", className)}>No activity recorded for this session.</p>;
  }

  const firstDay = dayKey(rows[0].at);
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Worked" seconds={totals.workedSeconds} />
        <Stat label="Paused" seconds={totals.pausedSeconds} />
        <Stat label="On break" seconds={totals.breakSeconds} />
      </div>
      <ol className="flex flex-col">
        {rows.map((row, i) => (
          <Row key={row.key} row={row} showDate={dayKey(row.at) !== firstDay} last={i === rows.length - 1} />
        ))}
      </ol>
    </div>
  );
}
