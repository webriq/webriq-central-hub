"use client";

import React, { useEffect, useState } from "react";
import { usePMSettings } from "@/hooks/use-pm-settings";
import PipelineTab from "@/components/hub/pm-tabs/pipeline-tab";
import { createClient } from "@/lib/supabase/client";

type ClassifyItem = { id: string; title: string; customer: string; t: string };

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function PMPipelinePage() {
  const { settings } = usePMSettings();
  const [classifyItems, setClassifyItems] = useState<ClassifyItem[]>([]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase
      .from("classification_records")
      .select("id, title, customer_id, created_at, customers(company_name)")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!cancelled && data) {
          setClassifyItems(
            data.map(r => ({
              id: r.id,
              title: r.title,
              customer: (r.customers as { company_name: string } | null)?.company_name ?? r.customer_id,
              t: formatAge(r.created_at),
            }))
          );
        }
      });

    return () => { cancelled = true; };
  }, []);

  return (
    <div
      className={`flex-1 overflow-y-auto py-6.5 px-8 ${settings.theme === "dark" ? "bg-[#090c18]" : "bg-[#f5f4f1]"}`}
    >
      <PipelineTab
        settings={settings}
        classifyItems={classifyItems}
        classifyCount={classifyItems.length}
      />
    </div>
  );
}
