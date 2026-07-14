"use client";

import React, { useState, useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import type { PMSettings } from "@/hooks/use-pm-settings";
import type { TaskType, TaskPriority } from "@/types/hub";
import { PriorityDot } from "./shared";
import type { Database } from "@/types/database";

type ClassificationRow = Database["public"]["Tables"]["classification_records"]["Row"] & {
  customers?: { company_name: string } | null;
};

const CARD = "rounded-[14px] border border-(--c-border) shadow-[0_1px_4px_rgba(0,0,0,0.05)] bg-(--c-card)";

function confClass(score: number | null): string {
  const v = score ?? 0;
  if (v >= 80) return "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950 dark:border-green-800";
  if (v >= 60) return "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800";
  return "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800";
}

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type Developer = { id: string; first_name: string | null; last_name: string | null; email: string };

function AssignDropdown({ taskId, developers }: { taskId: string; developers: Developer[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [assignedNames, setAssignedNames] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDev(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleAssign() {
    if (!selected.length) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/classification/${taskId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ developerIds: selected }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as Record<string, string>;
        const msg = json.error === "add_to_project_failed"
          ? "Failed to add developer to Zoho project"
          : json.error === "no_zoho_task"
          ? "Task not synced to Zoho yet"
          : json.error === "no_zoho_project"
          ? "No Zoho project for this customer"
          : json.error ?? "Assign failed";
        setError(msg);
        return;
      }
      const json = await res.json() as { ok: boolean; developerNames?: string[] };
      setAssignedNames(json.developerNames ?? []);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  if (assignedNames !== null) {
    return <span className="text-[11px] font-semibold text-(--c-green)">{assignedNames.join(", ")}</span>;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-[11px] border border-(--c-border) rounded-[5px] px-2 py-1 bg-(--c-card) text-(--c-text) cursor-pointer focus:outline-none min-w-[110px] text-left"
      >
        {selected.length ? `${selected.length} selected` : "— Assign Dev —"}
      </button>
      {open ? (
        <div className="absolute z-20 left-0 mt-1 bg-(--c-card) border border-(--c-border) rounded-lg shadow-lg p-2 min-w-[160px]">
          {developers.map(d => (
            <label key={d.id} className="flex items-center gap-2 py-1 cursor-pointer text-[12px] text-(--c-text) hover:text-(--c-blue)">
              <input
                type="checkbox"
                checked={selected.includes(d.id)}
                onChange={() => toggleDev(d.id)}
                className="rounded cursor-pointer"
              />
              {[d.first_name, d.last_name].filter(Boolean).join(" ") || d.email}
            </label>
          ))}
          <button
            onClick={handleAssign}
            disabled={!selected.length || loading}
            className="mt-2 w-full text-[11px] font-semibold px-2 py-1 rounded-[5px] bg-(--c-blue) text-white disabled:opacity-40 cursor-pointer border-0"
          >
            {loading ? "Assigning…" : "Assign"}
          </button>
        </div>
      ) : null}
      {error !== null ? (
        <span className="text-[10px] text-red-500 leading-tight block mt-0.5">{error}</span>
      ) : null}
    </div>
  );
}

const TASK_TYPES: TaskType[] = [
  "CONTENT_UPDATE", "SETTINGS_CHANGE", "BLOG_PUBLISH", "ASSET_UPLOAD",
  "CODE_CHANGE_MINOR", "SEO_UPDATE", "BUG_REPORT", "FEATURE_REQUEST", "STRATEGIC", "OTHER",
];
const PRIORITIES: TaskPriority[] = ["CRITICAL", "HIGH", "NORMAL", "LOW"];

function ReclassifyModal({ record, onClose, onSave }: {
  record: ClassificationRow;
  onClose: () => void;
  onSave: (updated: ClassificationRow) => void;
}) {
  const [taskType, setTaskType] = useState(record.task_type ?? "OTHER");
  const [priority, setPriority] = useState(record.priority ?? "NORMAL");
  const [llmEligible, setLlmEligible] = useState(record.llm_eligible ?? "NO");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasoning =
    record.raw_response !== null &&
    typeof record.raw_response === "object" &&
    !Array.isArray(record.raw_response) &&
    typeof (record.raw_response as Record<string, unknown>).reasoning === "string"
      ? (record.raw_response as Record<string, unknown>).reasoning as string
      : null;

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/classification/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_type: taskType, priority, llm_eligible: llmEligible }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError((json.error as string) ?? "Failed to save");
        return;
      }
      const updated = await res.json() as ClassificationRow;
      onSave({ ...updated, customers: record.customers });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const selectClass = "w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelClass = "block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.06em] mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-bold text-gray-900 dark:text-white">Re-classify Task</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>
        <p className="text-[13px] text-gray-600 dark:text-gray-400 mb-4 leading-relaxed line-clamp-2">
          {record.title}
        </p>

        {reasoning !== null ? (
          <div className="mb-4 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2.5">
            <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.06em] mb-1">
              AI Reasoning
            </p>
            <p className="text-[12px] text-gray-700 dark:text-gray-300 leading-relaxed">
              {reasoning}
            </p>
          </div>
        ) : null}

        <div className="space-y-3 mb-5">
          <div>
            <label className={labelClass}>Task Type</label>
            <select value={taskType} onChange={e => setTaskType(e.target.value)} className={selectClass}>
              {TASK_TYPES.map(t => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} className={selectClass}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>LLM Eligible</label>
            <select value={llmEligible} onChange={e => setLlmEligible(e.target.value)} className={selectClass}>
              <option value="YES">YES — AI automation allowed</option>
              <option value="NO">NO — Human required</option>
              <option value="HUMAN_ONLY">HUMAN ONLY — Never automate</option>
            </select>
          </div>
        </div>

        {error && (
          <p className="text-[12px] text-red-600 dark:text-red-400 mb-3">{error}</p>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="text-[13px] font-semibold px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="text-[13px] font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

type AllProject = { id: string; project_name: string; external_project_id: string; customer_id: string; company_name: string };
type TasklistOption = { id: string; name: string };
type ClassifyResult = {
  task_type: string;
  priority: string;
  llm_eligible: string;
  confidence_score: number;
  reasoning: string;
};

function CreateTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  // Existing project/tasklist state (preserved)
  const [allProjects, setAllProjects] = useState<AllProject[]>([]);
  const [allProjectsLoading, setAllProjectsLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [selectedZohoProjectId, setSelectedZohoProjectId] = useState("");
  const [tasklists, setTasklists] = useState<TasklistOption[]>([]);
  const [tasklistsLoading, setTasklistsLoading] = useState(false);
  const [selectedTasklistId, setSelectedTasklistId] = useState("");
  const [showNewTasklist, setShowNewTasklist] = useState(false);
  const [newTasklistName, setNewTasklistName] = useState("");
  const [creatingTasklist, setCreatingTasklist] = useState(false);
  const [tasklistError, setTasklistError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New fields
  const [showDescription, setShowDescription] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [zohoPriority, setZohoPriority] = useState("None");
  const [billingType, setBillingType] = useState("None");
  const [portalUsers, setPortalUsers] = useState<{ id: string; full_name: string }[]>([]);

  // Classification step state
  const [step, setStep] = useState<"details" | "classifying" | "classified">("details");
  const [classifyResult, setClassifyResult] = useState<ClassifyResult | null>(null);
  const [classifyTaskType, setClassifyTaskType] = useState("OTHER");
  const [classifyPriority, setClassifyPriority] = useState("NORMAL");
  const [classifyLlmEligible, setClassifyLlmEligible] = useState("NO");
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    editorProps: {
      attributes: {
        class: "min-h-[120px] px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none",
      },
    },
  });

  const selectClass = "w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelClass = "block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.06em] mb-1";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects")
      .then(r => r.json())
      .then((data: AllProject[]) => { if (!cancelled) setAllProjects(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAllProjectsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    fetch("/api/zoho/portal-users")
      .then(r => r.json())
      .then((data: { users?: { id: string; full_name: string }[] }) => {
        setPortalUsers(data.users ?? []);
      })
      .catch(() => {});
  }, []);

  async function handleTasklistsLoad(zohoProjectId: string) {
    setSelectedZohoProjectId(zohoProjectId);
    setSelectedTasklistId("");
    setTasklists([]);
    setShowNewTasklist(false);
    setNewTasklistName("");
    setTasklistError(null);
    if (!zohoProjectId) return;
    setTasklistsLoading(true);
    try {
      const res = await fetch(`/api/zoho/tasklists?projectId=${zohoProjectId}`);
      const json = await res.json() as { tasklists?: TasklistOption[] };
      const list = json.tasklists ?? [];
      setTasklists(list);
      const general = list.find(tl => tl.name === "General");
      setSelectedTasklistId(general?.id ?? list[0]?.id ?? "");
    } finally {
      setTasklistsLoading(false);
    }
  }

  async function handleProjectSelect(projectRowId: string) {
    setSelectedProjectId(projectRowId);
    const project = allProjects.find(p => p.id === projectRowId);
    if (!project) {
      setCustomerId("");
      setSelectedZohoProjectId("");
      setSelectedTasklistId("");
      setTasklists([]);
      setShowNewTasklist(false);
      setNewTasklistName("");
      setTasklistError(null);
      return;
    }
    setCustomerId(project.customer_id);
    await handleTasklistsLoad(project.external_project_id);
  }

  async function handleCreateTasklist() {
    if (!newTasklistName.trim() || !selectedZohoProjectId) return;
    setCreatingTasklist(true);
    setTasklistError(null);
    try {
      const res = await fetch("/api/zoho/tasklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedZohoProjectId, name: newTasklistName.trim() }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as Record<string, string>;
        setTasklistError(json.error ?? "Failed to create task list");
        return;
      }
      const json = await res.json() as { tasklist: TasklistOption };
      const created = json.tasklist;
      setTasklists(prev => [...prev, created]);
      setSelectedTasklistId(created.id);
      setShowNewTasklist(false);
      setNewTasklistName("");
    } finally {
      setCreatingTasklist(false);
    }
  }

  async function handleClassify() {
    if (!customerId || !title) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setStep("classifying");
    setClassifyError(null);
    try {
      const descHtml = editor && !editor.isEmpty ? editor.getHTML() : null;
      const res = await fetch("/api/classification/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: descHtml }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as Record<string, string>;
        setClassifyError(json.error ?? "Classification failed");
        setStep("details");
        return;
      }
      const result = await res.json() as ClassifyResult;
      setClassifyResult(result);
      setClassifyTaskType(result.task_type);
      setClassifyPriority(result.priority);
      setClassifyLlmEligible(result.llm_eligible);
      setStep("classified");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        setStep("details");
      } else {
        setClassifyError("Classification failed. Please try again.");
        setStep("details");
      }
    }
  }

  function handleStopClassify() {
    abortControllerRef.current?.abort();
    setStep("details");
  }

  async function handleCreateTask() {
    if (!customerId || !title || !classifyResult) return;
    setSaving(true);
    setError(null);
    try {
      const descHtml = editor && !editor.isEmpty ? editor.getHTML() : null;
      const res = await fetch("/api/classification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "hub_manual",
          customerId,
          title,
          description: descHtml,
          task_type: classifyTaskType,
          priority: classifyPriority,
          llm_eligible: classifyLlmEligible,
          confidence_score: classifyResult.confidence_score,
          zohoProjectId: selectedZohoProjectId,
          tasklistId: selectedTasklistId,
          startDate: startDate || null,
          dueDate: dueDate || null,
          ownerId: ownerId || null,
          billingType: billingType !== "None" ? billingType : null,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as Record<string, string>;
        setError(json.error ?? "Failed to create task");
        return;
      }
      const taskData = await res.json() as { zoho_task_id?: string | null };
      if (attachedFiles.length > 0 && taskData.zoho_task_id && selectedZohoProjectId) {
        const form = new FormData();
        attachedFiles.forEach(f => form.append("files", f));
        fetch(
          `/api/zoho/tasks/${taskData.zoho_task_id}/attachments?projectId=${selectedZohoProjectId}`,
          { method: "POST", body: form }
        ).catch(() => {});
      }
      onCreated?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const newFiles = Array.from(e.dataTransfer.files);
    setAttachedFiles(prev => [...prev, ...newFiles].slice(0, 30));
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files ?? []);
    setAttachedFiles(prev => [...prev, ...newFiles].slice(0, 30));
    e.target.value = "";
  }

  const canClassify = !!customerId && !!title && !!selectedZohoProjectId && !!selectedTasklistId;
  const stepLabel = step === "details" ? "Step 1 of 2 — Task Details" : "Step 2 of 2 — AI Classification";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl mx-4 border border-gray-200 dark:border-gray-700 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3 shrink-0">
          <div>
            <h2 className="text-[15px] font-bold text-gray-900 dark:text-white">Create Task</h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{stepLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Step 1: Task Details */}
        {step === "details" ? (
          <div className="overflow-y-auto px-6">
            <div className="space-y-3 mb-5">

              {/* Project */}
              <div>
                <label className={labelClass}>Project</label>
                {allProjectsLoading ? (
                  <p className="text-[12px] text-gray-400 dark:text-gray-500">Loading projects…</p>
                ) : (
                  <select value={selectedProjectId} onChange={e => handleProjectSelect(e.target.value)} className={selectClass}>
                    <option value="">— Select project —</option>
                    {allProjects.map(p => (
                      <option key={p.id} value={p.id}>{p.project_name} — {p.company_name}</option>
                    ))}
                  </select>
                )}
                {!allProjectsLoading && allProjects.length === 0 ? (
                  <p className="text-[12px] text-amber-600 dark:text-amber-400 mt-1">No projects with linked Zoho IDs found.</p>
                ) : null}
              </div>

              {/* Tasklist */}
              {selectedZohoProjectId ? (
                <div>
                  <label className={labelClass}>Task List</label>
                  <select
                    value={selectedTasklistId}
                    onChange={e => setSelectedTasklistId(e.target.value)}
                    className={selectClass}
                    disabled={tasklistsLoading || creatingTasklist}
                  >
                    {tasklistsLoading ? (
                      <option>Loading…</option>
                    ) : (
                      tasklists.map(tl => <option key={tl.id} value={tl.id}>{tl.name}</option>)
                    )}
                  </select>
                  {!showNewTasklist ? (
                    <button
                      type="button"
                      onClick={() => setShowNewTasklist(true)}
                      className="mt-1.5 text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      + Create new task list
                    </button>
                  ) : (
                    <div className="mt-2 flex gap-2 items-center">
                      <input
                        type="text"
                        value={newTasklistName}
                        onChange={e => setNewTasklistName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleCreateTasklist(); }}
                        placeholder="Task list name"
                        className={`${selectClass} flex-1`}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleCreateTasklist}
                        disabled={!newTasklistName.trim() || creatingTasklist}
                        className="text-[12px] font-semibold px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 cursor-pointer shrink-0"
                      >
                        {creatingTasklist ? "…" : "Add"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowNewTasklist(false); setNewTasklistName(""); setTasklistError(null); }}
                        className="text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-700 cursor-pointer shrink-0"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  {tasklistError !== null ? (
                    <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{tasklistError}</p>
                  ) : null}
                </div>
              ) : null}

              {/* Task Name */}
              <div>
                <label className={labelClass}>Task Name <span className="text-red-500 normal-case">*</span></label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Task title"
                  className={selectClass}
                />
              </div>

              {/* Description (Tiptap — collapsible) */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowDescription(v => !v)}
                  className="text-[12px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 cursor-pointer hover:underline"
                >
                  {showDescription ? "Hide Description ↑" : "Add Description ↓"}
                </button>
                {showDescription ? (
                  <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="flex flex-wrap gap-0.5 px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                      {([
                        { label: "B", title: "Bold", action: () => editor?.chain().focus().toggleBold().run(), active: () => editor?.isActive("bold") ?? false, cls: "font-bold" },
                        { label: "I", title: "Italic", action: () => editor?.chain().focus().toggleItalic().run(), active: () => editor?.isActive("italic") ?? false, cls: "italic" },
                        { label: "U", title: "Underline", action: () => editor?.chain().focus().toggleUnderline().run(), active: () => editor?.isActive("underline") ?? false, cls: "underline" },
                        { label: "S", title: "Strike", action: () => editor?.chain().focus().toggleStrike().run(), active: () => editor?.isActive("strike") ?? false, cls: "line-through" },
                      ] as const).map(btn => (
                        <button
                          key={btn.title}
                          type="button"
                          title={btn.title}
                          onClick={btn.action}
                          className={`text-[12px] w-7 h-7 rounded flex items-center justify-center cursor-pointer transition-colors ${btn.cls} ${
                            btn.active()
                              ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                              : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                          }`}
                        >
                          {btn.label}
                        </button>
                      ))}
                      <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 self-center mx-0.5" />
                      {([
                        { label: "• List", title: "Bullet List", action: () => editor?.chain().focus().toggleBulletList().run(), active: () => editor?.isActive("bulletList") ?? false },
                        { label: "1. List", title: "Ordered List", action: () => editor?.chain().focus().toggleOrderedList().run(), active: () => editor?.isActive("orderedList") ?? false },
                      ] as const).map(btn => (
                        <button
                          key={btn.title}
                          type="button"
                          title={btn.title}
                          onClick={btn.action}
                          className={`text-[11px] px-2 h-7 rounded flex items-center justify-center cursor-pointer transition-colors ${
                            btn.active()
                              ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                              : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                          }`}
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>
                    <EditorContent editor={editor} />
                  </div>
                ) : null}
              </div>

              {/* File Attachments */}
              <div>
                <label className={labelClass}>Attachments</label>
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => document.getElementById("task-file-input")?.click()}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                    isDragOver
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                      : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  <span className="text-[12px] text-gray-400 dark:text-gray-500">
                    Drop files or add attachments here…
                  </span>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">
                    {attachedFiles.length > 0 ? `${attachedFiles.length} / 30 files` : "Maximum 30 files"}
                  </span>
                </div>
                <input id="task-file-input" type="file" multiple className="hidden" onChange={handleFileInputChange} />
                {attachedFiles.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5 max-h-24 overflow-y-auto">
                    {attachedFiles.map((f, i) => (
                      <li key={i} className="flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded px-2 py-1">
                        <span className="truncate mr-2">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))}
                          className="shrink-0 text-gray-400 hover:text-red-500 cursor-pointer"
                        >
                          &times;
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {/* Owner / Assignee */}
              <div>
                <label className={labelClass}>Owner / Assignee</label>
                <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className={selectClass}>
                  <option value="">Unassigned</option>
                  {portalUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  ))}
                </select>
              </div>

              {/* Start Date / Due Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Start Date</label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className={selectClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Due Date</label>
                  <input
                    type="datetime-local"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className={selectClass}
                  />
                </div>
              </div>

              {/* Priority / Billing Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Priority</label>
                  <select value={zohoPriority} onChange={e => setZohoPriority(e.target.value)} className={selectClass}>
                    <option value="None">None</option>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Billing Type</label>
                  <select value={billingType} onChange={e => setBillingType(e.target.value)} className={selectClass}>
                    <option value="None">None</option>
                    <option value="Billable">Billable</option>
                    <option value="Non Billable">Non Billable</option>
                  </select>
                </div>
              </div>

            </div>
          </div>
        ) : null}

        {/* Step 2: Classifying animation */}
        {step === "classifying" ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-14 gap-5">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              className="w-12 h-12 rounded-full border-4 border-blue-200 border-t-blue-500"
            />
            <div className="text-center">
              <p className="text-[14px] font-semibold text-gray-800 dark:text-white">Classifying task</p>
              <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1">Please wait for a while…</p>
            </div>
            <button
              type="button"
              onClick={handleStopClassify}
              className="text-[12px] font-semibold px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
            >
              Stop
            </button>
          </div>
        ) : null}

        {/* Step 2: Classification result */}
        {step === "classified" && classifyResult !== null ? (
          <div className="overflow-y-auto px-6 py-4">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700 mb-4">
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <span className={labelClass + " mb-0 shrink-0"}>Task Type</span>
                <select
                  value={classifyTaskType}
                  onChange={e => setClassifyTaskType(e.target.value)}
                  className="text-[12px] border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {TASK_TYPES.map(t => (
                    <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <span className={labelClass + " mb-0 shrink-0"}>Priority</span>
                <select
                  value={classifyPriority}
                  onChange={e => setClassifyPriority(e.target.value)}
                  className="text-[12px] border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <span className={labelClass + " mb-0 shrink-0"}>LLM Eligible</span>
                <select
                  value={classifyLlmEligible}
                  onChange={e => setClassifyLlmEligible(e.target.value)}
                  className="text-[12px] border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="YES">AI Only</option>
                  <option value="NO">AI + Human Required</option>
                  <option value="HUMAN_ONLY">Human Only</option>
                </select>
              </div>
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <span className={labelClass + " mb-0 shrink-0"}>Confidence</span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${confClass(classifyResult.confidence_score)}`}>
                  {classifyResult.confidence_score}%
                </span>
              </div>
              <div className="px-4 py-3">
                <p className={labelClass}>Reasoning</p>
                <p className="text-[12px] text-gray-700 dark:text-gray-300 leading-relaxed mt-1">
                  {classifyResult.reasoning}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClassify}
              className="text-[12px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              ↺ Re-run Classification
            </button>
          </div>
        ) : null}

        {/* Footer */}
        <div className="px-6 pb-6 pt-3 shrink-0 border-t border-gray-100 dark:border-gray-800">
          {error !== null ? (
            <p className="text-[12px] text-red-600 dark:text-red-400 mb-3">{error}</p>
          ) : null}
          {classifyError !== null ? (
            <p className="text-[12px] text-red-600 dark:text-red-400 mb-3">{classifyError}</p>
          ) : null}
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              disabled={saving}
              className="text-[13px] font-semibold px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            {step === "details" ? (
              <button
                onClick={handleClassify}
                disabled={!canClassify}
                className="text-[13px] font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 cursor-pointer"
              >
                Classify →
              </button>
            ) : step === "classified" ? (
              <>
                <button
                  onClick={() => setStep("details")}
                  disabled={saving}
                  className="text-[13px] font-semibold px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer disabled:opacity-50"
                >
                  ← Back
                </button>
                <button
                  onClick={handleCreateTask}
                  disabled={saving}
                  className="text-[13px] font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 cursor-pointer"
                >
                  {saving ? "Creating…" : "Create Task"}
                </button>
              </>
            ) : (
              <>
                <button
                  disabled
                  className="text-[13px] font-semibold px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-40"
                >
                  ← Back
                </button>
                <button
                  disabled
                  className="text-[13px] font-semibold px-4 py-2 rounded-lg bg-blue-600 text-white cursor-not-allowed opacity-40"
                >
                  Create Task
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface Props {
  settings: PMSettings;
  tasks: ClassificationRow[];
  zohoProjectMap?: Record<string, string>;
  reviewerMap?: Record<string, string>;
  developers?: Developer[];
  onTaskCreated?: () => void;
}

type FilterTab = "all" | "review" | "classified" | "in_review";

export default function TasksTab({ settings, tasks, zohoProjectMap = {}, reviewerMap = {}, developers = [], onTaskCreated }: Props) {
  const [tab, setTab] = useState<FilterTab>("all");
  const [reclassifyTarget, setReclassifyTarget] = useState<ClassificationRow | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  // Optimistic overrides: applied on top of the tasks prop until realtime re-fetch arrives
  const [overrides, setOverrides] = useState<Record<string, Partial<ClassificationRow>>>({});

  const displayTasks = tasks.map(t => overrides[t.id] ? { ...t, ...overrides[t.id] } : t);

  const isNeedsReview = (t: ClassificationRow) => t.status === "pending" || (t.confidence_score ?? 100) < 75;

  const reviewCount = displayTasks.filter(isNeedsReview).length;
  const inReviewCount = displayTasks.filter(t => t.status === "review").length;
  const classifiedCount = displayTasks.filter(t => t.status === "reviewed").length;

  const shown = tab === "all"
    ? displayTasks
    : tab === "review"
    ? displayTasks.filter(isNeedsReview)
    : tab === "in_review"
    ? displayTasks.filter(t => t.status === "review")
    : displayTasks.filter(t => t.status === "reviewed");

  function handleSave(updated: ClassificationRow) {
    setOverrides(prev => ({ ...prev, [updated.id]: updated }));
  }

  return (
    <div className={settings.theme === "dark" ? "pm-dark" : "pm-light"}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[22px] font-bold text-(--c-text) tracking-[-0.02em]">Task Queue</div>
          <div className="text-xs text-(--c-sub) mt-0.5">{displayTasks.length} items</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowCreateModal(true)}
            className="text-xs font-semibold rounded-lg px-3.5 py-1.75 cursor-pointer border bg-(--c-blue) text-white border-(--c-blue)"
          >
            + Create Task
          </button>
          {([
            ["all", "All", displayTasks.length],
            ["review", "Needs Review", reviewCount],
            ["in_review", "In Review", inReviewCount],
            ["classified", "Classified", classifiedCount],
          ] as const).map(([k, l, count]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`text-xs font-semibold rounded-lg px-3.5 py-1.75 cursor-pointer border transition-colors ${
                tab === k
                  ? "text-white bg-(--c-blue) border-(--c-blue)"
                  : "text-(--c-sub) bg-(--c-card) border-(--c-border)"
              }`}
            >
              {l}{count > 0 ? ` (${count})` : ""}
            </button>
          ))}
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        {shown.length === 0 ? (
          <div className="py-12 text-center text-(--c-muted) text-sm">
            {displayTasks.length === 0 ? "No tasks yet — waiting for Zoho webhook events." : "No tasks match this filter."}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-(--c-border)">
                {["Pri", "Task", "Customer", "Type", "AI Confidence", "Status", "Assign", "Age", "Zoho"].map(h => (
                  <th key={h} className="py-2.25 px-4 text-left text-[10px] font-bold text-(--c-muted) tracking-[0.06em] uppercase whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((t, i) => (
                <tr key={t.id} className={`${i < shown.length - 1 ? "border-b border-(--c-border)" : ""}`}>
                  <td className="py-3.25 px-4">
                    <PriorityDot priority={t.priority ?? "NORMAL"} />
                  </td>
                  <td className="py-3.25 px-4 min-w-65">
                    <div className="text-[13px] font-medium text-(--c-text) leading-[1.35]">{t.title}</div>
                    <code className="text-[10px] text-(--c-muted) font-mono">{t.id.slice(0, 8)}</code>
                  </td>
                  <td className="py-3.25 px-4">
                    <span className="text-xs text-(--c-sub)">
                      {t.customers?.company_name ?? t.customer_id}
                    </span>
                  </td>
                  <td className="py-3.25 px-4">
                    {t.task_type ? (
                      <span className="text-[11px] text-(--c-sky) bg-(--c-sky-tint2) rounded-[5px] px-2 py-px border border-(--c-sky-border)">
                        {t.task_type.replace(/_/g, " ")}
                      </span>
                    ) : (
                      <span className="text-[11px] text-(--c-muted)">—</span>
                    )}
                  </td>
                  <td className="py-3.25 px-4">
                    {t.confidence_score !== null ? (
                      <span className={`text-[11px] font-semibold rounded-[6px] px-2 py-px font-mono border ${confClass(t.confidence_score)}`}>
                        {Math.round(t.confidence_score)}%
                      </span>
                    ) : (
                      <span className="text-[11px] text-(--c-muted)">—</span>
                    )}
                  </td>
                  <td className="py-3.25 px-4">
                    {t.status === "pending" ? (
                      <button
                        onClick={() => setReclassifyTarget(t)}
                        className="text-[11px] font-semibold text-white bg-(--c-blue) rounded-[6px] px-3 py-1.25 cursor-pointer border-0"
                      >
                        Classify
                      </button>
                    ) : (
                      <div>
                        <span className="text-[11px] font-semibold text-(--c-green)">✓ Classified</span>
                        {(t.confidence_score ?? 100) < 75 ? (
                          <button
                            onClick={() => setReclassifyTarget(t)}
                            className="block text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5 cursor-pointer hover:underline"
                          >
                            Re-classify
                          </button>
                        ) : null}
                        {t.reviewed_at ? (
                          <div className="text-[10px] text-(--c-muted) mt-0.5 leading-tight">
                            {t.reviewed_by && reviewerMap[t.reviewed_by] ? `${reviewerMap[t.reviewed_by]} · ` : ""}
                            {formatAge(t.reviewed_at)}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td className="py-3.25 px-4">
                    {t.llm_eligible === "YES" ? (
                      <span className="text-[11px] text-(--c-muted)">AI</span>
                    ) : t.zoho_task_id && zohoProjectMap[t.customer_id] ? (
                      <AssignDropdown taskId={t.id} developers={developers} />
                    ) : (
                      <span className="text-[11px] text-(--c-muted)">—</span>
                    )}
                  </td>
                  <td className="py-3.25 px-4">
                    <span className="text-[11px] text-(--c-muted)">{formatAge(t.created_at)}</span>
                  </td>
                  <td className="py-3.25 px-4 text-center">
                    {t.zoho_task_id && zohoProjectMap[t.customer_id] ? (
                      <a
                        href={`https://projects.zoho.com/portal/${process.env.NEXT_PUBLIC_ZOHO_PORTAL_NAME ?? ""}#zp/task-detail/${t.zoho_task_id}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-(--c-blue) hover:opacity-70 inline-flex"
                        title="Open in Zoho"
                      >
                        <ExternalLink size={14} />
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {reclassifyTarget && (
        <ReclassifyModal
          record={reclassifyTarget}
          onClose={() => setReclassifyTarget(null)}
          onSave={handleSave}
        />
      )}
      {showCreateModal && (
        <CreateTaskModal onClose={() => setShowCreateModal(false)} onCreated={onTaskCreated} />
      )}
    </div>
  );
}
