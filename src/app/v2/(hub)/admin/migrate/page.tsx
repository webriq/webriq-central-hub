"use client";

import React, { useState } from "react";
import { SectionCard } from "@/app/v2/(hub)/dashboard/_components/dashboard-shared";
import { AlertTriangle, Download, Upload, CheckCircle2, XCircle, Loader2 } from "lucide-react";

type ImportResult = { imported: number; updated: number; skipped: number; errors: string[] };
type CardState = "idle" | "running" | "done" | "error";

interface CardStatus {
  state: CardState;
  result?: ImportResult | null;
  errorMsg?: string;
}

interface TasksExportState {
  from: string;
  to: string;
  since: string;
  progress: { current: number; total: number; project: string } | null;
  done: { count: number } | null;
  error: string | null;
}

interface TasksImportState {
  progress: { pass: 1 | 2; current: number; total: number } | null;
  done: { imported: number; skipped: number; parents_resolved: number; errors: string[] } | null;
  error: string | null;
}

const EXPORT_LEVELS = [
  { key: "milestones", label: "Milestones", desc: "All milestones across every project — export before Tasklists" },
  { key: "tasklists", label: "Tasklists", desc: "All tasklists across every project" },
  { key: "tasks", label: "Tasks", desc: "All tasks (paginated per project)" },
  { key: "comments", label: "Comments", desc: "All task comments — requires tasks.json exported first" },
  { key: "timelogs", label: "Time Logs", desc: "All time log entries per project" },
  { key: "attachment-meta", label: "Attachment Metadata", desc: "Attachment list per task — requires tasks.json exported first" },
] as const;

const IMPORT_LEVELS = [
  { key: "customers", label: "Customers", desc: "Creates Hub customer records from unique names in projects.json — run first" },
  { key: "projects", label: "Projects", desc: "Creates or upserts Hub project rows from projects.json — requires Customers imported first" },
  { key: "milestones", label: "Milestones", desc: "Creates Hub milestone records from milestones.json — run before Tasklists" },
  { key: "tasklists", label: "Tasklists", desc: "Creates Hub tasklist records from tasklists.json" },
  { key: "tasks", label: "Tasks", desc: "Creates Hub task records from tasks.json" },
  { key: "comments", label: "Comments", desc: "Imports task comments from comments.json" },
  { key: "timelogs", label: "Time Logs", desc: "Imports time log entries from timelogs.json" },
  { key: "attachments", label: "Attachments", desc: "Downloads files from Zoho, uploads to Supabase Storage — may be slow" },
] as const;

function ResultChip({ result }: { result: ImportResult }) {
  return (
    <div className="mt-3 text-[12px] space-y-0.5">
      <div className="text-slate-600">
        <span className="font-semibold text-green-700">{result.imported}</span> imported ·{" "}
        <span className="font-semibold text-blue-700">{result.updated}</span> updated ·{" "}
        <span className="font-semibold text-slate-500">{result.skipped}</span> skipped
      </div>
      {result.errors.length > 0 && (
        <div className="text-red-600 font-medium">{result.errors.length} error(s)</div>
      )}
      {result.errors.slice(0, 3).map((e, i) => (
        <div key={i} className="text-red-500 truncate" title={e}>{e}</div>
      ))}
      {result.errors.length > 3 && (
        <div className="text-slate-400">+{result.errors.length - 3} more errors</div>
      )}
    </div>
  );
}

function StateIcon({ state }: { state: CardState }) {
  if (state === "running") return <Loader2 size={14} className="animate-spin text-blue-500" />;
  if (state === "done") return <CheckCircle2 size={14} className="text-green-600" />;
  if (state === "error") return <XCircle size={14} className="text-red-500" />;
  return null;
}

