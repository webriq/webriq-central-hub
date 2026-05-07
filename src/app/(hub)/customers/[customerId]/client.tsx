"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { CustomerRow, CustomerProductRow } from "@/types/database";

interface CustomerProfileClientProps {
  customer: CustomerRow & { customer_products: CustomerProductRow[] };
}

const statusClass = (status: string) => {
  const map: Record<string, string> = {
    onboarding: "bg-[#FFF4EC] text-orange-500",
    active: "bg-green-50 text-green-600",
    inactive: "bg-slate-100 text-slate-500",
  };
  return map[status] ?? "bg-slate-100 text-slate-500";
};

const PRODUCT_COLORS: Record<string, string> = {
  StackShift: "#3358F4",
  PublishForge: "#7C3AED",
  CiteForge: "#22C55E",
  PipelineForge: "#F97316",
};

const sectionCls = "bg-white border border-slate-200 rounded-xl p-5 shadow-[0_1px_4px_rgba(0,0,0,0.05)] mb-4";
const sectionTitleCls = "text-[10px] font-bold text-slate-400 tracking-[0.06em] uppercase mb-3.5";

export default function CustomerProfileClient({ customer }: CustomerProfileClientProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    const onboardingUrl = `${window.location.origin}/onboarding/${customer.customer_id}`;
    navigator.clipboard.writeText(onboardingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const status = customer.status ?? "onboarding";
  const products = customer.customer_products ?? [];

  return (
    <>
      {/* Header */}
      <div className={cn(sectionCls, "px-6")}>
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h1 className="text-[22px] font-bold text-slate-900 mb-2">{customer.company_name}</h1>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-sm font-semibold text-slate-600 tracking-[0.04em]">
                {customer.customer_id}
              </span>
              <span className={cn("inline-block px-2.5 py-px rounded text-[11px] font-semibold", statusClass(status))}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </div>
          </div>
          <div className="flex gap-2.5 flex-wrap">
            <button
              onClick={() => router.push("/onboarding")}
              className="font-[inherit] py-2 px-4 bg-transparent text-brand text-xs font-semibold border-[1.5px] border-brand rounded-full cursor-pointer"
            >
              Edit
            </button>
            <button
              onClick={handleCopyLink}
              className={cn(
                "font-[inherit] py-2 px-4 text-white text-xs font-semibold border-none rounded-full cursor-pointer transition-colors duration-200",
                copied ? "bg-green-500" : "bg-brand-orange"
              )}
            >
              {copied ? "Copied! ✓" : "Copy Onboarding Link"}
            </button>
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <div className={sectionCls}>
        <div className={sectionTitleCls}>Contact Information</div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-6 gap-y-3">
          {[
            { label: "Contact Name", value: customer.contact_name || "—" },
            { label: "Email", value: customer.contact_email || "—" },
            { label: "Zoho Account ID", value: customer.zoho_account_id || "—", mono: true },
            { label: "Communication Tone", value: customer.communication_tone || "—" },
            {
              label: "Created",
              value: new Date(customer.created_at).toLocaleDateString("en-US", {
                year: "numeric", month: "long", day: "numeric",
              }),
            },
          ].map(({ label, value, mono }) => (
            <div key={label}>
              <div className="text-[11px] text-slate-400 mb-0.5">{label}</div>
              <div className={cn("text-[13px] text-slate-900 font-medium", mono && "font-mono")}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Products */}
      <div className={sectionCls}>
        <div className={sectionTitleCls}>Products ({products.length})</div>
        {products.length === 0 ? (
          <p className="text-[13px] text-slate-400 text-center py-4">
            No products associated yet.{" "}
            <Link href="/onboarding" className="text-brand">Add a product</Link>
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
            {products.map((product) => {
              const color = PRODUCT_COLORS[product.product_name] ?? "#94A3B8";
              const isComplete = product.onboarding_complete;
              return (
                <div
                  key={product.id}
                  className="rounded-[10px] p-4"
                  style={{
                    border: `1px solid ${isComplete ? "#DCFCE7" : "#E2E8F0"}`,
                    background: isComplete ? "#FAFDFC" : "#fff",
                  }}
                >
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                        style={{ background: `${color}18`, color }}
                      >
                        {product.product_name[0]}
                      </div>
                      <span className="text-sm font-bold text-slate-900">{product.product_name}</span>
                    </div>
                    <span
                      className={cn(
                        "inline-block px-2 py-px rounded text-[11px] font-semibold",
                        isComplete ? "bg-green-50 text-green-600" : "bg-[#FFF4EC] text-orange-500"
                      )}
                    >
                      {isComplete ? "Complete" : "In Progress"}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 h-[5px] bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{
                          width: `${product.completed_percentage ?? 0}%`,
                          background: isComplete ? "#22C55E" : color,
                        }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {Math.round(product.completed_percentage ?? 0)}%
                    </span>
                  </div>

                  {/* Links */}
                  <div className="flex flex-col gap-1.5 text-xs">
                    {product.product_instance_id && (
                      <div className="text-slate-500">
                        <span className="font-semibold">Instance: </span>
                        <span className="font-mono">{product.product_instance_id}</span>
                      </div>
                    )}
                    {product.sanity_project_id && (
                      <div className="text-slate-500">
                        <span className="font-semibold">Sanity: </span>
                        <span>{product.sanity_project_id}</span>
                      </div>
                    )}
                    {product.zoho_project_id && (
                      <div className="text-slate-500">
                        <span className="font-semibold">Zoho: </span>
                        <span>{product.zoho_project_id}</span>
                      </div>
                    )}
                    {product.github_repo && (
                      <div>
                        <a
                          href={product.github_repo}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand font-medium"
                        >
                          GitHub Repo →
                        </a>
                      </div>
                    )}
                  </div>

                  <a
                    href={`/onboarding/${customer.customer_id}`}
                    className="block mt-3 text-xs text-brand font-semibold no-underline"
                  >
                    View Onboarding Form →
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Activity (Stub) */}
      <div className={sectionCls}>
        <div className={sectionTitleCls}>Recent Activity</div>
        <div className="text-[13px] text-slate-400 text-center py-6 bg-slate-50 rounded-lg border border-dashed border-slate-200">
          Activity will appear here once classification is active (Sprint 2)
        </div>
      </div>
    </>
  );
}
