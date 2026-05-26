"use client";

import React from "react";
import type { PMSettings } from "@/hooks/use-pm-settings";

const CARD = "rounded-[14px] border border-(--c-border) shadow-[0_1px_4px_rgba(0,0,0,0.05)] bg-(--c-card)";

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
    <div className={!isLast ? "pb-5 mb-5 border-b border-(--c-border)" : ""}>
      <div className="flex items-baseline gap-2 mb-2.5">
        <span className="text-[13px] font-semibold text-(--c-text)">{label}</span>
        {desc && <span className="text-[11px] text-(--c-muted)">{desc}</span>}
      </div>
      <div className="inline-flex gap-0 bg-(--c-seg-bg) rounded-[10px] p-0.75 border border-(--c-border)">
        {options.map(o => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1.75 text-xs font-semibold px-4.5 py-2 rounded-lg border-0 cursor-pointer transition-all duration-150 ${
              value === o.value
                ? "bg-(--c-card) text-(--c-text) shadow-[0_1px_4px_rgba(0,0,0,0.10)]"
                : "bg-transparent text-(--c-sub)"
            }`}
          >
            <span className="text-[13px]">{o.icon}</span>
            {o.label}
            {value === o.value && (
              <span className="w-1.5 h-1.5 rounded-full bg-(--c-blue) ml-0.5" />
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
  const layout = settings.homeLayout || "digest";
  const theme = settings.theme || "light";

  return (
    <div className={`max-w-140 ${settings.theme === "dark" ? "pm-dark" : "pm-light"}`}>
      <div className="mb-7">
        <div className="text-[22px] font-bold text-(--c-text) tracking-[-0.02em]">Preferences</div>
        <div className="text-xs text-(--c-sub) mt-0.75">Personalize your PM workspace · Changes save instantly</div>
      </div>
      <div className={`${CARD} py-5.5 px-6`}>
        <div className="text-[10px] font-bold tracking-[0.08em] uppercase text-(--c-blue) mb-4.5">Display</div>
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
        <div className="text-[11px] text-(--c-muted) -mt-1">
          Theme applies to the PM dashboard only. Sidebar uses its own dark theme.
        </div>
      </div>
    </div>
  );
}
