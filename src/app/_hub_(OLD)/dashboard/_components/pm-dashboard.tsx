"use client";

import React, { useCallback, useEffect, useState } from "react";
import { usePMSettings } from "@/hooks/use-pm-settings";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import HomeTab from "@/components/hub/pm-tabs/home-tab";
import type { ClassificationAttentionItem } from "@/components/hub/pm-tabs/home-tab";
import type { CustomerWithProducts } from "@/components/hub/pm-tabs/clients-tab";
import type { CustomerProductRow, DigestLogRow } from "@/types/database";

// ── Phase 1 target baselines ────────────────────────────────────────────────
const TARGETS: Record<string, { label: string; target: number; unit: string }> = {
  llm_eligible_rate_pct:         { label: "LLM-Eligible Rate",       target: 70, unit: "%" },
  avg_classification_confidence: { label: "Avg Classification Conf", target: 80, unit: "%" },
  plan_approval_rate_pct:        { label: "Plan Approval Rate",       target: 70, unit: "%" },
  execution_success_rate_pct:    { label: "Execution Success Rate",   target: 85, unit: "%" },
};

const DISPLAY_METRICS: Array<{ key: string; label: string; unit?: string; isCurrency?: boolean }> = [
  { key: "customers_total",             label: "Customers Onboarded" },
  { key: "classifications_total",       label: "Tasks Classified" },
  { key: "llm_eligible_rate_pct",       label: "LLM-Eligible Rate",       unit: "%" },
  { key: "avg_classification_confidence", label: "Avg Confidence",         unit: "%" },
  { key: "assessments_total",           label: "Assessments Run" },
  { key: "plan_approval_rate_pct",      label: "Plan Approval Rate",       unit: "%" },
  { key: "plan_rejection_rate_pct",     label: "Plan Rejection Rate",      unit: "%" },
  { key: "executions_completed",        label: "Executions Completed" },
  { key: "execution_success_rate_pct",  label: "Execution Success Rate",   unit: "%" },
  { key: "llm_cost_total_usd",          label: "LLM Cost (All Time)",      isCurrency: true },
  { key: "llm_cost_month_usd",          label: "LLM Cost (This Month)",    isCurrency: true },
];

