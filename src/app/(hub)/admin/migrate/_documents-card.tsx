"use client";

// Project Documents export row for the Zoho Projects migrate tab — a project dropdown
// ("All projects" or one) drives the same SSE export as the other levels.
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { StateIcon, type CardState } from "./_shared";
import { readSSEStream } from "./_sse";

interface Props {
  label: string;
  desc: string;
  state: CardState;
  setState: (v: CardState) => void;
  anyRunning: boolean;
  setAnyRunning: (b: boolean) => void;
}

export function saveJson(data: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DocumentsExportRow({ label, desc, state, setState, anyRunning, setAnyRunning }: Props) {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selected, setSelected] = useState(""); // "" = all projects
  const [from, setFrom] = useState("0");
  const [to, setTo] = useState("");
  const [progress, setProgress] = useState<{ current: number; total: number; project: string } | null>(null);
  const [done, setDone] = useState<{ count: number; failed: Array<{ id: string; name: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isRunning = state === "running";
  const tag = selected || `all-${from || "0"}-${to || "end"}`;
  const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0;

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
    setDone(null);
    setError(null);

    try {
      const qp = new URLSearchParams();
      if (selected) qp.set("project", selected);
      else {
        qp.set("from", from || "0");
        if (to) qp.set("to", to);
      }
      const res = await fetch(`/api/admin/zoho-export/documents?${qp}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const accumulated: unknown[] = [];
      await readSSEStream(res, (evt) => {
        if (evt.type === "progress") {
          setProgress({ current: evt.current as number, total: evt.total as number, project: evt.project as string });
        }
        if (evt.type === "documents" && evt.items) accumulated.push(...(evt.items as unknown[]));
        if (evt.type === "done") {
          saveJson(accumulated, `documents-${tag}.json`);
          const failed = (evt.failed_projects as Array<{ id: string; name: string }>) ?? [];
          if (failed.length > 0) saveJson(failed, `documents-failed-${tag}.json`);
          setDone({ count: evt.total_documents as number, failed });
          setProgress(null);
          setState("done");
        }
      });
    } catch (e) {
      setError(String(e));
      setProgress(null);
      setState("error");
      console.error("[export/documents]", e);
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
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
          {!isRunning && (
            <select
              aria-label="Project to export documents for"
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
        </div>
        {!isRunning && (
          <button
            onClick={run}
            disabled={anyRunning}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={11} />
            Export
          </button>
        )}
      </div>
      {isRunning && progress !== null ? (
        <div className="mt-2">
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[11px] text-slate-500 mt-1 truncate">
            Project {progress.current} of {progress.total} — {progress.project}
          </div>
        </div>
      ) : null}
      {state === "done" && done !== null ? (
        <div className="mt-1 text-[11px]">
          <div className="text-green-600">{done.count} documents downloaded</div>
          {done.failed.length > 0 ? (
            <div className="text-amber-600 mt-0.5 truncate" title={done.failed.map((f) => f.name).join(", ")}>
              {done.failed.length} project(s) failed — saved to documents-failed-*.json
            </div>
          ) : null}
        </div>
      ) : null}
      {error !== null ? <div className="mt-1 text-[11px] text-red-600">{error}</div> : null}
    </div>
  );
}
