"use client";

import { AlertTriangle, Ban, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HeadsUp } from "@/lib/projects/merge/types";

/** Assistant voice line: small mark + text. `pulse` shows the line is still being produced. */
export function AssistantLine({ children, pulse = false }: { children: React.ReactNode; pulse?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E5F1FF] text-[#0063D6]">
        <Sparkles size={12} className={cn(pulse && "motion-safe:animate-pulse")} />
      </span>
      <p className="pt-0.5 text-[13px] leading-relaxed text-[#3A4565]">{children}</p>
    </div>
  );
}

const TONE = {
  info: { icon: Info, box: "bg-[#F0F7FF] text-[#0063D6]", label: "Note" },
  warn: { icon: AlertTriangle, box: "bg-[#FFF3D6] text-[#8A5A00]", label: "Heads up" },
  block: { icon: Ban, box: "bg-[#FDE8E6] text-[#C0392B]", label: "Blocked" },
} as const;

export function HeadsUpList({ items }: { items: HeadsUp[] }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((h, i) => {
        const t = TONE[h.tone];
        const Icon = t.icon;
        return (
          <li key={i} className="flex items-start gap-2.5 rounded-[10px] border border-[#E2E7F2] bg-white px-3 py-2.5">
            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", t.box)}>
              <Icon size={12} aria-hidden />
            </span>
            <p className="text-[12.5px] text-[#3A4565]">
              <span className="sr-only">{t.label}: </span>
              {h.text}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** Real progress: width is the fraction of server-reported work done, never time-based. */
export function ProgressBar({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="flex items-center gap-3">
      <div className="h-[10px] flex-1 overflow-hidden rounded-full bg-[#EDF0F7]">
        {/* width comes from a CSS variable (allowed style exception) — value is server-reported progress */}
        <div className="h-full w-[var(--merge-pct)] rounded-full bg-[#007BFF] motion-safe:transition-[width] motion-safe:duration-200" style={{ "--merge-pct": `${pct}%` } as React.CSSProperties} />
      </div>
      <span className="w-10 text-right font-mono text-[11px] font-semibold text-[#0B1533]">{pct}%</span>
    </div>
  );
}

export const btnGhost = "rounded-full border border-[#E2E7F2] bg-white px-4 py-2 text-[12px] font-semibold text-[#3A4565] cursor-pointer transition-colors hover:border-[#A8C6F5] disabled:cursor-not-allowed disabled:opacity-45";
export const btnBlue = "rounded-full bg-[#007BFF] px-4 py-2 text-[12px] font-semibold text-white cursor-pointer transition-colors hover:bg-[#0063D6] disabled:cursor-not-allowed disabled:opacity-45";
export const btnOrange = "rounded-full bg-[#FB914E] px-4 py-2 text-[12px] font-semibold text-[#471F02] cursor-pointer transition-colors hover:bg-[#E2762F] hover:text-white disabled:cursor-not-allowed disabled:opacity-45";
