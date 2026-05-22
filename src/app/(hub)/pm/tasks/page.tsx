"use client";

import React, { useEffect, useState } from "react";
import { usePMSettings } from "@/hooks/use-pm-settings";
import { getTokens } from "@/components/hub/pm-tabs/shared";
import TasksTab from "@/components/hub/pm-tabs/tasks-tab";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type ClassificationRow = Database["public"]["Tables"]["classification_records"]["Row"] & {
  customers?: { company_name: string } | null;
};

export default function PMTasksPage() {
  const { settings } = usePMSettings();
  const C = getTokens(settings);
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
      className="flex-1 overflow-y-auto py-[26px] px-8 bg-[var(--c-page-bg)]"
      style={{ "--c-page-bg": C.bg } as React.CSSProperties}
    >
      <TasksTab settings={settings} tasks={tasks} />
    </div>
  );
}
