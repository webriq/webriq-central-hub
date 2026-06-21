"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Play, CheckCircle2, XCircle, Loader2, Clock, ChevronRight, AlertTriangle, RotateCcw, Zap } from "lucide-react";

interface Customer {
  customer_id: string;
  company_name: string;
  status: string;
  sanity_project_id: string | null;
}

interface TimingEntry { step: string; durationMs: number; startedAt: string; }

interface PipelineResult {
  classification?: { id: string; task_type: string; priority: string; llm_eligible: string };
  assessment?: { id: string; feasibility: string; subtasks: unknown[] };
  plan?: { id: string; status: string; steps: unknown[] };
  execution?: { id: string; what_was_done: string; retries: number; status: string; error?: string };
}

type Step = "idle" | "classifying" | "assessing" | "planning" | "approving" | "executing" | "done" | "error";

const PIPELINE_STEPS = [
  { s: "classifying" as Step, label: "Classify" },
  { s: "assessing" as Step, label: "Assess" },
  { s: "planning" as Step, label: "Plan" },
  { s: "approving" as Step, label: "Approve" },
  { s: "executing" as Step, label: "Execute" },
];
const STEP_ORDER: Step[] = ["idle", "classifying", "assessing", "planning", "approving", "executing", "done", "error"];

export default function SimulatePage() {
  const supabase = createClient();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [results, setResults] = useState<PipelineResult>({});
  const [timings, setTimings] = useState<TimingEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      const { data: custData } = await supabase
        .from("customers")
        .select("customer_id, company_name, status")
        .order("created_at", { ascending: false });
      const { data: projData } = await supabase
        .from("projects")
        .select("customer_id, sanity_project_id");
      const projectMap = new Map((projData ?? []).map((p) => [p.customer_id, p.sanity_project_id]));
      const merged: Customer[] = (custData ?? []).map((c) => ({
        ...c,
        sanity_project_id: projectMap.get(c.customer_id) ?? null,
      }));
      setCustomers(merged);
      setLoadingCustomers(false);
    }
    load();
  }, [supabase]);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const timeIt = useCallback(async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
    const startedAt = new Date().toISOString();
    const t0 = performance.now();
    try {
      const result = await fn();
      const durationMs = Math.round(performance.now() - t0);
      setTimings((prev) => [...prev, { step: label, durationMs, startedAt }]);
      addLog(`${label} completed in ${(durationMs / 1000).toFixed(1)}s`);
      return result;
    } catch (err) {
      const durationMs = Math.round(performance.now() - t0);
      setTimings((prev) => [...prev, { step: `${label} (FAILED)`, durationMs, startedAt }]);
      throw err;
    }
  }, [addLog]);

  const apiFetch = useCallback(async (label: string, url: string, body: unknown) => {
    const r = await fetch(url, { method: url.includes("plan") && body && (body as Record<string, unknown>).action ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) {
      let detail = `${r.status}`;
      try { const j = await r.json(); detail = j.error ?? j.message ?? detail; } catch { /* non-json body */ }
      throw new Error(`${label} failed: ${detail}`);
    }
    return r.json();
  }, []);

  const runPipeline = async () => {
    if (!selectedCustomerId || !taskTitle.trim()) return;
    setStep("classifying");
    setError(null);
    setResults({});
    setTimings([]);
    setLogs([]);
    addLog("Starting pipeline simulation...");

    try {
      const classifyRes = await timeIt("Classification", () =>
        apiFetch("Classification", "/api/classification", { customerId: selectedCustomerId, title: taskTitle, description: taskDescription || null, source: "manual" })
      );
      setResults((prev) => ({ ...prev, classification: { id: classifyRes.id, task_type: classifyRes.task_type, priority: classifyRes.priority, llm_eligible: classifyRes.llm_eligible } }));
      addLog(`Classified: ${classifyRes.task_type} | Priority: ${classifyRes.priority} | LLM: ${classifyRes.llm_eligible}`);

      setStep("assessing");
      const assessRes = await timeIt("Requirements Assessment", () =>
        apiFetch("Assessment", "/api/assessment", { classificationId: classifyRes.id, customerId: selectedCustomerId })
      );
      setResults((prev) => ({ ...prev, assessment: { id: assessRes.id, feasibility: assessRes.feasibility, subtasks: assessRes.subtasks ?? [] } }));
      addLog(`Assessment: ${assessRes.feasibility} | ${(assessRes.subtasks ?? []).length} subtasks`);

      setStep("planning");
      const planRes = await timeIt("Plan Generation", () =>
        apiFetch("Plan generation", "/api/plan", { classificationId: classifyRes.id, assessmentId: assessRes.id, customerId: selectedCustomerId })
      );
      setResults((prev) => ({ ...prev, plan: { id: planRes.id, status: planRes.status, steps: planRes.steps ?? [] } }));
      addLog(`Plan generated: ${planRes.id} | ${(planRes.steps ?? []).length} steps`);

      setStep("approving");
      await timeIt("Plan Approval", () =>
        apiFetch("Plan approval", "/api/plan", { planId: planRes.id, action: "approve" })
      );
      setResults((prev) => ({ ...prev, plan: { ...prev.plan!, status: "APPROVED" } }));
      addLog("Plan approved ✓");

      setStep("executing");
      const execRes = await timeIt("Execution", () =>
        apiFetch("Execution", "/api/execution", { planId: planRes.id, customerId: selectedCustomerId, classificationId: classifyRes.id })
      );
      setResults((prev) => ({ ...prev, execution: { id: execRes.executionId, what_was_done: execRes.what_was_done ?? "Completed", retries: execRes.retries ?? 0, status: "COMPLETED" } }));
      addLog(`Execution complete ✓ | ID: ${execRes.executionId}${execRes.retries ? ` | Retries: ${execRes.retries}` : ""}`);
      setStep("done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      addLog(`❌ ${message}`);
      setStep("error");
    }
  };

  const reset = () => { setStep("idle"); setResults({}); setTimings([]); setError(null); setLogs([]); setTaskTitle(""); setTaskDescription(""); };

  const selectedCustomer = customers.find((c) => c.customer_id === selectedCustomerId);
  const sanityProjectId = selectedCustomer?.sanity_project_id;
  const hasSanity = !!sanityProjectId;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Pipeline Simulator</h1>
        <p className="text-sm text-gray-500">End-to-end test: Create task → Classify → Assess → Plan → Execute. No Zoho.</p>
      </div>

      {/* 1. Customer Selection */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700">1. Select Customer</h2>
        {loadingCustomers ? (
          <div className="mt-2 flex items-center gap-2 text-sm text-gray-400"><Loader2 className="size-4 animate-spin" /> Loading...</div>
        ) : (
          <select className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)} disabled={step !== "idle"}>
            <option value="">Select a customer...</option>
            {customers.map((c) => (<option key={c.customer_id} value={c.customer_id}>{c.company_name} ({c.customer_id})</option>))}
          </select>
        )}
        {selectedCustomer && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            {hasSanity ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-700"><CheckCircle2 className="size-3" /> Sanity: {sanityProjectId}</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700"><AlertTriangle className="size-3" /> No Sanity project — execution will fail</span>
            )}
          </div>
        )}
      </section>

      {/* 2. Task Input */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700">2. Task Details</h2>
        <div className="mt-2 space-y-3">
          <input type="text" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            placeholder="Task title (e.g., Update homepage hero text)" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} disabled={step !== "idle"} />
          <textarea className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            placeholder="Task description (optional)" rows={3} value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} disabled={step !== "idle"} />
        </div>
      </section>

      {/* Action Button */}
      <div className="flex gap-3">
        <button onClick={runPipeline} disabled={step !== "idle" || !selectedCustomerId || !taskTitle.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
          <Play className="size-4" /> Run Pipeline
        </button>
        {(step === "done" || step === "error") && (
          <button onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50">
            <RotateCcw className="size-4" /> Reset
          </button>
        )}
      </div>

      {/* Progress */}
      {step !== "idle" && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">Progress</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {PIPELINE_STEPS.map(({ s, label }, i) => {
              const currentIdx = STEP_ORDER.indexOf(step);
              const thisIdx = STEP_ORDER.indexOf(s);
              const isDone = thisIdx < currentIdx;
              const isCurrent = thisIdx === currentIdx;
              const isError = step === "error" && thisIdx <= currentIdx - 1;
              return (
                <div key={s} className="flex items-center gap-2">
                  {isError ? <XCircle className="size-5 text-red-500" /> : isDone ? <CheckCircle2 className="size-5 text-green-500" /> : isCurrent ? <Loader2 className="size-5 animate-spin text-blue-500" /> : <div className="size-5 rounded-full border-2 border-gray-200" />}
                  <span className={`text-xs font-medium ${isError ? "text-red-600" : isDone ? "text-green-600" : isCurrent ? "text-blue-600" : "text-gray-400"}`}>{label}</span>
                  {i < 4 && <ChevronRight className="size-3 text-gray-300" />}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Results */}
      {(results.classification || results.assessment || results.plan || results.execution) && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">Results</h2>
          <div className="mt-3 space-y-4">
            {results.classification && <ResultCard icon={<Zap className="size-4 text-purple-500" />} title="Classification" badge={results.classification.task_type}>
              <Row label="Type" value={results.classification.task_type} />
              <Row label="Priority" value={results.classification.priority} />
              <Row label="LLM" value={results.classification.llm_eligible} />
              <Row label="ID" value={results.classification.id} mono />
            </ResultCard>}
            {results.assessment && <ResultCard icon={<CheckCircle2 className="size-4 text-blue-500" />} title="Assessment" badge={results.assessment.feasibility}>
              <Row label="Feasibility" value={results.assessment.feasibility} />
              <Row label="Subtasks" value={`${results.assessment.subtasks.length}`} />
              <Row label="ID" value={results.assessment.id} mono />
            </ResultCard>}
            {results.plan && <ResultCard icon={<CheckCircle2 className="size-4 text-green-500" />} title="Plan" badge={results.plan.status}>
              <Row label="Status" value={results.plan.status} />
              <Row label="Steps" value={`${results.plan.steps.length}`} />
              <Row label="ID" value={results.plan.id} mono />
            </ResultCard>}
            {results.execution && <ResultCard icon={<CheckCircle2 className="size-4 text-emerald-500" />} title="Execution" badge={results.execution.status}>
              <Row label="Status" value={results.execution.status} />
              <Row label="Result" value={results.execution.what_was_done} />
              <Row label="Retries" value={`${results.execution.retries}`} />
              <Row label="ID" value={results.execution.id} mono />
              {results.execution.error && <Row label="Error" value={results.execution.error} error />}
            </ResultCard>}
          </div>
        </section>
      )}

      {/* Error */}
      {error && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-red-700"><XCircle className="size-4" /> Pipeline Error</h2>
          <pre className="mt-2 whitespace-pre-wrap text-sm text-red-600">{error}</pre>
        </section>
      )}

      {/* Timings */}
      {timings.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700"><Clock className="size-4 text-gray-400" /> Timing</h2>
          <div className="mt-3 space-y-1.5">
            {timings.map((t, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className={t.step.includes("FAILED") ? "text-red-600" : "text-gray-600"}>{t.step}</span>
                <span className="font-mono text-xs text-gray-500">{(t.durationMs / 1000).toFixed(1)}s</span>
              </div>
            ))}
            <div className="border-t border-gray-100 pt-1.5">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span className="text-gray-700">Total</span>
                <span className="font-mono text-xs text-gray-700">{(timings.reduce((sum, t) => sum + t.durationMs, 0) / 1000).toFixed(1)}s</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Event Log */}
      {logs.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-gray-950 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-400">Event Log</h2>
          <div className="mt-2 max-h-60 overflow-y-auto space-y-0.5 font-mono text-xs text-green-400">
            {logs.map((l, i) => (<div key={i}>{l}</div>))}
          </div>
        </section>
      )}
    </div>
  );
}

function ResultCard({ icon, title, badge, children }: { icon: React.ReactNode; title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold text-gray-800">{title}</span>
        {badge && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium uppercase text-gray-600">{badge}</span>}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value, mono, error }: { label: string; value: string; mono?: boolean; error?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs">
      <span className="text-gray-500">{label}</span>
      <span className={`max-w-[60%] text-right break-words ${mono ? "font-mono" : ""} ${error ? "text-red-600" : "text-gray-800"}`}>{value}</span>
    </div>
  );
}
