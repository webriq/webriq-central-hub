"use client";

import React, { useEffect, useState } from "react";
import { usePMSettings } from "@/hooks/use-pm-settings";
import TasksTab from "@/components/hub/pm-tabs/tasks-tab";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type ClassificationRow = Database["public"]["Tables"]["classification_records"]["Row"] & {
  customers?: { company_name: string } | null;
};

type Developer = { id: string; first_name: string | null; last_name: string | null; email: string };

export default function PMTasksContent({ developers, reviewerMap }: { developers: Developer[]; reviewerMap: Record<string, string> }) {
  const { settings } = usePMSettings();
  const [tasks, setTasks] = useState<ClassificationRow[]>([]);
  const [zohoProjectMap, setZohoProjectMap] = useState<Record<string, string>>({});
  const fetchTasksRef = React.useRef<(() => void) | null>(null);

  function refreshTasks() {
    fetchTasksRef.current?.();
  }

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

    fetchTasksRef.current = fetchTasks;
    fetchTasks();

    // Fetch zoho project map
    supabase
      .from("projects")
      .select("customer_id, external_project_id")
      .not("external_project_id", "is", null)
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          const map: Record<string, string> = {};
          for (const p of data as Array<{ customer_id: string; external_project_id: string | null }>) {
            if (p.external_project_id && !map[p.customer_id]) {
              map[p.customer_id] = p.external_project_id;
            }
          }
          setZohoProjectMap(map);
        }
      });

    const channel = supabase
      .channel("dashboard_tasks_classification")
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
      <TasksTab settings={settings} tasks={tasks} zohoProjectMap={zohoProjectMap} reviewerMap={reviewerMap} developers={developers} onTaskCreated={refreshTasks} />
    </div>
  );
}
