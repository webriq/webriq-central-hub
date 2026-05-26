"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CustomerWithProducts } from "./clients-tab";
import type { PMSettings } from "@/hooks/use-pm-settings";
import type { DigestLogRow } from "@/types/database";
import { formatRelativeTime } from "@/lib/utils";
import {
  StatCard, ProgressBar, StatusBadge,
  PriorityDot, SectionHeader, ClientAvatar, getClientColor, getClientColorClass,
} from "./shared";

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

const CARD = "rounded-[14px] border border-(--c-border) shadow-[0_1px_4px_rgba(0,0,0,0.05)] bg-(--c-card)";

/* ── Pipeline color classes (static strings for Tailwind scan) ───────────── */

const PIPELINE_CLASSES: Record<string, { bar: string; num: string }> = {
  violet: { bar: "bg-(--c-violet)", num: "text-(--c-violet)" },
  sky:    { bar: "bg-(--c-sky)",    num: "text-(--c-sky)" },
  blue:   { bar: "bg-(--c-blue)",   num: "text-(--c-blue)" },
  orange: { bar: "bg-(--c-orange)", num: "text-(--c-orange)" },
  green:  { bar: "bg-(--c-green)",  num: "text-(--c-green)" },
};

/* ── Sub-components ──────────────────────────────────────────────────────── */

type DigestContent = {
  summary: string;
  attention_items: Array<{ title: string; customer_id: string; priority: string }>;
  stalled_items: string[];
  ready_to_close: number;
  highlights: string;
  automation_queue_count?: number;
  unassigned_count?: number;
};

interface DigestCardProps {
  attentionCount: number;
  activeCount: number;
  onboardingCount: number;
  digest?: DigestLogRow | null;
  onFeedback?: (id: string, feedback: "useful" | "partial" | "not_useful") => void;
  clarificationNeededCount?: number;
}

