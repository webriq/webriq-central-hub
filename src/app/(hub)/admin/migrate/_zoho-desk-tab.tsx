"use client";

import { useState } from "react";
import { SectionCard } from "@/app/(hub)/dashboard/_components/dashboard-shared";
import { AlertTriangle, Download, Upload } from "lucide-react";
import { ImportResult, CardState, CardStatus, ResultChip, StateIcon } from "./_shared";
import { cn } from "@/lib/utils";

interface TicketCommentsExportState {
  progress: { current: number; total: number; ticketId: string } | null;
  done: { count: number; failed: string[] } | null;
  error: string | null;
}

interface ThreadsExportState {
  progress: { current: number; total: number; ticketId: string } | null;
  done: { count: number; failed: string[] } | null;
  error: string | null;
}

interface ArchivedTicketsExportState {
  progress: { current: number; total: number; ticketCount: number } | null;
  warnings: string[];
  done: {
    count: number;
    failedDepartments: string[];
    truncatedDepartments: string[];
    partial: boolean;
  } | null;
  error: string | null;
}

type VerifyAttachmentResult =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; ok: boolean; status: number; contentType: string | null; contentLength: string | null }
  | { state: "error"; message: string };

interface TicketAttachmentsImportState {
  progress: { current: number; total: number } | null;
  done: { imported: number; skipped: number; errors: string[] } | null;
  error: string | null;
}

const EXPORT_LEVELS = [
  { key: "desk-accounts", label: "Desk Accounts", desc: "All Zoho Desk accounts (companies) — requires the Desk.accounts.READ OAuth scope; export before Desk Contacts for account-name matching" },
  { key: "desk-contacts", label: "Desk Contacts", desc: "All Zoho Desk contacts — can run independently, but export Desk Accounts first for customer matching" },
  { key: "desk-agents", label: "Desk Agents", desc: "All Zoho Desk agents — no new OAuth scope needed (Desk.agents.READ already granted); used to resolve ticket Owner names" },
  { key: "desk-tickets", label: "Desk Tickets", desc: "All Zoho Desk tickets — no new OAuth scope needed (Desk.tickets.READ already granted)" },
  { key: "desk-ticket-comments", label: "Desk Ticket Comments", desc: "Agent notes/replies per ticket — not the full customer conversation, see Desk Threads below — requires desk-tickets.json exported first" },
  { key: "desk-threads", label: "Desk Threads", desc: "The actual customer↔agent conversation per ticket (emails, forum replies, etc.) — requires desk-tickets.json exported first" },
  { key: "desk-archived-tickets", label: "Desk Archived Tickets", desc: "Archived tickets created 2025-01-01 onward — a separate endpoint the live Desk Tickets export skips entirely; loops every department, warns if a department's 2025+ set exceeds Zoho's 5,000/department API cap or a department fails (others still export). Needs the Desk.search.READ scope" },
] as const;

