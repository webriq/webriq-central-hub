"use client";

import React, { useEffect, useState } from "react";
import { usePMSettings } from "@/hooks/use-pm-settings";
import { createClient } from "@/lib/supabase/client";
import { getTokens } from "@/components/hub/pm-tabs/shared";
import HomeTab from "@/components/hub/pm-tabs/home-tab";
import type { ClassificationAttentionItem } from "@/components/hub/pm-tabs/home-tab";
import type { CustomerWithProducts } from "@/components/hub/pm-tabs/clients-tab";
import type { CustomerProductRow } from "@/types/database";

export default function PMHomePage() {
  const { settings } = usePMSettings();
  const C = getTokens(settings);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerWithProducts[]>([]);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [classificationAttentionItems, setClassificationAttentionItems] = useState<ClassificationAttentionItem[]>([]);
  const [openTasksCount, setOpenTasksCount] = useState(0);
  const [inPipelineCount, setInPipelineCount] = useState(0);

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

  return (
    <div
      className="flex-1 overflow-y-auto py-[26px] px-8 bg-[var(--c-page-bg)]"
      style={{ "--c-page-bg": C.bg } as React.CSSProperties}
    >
      <HomeTab
        customers={customers}
        settings={settings}
        displayName={displayName}
        pendingReviewCount={pendingReviewCount}
        classificationAttentionItems={classificationAttentionItems}
        openTasksCount={openTasksCount}
        inPipelineCount={inPipelineCount}
      />
    </div>
  );
}