export default function MigratePage() {
  const [exportStates, setExportStates] = useState<Record<string, CardState>>({});
  const [importStates, setImportStates] = useState<Record<string, CardStatus>>({});
  const [anyRunning, setAnyRunning] = useState(false);
  const [tasksExport, setTasksExport] = useState<TasksExportState>({
    from: "0",
    to: "",
    since: "2025-01-01",
    progress: null,
    done: null,
    error: null,
  });
  const [tasksImport, setTasksImport] = useState<TasksImportState>({
    progress: null,
    done: null,
    error: null,
  });

  async function handleExport(level: string) {
    if (anyRunning) return;
    setAnyRunning(true);
    setExportStates((s) => ({ ...s, [level]: "running" }));
    try {
      const res = await fetch(`/api/admin/zoho-export/${level}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = level === "attachment-meta" ? "attachment-meta.json" : `${level}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportStates((s) => ({ ...s, [level]: "done" }));
    } catch (e) {
      setExportStates((s) => ({ ...s, [level]: "error" }));
      console.error(`[export/${level}]`, e);
    } finally {
      setAnyRunning(false);
    }
  }

  async function handleTasksExport() {
    if (anyRunning) return;
    setAnyRunning(true);
    setExportStates((s) => ({ ...s, tasks: "running" }));
    setTasksExport((s) => ({ ...s, progress: null, done: null, error: null }));

    try {
      const qp = new URLSearchParams({ from: tasksExport.from || "0" });
      if (tasksExport.to) qp.set("to", tasksExport.to);
      if (tasksExport.since) qp.set("since", tasksExport.since);

      const res = await fetch(`/api/admin/zoho-export/tasks?${qp}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const accumulated: unknown[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          if (!frame.startsWith("data: ")) continue;
          const evt = JSON.parse(frame.slice(6)) as {
            type: string;
            current?: number;
            total?: number;
            project?: string;
            tasks?: unknown[];
            total_tasks?: number;
          };

          if (evt.type === "progress") {
            setTasksExport((s) => ({
              ...s,
              progress: { current: evt.current!, total: evt.total!, project: evt.project! },
            }));
          }
          if (evt.type === "tasks" && evt.tasks) {
            accumulated.push(...evt.tasks);
          }
          if (evt.type === "done") {
            const blob = new Blob([JSON.stringify(accumulated, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const sinceYear = tasksExport.since ? tasksExport.since.split("-")[0] : "all";
            const toLabel = tasksExport.to || "end";
            a.download = `tasks-${tasksExport.from || "0"}-${toLabel}-${sinceYear}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setTasksExport((s) => ({ ...s, done: { count: evt.total_tasks! }, progress: null }));
            setExportStates((s) => ({ ...s, tasks: "done" }));
          }
        }
      }
    } catch (e) {
      setTasksExport((s) => ({ ...s, error: String(e), progress: null }));
      setExportStates((s) => ({ ...s, tasks: "error" }));
      console.error("[export/tasks]", e);
    } finally {
      setAnyRunning(false);
    }
  }

  async function handleTasksImport() {
    if (anyRunning) return;
    setAnyRunning(true);
    setImportStates((s) => ({ ...s, tasks: { state: "running" } }));
    setTasksImport({ progress: null, done: null, error: null });

    try {
      const res = await fetch("/api/admin/zoho-import/tasks", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          if (!frame.startsWith("data: ")) continue;
          const evt = JSON.parse(frame.slice(6)) as {
            type: string;
            pass?: 1 | 2;
            current?: number;
            total?: number;
            imported?: number;
            skipped?: number;
            parents_resolved?: number;
            errors?: string[];
            message?: string;
          };

          if (evt.type === "progress") {
            setTasksImport((s) => ({
              ...s,
              progress: { pass: evt.pass!, current: evt.current!, total: evt.total! },
            }));
          }
          if (evt.type === "done") {
            setTasksImport((s) => ({
              ...s,
              progress: null,
              done: {
                imported: evt.imported!,
                skipped: evt.skipped!,
                parents_resolved: evt.parents_resolved!,
                errors: evt.errors ?? [],
              },
            }));
            setImportStates((s) => ({ ...s, tasks: { state: "done" } }));
          }
          if (evt.type === "error") {
            throw new Error(evt.message ?? "Unknown error");
          }
        }
      }
    } catch (e) {
      setTasksImport((s) => ({ ...s, error: String(e), progress: null }));
      setImportStates((s) => ({ ...s, tasks: { state: "error", errorMsg: String(e) } }));
      console.error("[import/tasks]", e);
    } finally {
      setAnyRunning(false);
    }
  }

  async function handleImport(level: string) {
    if (anyRunning) return;
    setAnyRunning(true);
    setImportStates((s) => ({ ...s, [level]: { state: "running" } }));
    try {
      const res = await fetch(`/api/admin/zoho-import/${level}`, { method: "POST" });
      const data = await res.json() as ImportResult | { error: string };
      if (!res.ok || "error" in data) {
        setImportStates((s) => ({
          ...s,
          [level]: { state: "error", errorMsg: "error" in data ? data.error : `HTTP ${res.status}` },
        }));
      } else {
        setImportStates((s) => ({ ...s, [level]: { state: "done", result: data } }));
      }
    } catch (e) {
      setImportStates((s) => ({ ...s, [level]: { state: "error", errorMsg: String(e) } }));
    } finally {
      setAnyRunning(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Zoho Decommission Migration</h1>
        <p className="text-[13px] text-slate-500 mt-1">One-time data migration from Zoho Projects into the Hub&apos;s native Supabase schema.</p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-800">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <div>
          <strong>Run steps in order:</strong> Export projects.json is already in{" "}
          <code className="bg-amber-100 px-1 rounded text-[11px]">_from_zoho/</code>. Then export and
          import each level: <strong>Milestones → Tasklists → Tasks → Comments → Time Logs → Attachments</strong>.
          Save each downloaded file to{" "}
          <code className="bg-amber-100 px-1 rounded text-[11px]">_from_zoho/</code> before running the
          corresponding import.
        </div>
      </div>

      {/* Export Phase */}
      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <Download size={14} />
            Phase 1 — Export from Zoho
          </span>
        }
      >
        <div className="space-y-3">
          {EXPORT_LEVELS.map(({ key, label, desc }) => {
            if (key === "tasks") {
              const isRunning = exportStates.tasks === "running";
              const pct = tasksExport.progress
                ? Math.round((tasksExport.progress.current / tasksExport.progress.total) * 100)
                : 0;

              return (
                <div key="tasks" className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                        {label}
                        <StateIcon state={exportStates.tasks ?? "idle"} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                      {!isRunning && (
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <label className="text-[11px] text-slate-500">From</label>
                          <input
                            type="number"
                            min={0}
                            value={tasksExport.from}
                            onChange={(e) => setTasksExport((s) => ({ ...s, from: e.target.value }))}
                            className="w-16 text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
                          />
                          <label className="text-[11px] text-slate-500">To</label>
                          <input
                            type="number"
                            min={0}
                            value={tasksExport.to}
                            placeholder="all"
                            onChange={(e) => setTasksExport((s) => ({ ...s, to: e.target.value }))}
                            className="w-16 text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
                          />
                          <label className="text-[11px] text-slate-500">Since</label>
                          <input
                            type="date"
                            value={tasksExport.since}
                            onChange={(e) => setTasksExport((s) => ({ ...s, since: e.target.value }))}
                            className="text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
                          />
                        </div>
                      )}
                    </div>
                    {!isRunning && (
                      <button
                        onClick={handleTasksExport}
                        disabled={anyRunning}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Download size={11} />
                        Export
                      </button>
                    )}
                  </div>
                  {isRunning && tasksExport.progress !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate">
                        Project {tasksExport.progress.current} of {tasksExport.progress.total} — {tasksExport.progress.project}
                      </div>
                    </div>
                  ) : null}
                  {exportStates.tasks === "done" && tasksExport.done !== null ? (
                    <div className="mt-1 text-[11px] text-green-600">{tasksExport.done.count} tasks downloaded</div>
                  ) : null}
                  {tasksExport.error !== null ? (
                    <div className="mt-1 text-[11px] text-red-600">{tasksExport.error}</div>
                  ) : null}
                </div>
              );
            }

            return (
              <div key={key} className="flex items-center justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                    {label}
                    <StateIcon state={exportStates[key] ?? "idle"} />
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                </div>
                <button
                  onClick={() => handleExport(key)}
                  disabled={anyRunning || exportStates[key] === "running"}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Download size={11} />
                  Export
                </button>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Import Phase */}
      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <Upload size={14} />
            Phase 2 — Import into Supabase
          </span>
        }
      >
        <div className="space-y-3">
          {IMPORT_LEVELS.map(({ key, label, desc }) => {
            if (key === "tasks") {
              const isRunning = importStates.tasks?.state === "running";
              const prog = tasksImport.progress;
              const pass1Pct = prog
                ? prog.pass === 1
                  ? Math.round((prog.current / prog.total) * 100)
                  : 100
                : 0;
              const pass2Pct =
                prog?.pass === 2 ? Math.round((prog.current / prog.total) * 100) : 0;

              return (
                <div key="tasks" className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                        {label}
                        <StateIcon state={importStates.tasks?.state ?? "idle"} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                    </div>
                    {!isRunning && (
                      <button
                        onClick={handleTasksImport}
                        disabled={anyRunning}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Upload size={11} />
                        Import
                      </button>
                    )}
                  </div>

                  {isRunning && prog !== null ? (
                    <div className="mt-2 space-y-1.5">
                      <div className="text-[11px] text-slate-500">
                        {prog.pass === 1
                          ? `Pass 1 — Inserting tasks (chunk ${prog.current} of ${prog.total})`
                          : "Pass 1 — Done"}
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pass1Pct}%` }}
                        />
                      </div>
                      {prog.pass === 2 && (
                        <>
                          <div className="text-[11px] text-slate-500">
                            Pass 2 — Linking parents (chunk {prog.current} of {prog.total})
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-violet-500 rounded-full transition-all"
                              style={{ width: `${pass2Pct}%` }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}

                  {importStates.tasks?.state === "done" && tasksImport.done !== null ? (
                    <div className="mt-2 text-[12px] text-slate-600 space-y-0.5">
                      <div>
                        <span className="font-semibold text-green-700">{tasksImport.done.imported}</span> imported ·{" "}
                        <span className="font-semibold text-violet-700">{tasksImport.done.parents_resolved}</span> parents linked ·{" "}
                        <span className="font-semibold text-slate-500">{tasksImport.done.skipped}</span> skipped
                      </div>
                      {tasksImport.done.errors.length > 0 && (
                        <div className="text-red-600">{tasksImport.done.errors.length} error(s)</div>
                      )}
                      {tasksImport.done.errors.slice(0, 3).map((e, i) => (
                        <div key={i} className="text-red-500 text-[11px] truncate" title={e}>{e}</div>
                      ))}
                      {tasksImport.done.errors.length > 3 && (
                        <div className="text-slate-400 text-[11px]">+{tasksImport.done.errors.length - 3} more</div>
                      )}
                    </div>
                  ) : null}

                  {tasksImport.error !== null ? (
                    <div className="mt-1 text-[11px] text-red-600">{tasksImport.error}</div>
                  ) : null}
                </div>
              );
            }

            const st = importStates[key];
            return (
              <div key={key} className="py-2 border-b border-slate-100 last:border-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                      {label}
                      <StateIcon state={st?.state ?? "idle"} />
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                  </div>
                  <button
                    onClick={() => handleImport(key)}
                    disabled={anyRunning || st?.state === "running"}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Upload size={11} />
                    Import
                  </button>
                </div>
                {st?.state === "done" && st.result ? <ResultChip result={st.result} /> : null}
                {st?.state === "error" ? (
                  <div className="mt-2 text-[12px] text-red-600">{st.errorMsg}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
