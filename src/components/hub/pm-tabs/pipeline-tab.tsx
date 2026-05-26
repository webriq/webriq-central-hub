"use client";

import React from "react";
import type { PMSettings } from "@/hooks/use-pm-settings";

const CARD = "rounded-[14px] border border-(--c-border) shadow-[0_1px_4px_rgba(0,0,0,0.05)] bg-(--c-card)";

interface PipelineItem { id: string; title: string; customer: string; status?: string; t?: string; }

interface Props {
  settings: PMSettings;
  classifyItems?: PipelineItem[];
  assessItems?: PipelineItem[];
}

export default function PipelineTab({ settings, classifyItems = [], assessItems = [] }: Props) {
  const stages: {
    k: string; l: string;
    colorVar: string; tintVar: string; bdVar: string;
    items: PipelineItem[]; sprint3?: boolean;
  }[] = [
    { k: "classify", l: "Classify", colorVar: "--c-violet", tintVar: "--c-violet-tint", bdVar: "--c-violet-bd", items: classifyItems },
    { k: "assess",   l: "Assess",   colorVar: "--c-sky",    tintVar: "--c-sky-tint",    bdVar: "--c-sky-bd",    items: assessItems },
    { k: "plan",     l: "Plan",     colorVar: "--c-blue",   tintVar: "--c-blue-tint",   bdVar: "--c-blue-bd",   items: [], sprint3: true },
    { k: "execute",  l: "Execute",  colorVar: "--c-orange", tintVar: "--c-orange-tint", bdVar: "--c-orange-bd", items: [], sprint3: true },
    { k: "reply",    l: "Reply",    colorVar: "--c-green",  tintVar: "--c-green-tint",  bdVar: "--c-green-bd",  items: [], sprint3: true },
  ];

  return (
    <div className={settings.theme === "dark" ? "pm-dark" : "pm-light"}>
      <div className="mb-5">
        <div className="text-[22px] font-bold text-(--c-text) tracking-[-0.02em]">AI Pipeline</div>
        <div className="text-xs text-(--c-sub) mt-0.5">
          Classify → Assess → Plan → Execute → Reply · Plan through Reply coming Sprint 4+
        </div>
      </div>
      <div className="grid grid-cols-5 gap-3 items-start">
        {stages.map(s => (
          <div key={s.k}>
            <div className="flex items-center gap-1.5 mb-2.5 px-0.5">
              <div className={`w-2 h-2 rounded-full bg-[var(${s.colorVar})]`} />
              <span className="text-xs font-bold text-(--c-text)">{s.l}</span>
              <span
                className={`text-[11px] rounded-full px-1.75 ml-auto border
                  text-[var(${s.colorVar})]
                  bg-[var(${s.tintVar})]
                  border-[var(${s.bdVar})]`}
              >
                {s.sprint3 ? 0 : s.items.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {s.sprint3 ? (
                <div className="text-[11px] text-(--c-muted) text-center py-3">Sprint 4+</div>
              ) : s.items.length === 0 ? (
                <div className="text-[11px] text-(--c-muted) text-center py-3">No pending items</div>
              ) : s.items.map(item => (
                <div key={item.id} className={`${CARD} py-2.75 px-3.25`}>
                  <div className="text-xs font-medium text-(--c-text) leading-[1.4] mb-1.75">{item.title}</div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-(--c-sub)">{item.customer}</span>
                    {item.t && <span className="text-[10px] text-(--c-muted)">{item.t}</span>}
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
