"use client";

import React from "react";
import { AlertTriangle, Bug, CalendarRange, CheckCircle2, ClipboardCheck, Sparkles } from "lucide-react";
import { formatHoursAsHHMM } from "@/lib/timer/format";
import { daysLate, type DevHoursByProject, type DevWorkItem } from "./_types";

// Task 360 — "Your digest".
//
// Deliberately DETERMINISTIC, not LLM-backed. `digest_logs` / `generateDigest()` produce an
// org-wide "dev" digest with no per-user targeting and nothing currently renders it; a
// per-developer LLM digest would need its own cron, per-user invocations and cost attribution.
// Every line below is derived from data this page already loaded, and a line is emitted only
// when its underlying data exists. An LLM-written version is a noted follow-up.
//
// This is the screen's single amber surface (design system: one AI surface per screen).

type DigestLine = { key: string; icon: React.ReactNode; content: React.ReactNode };

function buildLines({
  overdue,
  inProgress,
  recentlyMoved,
  hoursToday,
  hoursTodayByProject,
  today,
}: {
  overdue: DevWorkItem[];
  inProgress: DevWorkItem[];
  recentlyMoved: DevWorkItem[];
  hoursToday: number;
  hoursTodayByProject: DevHoursByProject[];
  today: string;
}): DigestLine[] {
  const lines: DigestLine[] = [];

  const oldest = overdue[0];
  if (oldest) {
    const n = daysLate(oldest.dueDate, today);
    lines.push({
      key: "overdue",
      icon: <AlertTriangle size={13} />,
      content: (
        <>
          <b className="font-bold">{oldest.title}</b> is <b className="font-bold">{n} {n === 1 ? "day" : "days"} late</b> —
          the oldest overdue item on your queue.
        </>
      ),
    });
  }

  const topInProgress = inProgress[0];
  if (topInProgress) {
    lines.push({
      key: "progress",
      icon: topInProgress.kind === "ticket" ? <Bug size={13} /> : <ClipboardCheck size={13} />,
      content: (
        <>
          <b className="font-bold">{topInProgress.title}</b> is your highest-priority item in progress
          {topInProgress.projectName ? <> on {topInProgress.projectName}</> : null}.
        </>
      ),
    });
  }

  if (recentlyMoved.length > 0) {
    lines.push({
      key: "moved",
      icon: <CheckCircle2 size={13} />,
      content: (
        <>
          <b className="font-bold">{recentlyMoved.length}</b>{" "}
          {recentlyMoved.length === 1 ? "item" : "items"} moved to In progress in the last 24 hours.
        </>
      ),
    });
  }

  if (hoursToday > 0) {
    const top = hoursTodayByProject[0];
    lines.push({
      key: "hours",
      icon: <CalendarRange size={13} />,
      content: (
        <>
          <b className="font-bold">{formatHoursAsHHMM(hoursToday)}</b> logged today
          {top ? <>, mostly on {top.name}</> : null}.
        </>
      ),
    });
  }

  return lines;
}

export default function DevDigestCard(props: {
  overdue: DevWorkItem[];
  inProgress: DevWorkItem[];
  recentlyMoved: DevWorkItem[];
  hoursToday: number;
  hoursTodayByProject: DevHoursByProject[];
  today: string;
  dateLabel: string | null;
}) {
  const lines = buildLines(props);

  return (
    <section className="rounded-[14px] border border-[#FDE9C2] bg-[#FFFBEB] px-[17px] py-4">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-[26px] h-[26px] rounded-lg bg-gradient-to-br from-[#F59E0B] to-[#F97316] text-white flex items-center justify-center shrink-0">
          <Sparkles size={14} />
        </span>
        <h3 className="font-heading text-[13.5px] font-bold text-[#7C4A0A] m-0">Your digest</h3>
        {props.dateLabel ? (
          <span className="ml-auto text-[10.5px] font-semibold text-[#B27219]">{props.dateLabel}</span>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <p className="text-[12.5px] text-[#7C4A0A] leading-relaxed m-0">
          Nothing needs your attention — your queue is clear.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5 m-0 p-0 list-none">
          {lines.map((line) => (
            <li key={line.key} className="flex gap-2.5 text-[12.5px] text-[#7C4A0A] leading-relaxed">
              <span className="shrink-0 mt-0.5 text-[#B27219]">{line.icon}</span>
              <span>{line.content}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
