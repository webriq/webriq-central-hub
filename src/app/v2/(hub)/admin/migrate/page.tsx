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

interface IssuesExportState {
  from: string;
  to: string;
  since: string;
  progress: { current: number; total: number; project: string } | null;
  done: { count: number; failed: string[] } | null;
  error: string | null;
}

interface CommentsExportState {
  progress: { current: number; total: number; taskId: string } | null;
  done: { count: number } | null;
  error: string | null;
}

interface IssueCommentsExportState {
  progress: { current: number; total: number; issueId: string } | null;
  done: { count: number; failed: string[] } | null;
  error: string | null;
}

interface TimelogsExportState {
  from: string;
  to: string;
  progress: { current: number; total: number; project: string } | null;
  done: { count: number; failed: string[] } | null;
  error: string | null;
}

interface IssueTimelogsExportState {
  from: string;
  to: string;
  progress: { current: number; total: number; project: string } | null;
  done: { count: number; failed: string[] } | null;
  error: string | null;
}

interface TimelogsImportState {
  progress: { current: number; total: number } | null;
  done: { imported: number; skipped: number; errors: string[] } | null;
  error: string | null;
}

interface IssueTimelogsImportState {
  progress: { current: number; total: number } | null;
  done: { imported: number; skipped: number; errors: string[] } | null;
  error: string | null;
}

interface AttachmentMetaExportState {
  from: string;
  to: string;
  progress: { current: number; total: number } | null;
  done: { count: number; failed: string[] } | null;
  error: string | null;
}

interface IssueAttachmentMetaExportState {
  from: string;
  to: string;
  progress: { current: number; total: number } | null;
  done: { count: number; failed: string[] } | null;
  error: string | null;
}

interface AttachmentsImportState {
  progress: { current: number; total: number } | null;
  done: { imported: number; skipped: number; errors: string[] } | null;
  error: string | null;
}

interface IssueAttachmentsImportState {
  progress: { current: number; total: number } | null;
  done: { imported: number; skipped: number; errors: string[] } | null;
  error: string | null;
}

const EXPORT_LEVELS = [
  { key: "users", label: "Users", desc: "All Zoho portal users — can run independently" },
  { key: "milestones", label: "Milestones", desc: "All milestones across every project — export before Tasklists" },
  { key: "tasklists", label: "Tasklists", desc: "All tasklists across every project" },
  { key: "tasks", label: "Tasks", desc: "All tasks (paginated per project)" },
  { key: "issues", label: "Issues", desc: "All issues/bugs (paginated per project) — can run independently" },
  { key: "comments", label: "Comments", desc: "All task comments — requires tasks.json exported first" },
  { key: "issue-comments", label: "Issue Comments", desc: "All issue comments — requires issues-*.json exported first" },
  { key: "timelogs", label: "Time Logs", desc: "All time log entries per project" },
  { key: "issue-timelogs", label: "Issue Time Logs", desc: "All time logged against issues (paginated per issue, all 1049 queried — no pre-filter available) — requires Issues exported first" },
  { key: "attachment-meta", label: "Attachment Metadata", desc: "Attachment list per task — requires tasks.json exported first" },
  { key: "issue-attachment-meta", label: "Issue Attachment Metadata", desc: "Attachment list per issue (entity_type: bug) — requires issues-*.json exported first" },
] as const;

