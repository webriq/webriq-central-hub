"use client";

import React from "react";
import type { PMSettings } from "@/hooks/use-pm-settings";
import { getTokens, DARK as DARK_C } from "./shared";
import type { Tokens } from "./shared";

const CARD = "rounded-[14px] border border-[var(--c-border)] shadow-[0_1px_4px_rgba(0,0,0,0.05)] bg-[var(--c-card)]";

function buildVars(C: Tokens): React.CSSProperties {
  return {
    "--c-text": C.text, "--c-sub": C.sub, "--c-muted": C.muted,
    "--c-card": C.card, "--c-border": C.border, "--c-blue": C.blue,
    "--c-seg-bg": C === DARK_C ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
  } as React.CSSProperties;
}

/* Seg must be outside SettingsTab to avoid react-hooks/static-components lint error */
interface SegProps {
  label: string;
  desc?: string;
  options: { value: string; label: string; icon: string }[];
  value: string;
  onChange: (v: string) => void;
  isLast?: boolean;
}

function Seg({ label, desc, options, value, onChange, isLast }: SegProps) {
  return (
    <div className={!isLast ? "pb-5 mb-5 border-b border-[var(--c-border)]" : ""}>
      <div className="flex items-baseline gap-2 mb-[10px]">
        <span className="text-[13px] font-semibold text-[var(--c-text)]">{label}</span>
        {desc && <span className="text-[11px] text-[var(--c-muted)]">{desc}</span>}
      </div>
      <div className="inline-flex gap-0 bg-[var(--c-seg-bg)] rounded-[10px] p-[3px] border border-[var(--c-border)]">
        {options.map(o => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-[7px] text-xs font-semibold px-[18px] py-2 rounded-lg border-0 cursor-pointer transition-all duration-150 ${
              value === o.value
                ? "bg-[var(--c-card)] text-[var(--c-text)] shadow-[0_1px_4px_rgba(0,0,0,0.10)]"
                : "bg-transparent text-[var(--c-sub)]"
            }`}
          >
            <span className="text-[13px]">{o.icon}</span>
            {o.label}
            {value === o.value && (
              <span className="w-[6px] h-[6px] rounded-full bg-[var(--c-blue)] ml-[2px]" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  settings: PMSettings;
  onUpdate: <K extends keyof PMSettings>(key: K, value: PMSettings[K]) => void;
}

export default function SettingsTab({ settings, onUpdate }: Props) {
  const C = getTokens(settings);
  const layout = settings.homeLayout || "digest";
  const theme = settings.theme || "light";

  return (
    <div className="max-w-[560px]" style={buildVars(C)}>
      <div className="mb-7">
        <div className="text-[22px] font-bold text-[var(--c-text)] tracking-[-0.02em]">Preferences</div>
        <div className="text-xs text-[var(--c-sub)] mt-[3px]">Personalize your PM workspace · Changes save instantly</div>
      </div>
      <div className={`${CARD} py-[22px] px-6`}>
        <div className="text-[10px] font-bold tracking-[0.08em] uppercase text-[var(--c-blue)] mb-[18px]">Display</div>
        <Seg
          label="Home Layout"
          desc="Order of sections on your dashboard home"
          options={[{ value: "digest", label: "Digest first", icon: "✦" }, { value: "stats", label: "Stats first", icon: "◫" }]}
          value={layout}
          onChange={v => onUpdate("homeLayout", v as "digest" | "stats")}
        />
        <Seg
          label="Theme"
          desc="Color scheme across all PM views"
          options={[{ value: "light", label: "Light", icon: "☀" }, { value: "dark", label: "Dark", icon: "◑" }]}
          value={theme}
          onChange={v => onUpdate("theme", v as "light" | "dark")}
          isLast
        />
        <div className="text-[11px] text-[var(--c-muted)] mt-[-4px]">
          Theme applies to the PM dashboard only. Sidebar uses its own dark theme.
        </div>
      </div>
    </div>
  );
}
