"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type ClassificationRecordRow = Database["public"]["Tables"]["classification_records"]["Row"];
type RequirementsAssessmentRow = Database["public"]["Tables"]["requirements_assessments"]["Row"];
type ImplementationPlanRow = Database["public"]["Tables"]["implementation_plans"]["Row"];

type AssessmentState = {
  loading: boolean;
  result: RequirementsAssessmentRow | null;
  error: string | null;
};

type PlanState = {
  loading: boolean;
  result: ImplementationPlanRow | null;
  error: string | null;
  actionLoading: boolean;
};

const REJECTION_REASONS = [
  { value: "PLAN_INCOMPLETE", label: "Plan Incomplete" },
  { value: "WRONG_APPROACH", label: "Wrong Approach" },
  { value: "SCOPE_EXCEEDED", label: "Scope Exceeded" },
  { value: "KNOWLEDGE_GAP", label: "Knowledge Gap" },
  { value: "MISCLASSIFICATION", label: "Misclassification" },
] as const;

/* ── Badge/chip components ────────────────────────────────────────────────── */

const STATUS_CLASSES: Record<string, { badge: string; dot: string }> = {
  CLEAR:   { badge: "bg-green-500/8 text-green-600",   dot: "bg-green-500" },
  PARTIAL: { badge: "bg-yellow-500/8 text-yellow-700", dot: "bg-yellow-500" },
  BLOCKED: { badge: "bg-red-500/8 text-red-600",       dot: "bg-red-500" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_CLASSES[status] ?? STATUS_CLASSES.BLOCKED;
  return (
    <span className={cn(
      "inline-flex items-center gap-1.25 text-[11px] font-bold tracking-wider px-2.25 py-0.5 rounded-[20px]",
      s.badge,
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.dot)} />
      {status}
    </span>
  );
}

const PRIORITY_CLASSES: Record<string, string> = {
  CRITICAL: "text-red-500",
  HIGH:     "text-orange-500",
  NORMAL:   "text-blue-500",
  LOW:      "text-gray-500",
};

function PriorityChip({ priority }: { priority: string | null }) {
  const colorClass = PRIORITY_CLASSES[priority ?? ""] ?? "text-gray-500";
  return (
    <span className={cn("text-[10px] font-bold tracking-[0.06em]", colorClass)}>
      {priority ?? "—"}
    </span>
  );
}

/* ── Assessment result panel ─────────────────────────────────────────────── */

function AssessmentResult({ record }: { record: RequirementsAssessmentRow }) {
  const subtasks = (record.subtasks as Array<{ title: string; status: string; notes?: string }>) ?? [];
  const clarification = record.clarification_draft as string | null;
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!clarification) return;
    navigator.clipboard.writeText(clarification);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-3 px-4 py-3.5 bg-black/3 rounded-[10px] border border-black/7">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="text-xs font-semibold text-gray-700">Assessment v{record.assessment_version}</span>
        <StatusBadge status={record.overall_status} />
        <span className="text-[11px] text-gray-400 ml-auto">
          {new Date(record.created_at).toLocaleString()}
        </span>
      </div>

      <div className={cn("flex flex-col gap-1.5", clarification ? "mb-3.5" : "mb-0")}>
        {subtasks.map((st, i) => (
          <div key={i} className="flex gap-2.5 items-start px-2.5 py-2 bg-white rounded-lg border border-black/6">
            <StatusBadge status={st.status} />
            <div className="flex-1">
              <div className="text-xs font-medium text-gray-800">{st.title}</div>
              {st.notes && (
                <div className="text-[11px] text-gray-500 mt-0.75">{st.notes}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {clarification && (
        <div className="mt-3 px-3.5 py-3 bg-yellow-500/6 border border-yellow-500/20 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-bold text-yellow-700 tracking-wider uppercase">
              Clarification Draft
            </span>
            <button
              onClick={handleCopy}
              className={cn(
                "ml-auto text-[11px] font-semibold bg-transparent border-none cursor-pointer p-0",
                copied ? "text-green-600" : "text-blue-500",
              )}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-gray-700 leading-[1.65] m-0">{clarification}</p>
          <p className="text-[10px] text-gray-400 mt-2 mb-0">
            Send this to the customer via PM to request missing information.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Assessment task row ──────────────────────────────────────────────────── */

function TaskRow({
  record,
  existingAssessment,
}: {
  record: ClassificationRecordRow;
  existingAssessment: RequirementsAssessmentRow | null;
}) {
  const [state, setState] = useState<AssessmentState>({
    loading: false,
    result: existingAssessment,
    error: null,
  });
  const [expanded, setExpanded] = useState(!!existingAssessment);

  const runAssessment = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch("/api/assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classificationId: record.id, customerId: record.customer_id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setState(prev => ({ ...prev, loading: false, result: null, error: err.error ?? "Assessment failed" }));
        return;
      }
      const data: RequirementsAssessmentRow = await res.json();
      setState({ loading: false, result: data, error: null });
      setExpanded(true);
    } catch (err) {
      setState(prev => ({ ...prev, loading: false, result: null, error: err instanceof Error ? err.message : "Network error" }));
    }
  }, [record.id, record.customer_id]);

  return (
    <div className="bg-white rounded-xl border border-black/8 px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-gray-800 mb-1">
            {record.title}
          </div>
          <div className="flex gap-2.5 items-center flex-wrap">
            <PriorityChip priority={record.priority} />
            <span className="text-[11px] text-gray-500">{record.task_type ?? "UNCLASSIFIED"}</span>
            <span className="text-[10px] font-mono text-gray-400">{record.customer_id}</span>
            <span className="text-[10px] text-gray-400">{new Date(record.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="flex gap-2 shrink-0 items-center">
          {state.result && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-[11px] font-semibold text-gray-500 bg-black/4 border border-black/8 rounded-lg px-3 py-1.5 cursor-pointer"
            >
              {expanded ? "Hide" : "View"}
            </button>
          )}
          <button
            onClick={runAssessment}
            disabled={state.loading}
            className="text-[11px] font-bold text-brand bg-[rgba(51,88,244,0.07)] border border-[rgba(51,88,244,0.18)] rounded-lg px-3.5 py-1.5 transition-all duration-150 cursor-pointer disabled:text-gray-400 disabled:bg-black/4 disabled:border-black/8 disabled:cursor-not-allowed"
          >
            {state.loading ? "Running…" : state.result ? "Re-run" : "Run Assessment"}
          </button>
        </div>
      </div>

      {state.error && (
        <div className="mt-2.5 text-xs text-red-600 px-2.5 py-2 bg-red-500/5 rounded-[7px]">
          {state.error}
        </div>
      )}

      {state.result && expanded && <AssessmentResult record={state.result} />}
    </div>
  );
}

/* ── Plan result panel ───────────────────────────────────────────────────── */

function PlanResult({
  plan,
  onAction,
  actionLoading,
}: {
  plan: ImplementationPlanRow;
  onAction: (action: "approve" | "reject", reason?: string) => Promise<void>;
  actionLoading: boolean;
}) {
  const steps = (plan.steps as Array<{ order: number; title: string; description: string; estimated_hours?: number }>) ?? [];
  const affectedFiles = (plan.affected_files as string[]) ?? [];
  const riskFlags = (plan.risk_flags as string[]) ?? [];
  const score = plan.confidence_score;
  const [showReject, setShowReject] = useState(false);
  const [rejectionReason, setRejectionReason] = useState<string>(REJECTION_REASONS[0].value);

  const confidenceClass =
    score === null ? "text-gray-400" :
    score >= 80    ? "text-green-600" :
    score >= 50    ? "text-yellow-700" :
                     "text-red-600";

  async function handleReject() {
    await onAction("reject", rejectionReason);
    setShowReject(false);
  }

  return (
    <div className="mt-3 px-4 py-3.5 bg-black/3 rounded-[10px] border border-black/7">
      <div className="flex items-center gap-2.5 mb-3">
        {plan.status === "APPROVED" && (
          <span className="inline-flex items-center gap-1.25 text-[11px] font-bold tracking-wider px-2.25 py-0.5 rounded-[20px] bg-green-500/8 text-green-600">
            <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-green-500" />
            APPROVED
          </span>
        )}
        {plan.status === "PENDING_APPROVAL" && (
          <span className="text-[11px] font-semibold text-yellow-700">Pending Approval</span>
        )}
        {score !== null && (
          <span className={cn("text-[11px] font-semibold ml-auto", confidenceClass)}>
            Confidence: {score}%
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 mb-3">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-2.5 items-start px-2.5 py-2 bg-white rounded-lg border border-black/6">
            <span className="text-[10px] font-bold text-gray-500 bg-black/5 rounded px-1.5 py-0.5 shrink-0">
              {step.order}
            </span>
            <div className="flex-1">
              <div className="text-xs font-semibold text-gray-800">{step.title}</div>
              <div className="text-[11px] text-gray-500 mt-0.5 leading-normal">{step.description}</div>
              {step.estimated_hours !== undefined && (
                <div className="text-[10px] text-gray-400 mt-0.5">~{step.estimated_hours}h</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {affectedFiles.length > 0 && (
        <div className="mb-2.5">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.06em] mb-1.25">
            Affected Files
          </div>
          <div className="flex flex-wrap gap-1.25">
            {affectedFiles.map((f, i) => (
              <span key={i} className="text-[10px] font-mono text-gray-700 bg-black/5 rounded px-1.5 py-0.5">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {riskFlags.length > 0 && (
        <div className="mb-3 px-2.5 py-2 bg-red-500/4 rounded-[7px] border border-red-500/12">
          <div className="text-[10px] font-bold text-red-600 uppercase tracking-[0.06em] mb-1">
            Risk Flags
          </div>
          {riskFlags.map((flag, i) => (
            <div key={i} className="text-[11px] text-red-600 mt-0.5">• {flag}</div>
          ))}
        </div>
      )}

      {plan.status === "PENDING_APPROVAL" && !showReject && (
        <div className="flex gap-2 mt-1">
          <button
            onClick={() => onAction("approve")}
            disabled={actionLoading}
            className="text-[11px] font-bold text-green-600 bg-green-500/8 border border-green-500/25 rounded-lg px-4 py-1.5 cursor-pointer disabled:text-gray-400 disabled:bg-black/4 disabled:border-black/8 disabled:cursor-not-allowed"
          >
            {actionLoading ? "Saving…" : "Approve"}
          </button>
          <button
            onClick={() => setShowReject(true)}
            disabled={actionLoading}
            className="text-[11px] font-bold text-red-600 bg-red-500/6 border border-red-500/20 rounded-lg px-4 py-1.5 cursor-pointer disabled:cursor-not-allowed"
          >
            Reject
          </button>
        </div>
      )}

      {plan.status === "PENDING_APPROVAL" && showReject && (
        <div className="mt-2 flex gap-2 items-center flex-wrap">
          <select
            value={rejectionReason}
            onChange={e => setRejectionReason(e.target.value)}
            className="text-[11px] text-gray-700 bg-white border border-black/15 rounded-lg px-2.5 py-1.5 cursor-pointer"
          >
            {REJECTION_REASONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <button
            onClick={handleReject}
            disabled={actionLoading}
            className="text-[11px] font-bold text-red-600 bg-red-500/6 border border-red-500/20 rounded-lg px-3.5 py-1.5 cursor-pointer disabled:cursor-not-allowed"
          >
            {actionLoading ? "Saving…" : "Confirm Reject"}
          </button>
          <button
            onClick={() => setShowReject(false)}
            className="text-[11px] text-gray-400 bg-transparent border-none cursor-pointer px-1 py-1.5"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Plan row ────────────────────────────────────────────────────────────── */

function PlanRow({
  record,
  existingAssessment,
  existingPlan,
  onPlanRejected,
}: {
  record: ClassificationRecordRow;
  existingAssessment: RequirementsAssessmentRow;
  existingPlan: ImplementationPlanRow | null;
  onPlanRejected: (classificationId: string) => void;
}) {
  const [state, setState] = useState<PlanState>({
    loading: false,
    result: existingPlan,
    error: null,
    actionLoading: false,
  });
  const [expanded, setExpanded] = useState(!!existingPlan);

  const generatePlan = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classificationId: record.id,
          customerId: record.customer_id,
          assessmentId: existingAssessment.id,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setState(prev => ({ ...prev, loading: false, error: err.error ?? "Plan generation failed" }));
        return;
      }
      const data: ImplementationPlanRow = await res.json();
      setState(prev => ({ ...prev, loading: false, result: data, error: null }));
      setExpanded(true);
    } catch (err) {
      setState(prev => ({ ...prev, loading: false, error: err instanceof Error ? err.message : "Network error" }));
    }
  }, [record.id, record.customer_id, existingAssessment.id]);

  const handleAction = useCallback(async (action: "approve" | "reject", reason?: string) => {
    if (!state.result) return;
    setState(prev => ({ ...prev, actionLoading: true }));
    try {
      const res = await fetch("/api/plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: state.result.id, action, rejectionReason: reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setState(prev => ({ ...prev, actionLoading: false, error: err.error ?? "Action failed" }));
        return;
      }
      if (action === "approve") {
        setState(prev => ({
          ...prev,
          actionLoading: false,
          result: prev.result ? { ...prev.result, status: "APPROVED" } : null,
        }));
      } else {
        setState(prev => ({ ...prev, actionLoading: false, result: null }));
        onPlanRejected(record.id);
      }
    } catch (err) {
      setState(prev => ({ ...prev, actionLoading: false, error: err instanceof Error ? err.message : "Network error" }));
    }
  }, [state.result, record.id, onPlanRejected]);

  return (
    <div className="bg-white rounded-xl border border-black/8 px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-gray-800 mb-1">
            {record.title}
          </div>
          <div className="flex gap-2.5 items-center flex-wrap">
            <PriorityChip priority={record.priority} />
            <span className="text-[11px] text-gray-500">{record.task_type ?? "UNCLASSIFIED"}</span>
            <span className="text-[10px] font-mono text-gray-400">{record.customer_id}</span>
            <StatusBadge status={existingAssessment.overall_status} />
          </div>
        </div>

        <div className="flex gap-2 shrink-0 items-center">
          {state.result && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-[11px] font-semibold text-gray-500 bg-black/4 border border-black/8 rounded-lg px-3 py-1.5 cursor-pointer"
            >
              {expanded ? "Hide" : "View"}
            </button>
          )}
          {!state.result && (
            <button
              onClick={generatePlan}
              disabled={state.loading}
              className="text-[11px] font-bold text-violet-700 bg-violet-700/7 border border-violet-700/18 rounded-lg px-3.5 py-1.5 transition-all duration-150 cursor-pointer disabled:text-gray-400 disabled:bg-black/4 disabled:border-black/8 disabled:cursor-not-allowed"
            >
              {state.loading ? "Generating…" : "Generate Plan"}
            </button>
          )}
        </div>
      </div>

      {state.error && (
        <div className="mt-2.5 text-xs text-red-600 px-2.5 py-2 bg-red-500/5 rounded-[7px]">
          {state.error}
        </div>
      )}

      {state.result && expanded && (
        <PlanResult
          plan={state.result}
          onAction={handleAction}
          actionLoading={state.actionLoading}
        />
      )}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function OrchestrationPage() {
  const [tasks, setTasks] = useState<ClassificationRecordRow[]>([]);
  const [assessments, setAssessments] = useState<Record<string, RequirementsAssessmentRow>>({});
  const [plans, setPlans] = useState<Record<string, ImplementationPlanRow>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const [tasksResult, assessmentsResult, plansResult] = await Promise.all([
        supabase
          .from("classification_records")
          .select("*")
          .eq("llm_eligible", "YES")
          .in("status", ["pending", "reviewed", "planning", "planned", "approved"])
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("requirements_assessments")
          .select("*")
          .order("assessment_version", { ascending: false }),
        supabase
          .from("implementation_plans")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;

      const taskList = tasksResult.data ?? [];
      setTasks(taskList);

      // Keep only the latest assessment per classification
      const latestByClassification: Record<string, RequirementsAssessmentRow> = {};
      for (const a of (assessmentsResult.data ?? []) as RequirementsAssessmentRow[]) {
        if (!latestByClassification[a.classification_id]) {
          latestByClassification[a.classification_id] = a;
        }
      }
      setAssessments(latestByClassification);

      // Keep only the latest non-rejected plan per assessment
      const latestByAssessment: Record<string, ImplementationPlanRow> = {};
      for (const p of (plansResult.data ?? []) as ImplementationPlanRow[]) {
        if (p.status !== "REJECTED" && !latestByAssessment[p.assessment_id]) {
          latestByAssessment[p.assessment_id] = p;
        }
      }
      setPlans(latestByAssessment);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Tasks needing assessment: no CLEAR assessment yet
  const assessmentTasks = tasks.filter(t => {
    const a = assessments[t.id];
    return !a || a.overall_status !== "CLEAR";
  });

  // Tasks ready for plan generation: have a CLEAR assessment
  const planTasks = tasks.filter(t => {
    const a = assessments[t.id];
    return a?.overall_status === "CLEAR";
  });

  // When a plan is rejected, move the task back to assessment section
  const handlePlanRejected = useCallback((classificationId: string) => {
    setTasks(prev =>
      prev.map(t => t.id === classificationId ? { ...t, status: "pending" } : t)
    );
  }, []);

  return (
    <div className="max-w-[780px] mx-auto px-6 py-7">

      {/* ── Requirements Assessment section ─────────────────────────── */}
      <div className="mb-6">
        <div className="text-lg font-bold text-slate-900 tracking-[-0.02em]">
          Requirements Assessment
        </div>
        <div className="text-[11px] text-slate-400 mt-[3px]">
          LLM-eligible classified tasks · Claude Sonnet · M3
        </div>
      </div>

      {loading && (
        <div className="text-center text-slate-400 text-[13px] pt-12">
          Loading tasks…
        </div>
      )}

      {!loading && assessmentTasks.length === 0 && (
        <div className="text-center p-6 bg-white rounded-xl border border-black/7 text-slate-400 text-[13px]">
          No tasks pending assessment.
          <br />
          <span className="text-[11px] mt-1.5 block">
            Tasks appear here after classification when <code>llm_eligible = YES</code>.
          </span>
        </div>
      )}

      {!loading && (
        <div className="flex flex-col gap-2.5">
          {assessmentTasks.map(task => (
            <TaskRow
              key={task.id}
              record={task}
              existingAssessment={assessments[task.id] ?? null}
            />
          ))}
        </div>
      )}

      {/* ── Plan Generation section ──────────────────────────────────── */}
      {!loading && (
        <div className="mt-10">
          <div className="mb-5">
            <div className="text-lg font-bold text-slate-900 tracking-[-0.02em]">
              Plan Generation
            </div>
            <div className="text-[11px] text-slate-400 mt-[3px]">
              CLEAR-assessed tasks · Claude Sonnet · M5
            </div>
          </div>

          {planTasks.length === 0 ? (
            <div className="text-center p-6 bg-white rounded-xl border border-black/7 text-slate-400 text-[13px]">
              No tasks ready for planning.
              <br />
              <span className="text-[11px] mt-1.5 block">
                Tasks appear here once assessment returns <code>CLEAR</code>.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {planTasks.map(task => {
                const assessment = assessments[task.id]!;
                const plan = plans[assessment.id] ?? null;
                return (
                  <PlanRow
                    key={task.id}
                    record={task}
                    existingAssessment={assessment}
                    existingPlan={plan}
                    onPlanRejected={handlePlanRejected}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="mt-12 text-center text-[10px] text-slate-300">
        AI Chat assistant available Sprint 5
      </div>
    </div>
  );
}
