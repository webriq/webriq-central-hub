"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Tag, X } from "lucide-react";
import { CLASSIFICATIONS } from "@/config/customer-phases";

// Task 268 — small modal to update a project's classification (customer_products.classification,
// joined via projects.customer_product_id). PATCHes the new
// /api/v2/projects/[projectId]/classification route ([projectId] here is the display project_id,
// matching every other route in that directory). Rendered via createPortal(document.body) — same
// reasoning as ManageCollaboratorsModal/SetProjectOwnerModal (avoids being a DOM descendant of the
// card's own <Link>).
export function UpdateClassificationModal({
  open, onClose, projectId, projectName, currentClassification, onUpdated,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  currentClassification: string | null;
  onUpdated: (classification: string) => void;
}) {
  const [value, setValue] = useState(currentClassification ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function handleClose() {
    setValue(currentClassification ?? "");
    setError(null);
    onClose();
  }

  async function handleSave() {
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/projects/${projectId}/classification`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classification: value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update classification");
      }
      onUpdated(value);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update classification");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#071133]/40 p-4"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] p-5 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center shrink-0 w-9 h-9 rounded-full bg-[#E5F1FF] text-[#007BFF]">
              <Tag size={16} />
            </div>
            <div className="flex flex-col gap-0.5 pt-0.5">
              <h2 className="text-[14px] font-semibold text-[#0B1533]">Update classification</h2>
              <p className="text-[12px] text-[#5F6A88] truncate max-w-[260px]">{projectName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            title="Close"
            className="shrink-0 cursor-pointer rounded-md border-none bg-transparent p-1 text-[#5F6A88] transition-colors hover:bg-[#F4F6FB] hover:text-[#3A4565]"
          >
            <X size={15} />
          </button>
        </div>

        {error && <p className="text-[11.5px] text-[#C0392B]">{error}</p>}

        <select
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-md border border-[#E2E7F2] bg-white px-2.5 py-1.5 text-[12px] text-[#0B1533] outline-none transition-colors focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] disabled:opacity-50"
        >
          <option value="" disabled>Select classification…</option>
          {CLASSIFICATIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="cursor-pointer rounded-full border-none bg-transparent px-3 py-1.5 text-[11.5px] font-medium text-[#5F6A88] transition-colors hover:text-[#3A4565] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || !value || value === currentClassification}
            className="cursor-pointer rounded-full border-none bg-[#007BFF] px-3.5 py-1.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-[#0063D6] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
