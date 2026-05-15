"use client";

import React, { useState } from "react";
import type { PMSettings } from "@/hooks/use-pm-settings";
import { getTokens, DARK, PriorityDot } from "./shared";
import type { Tokens } from "./shared";

const CARD = "rounded-[14px] border border-[var(--c-border)] shadow-[0_1px_4px_rgba(0,0,0,0.05)] bg-[var(--c-card)]";

function buildVars(C: Tokens): React.CSSProperties {
  return {
    "--c-text": C.text, "--c-sub": C.sub, "--c-muted": C.muted,
    "--c-card": C.card, "--c-border": C.border,
    "--c-blue": C.blue, "--c-sky": C.sky, "--c-green": C.green,
    "--c-amber": C.amber, "--c-red": C.red,
    "--c-sky-tint2": `${C.sky}0e`,
    "--c-sky-border": `${C.sky}20`,
    "--c-track": C === DARK ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
  } as React.CSSProperties;
}

interface Props { settings: PMSettings; }

export default function TasksTab({ settings }: Props) {
  const C = getTokens(settings);
  const [tab, setTab] = useState("all");

  const tasks = [
    { id: "T-0091", title: "Blog publishing broken on StackShift demo site", customer: "Acme Corp", priority: "CRITICAL", type: "Content Update", conf: 94, t: "2h", status: "classified" },
    { id: "T-0090", title: "Update SEO meta for /products and /pricing pages", customer: "Bright Labs", priority: "HIGH", type: "SEO Update", conf: 88, t: "3h", status: "classified" },
    { id: "T-0089", title: "New staging env access for 2 team members", customer: "Orbit Media", priority: "NORMAL", type: "Settings Change", conf: 76, t: "5h", status: "review" },
    { id: "T-0088", title: "Product roadmap page content needs update", customer: "Vertex Group", priority: "NORMAL", type: "Content Update", conf: 91, t: "6h", status: "classified" },
    { id: "T-0087", title: "Client reported broken form on contact page", customer: "Halo Creative", priority: "HIGH", type: "Bug Report", conf: 51, t: "8h", status: "review" },
  ];

  const shown = tab === "all" ? tasks : tasks.filter(t => t.status === tab);
  const confColor = (v: number) => v >= 80 ? C.green : v >= 60 ? C.amber : C.red;

  return (
    <div style={buildVars(C)}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[22px] font-bold text-[var(--c-text)] tracking-[-0.02em]">Task Queue</div>
          <div className="text-xs text-[var(--c-sub)] mt-[2px]">{tasks.length} items · coming Sprint 2</div>
        </div>
        <div className="flex gap-[6px]">
          {([["all", "All"], ["classified", "Classified"], ["review", "Needs Review"]] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`text-xs font-semibold rounded-lg px-[14px] py-[7px] cursor-pointer border transition-colors ${
                tab === k
                  ? "text-white bg-[var(--c-blue)] border-[var(--c-blue)]"
                  : "text-[var(--c-sub)] bg-[var(--c-card)] border-[var(--c-border)]"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className={`${CARD} overflow-hidden`}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--c-border)]">
              {["Pri", "Task", "Customer", "Type", "AI Confidence", "Status", "Age"].map(h => (
                <th key={h} className="py-[9px] px-4 text-left text-[10px] font-bold text-[var(--c-muted)] tracking-[0.06em] uppercase whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((t, i) => {
              const cc = confColor(t.conf);
              return (
                <tr key={t.id} className={`cursor-pointer ${i < shown.length - 1 ? "border-b border-[var(--c-border)]" : ""}`}>
                  <td className="py-[13px] px-4"><PriorityDot priority={t.priority} /></td>
                  <td className="py-[13px] px-4 min-w-[260px]">
                    <div className="text-[13px] font-medium text-[var(--c-text)] leading-[1.35]">{t.title}</div>
                    <code className="text-[10px] text-[var(--c-muted)] font-mono">{t.id}</code>
                  </td>
                  <td className="py-[13px] px-4">
                    <span className="text-xs text-[var(--c-sub)]">{t.customer}</span>
                  </td>
                  <td className="py-[13px] px-4">
                    <span className="text-[11px] text-[var(--c-sky)] bg-[var(--c-sky-tint2)] rounded-[5px] px-2 py-px border border-[var(--c-sky-border)]">
                      {t.type}
                    </span>
                  </td>
                  <td className="py-[13px] px-4">
                    {/* Per-element CSS vars for dynamic confidence color */}
                    <span
                      className="text-[11px] font-semibold rounded-[6px] px-2 py-px font-mono border text-[var(--cc)] bg-[var(--cc-bg)] border-[var(--cc-bd)]"
                      style={{ "--cc": cc, "--cc-bg": `${cc}10`, "--cc-bd": `${cc}20` } as React.CSSProperties}
                    >
                      {t.conf}%
                    </span>
                  </td>
                  <td className="py-[13px] px-4">
                    {t.status === "review" ? (
                      <button className="text-[11px] font-semibold text-white bg-[var(--c-blue)] rounded-[6px] px-3 py-[5px] cursor-pointer border-0">
                        Classify
                      </button>
                    ) : (
                      <span className="text-[11px] font-semibold text-[var(--c-green)]">✓ Classified</span>
                    )}
                  </td>
                  <td className="py-[13px] px-4">
                    <span className="text-[11px] text-[var(--c-muted)]">{t.t} ago</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
