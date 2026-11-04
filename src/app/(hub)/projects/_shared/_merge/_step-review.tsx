"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Decisions, Entity, Finding, MergePlan, Resolution } from "@/lib/projects/merge/types";
import { AssistantLine, HeadsUpList, btnGhost } from "./_merge-bits";

const SECTIONS: { entity: Entity; label: string }[] = [
  { entity: "task", label: "Tasks" },
  { entity: "tasklist", label: "Task lists" },
  { entity: "milestone", label: "Milestones" },
  { entity: "ticket", label: "Tickets" },
  { entity: "folder", label: "Folders" },
  { entity: "file", label: "Files" },
  { entity: "timelog", label: "Time logs" },
];

const RES_LABEL: Record<Resolution, string> = { move: "Move over", merge: "Fold into match", "keep-both": "Keep both", skip: "Don't copy" };

function FindingRow({ f, value, onChange }: { f: Finding; value: Resolution; onChange: (r: Resolution) => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EDF0F7] px-4 py-2.5 first:border-t-0 hover:bg-[#F0F7FF]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[#0B1533]">{f.label}</p>
        <p className="text-[11.5px] text-[#5F6A88]">{f.detail}</p>
      </div>
      <label className="flex items-center gap-2">
        <span className="sr-only">Resolution for {f.label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value as Resolution)} className="rounded-[10px] border border-transparent bg-[#F4F6FB] px-2.5 py-1.5 text-[12px] text-[#0B1533] outline-none focus:border-[#007BFF] focus:bg-white">
          {f.options.map((o) => <option key={o} value={o}>{RES_LABEL[o]}{o === f.recommended ? " (recommended)" : ""}</option>)}
        </select>
      </label>
    </li>
  );
}

export function StepReview({ plan, decisions, setDecisions, narration }: { plan: MergePlan; decisions: Decisions; setDecisions: (d: Decisions) => void; narration: string | null }) {
  const [onlyAttention, setOnlyAttention] = useState(false);
  const attention = plan.findings.filter((f) => f.needsAttention).length;
  const shown = useMemo(() => plan.findings.filter((f) => !onlyAttention || f.needsAttention), [plan.findings, onlyAttention]);
  const c = plan.counts;
  const fallback = `Found ${plan.findings.length} overlap${plan.findings.length === 1 ? "" : "s"} between the projects. ${attention ? `${attention} need${attention === 1 ? "s" : ""} your eye; the rest I can resolve for you.` : "Nothing needs your attention — the recommended choices are safe."}`;

  return (
    <div className="flex flex-col gap-5">
      <AssistantLine>{narration ?? fallback}</AssistantLine>
      <HeadsUpList items={plan.headsUp} />

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Tasks", c.task], ["Files", c.file], ["Tickets", c.ticket], ["Time logs", c.timelog]].map(([label, v]) => (
          <div key={label as string} className="rounded-[10px] border border-[#E2E7F2] bg-white px-3 py-2.5">
            <dt className="text-[11px] font-semibold text-[#5F6A88]">{label as string}</dt>
            <dd className="font-mono text-[18px] font-semibold text-[#0B1533]">{(v as typeof c.task).total}</dd>
            <dd className="font-mono text-[10.5px] text-[#5F6A88]">{(v as typeof c.task).collisions} overlap</dd>
          </div>
        ))}
      </dl>

      {plan.statusDiff.length > 0 && (
        <div className="overflow-x-auto rounded-[10px] border border-[#E2E7F2]">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-[#FAFBFE] text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">
              <tr><th className="px-4 py-2">Task status</th><th className="px-4 py-2 text-right">This project</th><th className="px-4 py-2 text-right">Target</th></tr>
            </thead>
            <tbody>
              {plan.statusDiff.map((s) => (
                <tr key={s.status} className="border-t border-[#EDF0F7]">
                  <td className="px-4 py-2 text-[#3A4565]">{s.status.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2 text-right font-mono">{s.source}</td>
                  <td className="px-4 py-2 text-right font-mono">{s.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2" role="group" aria-label="Filter findings">
          {[["All", false, plan.findings.length], ["Needs attention", true, attention]].map(([label, v, n]) => (
            <button key={label as string} type="button" aria-pressed={onlyAttention === v} onClick={() => setOnlyAttention(v as boolean)}
              className={cn("cursor-pointer rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors", onlyAttention === v ? "border-[#071133] bg-[#071133] text-white" : "border-[#E2E7F2] bg-white text-[#3A4565] hover:border-[#A8C6F5]")}>
              {label as string} <span className="font-mono opacity-65">{n as number}</span>
            </button>
          ))}
        </div>
        <button type="button" className={btnGhost} onClick={() => setDecisions({})}>Apply recommended</button>
      </div>

      {plan.findings.length === 0 ? (
        <p className="rounded-[10px] border border-[#E2E7F2] bg-white px-4 py-6 text-center text-[13px] text-[#5F6A88]">No duplicates found. Everything will move over as-is.</p>
      ) : (
        SECTIONS.map(({ entity, label }) => {
          const items = shown.filter((f) => f.entity === entity);
          if (!items.length) return null;
          return (
            <section key={entity} className="overflow-hidden rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)]">
              <h3 className="border-b border-[#EDF0F7] px-4 py-3 text-[14px] font-semibold text-[#0B1533]">{label} <span className="font-mono text-[11px] text-[#5F6A88]">{items.length}</span></h3>
              <ul>{items.map((f) => <FindingRow key={f.id} f={f} value={decisions[f.id] ?? f.recommended} onChange={(r) => setDecisions({ ...decisions, [f.id]: r })} />)}</ul>
            </section>
          );
        })
      )}
    </div>
  );
}
