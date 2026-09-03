"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { CLASSIFICATIONS, isValidClassificationCombo, type Classification } from "@/config/customer-phases";
import type { CustomerMatch } from "@/lib/stackshift-orders/match-customer";
import { Section, ERROR_BOX_CLASS } from "./_order-ui";
import type { OrderDetail } from "./order-review";

const MATCH_LABEL: Record<CustomerMatch["matchMethod"], string> = {
  company_name: "company name",
  contact_email: "contact email",
  email_domain: "email domain",
};

const PILL_BASE = "px-3 py-[5px] rounded-full border text-[11px] font-semibold transition-colors cursor-pointer";
const PILL_ON = "bg-[#071133] border-[#071133] text-white";
const PILL_OFF = "bg-white border-[#E2E7F2] text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533]";
const FIELD_LABEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5F6A88] mb-1.5";
const TEXT_INPUT =
  "w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none border-[#E2E7F2] bg-white text-[#3A4565] focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14]";

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
  const [customerQuery, setCustomerQuery] = useState(order._match?.companyName ?? "");
  const [customerResults, setCustomerResults] = useState<{ customer_id: string; company_name: string }[]>([]);
  const [projectName, setProjectName] = useState("");
  const [busy, setBusy] = useState<null | "convert" | "dismiss">(null);
  const [error, setError] = useState<string | null>(null);

  const comboValid = isValidClassificationCombo(classifications);

  function toggleClassification(c: Classification) {
    setClassifications((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function searchCustomers(q: string) {
    setCustomerQuery(q);
    if (q.trim().length < 2) { setCustomerResults([]); return; }
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(q.trim())}&limit=8`);
      const json = await res.json();
      if (Array.isArray(json)) {
        setCustomerResults(
          json.map((c: { customer_id: string; company_name: string }) => ({
            customer_id: c.customer_id,
            company_name: c.company_name,
          }))
        );
      }
    } catch {
      setCustomerResults([]);
    }
  }

  async function convert() {
    setError(null);
    if (classifications.length === 0) return setError("Select at least one classification.");
    if (!comboValid) return setError("At most one StackShift tier may be selected.");
    if (mode === "existing_customer" && !existingCustomerId) return setError("Pick an existing customer.");
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
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Conversion failed");
      router.push(`${V2_ROUTES.CUSTOMERS}/${json.customerId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversion failed");
      setBusy(null);
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
          <div className="relative">
            <input
              value={customerQuery}
              onChange={(e) => searchCustomers(e.target.value)}
              placeholder="Search customers…"
              className={TEXT_INPUT}
            />
            {customerResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-[10px] border border-[#E2E7F2] bg-white shadow-lg overflow-hidden">
                {customerResults.map((c) => (
                  <button
                    key={c.customer_id}
                    onClick={() => {
                      setExistingCustomerId(c.customer_id);
                      setCustomerQuery(c.company_name);
                      setCustomerResults([]);
                    }}
                    className="w-full text-left px-3 py-2 text-[12px] hover:bg-[#F0F7FF] transition-colors"
                  >
                    <span className="text-[#0B1533]">{c.company_name}</span>{" "}
                    <span className="font-mono text-[#5F6A88]">{c.customer_id}</span>
                  </button>
                ))}
              </div>
            )}
            {existingCustomerId && (
              <p className="text-[11px] text-[#5F6A88] mt-1 font-mono">Selected: {existingCustomerId}</p>
            )}
          </div>
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
          onClick={convert}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white disabled:opacity-50 cursor-pointer transition-colors"
        >
          {busy === "convert" ? "Converting…" : "Create customer & project"}
        </button>
        <button
          onClick={dismiss}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold border border-[#E2E7F2] bg-white text-[#3A4565] hover:bg-[#FDF2F2] hover:text-[#9B2C2C] hover:border-[#F3C7C7] disabled:opacity-50 cursor-pointer transition-colors"
        >
          {busy === "dismiss" ? "Dismissing…" : "Dismiss"}
        </button>
      </div>
    </Section>
  );
}
