"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import type { ProductName } from "@/types/hub";
import ProductSelector from "@/components/onboarding/product-selector";
import { ROUTES } from "@/config/constants";

type Step = "info" | "products" | "review";

const inputCls = "font-[inherit] w-full text-[13px] py-[9px] px-3 border border-slate-200 rounded-lg text-slate-900 bg-white outline-none box-border";
const labelCls = "block text-xs font-semibold text-slate-700 mb-[5px]";

export default function NewCustomerPage() {
  const [step, setStep] = useState<Step>("info");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<ProductName[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCustomer, setCreatedCustomer] = useState<{ customer_id: string; company_name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const customerRes = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName.trim(),
          contact_name: contactName.trim() || undefined,
          contact_email: contactEmail.trim() || undefined,
        }),
      });
      if (!customerRes.ok) {
        const body = await customerRes.json().catch(() => ({}));
        throw new Error(body.error || body.details?.company_name || "Failed to create customer");
      }
      const customer = await customerRes.json();
      for (const product of selectedProducts) {
        await fetch(`/api/customers/${customer.customer_id}/products`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_name: product }),
        });
      }
      setCreatedCustomer(customer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!createdCustomer) return;
    const url = `${window.location.origin}/onboard/${createdCustomer.customer_id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Success state
  if (createdCustomer) {
    const onboardingUrl = `${window.location.origin}/onboard/${createdCustomer.customer_id}`;
    return (
      <div className="p-6 max-w-150 mx-auto">
        <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-[0_1px_4px_rgba(0,0,0,0.05)] text-center">
          <div className="w-14 h-14 rounded-full bg-green-50 text-green-500 text-[28px] flex items-center justify-center mx-auto mb-4">
            ✓
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Customer Created Successfully</h1>
          <p className="text-[13px] text-slate-500 mb-5">
            {createdCustomer.company_name} has been created with {selectedProducts.length} product(s).
          </p>

          {/* Customer ID */}
          <div className="bg-indigo-50 border border-brand/15 rounded-lg px-4 py-3 mb-4 text-left">
            <div className="text-[10px] font-bold text-brand tracking-[0.06em] uppercase mb-1">Customer ID</div>
            <div className="font-mono text-base font-bold text-slate-900 tracking-[0.08em]">
              {createdCustomer.customer_id}
            </div>
          </div>

          {/* Onboarding URL */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 mb-6 text-left">
            <div className="text-[10px] font-bold text-slate-500 tracking-[0.06em] uppercase mb-1">
              Onboarding URL (Login-Free)
            </div>
            <div className="text-xs text-slate-600 break-all mb-2">{onboardingUrl}</div>
            <button
              onClick={handleCopyLink}
              className={`font-[inherit] text-xs font-semibold py-1.5 px-3.5 border-none rounded-full cursor-pointer transition-colors ${copied ? "bg-green-500 text-white" : "bg-brand text-white"}`}
            >
              {copied ? "✓ Copied!" : "Copy Link"}
            </button>
          </div>

          <div className="flex gap-3 justify-center">
            <a
              href={`/dashboard/customers/${createdCustomer.customer_id}`}
              className="font-[inherit] py-2.5 px-5.5 bg-brand-orange text-white text-[13px] font-semibold rounded-full no-underline inline-block"
            >
              View Customer Profile
            </a>
            <a
              href={ROUTES.DASHBOARD}
              className="font-[inherit] py-2.5 px-5.5 bg-transparent text-slate-500 text-[13px] font-medium rounded-full no-underline border-[1.5px] border-slate-200 inline-block"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  const steps = [
    { key: "info" as Step, label: "Company Info" },
    { key: "products" as Step, label: "Products" },
    { key: "review" as Step, label: "Review & Create" },
  ];

  const canProceedFromInfo = companyName.trim().length > 0;
  const canProceedFromProducts = selectedProducts.length > 0;

  return (
    <div className="p-6 overflow-y-auto flex-1">
      <div className="max-w-165 mx-auto">
        {/* Step indicator */}
        <div className="flex items-center mb-6">
          {steps.map((s, i) => {
            const currentIdx = steps.findIndex((s2) => s2.key === step);
            const active = i === currentIdx;
            const done = i < currentIdx;
            return (
              <React.Fragment key={s.key}>
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full text-[13px] font-bold flex items-center justify-center",
                      done || active ? "bg-brand text-white" : "bg-slate-200 text-slate-400"
                    )}
                  >
                    {done ? "✓" : i + 1}
                  </div>
                  <span
                    className={cn(
                      "text-[11px] whitespace-nowrap",
                      active ? "font-bold text-brand" : "font-medium text-slate-400"
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={cn("flex-1 h-0.5 mx-2 mb-5.5", done ? "bg-brand" : "bg-slate-200")}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 mb-4 text-[13px] text-red-600">
              {error}
            </div>
          )}

          {step === "info" && (
            <div className="flex flex-col gap-4">
              <h2 className="text-[15px] font-bold text-slate-900 mb-1">Company Information</h2>
              <div className="flex gap-3.5">
                <div className="flex-1">
                  <label className={labelCls}>
                    Company Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Acme Corp"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className={inputCls}
                    autoFocus
                  />
                </div>
                <div className="flex-1">
                  <label className={labelCls}>Primary Contact</label>
                  <input
                    type="text"
                    placeholder="Jane Smith"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Contact Email</label>
                <input
                  type="email"
                  placeholder="jane@acme.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {step === "products" && (
            <div className="flex flex-col gap-4">
              <h2 className="text-[15px] font-bold text-slate-900 mb-1">Product Selection</h2>
              <ProductSelector selected={selectedProducts} onChange={setSelectedProducts} />
            </div>
          )}

          {step === "review" && (
            <div className="flex flex-col gap-4">
              <h2 className="text-[15px] font-bold text-slate-900 mb-1">Review & Create</h2>
              <div className="flex flex-col gap-2">
                {[
                  ["Company", companyName],
                  ["Contact", contactName || "—"],
                  ["Email", contactEmail || "—"],
                  ["Products", selectedProducts.join(", ") || "—"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex justify-between py-2 border-b border-slate-100 text-[13px]"
                  >
                    <span className="text-slate-400 font-medium">{label}</span>
                    <span className="text-slate-900 font-semibold">{value}</span>
                  </div>
                ))}
              </div>
              <div className="bg-indigo-50 border border-brand/15 rounded-lg px-4 py-3 text-[13px] text-brand">
                A unique <strong>WRQ-CUST-XXXXXXXX</strong> ID and login-free onboarding URL will be generated. You can share this with the customer immediately.
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-6 pt-4 border-t border-slate-100">
            <button
              onClick={() => setStep(steps[steps.findIndex((s) => s.key === step) - 1]?.key ?? "info")}
              disabled={step === "info"}
              className={cn(
                "font-[inherit] py-2.5 px-5.5 bg-transparent text-[13px] font-medium border-[1.5px] border-slate-200 rounded-full",
                step === "info" ? "text-slate-300 cursor-not-allowed" : "text-slate-500 cursor-pointer"
              )}
            >
              ← Back
            </button>

            {step !== "review" ? (
              <button
                onClick={() => {
                  if (step === "info") setStep("products");
                  if (step === "products") setStep("review");
                }}
                disabled={
                  (step === "info" && !canProceedFromInfo) ||
                  (step === "products" && !canProceedFromProducts)
                }
                className={cn(
                  "font-[inherit] py-2.5 px-5.5 bg-brand text-white text-[13px] font-semibold border-none rounded-full cursor-pointer transition-opacity",
                  ((step === "info" && !canProceedFromInfo) || (step === "products" && !canProceedFromProducts))
                    ? "opacity-50"
                    : "opacity-100"
                )}
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={loading}
                className={cn(
                  "font-[inherit] py-2.5 px-5.5 text-white text-[13px] font-semibold border-none rounded-full",
                  loading ? "bg-orange-300 cursor-not-allowed" : "bg-brand-orange cursor-pointer"
                )}
              >
                {loading ? "Creating..." : "Create Customer ✓"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
