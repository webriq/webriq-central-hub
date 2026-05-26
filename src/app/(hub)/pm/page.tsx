"use client";

import React, { useCallback, useEffect, useState } from "react";
import { usePMSettings } from "@/hooks/use-pm-settings";
import { createClient } from "@/lib/supabase/client";
import HomeTab from "@/components/hub/pm-tabs/home-tab";
import type { ClassificationAttentionItem } from "@/components/hub/pm-tabs/home-tab";
import type { CustomerWithProducts } from "@/components/hub/pm-tabs/clients-tab";
import type { CustomerProductRow, DigestLogRow } from "@/types/database";

export default function PMHomePage() {
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
        .select("display_name")
        .eq("id", data.user.id)
        .single()
        .then(({ data: profile }) => {
          if (profile?.display_name) setDisplayName(profile.display_name);
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
    </div>
  );
}