function DigestCard({ attentionCount, activeCount, onboardingCount, digest, onFeedback, clarificationNeededCount = 0 }: DigestCardProps) {
  const [feedbackSent, setFeedbackSent] = useState<string | null>(null);

  const content = digest?.content as DigestContent | null;

  const summaryText = content?.summary
    ?? `${attentionCount > 0 ? `${attentionCount} items need your attention. ` : ""}${activeCount} active clients. ${onboardingCount} in onboarding.`;

  function handleFeedback(fb: "useful" | "partial" | "not_useful") {
    if (!digest || feedbackSent) return;
    setFeedbackSent(fb);
    onFeedback?.(digest.id, fb);
  }

  return (
    <div className={`${CARD} p-5 mb-4 relative overflow-hidden`}>
      <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-[linear-gradient(90deg,var(--c-blue),var(--c-orange))]" />
      <div className="flex items-center gap-2 mb-2.75">
        <div className="w-6 h-6 rounded-[7px] bg-(--c-blue-tint) border border-(--c-blue-tint-border) flex items-center justify-center text-xs text-(--c-blue)">
          ✦
        </div>
        <span className="text-[10px] font-bold text-(--c-sky) tracking-[0.07em] uppercase">
          AI Daily Digest
        </span>
        <span className="text-[11px] text-(--c-muted) ml-auto">{formatCurrentDate()}</span>
      </div>

      <p className="text-[13px] text-(--c-sub) leading-[1.65] mb-3.5">
        {content
          ? <>{summaryText}</>
          : <><strong className="text-(--c-orange)">{attentionCount} items need your attention.</strong>{" "}{activeCount} active clients. {onboardingCount} in onboarding.</>
        }
      </p>

      {content?.highlights && (
        <p className="text-[11px] text-(--c-muted) mb-3 italic">{content.highlights}</p>
      )}

      {(clarificationNeededCount > 0 || (content?.automation_queue_count ?? 0) > 0 || (content?.unassigned_count ?? 0) > 0) ? (
        <div className="flex gap-2 flex-wrap mb-3">
          {clarificationNeededCount > 0 ? (
            <span className="text-[11px] font-semibold text-[#a16207] bg-[rgba(234,179,8,0.08)] border border-[rgba(234,179,8,0.2)] rounded-lg px-3 py-1">
              {clarificationNeededCount} need clarification
            </span>
          ) : null}
          {(content?.automation_queue_count ?? 0) > 0 ? (
            <span className="text-[11px] font-semibold text-(--c-sky) bg-(--c-sky-tint) border border-(--c-sky-border3) rounded-lg px-3 py-1">
              {content?.automation_queue_count} in automation queue
            </span>
          ) : null}
          {(content?.unassigned_count ?? 0) > 0 ? (
            <span className="text-[11px] font-semibold text-(--c-violet) bg-[rgba(99,102,241,0.07)] border border-[rgba(99,102,241,0.18)] rounded-lg px-3 py-1">
              {content?.unassigned_count} unassigned
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-2 flex-wrap">
        <button className="text-xs font-semibold text-(--c-sky) bg-(--c-sky-tint) border border-(--c-sky-border3) rounded-lg px-4 py-2 cursor-pointer">
          View Full Digest
        </button>

        {digest && !feedbackSent && (
          <>
            <button
              onClick={() => handleFeedback("useful")}
              className="text-xs font-semibold text-(--c-sub) bg-[rgba(128,128,128,0.06)] border border-(--c-border) rounded-lg px-3 py-2 cursor-pointer"
            >
              Useful ✓
            </button>
            <button
              onClick={() => handleFeedback("partial")}
              className="text-xs font-semibold text-(--c-sub) bg-[rgba(128,128,128,0.06)] border border-(--c-border) rounded-lg px-3 py-2 cursor-pointer"
            >
              Partial
            </button>
            <button
              onClick={() => handleFeedback("not_useful")}
              className="text-xs font-semibold text-(--c-sub) bg-[rgba(128,128,128,0.06)] border border-(--c-border) rounded-lg px-3 py-2 cursor-pointer"
            >
              Not Useful
            </button>
          </>
        )}

        {feedbackSent && (
          <span className="text-xs text-(--c-muted) py-2 px-2">
            Thanks for the feedback
          </span>
        )}
      </div>
    </div>
  );
}

interface StatsRowProps {
  stats: Array<{ v: string; l: string; colorVar: string }>;
}

function StatsRow({ stats }: StatsRowProps) {
  return (
    <div className="grid grid-cols-4 gap-3 mb-5.5">
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
  digest?: DigestLogRow | null;
  onFeedback?: (id: string, feedback: "useful" | "partial" | "not_useful") => void;
  clarificationNeededCount?: number;
}

/* ── HomeTab ─────────────────────────────────────────────────────────────── */

export default function HomeTab({ customers, settings, displayName, pendingReviewCount = 0, classificationAttentionItems = [], openTasksCount = 0, inPipelineCount = 0, digest, onFeedback, clarificationNeededCount = 0 }: HomeTabProps) {
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
    <div className={settings.theme === "dark" ? "pm-dark" : "pm-light"}>
      <AnimatePresence>
        {greetingVisible && greetingText && (
          <motion.div
            className="mb-5.5 cursor-pointer select-none"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.35 }}
            onClick={() => setGreetingVisible(false)}
            title="Click to dismiss"
          >
            <div className="text-[22px] font-bold text-(--c-text) tracking-[-0.02em]">
              {greetingText}
            </div>
            <div className="text-xs text-(--c-sub) mt-0.75">{formatCurrentDate()}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {digestFirst && (
        <DigestCard attentionCount={attention.length} activeCount={activeCount} onboardingCount={onboardingCount} digest={digest} onFeedback={onFeedback} clarificationNeededCount={clarificationNeededCount} />
      )}

      <StatsRow stats={stats} />


      <div className="grid grid-cols-[3fr_2fr] gap-4">
        {/* Left column */}
        <div>
          {!digestFirst && (
            <DigestCard attentionCount={attention.length} activeCount={activeCount} onboardingCount={onboardingCount} digest={digest} onFeedback={onFeedback} clarificationNeededCount={clarificationNeededCount} />
          )}
          <SectionHeader title="Needs Attention" sub={`${attention.length} item${attention.length !== 1 ? "s" : ""}`} action="View all →" />
          <div className="flex flex-col gap-2">
            {attention.slice(0, 4).map(t => (
              <div key={t.id} className={`${CARD} py-3 px-4 flex gap-3 items-start cursor-pointer`}>
                <div className="pt-1.25"><PriorityDot priority={t.priority} /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-(--c-text) leading-[1.4]">{t.title}</div>
                  <div className="flex gap-2 mt-1.25 items-center">
                    <span className="text-[11px] text-(--c-sub)">{t.customer}</span>
                    <span className="text-[10px] text-(--c-sky) bg-(--c-sky-tint2) rounded-[5px] px-1.75 py-px border border-(--c-sky-border)">
                      {t.type}
                    </span>
                    <code className="text-[10px] text-(--c-muted) font-mono ml-auto">{t.id}</code>
                    <span className="text-[11px] text-(--c-muted)">{t.t}</span>
                  </div>
                </div>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" className="shrink-0 stroke-(--c-muted)">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div>
          {/* Pipeline Overview */}
          <div className={`${CARD} py-4 px-4.5 mb-3.5`}>
            <div className="text-[13px] font-bold text-(--c-text) mb-3.25">Pipeline Overview</div>
            {pipeline.map(s => {
              const cc = PIPELINE_CLASSES[s.ck];
              return (
                <div key={s.l} className="flex items-center gap-2.5 mb-2.25">
                  <div className="text-xs text-(--c-sub) w-14.5 shrink-0">{s.l}</div>
                  <div className="flex-1 h-1.25 bg-(--c-track) rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full opacity-75 ${cc.bar}`}
                      style={{ width: `${Math.min(100, (s.n / 5) * 100)}%` }}
                    />
                  </div>
                  <span className={`text-xs font-semibold w-3.5 text-right ${cc.num}`}>{s.n}</span>
                </div>
              );
            })}
            <button className="w-full mt-1.5 text-xs font-semibold text-(--c-sky) bg-(--c-sky-tint) border border-(--c-sky-border2) rounded-lg py-1.75 cursor-pointer">
              Open Pipeline →
            </button>
          </div>

          {/* Client Health */}
          <div className={`${CARD} py-4 px-4.5`}>
            <div className="text-[13px] font-bold text-(--c-text) mb-3">Client Health</div>
            {customers.slice(0, 6).map(cl => {
              const pcts = (cl.customer_products ?? []).map(p => p.completed_percentage ?? 0);
              const avg = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;
              return (
                <div key={cl.id} className="flex items-center gap-2.5 mb-2.75">
                  <ClientAvatar name={cl.company_name} color={getClientColor(cl.company_name)} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-(--c-text) mb-1">{cl.company_name}</div>
                    <ProgressBar pct={Math.round(avg)} colorClass={getClientColorClass(cl.company_name)} />
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
