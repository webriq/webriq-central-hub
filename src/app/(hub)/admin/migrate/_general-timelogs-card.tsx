"use client";

// General (project-level, no task/bug) time logs — Export + Import rows for the Zoho Projects
// migrate tab (task 342). Kept out of _zoho-projects-tab.tsx (already ~2,500 lines) per
// nextjs-file-length-best-practices.md — the tab only renders these and owns the shared
// anyRunning lock + per-key CardState maps.
import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { StateIcon, type CardState } from "./_shared";
import { readSSEStream } from "./_sse";

interface RowProps {
  label: string;
  desc: string;
  state: CardState;
  setState: (v: CardState) => void;
  anyRunning: boolean;
  setAnyRunning: (b: boolean) => void;
}

interface ExportState {
  from: string;
  to: string;
  progress: { current: number; total: number; project: string } | null;
  done: { count: number; failed: string[] } | null;
  error: string | null;
}

interface ImportState {
  progress: { current: number; total: number } | null;
  done: { imported: number; skipped: number; errors: string[] } | null;
  error: string | null;
}

export function GeneralTimelogsExportRow({ label, desc, state, setState, anyRunning, setAnyRunning }: RowProps) {
  const [ex, setEx] = useState<ExportState>({ from: "0", to: "", progress: null, done: null, error: null });
  const isRunning = state === "running";
  const pct = ex.progress ? Math.round((ex.progress.current / ex.progress.total) * 100) : 0;

  async function run() {
    if (anyRunning) return;
    setAnyRunning(true);
    setState("running");
    setEx((s) => ({ ...s, progress: null, done: null, error: null }));

    try {
      const qp = new URLSearchParams({ from: ex.from || "0" });
      if (ex.to) qp.set("to", ex.to);
      const res = await fetch(`/api/admin/zoho-export/general-timelogs?${qp}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const accumulated: unknown[] = [];
      await readSSEStream(res, (evt) => {
        if (evt.type === "progress") {
          setEx((s) => ({
            ...s,
            progress: { current: evt.current as number, total: evt.total as number, project: evt.project as string },
          }));
        }
        if (evt.type === "timelogs" && evt.logs) {
          accumulated.push(...(evt.logs as unknown[]));
        }
        if (evt.type === "done") {
          const blob = new Blob([JSON.stringify(accumulated, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `general-timelogs-${ex.from || "0"}-${ex.to || "end"}.json`;
          a.click();
          URL.revokeObjectURL(url);
          setEx((s) => ({
            ...s,
            done: { count: evt.total_logs as number, failed: (evt.failed_windows as string[]) ?? [] },
            progress: null,
          }));
          setState("done");
        }
      });
    } catch (e) {
      setEx((s) => ({ ...s, error: String(e), progress: null }));
      setState("error");
      console.error("[export/general-timelogs]", e);
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
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <label className="text-[11px] text-slate-500">From</label>
              <input
                type="number"
                min={0}
                value={ex.from}
                onChange={(e) => setEx((s) => ({ ...s, from: e.target.value }))}
                className="w-16 text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
              />
              <label className="text-[11px] text-slate-500">To</label>
              <input
                type="number"
                min={0}
                value={ex.to}
                placeholder="all"
                onChange={(e) => setEx((s) => ({ ...s, to: e.target.value }))}
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
      {isRunning && ex.progress !== null ? (
        <div className="mt-2">
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[11px] text-slate-500 mt-1 truncate">
            Project {ex.progress.current} of {ex.progress.total} — {ex.progress.project}
          </div>
        </div>
      ) : null}
      {state === "done" && ex.done !== null ? (
        <div className="mt-1 text-[11px]">
          <div className="text-green-600">{ex.done.count} logs downloaded</div>
          {ex.done.failed.length > 0 ? (
            <div className="text-amber-600 mt-0.5 truncate" title={ex.done.failed.join(", ")}>
              {ex.done.failed.length} window(s) failed after retries — re-run with from/to to retry
            </div>
          ) : null}
        </div>
      ) : null}
      {ex.error !== null ? <div className="mt-1 text-[11px] text-red-600">{ex.error}</div> : null}
    </div>
  );
}

export function GeneralTimelogsImportRow({ label, desc, state, setState, anyRunning, setAnyRunning }: RowProps) {
  const [im, setIm] = useState<ImportState>({ progress: null, done: null, error: null });
  const isRunning = state === "running";
  const pct = im.progress ? Math.round((im.progress.current / im.progress.total) * 100) : 0;

  async function run() {
    if (anyRunning) return;
    setAnyRunning(true);
    setState("running");
    setIm({ progress: null, done: null, error: null });

    try {
      const res = await fetch("/api/admin/zoho-import/general-timelogs", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      await readSSEStream(res, (evt) => {
        if (evt.type === "progress") {
          setIm((s) => ({ ...s, progress: { current: evt.current as number, total: evt.total as number } }));
        }
        if (evt.type === "done") {
          setIm((s) => ({
            ...s,
            progress: null,
            done: {
              imported: evt.imported as number,
              skipped: evt.skipped as number,
              errors: (evt.errors as string[]) ?? [],
            },
          }));
          setState("done");
        }
        if (evt.type === "error") {
          throw new Error((evt.message as string) ?? "Unknown error");
        }
      });
    } catch (e) {
      setIm((s) => ({ ...s, error: String(e), progress: null }));
      setState("error");
      console.error("[import/general-timelogs]", e);
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
        </div>
        {!isRunning && (
          <button
            onClick={run}
            disabled={anyRunning}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Upload size={11} />
            Import
          </button>
        )}
      </div>

      {isRunning && im.progress !== null ? (
        <div className="mt-2">
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[11px] text-slate-500 mt-1 truncate">
            Chunk {im.progress.current} of {im.progress.total}
          </div>
        </div>
      ) : null}

      {state === "done" && im.done !== null ? (
        <div className="mt-2 text-[12px] text-slate-600 space-y-0.5">
          <div>
            <span className="font-semibold text-green-700">{im.done.imported}</span> imported ·{" "}
            <span className="font-semibold text-slate-500">{im.done.skipped}</span> skipped
          </div>
          {im.done.errors.length > 0 && (
            <div className="text-red-600">{im.done.errors.length} error(s)</div>
          )}
          {im.done.errors.slice(0, 3).map((e, i) => (
            <div key={i} className="text-red-500 text-[11px] truncate" title={e}>{e}</div>
          ))}
          {im.done.errors.length > 3 && (
            <div className="text-slate-400 text-[11px]">+{im.done.errors.length - 3} more</div>
          )}
        </div>
      ) : null}

      {im.error !== null ? <div className="mt-1 text-[11px] text-red-600">{im.error}</div> : null}
    </div>
  );
}
