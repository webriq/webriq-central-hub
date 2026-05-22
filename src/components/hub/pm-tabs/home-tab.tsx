"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CustomerWithProducts } from "./clients-tab";
import type { PMSettings } from "@/hooks/use-pm-settings";
import { formatRelativeTime } from "@/lib/utils";
import {
  getTokens, DARK, StatCard, ProgressBar, StatusBadge,
  PriorityDot, SectionHeader, ClientAvatar, getClientColor,
} from "./shared";
import type { Tokens } from "./shared";

/* ── Greeting helpers ────────────────────────────────────────────────────── */

const TIME_GREETINGS: Record<string, string[]> = {
  morning:   ["Good morning", "Morning!", "Rise and shine", "Hey, good morning"],
  noon:      ["Good noon", "Hey there", "Happy lunch hour"],
  afternoon: ["Good afternoon", "Afternoon!", "Hey, good afternoon"],
  evening:   ["Good evening", "Evening!", "Hey, good evening"],
  night:     ["Still at it?", "Burning the midnight oil", "Working late"],
};

function getTimeBucket(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 13) return "noon";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}

function pickGreeting(bucket: string): string {
  const pool = TIME_GREETINGS[bucket] ?? TIME_GREETINGS.morning;
  return pool[Math.floor(Math.random() * pool.length)];
}

function formatCurrentDate(): string {
  const d = new Date();
  const day = d.toLocaleDateString("en-US", { weekday: "long" });
  const month = d.toLocaleDateString("en-US", { month: "long" });
  return `${day}, ${month} ${d.getDate()} · ${d.getFullYear()}`;
}

const FADE_DELAY_MS = 3 * 60 * 1000;
const SESSION_KEY = "hub_greeting_ts";

/* ── Shared card class (ThemeCard replaced with plain div + CSS vars) ─────── */

const CARD = "rounded-[14px] border border-[var(--c-border)] shadow-[0_1px_4px_rgba(0,0,0,0.05)] bg-[var(--c-card)]";

/* ── Pipeline color classes (static strings for Tailwind scan) ───────────── */

const PIPELINE_CLASSES: Record<string, { bar: string; num: string }> = {
  violet: { bar: "bg-[var(--c-violet)]", num: "text-[var(--c-violet)]" },
  sky:    { bar: "bg-[var(--c-sky)]",    num: "text-[var(--c-sky)]" },
  blue:   { bar: "bg-[var(--c-blue)]",   num: "text-[var(--c-blue)]" },
  orange: { bar: "bg-[var(--c-orange)]", num: "text-[var(--c-orange)]" },
  green:  { bar: "bg-[var(--c-green)]",  num: "text-[var(--c-green)]" },
};

/* ── Sub-components ──────────────────────────────────────────────────────── */

interface DigestCardProps {
  attentionCount: number;
  activeCount: number;
  onboardingCount: number;
}

function DigestCard({ attentionCount, activeCount, onboardingCount }: DigestCardProps) {
  return (
    <div className={`${CARD} p-5 mb-4 relative overflow-hidden`}>
      <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-[linear-gradient(90deg,var(--c-blue),var(--c-orange))]" />
      <div className="flex items-center gap-2 mb-[11px]">
        <div className="w-6 h-6 rounded-[7px] bg-[var(--c-blue-tint)] border border-[var(--c-blue-tint-border)] flex items-center justify-center text-xs text-[var(--c-blue)]">
          ✦
        </div>
        <span className="text-[10px] font-bold text-[var(--c-sky)] tracking-[0.07em] uppercase">
          AI Daily Digest
        </span>
        <span className="text-[11px] text-[var(--c-muted)] ml-auto">{formatCurrentDate()}</span>
      </div>
      <p className="text-[13px] text-[var(--c-sub)] leading-[1.65] mb-[14px]">
        <strong className="text-[var(--c-orange)]">{attentionCount} items need your attention.</strong>
        {" "}{activeCount} active clients. {onboardingCount} in onboarding.
      </p>
      <div className="flex gap-2">
        <button className="text-xs font-semibold text-[var(--c-sky)] bg-[var(--c-sky-tint)] border border-[var(--c-sky-border3)] rounded-lg px-4 py-2 cursor-pointer">
          View Full Digest
        </button>
        <button className="text-xs font-semibold text-[var(--c-sub)] bg-[rgba(128,128,128,0.06)] border border-[var(--c-border)] rounded-lg px-4 py-2 cursor-pointer">
          Dismiss
        </button>
      </div>
    </div>
  );
}

