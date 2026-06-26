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
          {EXPORT_LEVELS.map(({ key, label, desc }) => (
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
          ))}
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
                {st?.state === "done" && st.result && <ResultChip result={st.result} />}
                {st?.state === "error" && (
                  <div className="mt-2 text-[12px] text-red-600">{st.errorMsg}</div>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
