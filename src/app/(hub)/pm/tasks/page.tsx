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

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase
      .from("classification_records")
      .select("*, customers(company_name)")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (!cancelled) setTasks((data as ClassificationRow[]) ?? []);
      });

    const channel = supabase
      .channel("pm_tasks_classification")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "classification_records" },
        () => {
          supabase
            .from("classification_records")
            .select("*, customers(company_name)")
            .order("created_at", { ascending: false })
            .limit(100)
            .then(({ data }) => {
              if (!cancelled) setTasks((data as ClassificationRow[]) ?? []);
            });
        }
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
      <TasksTab settings={settings} tasks={tasks} />
    </div>
  );
}
