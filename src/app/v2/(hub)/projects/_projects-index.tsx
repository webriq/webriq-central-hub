"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderKanban, Plus, Search, X, Loader2 } from "lucide-react";
import { V2_ROUTES } from "@/config/constants";
import { ProjectStatusBadge, PROJECT_TYPES } from "./_pm-shared";

export type ProjectListItem = {
  id: string;
  name: string;
  project_type: string;
  status: string;
  customer_id: string;
  company_name: string;
  description: string | null;
  task_total: number;
  task_done: number;
};

export type CustomerOption = { customer_id: string; company_name: string };

const STATUS_FILTERS = ["all", "active", "on_hold", "completed", "archived"] as const;

export default function ProjectsIndex({
  projects,
  customers,
}: {
  projects: ProjectListItem[];
  customers: CustomerOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerFilter = searchParams.get("customer") ?? "";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [showCreate, setShowCreate] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (customerFilter && p.customer_id !== customerFilter) return false;
      if (status !== "all" && p.status !== status) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.company_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [projects, search, status, customerFilter]);

  const activeCustomer = customers.find((c) => c.customer_id === customerFilter);

  return (
    <div className="px-8 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900 tracking-[-0.02em]">Projects</h1>
          <p className="text-[13px] text-slate-500 mt-0.5">
            {filtered.length} project{filtered.length === 1 ? "" : "s"}
            {activeCustomer ? ` · ${activeCustomer.company_name}` : ""}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-[13px] font-medium hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <Plus size={16} /> New Project
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects or customers…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-700 outline-none focus:border-slate-400 placeholder:text-slate-400"
          />
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium capitalize transition-colors cursor-pointer ${
                status === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {s === "all" ? "All" : s.replace("_", " ")}
            </button>
          ))}
        </div>
        {customerFilter && (
          <button
            onClick={() => router.push(V2_ROUTES.PROJECTS)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[12px] text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            <X size={13} /> Clear customer
          </button>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
            <FolderKanban size={26} className="text-slate-400" />
          </div>
          <div className="text-center">
            <div className="text-[15px] font-semibold text-slate-700">No projects found</div>
            <p className="text-[13px] text-slate-400 mt-1">Create a project to start tracking work.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const pct = p.task_total > 0 ? Math.round((p.task_done / p.task_total) * 100) : 0;
            return (
              <button
                key={p.id}
                onClick={() => router.push(`${V2_ROUTES.PROJECTS}/${p.id}`)}
                className="text-left rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-5 hover:border-slate-300 hover:shadow-md transition-all cursor-pointer flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-slate-900 truncate">{p.name}</div>
                    <div className="text-[12px] text-slate-400 mt-0.5 truncate">{p.company_name}</div>
                  </div>
                  <ProjectStatusBadge status={p.status} />
                </div>
                <span className="text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 self-start">
                  {p.project_type}
                </span>
                {p.description && (
                  <p className="text-[12px] text-slate-500 line-clamp-2 leading-relaxed">{p.description}</p>
                )}
                <div className="mt-auto pt-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                    <span>{p.task_done}/{p.task_total} tasks</span>
                    <span className="font-mono">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateProjectModal
          customers={customers}
          defaultCustomer={customerFilter}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function CreateProjectModal({
  customers,
  defaultCustomer,
  onClose,
  onCreated,
}: {
  customers: CustomerOption[];
  defaultCustomer: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState(defaultCustomer || customers[0]?.customer_id || "");
  const [projectType, setProjectType] = useState<string>(PROJECT_TYPES[0]);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !customerId) {
      setError("Name and customer are required");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/v2/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        customer_id: customerId,
        project_type: projectType,
        description: description.trim() || undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Failed to create project");
      setSaving(false);
      return;
    }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-[15px] font-semibold text-slate-900">New Project</h2>
          <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <Field label="Project name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400"
              placeholder="e.g. Marketing site redesign"
            />
          </Field>
          <Field label="Customer">
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400 bg-white"
            >
              {customers.length === 0 && <option value="">No customers</option>}
              {customers.map((c) => (
                <option key={c.customer_id} value={c.customer_id}>{c.company_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Project type">
            <select
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400 bg-white"
            >
              {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Description (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400 resize-none"
            />
          </Field>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] text-slate-600 hover:bg-slate-100 cursor-pointer">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-[13px] font-medium hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
