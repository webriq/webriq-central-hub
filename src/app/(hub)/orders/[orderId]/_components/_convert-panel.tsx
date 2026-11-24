"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderSearch, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import {
  CLASSIFICATIONS,
  isValidClassificationCombo,
  type Classification,
  type PhasePlanInput,
} from "@/config/customer-phases";
import type { CustomerMatch } from "@/lib/stackshift-orders/match-customer";
import { Section, ERROR_BOX_CLASS } from "./_order-ui";
import PhaseSetupDialog, { type PhaseSetup } from "./_phase-setup-dialog";
import type { OrderDetail } from "./order-review";
import { CustomerSearch, TEXT_INPUT } from "../../_components/customer-search";
import LinkProjectDialog from "../../_components/link-project-dialog";

const MATCH_LABEL: Record<CustomerMatch["matchMethod"], string> = {
  company_name: "company name",
  contact_email: "contact email",
  email_domain: "email domain",
};

const PILL_BASE = "px-3 py-[5px] rounded-full border text-[11px] font-semibold transition-colors cursor-pointer";
const PILL_ON = "bg-[#071133] border-[#071133] text-white";
const PILL_OFF = "bg-white border-[#E2E7F2] text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533]";
const FIELD_LABEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5F6A88] mb-1.5";

export default function ConvertPanel({ order }: { order: OrderDetail }) {
  const router = useRouter();

  const [classifications, setClassifications] = useState<Classification[]>(
    order._mappedClassifications.filter((c): c is Classification =>
      (CLASSIFICATIONS as readonly string[]).includes(c)
    )
  );
  const [mode, setMode] = useState<"new_customer" | "existing_customer">(
    order._match ? "existing_customer" : "new_customer"
  );
  const [existingCustomerId, setExistingCustomerId] = useState(order._match?.customerId ?? "");
  const [projectName, setProjectName] = useState("");
  const [busy, setBusy] = useState<null | "convert" | "dismiss">(null);
  // Task 496/498 — Link existing project lives in the shared LinkProjectDialog.
  const [linkOpen, setLinkOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phaseDialogOpen, setPhaseDialogOpen] = useState(false);

  const comboValid = isValidClassificationCombo(classifications);
  // Task 357 — StackShift I skips the phase-setup dialog: its structure is the 120-day
  // customer_phases engine, seeded later at Start Onboarding. Every other classification is
  // asked how to seed its milestones.
  const isStackShiftI = classifications.includes("StackShift I");

  function toggleClassification(c: Classification) {
    setClassifications((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function validate(): string | null {
    if (classifications.length === 0) return "Select at least one classification.";
    if (!comboValid) return "At most one StackShift tier may be selected.";
    if (mode === "existing_customer" && !existingCustomerId) return "Pick an existing customer.";
    return null;
  }

  function handleCreateClick() {
    const v = validate();
    if (v) return setError(v);
    setError(null);
    // StackShift I: no dialog — draft project, phases seed at Start Onboarding.
    if (isStackShiftI) return void submitConvert("stackshift_default");
    setPhaseDialogOpen(true);
  }

  async function submitConvert(phaseSetup: PhaseSetup, phasePlan?: PhasePlanInput) {
    setError(null);
    setBusy("convert");
    try {
      const res = await fetch(`/api/stackshift-orders/${order.id}/convert`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          existingCustomerId: mode === "existing_customer" ? existingCustomerId : undefined,
          classifications,
          projectName: projectName.trim() || undefined,
          phaseSetup,
          phasePlan,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Conversion failed");
      router.push(`${V2_ROUTES.CUSTOMERS}/${json.customerId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversion failed");
      setBusy(null);
      setPhaseDialogOpen(false);
    }
  }

  async function dismiss() {
    const reason = window.prompt("Reason for dismissing this submission? (optional)");
    if (reason === null) return;
    setError(null);
    setBusy("dismiss");
    try {
      const res = await fetch(`/api/stackshift-orders/${order.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "dismiss", dismissReason: reason || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
      setBusy(null);
    }
  }

  return (
    <Section title="Convert to customer & project">
      {order._match && (
        <div className="col-span-2 flex items-start gap-2 rounded-[10px] border border-[#CDE3FF] bg-[#F2F8FF] px-3 py-2.5 text-[12px] text-[#2B4C86]">
          <Sparkles size={14} className="mt-0.5 shrink-0" />
          <span>
            Possible existing customer: <strong>{order._match.companyName}</strong>{" "}
            <span className="font-mono">({order._match.customerId})</span> — matched on {MATCH_LABEL[order._match.matchMethod]}.
          </span>
        </div>
      )}

      {error && <div className={cn("col-span-2", ERROR_BOX_CLASS)}>{error}</div>}

      <div className="col-span-2">
        <div className={FIELD_LABEL}>Classification</div>
        <div className="flex flex-wrap gap-1.5">
          {CLASSIFICATIONS.map((c) => (
            <button
              key={c}
              onClick={() => toggleClassification(c)}
              className={cn(PILL_BASE, classifications.includes(c) ? PILL_ON : PILL_OFF)}
            >
              {c}
            </button>
          ))}
        </div>
        {!comboValid && <p className="text-[11px] text-[#B45309] mt-1">At most one StackShift tier.</p>}
      </div>

      <div className="col-span-2">
        <div className={FIELD_LABEL}>Customer</div>
        <div className="flex gap-1.5 mb-2">
          {(["new_customer", "existing_customer"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn(PILL_BASE, mode === m ? PILL_ON : PILL_OFF)}>
              {m === "new_customer" ? "Create new customer" : "Link existing customer"}
            </button>
          ))}
        </div>
        {mode === "existing_customer" && (
          <CustomerSearch
            initialQuery={order._match?.companyName ?? ""}
            selectedId={existingCustomerId}
            onSelect={(c) => setExistingCustomerId(c.customer_id)}
          />
        )}
      </div>

      <div className="col-span-2">
        <div className={FIELD_LABEL}>Project name (optional)</div>
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder={`${order.company_name} Website`}
          className={TEXT_INPUT}
        />
      </div>

      <div className="col-span-2 flex items-center gap-2 pt-1">
        <button
          onClick={handleCreateClick}
          disabled={busy !== null || phaseDialogOpen}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white disabled:opacity-50 cursor-pointer transition-colors"
        >
          {busy === "convert" ? "Converting…" : "Create customer & project"}
        </button>
        <button
          onClick={dismiss}
          disabled={busy !== null || phaseDialogOpen}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold border border-[#E2E7F2] bg-white text-[#3A4565] hover:bg-[#FDF2F2] hover:text-[#9B2C2C] hover:border-[#F3C7C7] disabled:opacity-50 cursor-pointer transition-colors"
        >
          {busy === "dismiss" ? "Dismissing…" : "Dismiss"}
        </button>
        <button
          onClick={() => setLinkOpen(true)}
          disabled={busy !== null || phaseDialogOpen}
          className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold border border-[#E2E7F2] bg-white text-[#3A4565] hover:border-[#A8C6F5] disabled:opacity-50 cursor-pointer transition-colors"
        >
          <FolderSearch size={13} /> Link existing project
        </button>
      </div>

      {linkOpen && (
        <LinkProjectDialog
          orderId={order.id}
          companyName={order.company_name}
          initialCustomer={order._match ? { customer_id: order._match.customerId, company_name: order._match.companyName } : null}
          onClose={() => setLinkOpen(false)}
          onLinked={() => router.refresh()}
        />
      )}

      {phaseDialogOpen && (
        <PhaseSetupDialog
          busy={busy === "convert"}
          onCancel={() => setPhaseDialogOpen(false)}
          onConfirm={submitConvert}
        />
      )}
    </Section>
  );
}