const IMPORT_LEVELS = [
  { key: "users", label: "Users", desc: "Syncs Zoho portal users to hub_users and profiles — can run independently" },
  { key: "customers", label: "Customers", desc: "Creates Hub customer records from unique names in projects.json — run first" },
  { key: "projects", label: "Projects", desc: "Creates or upserts Hub project rows from projects.json — requires Customers imported first" },
  { key: "milestones", label: "Milestones", desc: "Creates Hub milestone records from milestones.json — run before Tasklists" },
  { key: "tasklists", label: "Tasklists", desc: "Creates Hub tasklist records from tasklists.json" },
  { key: "tasks", label: "Tasks", desc: "Creates Hub task records from tasks.json" },
  { key: "issues", label: "Issues", desc: "Creates Hub issue records from issues-*.json — requires Projects imported first" },
  { key: "comments", label: "Comments", desc: "Imports task comments from comments.json" },
  { key: "issue-comments", label: "Issue Comments", desc: "Imports issue comments from issue-comments.json — requires Issues imported first" },
  { key: "timelogs", label: "Time Logs", desc: "Imports time log entries from timelogs.json" },
  { key: "issue-timelogs", label: "Issue Time Logs", desc: "Imports time log entries from issue-timelogs-*.json — requires Issues imported first" },
  { key: "attachments", label: "Attachments", desc: "Select the files you manually downloaded from each attachment's download_url (not the attachment-meta-*.json files) — matches by filename and uploads to Supabase Storage" },
  { key: "issue-attachments", label: "Issue Attachments", desc: "Select the files you manually downloaded from each issue attachment's download_url — matches by filename+size and uploads to Supabase Storage" },
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
  const [issuesExport, setIssuesExport] = useState<IssuesExportState>({
    from: "0",
    to: "",
    since: "2025-01-01",
    progress: null,
    done: null,
    error: null,
  });
  const [commentsExport, setCommentsExport] = useState<CommentsExportState>({
    progress: null,
    done: null,
    error: null,
  });
  const [issueCommentsExport, setIssueCommentsExport] = useState<IssueCommentsExportState>({
    progress: null,
    done: null,
    error: null,
  });
  const [timelogsExport, setTimelogsExport] = useState<TimelogsExportState>({
    from: "0",
    to: "25",
    progress: null,
    done: null,
    error: null,
  });
  const [issueTimelogsExport, setIssueTimelogsExport] = useState<IssueTimelogsExportState>({
    from: "0",
    to: "",
    progress: null,
    done: null,
    error: null,
  });
  const [timelogsImport, setTimelogsImport] = useState<TimelogsImportState>({
    progress: null,
    done: null,
    error: null,
  });
  const [issueTimelogsImport, setIssueTimelogsImport] = useState<IssueTimelogsImportState>({
    progress: null,
    done: null,
    error: null,
  });
  const [attachmentMetaExport, setAttachmentMetaExport] = useState<AttachmentMetaExportState>({
    from: "0",
    to: "1000",
    progress: null,
    done: null,
    error: null,
  });
  const [issueAttachmentMetaExport, setIssueAttachmentMetaExport] = useState<IssueAttachmentMetaExportState>({
    from: "0",
    to: "100",
    progress: null,
    done: null,
    error: null,
  });
  const [attachmentsImport, setAttachmentsImport] = useState<AttachmentsImportState>({
    progress: null,
    done: null,
    error: null,
  });
  const [attachmentsFiles, setAttachmentsFiles] = useState<File[]>([]);
  const [issueAttachmentsImport, setIssueAttachmentsImport] = useState<IssueAttachmentsImportState>({
    progress: null,
    done: null,
    error: null,
  });
  const [issueAttachmentsFiles, setIssueAttachmentsFiles] = useState<File[]>([]);

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

  async function handleIssuesExport() {
    if (anyRunning) return;
    setAnyRunning(true);
    setExportStates((s) => ({ ...s, issues: "running" }));
    setIssuesExport((s) => ({ ...s, progress: null, done: null, error: null }));

    try {
      const qp = new URLSearchParams({ from: issuesExport.from || "0" });
      if (issuesExport.to) qp.set("to", issuesExport.to);
      if (issuesExport.since) qp.set("since", issuesExport.since);

      const res = await fetch(`/api/admin/zoho-export/issues?${qp}`);
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
            issues?: unknown[];
            total_issues?: number;
            failed_project_ids?: string[];
          };

          if (evt.type === "progress") {
            setIssuesExport((s) => ({
              ...s,
              progress: { current: evt.current!, total: evt.total!, project: evt.project! },
            }));
          }
          if (evt.type === "issues" && evt.issues) {
            accumulated.push(...evt.issues);
          }
          if (evt.type === "done") {
            const blob = new Blob([JSON.stringify(accumulated, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const sinceYear = issuesExport.since ? issuesExport.since.split("-")[0] : "all";
            const toLabel = issuesExport.to || "end";
            a.download = `issues-${issuesExport.from || "0"}-${toLabel}-${sinceYear}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setIssuesExport((s) => ({
              ...s,
              done: { count: evt.total_issues!, failed: evt.failed_project_ids ?? [] },
              progress: null,
            }));
            setExportStates((s) => ({ ...s, issues: "done" }));
          }
        }
      }
    } catch (e) {
      setIssuesExport((s) => ({ ...s, error: String(e), progress: null }));
      setExportStates((s) => ({ ...s, issues: "error" }));
      console.error("[export/issues]", e);
    } finally {
      setAnyRunning(false);
    }
  }

  async function handleCommentsExport() {
    if (anyRunning) return;
    setAnyRunning(true);
    setExportStates((s) => ({ ...s, comments: "running" }));
    setCommentsExport({ progress: null, done: null, error: null });

    try {
      const res = await fetch("/api/admin/zoho-export/comments");
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
            taskId?: string;
            comments?: unknown[];
            total_comments?: number;
          };

          if (evt.type === "progress") {
            setCommentsExport((s) => ({
              ...s,
              progress: { current: evt.current!, total: evt.total!, taskId: evt.taskId! },
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
            a.download = "comments.json";
            a.click();
            URL.revokeObjectURL(url);
            setCommentsExport((s) => ({ ...s, done: { count: evt.total_comments! }, progress: null }));
            setExportStates((s) => ({ ...s, comments: "done" }));
          }
        }
      }
    } catch (e) {
      setCommentsExport((s) => ({ ...s, error: String(e), progress: null }));
      setExportStates((s) => ({ ...s, comments: "error" }));
      console.error("[export/comments]", e);
    } finally {
      setAnyRunning(false);
    }
  }

  async function handleIssueCommentsExport() {
    if (anyRunning) return;
    setAnyRunning(true);
    setExportStates((s) => ({ ...s, "issue-comments": "running" }));
    setIssueCommentsExport({ progress: null, done: null, error: null });

    try {
      const res = await fetch("/api/admin/zoho-export/issue-comments");
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
            issueId?: string;
            comments?: unknown[];
            total_comments?: number;
            failed_issue_ids?: string[];
          };

          if (evt.type === "progress") {
            setIssueCommentsExport((s) => ({
              ...s,
              progress: { current: evt.current!, total: evt.total!, issueId: evt.issueId! },
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
            a.download = "issue-comments.json";
            a.click();
            URL.revokeObjectURL(url);
            setIssueCommentsExport((s) => ({
              ...s,
              done: { count: evt.total_comments!, failed: evt.failed_issue_ids ?? [] },
              progress: null,
            }));
            setExportStates((s) => ({ ...s, "issue-comments": "done" }));
          }
        }
      }
    } catch (e) {
      setIssueCommentsExport((s) => ({ ...s, error: String(e), progress: null }));
      setExportStates((s) => ({ ...s, "issue-comments": "error" }));
      console.error("[export/issue-comments]", e);
    } finally {
      setAnyRunning(false);
    }
  }

  async function handleTimelogsExport() {
    if (anyRunning) return;
    setAnyRunning(true);
    setExportStates((s) => ({ ...s, timelogs: "running" }));
    setTimelogsExport((s) => ({ ...s, progress: null, done: null, error: null }));

    try {
      const qp = new URLSearchParams({ from: timelogsExport.from || "0" });
      if (timelogsExport.to) qp.set("to", timelogsExport.to);
      const res = await fetch(`/api/admin/zoho-export/timelogs?${qp}`);
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
            logs?: unknown[];
            total_logs?: number;
            failed_windows?: string[];
          };

          if (evt.type === "progress") {
            setTimelogsExport((s) => ({
              ...s,
              progress: { current: evt.current!, total: evt.total!, project: evt.project! },
            }));
          }
          if (evt.type === "timelogs" && evt.logs) {
            accumulated.push(...evt.logs);
          }
          if (evt.type === "done") {
            const blob = new Blob([JSON.stringify(accumulated, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const toLabel = timelogsExport.to || "end";
            a.download = `timelogs-${timelogsExport.from || "0"}-${toLabel}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setTimelogsExport((s) => ({
              ...s,
              done: { count: evt.total_logs!, failed: evt.failed_windows ?? [] },
              progress: null,
            }));
            setExportStates((s) => ({ ...s, timelogs: "done" }));
          }
        }
      }
    } catch (e) {
      setTimelogsExport((s) => ({ ...s, error: String(e), progress: null }));
      setExportStates((s) => ({ ...s, timelogs: "error" }));
      console.error("[export/timelogs]", e);
    } finally {
      setAnyRunning(false);
    }
  }

  async function handleIssueTimelogsExport() {
    if (anyRunning) return;
    setAnyRunning(true);
    setExportStates((s) => ({ ...s, "issue-timelogs": "running" }));
    setIssueTimelogsExport((s) => ({ ...s, progress: null, done: null, error: null }));

    try {
      const qp = new URLSearchParams({ from: issueTimelogsExport.from || "0" });
      if (issueTimelogsExport.to) qp.set("to", issueTimelogsExport.to);
      const res = await fetch(`/api/admin/zoho-export/issue-timelogs?${qp}`);
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
            logs?: unknown[];
            total_logs?: number;
            failed_windows?: string[];
          };

          if (evt.type === "progress") {
            setIssueTimelogsExport((s) => ({
              ...s,
              progress: { current: evt.current!, total: evt.total!, project: evt.project! },
            }));
          }
          if (evt.type === "timelogs" && evt.logs) {
            accumulated.push(...evt.logs);
          }
          if (evt.type === "done") {
            const blob = new Blob([JSON.stringify(accumulated, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const toLabel = issueTimelogsExport.to || "end";
            a.download = `issue-timelogs-${issueTimelogsExport.from || "0"}-${toLabel}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setIssueTimelogsExport((s) => ({
              ...s,
              done: { count: evt.total_logs!, failed: evt.failed_windows ?? [] },
              progress: null,
            }));
            setExportStates((s) => ({ ...s, "issue-timelogs": "done" }));
          }
        }
      }
    } catch (e) {
      setIssueTimelogsExport((s) => ({ ...s, error: String(e), progress: null }));
      setExportStates((s) => ({ ...s, "issue-timelogs": "error" }));
      console.error("[export/issue-timelogs]", e);
    } finally {
      setAnyRunning(false);
    }
  }

  async function handleAttachmentMetaExport() {
    if (anyRunning) return;
    setAnyRunning(true);
    setExportStates((s) => ({ ...s, "attachment-meta": "running" }));
    setAttachmentMetaExport((s) => ({ ...s, progress: null, done: null, error: null }));

    try {
      const qp = new URLSearchParams({ from: attachmentMetaExport.from || "0" });
      if (attachmentMetaExport.to) qp.set("to", attachmentMetaExport.to);
      const res = await fetch(`/api/admin/zoho-export/attachment-meta?${qp}`);
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
            items?: unknown[];
            total_attachments?: number;
            failed_task_ids?: string[];
          };

          if (evt.type === "progress") {
            setAttachmentMetaExport((s) => ({
              ...s,
              progress: { current: evt.current!, total: evt.total! },
            }));
          }
          if (evt.type === "attachments" && evt.items) {
            accumulated.push(...evt.items);
          }
          if (evt.type === "done") {
            const blob = new Blob([JSON.stringify(accumulated, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const toLabel = attachmentMetaExport.to || "end";
            a.download = `attachment-meta-${attachmentMetaExport.from || "0"}-${toLabel}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setAttachmentMetaExport((s) => ({
              ...s,
              done: { count: evt.total_attachments!, failed: evt.failed_task_ids ?? [] },
              progress: null,
            }));
            setExportStates((s) => ({ ...s, "attachment-meta": "done" }));
          }
        }
      }
    } catch (e) {
      setAttachmentMetaExport((s) => ({ ...s, error: String(e), progress: null }));
      setExportStates((s) => ({ ...s, "attachment-meta": "error" }));
      console.error("[export/attachment-meta]", e);
    } finally {
      setAnyRunning(false);
    }
  }

  async function handleIssueAttachmentMetaExport() {
    if (anyRunning) return;
    setAnyRunning(true);
    setExportStates((s) => ({ ...s, "issue-attachment-meta": "running" }));
    setIssueAttachmentMetaExport((s) => ({ ...s, progress: null, done: null, error: null }));

    try {
      const qp = new URLSearchParams({ from: issueAttachmentMetaExport.from || "0" });
      if (issueAttachmentMetaExport.to) qp.set("to", issueAttachmentMetaExport.to);
      const res = await fetch(`/api/admin/zoho-export/issue-attachment-meta?${qp}`);
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
            items?: unknown[];
            total_attachments?: number;
            failed_issue_ids?: string[];
          };

          if (evt.type === "progress") {
            setIssueAttachmentMetaExport((s) => ({
              ...s,
              progress: { current: evt.current!, total: evt.total! },
            }));
          }
          if (evt.type === "attachments" && evt.items) {
            accumulated.push(...evt.items);
          }
          if (evt.type === "done") {
            const blob = new Blob([JSON.stringify(accumulated, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const toLabel = issueAttachmentMetaExport.to || "end";
            a.download = `issue-attachment-meta-${issueAttachmentMetaExport.from || "0"}-${toLabel}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setIssueAttachmentMetaExport((s) => ({
              ...s,
              done: { count: evt.total_attachments!, failed: evt.failed_issue_ids ?? [] },
              progress: null,
            }));
            setExportStates((s) => ({ ...s, "issue-attachment-meta": "done" }));
          }
        }
      }
    } catch (e) {
      setIssueAttachmentMetaExport((s) => ({ ...s, error: String(e), progress: null }));
      setExportStates((s) => ({ ...s, "issue-attachment-meta": "error" }));
      console.error("[export/issue-attachment-meta]", e);
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

  async function handleTimelogsImport() {
    if (anyRunning) return;
    setAnyRunning(true);
    setImportStates((s) => ({ ...s, timelogs: { state: "running" } }));
    setTimelogsImport({ progress: null, done: null, error: null });

    try {
      const res = await fetch("/api/admin/zoho-import/timelogs", { method: "POST" });
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
            current?: number;
            total?: number;
            imported?: number;
            skipped?: number;
            errors?: string[];
            message?: string;
          };

          if (evt.type === "progress") {
            setTimelogsImport((s) => ({
              ...s,
              progress: { current: evt.current!, total: evt.total! },
            }));
          }
          if (evt.type === "done") {
            setTimelogsImport((s) => ({
              ...s,
              progress: null,
              done: { imported: evt.imported!, skipped: evt.skipped!, errors: evt.errors ?? [] },
            }));
            setImportStates((s) => ({ ...s, timelogs: { state: "done" } }));
          }
          if (evt.type === "error") {
            throw new Error(evt.message ?? "Unknown error");
          }
        }
      }
    } catch (e) {
      setTimelogsImport((s) => ({ ...s, error: String(e), progress: null }));
      setImportStates((s) => ({ ...s, timelogs: { state: "error", errorMsg: String(e) } }));
      console.error("[import/timelogs]", e);
    } finally {
      setAnyRunning(false);
    }
  }

  async function handleIssueTimelogsImport() {
    if (anyRunning) return;
    setAnyRunning(true);
    setImportStates((s) => ({ ...s, "issue-timelogs": { state: "running" } }));
    setIssueTimelogsImport({ progress: null, done: null, error: null });

    try {
      const res = await fetch("/api/admin/zoho-import/issue-timelogs", { method: "POST" });
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
            current?: number;
            total?: number;
            imported?: number;
            skipped?: number;
            errors?: string[];
            message?: string;
          };

          if (evt.type === "progress") {
            setIssueTimelogsImport((s) => ({
              ...s,
              progress: { current: evt.current!, total: evt.total! },
            }));
          }
          if (evt.type === "done") {
            setIssueTimelogsImport((s) => ({
              ...s,
              progress: null,
              done: { imported: evt.imported!, skipped: evt.skipped!, errors: evt.errors ?? [] },
            }));
            setImportStates((s) => ({ ...s, "issue-timelogs": { state: "done" } }));
          }
          if (evt.type === "error") {
            throw new Error(evt.message ?? "Unknown error");
          }
        }
      }
    } catch (e) {
      setIssueTimelogsImport((s) => ({ ...s, error: String(e), progress: null }));
      setImportStates((s) => ({ ...s, "issue-timelogs": { state: "error", errorMsg: String(e) } }));
      console.error("[import/issue-timelogs]", e);
    } finally {
      setAnyRunning(false);
    }
  }

  async function handleAttachmentsImport() {
    if (anyRunning || attachmentsFiles.length === 0) return;
    setAnyRunning(true);
    setImportStates((s) => ({ ...s, attachments: { state: "running" } }));
    setAttachmentsImport({ progress: null, done: null, error: null });

    try {
      const formData = new FormData();
      for (const file of attachmentsFiles) formData.append("files", file);

      const res = await fetch("/api/admin/zoho-import/attachments", { method: "POST", body: formData });
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
            current?: number;
            total?: number;
            imported?: number;
            skipped?: number;
            errors?: string[];
            message?: string;
          };

          if (evt.type === "progress") {
            setAttachmentsImport((s) => ({
              ...s,
              progress: { current: evt.current!, total: evt.total! },
            }));
          }
          if (evt.type === "done") {
            setAttachmentsImport((s) => ({
              ...s,
              progress: null,
              done: { imported: evt.imported!, skipped: evt.skipped!, errors: evt.errors ?? [] },
            }));
            setImportStates((s) => ({ ...s, attachments: { state: "done" } }));
          }
          if (evt.type === "error") {
            throw new Error(evt.message ?? "Unknown error");
          }
        }
      }
    } catch (e) {
      setAttachmentsImport((s) => ({ ...s, error: String(e), progress: null }));
      setImportStates((s) => ({ ...s, attachments: { state: "error", errorMsg: String(e) } }));
      console.error("[import/attachments]", e);
    } finally {
      setAnyRunning(false);
    }
  }

  async function handleIssueAttachmentsImport() {
    if (anyRunning || issueAttachmentsFiles.length === 0) return;
    setAnyRunning(true);
    setImportStates((s) => ({ ...s, "issue-attachments": { state: "running" } }));
    setIssueAttachmentsImport({ progress: null, done: null, error: null });

    try {
      const formData = new FormData();
      for (const file of issueAttachmentsFiles) formData.append("files", file);

      const res = await fetch("/api/admin/zoho-import/issue-attachments", { method: "POST", body: formData });
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
            current?: number;
            total?: number;
            imported?: number;
            skipped?: number;
            errors?: string[];
            message?: string;
          };

          if (evt.type === "progress") {
            setIssueAttachmentsImport((s) => ({
              ...s,
              progress: { current: evt.current!, total: evt.total! },
            }));
          }
          if (evt.type === "done") {
            setIssueAttachmentsImport((s) => ({
              ...s,
              progress: null,
              done: { imported: evt.imported!, skipped: evt.skipped!, errors: evt.errors ?? [] },
            }));
            setImportStates((s) => ({ ...s, "issue-attachments": { state: "done" } }));
          }
          if (evt.type === "error") {
            throw new Error(evt.message ?? "Unknown error");
          }
        }
      }
    } catch (e) {
      setIssueAttachmentsImport((s) => ({ ...s, error: String(e), progress: null }));
      setImportStates((s) => ({ ...s, "issue-attachments": { state: "error", errorMsg: String(e) } }));
      console.error("[import/issue-attachments]", e);
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

            if (key === "issues") {
              const isRunning = exportStates.issues === "running";
              const pct = issuesExport.progress
                ? Math.round((issuesExport.progress.current / issuesExport.progress.total) * 100)
                : 0;

              return (
                <div key="issues" className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                        {label}
                        <StateIcon state={exportStates.issues ?? "idle"} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                      {!isRunning && (
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <label className="text-[11px] text-slate-500">From</label>
                          <input
                            type="number"
                            min={0}
                            value={issuesExport.from}
                            onChange={(e) => setIssuesExport((s) => ({ ...s, from: e.target.value }))}
                            className="w-16 text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
                          />
                          <label className="text-[11px] text-slate-500">To</label>
                          <input
                            type="number"
                            min={0}
                            value={issuesExport.to}
                            placeholder="all"
                            onChange={(e) => setIssuesExport((s) => ({ ...s, to: e.target.value }))}
                            className="w-16 text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
                          />
                          <label className="text-[11px] text-slate-500">Since</label>
                          <input
                            type="date"
                            value={issuesExport.since}
                            onChange={(e) => setIssuesExport((s) => ({ ...s, since: e.target.value }))}
                            className="text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
                          />
                        </div>
                      )}
                    </div>
                    {!isRunning && (
                      <button
                        onClick={handleIssuesExport}
                        disabled={anyRunning}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Download size={11} />
                        Export
                      </button>
                    )}
                  </div>
                  {isRunning && issuesExport.progress !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate">
                        Project {issuesExport.progress.current} of {issuesExport.progress.total} — {issuesExport.progress.project}
                      </div>
                    </div>
                  ) : null}
                  {exportStates.issues === "done" && issuesExport.done !== null ? (
                    <div className="mt-1 text-[11px]">
                      <div className="text-green-600">{issuesExport.done.count} issues downloaded</div>
                      {issuesExport.done.failed.length > 0 ? (
                        <div className="text-amber-600 mt-0.5 truncate" title={issuesExport.done.failed.join(", ")}>
                          {issuesExport.done.failed.length} project(s) failed after retries — re-run to retry
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {issuesExport.error !== null ? (
                    <div className="mt-1 text-[11px] text-red-600">{issuesExport.error}</div>
                  ) : null}
                </div>
              );
            }

            if (key === "comments") {
              const isRunning = exportStates.comments === "running";
              const pct = commentsExport.progress
                ? Math.round((commentsExport.progress.current / commentsExport.progress.total) * 100)
                : 0;

              return (
                <div key="comments" className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                        {label}
                        <StateIcon state={exportStates.comments ?? "idle"} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                    </div>
                    {!isRunning && (
                      <button
                        onClick={handleCommentsExport}
                        disabled={anyRunning}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Download size={11} />
                        Export
                      </button>
                    )}
                  </div>
                  {isRunning && commentsExport.progress !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate">
                        Task {commentsExport.progress.current} of {commentsExport.progress.total}
                      </div>
                    </div>
                  ) : null}
                  {exportStates.comments === "done" && commentsExport.done !== null ? (
                    <div className="mt-1 text-[11px] text-green-600">{commentsExport.done.count} comments downloaded</div>
                  ) : null}
                  {commentsExport.error !== null ? (
                    <div className="mt-1 text-[11px] text-red-600">{commentsExport.error}</div>
                  ) : null}
                </div>
              );
            }

            if (key === "issue-comments") {
              const isRunning = exportStates["issue-comments"] === "running";
              const pct = issueCommentsExport.progress
                ? Math.round((issueCommentsExport.progress.current / issueCommentsExport.progress.total) * 100)
                : 0;

              return (
                <div key="issue-comments" className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                        {label}
                        <StateIcon state={exportStates["issue-comments"] ?? "idle"} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                    </div>
                    {!isRunning && (
                      <button
                        onClick={handleIssueCommentsExport}
                        disabled={anyRunning}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Download size={11} />
                        Export
                      </button>
                    )}
                  </div>
                  {isRunning && issueCommentsExport.progress !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate">
                        Issue {issueCommentsExport.progress.current} of {issueCommentsExport.progress.total}
                      </div>
                    </div>
                  ) : null}
                  {exportStates["issue-comments"] === "done" && issueCommentsExport.done !== null ? (
                    <div className="mt-1 text-[11px] space-y-0.5">
                      <div className="text-green-600">{issueCommentsExport.done.count} comments downloaded</div>
                      {issueCommentsExport.done.failed.length > 0 ? (
                        <div className="text-amber-600 truncate" title={issueCommentsExport.done.failed.join(", ")}>
                          {issueCommentsExport.done.failed.length} issue(s) failed after retries — re-run to retry
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {issueCommentsExport.error !== null ? (
                    <div className="mt-1 text-[11px] text-red-600">{issueCommentsExport.error}</div>
                  ) : null}
                </div>
              );
            }

            if (key === "timelogs") {
              const isRunning = exportStates.timelogs === "running";
              const pct = timelogsExport.progress
                ? Math.round((timelogsExport.progress.current / timelogsExport.progress.total) * 100)
                : 0;

              return (
                <div key="timelogs" className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                        {label}
                        <StateIcon state={exportStates.timelogs ?? "idle"} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                      {!isRunning && (
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <label className="text-[11px] text-slate-500">From</label>
                          <input
                            type="number"
                            min={0}
                            value={timelogsExport.from}
                            onChange={(e) => setTimelogsExport((s) => ({ ...s, from: e.target.value }))}
                            className="w-16 text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
                          />
                          <label className="text-[11px] text-slate-500">To</label>
                          <input
                            type="number"
                            min={0}
                            value={timelogsExport.to}
                            placeholder="all"
                            onChange={(e) => setTimelogsExport((s) => ({ ...s, to: e.target.value }))}
                            className="w-16 text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
                          />
                          <span className="text-[11px] text-slate-400">of 100 projects</span>
                        </div>
                      )}
                    </div>
                    {!isRunning && (
                      <button
                        onClick={handleTimelogsExport}
                        disabled={anyRunning}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Download size={11} />
                        Export
                      </button>
                    )}
                  </div>
                  {isRunning && timelogsExport.progress !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate">
                        Project {timelogsExport.progress.current} of {timelogsExport.progress.total} — {timelogsExport.progress.project}
                      </div>
                    </div>
                  ) : null}
                  {exportStates.timelogs === "done" && timelogsExport.done !== null ? (
                    <div className="mt-1 text-[11px]">
                      <div className="text-green-600">{timelogsExport.done.count} logs downloaded</div>
                      {timelogsExport.done.failed.length > 0 ? (
                        <div className="text-amber-600 mt-0.5 truncate" title={timelogsExport.done.failed.join(", ")}>
                          {timelogsExport.done.failed.length} window(s) failed after retries — re-run with from/to to retry
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {timelogsExport.error !== null ? (
                    <div className="mt-1 text-[11px] text-red-600">{timelogsExport.error}</div>
                  ) : null}
                </div>
              );
            }

            if (key === "issue-timelogs") {
              const isRunning = exportStates["issue-timelogs"] === "running";
              const pct = issueTimelogsExport.progress
                ? Math.round((issueTimelogsExport.progress.current / issueTimelogsExport.progress.total) * 100)
                : 0;

              return (
                <div key="issue-timelogs" className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                        {label}
                        <StateIcon state={exportStates["issue-timelogs"] ?? "idle"} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                      {!isRunning && (
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <label className="text-[11px] text-slate-500">From</label>
                          <input
                            type="number"
                            min={0}
                            value={issueTimelogsExport.from}
                            onChange={(e) => setIssueTimelogsExport((s) => ({ ...s, from: e.target.value }))}
                            className="w-16 text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
                          />
                          <label className="text-[11px] text-slate-500">To</label>
                          <input
                            type="number"
                            min={0}
                            value={issueTimelogsExport.to}
                            placeholder="all"
                            onChange={(e) => setIssueTimelogsExport((s) => ({ ...s, to: e.target.value }))}
                            className="w-16 text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
                          />
                          <span className="text-[11px] text-slate-400">of projects with issues</span>
                        </div>
                      )}
                    </div>
                    {!isRunning && (
                      <button
                        onClick={handleIssueTimelogsExport}
                        disabled={anyRunning}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Download size={11} />
                        Export
                      </button>
                    )}
                  </div>
                  {isRunning && issueTimelogsExport.progress !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate">
                        Project {issueTimelogsExport.progress.current} of {issueTimelogsExport.progress.total} — {issueTimelogsExport.progress.project}
                      </div>
                    </div>
                  ) : null}
                  {exportStates["issue-timelogs"] === "done" && issueTimelogsExport.done !== null ? (
                    <div className="mt-1 text-[11px]">
                      <div className="text-green-600">{issueTimelogsExport.done.count} logs downloaded</div>
                      {issueTimelogsExport.done.failed.length > 0 ? (
                        <div className="text-amber-600 mt-0.5 truncate" title={issueTimelogsExport.done.failed.join(", ")}>
                          {issueTimelogsExport.done.failed.length} window(s) failed after retries — re-run with from/to to retry
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {issueTimelogsExport.error !== null ? (
                    <div className="mt-1 text-[11px] text-red-600">{issueTimelogsExport.error}</div>
                  ) : null}
                </div>
              );
            }

            if (key === "attachment-meta") {
              const isRunning = exportStates["attachment-meta"] === "running";
              const pct = attachmentMetaExport.progress
                ? Math.round((attachmentMetaExport.progress.current / attachmentMetaExport.progress.total) * 100)
                : 0;

              return (
                <div key="attachment-meta" className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                        {label}
                        <StateIcon state={exportStates["attachment-meta"] ?? "idle"} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                      {!isRunning && (
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <label className="text-[11px] text-slate-500">From</label>
                          <input
                            type="number"
                            min={0}
                            value={attachmentMetaExport.from}
                            onChange={(e) => setAttachmentMetaExport((s) => ({ ...s, from: e.target.value }))}
                            className="w-16 text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
                          />
                          <label className="text-[11px] text-slate-500">To</label>
                          <input
                            type="number"
                            min={0}
                            value={attachmentMetaExport.to}
                            placeholder="all"
                            onChange={(e) => setAttachmentMetaExport((s) => ({ ...s, to: e.target.value }))}
                            className="w-16 text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
                          />
                          <span className="text-[11px] text-slate-400">of 6946 tasks</span>
                        </div>
                      )}
                    </div>
                    {!isRunning && (
                      <button
                        onClick={handleAttachmentMetaExport}
                        disabled={anyRunning}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Download size={11} />
                        Export
                      </button>
                    )}
                  </div>
                  {isRunning && attachmentMetaExport.progress !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate">
                        Task {attachmentMetaExport.progress.current} of {attachmentMetaExport.progress.total}
                      </div>
                    </div>
                  ) : null}
                  {exportStates["attachment-meta"] === "done" && attachmentMetaExport.done !== null ? (
                    <div className="mt-1 text-[11px]">
                      <div className="text-green-600">{attachmentMetaExport.done.count} attachments downloaded</div>
                      {attachmentMetaExport.done.failed.length > 0 ? (
                        <div className="text-amber-600 mt-0.5 truncate" title={attachmentMetaExport.done.failed.join(", ")}>
                          {attachmentMetaExport.done.failed.length} task(s) failed after retries — re-run with from/to to retry
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {attachmentMetaExport.error !== null ? (
                    <div className="mt-1 text-[11px] text-red-600">{attachmentMetaExport.error}</div>
                  ) : null}
                </div>
              );
            }

            if (key === "issue-attachment-meta") {
              const isRunning = exportStates["issue-attachment-meta"] === "running";
              const pct = issueAttachmentMetaExport.progress
                ? Math.round((issueAttachmentMetaExport.progress.current / issueAttachmentMetaExport.progress.total) * 100)
                : 0;

              return (
                <div key="issue-attachment-meta" className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                        {label}
                        <StateIcon state={exportStates["issue-attachment-meta"] ?? "idle"} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                      {!isRunning && (
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <label className="text-[11px] text-slate-500">From</label>
                          <input
                            type="number"
                            min={0}
                            value={issueAttachmentMetaExport.from}
                            onChange={(e) => setIssueAttachmentMetaExport((s) => ({ ...s, from: e.target.value }))}
                            className="w-16 text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
                          />
                          <label className="text-[11px] text-slate-500">To</label>
                          <input
                            type="number"
                            min={0}
                            value={issueAttachmentMetaExport.to}
                            placeholder="all"
                            onChange={(e) => setIssueAttachmentMetaExport((s) => ({ ...s, to: e.target.value }))}
                            className="w-16 text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
                          />
                          <span className="text-[11px] text-slate-400">of 1049 issues</span>
                        </div>
                      )}
                    </div>
                    {!isRunning && (
                      <button
                        onClick={handleIssueAttachmentMetaExport}
                        disabled={anyRunning}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Download size={11} />
                        Export
                      </button>
                    )}
                  </div>
                  {isRunning && issueAttachmentMetaExport.progress !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate">
                        Issue {issueAttachmentMetaExport.progress.current} of {issueAttachmentMetaExport.progress.total}
                      </div>
                    </div>
                  ) : null}
                  {exportStates["issue-attachment-meta"] === "done" && issueAttachmentMetaExport.done !== null ? (
                    <div className="mt-1 text-[11px]">
                      <div className="text-green-600">{issueAttachmentMetaExport.done.count} attachments downloaded</div>
                      {issueAttachmentMetaExport.done.failed.length > 0 ? (
                        <div className="text-amber-600 mt-0.5 truncate" title={issueAttachmentMetaExport.done.failed.join(", ")}>
                          {issueAttachmentMetaExport.done.failed.length} issue(s) failed after retries — re-run with from/to to retry
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {issueAttachmentMetaExport.error !== null ? (
                    <div className="mt-1 text-[11px] text-red-600">{issueAttachmentMetaExport.error}</div>
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

            if (key === "timelogs") {
              const isRunning = importStates.timelogs?.state === "running";
              const prog = timelogsImport.progress;
              const pct = prog ? Math.round((prog.current / prog.total) * 100) : 0;

              return (
                <div key="timelogs" className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                        {label}
                        <StateIcon state={importStates.timelogs?.state ?? "idle"} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                    </div>
                    {!isRunning && (
                      <button
                        onClick={handleTimelogsImport}
                        disabled={anyRunning}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Upload size={11} />
                        Import
                      </button>
                    )}
                  </div>

                  {isRunning && prog !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate">
                        Chunk {prog.current} of {prog.total}
                      </div>
                    </div>
                  ) : null}

                  {importStates.timelogs?.state === "done" && timelogsImport.done !== null ? (
                    <div className="mt-2 text-[12px] text-slate-600 space-y-0.5">
                      <div>
                        <span className="font-semibold text-green-700">{timelogsImport.done.imported}</span> imported ·{" "}
                        <span className="font-semibold text-slate-500">{timelogsImport.done.skipped}</span> skipped
                      </div>
                      {timelogsImport.done.errors.length > 0 && (
                        <div className="text-red-600">{timelogsImport.done.errors.length} error(s)</div>
                      )}
                      {timelogsImport.done.errors.slice(0, 3).map((e, i) => (
                        <div key={i} className="text-red-500 text-[11px] truncate" title={e}>{e}</div>
                      ))}
                      {timelogsImport.done.errors.length > 3 && (
                        <div className="text-slate-400 text-[11px]">+{timelogsImport.done.errors.length - 3} more</div>
                      )}
                    </div>
                  ) : null}

                  {timelogsImport.error !== null ? (
                    <div className="mt-1 text-[11px] text-red-600">{timelogsImport.error}</div>
                  ) : null}
                </div>
              );
            }

            if (key === "issue-timelogs") {
              const isRunning = importStates["issue-timelogs"]?.state === "running";
              const prog = issueTimelogsImport.progress;
              const pct = prog ? Math.round((prog.current / prog.total) * 100) : 0;

              return (
                <div key="issue-timelogs" className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                        {label}
                        <StateIcon state={importStates["issue-timelogs"]?.state ?? "idle"} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                    </div>
                    {!isRunning && (
                      <button
                        onClick={handleIssueTimelogsImport}
                        disabled={anyRunning}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Upload size={11} />
                        Import
                      </button>
                    )}
                  </div>

                  {isRunning && prog !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate">
                        Chunk {prog.current} of {prog.total}
                      </div>
                    </div>
                  ) : null}

                  {importStates["issue-timelogs"]?.state === "done" && issueTimelogsImport.done !== null ? (
                    <div className="mt-2 text-[12px] text-slate-600 space-y-0.5">
                      <div>
                        <span className="font-semibold text-green-700">{issueTimelogsImport.done.imported}</span> imported ·{" "}
                        <span className="font-semibold text-slate-500">{issueTimelogsImport.done.skipped}</span> skipped
                      </div>
                      {issueTimelogsImport.done.errors.length > 0 && (
                        <div className="text-red-600">{issueTimelogsImport.done.errors.length} error(s)</div>
                      )}
                      {issueTimelogsImport.done.errors.slice(0, 3).map((e, i) => (
                        <div key={i} className="text-red-500 text-[11px] truncate" title={e}>{e}</div>
                      ))}
                      {issueTimelogsImport.done.errors.length > 3 && (
                        <div className="text-slate-400 text-[11px]">+{issueTimelogsImport.done.errors.length - 3} more</div>
                      )}
                    </div>
                  ) : null}

                  {issueTimelogsImport.error !== null ? (
                    <div className="mt-1 text-[11px] text-red-600">{issueTimelogsImport.error}</div>
                  ) : null}
                </div>
              );
            }

            if (key === "attachments") {
              const isRunning = importStates.attachments?.state === "running";
              const prog = attachmentsImport.progress;
              const pct = prog ? Math.round((prog.current / prog.total) * 100) : 0;

              return (
                <div key="attachments" className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                        {label}
                        <StateIcon state={importStates.attachments?.state ?? "idle"} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                    </div>
                    {!isRunning && (
                      <div className="shrink-0 flex items-center gap-2">
                        <input
                          type="file"
                          multiple
                          onChange={(e) => setAttachmentsFiles(Array.from(e.target.files ?? []))}
                          className="text-[11px] text-slate-500 max-w-[160px]"
                        />
                        <button
                          onClick={handleAttachmentsImport}
                          disabled={anyRunning || attachmentsFiles.length === 0}
                          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <Upload size={11} />
                          Import ({attachmentsFiles.length})
                        </button>
                      </div>
                    )}
                  </div>

                  {isRunning && prog !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate">
                        Attachment {prog.current} of {prog.total}
                      </div>
                    </div>
                  ) : null}

                  {importStates.attachments?.state === "done" && attachmentsImport.done !== null ? (
                    <div className="mt-2 text-[12px] text-slate-600 space-y-0.5">
                      <div>
                        <span className="font-semibold text-green-700">{attachmentsImport.done.imported}</span> imported ·{" "}
                        <span className="font-semibold text-slate-500">{attachmentsImport.done.skipped}</span> skipped
                      </div>
                      {attachmentsImport.done.errors.length > 0 && (
                        <div className="text-red-600">{attachmentsImport.done.errors.length} error(s)</div>
                      )}
                      {attachmentsImport.done.errors.slice(0, 3).map((e, i) => (
                        <div key={i} className="text-red-500 text-[11px] truncate" title={e}>{e}</div>
                      ))}
                      {attachmentsImport.done.errors.length > 3 && (
                        <div className="text-slate-400 text-[11px]">+{attachmentsImport.done.errors.length - 3} more</div>
                      )}
                    </div>
                  ) : null}

                  {attachmentsImport.error !== null ? (
                    <div className="mt-1 text-[11px] text-red-600">{attachmentsImport.error}</div>
                  ) : null}
                </div>
              );
            }

            if (key === "issue-attachments") {
              const isRunning = importStates["issue-attachments"]?.state === "running";
              const prog = issueAttachmentsImport.progress;
              const pct = prog ? Math.round((prog.current / prog.total) * 100) : 0;

              return (
                <div key="issue-attachments" className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                        {label}
                        <StateIcon state={importStates["issue-attachments"]?.state ?? "idle"} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
                    </div>
                    {!isRunning && (
                      <div className="shrink-0 flex items-center gap-2">
                        <input
                          type="file"
                          multiple
                          onChange={(e) => setIssueAttachmentsFiles(Array.from(e.target.files ?? []))}
                          className="text-[11px] text-slate-500 max-w-[160px]"
                        />
                        <button
                          onClick={handleIssueAttachmentsImport}
                          disabled={anyRunning || issueAttachmentsFiles.length === 0}
                          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <Upload size={11} />
                          Import ({issueAttachmentsFiles.length})
                        </button>
                      </div>
                    )}
                  </div>

                  {isRunning && prog !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate">
                        Attachment {prog.current} of {prog.total}
                      </div>
                    </div>
                  ) : null}

                  {importStates["issue-attachments"]?.state === "done" && issueAttachmentsImport.done !== null ? (
                    <div className="mt-2 text-[12px] text-slate-600 space-y-0.5">
                      <div>
                        <span className="font-semibold text-green-700">{issueAttachmentsImport.done.imported}</span> imported ·{" "}
                        <span className="font-semibold text-slate-500">{issueAttachmentsImport.done.skipped}</span> skipped
                      </div>
                      {issueAttachmentsImport.done.errors.length > 0 && (
                        <div className="text-red-600">{issueAttachmentsImport.done.errors.length} error(s)</div>
                      )}
                      {issueAttachmentsImport.done.errors.slice(0, 3).map((e, i) => (
                        <div key={i} className="text-red-500 text-[11px] truncate" title={e}>{e}</div>
                      ))}
                      {issueAttachmentsImport.done.errors.length > 3 && (
                        <div className="text-slate-400 text-[11px]">+{issueAttachmentsImport.done.errors.length - 3} more</div>
                      )}
                    </div>
                  ) : null}

                  {issueAttachmentsImport.error !== null ? (
                    <div className="mt-1 text-[11px] text-red-600">{issueAttachmentsImport.error}</div>
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
