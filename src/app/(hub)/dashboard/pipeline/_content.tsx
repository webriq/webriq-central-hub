"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { usePMSettings } from "@/hooks/use-pm-settings";
import type { Database } from "@/types/database";

type ClassificationRow = Database["public"]["Tables"]["classification_records"]["Row"];
type CardRecord = Pick<ClassificationRow, "id" | "title" | "task_type" | "priority" | "status" | "customer_id" | "created_at">;

type Stage = "classification" | "assessment" | "plan" | "execution" | "reply";

const STAGES: {
  id: Stage;
  label: string;
  color: string;
  bg: string;
  dot: string;
  border: string;
}[] = [
  { id: "classification", label: "Classification",          color: "text-blue-700",   bg: "bg-blue-50",   dot: "bg-blue-400",   border: "border-blue-100" },
  { id: "assessment",     label: "Requirements Assessment", color: "text-violet-700", bg: "bg-violet-50", dot: "bg-violet-400", border: "border-violet-100" },
  { id: "plan",           label: "Plan Generation",         color: "text-orange-700", bg: "bg-orange-50", dot: "bg-orange-400", border: "border-orange-100" },
  { id: "execution",      label: "Execution",               color: "text-amber-700",  bg: "bg-amber-50",  dot: "bg-amber-400",  border: "border-amber-100" },
  { id: "reply",          label: "Reply Generation",        color: "text-green-700",  bg: "bg-green-50",  dot: "bg-green-400",  border: "border-green-100" },
];

const PRIORITY_CLS: Record<string, string> = {
  CRITICAL: "text-red-700 bg-red-50",
  HIGH:     "text-amber-700 bg-amber-50",
  NORMAL:   "text-sky-700 bg-sky-50",
  LOW:      "text-slate-500 bg-slate-50",
};

const STATUS_CLS: Record<string, string> = {
  pending:  "text-slate-500 bg-slate-50",
  open:     "text-blue-600 bg-blue-50",
  active:   "text-green-600 bg-green-50",
  on_hold:  "text-amber-600 bg-amber-50",
  review:   "text-violet-600 bg-violet-50",
  closed:   "text-slate-400 bg-slate-50",
};

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

type Grouped = Record<Stage, CardRecord[]>;

const EMPTY: Grouped = { classification: [], assessment: [], plan: [], execution: [], reply: [] };

const DARK_STAGE_COLORS: Record<Stage, { bg: string; border: string; color: string }> = {
  classification: { bg: "bg-blue-500/10",   border: "border-blue-500/20",   color: "text-blue-300"   },
  assessment:     { bg: "bg-violet-500/10", border: "border-violet-500/20", color: "text-violet-300" },
  plan:           { bg: "bg-orange-500/10", border: "border-orange-500/20", color: "text-orange-300" },
  execution:      { bg: "bg-amber-500/10",  border: "border-amber-500/20",  color: "text-amber-300"  },
  reply:          { bg: "bg-green-500/10",  border: "border-green-500/20",  color: "text-green-300"  },
};

const PRIORITY_CLS_DARK: Record<string, string> = {
  CRITICAL: "text-red-400 bg-red-500/15",
  HIGH:     "text-amber-400 bg-amber-500/15",
  NORMAL:   "text-sky-400 bg-sky-500/15",
  LOW:      "text-slate-400 bg-slate-500/15",
};

const STATUS_CLS_DARK: Record<string, string> = {
  pending: "text-slate-400 bg-slate-500/15",
  open:    "text-blue-400 bg-blue-500/15",
  active:  "text-green-400 bg-green-500/15",
  on_hold: "text-amber-400 bg-amber-500/15",
  review:  "text-violet-400 bg-violet-500/15",
  closed:  "text-slate-500 bg-slate-500/10",
};

