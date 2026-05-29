"use client";

import React, { useEffect, useState, useCallback } from "react";
import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type ClassificationRecordRow = Database["public"]["Tables"]["classification_records"]["Row"];
type RequirementsAssessmentRow = Database["public"]["Tables"]["requirements_assessments"]["Row"];
type ImplementationPlanRow = Database["public"]["Tables"]["implementation_plans"]["Row"];
type ExecutionRecordRow = Database["public"]["Tables"]["execution_records"]["Row"];
type ReplyDraftRow = Database["public"]["Tables"]["reply_drafts"]["Row"];

type PmAction = "open" | "on_hold" | "active" | "review" | "close" | "reopen";

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

const PM_ACTIONS: Array<{ value: PmAction; label: string }> = [
  { value: "open",    label: "Open" },
  { value: "on_hold", label: "On Hold" },
  { value: "active",  label: "Mark Active" },
  { value: "review",  label: "Review" },
  { value: "close",   label: "Close" },
  { value: "reopen",  label: "Reopen" },
];

function buildZohoTaskUrl(zohoProjectId: string, zohoTaskId: string): string {
  const portalName = process.env.NEXT_PUBLIC_ZOHO_PORTAL_NAME ?? "";
  if (!portalName) return "";
  return `https://projects.zoho.com/portal/${portalName}/project/${zohoProjectId}/tasks/all/task/${zohoTaskId}/`;
}

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
        setState(prev => ({ ...prev, loading: false, result: null, error: (err as { error?: string }).error ?? "Assessment failed" }));
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
  zohoProjectId,
  onAction,
  onPmAction,
  actionLoading,
  record,
  execution,
  isPaused,
  onExecuted,
  replyDraft,
  onReplyUpdate,
}: {
  plan: ImplementationPlanRow;
  zohoProjectId: string | undefined;
  onAction: (action: "approve" | "reject", reason?: string) => Promise<void>;
  onPmAction: (action: PmAction) => Promise<void>;
  actionLoading: boolean;
  record: ClassificationRecordRow;
  execution: ExecutionRecordRow | null;
  isPaused: boolean;
  onExecuted: (e: ExecutionRecordRow) => void;
  replyDraft: ReplyDraftRow | null;
  onReplyUpdate: (d: ReplyDraftRow) => void;
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

  const zohoUrl = plan.zoho_task_id && zohoProjectId
    ? buildZohoTaskUrl(zohoProjectId, plan.zoho_task_id)
    : "";

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

      {plan.status === "APPROVED" && (
        <div className="mt-2 flex flex-col gap-1.5">
          {plan.direct_zoho_edit && (
            <span className="text-[11px] text-orange-600 font-medium">
              ⚠ Modified directly in Zoho
            </span>
          )}
          {zohoUrl && (
            <a
              href={zohoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline w-fit"
            >
              <ExternalLink size={11} />
              Open in Zoho
            </a>
          )}
          <div className="flex gap-1 flex-wrap mt-0.5">
            {PM_ACTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => onPmAction(value)}
                disabled={actionLoading}
                className="px-2 py-0.5 text-[10px] font-medium rounded border border-black/12 text-gray-600 hover:bg-black/4 disabled:opacity-40 cursor-pointer"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <ExecutionSection
        plan={plan}
        execution={execution}
        classificationId={record.id}
        customerId={record.customer_id}
        isPaused={isPaused}
        onExecuted={onExecuted}
      />

      <ReplyDraftSection
        key={replyDraft?.id ?? "no-draft"}
        draft={replyDraft}
        onUpdate={onReplyUpdate}
      />
    </div>
  );
}

/* ── Execution section ───────────────────────────────────────────────────── */

function ExecutionSection({
  plan,
  execution,
  classificationId,
  customerId,
  isPaused,
  onExecuted,
}: {
  plan: ImplementationPlanRow;
  execution: ExecutionRecordRow | null;
  classificationId: string;
  customerId: string;
  isPaused: boolean;
  onExecuted: (execution: ExecutionRecordRow) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExecute() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, customerId, classificationId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Execution failed");
      } else {
        const supabase = createClient();
        const { data: exec } = await supabase
          .from("execution_records")
          .select("*")
          .eq("id", data.executionId)
          .maybeSingle();
        if (exec) onExecuted(exec as ExecutionRecordRow);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevert() {
    if (!execution) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/execution/${execution.id}/revert`, { method: "POST" });
      if (res.ok) {
        onExecuted({ ...execution, status: "REVERTED" });
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Revert failed");
      }
    } finally {
      setLoading(false);
    }
  }

  const statusColorClass: Record<string, string> = {
    RUNNING: "text-blue-600",
    COMPLETED: "text-green-600",
    PARTIAL_EXECUTION: "text-yellow-700",
    FAILED: "text-red-600",
    REVERTED: "text-slate-400",
  };

  return (
    <div className="mt-4 border-t border-black/5 pt-4">
      <div className="text-[12px] font-semibold text-slate-700 mb-2">Execution</div>

      {!execution && plan.status === "APPROVED" && (
        <button
          onClick={handleExecute}
          disabled={loading || isPaused}
          className={cn(
            "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors",
            isPaused
              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          )}
        >
          {loading ? "Executing…" : isPaused ? "Automation Paused" : "Execute Plan"}
        </button>
      )}

      {execution && (
        <div className="space-y-1.5">
          <div
            className={cn(
              "text-[12px] font-semibold",
              statusColorClass[execution.status] ?? "text-slate-600"
            )}
          >
            {execution.status === "RUNNING"
              ? "⏳ Running…"
              : execution.status.replace(/_/g, " ")}
          </div>
          {execution.what_was_done && (
            <p className="text-[12px] text-slate-600">{execution.what_was_done}</p>
          )}
          {execution.what_was_skipped && (
            <p className="text-[12px] text-slate-400">
              Skipped: {execution.what_was_skipped}
            </p>
          )}
          {execution.error_message && (
            <p className="text-[12px] text-red-600">{execution.error_message}</p>
          )}
          {["COMPLETED", "PARTIAL_EXECUTION"].includes(execution.status) && (
            <button
              onClick={handleRevert}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 transition-colors"
            >
              {loading ? "Reverting…" : "Revert"}
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-1.5 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}

/* ── Reply draft section ─────────────────────────────────────────────────── */

function ReplyDraftSection({
  draft,
  onUpdate,
}: {
  draft: ReplyDraftRow | null;
  onUpdate: (d: ReplyDraftRow) => void;
}) {
  const [content, setContent] = useState(draft?.draft_content ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!draft || draft.status === "DISCARDED") return null;

  const isSent = draft.status === "SENT";

  async function handleSend() {
    if (!draft) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reply/${draft.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError((data as { error?: string }).error ?? "Send failed");
      } else {
        onUpdate({
          ...draft,
          status: "SENT",
          pm_edited_content: content !== draft.draft_content ? content : null,
        });
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDiscard() {
    if (!draft) return;
    setLoading(true);
    try {
      await fetch(`/api/reply/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DISCARDED" }),
      });
      onUpdate({ ...draft, status: "DISCARDED" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 border-t border-black/5 pt-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[12px] font-semibold text-slate-700">Reply Draft</span>
        <span
          className={cn(
            "text-[11px] font-medium",
            isSent ? "text-green-600" : "text-blue-600"
          )}
        >
          {draft.status}
        </span>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={isSent}
        rows={4}
        className={cn(
          "w-full text-[12px] text-slate-700 border border-black/10 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/40",
          isSent && "bg-slate-50 text-slate-400 cursor-default"
        )}
      />

      {!isSent && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleSend}
            disabled={loading || !content.trim()}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Sending…" : "Send via Cliq"}
          </button>
          <button
            onClick={handleDiscard}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 transition-colors"
          >
            Discard
          </button>
        </div>
      )}

      {error && <p className="mt-1.5 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}

/* ── Plan row ────────────────────────────────────────────────────────────── */

function PlanRow({
  record,
  existingAssessment,
  existingPlan,
  onPlanRejected,
  zohoProjectId,
  execution,
  isPaused,
  onExecuted,
  replyDraft,
  onReplyUpdate,
}: {
  record: ClassificationRecordRow;
  existingAssessment: RequirementsAssessmentRow;
  existingPlan: ImplementationPlanRow | null;
  onPlanRejected: (classificationId: string) => void;
  zohoProjectId: string | undefined;
  execution: ExecutionRecordRow | null;
  isPaused: boolean;
  onExecuted: (e: ExecutionRecordRow) => void;
  replyDraft: ReplyDraftRow | null;
  onReplyUpdate: (d: ReplyDraftRow) => void;
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
        setState(prev => ({ ...prev, loading: false, error: (err as { error?: string }).error ?? "Plan generation failed" }));
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
        setState(prev => ({ ...prev, actionLoading: false, error: (err as { error?: string }).error ?? "Action failed" }));
        return;
      }
      if (action === "approve") {
        const responseData = await res.json() as { ok: boolean; zohoTaskId: string | null };
        setState(prev => ({
          ...prev,
          actionLoading: false,
          result: prev.result ? {
            ...prev.result,
            status: "APPROVED",
            zoho_task_id: responseData.zohoTaskId ?? prev.result.zoho_task_id,
          } : null,
        }));
      } else {
        setState(prev => ({ ...prev, actionLoading: false, result: null }));
        onPlanRejected(record.id);
      }
    } catch (err) {
      setState(prev => ({ ...prev, actionLoading: false, error: err instanceof Error ? err.message : "Network error" }));
    }
  }, [state.result, record.id, onPlanRejected]);

  const handlePmAction = useCallback(async (action: PmAction) => {
    setState(prev => ({ ...prev, actionLoading: true }));
    try {
      await fetch("/api/zoho", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classificationId: record.id, action }),
      });
    } finally {
      setState(prev => ({ ...prev, actionLoading: false }));
    }
  }, [record.id]);

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
          zohoProjectId={zohoProjectId}
          onAction={handleAction}
          onPmAction={handlePmAction}
          actionLoading={state.actionLoading}
          record={record}
          execution={execution}
          isPaused={isPaused}
          onExecuted={onExecuted}
          replyDraft={replyDraft}
          onReplyUpdate={onReplyUpdate}
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
  const [executions, setExecutions] = useState<Record<string, ExecutionRecordRow>>({});
  const [customerPaused, setCustomerPaused] = useState<Record<string, boolean>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, ReplyDraftRow>>({});
  const [zohoProjects, setZohoProjects] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const [tasksResult, assessmentsResult, plansResult, zohoProjectsResult, executionsResult, pausedResult, replyDraftsResult] = await Promise.all([
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
        supabase
          .from("customer_products")
          .select("customer_id, zoho_project_id")
          .not("zoho_project_id", "is", null),
        supabase
          .from("execution_records")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("customers")
          .select("customer_id, automation_paused")
          .eq("automation_paused", true),
        supabase
          .from("reply_drafts")
          .select("*")
          .in("status", ["DRAFT", "SENT"])
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

      const latestByPlan: Record<string, ExecutionRecordRow> = {};
      for (const e of (executionsResult.data ?? []) as ExecutionRecordRow[]) {
        if (!latestByPlan[e.plan_id]) latestByPlan[e.plan_id] = e;
      }
      setExecutions(latestByPlan);

      const paused: Record<string, boolean> = {};
      for (const c of (pausedResult.data ?? []) as Array<{
        customer_id: string;
        automation_paused: boolean;
      }>) {
        paused[c.customer_id] = true;
      }
      setCustomerPaused(paused);

      const latestDraftByClassification: Record<string, ReplyDraftRow> = {};
      for (const d of (replyDraftsResult.data ?? []) as ReplyDraftRow[]) {
        if (!latestDraftByClassification[d.classification_id]) {
          latestDraftByClassification[d.classification_id] = d;
        }
      }
      setReplyDrafts(latestDraftByClassification);

      // Build customer_id → zoho_project_id map (first project per customer)
      const projectMap: Record<string, string> = {};
      for (const p of (zohoProjectsResult.data ?? []) as Array<{ customer_id: string; zoho_project_id: string | null }>) {
        if (p.zoho_project_id && !projectMap[p.customer_id]) {
          projectMap[p.customer_id] = p.zoho_project_id;
        }
      }
      setZohoProjects(projectMap);

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
    <div className="max-w-195 mx-auto px-6 py-7">

      {Object.keys(customerPaused).length > 0 && (
        <div className="mb-4 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-800 text-[13px]">
          ⚠️ Automation paused for{" "}
          <span className="font-mono">{Object.keys(customerPaused).join(", ")}</span>
          {" "}— 3 consecutive execution failures. Reset via customer settings.
        </div>
      )}

      {/* ── Requirements Assessment section ─────────────────────────── */}
      <div className="mb-6">
        <div className="text-lg font-bold text-slate-900 tracking-[-0.02em]">
          Requirements Assessment
        </div>
        <div className="text-[11px] text-slate-400 mt-0.75">
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
            <div className="text-[11px] text-slate-400 mt-0.75">
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
                    zohoProjectId={zohoProjects[task.customer_id]}
                    execution={plan ? (executions[plan.id] ?? null) : null}
                    isPaused={customerPaused[task.customer_id] ?? false}
                    onExecuted={(exec) =>
                      setExecutions((prev) => ({ ...prev, [exec.plan_id]: exec }))
                    }
                    replyDraft={replyDrafts[task.id] ?? null}
                    onReplyUpdate={(d) =>
                      setReplyDrafts((prev) => ({ ...prev, [d.classification_id]: d }))
                    }
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