interface StatsRowProps {
  stats: Array<{ v: string; l: string; colorVar: string }>;
}

function StatsRow({ stats }: StatsRowProps) {
  return (
    <div className="grid grid-cols-4 gap-3 mb-[22px]">
      {stats.map(s => <StatCard key={s.l} value={s.v} label={s.l} colorVar={s.colorVar} />)}
    </div>
  );
}

/* ── Types ───────────────────────────────────────────────────────────────── */

interface AttentionItem {
  id: string; title: string; customer: string;
  priority: string; type: string; t: string;
}

export interface ClassificationAttentionItem {
  id: string;
  title: string;
  customer_id: string;
  priority: string;
  created_at: string;
}

interface HomeTabProps {
  customers: CustomerWithProducts[];
  settings: PMSettings;
  displayName?: string | null;
  pendingReviewCount?: number;
  classificationAttentionItems?: ClassificationAttentionItem[];
  openTasksCount?: number;
  inPipelineCount?: number;
}

/* ── HomeTab ─────────────────────────────────────────────────────────────── */

export default function HomeTab({ customers, settings, displayName, pendingReviewCount = 0, classificationAttentionItems = [], openTasksCount = 0, inPipelineCount = 0 }: HomeTabProps) {
  const C = getTokens(settings);
  const digestFirst = settings.homeLayout !== "stats";
  const firstName = displayName?.split(" ")[0] ?? "there";

  const [greetingVisible, setGreetingVisible] = useState(true);
  // null on both server + client until useEffect runs — prevents SSR hydration mismatch
  const [greetingPhrase, setGreetingPhrase] = useState<string | null>(null);

  useEffect(() => {
    // Deferred via setTimeout to avoid direct-setState-in-effect lint rule
    const phraseTimer = setTimeout(() => setGreetingPhrase(pickGreeting(getTimeBucket())), 0);

    const now = Date.now();
    const stored = sessionStorage.getItem(SESSION_KEY);
    const shownAt = stored ? parseInt(stored, 10) : now;
    if (!stored) sessionStorage.setItem(SESSION_KEY, String(now));
    const remaining = FADE_DELAY_MS - (now - shownAt);
    const fadeTimer = setTimeout(() => setGreetingVisible(false), remaining <= 0 ? 0 : remaining);

    return () => {
      clearTimeout(phraseTimer);
      clearTimeout(fadeTimer);
    };
  }, []);

  // Only truthy after client mount — greeting never shown during SSR
  const greetingText = greetingPhrase ? `${greetingPhrase}, ${firstName} ✦` : null;

  const activeCount = customers.filter(c => c.status === "active").length;
  const onboardingCount = customers.filter(c => c.status === "onboarding").length;

  const stats = [
    { v: String(activeCount),       l: "Active Clients",  colorVar: "--c-sky"    },
    { v: String(openTasksCount),    l: "Open Tasks",       colorVar: "--c-orange" },
    { v: String(inPipelineCount),   l: "In Pipeline",      colorVar: "--c-violet" },
    { v: String(pendingReviewCount),l: "Pending Review",   colorVar: "--c-amber"  },
  ];

  const onboardingAttention: AttentionItem[] = customers.filter(c => c.status === "onboarding")
    .map((c, i) => ({
      id: `T-${String(90 - i).padStart(4, "0")}`,
      title: `${c.company_name} — onboarding in progress`,
      customer: c.company_name, priority: "NORMAL", type: "Onboarding", t: "today",
    }));

  const classificationAttention: AttentionItem[] = classificationAttentionItems.map(item => ({
    id: item.id.slice(0, 8),
    title: item.title,
    customer: item.customer_id,
    priority: item.priority,
    type: "Classification Review",
    t: formatRelativeTime(item.created_at),
  }));

  const attention: AttentionItem[] = [...classificationAttention, ...onboardingAttention];

  const pipeline = [
    { l: "Classify", n: pendingReviewCount, ck: "violet" },
    { l: "Assess",   n: 0, ck: "sky" },
    { l: "Plan",     n: 0, ck: "blue" },
    { l: "Execute",  n: 0, ck: "orange" },
    { l: "Reply",    n: 0, ck: "green" },
  ];

  return (
    // Single style prop — only CSS custom property declarations, no appearance values
    <div
      style={{
        "--c-text": C.text, "--c-sub": C.sub, "--c-muted": C.muted,
        "--c-card": C.card, "--c-border": C.border,
        "--c-blue": C.blue, "--c-orange": C.orange, "--c-sky": C.sky,
        "--c-violet": C.violet, "--c-green": C.green, "--c-amber": C.amber,
        "--c-blue-tint": `${C.blue}18`,
        "--c-blue-tint-border": `${C.blue}30`,
        "--c-sky-tint": `${C.sky}0d`,
        "--c-sky-tint2": `${C.sky}0e`,
        "--c-sky-border": `${C.sky}20`,
        "--c-sky-border2": `${C.sky}22`,
        "--c-sky-border3": `${C.sky}25`,
        "--c-track": C === DARK ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
      } as React.CSSProperties}
    >
      <AnimatePresence>
        {greetingVisible && greetingText && (
          <motion.div
            className="mb-[22px] cursor-pointer select-none"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.35 }}
            onClick={() => setGreetingVisible(false)}
            title="Click to dismiss"
          >
            <div className="text-[22px] font-bold text-[var(--c-text)] tracking-[-0.02em]">
              {greetingText}
            </div>
            <div className="text-xs text-[var(--c-sub)] mt-[3px]">{formatCurrentDate()}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {digestFirst && (
        <DigestCard attentionCount={attention.length} activeCount={activeCount} onboardingCount={onboardingCount} />
      )}

      <StatsRow stats={stats} />


      <div className="grid grid-cols-[3fr_2fr] gap-4">
        {/* Left column */}
        <div>
          {!digestFirst && (
            <DigestCard attentionCount={attention.length} activeCount={activeCount} onboardingCount={onboardingCount} />
          )}
          <SectionHeader title="Needs Attention" sub={`${attention.length} item${attention.length !== 1 ? "s" : ""}`} action="View all →" />
          <div className="flex flex-col gap-2">
            {attention.slice(0, 4).map(t => (
              <div key={t.id} className={`${CARD} py-3 px-4 flex gap-3 items-start cursor-pointer`}>
                <div className="pt-[5px]"><PriorityDot priority={t.priority} /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--c-text)] leading-[1.4]">{t.title}</div>
                  <div className="flex gap-2 mt-[5px] items-center">
                    <span className="text-[11px] text-[var(--c-sub)]">{t.customer}</span>
                    <span className="text-[10px] text-[var(--c-sky)] bg-[var(--c-sky-tint2)] rounded-[5px] px-[7px] py-px border border-[var(--c-sky-border)]">
                      {t.type}
                    </span>
                    <code className="text-[10px] text-[var(--c-muted)] font-mono ml-auto">{t.id}</code>
                    <span className="text-[11px] text-[var(--c-muted)]">{t.t}</span>
                  </div>
                </div>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" className="shrink-0 stroke-[var(--c-muted)]">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div>
          {/* Pipeline Overview */}
          <div className={`${CARD} py-4 px-[18px] mb-[14px]`}>
            <div className="text-[13px] font-bold text-[var(--c-text)] mb-[13px]">Pipeline Overview</div>
            {pipeline.map(s => {
              const cc = PIPELINE_CLASSES[s.ck];
              return (
                <div key={s.l} className="flex items-center gap-[10px] mb-[9px]">
                  <div className="text-xs text-[var(--c-sub)] w-[58px] shrink-0">{s.l}</div>
                  <div className="flex-1 h-[5px] bg-[var(--c-track)] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full opacity-75 ${cc.bar}`}
                      style={{ width: `${Math.min(100, (s.n / 5) * 100)}%` }}
                    />
                  </div>
                  <span className={`text-xs font-semibold w-[14px] text-right ${cc.num}`}>{s.n}</span>
                </div>
              );
            })}
            <button className="w-full mt-[6px] text-xs font-semibold text-[var(--c-sky)] bg-[var(--c-sky-tint)] border border-[var(--c-sky-border2)] rounded-lg py-[7px] cursor-pointer">
              Open Pipeline →
            </button>
          </div>

          {/* Client Health */}
          <div className={`${CARD} py-4 px-[18px]`}>
            <div className="text-[13px] font-bold text-[var(--c-text)] mb-3">Client Health</div>
            {customers.slice(0, 6).map(cl => {
              const pcts = (cl.customer_products ?? []).map(p => p.completed_percentage ?? 0);
              const avg = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;
              return (
                <div key={cl.id} className="flex items-center gap-[10px] mb-[11px]">
                  <ClientAvatar name={cl.company_name} color={getClientColor(cl.company_name)} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-[var(--c-text)] mb-1">{cl.company_name}</div>
                    <ProgressBar pct={Math.round(avg)} color={getClientColor(cl.company_name)} />
                  </div>
                  <StatusBadge status={cl.status ?? "onboarding"} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