export default function PipelineContent() {
  const router = useRouter();
  const { settings } = usePMSettings();
  const isDark = settings.theme === "dark";
  const [loading, setLoading] = useState(true);
  const [grouped, setGrouped] = useState<Grouped>(EMPTY);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const { data: cls } = await supabase
        .from("classification_records")
        .select("id, title, task_type, priority, status, customer_id, created_at")
        .order("created_at", { ascending: false });

      if (!cls?.length) { setLoading(false); return; }

      const classIds = cls.map(c => c.id);

      // Phase 1 — both tables use classification_id directly
      const [{ data: assessments }, { data: replies }] = await Promise.all([
        supabase.from("requirements_assessments").select("id, classification_id").in("classification_id", classIds),
        supabase.from("reply_drafts").select("id, classification_id").in("classification_id", classIds),
      ]);

      const assessByClassId = new Map<string, string>();
      (assessments ?? []).forEach(a => assessByClassId.set(a.classification_id, a.id));

      const replyClassIds = new Set<string>();
      (replies ?? []).forEach(r => replyClassIds.add(r.classification_id));

      // Phase 2 — plans reference assessment_id
      const assessIds = [...assessByClassId.values()];
      const planByAssessId = new Map<string, string>();
      if (assessIds.length > 0) {
        const { data: plans } = await supabase
          .from("implementation_plans")
          .select("id, assessment_id")
          .in("assessment_id", assessIds);
        (plans ?? []).forEach(p => {
          if (!planByAssessId.has(p.assessment_id)) planByAssessId.set(p.assessment_id, p.id);
        });
      }

      // Phase 3 — execution_records reference plan_id
      const planIds = [...planByAssessId.values()];
      const execPlanIds = new Set<string>();
      if (planIds.length > 0) {
        const { data: execs } = await supabase
          .from("execution_records")
          .select("id, plan_id")
          .in("plan_id", planIds);
        (execs ?? []).forEach(e => execPlanIds.add(e.plan_id));
      }

      // Assign each classification to its furthest pipeline stage
      const g: Grouped = { classification: [], assessment: [], plan: [], execution: [], reply: [] };
      for (const c of cls) {
        const assessId = assessByClassId.get(c.id);
        const planId = assessId ? planByAssessId.get(assessId) : undefined;
        const hasExec = planId ? execPlanIds.has(planId) : false;
        const hasReply = replyClassIds.has(c.id);

        const stage: Stage = hasReply ? "reply"
          : hasExec    ? "execution"
          : planId     ? "plan"
          : assessId   ? "assessment"
          : "classification";

        g[stage].push(c as CardRecord);
      }

      setGrouped(g);
      setLoading(false);
    }
    load();
  }, []);

  const total = Object.values(grouped).reduce((s, arr) => s + arr.length, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-slate-400">
        Loading pipeline…
      </div>
    );
  }

  return (
    <div className="p-6">
      <p className="text-[12px] text-slate-400 mb-4">{total} tasks across pipeline</p>

      <div className="overflow-x-auto">
        <div className="grid grid-cols-5 gap-3 min-w-[900px]">
          {STAGES.map(stage => {
            const items = grouped[stage.id];
            return (
              <div key={stage.id} className="flex flex-col min-w-0">
                {/* Column header */}
                <div className={cn(
                  "flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3 border",
                  isDark ? DARK_STAGE_COLORS[stage.id].bg : stage.bg,
                  isDark ? DARK_STAGE_COLORS[stage.id].border : stage.border,
                )}>
                  <div className={cn("w-2 h-2 rounded-full shrink-0", stage.dot)} />
                  <span className={cn("text-[11px] font-bold leading-none", isDark ? DARK_STAGE_COLORS[stage.id].color : stage.color)}>
                    {stage.label}
                  </span>
                  <span className={cn(
                    "ml-auto text-[10px] font-bold rounded-full px-1.5 py-0.5",
                    isDark ? "bg-white/10" : "bg-white/80",
                    isDark ? DARK_STAGE_COLORS[stage.id].color : stage.color,
                  )}>
                    {items.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-2">
                  {items.length === 0 ? (
                    <div className={cn(
                      "text-[12px] text-center py-6 rounded-xl border border-dashed",
                      isDark ? "border-white/15 text-slate-500" : "border-slate-200 text-slate-400",
                    )}>
                      Empty
                    </div>
                  ) : items.map(record => (
                    <button
                      key={record.id}
                      onClick={() => router.push("/orchestration")}
                      className={cn(
                        "rounded-xl p-3.5 transition-all text-left w-full cursor-pointer font-[inherit]",
                        isDark
                          ? "bg-[#121726] border border-white/[0.08] hover:border-white/20"
                          : "bg-white border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:border-slate-300",
                      )}
                    >
                      <div className={cn("text-[13px] font-semibold leading-snug mb-2 line-clamp-2", isDark ? "text-slate-200" : "text-slate-900")}>
                        {record.title}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                        {record.priority && (
                          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", isDark ? (PRIORITY_CLS_DARK[record.priority] ?? "text-slate-400 bg-slate-500/15") : (PRIORITY_CLS[record.priority] ?? "text-slate-500 bg-slate-50"))}>
                            {record.priority}
                          </span>
                        )}
                        {record.task_type && (
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded capitalize", isDark ? "text-slate-400 bg-white/5" : "text-slate-500 bg-slate-50")}>
                            {record.task_type.replace(/_/g, " ")}
                          </span>
                        )}
                        {record.status && (
                          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", isDark ? (STATUS_CLS_DARK[record.status] ?? "text-slate-400 bg-slate-500/15") : (STATUS_CLS[record.status] ?? "text-slate-500 bg-slate-50"))}>
                            {record.status.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>

                      <div className={cn("flex items-center justify-between text-[11px]", isDark ? "text-slate-500" : "text-slate-400")}>
                        <span className="font-mono truncate max-w-36">{record.customer_id}</span>
                        <span className="shrink-0 ml-2">{formatAge(record.created_at)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
