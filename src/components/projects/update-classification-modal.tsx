"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Tag, X } from "lucide-react";
import {
  CLASSIFICATIONS,
  STACKSHIFT_VARIANTS,
  isValidClassificationCombo,
  type Classification,
} from "@/config/customer-phases";

// Task 268 — small modal to update a project's classifications (customer_products.classification +
// classifications, joined via projects.customer_product_id). PATCHes the new
// /api/v2/projects/[projectId]/classification route ([projectId] here is the display project_id,
// matching every other route in that directory). Rendered via createPortal(document.body) — same
// reasoning as ManageCollaboratorsModal/SetProjectOwnerModal (avoids being a DOM descendant of the
// card's own <Link>).
//
// Multi-select (not the original single <select>): the array is the source the listing tabs filter
// on, so a single-select editor could only ever add entries and left the project showing under its
// old tab. At most one StackShift variant is selectable — picking another replaces the current one,
// mirroring the intake wizard's isValidClassificationCombo rule.
export function UpdateClassificationModal({
  open, onClose, projectId, projectName, currentClassifications, onUpdated,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  currentClassifications: string[];
  onUpdated: (classifications: Classification[]) => void;
}) {
  // Catalog order, so the derived primary (variant ?? first) is deterministic.
  const normalized = () => CLASSIFICATIONS.filter((c) => currentClassifications.includes(c));
  const [selected, setSelected] = useState<Classification[]>(normalized);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function handleClose() {
    setSelected(normalized());
    setError(null);
    onClose();
  }

  function toggle(c: Classification) {
    setSelected((prev) => {
      if (prev.includes(c)) return prev.filter((x) => x !== c);
      const base = STACKSHIFT_VARIANTS.includes(c) ? prev.filter((x) => !STACKSHIFT_VARIANTS.includes(x)) : prev;
      return CLASSIFICATIONS.filter((x) => x === c || base.includes(x));
    });
  }

  const unchanged =
    selected.length === normalized().length && selected.every((c) => currentClassifications.includes(c));

  async function handleSave() {
    if (selected.length === 0 || !isValidClassificationCombo(selected)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/projects/${projectId}/classification`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classifications: selected }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update classification");
      }
      onUpdated(selected);
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

        <div className="flex flex-col gap-1 rounded-md border border-[#E2E7F2] p-1.5">
          {CLASSIFICATIONS.map((c) => (
            <label
              key={c}
              className="flex items-center gap-2 rounded px-1.5 py-1 text-[12px] text-[#0B1533] transition-colors hover:bg-[#F4F6FB]"
            >
              <input
                type="checkbox"
                checked={selected.includes(c)}
                disabled={busy}
                onChange={() => toggle(c)}
                className="h-3.5 w-3.5 accent-[#007BFF]"
              />
              {c}
            </label>
          ))}
        </div>
        <p className="text-[11px] text-[#5F6A88]">Select everything that applies. One StackShift variant at a time.</p>

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
            disabled={busy || selected.length === 0 || unchanged}
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