function MetricsPanel({ isDark }: { isDark: boolean }) {
  const [metrics, setMetrics] = useState<Record<string, number | null> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => r.json())
      .then((json) => setMetrics(json.metrics ?? null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mt-6">
      <h2 className={cn("text-sm font-bold mb-3", isDark ? "text-slate-400" : "text-slate-700")}>Phase 1 Metrics</h2>
      <div className="grid grid-cols-4 gap-3">
        {DISPLAY_METRICS.map(({ key, label, unit, isCurrency }) => {
          const raw = metrics?.[key] ?? null;
          const val =
            raw === null
              ? "—"
              : isCurrency
              ? `$${Number(raw).toFixed(4)}`
              : `${raw}${unit ?? ""}`;
          const target = TARGETS[key];
          const atTarget = target && raw !== null ? Number(raw) >= target.target : null;

          return (
            <div
              key={key}
              className={cn(
                "rounded-xl px-4 py-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]",
                isDark ? "bg-[#121726] border border-white/8" : "bg-white border border-slate-200"
              )}
            >
              <div
                className={cn(
                  "text-xl font-extrabold tracking-tight",
                  loading ? "text-slate-500" : isDark ? "text-white" : "text-slate-900"
                )}
              >
                {loading ? "…" : val}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">{label}</div>
              {target && !loading && raw !== null && (
                <div
                  className={cn(
                    "text-[10px] font-semibold mt-1",
                    atTarget ? "text-green-600" : "text-red-500"
                  )}
                >
                  Target: {target.target}{target.unit} {atTarget ? "✓" : "↓"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PMDashboard() {
  const { settings } = usePMSettings();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerWithProducts[]>([]);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [classificationAttentionItems, setClassificationAttentionItems] = useState<ClassificationAttentionItem[]>([]);
  const [openTasksCount, setOpenTasksCount] = useState(0);
  const [inPipelineCount, setInPipelineCount] = useState(0);
  const [latestDigest, setLatestDigest] = useState<DigestLogRow | null>(null);
  const [triggeringDigest, setTriggeringDigest] = useState(false);
  const [clarificationNeededCount, setClarificationNeededCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase
        .from("hub_users")
        .select("first_name, last_name")
        .eq("id", data.user.id)
        .single()
        .then(({ data: profile }) => {
          if (profile) {
            const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
            if (name) setDisplayName(name);
          }
        });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/customers?limit=100")
      .then(r => r.json())
      .then(data => { if (!cancelled) setCustomers(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function fetchClassificationData() {
      const [countResult, itemsResult, openResult, pipelineResult] = await Promise.all([
        supabase
          .from("classification_records")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("classification_records")
          .select("id, title, customer_id, priority, created_at")
          .eq("status", "pending")
          .in("priority", ["CRITICAL", "HIGH"])
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("classification_records")
          .select("*", { count: "exact", head: true })
          .neq("status", "rejected"),
        supabase
          .from("classification_records")
          .select("*", { count: "exact", head: true })
          .eq("llm_eligible", "YES")
          .eq("status", "pending"),
      ]);

      if (!cancelled) {
        setPendingReviewCount(countResult.count ?? 0);
        setClassificationAttentionItems(
          (itemsResult.data ?? []) as ClassificationAttentionItem[]
        );
        setOpenTasksCount(openResult.count ?? 0);
        setInPipelineCount(pipelineResult.count ?? 0);
      }
    }

    fetchClassificationData();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("pm_home_products")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "customer_products" }, (payload) => {
        const updated = payload.new as CustomerProductRow;
        setCustomers(prev =>
          prev.map(c => ({
            ...c,
            customer_products: c.customer_products.map(p =>
              p.id === updated.id ? { ...p, ...updated } : p
            ),
          }))
        );
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const today = new Date().toISOString().split("T")[0];

    supabase
      .from("digest_logs")
      .select("*")
      .eq("digest_type", "pm")
      .eq("digest_date", today)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setLatestDigest(data ?? null);
      });

    supabase
      .from("requirements_assessments")
      .select("*", { count: "exact", head: true })
      .in("overall_status", ["PARTIAL", "BLOCKED"])
      .then(({ count }) => {
        if (!cancelled) setClarificationNeededCount(count ?? 0);
      });

    return () => { cancelled = true; };
  }, []);

  const handleFeedback = useCallback(async (id: string, feedback: "useful" | "partial" | "not_useful") => {
    await fetch(`/api/digest/${id}/feedback`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
    });
  }, []);

  const triggerDigest = useCallback(async () => {
    setTriggeringDigest(true);
    try {
      const res = await fetch("/api/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "pm" }),
      });
      if (res.ok) {
        const data: DigestLogRow = await res.json();
        setLatestDigest(data);
      }
    } finally {
      setTriggeringDigest(false);
    }
  }, []);

  return (
    <div
      className={`flex-1 overflow-y-auto py-6.5 px-8 ${settings.theme === "dark" ? "bg-[#090c18]" : "bg-[#f5f4f1]"}`}
    >
      {process.env.NODE_ENV === "development" && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={triggerDigest}
            disabled={triggeringDigest}
            className="text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 cursor-pointer disabled:opacity-50"
          >
            {triggeringDigest ? "Generating…" : "Trigger Digest (dev)"}
          </button>
        </div>
      )}
      <HomeTab
        customers={customers}
        settings={settings}
        displayName={displayName}
        pendingReviewCount={pendingReviewCount}
        classificationAttentionItems={classificationAttentionItems}
        openTasksCount={openTasksCount}
        inPipelineCount={inPipelineCount}
        digest={latestDigest}
        onFeedback={handleFeedback}
        clarificationNeededCount={clarificationNeededCount}
      />
      {/* Metrics panel (PM-visible, read-only) */}
      <MetricsPanel isDark={settings.theme === "dark"} />
    </div>
  );
}
