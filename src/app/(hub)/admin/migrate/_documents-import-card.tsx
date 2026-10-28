"use client";

// Project Documents import row for the Zoho Projects migrate tab (task 464): imports the task-463
// export into each project's Files tab. Dry run is on by default; the full report downloads as JSON.
import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { StateIcon, type CardState } from "./_shared";
import { readSSEStream } from "./_sse";
import { saveJson } from "./_documents-card";

interface Props {
  label: string;
  desc: string;
  state: CardState;
  setState: (v: CardState) => void;
  anyRunning: boolean;
  setAnyRunning: (b: boolean) => void;
}

type Report = {
  dryRun: boolean;
  counts: Record<string, number>;
  projects: Array<{ zohoName: string; matchedBy: string | null; reason?: string }>;
  errors: string[];
};

export function DocumentsImportRow({ label, desc, state, setState, anyRunning, setAnyRunning }: Props) {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selected, setSelected] = useState(""); // "" = every project in the From/To slice
  const [from, setFrom] = useState("0");
  const [to, setTo] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [progress, setProgress] = useState<{ current: number; total: number; project: string } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isRunning = state === "running";
  const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const n = (k: string) => report?.counts[k] ?? 0;
  const unmatched = report?.projects.filter((p) => !p.matchedBy) ?? [];

  useEffect(() => {
    fetch("/api/admin/zoho-export/documents?list=1")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { projects: Array<{ id: string; name: string }> }) => setProjects(j.projects))
      .catch((e) => setError(String(e)));
  }, []);

  async function run() {
    if (anyRunning) return;
    setAnyRunning(true);
    setState("running");
    setProgress(null);
    setReport(null);
    setError(null);

    try {
      const qp = new URLSearchParams();
      if (dryRun) qp.set("dryRun", "1");
      if (selected) qp.set("project", selected);
      else {
        qp.set("from", from || "0");
        if (to) qp.set("to", to);
      }
      const res = await fetch(`/api/admin/zoho-import/documents?${qp}`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }

      let failed: string | null = null;
      await readSSEStream(res, (evt) => {
        if (evt.type === "progress") setProgress({ current: evt.current as number, total: evt.total as number, project: evt.project as string });
        if (evt.type === "error") failed = evt.message as string;
        if (evt.type === "done") {
          const r = evt.report as Report;
          setReport(r);
          saveJson(r, `documents-import-report-${dryRun ? "dryrun-" : ""}${selected || `all-${from || "0"}-${to || "end"}`}.json`);
        }
      });
      if (failed) throw new Error(failed);
      setProgress(null);
      setState("done");
    } catch (e) {
      setError(String(e));
      setProgress(null);
      setState("error");
      console.error("[import/documents]", e);
    } finally {
      setAnyRunning(false);
    }
  }

  return (
    <div className="py-2 border-b border-slate-100 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
            {label}
            <StateIcon state={state} />
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>
          {!isRunning && (
            <select
              aria-label="Project to import documents for"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-1.5 max-w-full text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          {!isRunning && !selected && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <label className="text-[11px] text-slate-500">From</label>
              <input
                type="number"
                min={0}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-16 text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
              />
              <label className="text-[11px] text-slate-500">To</label>
              <input
                type="number"
                min={0}
                value={to}
                placeholder="all"
                onChange={(e) => setTo(e.target.value)}
                className="w-16 text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
              />
              <span className="text-[11px] text-slate-400">of all projects</span>
            </div>
          )}
          {!isRunning && (
            <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-600">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
              Dry run — plan only, no downloads and no writes
            </label>
          )}
        </div>
        {!isRunning && (
          <button
            onClick={run}
            disabled={anyRunning}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Upload size={11} />
            {dryRun ? "Dry run" : "Import"}
          </button>
        )}
      </div>
      {isRunning && progress !== null ? (
        <div className="mt-2">
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[11px] text-slate-500 mt-1 truncate">
            File {progress.current} of {progress.total} — {progress.project}
          </div>
        </div>
      ) : null}
      {state === "done" && report !== null ? (
        <div className="mt-1 text-[11px] space-y-0.5">
          <div className="text-green-600">
            {report.dryRun ? "Dry run — nothing written. " : ""}
            Projects: {n("projectsLegacy")} Legacy · {n("projectsV2")} v2 · {n("projectsUnmatched")} unmatched · {n("projectsWithoutDocuments")} without documents
          </div>
          <div className="text-green-600">
            Folders: {n("foldersCreated")} {report.dryRun ? "to create" : "created"} · {n("foldersReused")} reused · {n("foldersRenamed")} with &quot;(From Zoho)&quot;
          </div>
          <div className="text-green-600">
            Files: {report.dryRun ? `${n("filesImportable")} importable` : `${n("filesImported")} imported`} · {n("filesAlreadyImported")} already imported · {n("filesFailed")} failed
          </div>
          <div className="text-slate-600">
            Not importable ({n("filesUnsupportedType")} unsupported type · {n("filesNative")} native Zoho · {n("filesTooLarge")} over 200 MB) —{" "}
            {report.dryRun ? "will be saved locally" : `${n("localSaved")} saved locally · ${n("localExisting")} already there · ${n("localFailed")} failed`}
          </div>
          {unmatched.length > 0 ? (
            <div className="text-amber-600 truncate" title={unmatched.map((p) => `${p.zohoName}: ${p.reason}`).join("\n")}>
              {unmatched.length} project(s) have no Hub match — listed in the report
            </div>
          ) : null}
          {report.errors.length > 0 ? <div className="text-amber-600">{report.errors.length} error(s) — see the downloaded report</div> : null}
        </div>
      ) : null}
      {error !== null ? <div className="mt-1 text-[11px] text-red-600">{error}</div> : null}
    </div>
  );
}