const IMPORT_LEVELS = [
  { key: "desk-contacts", label: "Desk Contacts", desc: "Imports desk-contacts.json into the contacts table, matched to customers via desk-accounts.json (if present) by normalized account name" },
  { key: "desk-agents", label: "Desk Agents", desc: "Imports desk-agents.json into the desk_agents table — no customer matching, used only to resolve ticket Owner names" },
  { key: "desk-tickets", label: "Desk Tickets", desc: "Imports desk-tickets.json into the tickets table — matched via the ticket's contact (contacts.customer_id) with an account-name fallback; unmatched tickets import anyway with customer_id: null" },
  { key: "desk-ticket-comments", label: "Desk Ticket Comments", desc: "Imports desk-ticket-comments.json into ticket_messages (author_type: staff, visibility from isPublic) — requires Desk Tickets imported first" },
  { key: "desk-threads", label: "Desk Threads", desc: "Imports desk-threads.json into ticket_messages (author_type: client or staff based on who wrote it, visibility from Zoho's visibility field) — requires Desk Tickets imported first" },
  { key: "desk-archived-tickets", label: "Desk Archived Tickets", desc: "Imports desk-archived-tickets.json into the tickets table (upsert on external_id) — same customer matching as Desk Tickets; source_meta.isArchived is set on every row; run after Desk Tickets import" },
  { key: "ticket-attachments", label: "Ticket Attachments", desc: "Downloads the real files referenced in ticket_messages.source_meta.attachments (Threads + Comments) into Supabase Storage — no export needed, reads directly from the database; requires Desk Threads/Ticket Comments imported first" },
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
  const [threadsExport, setThreadsExport] = useState<ThreadsExportState>({
    progress: null,
    done: null,
    error: null,
  });
  const [archivedTicketsExport, setArchivedTicketsExport] = useState<ArchivedTicketsExportState>({
    progress: null,
    warnings: [],
    done: null,
    error: null,
  });
  const [verifyUrl, setVerifyUrl] = useState("");
  const [verifyResult, setVerifyResult] = useState<VerifyAttachmentResult>({ state: "idle" });
  const [ticketAttachmentsImport, setTicketAttachmentsImport] = useState<TicketAttachmentsImportState>({
    progress: null,
    done: null,
    error: null,
  });

  async function handleVerifyAttachment() {
    if (!verifyUrl.trim()) return;
    setVerifyResult({ state: "running" });
    try {
      const res = await fetch("/api/admin/zoho-export/verify-attachment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: verifyUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok || "error" in data) {
        setVerifyResult({ state: "error", message: data.error ?? `HTTP ${res.status}` });
      } else {
        setVerifyResult({
          state: "done",
          ok: data.ok,
          status: data.status,
          contentType: data.contentType,
          contentLength: data.contentLength,
        });
      }
    } catch (e) {
      setVerifyResult({ state: "error", message: String(e) });
    }
  }

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

  async function handleThreadsExport() {
    if (anyRunning) return;
    setAnyRunning(true);
    setExportStates((s) => ({ ...s, "desk-threads": "running" }));
    setThreadsExport({ progress: null, done: null, error: null });

    try {
      const res = await fetch("/api/admin/zoho-export/desk-threads");
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
            threads?: unknown[];
            total_threads?: number;
            failed_ticket_ids?: string[];
          };

          if (evt.type === "progress") {
            setThreadsExport((s) => ({
              ...s,
              progress: { current: evt.current!, total: evt.total!, ticketId: evt.ticketId! },
            }));
          }
          if (evt.type === "threads" && evt.threads) {
            accumulated.push(...evt.threads);
          }
          if (evt.type === "done") {
            const blob = new Blob([JSON.stringify(accumulated, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "desk-threads.json";
            a.click();
            URL.revokeObjectURL(url);
            setThreadsExport((s) => ({
              ...s,
              done: { count: evt.total_threads!, failed: evt.failed_ticket_ids ?? [] },
              progress: null,
            }));
            setExportStates((s) => ({ ...s, "desk-threads": "done" }));
          }
        }
      }
    } catch (e) {
      setThreadsExport((s) => ({ ...s, error: String(e), progress: null }));
      setExportStates((s) => ({ ...s, "desk-threads": "error" }));
      console.error("[export/desk-threads]", e);
    } finally {
      setAnyRunning(false);
    }
  }

  async function handleArchivedTicketsExport() {
    if (anyRunning) return;
    setAnyRunning(true);
    setExportStates((s) => ({ ...s, "desk-archived-tickets": "running" }));
    setArchivedTicketsExport({ progress: null, warnings: [], done: null, error: null });

    const accumulated: unknown[] = [];
    let sawDone = false;
    let lastProgress: { current: number; total: number } | null = null;

    const download = (name: string) => {
      const blob = new Blob([JSON.stringify(accumulated, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    };

    try {
      const res = await fetch("/api/admin/zoho-export/desk-archived-tickets");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

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
            current?: number;
            total?: number;
            ticketCount?: number;
            tickets?: unknown[];
            total_tickets?: number;
            truncated_departments?: string[];
            failed_departments?: string[];
            department?: string;
            reason?: string;
            message?: string;
          };

          if (evt.type === "progress") {
            lastProgress = { current: evt.current!, total: evt.total! };
            setArchivedTicketsExport((s) => ({
              ...s,
              progress: { current: evt.current!, total: evt.total!, ticketCount: evt.ticketCount ?? 0 },
            }));
          }
          if (evt.type === "tickets" && evt.tickets) {
            accumulated.push(...evt.tickets);
          }
          if (evt.type === "warning") {
            const line = evt.message ?? `${evt.department ?? "?"}: ${evt.reason ?? "warning"}`;
            setArchivedTicketsExport((s) => ({ ...s, warnings: [...s.warnings, line] }));
          }
          if (evt.type === "error") {
            throw new Error(evt.message ?? "export error");
          }
          if (evt.type === "done") {
            sawDone = true;
            download("desk-archived-tickets.json");
            setArchivedTicketsExport((s) => ({
              ...s,
              done: {
                count: evt.total_tickets ?? accumulated.length,
                failedDepartments: evt.failed_departments ?? [],
                truncatedDepartments: evt.truncated_departments ?? [],
                partial: false,
              },
              progress: null,
            }));
            setExportStates((s) => ({ ...s, "desk-archived-tickets": "done" }));
          }
        }
      }

      if (!sawDone) {
        // stream ended without a `done` event — save what completed so the run isn't a total loss
        if (accumulated.length > 0) download("desk-archived-tickets.partial.json");
        setArchivedTicketsExport((s) => ({
          ...s,
          done:
            accumulated.length > 0
              ? { count: accumulated.length, failedDepartments: [], truncatedDepartments: [], partial: true }
              : null,
          error: lastProgress
            ? `Stream ended early after department ${lastProgress.current}/${lastProgress.total} — saved desk-archived-tickets.partial.json (${accumulated.length} tickets). Re-run to resume (restarts from department 1).`
            : "Stream ended before any data arrived — nothing saved.",
          progress: null,
        }));
        setExportStates((s) => ({ ...s, "desk-archived-tickets": "error" }));
      }
    } catch (e) {
      if (accumulated.length > 0) download("desk-archived-tickets.partial.json");
      setArchivedTicketsExport((s) => ({
        ...s,
        done:
          accumulated.length > 0
            ? { count: accumulated.length, failedDepartments: [], truncatedDepartments: [], partial: true }
            : null,
        error: `${String(e)}${
          accumulated.length > 0
            ? ` — saved ${accumulated.length} ticket(s) to desk-archived-tickets.partial.json; re-run to resume (restarts from department 1).`
            : ""
        }`,
        progress: null,
      }));
      setExportStates((s) => ({ ...s, "desk-archived-tickets": "error" }));
      console.error("[export/desk-archived-tickets]", e);
    } finally {
      setAnyRunning(false);
    }
  }

  async function handleTicketAttachmentsImport() {
    if (anyRunning) return;
    setAnyRunning(true);
    setImportStates((s) => ({ ...s, "ticket-attachments": { state: "running" } }));
    setTicketAttachmentsImport({ progress: null, done: null, error: null });

    try {
      const res = await fetch("/api/admin/zoho-import/ticket-attachments", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

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
            current?: number;
            total?: number;
            imported?: number;
            skipped?: number;
            errors?: string[];
          };

          if (evt.type === "progress") {
            setTicketAttachmentsImport((s) => ({
              ...s,
              progress: { current: evt.current!, total: evt.total! },
            }));
          }
          if (evt.type === "done") {
            setTicketAttachmentsImport((s) => ({
              ...s,
              done: { imported: evt.imported!, skipped: evt.skipped!, errors: evt.errors ?? [] },
              progress: null,
            }));
            setImportStates((s) => ({ ...s, "ticket-attachments": { state: "done" } }));
          }
        }
      }
    } catch (e) {
      setTicketAttachmentsImport((s) => ({ ...s, error: String(e), progress: null }));
      setImportStates((s) => ({ ...s, "ticket-attachments": { state: "error", errorMsg: String(e) } }));
      console.error("[import/ticket-attachments]", e);
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
          Comments → Desk Threads. Save each downloaded file to{" "}
          <code className="bg-amber-100 px-1 rounded text-[11px]">_from_zoho/</code> before running the
          corresponding import. Desk Ticket Comments are agent notes/replies only; Desk Threads are the
          actual customer↔agent conversation. <strong>Desk Archived Tickets</strong> (2025-01-01 onward)
          can run any time after Desk Accounts/Contacts; run its import after the Desk Tickets import.
        </div>
      </div>

      <SectionCard title="Verify Attachment URL (server-side fetch check)">
        <div className="space-y-2">
          <div className="text-[11px] text-slate-500">
            Paste a Desk attachment <code className="bg-slate-100 px-1 rounded">href</code> (e.g. from a
            `ticket_messages.source_meta.attachments[].href` value) to check whether the Hub&apos;s server
            can fetch it directly with the existing Zoho token — no file is downloaded or stored, only
            the response status is checked.
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={verifyUrl}
              onChange={(e) => setVerifyUrl(e.target.value)}
              placeholder="https://desk.zoho.com/supportapi/api/v1/tickets/.../attachments/.../content"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleVerifyAttachment}
              disabled={verifyResult.state === "running" || !verifyUrl.trim()}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {verifyResult.state === "running" ? "Checking…" : "Verify"}
            </button>
          </div>
          {verifyResult.state === "done" ? (
            <div className={cn("text-[12px]", verifyResult.ok ? "text-green-600" : "text-red-600")}>
              {verifyResult.ok ? "Reachable" : "Not reachable"} — HTTP {verifyResult.status}
              {verifyResult.contentType ? ` · ${verifyResult.contentType}` : ""}
              {verifyResult.contentLength ? ` · ${verifyResult.contentLength} bytes` : ""}
            </div>
          ) : null}
          {verifyResult.state === "error" ? (
            <div className="text-[12px] text-red-600">{verifyResult.message}</div>
          ) : null}
        </div>
      </SectionCard>

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

            if (key === "desk-threads") {
              const isRunning = exportStates["desk-threads"] === "running";
              const pct = threadsExport.progress
                ? Math.round((threadsExport.progress.current / threadsExport.progress.total) * 100)
                : 0;

              return (
                <div key="desk-threads" className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                        {label}
                        <StateIcon state={exportStates["desk-threads"] ?? "idle"} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                    </div>
                    {!isRunning && (
                      <button
                        onClick={handleThreadsExport}
                        disabled={anyRunning}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Download size={11} />
                        Export
                      </button>
                    )}
                  </div>
                  {isRunning && threadsExport.progress !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate">
                        Ticket {threadsExport.progress.current} of {threadsExport.progress.total}
                      </div>
                    </div>
                  ) : null}
                  {exportStates["desk-threads"] === "done" && threadsExport.done !== null ? (
                    <div className="mt-1 text-[11px] space-y-0.5">
                      <div className="text-green-600">{threadsExport.done.count} threads downloaded</div>
                      {threadsExport.done.failed.length > 0 ? (
                        <div className="text-amber-600 truncate" title={threadsExport.done.failed.join(", ")}>
                          {threadsExport.done.failed.length} ticket(s) failed after retries — re-run to retry
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {threadsExport.error !== null ? (
                    <div className="mt-1 text-[11px] text-red-600">{threadsExport.error}</div>
                  ) : null}
                </div>
              );
            }

            if (key === "desk-archived-tickets") {
              const isRunning = exportStates["desk-archived-tickets"] === "running";
              const pct = archivedTicketsExport.progress
                ? Math.round(
                    (archivedTicketsExport.progress.current /
                      Math.max(archivedTicketsExport.progress.total, 1)) *
                      100
                  )
                : 0;

              return (
                <div key="desk-archived-tickets" className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                        {label}
                        <StateIcon state={exportStates["desk-archived-tickets"] ?? "idle"} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                    </div>
                    {!isRunning && (
                      <button
                        onClick={handleArchivedTicketsExport}
                        disabled={anyRunning}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Download size={11} />
                        Export
                      </button>
                    )}
                  </div>
                  {isRunning && archivedTicketsExport.progress !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate">
                        Department {archivedTicketsExport.progress.current} of{" "}
                        {archivedTicketsExport.progress.total} · {archivedTicketsExport.progress.ticketCount}{" "}
                        tickets kept
                      </div>
                    </div>
                  ) : null}
                  {archivedTicketsExport.warnings.length > 0 ? (
                    <ul className="mt-1 text-[11px] text-amber-600 space-y-0.5">
                      {archivedTicketsExport.warnings.map((w, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {archivedTicketsExport.done !== null ? (
                    <div className="mt-1 text-[11px] space-y-0.5">
                      <div className={archivedTicketsExport.done.partial ? "text-amber-600" : "text-green-600"}>
                        {archivedTicketsExport.done.count} archived ticket(s){" "}
                        {archivedTicketsExport.done.partial ? "saved (partial file)" : "downloaded"}
                      </div>
                      {archivedTicketsExport.done.truncatedDepartments.length > 0 ? (
                        <div className="text-amber-600 truncate" title={archivedTicketsExport.done.truncatedDepartments.join(", ")}>
                          {archivedTicketsExport.done.truncatedDepartments.length} department(s) hit the 5,000 cap
                        </div>
                      ) : null}
                      {archivedTicketsExport.done.failedDepartments.length > 0 ? (
                        <div className="text-amber-600 truncate" title={archivedTicketsExport.done.failedDepartments.join(", ")}>
                          {archivedTicketsExport.done.failedDepartments.length} department(s) failed — re-run to retry
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {archivedTicketsExport.error !== null ? (
                    <div className="mt-1 text-[11px] text-red-600">{archivedTicketsExport.error}</div>
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

            if (key === "ticket-attachments") {
              const isRunning = st?.state === "running";
              const pct = ticketAttachmentsImport.progress
                ? Math.round(
                    (ticketAttachmentsImport.progress.current / Math.max(ticketAttachmentsImport.progress.total, 1)) * 100
                  )
                : 0;

              return (
                <div key="ticket-attachments" className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                        {label}
                        <StateIcon state={st?.state ?? "idle"} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                    </div>
                    <button
                      onClick={handleTicketAttachmentsImport}
                      disabled={anyRunning || isRunning}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Upload size={11} />
                      Import
                    </button>
                  </div>
                  {isRunning && ticketAttachmentsImport.progress !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate">
                        File {ticketAttachmentsImport.progress.current} of {ticketAttachmentsImport.progress.total}
                      </div>
                    </div>
                  ) : null}
                  {st?.state === "done" && ticketAttachmentsImport.done !== null ? (
                    <div className="mt-1 text-[11px] space-y-0.5">
                      <div className="text-slate-600">
                        <span className="font-semibold text-green-700">{ticketAttachmentsImport.done.imported}</span> imported ·{" "}
                        <span className="font-semibold text-slate-500">{ticketAttachmentsImport.done.skipped}</span> skipped (already stored)
                      </div>
                      {ticketAttachmentsImport.done.errors.length > 0 ? (
                        <div className="text-red-600 truncate" title={ticketAttachmentsImport.done.errors.join(", ")}>
                          {ticketAttachmentsImport.done.errors.length} error(s)
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {ticketAttachmentsImport.error !== null ? (
                    <div className="mt-1 text-[11px] text-red-600">{ticketAttachmentsImport.error}</div>
                  ) : null}
                </div>
              );
            }

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
