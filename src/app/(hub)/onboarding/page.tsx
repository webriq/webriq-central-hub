"use client";

import { useState, useId } from "react";
import HubHeader from "@/components/hub/hub-header";

type FormData = {
  companyName: string; contactName: string; email: string; phone: string;
  website: string; industry: string; projectType: string; budget: string;
  timeline: string; zohoId: string; notes: string;
};

const steps = ["Client Info", "Project Details", "Review & Submit"];

function Field({ label, placeholder, value, onChange, type = "text" }: { label: string; placeholder: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 5 }}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ fontFamily: "inherit", width: "100%", fontSize: 13, padding: "9px 12px", border: "1px solid #E2E8F0", borderRadius: 8, color: "#0F172A", background: "#fff", outline: "none", boxSizing: "border-box" }}
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 5 }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ fontFamily: "inherit", width: "100%", fontSize: 13, padding: "9px 12px", border: "1px solid #E2E8F0", borderRadius: 8, color: "#0F172A", background: "#fff", outline: "none" }}
      >
        <option value="">Select...</option>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>({
    companyName: "", contactName: "", email: "", phone: "",
    website: "", industry: "", projectType: "", budget: "",
    timeline: "", zohoId: "", notes: "",
  });

  const uid = useId().replace(/:/g, "").slice(0, 4).toUpperCase().padEnd(4, "0");
  const clientId = `WRQ-CLIENT-${uid}`;

  const update = (key: keyof FormData, val: string) => setForm((f) => ({ ...f, [key]: val }));

  return (
    <>
      <HubHeader title="New Client Onboarding" subtitle="Complete the form to create a client profile" />

      <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
        <div style={{ maxWidth: 740, margin: "0 auto" }}>
          {/* Step indicator */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
            {steps.map((s, i) => {
              const num = i + 1;
              const active = step === num;
              const done = step > num;
              return (
                <div key={s} style={{ display: "contents" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div
                      style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: done || active ? "#3358F4" : "#E2E8F0",
                        color: done || active ? "#fff" : "#94A3B8",
                        fontSize: 13, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 200ms",
                      }}
                    >
                      {done ? "✓" : num}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? "#3358F4" : "#94A3B8", whiteSpace: "nowrap" }}>{s}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div style={{ flex: 1, height: 2, background: done ? "#3358F4" : "#E2E8F0", margin: "0 8px", marginBottom: 22, transition: "background 200ms" }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Card */}
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            {step === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>Client Information</div>
                <div style={{ display: "flex", gap: 14 }}>
                  <Field label="Company Name *" placeholder="Acme Corp" value={form.companyName} onChange={(v) => update("companyName", v)} />
                  <Field label="Primary Contact *" placeholder="Jane Smith" value={form.contactName} onChange={(v) => update("contactName", v)} />
                </div>
                <div style={{ display: "flex", gap: 14 }}>
                  <Field label="Email Address *" placeholder="jane@acme.com" type="email" value={form.email} onChange={(v) => update("email", v)} />
                  <Field label="Phone Number" placeholder="+1 (555) 000-0000" value={form.phone} onChange={(v) => update("phone", v)} />
                </div>
                <div style={{ display: "flex", gap: 14 }}>
                  <Field label="Website URL" placeholder="https://acme.com" value={form.website} onChange={(v) => update("website", v)} />
                  <SelectField
                    label="Industry"
                    value={form.industry}
                    onChange={(v) => update("industry", v)}
                    options={["Manufacturing", "Construction & Roofing", "Hardware & Distribution", "Technology", "Professional Services", "eCommerce", "Other"]}
                  />
                </div>
                <div style={{ background: "#F7F8FF", border: "1px dashed rgba(51,88,244,0.3)", borderRadius: 8, padding: "12px 16px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#3358F4", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>Client ID (auto-assigned)</div>
                  <div style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: "#0F172A", letterSpacing: "0.08em" }}>{clientId}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>Unique identifier used across all WebriQ products</div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>Project Details</div>
                <div style={{ display: "flex", gap: 14 }}>
                  <SelectField
                    label="Project Type *"
                    value={form.projectType}
                    onChange={(v) => update("projectType", v)}
                    options={["New Website Build", "Website Redesign", "eCommerce Store", "Web Application", "Headless CMS Migration", "Ongoing Support"]}
                  />
                  <SelectField
                    label="Budget Range"
                    value={form.budget}
                    onChange={(v) => update("budget", v)}
                    options={["Under $10k", "$10k – $25k", "$25k – $50k", "$50k – $100k", "$100k+"]}
                  />
                </div>
                <div style={{ display: "flex", gap: 14 }}>
                  <SelectField
                    label="Timeline"
                    value={form.timeline}
                    onChange={(v) => update("timeline", v)}
                    options={["ASAP (within 2 weeks)", "1 month", "2–3 months", "3–6 months", "Flexible"]}
                  />
                  <Field label="Zoho Project ID" placeholder="e.g. ZP-102938" value={form.zohoId} onChange={(v) => update("zohoId", v)} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 5 }}>Additional Notes</label>
                  <textarea
                    style={{ fontFamily: "inherit", width: "100%", fontSize: 13, padding: "9px 12px", border: "1px solid #E2E8F0", borderRadius: 8, color: "#0F172A", background: "#fff", outline: "none", height: 80, resize: "vertical", boxSizing: "border-box" }}
                    placeholder="Any special requirements, integrations, or context..."
                    value={form.notes}
                    onChange={(e) => update("notes", e.target.value)}
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>Review & Submit</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 20px" }}>
                  {([
                    ["Company",      form.companyName  || "—"],
                    ["Contact",      form.contactName  || "—"],
                    ["Email",        form.email        || "—"],
                    ["Phone",        form.phone        || "—"],
                    ["Website",      form.website      || "—"],
                    ["Industry",     form.industry     || "—"],
                    ["Project Type", form.projectType  || "—"],
                    ["Budget",       form.budget       || "—"],
                    ["Timeline",     form.timeline     || "—"],
                    ["Zoho ID",      form.zohoId       || "Auto-assign"],
                  ] as [string, string][]).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #F1F5F9", fontSize: 13 }}>
                      <span style={{ color: "#94A3B8", fontWeight: 500 }}>{k}</span>
                      <span style={{ color: "#0F172A", fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: "#EEF2FF", border: "1px solid rgba(51,88,244,0.15)", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#3358F4" }}>
                  <strong>Next steps:</strong> Submitting will create the client profile, assign a Client ID, and trigger automated project setup in Zoho Projects.
                </div>
              </div>
            )}

            {/* Navigation */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, paddingTop: 16, borderTop: "1px solid #F1F5F9" }}>
              <button
                style={{ fontFamily: "inherit", padding: "10px 22px", background: "transparent", color: "#64748B", fontSize: 13, fontWeight: 500, border: "1.5px solid #E2E8F0", borderRadius: 9999, cursor: step === 1 ? "not-allowed" : "pointer", opacity: step === 1 ? 0.5 : 1 }}
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                disabled={step === 1}
              >
                ← Back
              </button>
              {step < steps.length ? (
                <button
                  style={{ fontFamily: "inherit", padding: "10px 22px", background: "#3358F4", color: "#fff", fontSize: 13, fontWeight: 600, border: "2px solid #3358F4", borderRadius: 9999, cursor: "pointer" }}
                  onClick={() => setStep((s) => s + 1)}
                >
                  Continue →
                </button>
              ) : (
                <button
                  style={{ fontFamily: "inherit", padding: "10px 22px", background: "#22C55E", color: "#fff", fontSize: 13, fontWeight: 600, border: "2px solid #22C55E", borderRadius: 9999, cursor: "pointer" }}
                >
                  Submit Onboarding ✓
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
