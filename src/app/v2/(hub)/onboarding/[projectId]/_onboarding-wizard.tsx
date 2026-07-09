"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Clock, Upload,
  FileText, Plus, Trash2, Sparkles, AlertTriangle, ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getPhaseByNumber, internalDeliverablesForSubPhase } from "@/config/customer-phases";
import type { CustomerDeliverableRow, OnboardingInternalDeliverableRow, Database } from "@/types/database";

type AssetRow = Database["public"]["Tables"]["customer_assets"]["Row"];

interface OnboardingWizardProps {
  project: { id: string; name: string; customer_id: string; company_name: string };
  deliverables: CustomerDeliverableRow[];
  internalDeliverables: OnboardingInternalDeliverableRow[];
  wizardData: Record<string, unknown>;
  currentDay: number;
  isDark: boolean;
  onBack: () => void;
  onDeliverableChange: (updated: CustomerDeliverableRow) => void;
  onInternalDeliverableChange: (updated: OnboardingInternalDeliverableRow) => void;
}

const phase1 = getPhaseByNumber(1);
const STEPS = phase1.deliverables; // 7 sub-phases, in day order

export default function OnboardingWizard({
  project, deliverables, internalDeliverables, wizardData, currentDay, isDark,
  onBack, onDeliverableChange, onInternalDeliverableChange,
}: OnboardingWizardProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const kickoffData = (wizardData.kickoff as Record<string, unknown>) ?? {};
  const storageKbData = (wizardData["storage-kb"] as Record<string, unknown>) ?? {};

  const [seniorContact, setSeniorContact] = useState((kickoffData.seniorContact as string) ?? "");
  const [directAccess, setDirectAccess] = useState((kickoffData.directAccess as string) ?? "");
  const [businessFacts, setBusinessFacts] = useState((kickoffData.businessFacts as string) ?? "");
  const [websiteUrl, setWebsiteUrl] = useState((kickoffData.websiteUrl as string) ?? "");
  const [competitorUrls, setCompetitorUrls] = useState<string[]>((kickoffData.competitorUrls as string[]) ?? []);
  const [competitorInput, setCompetitorInput] = useState("");
  const [customerData, setCustomerData] = useState((kickoffData.customerData as string) ?? "");

  const [documentsNote, setDocumentsNote] = useState((storageKbData.documentsNote as string) ?? "");
  const [dnsAccess, setDnsAccess] = useState((storageKbData.dnsAccess as string) ?? "");
  const [credentialsNote, setCredentialsNote] = useState((storageKbData.credentialsNote as string) ?? "");

  const [uploadedFiles, setUploadedFiles] = useState<AssetRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [localDeliverables, setLocalDeliverables] = useState(deliverables);
  const [localInternal, setLocalInternal] = useState(internalDeliverables);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const kickoffSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storageKbSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doneCount = localDeliverables.filter((d) => d.status === "done").length;

  // Debounced autosave — Kickoff fields.
  useEffect(() => {
    if (kickoffSaveRef.current) clearTimeout(kickoffSaveRef.current);
    kickoffSaveRef.current = setTimeout(() => {
      fetch(`/api/projects/${project.id}/programme/wizard-data`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subPhaseKey: "kickoff", data: { seniorContact, directAccess, businessFacts, websiteUrl, competitorUrls, customerData } }),
      }).catch(() => {});
    }, 2000);
    return () => { if (kickoffSaveRef.current) clearTimeout(kickoffSaveRef.current); };
  }, [project.id, seniorContact, directAccess, businessFacts, websiteUrl, competitorUrls, customerData]);

  // Debounced autosave — Storage + KB fields.
  useEffect(() => {
    if (storageKbSaveRef.current) clearTimeout(storageKbSaveRef.current);
    storageKbSaveRef.current = setTimeout(() => {
      fetch(`/api/projects/${project.id}/programme/wizard-data`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subPhaseKey: "storage-kb", data: { documentsNote, dnsAccess, credentialsNote } }),
      }).catch(() => {});
    }, 2000);
    return () => { if (storageKbSaveRef.current) clearTimeout(storageKbSaveRef.current); };
  }, [project.id, documentsNote, dnsAccess, credentialsNote]);

  const setDeliverableStatus = async (key: string, status: "pending" | "in_progress" | "done") => {
    setTogglingKey(key);
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/deliverables/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase_number: 1, status }),
      });
      if (!res.ok) return;
      const updated: CustomerDeliverableRow = await res.json();
      setLocalDeliverables((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      onDeliverableChange(updated);
    } finally {
      setTogglingKey(null);
    }
  };

  const setInternalStatus = async (key: string, status: "pending" | "in_progress" | "done") => {
    setTogglingKey(`internal-${key}`);
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/internal-deliverables/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) return;
      const updated: OnboardingInternalDeliverableRow = await res.json();
      setLocalInternal((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      onInternalDeliverableChange(updated);
    } finally {
      setTogglingKey(null);
    }
  };

  const cycle = (current: string) => (current === "pending" ? "in_progress" : current === "in_progress" ? "done" : "pending") as "pending" | "in_progress" | "done";

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch(`/api/customers/${project.customer_id}/assets/upload`, { method: "POST", body: formData });
      if (!uploadRes.ok) {
        const json = await uploadRes.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to upload file");
      }
      const uploaded = await uploadRes.json();
      const res = await fetch(`/api/customers/${project.customer_id}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "file",
          label: "Documents",
          file_path: uploaded.path,
          file_name: uploaded.filename,
          file_size: uploaded.size,
          file_mime_type: uploaded.mimeType,
          phase_number: 1,
          project_id: project.id,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to save asset");
      }
      const newAsset: AssetRow = await res.json();
      setUploadedFiles((prev) => [...prev, newAsset]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    setCompleteError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/complete-phase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase_number: 1 }),
      });
      if (!res.ok) throw new Error();
      setDone(true);
    } catch {
      setCompleteError("Failed to complete Phase 1 — please try again.");
    } finally {
      setCompleting(false);
    }
  };

  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";
  const cardCls = isDark ? "bg-[#121726] border border-white/[0.08] rounded-xl" : "bg-white border border-slate-200 rounded-xl";
  const inputBase = cn(
    "w-full text-[13px] rounded-lg px-3 py-2.5 border outline-none transition-colors font-[inherit]",
    isDark ? "bg-transparent border-white/[0.1] text-slate-200 placeholder:text-slate-500 focus:border-brand" : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-brand"
  );
  const labelCls = cn("block text-[12.5px] font-semibold mb-1.5", textPrimary);

  if (done) {
    return (
      <div className={cn(cardCls, "max-w-lg mx-auto p-8 text-center mt-8")}>
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center mx-auto mb-5">
          <Check size={30} className="text-white" strokeWidth={2.5} />
        </div>
        <div className={cn("text-lg font-bold mb-1.5", textPrimary)}>Phase 1 complete!</div>
        <p className={cn("text-[13px] mb-5", textMuted)}>{project.company_name} has been handed over to the PM — the project is now visible in Customers/Projects.</p>
        <div className="flex flex-col gap-2 mb-5 text-left">
          {[
            `${doneCount} of ${localDeliverables.length} deliverables marked done`,
            `${localInternal.filter((d) => d.status === "done").length} of ${localInternal.length} internal deliverables marked done`,
            `${uploadedFiles.length} files uploaded to project folder`,
            `PM notified — Phase 2 begins`,
          ].map((label, i) => (
            <div key={i} className={cn("flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border text-[12px] font-medium", isDark ? "border-green-500/25 bg-green-500/10 text-slate-200" : "border-green-200 bg-green-50 text-slate-900")}>
              <CheckCircle2 size={14} className="text-green-500 shrink-0" /> {label}
            </div>
          ))}
        </div>
        <button onClick={onBack} className="w-full text-[13px] font-semibold text-white bg-brand rounded-lg py-2.5 hover:opacity-90 transition-opacity border-none cursor-pointer">
          Back to Onboarding Timeline
        </button>
      </div>
    );
  }

  const step = STEPS[stepIdx];
  const stepRow = localDeliverables.find((r) => r.deliverable_key === step.key);
  const stepStatus = stepRow?.status ?? "pending";
  const stepInternal = internalDeliverablesForSubPhase(step.key);
  const isLastStep = stepIdx === STEPS.length - 1;

  return (
    <div className="flex flex-col gap-4">
      <div className={cn(cardCls, "p-4")}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => (stepIdx === 0 ? onBack() : setStepIdx((s) => s - 1))} className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium bg-transparent border-none cursor-pointer p-0", textMuted)}>
            <ArrowLeft size={13} /> {stepIdx === 0 ? "Back to timeline" : "Previous step"}
          </button>
          <div className="flex-1" />
          <div className={cn("text-[12px]", textMuted)}>{project.company_name} · Day {currentDay} of 15</div>
        </div>
        <div className="flex items-center justify-between mb-3">
          <div className={cn("text-base font-bold", textPrimary)}>Onboarding Wizard</div>
          <div className={cn("rounded-lg px-3 py-1.5 border text-center", isDark ? "border-blue-500/25 bg-blue-500/10" : "border-blue-100 bg-blue-50")}>
            <div className="text-[15px] font-bold text-brand leading-none">{doneCount}/{localDeliverables.length}</div>
            <div className={cn("text-[10px] mt-0.5", textMuted)}>complete</div>
          </div>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center flex-1 last:flex-none min-w-8">
              <div className="flex flex-col items-center gap-1">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                  i < stepIdx ? "bg-brand text-white" : i === stepIdx ? "bg-brand text-white ring-4 ring-brand/15" : isDark ? "bg-white/[0.08] text-slate-500" : "bg-slate-100 text-slate-400"
                )}>
                  {i < stepIdx ? <Check size={11} /> : i + 1}
                </div>
                <span className={cn("text-[9px] whitespace-nowrap max-w-16 truncate", i === stepIdx ? cn("font-semibold", textPrimary) : textMuted)}>{s.name}</span>
              </div>
              {i < STEPS.length - 1 && <div className={cn("flex-1 h-0.5 mx-1.5 -mt-4", i < stepIdx ? "bg-brand" : isDark ? "bg-white/[0.08]" : "bg-slate-200")} />}
            </div>
          ))}
        </div>
      </div>

      <div className={cn(cardCls, "p-6")}>
        <div className="mb-4">
          <div className={cn("text-base font-bold mb-1", textPrimary)}>{step.name} <span className={cn("text-[12px] font-normal", textMuted)}>· Day {step.dayStart === step.dayEnd ? step.dayStart : `${step.dayStart}–${step.dayEnd}`}</span></div>
          <p className={cn("text-[12.5px]", textMuted)}>{step.description}</p>
        </div>

        {step.key === "kickoff" && (
          <div className="max-w-xl flex flex-col gap-4 mb-5">
            <div>
              <label className={labelCls}>Senior contact + direct access</label>
              <input value={seniorContact} onChange={(e) => setSeniorContact(e.target.value)} placeholder="Name, role, best contact method" className={inputBase} />
              <textarea rows={2} value={directAccess} onChange={(e) => setDirectAccess(e.target.value)} placeholder="Direct access notes (site admin, hosting, etc.)" className={cn(inputBase, "mt-2")} />
            </div>
            <div>
              <label className={labelCls}>Business facts</label>
              <textarea rows={4} value={businessFacts} onChange={(e) => setBusinessFacts(e.target.value)} placeholder="History, services, value proposition, service areas, target customers…" className={inputBase} />
            </div>
            <div>
              <label className={labelCls}>Current website URL</label>
              <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://client.com" className={inputBase} />
            </div>
            <TagField label="Competitor / reference URLs" tags={competitorUrls} input={competitorInput} setInput={setCompetitorInput}
              onAdd={() => { if (competitorInput.trim()) { setCompetitorUrls((c) => [...c, competitorInput.trim()]); setCompetitorInput(""); } }}
              onRemove={(i) => setCompetitorUrls((c) => c.filter((_, j) => j !== i))} placeholder="https://competitor.com" isDark={isDark} />
            <div>
              <label className={labelCls}>Customer data</label>
              <textarea rows={3} value={customerData} onChange={(e) => setCustomerData(e.target.value)} placeholder="Positioning-useful info about their customers…" className={inputBase} />
            </div>
          </div>
        )}

        {step.key === "storage-kb" && (
          <div className="max-w-xl flex flex-col gap-4 mb-5">
            <div>
              <label className={labelCls}>Documents (branding / proposals / collateral)</label>
              <textarea rows={2} value={documentsNote} onChange={(e) => setDocumentsNote(e.target.value)} placeholder="Notes on what's provided / where it lives…" className={inputBase} />
              {uploadError && <p className="text-[12px] text-red-500 mt-2">{uploadError}</p>}
              <FileUploadBox files={uploadedFiles} uploading={uploading} onFile={handleUpload} isDark={isDark} />
            </div>
            <div>
              <label className={labelCls}>DNS access</label>
              <textarea rows={2} value={dnsAccess} onChange={(e) => setDnsAccess(e.target.value)} placeholder="Registrar, access notes…" className={inputBase} />
            </div>
            <div>
              <label className={labelCls}>3rd-party integration credentials</label>
              <textarea rows={2} value={credentialsNote} onChange={(e) => setCredentialsNote(e.target.value)} placeholder="e.g. HubSpot, payment gateway — where stored, not raw secrets here" className={inputBase} />
            </div>
          </div>
        )}

        {/* Sub-phase deliverable + its internal deliverables */}
        <div className={cn("rounded-lg border p-3", isDark ? "border-white/[0.08]" : "border-slate-200")}>
          <WizardDeliverableRow
            name={step.name} description={step.description} owner={step.owner}
            status={stepStatus} isDark={isDark} toggling={togglingKey === step.key}
            onClick={() => setDeliverableStatus(step.key, cycle(stepStatus))}
          />
          {stepInternal.length > 0 && (
            <div className="mt-2.5 pt-2.5 border-t border-dashed border-slate-200 flex flex-col gap-1.5">
              <div className={cn("text-[10.5px] font-semibold uppercase tracking-wide flex items-center gap-1.5", textMuted)}>
                <ListChecks size={11} /> Internal deliverables
              </div>
              {stepInternal.map((id) => {
                const row = localInternal.find((r) => r.deliverable_key === id.key);
                const iStatus = row?.status ?? "pending";
                return (
                  <button
                    key={id.key}
                    onClick={() => setInternalStatus(id.key, cycle(iStatus))}
                    disabled={togglingKey === `internal-${id.key}`}
                    className="w-full flex items-center gap-2 py-1 bg-transparent border-none cursor-pointer text-left disabled:opacity-60"
                  >
                    {iStatus === "done" ? <CheckCircle2 size={13} className="text-green-500" /> : iStatus === "in_progress" ? <Clock size={13} className="text-blue-500" /> : <Circle size={13} className={textMuted} />}
                    <span className={cn("text-[12px]", iStatus === "done" ? cn(textMuted, "line-through") : textPrimary)}>{id.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {isLastStep && (
          <div className="mt-5">
            {doneCount < localDeliverables.length && (
              <div className={cn("flex gap-2.5 p-3 rounded-lg border mb-4 text-[12px]", isDark ? "border-amber-500/25 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800")}>
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span><strong>{localDeliverables.length - doneCount} deliverable{localDeliverables.length - doneCount !== 1 ? "s" : ""} not yet done.</strong> You can still complete Phase 1, but outstanding items will be flagged to the PM.</span>
              </div>
            )}
            <div className={cn("flex gap-2.5 p-3 rounded-lg border mb-4 text-[12px]", isDark ? "border-amber-500/25 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800")}>
              <Sparkles size={14} className="shrink-0 mt-0.5" />
              <span>Marking Phase 1 complete will notify the PM, make the project visible in Customers/Projects, and start Day 16 tracking for Phase 2.</span>
            </div>
            {completeError && <p className="text-[12px] text-red-500 mb-3">{completeError}</p>}
            <button
              onClick={handleComplete}
              disabled={completing}
              className="w-full flex items-center justify-center gap-2 text-[14px] font-semibold text-white rounded-lg py-3 border-none cursor-pointer disabled:opacity-60 bg-gradient-to-br from-green-600 to-green-700 hover:opacity-90 transition-opacity"
            >
              {completing ? <>Completing…</> : <><Check size={16} strokeWidth={2.5} /> Complete Phase 1 &amp; notify PM</>}
            </button>
          </div>
        )}
      </div>

      <div className={cn(cardCls, "p-4 flex items-center justify-between")}>
        <button
          onClick={() => (stepIdx === 0 ? onBack() : setStepIdx((s) => s - 1))}
          className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium rounded-lg px-4 py-2 border cursor-pointer transition-colors", isDark ? "border-white/[0.1] text-slate-300 bg-transparent" : "border-slate-200 text-slate-600 bg-white")}
        >
          <ArrowLeft size={14} /> {stepIdx === 0 ? "Cancel" : "Back"}
        </button>
        <span className={cn("text-[12px]", textMuted)}>Step {stepIdx + 1} of {STEPS.length}</span>
        {!isLastStep ? (
          <button onClick={() => setStepIdx((s) => s + 1)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-brand rounded-lg px-4 py-2 hover:opacity-90 transition-opacity border-none cursor-pointer">
            Continue <ArrowRight size={14} />
          </button>
        ) : (
          <div className="w-24" />
        )}
      </div>
    </div>
  );
}

function TagField({
  label, tags, input, setInput, onAdd, onRemove, placeholder, isDark,
}: {
  label: string; tags: string[]; input: string; setInput: (v: string) => void;
  onAdd: () => void; onRemove: (i: number) => void; placeholder?: string; isDark: boolean;
}) {
  return (
    <div>
      <label className={cn("block text-[12.5px] font-semibold mb-1.5", isDark ? "text-slate-200" : "text-slate-900")}>{label}</label>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand bg-brand/10 rounded-md px-2.5 py-1">
              {t}
              <button onClick={() => onRemove(i)} className="bg-transparent border-none cursor-pointer text-brand p-0 flex" aria-label={`Remove ${t}`}>
                <Trash2 size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }}
          placeholder={placeholder}
          className={cn(
            "flex-1 text-[12.5px] rounded-lg px-2.5 py-2 border outline-none font-[inherit]",
            isDark ? "bg-transparent border-white/[0.1] text-slate-200 placeholder:text-slate-500" : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400"
          )}
        />
        <button onClick={onAdd} className="inline-flex items-center gap-1 text-[12px] font-medium text-white bg-brand rounded-lg px-3 py-2 border-none cursor-pointer">
          <Plus size={13} /> Add
        </button>
      </div>
    </div>
  );
}

function FileUploadBox({ files, uploading, onFile, isDark }: { files: AssetRow[]; uploading: boolean; onFile: (file: File) => void; isDark: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";
  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";
  return (
    <div className="mt-2.5">
      <input ref={inputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={cn(
          "w-full rounded-lg border-2 border-dashed py-4 text-center cursor-pointer transition-colors disabled:opacity-60",
          isDark ? "border-white/[0.12] bg-white/[0.02] hover:border-brand" : "border-slate-200 bg-slate-50 hover:border-brand"
        )}
      >
        <Upload size={16} className={cn("mx-auto mb-1.5", textMuted)} />
        <div className={cn("text-[11.5px]", textMuted)}>{uploading ? "Uploading…" : <>Click to <span className="text-brand font-medium">upload a document</span></>}</div>
      </button>
      {files.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {files.map((f) => (
            <div key={f.id} className={cn("flex items-center gap-2 px-2.5 py-2 rounded-lg", isDark ? "bg-white/[0.03]" : "bg-slate-50")}>
              <div className="w-6 h-6 rounded-md bg-brand/10 flex items-center justify-center shrink-0">
                <FileText size={11} className="text-brand" />
              </div>
              <div className={cn("text-[11.5px] font-medium truncate", textPrimary)}>{f.file_name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WizardDeliverableRow({
  name, description, owner, status, isDark, toggling, onClick,
}: {
  name: string; description: string; owner: string; status: string; isDark: boolean; toggling: boolean; onClick: () => void;
}) {
  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";
  const cfg: Record<string, { border: string; bg: string; icon: React.ReactNode; label: string }> = {
    done: { border: isDark ? "border-green-500/25" : "border-green-200", bg: isDark ? "bg-green-500/10" : "bg-green-50", icon: <CheckCircle2 size={15} className="text-green-500" />, label: "Done" },
    in_progress: { border: isDark ? "border-blue-500/25" : "border-blue-200", bg: isDark ? "bg-blue-500/10" : "bg-blue-50", icon: <Clock size={15} className="text-blue-500" />, label: "In progress" },
    pending: { border: isDark ? "border-white/[0.08]" : "border-slate-200", bg: isDark ? "bg-white/[0.02]" : "bg-slate-50", icon: <Circle size={15} className={textMuted} />, label: "Pending" },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <button onClick={onClick} disabled={toggling} className={cn("w-full flex items-start gap-3 p-3 rounded-lg border cursor-pointer text-left transition-colors disabled:opacity-60", c.border, c.bg)}>
      <div className="shrink-0 mt-0.5">{toggling ? <span className={cn("text-[11px]", textMuted)}>…</span> : c.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-[13px] font-medium", status === "done" ? cn(textMuted, "line-through") : textPrimary)}>Mark &quot;{name}&quot;</span>
          <span className={cn("text-[10px] rounded px-1.5 py-px", isDark ? "bg-white/[0.06] text-slate-400" : "bg-slate-100 text-slate-500")}>{owner}</span>
        </div>
        <div className={cn("text-[11px] mt-0.5", textMuted)}>{description}</div>
      </div>
      <span className={cn("text-[11px] font-medium shrink-0 mt-0.5", status === "done" ? "text-green-500" : textMuted)}>{c.label}</span>
    </button>
  );
}
