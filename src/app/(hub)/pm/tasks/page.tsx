"use client";

import React, { useEffect, useState } from "react";
import { usePMSettings } from "@/hooks/use-pm-settings";
import TasksTab from "@/components/hub/pm-tabs/tasks-tab";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type ClassificationRow = Database["public"]["Tables"]["classification_records"]["Row"] & {
  customers?: { company_name: string } | null;
};

export default function PMTasksPage() {
  const { settings } = usePMSettings();
  const [tasks, setTasks] = useState<ClassificationRow[]>([]);
  const [zohoProjectMap, setZohoProjectMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    function fetchTasks() {
      supabase
        .from("classification_records")
        .select("*, customers(company_name)")
        .order("created_at", { ascending: false })
        .limit(100)
        .then(({ data }) => {
          if (!cancelled) setTasks((data as ClassificationRow[]) ?? []);
        });
    }

    fetchTasks();

    // Fetch zoho_project_id per customer for Zoho links (one-time; doesn't change frequently)
    supabase
      .from("customer_products")
      .select("customer_id, zoho_project_id")
      .not("zoho_project_id", "is", null)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map: Record<string, string> = {};
        for (const p of data as Array<{ customer_id: string; zoho_project_id: string | null }>) {
          if (p.zoho_project_id && !map[p.customer_id]) {
            map[p.customer_id] = p.zoho_project_id;
          }
        }
        setZohoProjectMap(map);
      });

    const channel = supabase
      .channel("pm_tasks_classification")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "classification_records" },
        fetchTasks
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div
      className={`flex-1 overflow-y-auto py-6.5 px-8 ${settings.theme === "dark" ? "bg-[#090c18]" : "bg-[#f5f4f1]"}`}
    >
      <TasksTab settings={settings} tasks={tasks} zohoProjectMap={zohoProjectMap} />
    </div>
  );
}
