"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { WIKI_PRODUCTS, type WikiPageSummary, type WikiProduct } from "@/types/wiki";

// Task 395 — Create-page modal. Plain controlled form + fetch, matches the Add Asset /
// Create Task modal convention (no react-hook-form). Overlay/panel classes mirror
// `_create-task-modal.tsx` exactly for shell consistency.
const inputClass = "w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]";
const labelClass = "text-[11px] font-semibold text-[#0B1533]";

export function WikiNewPageModal({
  defaultProduct,
  defaultParentId,
  pages,
  onClose,
  onCreated,
}: {
  defaultProduct: WikiProduct;
  defaultParentId: string | null;
  pages: WikiPageSummary[];
  onClose: () => void;
  onCreated: (page: WikiPageSummary) => void;
}) {
  const [title, setTitle] = useState("");
  const [product, setProduct] = useState<WikiProduct>(defaultProduct);
  const [parentId, setParentId] = useState<string>(defaultParentId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parentOptions = pages.filter((p) => p.product === product);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/wiki/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, title: title.trim(), parentId: parentId || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Failed to create page");
        return;
      }
      const page = (await res.json()) as WikiPageSummary;
      onCreated(page);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1533]/40 p-4" onClick={saving ? undefined : onClose}>
      <div
        className="w-full max-w-md rounded-[14px] bg-white shadow-xl border border-[#E2E7F2] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E7F2]">
          <h3 className="font-heading text-[15px] font-semibold text-[#0B1533]">New page</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#94A3B8] hover:text-[#5F6A88] transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="wiki-new-page-title">Title</label>
            <input
              id="wiki-new-page-title"
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Setup & Config"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="wiki-new-page-space">Space</label>
            <select
              id="wiki-new-page-space"
              className={cn(inputClass, "cursor-pointer")}
              value={product}
              onChange={(e) => { setProduct(e.target.value as WikiProduct); setParentId(""); }}
            >
              {WIKI_PRODUCTS.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="wiki-new-page-parent">Parent page (optional)</label>
            <select
              id="wiki-new-page-parent"
              className={cn(inputClass, "cursor-pointer")}
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">None — top level</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-[12px] text-[#C0392B]">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-[12.5px] font-semibold text-[#5F6A88] px-4 py-2 rounded-full border border-[#E2E7F2] bg-white cursor-pointer transition-colors hover:border-[#A8C6F5] disabled:opacity-45"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="text-[12.5px] font-semibold text-white px-4 py-2 rounded-full bg-[#007BFF] cursor-pointer transition-colors hover:bg-[#0063D6] disabled:opacity-45 flex items-center gap-1.5"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              Create page
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
