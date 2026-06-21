"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePMSettings } from "@/hooks/use-pm-settings";
import PMDashboard from "./pm-dashboard";
import { SectionCard } from "./dashboard-shared";

type LLMLog = { customer_id: string | null; cost_usd: number | null };

interface Props {
  userId: string;
  displayName: string | null;
}

export default function AdminDashboard({ displayName }: Props) {
  const { settings } = usePMSettings();
  const isDark = settings.theme === "dark";

  const [llmLogs, setLlmLogs] = useState<LLMLog[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("llm_invocation_logs").select("customer_id, cost_usd").not("customer_id", "is", null),
      supabase.from("classification_records").select("status"),
    ]).then(([llmResult, classResult]) => {
      setLlmLogs((llmResult.data ?? []) as LLMLog[]);
      const counts: Record<string, number> = {};
      for (const r of classResult.data ?? []) {
        counts[r.status] = (counts[r.status] ?? 0) + 1;
      }
      setStatusCounts(counts);
      setLoading(false);
    });
  }, []);

  const spendByCustomer: Record<string, number> = {};
  for (const log of llmLogs) {
    if (log.customer_id) {
      spendByCustomer[log.customer_id] = (spendByCustomer[log.customer_id] ?? 0) + (log.cost_usd ?? 0);
    }
  }
  const topCustomers = Object.entries(spendByCustomer)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);
  const maxSpend = topCustomers[0]?.[1] ?? 1;

  const pendingCount = (statusCounts.pending ?? 0) + (statusCounts.open ?? 0);
  const activeCount  = (statusCounts.active ?? 0) + (statusCounts.planning ?? 0);
  const closedCount  = statusCounts.closed ?? 0;

  return (
    <div className={isDark ? "pm-dark" : "pm-light"}>
      {/* Reuse PM dashboard for core content */}
      <PMDashboard displayName={displayName} />

      {/* Admin-only extras */}
      <div className="px-8 pb-8 flex flex-col gap-5 mt-2">
        <div className={`text-[11px] font-bold uppercase tracking-widest px-1 ${isDark ? "text-slate-600" : "text-slate-400"}`}>
          Admin
        </div>

        <div className="grid grid-cols-2 gap-5">
          {/* LLM Spend by Customer */}
          <SectionCard title="LLM Spend by Customer">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-6 animate-pulse bg-(--c-track) rounded" />)}
              </div>
            ) : topCustomers.length === 0 ? (
              <p className="text-[12px] text-(--c-muted) py-2">No LLM usage recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {topCustomers.map(([customerId, spend]) => (
                  <div key={customerId} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-(--c-sub)">{customerId}</span>
                      <span className="text-[11px] text-(--c-sub)">${spend.toFixed(4)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-(--c-track) overflow-hidden">
                      <div
                        className="h-full rounded-full bg-(--c-blue) transition-[width] duration-300"
                        style={{ width: `${(spend / maxSpend) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Event Bus Health */}
          <SectionCard title="Event Bus Health">
            <div className="grid grid-cols-3 gap-3 py-2">
              <div className={`rounded-xl p-3 text-center ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                <div className="text-xl font-bold text-[var(--c-blue)]">{loading ? "—" : pendingCount}</div>
                <div className="text-[10px] text-(--c-muted) mt-0.5">Pending</div>
              </div>
              <div className={`rounded-xl p-3 text-center ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                <div className="text-xl font-bold text-[var(--c-green)]">{loading ? "—" : activeCount}</div>
                <div className="text-[10px] text-(--c-muted) mt-0.5">Processing</div>
              </div>
              <div className={`rounded-xl p-3 text-center ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                <div className="text-xl font-bold text-[var(--c-orange)]">{loading ? "—" : closedCount}</div>
                <div className="text-[10px] text-(--c-muted) mt-0.5">Closed</div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
