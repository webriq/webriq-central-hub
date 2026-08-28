"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
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

interface DeskTicketsExportState {
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

// Shared shape for the two archived-ticket conversation exports (threads + comments, task
// 332) — both stream progress per ticket and fall back to a .partial.json download if the
// SSE stream dies before `done`.
interface ArchivedConvExportState {
  progress: { current: number; total: number } | null;
  done: { count: number; failed: string[]; partial: boolean } | null;
  error: string | null;
}

type VerifyAttachmentResult =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; ok: boolean; status: number; contentType: string | null; contentLength: string | null }
  | { state: "error"; message: string };

// Archived-ticket custom-field (`cf`) backfill (task 334) — SSE-streamed one-shot that
// grafts Business Name / StackShift Site onto archived tickets imported before the export
// learned to enrich `cf`.
interface ArchivedCfBackfillState {
  running: boolean;
  progress: { current: number; total: number; updated: number; failed: number } | null;
  done: { scanned: number; updated: number; dryRun: boolean; failed: Array<{ ticketNumber: number | null; reason: string }> } | null;
  error: string | null;
}

interface TicketAttachmentsImportState {
  progress: { current: number; total: number } | null;
  done: { imported: number; skipped: number; errors: string[] } | null;
  error: string | null;
}

const EXPORT_LEVELS = [
  { key: "desk-accounts", label: "Desk Accounts", desc: "All Zoho Desk accounts (companies) — requires the Desk.accounts.READ OAuth scope; export before Desk Contacts for account-name matching" },
  { key: "desk-contacts", label: "Desk Contacts", desc: "All Zoho Desk contacts — can run independently, but export Desk Accounts first for customer matching" },
  { key: "desk-agents", label: "Desk Agents", desc: "All Zoho Desk agents — no new OAuth scope needed (Desk.agents.READ already granted); used to resolve ticket Owner names" },
  { key: "desk-tickets", label: "Desk Tickets", desc: "All Zoho Desk tickets + per-ticket custom-field enrichment (White Label, StackShift Site — the \"Additional Information\" panel) via a Get Ticket call each, since List Tickets never returns cf. ~1 call/ticket, runs several minutes. No new OAuth scope (Desk.tickets.READ already granted)" },
  { key: "desk-ticket-comments", label: "Desk Ticket Comments", desc: "Agent notes/replies per ticket — not the full customer conversation, see Desk Threads below — requires desk-tickets.json exported first" },
  { key: "desk-threads", label: "Desk Threads", desc: "The actual customer↔agent conversation per ticket (emails, forum replies, etc.) — requires desk-tickets.json exported first" },
  { key: "desk-archived-tickets", label: "Desk Archived Tickets", desc: "Archived tickets created 2025-01-01 onward — a separate endpoint the live Desk Tickets export skips entirely; loops every department, then enriches each ticket's cf (Business Name / StackShift Site) via a Get Ticket call (task 334) — roughly doubles the call count, runs several minutes. Warns if a department's 2025+ set exceeds Zoho's 5,000/department API cap or a department fails (others still export). Needs the Desk.search.READ scope" },
  { key: "desk-archived-threads", label: "Desk Archived Threads", desc: "The customer↔agent conversation for every archived ticket — the live Desk Threads export skips archived tickets entirely. Requires desk-archived-tickets.json exported first; run GET /api/admin/zoho-export/probe-archived-conversation once first to confirm Zoho serves threads for archived ticket ids" },
  { key: "desk-archived-ticket-comments", label: "Desk Archived Ticket Comments", desc: "Agent notes/replies for every archived ticket — the live Desk Ticket Comments export skips archived tickets. Requires desk-archived-tickets.json exported first" },
  { key: "desk-kb", label: "Desk Knowledge Base", desc: "All KB articles (Published + drafts/unpublished/expired via permission=all) with a per-article Get Article pass for the HTML body, plus root categories. Writes desk-kb.json ({ articles, categories }). Requires the Desk.articles.READ (+ Desk.settings.READ for categories) OAuth scope — regenerate ZOHO_REFRESH_TOKEN, see env.example" },
] as const;

