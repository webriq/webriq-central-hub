"use client";

import React from "react";
import type { PMSettings } from "@/hooks/use-pm-settings";
import { getTokens } from "./shared";
import type { Tokens } from "./shared";

const CARD = "rounded-[14px] border border-[var(--c-border)] shadow-[0_1px_4px_rgba(0,0,0,0.05)] bg-[var(--c-card)]";

function buildVars(C: Tokens): React.CSSProperties {
  return {
    "--c-text": C.text, "--c-sub": C.sub, "--c-muted": C.muted,
    "--c-card": C.card, "--c-border": C.border,
    "--c-blue": C.blue, "--c-orange": C.orange, "--c-sky": C.sky,
    "--c-violet": C.violet, "--c-green": C.green, "--c-amber": C.amber, "--c-red": C.red,
    // Tint vars for stage count badges
    "--c-violet-tint": `${C.violet}12`, "--c-violet-bd": `${C.violet}20`,
    "--c-sky-tint":    `${C.sky}12`,    "--c-sky-bd":    `${C.sky}20`,
    "--c-blue-tint":   `${C.blue}12`,   "--c-blue-bd":   `${C.blue}20`,
    "--c-orange-tint": `${C.orange}12`, "--c-orange-bd": `${C.orange}20`,
    "--c-green-tint":  `${C.green}12`,  "--c-green-bd":  `${C.green}20`,
  } as React.CSSProperties;
}

interface PipelineItem { id: string; title: string; customer: string; status?: string; t?: string; }

interface Props {
  settings: PMSettings;
  classifyItems?: PipelineItem[];
  classifyCount?: number;
}

export default function PipelineTab({ settings, classifyItems = [], classifyCount = 0 }: Props) {
  const C = getTokens(settings);

  const stages: {
    k: string; l: string;
    colorVar: string; tintVar: string; bdVar: string;
    items: PipelineItem[]; sprint3?: boolean;
  }[] = [
    { k: "classify", l: "Classify", colorVar: "--c-violet", tintVar: "--c-violet-tint", bdVar: "--c-violet-bd", items: classifyItems },
    { k: "assess",   l: "Assess",   colorVar: "--c-sky",    tintVar: "--c-sky-tint",    bdVar: "--c-sky-bd",    items: [], sprint3: true },
    { k: "plan",     l: "Plan",     colorVar: "--c-blue",   tintVar: "--c-blue-tint",   bdVar: "--c-blue-bd",   items: [], sprint3: true },
    { k: "execute",  l: "Execute",  colorVar: "--c-orange", tintVar: "--c-orange-tint", bdVar: "--c-orange-bd", items: [], sprint3: true },
    { k: "reply",    l: "Reply",    colorVar: "--c-green",  tintVar: "--c-green-tint",  bdVar: "--c-green-bd",  items: [], sprint3: true },
  ];

  return (
    <div style={buildVars(C)}>
      <div className="mb-5">
        <div className="text-[22px] font-bold text-[var(--c-text)] tracking-[-0.02em]">AI Pipeline</div>
        <div className="text-xs text-[var(--c-sub)] mt-[2px]">
          Classify → Assess → Plan → Execute → Reply · Assess through Reply coming Sprint 3+
        </div>
      </div>
      <div className="grid grid-cols-5 gap-3 items-start">
        {stages.map(s => (
          <div key={s.k}>
            {/* Stage header */}
            <div className="flex items-center gap-[6px] mb-[10px] px-[2px]">
              <div className={`w-2 h-2 rounded-full bg-[var(${s.colorVar})]`} />
              <span className="text-xs font-bold text-[var(--c-text)]">{s.l}</span>
              <span
                className={`text-[11px] rounded-full px-[7px] ml-auto border
                  text-[var(${s.colorVar})]
                  bg-[var(${s.tintVar})]
                  border-[var(${s.bdVar})]`}
              >
                {s.k === "classify" ? classifyCount : 0}
              </span>
            </div>
            {/* Stage items */}
            <div className="flex flex-col gap-2">
              {s.sprint3 ? (
                <div className="text-[11px] text-[var(--c-muted)] text-center py-3">Sprint 3+</div>
              ) : s.items.length === 0 ? (
                <div className="text-[11px] text-[var(--c-muted)] text-center py-3">No pending items</div>
              ) : s.items.map(item => (
                <div key={item.id} className={`${CARD} py-[11px] px-[13px]`}>
                  <div className="text-xs font-medium text-[var(--c-text)] leading-[1.4] mb-[7px]">{item.title}</div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-[var(--c-sub)]">{item.customer}</span>
                    {item.t && <span className="text-[10px] text-[var(--c-muted)]">{item.t}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
