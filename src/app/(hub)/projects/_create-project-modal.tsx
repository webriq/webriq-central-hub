"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { PROJECT_TYPES } from "./_pm-shared";
import type { CustomerOption } from "./_projects-index";

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold text-[#0B1533]">{label}</span>
      {children}
    </label>
  );
}

export function CreateProjectModal({
  customers, defaultCustomer, onClose, onCreated,
}: {
  customers: CustomerOption[];
  defaultCustomer: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState(defaultCustomer || customers[0]?.customer_id || "");
  const [projectType, setProjectType] = useState<string>(PROJECT_TYPES[0]);
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !customerId) { setError("Name and customer are required"); return; }
    setSaving(true);
    setError(null);
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    const res = await fetch("/api/v2/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), customer_id: customerId, project_type: projectType, tags: tags.length > 0 ? tags : undefined }),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071133]/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-[14px] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] border border-[#E2E7F2] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDF0F7]">
          <h2 className="font-heading text-[15px] font-semibold text-[#0B1533]">New Project</h2>
          <button onClick={onClose} className="p-1 rounded-full text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#EDF0F7] cursor-pointer transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <ModalField label="Project name">
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
              className="w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]"
              placeholder="e.g. Marketing site redesign" />
          </ModalField>
          <ModalField label="Customer">
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
              className="w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]">
              {customers.length === 0 && <option value="">No customers</option>}
              {customers.map((c) => <option key={c.customer_id} value={c.customer_id}>{c.company_name}</option>)}
            </select>
          </ModalField>
          <ModalField label="Project type">
            <select value={projectType} onChange={(e) => setProjectType(e.target.value)}
              className="w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]">
              {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </ModalField>
          <ModalField label="Tags (comma-separated)">
            <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)}
              className="w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]"
              placeholder="e.g. Premium, StackShift, Standard" />
          </ModalField>
          {error && <p className="text-[12px] text-[#C0392B]">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EDF0F7] bg-[#F4F6FB]">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-[13px] font-semibold text-[#3A4565] border border-[#E2E7F2] bg-white hover:border-[#A8C6F5] hover:text-[#0B1533] cursor-pointer transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#007BFF] text-white text-[13px] font-semibold hover:bg-[#0063D6] disabled:opacity-45 cursor-pointer transition-colors">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
