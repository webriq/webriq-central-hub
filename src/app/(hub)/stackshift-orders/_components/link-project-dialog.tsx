"use client";

import { useEffect, useRef, useState } from "react";
import { FolderSearch, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { CustomerSearch, type CustomerOption } from "./customer-search";

type LinkableProject = { id: string; project_id: string | null; name: string; status: string };

async function fetchProjects(customerId: string): Promise<LinkableProject[]> {
  try {
    const res = await fetch(`/api/v2/projects?customer_id=${encodeURIComponent(customerId)}`);
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

const FIELD_LABEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5F6A88] mb-1.5";

// Task 496 → 498 — "Link existing project" as a modal, shared by the order detail Convert panel and
// the Orders table row menu: customer → one of its projects → danger ConfirmDialog → POST
// /link-project. The parent mounts it only while open, so state starts fresh each time.
export default function LinkProjectDialog({
  orderId,
  companyName,
  initialCustomer,
  onClose,
  onLinked,
}: {
  orderId: string;
  companyName: string;
  initialCustomer?: CustomerOption | null;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [customer, setCustomer] = useState<CustomerOption | null>(initialCustomer ?? null);
  const [projects, setProjects] = useState<LinkableProject[] | null>(null);
  const [selected, setSelected] = useState<LinkableProject | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the latest customer's response is applied, so switching customers quickly can't show stale projects.
  const latest = useRef(initialCustomer?.customer_id ?? "");

  function load(customerId: string) {
    latest.current = customerId;
    void fetchProjects(customerId).then((rows) => {
      if (latest.current === customerId) setProjects(rows);
    });
  }

  const initialId = initialCustomer?.customer_id;
  useEffect(() => {
    if (initialId) load(initialId);
  }, [initialId]);

  function pickCustomer(c: CustomerOption) {
    setCustomer(c);
    setProjects(null);
    setSelected(null);
    load(c.customer_id);
  }

  async function submit() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/stackshift-orders/${orderId}/link-project`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: selected.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Link failed");
      onLinked();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Link failed");
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0B1533]/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-project-title"
        className="w-full max-w-[480px] rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-[#EDF0F7]">
          <div>
            <h2 id="link-project-title" className="text-[14px] font-semibold text-[#0B1533]">Link existing project</h2>
            <p className="text-[12px] text-[#5F6A88] mt-0.5">
              Order from {companyName}. For a project that already exists — no customer or project is created.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-full text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#F4F6FB] cursor-pointer transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {error && (
            <div className="rounded-[10px] border border-[#F3C7C7] bg-[#FDE8E6] px-3 py-2 text-[12px] text-[#C0392B]">{error}</div>
          )}
          <div>
            <div className={FIELD_LABEL}>Customer</div>
            <CustomerSearch
              initialQuery={initialCustomer?.company_name ?? companyName}
              selectedId={customer?.customer_id ?? ""}
              onSelect={pickCustomer}
            />
          </div>
          {customer && (
            <div>
              <div className={FIELD_LABEL}>Project</div>
              {projects === null ? (
                <div className="flex flex-col gap-1" aria-label="Loading projects">
                  {[0, 1, 2].map((i) => <div key={i} className="h-9 rounded-[8px] bg-[#F4F6FB] animate-pulse" />)}
                </div>
              ) : projects.length === 0 ? (
                <p className="flex items-center gap-2 text-[12px] text-[#5F6A88]">
                  <FolderSearch size={14} /> No projects for this customer yet — pick another customer.
                </p>
              ) : (
                <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelected(p)}
                      aria-pressed={selected?.id === p.id}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-[8px] border text-[12px] transition-colors cursor-pointer",
                        selected?.id === p.id ? "border-[#007BFF] bg-[#F0F7FF]" : "border-[#E2E7F2] bg-white hover:bg-[#F0F7FF]"
                      )}
                    >
                      <span className="text-[#0B1533] font-medium">{p.name}</span>{" "}
                      <span className="font-mono text-[#5F6A88]">{p.project_id ?? ""}</span>{" "}
                      <span className="text-[#5F6A88]">· {p.status.replace("_", " ")}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 pb-4">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-full text-[12px] font-medium text-[#5F6A88] hover:text-[#0B1533] cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={!selected || busy}
            className="px-3.5 py-1.5 rounded-full bg-[#007BFF] text-white text-[12px] font-semibold hover:bg-[#0063D6] cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
          >
            Link project
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen && !!selected}
        title={`Link this order to "${selected?.name ?? ""}"?`}
        body={`The order will be marked Converted and linked to ${customer?.company_name ?? ""} / ${selected?.project_id ?? selected?.id ?? ""}. No customer or project is created. This can't be undone from the Orders page.`}
        confirmLabel={busy ? "Linking…" : "Link project"}
        confirmDisabled={busy}
        onConfirm={submit}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