const IMPORT_LEVELS = [
  { key: "desk-accounts", label: "Desk Accounts", desc: "Imports desk-accounts.json into the accounts table (upsert on external_id), soft-matched to customers by normalized account name; unmatched accounts import anyway with customer_id: null. Surfaced under Desk → Contacts → Accounts tab (task 335)" },
  { key: "desk-contacts", label: "Desk Contacts", desc: "Imports desk-contacts.json into the contacts table, matched to customers via desk-accounts.json (if present) by normalized account name" },
  { key: "desk-agents", label: "Desk Agents", desc: "Imports desk-agents.json into the desk_agents table — no customer matching, used only to resolve ticket Owner names" },
  { key: "desk-tickets", label: "Desk Tickets", desc: "Imports desk-tickets.json into the tickets table — matched via the ticket's contact (contacts.customer_id) with an account-name fallback; unmatched tickets import anyway with customer_id: null. Custom fields land in source_meta.cf (verbatim) with whiteLabel / stackShiftSite promoted to named source_meta keys" },
  { key: "desk-ticket-comments", label: "Desk Ticket Comments", desc: "Imports desk-ticket-comments.json into ticket_messages (author_type: staff, visibility from isPublic) — requires Desk Tickets imported first" },
  { key: "desk-threads", label: "Desk Threads", desc: "Imports desk-threads.json into ticket_messages (author_type: client or staff based on who wrote it, visibility from Zoho's visibility field) — requires Desk Tickets imported first" },
  { key: "desk-archived-tickets", label: "Desk Archived Tickets", desc: "Imports desk-archived-tickets.json into the tickets table (upsert on external_id) — same customer matching as Desk Tickets; source_meta.isArchived is set on every row; run after Desk Tickets import" },
  { key: "desk-archived-threads", label: "Desk Archived Threads", desc: "Imports desk-archived-threads.json into ticket_messages via the same helper as Desk Threads — archived tickets link by tickets.external_id; run after Desk Archived Tickets import" },
  { key: "desk-archived-ticket-comments", label: "Desk Archived Ticket Comments", desc: "Imports desk-archived-ticket-comments.json into ticket_messages via the same helper as Desk Ticket Comments; run after Desk Archived Tickets import" },
  { key: "ticket-attachments", label: "Ticket Attachments", desc: "Downloads the real files referenced in ticket_messages.source_meta.attachments (Threads + Comments, live + archived) into Supabase Storage — no export needed, reads directly from the database; re-run after any Threads/Comments import (incl. the archived ones) to pull newly-referenced files" },
  { key: "desk-kb", label: "Desk Knowledge Base", desc: "Imports desk-kb.json into the kb_articles table (upsert on external_id) — full article HTML in kb_articles.answer, no customer matching" },
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
  const [deskTicketsExport, setDeskTicketsExport] = useState<DeskTicketsExportState>({
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
  const [archivedThreadsExport, setArchivedThreadsExport] = useState<ArchivedConvExportState>({
    progress: null,
    done: null,
    error: null,
  });
  const [archivedCommentsExport, setArchivedCommentsExport] = useState<ArchivedConvExportState>({
    progress: null,
    done: null,
    error: null,
  });
  const [verifyUrl, setVerifyUrl] = useState("");
  const [verifyResult, setVerifyResult] = useState<VerifyAttachmentResult>({ state: "idle" });
  const [cfBackfillDryRun, setCfBackfillDryRun] = useState(true);
  const [cfBackfill, setCfBackfill] = useState<ArchivedCfBackfillState>({
    running: false,
    progress: null,
    done: null,
    error: null,
  });
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

  async function handleArchivedCfBackfill() {
    if (anyRunning || cfBackfill.running) return;
    setAnyRunning(true);
    setCfBackfill({ running: true, progress: null, done: null, error: null });

    try {
      const qs = cfBackfillDryRun ? "?dryRun=1" : "";
      const res = await fetch(`/api/admin/desk/backfill-archived-ticket-cf${qs}`, { method: "POST" });
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
            updated?: number;
            failed?: number | Array<{ ticketNumber: number | null; reason: string }>;
            scanned?: number;
            dryRun?: boolean;
          };

          if (evt.type === "progress") {
            setCfBackfill((s) => ({
              ...s,
              progress: {
                current: evt.current!,
                total: evt.total!,
                updated: evt.updated ?? 0,
                failed: typeof evt.failed === "number" ? evt.failed : 0,
              },
            }));
          }
          if (evt.type === "done") {
            setCfBackfill((s) => ({
              ...s,
              running: false,
              progress: null,
              done: {
                scanned: evt.scanned ?? 0,
                updated: evt.updated ?? 0,
                dryRun: evt.dryRun ?? false,
                failed: Array.isArray(evt.failed) ? evt.failed : [],
              },
            }));
          }
        }
      }
      setCfBackfill((s) => (s.running ? { ...s, running: false } : s));
    } catch (e) {
      setCfBackfill((s) => ({ ...s, running: false, error: String(e), progress: null }));
      console.error("[backfill-archived-ticket-cf]", e);
    } finally {
      setAnyRunning(false);
    }
  }

  async function handleExport(level: string) {
    if (anyRunning) return;
    setAnyRunning(true);
    setExportStates((s) => ({ ...s, [level]: "running" }));
    try {
      const res = await fetch(`/api/admin/zoho-export/${level}`);
      if (!res.ok) {
        // Error responses are JSON ({ error }); the success path is a file attachment.
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
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

  async function handleDeskTicketsExport() {
    if (anyRunning) return;
    setAnyRunning(true);
    setExportStates((s) => ({ ...s, "desk-tickets": "running" }));
    setDeskTicketsExport({ progress: null, done: null, error: null });

    const accumulated: unknown[] = [];
    let sawDone = false;

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
      const res = await fetch("/api/admin/zoho-export/desk-tickets");
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
            ticketId?: string;
            tickets?: unknown[];
            failed_ticket_ids?: string[];
            message?: string;
          };

          if (evt.type === "progress") {
            setDeskTicketsExport((s) => ({
              ...s,
              progress: { current: evt.current!, total: evt.total!, ticketId: evt.ticketId ?? "" },
            }));
          }
          if (evt.type === "tickets" && evt.tickets) {
            accumulated.push(...evt.tickets);
          }
          if (evt.type === "error") {
            throw new Error(evt.message ?? "export error");
          }
          if (evt.type === "done") {
            sawDone = true;
            download("desk-tickets.json");
            setDeskTicketsExport((s) => ({
              ...s,
              done: { count: evt.total ?? accumulated.length, failed: evt.failed_ticket_ids ?? [] },
              progress: null,
            }));
            setExportStates((s) => ({ ...s, "desk-tickets": "done" }));
          }
        }
      }

      if (!sawDone) {
        // stream ended without a `done` event — save what completed so the run isn't a total loss
        if (accumulated.length > 0) download("desk-tickets.partial.json");
        setDeskTicketsExport((s) => ({
          ...s,
          error:
            accumulated.length > 0
              ? `Stream ended early — saved desk-tickets.partial.json (${accumulated.length} of ? tickets). Re-run to restart.`
              : "Stream ended before any data arrived — nothing saved.",
          progress: null,
        }));
        setExportStates((s) => ({ ...s, "desk-tickets": "error" }));
      }
    } catch (e) {
      if (accumulated.length > 0) download("desk-tickets.partial.json");
      setDeskTicketsExport((s) => ({
        ...s,
        error: `${String(e)}${
          accumulated.length > 0
            ? ` — saved ${accumulated.length} ticket(s) to desk-tickets.partial.json; re-run to restart.`
            : ""
        }`,
        progress: null,
      }));
      setExportStates((s) => ({ ...s, "desk-tickets": "error" }));
      console.error("[export/desk-tickets]", e);
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

  // Generic SSE handler for the two archived-ticket conversation exports (task 332). Both
  // stream identical `progress` / `<batchEvent>` / `done` frames; only the endpoint, the
  // batch-event name, the `done` count field and the download filename differ. Accumulates
  // batches locally and, if the stream ends without a `done` event (dev server killed,
  // connection dropped), still downloads a .partial.json so a long run is never a total loss.
  async function runArchivedConvExport(cfg: {
    exportKey: "desk-archived-threads" | "desk-archived-ticket-comments";
    batchEvent: "threads" | "comments";
    totalField: "total_threads" | "total_comments";
    filename: string;
    setState: Dispatch<SetStateAction<ArchivedConvExportState>>;
  }) {
    if (anyRunning) return;
    setAnyRunning(true);
    setExportStates((s) => ({ ...s, [cfg.exportKey]: "running" }));
    cfg.setState({ progress: null, done: null, error: null });

    const accumulated: unknown[] = [];
    let sawDone = false;
    let lastProgress: { current: number; total: number } | null = null;
    const partialName = cfg.filename.replace(/\.json$/, ".partial.json");

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
      const res = await fetch(`/api/admin/zoho-export/${cfg.exportKey}`);
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
            threads?: unknown[];
            comments?: unknown[];
            total_threads?: number;
            total_comments?: number;
            failed_ticket_ids?: string[];
            message?: string;
          };

          if (evt.type === "progress") {
            lastProgress = { current: evt.current!, total: evt.total! };
            cfg.setState((s) => ({ ...s, progress: { current: evt.current!, total: evt.total! } }));
          }
          if (evt.type === cfg.batchEvent) {
            const batch = cfg.batchEvent === "threads" ? evt.threads : evt.comments;
            if (batch) accumulated.push(...batch);
          }
          if (evt.type === "error") {
            throw new Error(evt.message ?? "export error");
          }
          if (evt.type === "done") {
            sawDone = true;
            download(cfg.filename);
            const count =
              (cfg.totalField === "total_threads" ? evt.total_threads : evt.total_comments) ??
              accumulated.length;
            cfg.setState((s) => ({
              ...s,
              done: { count, failed: evt.failed_ticket_ids ?? [], partial: false },
              progress: null,
            }));
            setExportStates((s) => ({ ...s, [cfg.exportKey]: "done" }));
          }
        }
      }

      if (!sawDone) {
        if (accumulated.length > 0) download(partialName);
        cfg.setState((s) => ({
          ...s,
          done:
            accumulated.length > 0
              ? { count: accumulated.length, failed: [], partial: true }
              : null,
          error: lastProgress
            ? `Stream ended early after ticket ${lastProgress.current}/${lastProgress.total} — saved ${partialName} (${accumulated.length} rows). Re-run to restart from ticket 1.`
            : "Stream ended before any data arrived — nothing saved.",
          progress: null,
        }));
        setExportStates((s) => ({ ...s, [cfg.exportKey]: "error" }));
      }
    } catch (e) {
      if (accumulated.length > 0) download(partialName);
      cfg.setState((s) => ({
        ...s,
        done:
          accumulated.length > 0
            ? { count: accumulated.length, failed: [], partial: true }
            : null,
        error: `${String(e)}${
          accumulated.length > 0
            ? ` — saved ${accumulated.length} row(s) to ${partialName}; re-run to restart from ticket 1.`
            : ""
        }`,
        progress: null,
      }));
      setExportStates((s) => ({ ...s, [cfg.exportKey]: "error" }));
      console.error(`[export/${cfg.exportKey}]`, e);
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
          <strong> Desk Archived Threads / Ticket Comments</strong> need desk-archived-tickets.json
          exported first — run{" "}
          <code className="bg-amber-100 px-1 rounded text-[11px]">GET /api/admin/zoho-export/probe-archived-conversation</code>{" "}
          once first to confirm Zoho serves those endpoints for archived ids; import them after the Desk
          Archived Tickets import, then <strong>re-run Ticket Attachments</strong> last to pull the
          archived conversation&apos;s files. For archived tickets already imported without Business
          Name / StackShift Site, use <strong>Backfill Archived Ticket Custom Fields</strong> above
          (dry-run first).
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

      <SectionCard title="Backfill Archived Ticket Custom Fields (Business Name / StackShift Site)">
        <div className="space-y-2">
          <div className="text-[11px] text-slate-500">
            Archived tickets imported before the export learned to enrich <code className="bg-slate-100 px-1 rounded">cf</code>{" "}
            (task 325) have no Business Name / StackShift Site. This reads each archived ticket
            already in the DB, calls Zoho <code className="bg-slate-100 px-1 rounded">GET /tickets/&#123;id&#125;</code>, and
            patches <code className="bg-slate-100 px-1 rounded">source_meta</code> in place. ~1 call/ticket with rolling-throttle
            pacing — runs several minutes. Idempotent (skips rows that already have{" "}
            <code className="bg-slate-100 px-1 rounded">cf</code>). Leave <strong>Dry run</strong> checked first to confirm Zoho
            returns <code className="bg-slate-100 px-1 rounded">cf</code> for archived ids.
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[12px] text-slate-700 select-none">
              <input
                type="checkbox"
                checked={cfBackfillDryRun}
                onChange={(e) => setCfBackfillDryRun(e.target.checked)}
                disabled={cfBackfill.running}
                className="rounded border-slate-300"
              />
              Dry run (write nothing)
            </label>
            <button
              onClick={handleArchivedCfBackfill}
              disabled={anyRunning || cfBackfill.running}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {cfBackfill.running ? "Running…" : cfBackfillDryRun ? "Dry run" : "Run backfill"}
            </button>
          </div>
          {cfBackfill.running && cfBackfill.progress !== null ? (
            <div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${Math.round((cfBackfill.progress.current / Math.max(cfBackfill.progress.total, 1)) * 100)}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-500 mt-1 truncate">
                Ticket {cfBackfill.progress.current} of {cfBackfill.progress.total} · {cfBackfill.progress.updated} updated
                {cfBackfill.progress.failed > 0 ? ` · ${cfBackfill.progress.failed} failed` : ""}
              </div>
            </div>
          ) : null}
          {cfBackfill.done !== null ? (
            <div className="text-[12px] space-y-0.5">
              <div className="text-green-600">
                {cfBackfill.done.dryRun ? "Dry run — " : ""}
                {cfBackfill.done.updated} of {cfBackfill.done.scanned} archived ticket(s){" "}
                {cfBackfill.done.dryRun ? "would be updated" : "updated"}
              </div>
              {cfBackfill.done.failed.length > 0 ? (
                <div
                  className="text-amber-600 truncate"
                  title={cfBackfill.done.failed.map((f) => `#${f.ticketNumber}: ${f.reason}`).join("\n")}
                >
                  {cfBackfill.done.failed.length} failed — re-run to retry
                </div>
              ) : null}
            </div>
          ) : null}
          {cfBackfill.error !== null ? (
            <div className="text-[12px] text-red-600">{cfBackfill.error}</div>
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

            if (key === "desk-tickets") {
              const isRunning = exportStates["desk-tickets"] === "running";
              const pct = deskTicketsExport.progress
                ? Math.round((deskTicketsExport.progress.current / deskTicketsExport.progress.total) * 100)
                : 0;

              return (
                <div key="desk-tickets" className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                        {label}
                        <StateIcon state={exportStates["desk-tickets"] ?? "idle"} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                    </div>
                    {!isRunning && (
                      <button
                        onClick={handleDeskTicketsExport}
                        disabled={anyRunning}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Download size={11} />
                        Export
                      </button>
                    )}
                  </div>
                  {isRunning && deskTicketsExport.progress !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate">
                        Ticket {deskTicketsExport.progress.current} of {deskTicketsExport.progress.total}
                      </div>
                    </div>
                  ) : null}
                  {exportStates["desk-tickets"] === "done" && deskTicketsExport.done !== null ? (
                    <div className="mt-1 text-[11px] space-y-0.5">
                      <div className="text-green-600">{deskTicketsExport.done.count} tickets downloaded</div>
                      {deskTicketsExport.done.failed.length > 0 ? (
                        <div className="text-amber-600 truncate" title={deskTicketsExport.done.failed.join(", ")}>
                          {deskTicketsExport.done.failed.length} ticket(s) had no custom fields fetched after retries — re-run to retry
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {deskTicketsExport.error !== null ? (
                    <div className="mt-1 text-[11px] text-red-600">{deskTicketsExport.error}</div>
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

            if (key === "desk-archived-threads" || key === "desk-archived-ticket-comments") {
              const isThreads = key === "desk-archived-threads";
              const state = isThreads ? archivedThreadsExport : archivedCommentsExport;
              const noun = isThreads ? "threads" : "comments";
              const isRunning = exportStates[key] === "running";
              const pct = state.progress
                ? Math.round((state.progress.current / Math.max(state.progress.total, 1)) * 100)
                : 0;

              return (
                <div key={key} className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                        {label}
                        <StateIcon state={exportStates[key] ?? "idle"} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                    </div>
                    {!isRunning && (
                      <button
                        onClick={() =>
                          runArchivedConvExport(
                            isThreads
                              ? {
                                  exportKey: "desk-archived-threads",
                                  batchEvent: "threads",
                                  totalField: "total_threads",
                                  filename: "desk-archived-threads.json",
                                  setState: setArchivedThreadsExport,
                                }
                              : {
                                  exportKey: "desk-archived-ticket-comments",
                                  batchEvent: "comments",
                                  totalField: "total_comments",
                                  filename: "desk-archived-ticket-comments.json",
                                  setState: setArchivedCommentsExport,
                                }
                          )
                        }
                        disabled={anyRunning}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Download size={11} />
                        Export
                      </button>
                    )}
                  </div>
                  {isRunning && state.progress !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate">
                        Ticket {state.progress.current} of {state.progress.total}
                      </div>
                    </div>
                  ) : null}
                  {state.done !== null ? (
                    <div className="mt-1 text-[11px] space-y-0.5">
                      <div className={state.done.partial ? "text-amber-600" : "text-green-600"}>
                        {state.done.count} {noun} {state.done.partial ? "saved (partial file)" : "downloaded"}
                      </div>
                      {state.done.failed.length > 0 ? (
                        <div className="text-amber-600 truncate" title={state.done.failed.join(", ")}>
                          {state.done.failed.length} ticket(s) failed after retries — re-run to retry
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {state.error !== null ? (
                    <div className="mt-1 text-[11px] text-red-600">{state.error}</div>
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
