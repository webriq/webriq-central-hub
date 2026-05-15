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
  } as React.CSSProperties;
}

interface Props { settings: PMSettings; }

interface PipelineItem { id: string; title: string; customer: string; status?: string; t?: string; }

export default function PipelineTab({ settings }: Props) {
  const C = getTokens(settings);

  const statusColor: Record<string, string> = {
    CLEAR: C.green, PARTIAL: C.amber, BLOCKED: C.red,
    PENDING_APPROVAL: C.amber, APPROVED: C.green, EXECUTING: C.sky, DRAFT: C.violet,
  };

  const stages: { k: string; l: string; color: string; items: PipelineItem[] }[] = [
    { k: "classify", l: "Classify", color: C.violet, items: [
      { id: "T-0092", title: "New support ticket from Acme Corp", customer: "Acme Corp", t: "10m" },
      { id: "T-0091", title: "Staging config request", customer: "Bright Labs", t: "1h" },
    ]},
    { k: "assess", l: "Assess", color: C.sky, items: [
      { id: "T-0090", title: "Blog publishing broken on StackShift", customer: "Acme Corp", status: "CLEAR" },
      { id: "T-0088", title: "SEO meta update for /products", customer: "Bright Labs", status: "PARTIAL" },
      { id: "T-0087", title: "New team member access setup", customer: "Orbit Media", status: "BLOCKED" },
    ]},
    { k: "plan", l: "Plan", color: C.blue, items: [
      { id: "T-0086", title: "Product roadmap content update", customer: "Vertex Group", status: "PENDING_APPROVAL" },
      { id: "T-0085", title: "Contact form bug fix", customer: "Halo Creative", status: "APPROVED" },
    ]},
    { k: "execute", l: "Execute", color: C.orange, items: [
      { id: "T-0084", title: "Image gallery portfolio update", customer: "Acme Corp", status: "EXECUTING" },
    ]},
    { k: "reply", l: "Reply", color: C.green, items: [
      { id: "T-0083", title: "Footer links update — completed", customer: "Bright Labs", status: "DRAFT" },
      { id: "T-0082", title: "Navigation menu restructure done", customer: "Orbit Media", status: "DRAFT" },
    ]},
  ];

  return (
    <div style={buildVars(C)}>
      <div className="mb-5">
        <div className="text-[22px] font-bold text-[var(--c-text)] tracking-[-0.02em]">AI Pipeline</div>
        <div className="text-xs text-[var(--c-sub)] mt-[2px]">Classify → Assess → Plan → Execute → Reply · coming Sprint 3+</div>
      </div>
      <div className="grid grid-cols-5 gap-3 items-start">
        {stages.map(s => (
          <div key={s.k}>
            {/* Stage header — per-element CSS var for stage color */}
            <div
              className="flex items-center gap-[6px] mb-[10px] px-[2px]"
            >
              <div
                className="w-2 h-2 rounded-full bg-[var(--sc)]"
                style={{ "--sc": s.color } as React.CSSProperties}
              />
              <span className="text-xs font-bold text-[var(--c-text)]">{s.l}</span>
              <span
                className="text-[11px] rounded-full px-[7px] ml-auto border text-[var(--sc)] bg-[var(--sc-bg)] border-[var(--sc-bd)]"
                style={{ "--sc": s.color, "--sc-bg": `${s.color}12`, "--sc-bd": `${s.color}20` } as React.CSSProperties}
              >
                {s.items.length}
              </span>
            </div>
            {/* Stage items */}
            <div className="flex flex-col gap-2">
              {s.items.map(item => (
                <div key={item.id} className={`${CARD} py-[11px] px-[13px] cursor-pointer`}>
                  <div className="text-xs font-medium text-[var(--c-text)] leading-[1.4] mb-[7px]">{item.title}</div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-[var(--c-sub)]">{item.customer}</span>
                    {item.status && (
                      <span
                        className="text-[9px] font-bold rounded-full px-[6px] py-px border text-[var(--bc)] bg-[var(--bb)] border-[var(--bd)]"
                        style={{ "--bc": statusColor[item.status], "--bb": `${statusColor[item.status]}12`, "--bd": `${statusColor[item.status]}22` } as React.CSSProperties}
                      >
                        {item.status.replace("_", " ")}
                      </span>
                    )}
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
