"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import type { CustomerMatch } from "@/lib/stackshift-orders/match-customer";
import type { Database } from "@/types/database";
import { Section, Field, FileRow, StatusPill, ERROR_BOX_CLASS } from "./_order-ui";
import ConvertPanel from "./_convert-panel";

type OrderRow = Database["public"]["Tables"]["stackshift_orders"]["Row"];

export type OrderDetail = OrderRow & {
  _mappedClassifications: string[];
  _unknownServices: string[];
  _validCombo: boolean;
  _match: CustomerMatch | null;
  _linkedCustomerName: string | null;
  _linkedProjectName: string | null;
};

export default function OrderReview({ order }: { order: OrderDetail }) {
  const router = useRouter();
  const [fileError, setFileError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);

  async function openFile(which: "proposal" | "spec") {
    try {
      const res = await fetch(`/api/stackshift-orders/${order.id}/file?which=${which}&download=1`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to get file");
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "Failed to open file");
    }
  }

  async function reopen() {
    setReopening(true);
    try {
      const res = await fetch(`/api/stackshift-orders/${order.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reopen" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Reopen failed");
      router.refresh();
    } catch {
      setReopening(false);
    }
  }

  return (
    <div className="max-w-[900px] mx-auto px-8 py-6">
      <Link
        href={V2_ROUTES.STACKSHIFT_ORDERS}
        className="inline-flex items-center gap-1.5 text-[12px] text-[#5F6A88] hover:text-[#0B1533] transition-colors mb-4"
      >
        <ArrowLeft size={14} /> Back to StackShift Orders
      </Link>

      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#0B1533]">{order.company_name}</h1>
          <p className="text-[13px] text-[#5F6A88] mt-0.5">
            Submitted {formatDate(order.submitted_at ?? order.created_at)}
          </p>
        </div>
        <StatusPill status={order.status} />
      </div>

      {fileError && <div className={cn("mb-4", ERROR_BOX_CLASS)}>{fileError}</div>}

      <div className="grid gap-4">
        <Section title="Customer information">
          <Field label="Contact name" value={order.contact_name} />
          <Field label="Business email" value={order.business_email} />
          <Field label="Mobile phone" value={order.mobile_phone} />
          <Field label="Website" value={order.website} />
          <Field label="Billing name" value={order.billing_name} />
          <Field label="Billing email" value={order.billing_email} />
          <Field label="Company address" value={order.company_address} full />
        </Section>

        <Section title="StackShift selection">
          <div className="col-span-2 flex flex-wrap gap-1.5">
            {order.services.length === 0 ? (
              <span className="text-[13px] text-[#5F6A88]">—</span>
            ) : (
              order.services.map((s) => (
                <span key={s} className="px-2.5 py-1 rounded-full bg-[#EEF3FF] text-[11px] font-medium text-[#2B4C86]">
                  {s}
                </span>
              ))
            )}
          </div>
          <Field
            label="Mapped classification"
            value={order._mappedClassifications.join(", ") || "— (none auto-mapped)"}
            full
          />
          {order._unknownServices.length > 0 && (
            <Field label="Unmapped services" value={order._unknownServices.join(", ")} full />
          )}
          {!order._validCombo && order.status === "pending_review" && (
            <p className="col-span-2 text-[12px] text-[#B45309]">
              Multiple StackShift tiers were selected — pick exactly one below before converting.
            </p>
          )}
        </Section>

        <Section title="Documents">
          <FileRow label="Proposal document" filename={order.proposal_filename} onOpen={() => openFile("proposal")} />
          {order.flowforge_spec_filename && (
            <FileRow label="FlowForge spec" filename={order.flowforge_spec_filename} onOpen={() => openFile("spec")} />
          )}
        </Section>

        <Section title="Approval">
          <Field label="Approved by" value={order.approved_by} />
          <Field label="Approval date" value={order.approval_date ? formatDate(order.approval_date) : null} />
          <Field label="Terms accepted" value={order.terms_accepted ? "Yes" : "No"} />
        </Section>

        {order.status === "converted" ? (
          <Section title="Outcome">
            <p className="col-span-2 text-[13px] text-[#3A4565]">
              {order.is_new_customer ? "Created new customer" : "Linked existing customer"}
              {order._linkedCustomerName && order.customer_id && (
                <>
                  {" — "}
                  <Link className="text-[#007BFF] hover:underline" href={`${V2_ROUTES.CUSTOMERS}/${order.customer_id}`}>
                    {order._linkedCustomerName}
                  </Link>
                </>
              )}
            </p>
            {order._linkedProjectName && (
              <p className="col-span-2 text-[13px] text-[#3A4565]">
                Draft project: <span className="font-medium text-[#0B1533]">{order._linkedProjectName}</span>{" "}
                (start the 120-day programme from the project when ready)
              </p>
            )}
          </Section>
        ) : order.status === "dismissed" ? (
          <Section title="Dismissed">
            <Field label="Reason" value={order.dismiss_reason || "—"} full />
            <div className="col-span-2">
              <button
                onClick={reopen}
                disabled={reopening}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold border border-[#E2E7F2] bg-white text-[#3A4565] hover:bg-[#F0F7FF] disabled:opacity-50 cursor-pointer transition-colors"
              >
                {reopening ? "Reopening…" : "Reopen for review"}
              </button>
            </div>
          </Section>
        ) : (
          <ConvertPanel order={order} />
        )}
      </div>
    </div>
  );
}
