"use client";

import { useState } from "react";
import { SectionCard } from "@/app/(hub)/dashboard/_components/dashboard-shared";
import { AlertTriangle, Download, Upload } from "lucide-react";
import { ImportResult, CardState, CardStatus, ResultChip, StateIcon } from "./_shared";

interface TicketCommentsExportState {
  progress: { current: number; total: number; ticketId: string } | null;
  done: { count: number; failed: string[] } | null;
  error: string | null;
}

const EXPORT_LEVELS = [
  { key: "desk-accounts", label: "Desk Accounts", desc: "All Zoho Desk accounts (companies) — requires the Desk.accounts.READ OAuth scope; export before Desk Contacts for account-name matching" },
  { key: "desk-contacts", label: "Desk Contacts", desc: "All Zoho Desk contacts — can run independently, but export Desk Accounts first for customer matching" },
  { key: "desk-tickets", label: "Desk Tickets", desc: "All Zoho Desk tickets — no new OAuth scope needed (Desk.tickets.READ already granted)" },
  { key: "desk-ticket-comments", label: "Desk Ticket Comments", desc: "Agent notes/replies per ticket (not the full customer conversation — that lives in Zoho's Threads, a separate future export) — requires desk-tickets.json exported first" },
] as const;

const IMPORT_LEVELS = [
  { key: "desk-contacts", label: "Desk Contacts", desc: "Imports desk-contacts.json into the contacts table, matched to customers via desk-accounts.json (if present) by normalized account name" },
  { key: "desk-tickets", label: "Desk Tickets", desc: "Imports desk-tickets.json into the tickets table — matched via the ticket's contact (contacts.customer_id) with an account-name fallback; unmatched tickets import anyway with customer_id: null" },
  { key: "desk-ticket-comments", label: "Desk Ticket Comments", desc: "Imports desk-ticket-comments.json into ticket_messages (author_type: staff, visibility from isPublic) — requires Desk Tickets imported first" },
] as const;

export default function ZohoDeskTab() {
  const [exportStates, setExportStates] = useState<Record<string, CardState>>({});
  const [importStates, setImportStates] = useState<Record<string, CardStatus>>({});
  const [anyRunning, setAnyRunning] = useState(false);
  const [ticketCommentsExport, setTicketCommentsExport] = useState<TicketCommentsExportState>({
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
      a.download = `${level}.json`;
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

  async function handleTicketCommentsExport() {
    if (anyRunning) return;
    setAnyRunning(true);
    setExportStates((s) => ({ ...s, "desk-ticket-comments": "running" }));
    setTicketCommentsExport({ progress: null, done: null, error: null });

    try {
      const res = await fetch("/api/admin/zoho-export/desk-ticket-comments");
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
            ticketId?: string;
            comments?: unknown[];
            total_comments?: number;
            failed_ticket_ids?: string[];
          };

          if (evt.type === "progress") {
            setTicketCommentsExport((s) => ({
              ...s,
              progress: { current: evt.current!, total: evt.total!, ticketId: evt.ticketId! },
            }));
          }
          if (evt.type === "comments" && evt.comments) {
            accumulated.push(...evt.comments);
          }
          if (evt.type === "done") {
            const blob = new Blob([JSON.stringify(accumulated, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "desk-ticket-comments.json";
            a.click();
            URL.revokeObjectURL(url);
            setTicketCommentsExport((s) => ({
              ...s,
              done: { count: evt.total_comments!, failed: evt.failed_ticket_ids ?? [] },
              progress: null,
            }));
            setExportStates((s) => ({ ...s, "desk-ticket-comments": "done" }));
          }
        }
      }
    } catch (e) {
      setTicketCommentsExport((s) => ({ ...s, error: String(e), progress: null }));
      setExportStates((s) => ({ ...s, "desk-ticket-comments": "error" }));
      console.error("[export/desk-ticket-comments]", e);
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
    <>
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-800">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <div>
          <strong>Run steps in order:</strong> Desk Accounts → Desk Contacts → Desk Tickets → Desk Ticket
          Comments. Save each downloaded file to{" "}
          <code className="bg-amber-100 px-1 rounded text-[11px]">_from_zoho/</code> before running the
          corresponding import. Desk Ticket Comments are agent notes/replies, not the full customer
          conversation — Zoho&apos;s Threads (the full conversation) are a separate, future export.
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
            if (key === "desk-ticket-comments") {
              const isRunning = exportStates["desk-ticket-comments"] === "running";
              const pct = ticketCommentsExport.progress
                ? Math.round((ticketCommentsExport.progress.current / ticketCommentsExport.progress.total) * 100)
                : 0;

              return (
                <div key="desk-ticket-comments" className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                        {label}
                        <StateIcon state={exportStates["desk-ticket-comments"] ?? "idle"} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                    </div>
                    {!isRunning && (
                      <button
                        onClick={handleTicketCommentsExport}
                        disabled={anyRunning}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Download size={11} />
                        Export
                      </button>
                    )}
                  </div>
                  {isRunning && ticketCommentsExport.progress !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate">
                        Ticket {ticketCommentsExport.progress.current} of {ticketCommentsExport.progress.total}
                      </div>
                    </div>
                  ) : null}
                  {exportStates["desk-ticket-comments"] === "done" && ticketCommentsExport.done !== null ? (
                    <div className="mt-1 text-[11px] space-y-0.5">
                      <div className="text-green-600">{ticketCommentsExport.done.count} comments downloaded</div>
                      {ticketCommentsExport.done.failed.length > 0 ? (
                        <div className="text-amber-600 truncate" title={ticketCommentsExport.done.failed.join(", ")}>
                          {ticketCommentsExport.done.failed.length} ticket(s) failed after retries — re-run to retry
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {ticketCommentsExport.error !== null ? (
                    <div className="mt-1 text-[11px] text-red-600">{ticketCommentsExport.error}</div>
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
    </>
  );
}
