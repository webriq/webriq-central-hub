"use client";

import { ArrowRight } from "lucide-react";
import type { MergePlan } from "@/lib/projects/merge/types";
import { AssistantLine, HeadsUpList } from "./_merge-bits";

export function StepScan({ notes, error }: { notes: string[]; error: string | null }) {
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      {notes.map((n, i) => <AssistantLine key={i} pulse={i === notes.length - 1 && !error}>{n}</AssistantLine>)}
      {!notes.length && !error && <div className="h-6 w-2/3 rounded-full bg-[#EDF0F7] motion-safe:animate-pulse" />}
      {error && <p role="alert" className="rounded-[10px] bg-[#FDE8E6] px-3 py-2.5 text-[12.5px] text-[#C0392B]">{error}</p>}
    </div>
  );
}

export function StepConfirm({ plan, typed, setTyped, crossAck, setCrossAck, skipCount }: {
  plan: MergePlan; typed: string; setTyped: (v: string) => void; crossAck: boolean; setCrossAck: (v: boolean) => void; skipCount: number;
}) {
  const c = plan.counts;
  return (
    <div className="flex flex-col gap-5">
      <AssistantLine>Here&apos;s what will happen. Nothing is deleted: duplicates stay on the archived <strong className="text-[#0B1533]">{plan.sourceName}</strong>, which will be marked as merged.</AssistantLine>
      <div className="flex items-center gap-3 rounded-[14px] border border-[#E2E7F2] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(7,17,51,0.05)]">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#0B1533]">{plan.sourceName}</span>
        <ArrowRight size={14} className="shrink-0 text-[#5F6A88]" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-right text-[13px] font-semibold text-[#0B1533]">{plan.targetName}</span>
      </div>
      <ul className="grid grid-cols-2 gap-2 text-[12.5px] text-[#3A4565] sm:grid-cols-3">
        {[["tasks", c.task.total], ["task lists", c.tasklist.total], ["milestones", c.milestone.total], ["tickets", c.ticket.total], ["files", c.file.total], ["time logs", c.timelog.total]].map(([l, n]) => (
          <li key={l as string} className="rounded-[10px] bg-[#F4F6FB] px-3 py-2"><span className="font-mono font-semibold text-[#0B1533]">{n as number}</span> {l as string}</li>
        ))}
      </ul>
      <p className="text-[12.5px] text-[#5F6A88]"><span className="font-mono font-semibold text-[#0B1533]">{skipCount}</span> items will be left behind as redundant or duplicate.</p>
      <HeadsUpList items={plan.headsUp.filter((h) => h.tone !== "info")} />
      {plan.crossCustomer && (
        <label className="flex items-start gap-2 text-[12.5px] text-[#3A4565]">
          <input type="checkbox" checked={crossAck} onChange={(e) => setCrossAck(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#007BFF]" />
          I understand this moves one customer&apos;s data into another customer&apos;s project.
        </label>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold text-[#0B1533]">Type <span className="font-mono">{plan.targetName}</span> to confirm</span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} className="rounded-[10px] text-[#0B1533] placeholder:text-[#5F6A88] border border-transparent bg-[#F4F6FB] px-3 py-2 text-[13px] outline-none transition-colors focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/15" />
      </label>
    </div>
  );
}

export function StepDone({ summary, text }: { summary: { moved: number; merged: number; skipped: number }; text: string | null }) {
  return (
    <div className="flex flex-col gap-5">
      <AssistantLine>{text ?? `Merge complete. ${summary.moved} items moved, ${summary.merged} duplicates folded into existing items, ${summary.skipped} left on the archived source.`}</AssistantLine>
      <dl className="grid grid-cols-3 gap-2">
        {[["Moved", summary.moved], ["Folded", summary.merged], ["Left behind", summary.skipped]].map(([l, n]) => (
          <div key={l as string} className="rounded-[10px] border border-[#E2E7F2] bg-white px-3 py-2.5">
            <dt className="text-[11px] font-semibold text-[#5F6A88]">{l as string}</dt>
            <dd className="font-mono text-[22px] font-semibold text-[#0B1533]">{n as number}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[12px] text-[#5F6A88]">Moved tasks and tickets keep their original IDs, so some will still show the old project&apos;s prefix.</p>
    </div>
  );
}
