"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Clock, Upload,
  FileText, Plus, Trash2, Sparkles, AlertTriangle, ListChecks, X, Eye,
} from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cn } from "@/lib/utils";
import { getPhaseByNumber, internalDeliverablesForSubPhase } from "@/config/customer-phases";
import type { InternalDeliverableConfig } from "@/config/customer-phases";
import type { CustomerDeliverableRow, OnboardingInternalDeliverableRow, Database } from "@/types/database";
import type { SaveStatus } from "@/types/onboarding";
import SaveIndicator from "@/components/onboarding/save-indicator";

type AssetRow = Database["public"]["Tables"]["customer_assets"]["Row"];

type ContactEntry = { fullName: string; position: string; email: string; phone: string; socialMedia: string };

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const PHONE_RE = /^[+\d][\d\s\-().]{6,19}$/;

function isValidEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

function isValidPhone(v: string): boolean {
  return PHONE_RE.test(v.trim());
}

function isValidUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

interface OnboardingWizardProps {
  project: { id: string; name: string; customer_id: string; company_name: string };
  deliverables: CustomerDeliverableRow[];
  internalDeliverables: OnboardingInternalDeliverableRow[];
  wizardData: Record<string, unknown>;
  currentDay: number;
  isDark: boolean;
  initialStepKey?: string;
  onBack: () => void;
  onDeliverableChange: (updated: CustomerDeliverableRow) => void;
  onInternalDeliverableChange: (updated: OnboardingInternalDeliverableRow) => void;
}

const phase1 = getPhaseByNumber(1);
const STEPS = phase1.deliverables; // 7 sub-phases, in day order

export default function OnboardingWizard({
  project, deliverables, internalDeliverables, wizardData, currentDay, isDark, initialStepKey,
  onBack, onDeliverableChange, onInternalDeliverableChange,
}: OnboardingWizardProps) {
  const [stepIdx, setStepIdx] = useState(() => {
    const idx = STEPS.findIndex((s) => s.key === initialStepKey);
    return idx >= 0 ? idx : 0;
  });
  const [done, setDone] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const kickoffData = (wizardData.kickoff as Record<string, unknown>) ?? {};
  const storageKbData = (wizardData["storage-kb"] as Record<string, unknown>) ?? {};
  const outcomeTargetData = (wizardData["outcome-target"] as Record<string, unknown>) ?? {};

  const initialContacts = (kickoffData.contacts as ContactEntry[] | undefined) ?? [];
  const defaultContacts: ContactEntry[] =
    initialContacts.length > 0 ? initialContacts : [{ fullName: "", position: "", email: "", phone: "", socialMedia: "" }];
  const [contacts, setContacts] = useState<ContactEntry[]>(defaultContacts);
  // additionalNotes replaces directAccess (task 129) — fall back to the old key so already-saved
  // "Direct access notes" content isn't silently lost for in-progress projects.
  const [additionalNotes, setAdditionalNotes] = useState(
    (kickoffData.additionalNotes as string) ?? (kickoffData.directAccess as string) ?? ""
  );
  const [businessFacts, setBusinessFacts] = useState((kickoffData.businessFacts as string) ?? "");
  const [websiteUrl, setWebsiteUrl] = useState((kickoffData.websiteUrl as string) ?? "");
  const [websiteUrlError, setWebsiteUrlError] = useState<string | null>(null);
  const [competitorUrls, setCompetitorUrls] = useState<string[]>((kickoffData.competitorUrls as string[]) ?? []);
  const [competitorInput, setCompetitorInput] = useState("");
  const [competitorInputError, setCompetitorInputError] = useState<string | null>(null);

  const [businessFactsFiles, setBusinessFactsFiles] = useState<AssetRow[]>([]);
  const [uploadingBusinessFacts, setUploadingBusinessFacts] = useState(false);
  const [businessFactsUploadError, setBusinessFactsUploadError] = useState<string | null>(null);

  const [checklistValidationError, setChecklistValidationError] = useState<string | null>(null);
  const [contactsFieldError, setContactsFieldError] = useState(false);
  const [businessFactsFieldError, setBusinessFactsFieldError] = useState(false);
  const [outcomeFieldError, setOutcomeFieldError] = useState(false);

  const [incompleteItems, setIncompleteItems] = useState<InternalDeliverableConfig[]>([]);
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [showForceConfirmModal, setShowForceConfirmModal] = useState(false);

  const isContactsValid = contacts.length > 0 && contacts.every((c) => c.fullName.trim() !== "" && isValidEmail(c.email));
  const isBusinessFactsFilled = stripHtml(businessFacts).length > 0 || businessFactsFiles.length > 0;

  const [kickoffSaveStatus, setKickoffSaveStatus] = useState<SaveStatus>("idle");
  const [kickoffLastSavedAt, setKickoffLastSavedAt] = useState<Date | null>(null);
  const [kickoffSaveError, setKickoffSaveError] = useState<string | null>(null);
  const lastKickoffSavedRef = useRef<string>(
    JSON.stringify({
      contacts: defaultContacts,
      additionalNotes: (kickoffData.additionalNotes as string) ?? (kickoffData.directAccess as string) ?? "",
      businessFacts: (kickoffData.businessFacts as string) ?? "",
      websiteUrl: (kickoffData.websiteUrl as string) ?? "",
      competitorUrls: (kickoffData.competitorUrls as string[]) ?? [],
    })
  );

  const [documentsNote, setDocumentsNote] = useState((storageKbData.documentsNote as string) ?? "");
  const [dnsAccess, setDnsAccess] = useState((storageKbData.dnsAccess as string) ?? "");
  const [credentialsNote, setCredentialsNote] = useState((storageKbData.credentialsNote as string) ?? "");

  const [uploadedFiles, setUploadedFiles] = useState<AssetRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [outcomeText, setOutcomeText] = useState((outcomeTargetData.outcomeText as string) ?? "");
  const [outcomeFiles, setOutcomeFiles] = useState<AssetRow[]>([]);
  const [uploadingOutcomeFile, setUploadingOutcomeFile] = useState(false);
  const [outcomeUploadError, setOutcomeUploadError] = useState<string | null>(null);
  const [viewingOutcomeFileId, setViewingOutcomeFileId] = useState<string | null>(null);
  const [viewerFile, setViewerFile] = useState<AssetRow | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  // Satisfied by either typed text or an uploaded document — an attachment is an
  // alternative to typing, not an additive "supporting" extra.
  const isOutcomeFilled = stripHtml(outcomeText).length > 0 || outcomeFiles.length > 0;

  const [outcomeSaveStatus, setOutcomeSaveStatus] = useState<SaveStatus>("idle");
  const [outcomeLastSavedAt, setOutcomeLastSavedAt] = useState<Date | null>(null);
  const [outcomeSaveError, setOutcomeSaveError] = useState<string | null>(null);
  const lastOutcomeSavedRef = useRef<string>(
    JSON.stringify({ outcomeText: (outcomeTargetData.outcomeText as string) ?? "" })
  );

  const [localDeliverables, setLocalDeliverables] = useState(deliverables);
  const [localInternal, setLocalInternal] = useState(internalDeliverables);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const kickoffSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storageKbSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outcomeSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outcomeProgressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Moved up from just above the render return (still used there) so the auto-progress
  // effect below — and any other hook — can reference `step` safely, without depending on
  // a value computed after the early `if (done) return`.
  const step = STEPS[stepIdx];
  const stepRow = localDeliverables.find((r) => r.deliverable_key === step.key);
  const stepStatus = stepRow?.status ?? "pending";
  const stepInternal = internalDeliverablesForSubPhase(step.key);
  const isLastStep = stepIdx === STEPS.length - 1;

  const doneCount = localDeliverables.filter((d) => d.status === "done").length;

  // Debounced autosave — Kickoff fields. Skips scheduling when nothing has
  // changed since the last successful save (including the initially loaded
  // data), and drives kickoffSaveStatus so the UI can show live feedback.
  useEffect(() => {
    const payload = { contacts, additionalNotes, businessFacts, websiteUrl, competitorUrls };
    const payloadJson = JSON.stringify(payload);
    if (payloadJson === lastKickoffSavedRef.current) return;

    if (kickoffSaveRef.current) clearTimeout(kickoffSaveRef.current);
    kickoffSaveRef.current = setTimeout(() => {
      setKickoffSaveStatus("saving");
      fetch(`/api/projects/${project.id}/programme/wizard-data`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subPhaseKey: "kickoff", data: payload }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to save");
          lastKickoffSavedRef.current = payloadJson;
          setKickoffSaveStatus("saved");
          setKickoffLastSavedAt(new Date());
        })
        .catch(() => {
          setKickoffSaveStatus("error");
          setKickoffSaveError("Failed to save changes");
        });
    }, 2000);
    return () => { if (kickoffSaveRef.current) clearTimeout(kickoffSaveRef.current); };
  }, [project.id, contacts, additionalNotes, businessFacts, websiteUrl, competitorUrls]);

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

  // Debounced autosave — Outcome target field. Same skip-if-unchanged +
  // save-status pattern as the Kickoff effect above.
  useEffect(() => {
    const payload = { outcomeText };
    const payloadJson = JSON.stringify(payload);
    if (payloadJson === lastOutcomeSavedRef.current) return;

    if (outcomeSaveRef.current) clearTimeout(outcomeSaveRef.current);
    outcomeSaveRef.current = setTimeout(() => {
      setOutcomeSaveStatus("saving");
      fetch(`/api/projects/${project.id}/programme/wizard-data`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subPhaseKey: "outcome-target", data: payload }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to save");
          lastOutcomeSavedRef.current = payloadJson;
          setOutcomeSaveStatus("saved");
          setOutcomeLastSavedAt(new Date());
        })
        .catch(() => {
          setOutcomeSaveStatus("error");
          setOutcomeSaveError("Failed to save changes");
        });
    }, 2000);
    return () => { if (outcomeSaveRef.current) clearTimeout(outcomeSaveRef.current); };
  }, [project.id, outcomeText]);

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
      const { internalDeliverable, deliverable }: { internalDeliverable: OnboardingInternalDeliverableRow; deliverable: CustomerDeliverableRow | null } = await res.json();
      setLocalInternal((prev) => prev.map((d) => (d.id === internalDeliverable.id ? internalDeliverable : d)));
      onInternalDeliverableChange(internalDeliverable);
      if (deliverable) {
        setLocalDeliverables((prev) => prev.map((d) => (d.id === deliverable.id ? deliverable : d)));
        onDeliverableChange(deliverable);
      }
    } finally {
      setTogglingKey(null);
    }
  };

  // Auto-progress Outcome Target: flips the "outcome-target-filed" checklist item from
  // pending to in_progress on its own — either once the step's scheduled day (dayStart)
  // arrives, or as soon as the user starts filling in the step (text typed or a file
  // attached) — without requiring an explicit click. The server's existing auto-derive-
  // from-siblings logic (internal-deliverables PATCH route) then flows this through to the
  // sub-phase's own `customer_deliverables` status. Never fires once the item has already
  // progressed past pending (in_progress/done), so it won't fight a later explicit "done".
  useEffect(() => {
    if (step.key !== "outcome-target") return;
    const outcomeFiledRow = localInternal.find((r) => r.deliverable_key === "outcome-target-filed");
    if ((outcomeFiledRow?.status ?? "pending") !== "pending") return;
    const dateReached = currentDay >= step.dayStart;
    if (!dateReached && !isOutcomeFilled) return;
    // Deferred (not called synchronously in the effect body) since setInternalStatus's first
    // statement is itself a setState call — matches this file's existing setTimeout-wrapped
    // effect pattern used for the autosave effects above.
    outcomeProgressRef.current = setTimeout(() => {
      setInternalStatus("outcome-target-filed", "in_progress");
    }, 0);
    return () => { if (outcomeProgressRef.current) clearTimeout(outcomeProgressRef.current); };
    // setInternalStatus omitted deliberately: redefined every render but closes over stable
    // values (project.id never changes) for this call's purposes; including it would re-fire
    // this effect every render for no behavioral benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.key, step.dayStart, currentDay, isOutcomeFilled, localInternal]);

  const cycle = (current: string) => (current === "pending" ? "in_progress" : current === "in_progress" ? "done" : "pending") as "pending" | "in_progress" | "done";
  // Internal-deliverable checklist items are a simple pending/done toggle — "in_progress" is
  // reserved for the parent step/phase's own status (auto-derived from these items), not
  // something an individual checklist item sits in.
  const toggleInternalStatus = (current: string) => (current === "done" ? "pending" : "done") as "pending" | "done";

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

  const handleBusinessFactsUpload = async (file: File) => {
    setUploadingBusinessFacts(true);
    setBusinessFactsUploadError(null);
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
          label: "Business Facts",
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
      setBusinessFactsFiles((prev) => [...prev, newAsset]);
    } catch (err) {
      setBusinessFactsUploadError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploadingBusinessFacts(false);
    }
  };

  const handleRemoveFile = async (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
    try {
      await fetch(`/api/customers/${project.customer_id}/assets?id=${id}`, { method: "DELETE" });
    } catch {
      setUploadError("Failed to remove file");
    }
  };

  const handleRemoveBusinessFactsFile = async (id: string) => {
    setBusinessFactsFiles((prev) => prev.filter((f) => f.id !== id));
    try {
      await fetch(`/api/customers/${project.customer_id}/assets?id=${id}`, { method: "DELETE" });
    } catch {
      setBusinessFactsUploadError("Failed to remove file");
    }
  };

  const handleOutcomeFileUpload = async (file: File) => {
    setUploadingOutcomeFile(true);
    setOutcomeUploadError(null);
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
          label: "Outcome Target",
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
      setOutcomeFiles((prev) => [...prev, newAsset]);
    } catch (err) {
      setOutcomeUploadError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploadingOutcomeFile(false);
    }
  };

  const handleRemoveOutcomeFile = async (id: string) => {
    setOutcomeFiles((prev) => prev.filter((f) => f.id !== id));
    try {
      await fetch(`/api/customers/${project.customer_id}/assets?id=${id}`, { method: "DELETE" });
    } catch {
      setOutcomeUploadError("Failed to remove file");
    }
  };

  // In-app preview (not a new tab / download) — fetches the same signed URL client.tsx's
  // handleOpenAssetFile uses, but renders it inside FileViewerModal instead of window.open.
  const handleViewOutcomeFile = async (id: string) => {
    const file = outcomeFiles.find((f) => f.id === id);
    if (!file) return;
    setViewerFile(file);
    setViewerUrl(null);
    setViewerError(null);
    setViewerLoading(true);
    setViewingOutcomeFileId(id);
    try {
      const res = await fetch(`/api/customers/${project.customer_id}/assets/${id}/file-url`);
      if (!res.ok) throw new Error("Failed to get file URL");
      const { url } = await res.json();
      setViewerUrl(url);
    } catch {
      setViewerError("Failed to load file preview.");
    } finally {
      setViewerLoading(false);
      setViewingOutcomeFileId(null);
    }
  };

  const closeFileViewer = () => {
    setViewerFile(null);
    setViewerUrl(null);
    setViewerError(null);
  };

  // Validates the two field-dependent checklist items before letting them reach "done" —
  // intercepts the click instead of touching the shared internal-deliverables PATCH route.
  const handleKickoffInternalToggle = (key: string, currentStatus: string) => {
    const target = toggleInternalStatus(currentStatus);
    if (target === "done") {
      if (key === "kickoff-contacts-confirmed" && !isContactsValid) {
        setChecklistValidationError("Add at least one contact with a name and valid email before confirming contacts.");
        setContactsFieldError(true);
        return;
      }
      if (key === "kickoff-goals-timeline-filed" && !isBusinessFactsFilled) {
        setChecklistValidationError("Fill in Business Facts — text or an attached document — before marking this done.");
        setBusinessFactsFieldError(true);
        return;
      }
    }
    setChecklistValidationError(null);
    setInternalStatus(key, target);
  };

  // Continue → gate on any incomplete internal-deliverable checklist item for the current step,
  // plus Outcome target's own required-field check (no internal deliverables map to this step).
  const handleContinueClick = () => {
    if (step.key === "outcome-target" && !isOutcomeFilled) {
      setOutcomeFieldError(true);
      return;
    }
    if (stepInternal.length > 0) {
      const incomplete = stepInternal.filter((item) => {
        const row = localInternal.find((r) => r.deliverable_key === item.key);
        return (row?.status ?? "pending") !== "done";
      });
      if (incomplete.length > 0) {
        setIncompleteItems(incomplete);
        setShowIncompleteModal(true);
        return;
      }
    }
    setStepIdx((s) => s + 1);
  };

  const finalizeMarkAllDone = async (items: InternalDeliverableConfig[]) => {
    await Promise.all(items.map((item) => setInternalStatus(item.key, "done")));
    setShowIncompleteModal(false);
    setShowForceConfirmModal(false);
    setIncompleteItems([]);
    setChecklistValidationError(null);
    setContactsFieldError(false);
    setBusinessFactsFieldError(false);
    setStepIdx((s) => s + 1);
  };

  // "Mark all as done" from the incomplete-checklist modal — for Kickoff, defers to the
  // required-fields confirmation modal if any gated item would otherwise fail validation.
  const handleMarkAllDone = () => {
    if (step.key === "kickoff") {
      const hasFailing = incompleteItems.some(
        (item) =>
          (item.key === "kickoff-contacts-confirmed" && !isContactsValid) ||
          (item.key === "kickoff-goals-timeline-filed" && !isBusinessFactsFilled)
      );
      if (hasFailing) {
        setShowForceConfirmModal(true);
        return;
      }
    }
    finalizeMarkAllDone(incompleteItems);
  };

  const handleForceProceed = () => {
    finalizeMarkAllDone(incompleteItems);
  };

  const handleReview = () => {
    setShowForceConfirmModal(false);
    setShowIncompleteModal(false);
    if (!isContactsValid) setContactsFieldError(true);
    if (!isBusinessFactsFilled) setBusinessFactsFieldError(true);
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

  // Kickoff-step-only Field styling, matching the New Project wizard's
  // rounded-[9px]/border-[1.5px]/focus-glow look — isDark-aware pair, not a
  // `dark:` variant. Scoped to the Kickoff step; other steps keep inputBase.
  const kickoffLabelCls = cn("block text-[13px] font-medium mb-1.5", textPrimary);
  const kickoffInputCls = cn(
    "w-full text-sm rounded-[9px] px-3.5 py-[11px] border-[1.5px] outline-none transition-[border-color,box-shadow] duration-150 font-[inherit]",
    isDark
      ? "bg-transparent border-white/[0.12] text-slate-200 placeholder:text-slate-500 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.18)]"
      : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.1)]"
  );

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
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className={cn("text-base font-bold mb-1", textPrimary)}>{step.name} <span className={cn("text-[12px] font-normal", textMuted)}>· Day {step.dayStart === step.dayEnd ? step.dayStart : `${step.dayStart}–${step.dayEnd}`}</span></div>
            <p className={cn("text-[12.5px]", textMuted)}>{step.description}</p>
          </div>
          {step.key === "kickoff" && (
            <SaveIndicator status={kickoffSaveStatus} lastSavedAt={kickoffLastSavedAt} error={kickoffSaveError} />
          )}
          {step.key === "outcome-target" && (
            <SaveIndicator status={outcomeSaveStatus} lastSavedAt={outcomeLastSavedAt} error={outcomeSaveError} />
          )}
        </div>

        {step.key === "kickoff" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4 mb-5">
            <div className="flex flex-col gap-4">
              <ContactsField contacts={contacts} onChange={setContacts} isDark={isDark} hasError={contactsFieldError && !isContactsValid} />
              <div>
                <label className={kickoffLabelCls}>Current website URL</label>
                <input
                  value={websiteUrl}
                  onChange={(e) => { setWebsiteUrl(e.target.value); setWebsiteUrlError(null); }}
                  onBlur={() => setWebsiteUrlError(websiteUrl.trim() && !isValidUrl(websiteUrl.trim()) ? "Enter a full URL starting with http:// or https://" : null)}
                  placeholder="https://client.com"
                  className={kickoffInputCls}
                />
                <p className={cn("text-[11px] mt-1", textMuted)}>Leave blank if none.</p>
                {websiteUrlError && <p className="text-[11px] text-red-500 mt-1">{websiteUrlError}</p>}
              </div>
              <div>
                <TagField
                  label="Competitor / reference URLs"
                  tags={competitorUrls}
                  input={competitorInput}
                  setInput={(v) => { setCompetitorInput(v); setCompetitorInputError(null); }}
                  onAdd={() => {
                    const v = competitorInput.trim();
                    if (!v) return;
                    if (!isValidUrl(v)) { setCompetitorInputError("Enter a full URL starting with http:// or https://"); return; }
                    setCompetitorUrls((c) => [...c, v]);
                    setCompetitorInput("");
                    setCompetitorInputError(null);
                  }}
                  onRemove={(i) => setCompetitorUrls((c) => c.filter((_, j) => j !== i))}
                  placeholder="https://competitor.com"
                  isDark={isDark}
                />
                {competitorInputError && <p className="text-[11px] text-red-500 mt-1">{competitorInputError}</p>}
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <RichTextField
                  label="Business facts"
                  value={businessFacts}
                  onChange={setBusinessFacts}
                  placeholder="History, services, value proposition, service areas, target customers… (required — text or an attachment)"
                  isDark={isDark}
                  minHeightClass="min-h-[104px]"
                  maxHeightClass="max-h-[280px]"
                  hasError={businessFactsFieldError && !isBusinessFactsFilled}
                />
                {businessFactsUploadError && <p className="text-[12px] text-red-500 mt-2">{businessFactsUploadError}</p>}
                <FileUploadBox files={businessFactsFiles} uploading={uploadingBusinessFacts} onFile={handleBusinessFactsUpload} onRemove={handleRemoveBusinessFactsFile} isDark={isDark} />
              </div>
              <RichTextField
                label="Additional Notes"
                value={additionalNotes}
                onChange={setAdditionalNotes}
                placeholder="Leave blank if none."
                isDark={isDark}
                minHeightClass="min-h-[80px]"
                maxHeightClass="max-h-[220px]"
              />
            </div>
          </div>
        )}

        {step.key === "storage-kb" && (
          <div className="max-w-xl flex flex-col gap-4 mb-5">
            <div>
              <label className={labelCls}>Documents (branding / proposals / collateral)</label>
              <textarea rows={2} value={documentsNote} onChange={(e) => setDocumentsNote(e.target.value)} placeholder="Notes on what's provided / where it lives…" className={inputBase} />
              {uploadError && <p className="text-[12px] text-red-500 mt-2">{uploadError}</p>}
              <FileUploadBox files={uploadedFiles} uploading={uploading} onFile={handleUpload} onRemove={handleRemoveFile} isDark={isDark} />
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

        {step.key === "outcome-target" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_280px] gap-x-6 gap-y-4 mb-5">
            <div>
              <RichTextField
                label="Agreed measurable outcomes"
                value={outcomeText}
                onChange={setOutcomeText}
                placeholder="e.g. Increase organic traffic 40% by Day 90, 3x qualified leads by Day 120… (required — text or an attached document)"
                isDark={isDark}
                minHeightClass="min-h-[220px]"
                maxHeightClass="max-h-[420px]"
                hasError={outcomeFieldError && !isOutcomeFilled}
              />
              {outcomeFieldError && !isOutcomeFilled && (
                <p className="text-[11px] text-red-500 mt-1">Add the agreed measurable outcomes — text or an attached document — before continuing.</p>
              )}
            </div>
            <div className="hidden lg:flex flex-col items-center gap-2 px-1 pt-1">
              <div className={cn("w-px flex-1", isDark ? "bg-white/[0.08]" : "bg-slate-200")} />
              <span className={cn("text-[10px] font-semibold uppercase tracking-wide", textMuted)}>Or</span>
              <div className={cn("w-px flex-1", isDark ? "bg-white/[0.08]" : "bg-slate-200")} />
            </div>
            <div>
              <label className={kickoffLabelCls}>Upload a document instead</label>
              <p className={cn("text-[11px] mb-1.5", textMuted)}>Prefer to attach a file (e.g. a KPI or targets sheet) over typing? Upload it here instead.</p>
              {outcomeUploadError && <p className="text-[12px] text-red-500 mb-2">{outcomeUploadError}</p>}
              <FileUploadBox
                files={outcomeFiles}
                uploading={uploadingOutcomeFile}
                onFile={handleOutcomeFileUpload}
                onRemove={handleRemoveOutcomeFile}
                onView={handleViewOutcomeFile}
                viewingId={viewingOutcomeFileId}
                isDark={isDark}
              />
            </div>
          </div>
        )}

        {/* Sub-phase deliverable + its internal deliverables */}
        <div className={cn("rounded-lg border p-3", isDark ? "border-white/[0.08]" : "border-slate-200")}>
          <WizardDeliverableRow
            name={step.name} description={step.description} owner={step.owner}
            status={stepStatus} isDark={isDark} toggling={togglingKey === step.key}
            onClick={stepInternal.length > 0 ? undefined : () => setDeliverableStatus(step.key, cycle(stepStatus))}
          />
          {stepInternal.length > 0 && (
            <div className="mt-2.5 pt-2.5 border-t border-dashed border-slate-200 flex flex-col gap-1.5">
              <div className={cn("text-[10.5px] font-semibold uppercase tracking-wide flex items-center gap-1.5", textMuted)}>
                <ListChecks size={11} /> Checklist
              </div>
              {stepInternal.map((id) => {
                const row = localInternal.find((r) => r.deliverable_key === id.key);
                const iStatus = row?.status ?? "pending";
                return (
                  <button
                    key={id.key}
                    onClick={() => (step.key === "kickoff" ? handleKickoffInternalToggle(id.key, iStatus) : setInternalStatus(id.key, toggleInternalStatus(iStatus)))}
                    disabled={togglingKey === `internal-${id.key}`}
                    className="w-full flex items-center gap-2 py-1 bg-transparent border-none cursor-pointer text-left disabled:opacity-60"
                  >
                    {iStatus === "done" ? <CheckCircle2 size={13} className="text-green-500" /> : iStatus === "in_progress" ? <Clock size={13} className="text-blue-500" /> : <Circle size={13} className={textMuted} />}
                    <span className={cn("text-[12px]", iStatus === "done" ? cn(textMuted, "line-through") : textPrimary)}>{id.name}</span>
                  </button>
                );
              })}
              {step.key === "kickoff" && checklistValidationError && (
                <p className="text-[11px] text-red-500 mt-1">{checklistValidationError}</p>
              )}
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
          <button onClick={handleContinueClick} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-brand rounded-lg px-4 py-2 hover:opacity-90 transition-opacity border-none cursor-pointer">
            Continue <ArrowRight size={14} />
          </button>
        ) : (
          <div className="w-24" />
        )}
      </div>

      {showIncompleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setShowIncompleteModal(false)}>
          <div className={cn(cardCls, "w-full max-w-md shadow-xl overflow-hidden")} onClick={(e) => e.stopPropagation()}>
            <div className={cn("flex items-center justify-between px-5 py-4 border-b", isDark ? "border-white/[0.08]" : "border-slate-100")}>
              <h2 className={cn("text-[15px] font-semibold", textPrimary)}>Incomplete checklist items</h2>
              <button onClick={() => setShowIncompleteModal(false)} aria-label="Close" className={cn("p-1 rounded-md cursor-pointer border-none bg-transparent", textMuted)}>
                <X size={16} />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-2">
              <p className={cn("text-[13px] mb-1", textMuted)}>The following items in &quot;{step.name}&quot; haven&apos;t been marked done yet:</p>
              {incompleteItems.map((item) => (
                <div key={item.key} className={cn("flex items-center gap-2 text-[13px] px-3 py-2 rounded-lg", isDark ? "bg-white/[0.03]" : "bg-slate-50")}>
                  <Circle size={13} className={textMuted} />
                  <span className={textPrimary}>{item.name}</span>
                </div>
              ))}
            </div>
            <div className={cn("flex items-center justify-end gap-2 px-5 py-4 border-t", isDark ? "border-white/[0.08]" : "border-slate-100 bg-slate-50")}>
              <button
                onClick={() => setShowIncompleteModal(false)}
                className={cn("px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer border-none bg-transparent", isDark ? "text-slate-300 hover:bg-white/[0.06]" : "text-slate-600 hover:bg-slate-100")}
              >
                Cancel
              </button>
              <button
                onClick={handleMarkAllDone}
                className="px-4 py-2 rounded-lg bg-brand text-white text-[13px] font-semibold cursor-pointer border-none hover:opacity-90 transition-opacity"
              >
                Mark all as done
              </button>
            </div>
          </div>
        </div>
      )}

      {showForceConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={handleReview}>
          <div className={cn(cardCls, "w-full max-w-sm shadow-xl overflow-hidden")} onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                <h2 className={cn("text-[15px] font-semibold", textPrimary)}>Missing required fields</h2>
              </div>
              <p className={cn("text-[13px]", textMuted)}>
                There are still required data or fields to fill out. You can proceed anyway and mark these items as done, or go back and review what&apos;s missing.
              </p>
            </div>
            <div className={cn("flex items-center justify-end gap-2 px-5 py-4 border-t", isDark ? "border-white/[0.08]" : "border-slate-100 bg-slate-50")}>
              <button
                onClick={handleReview}
                className={cn("px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer border-none bg-transparent", isDark ? "text-slate-300 hover:bg-white/[0.06]" : "text-slate-600 hover:bg-slate-100")}
              >
                Review
              </button>
              <button
                onClick={handleForceProceed}
                className="px-4 py-2 rounded-lg bg-brand text-white text-[13px] font-semibold cursor-pointer border-none hover:opacity-90 transition-opacity"
              >
                Yes, proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {viewerFile && (
        <FileViewerModal
          file={viewerFile}
          url={viewerUrl}
          loading={viewerLoading}
          error={viewerError}
          isDark={isDark}
          onClose={closeFileViewer}
        />
      )}
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
      <label className={cn("block text-[13px] font-medium mb-1.5", isDark ? "text-slate-200" : "text-slate-900")}>{label}</label>
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
            "flex-1 text-sm rounded-[9px] px-3.5 py-[11px] border-[1.5px] outline-none transition-[border-color,box-shadow] duration-150 font-[inherit]",
            isDark
              ? "bg-transparent border-white/[0.12] text-slate-200 placeholder:text-slate-500 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.18)]"
              : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.1)]"
          )}
        />
        <button
          type="button"
          onClick={onAdd}
          title="Add"
          aria-label="Add"
          className={cn(
            "inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-[9px] border-[1.5px] bg-transparent cursor-pointer transition-colors",
            isDark ? "border-brand/30 text-brand hover:bg-brand/10" : "border-brand/25 text-brand hover:bg-brand/5"
          )}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

function ContactsField({
  contacts, onChange, isDark, hasError,
}: {
  contacts: ContactEntry[]; onChange: (contacts: ContactEntry[]) => void; isDark: boolean; hasError?: boolean;
}) {
  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";
  const miniInputCls = cn(
    "w-full text-[13px] rounded-[9px] px-3 py-2.5 border-[1.5px] outline-none transition-[border-color,box-shadow] duration-150 font-[inherit]",
    isDark
      ? "bg-transparent border-white/[0.12] text-slate-200 placeholder:text-slate-500 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.18)]"
      : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.1)]"
  );

  const updateContact = (i: number, patch: Partial<ContactEntry>) => {
    onChange(contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  };
  const removeContact = (i: number) => onChange(contacts.filter((_, j) => j !== i));
  const addContact = () => onChange([...contacts, { fullName: "", position: "", email: "", phone: "", socialMedia: "" }]);

  return (
    <div>
      <label className={cn("block text-[13px] font-medium mb-1.5", textPrimary)}>Contacts</label>
      <div className="flex flex-col gap-3">
        {contacts.map((c, i) => {
          const emailInvalid = c.email.trim() !== "" && !isValidEmail(c.email);
          const phoneInvalid = c.phone.trim() !== "" && !isValidPhone(c.phone);
          const cardHasError = hasError && (c.fullName.trim() === "" || c.email.trim() === "" || !isValidEmail(c.email));
          return (
            <div
              key={i}
              className={cn(
                "rounded-[9px] border-[1.5px] p-3 flex flex-col gap-2 transition-[border-color,box-shadow] duration-150",
                isDark ? "border-white/[0.12] bg-transparent" : "border-slate-200 bg-white",
                cardHasError && "border-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.25)]"
              )}
            >
              <div className="flex items-center justify-between">
                {i === 0 ? (
                  <span className="inline-flex items-center text-[10px] font-semibold text-brand bg-brand/10 rounded-full px-2 py-0.5">Primary Contact</span>
                ) : (
                  <span className={cn("text-[10px] font-medium", textMuted)}>Contact {i + 1}</span>
                )}
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => removeContact(i)}
                    className="bg-transparent border-none cursor-pointer text-red-500 p-0 flex items-center gap-1 text-[11px]"
                    aria-label={`Remove contact ${i + 1}`}
                  >
                    <Trash2 size={11} /> Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={c.fullName} onChange={(e) => updateContact(i, { fullName: e.target.value })} placeholder="Full name" className={miniInputCls} />
                <input value={c.position} onChange={(e) => updateContact(i, { position: e.target.value })} placeholder="Position (optional)" className={miniInputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input value={c.email} onChange={(e) => updateContact(i, { email: e.target.value })} placeholder="Email" className={cn(miniInputCls, emailInvalid && "border-red-400")} />
                  {emailInvalid && <p className="text-[10px] text-red-500 mt-0.5">Enter a valid email.</p>}
                </div>
                <div>
                  <input value={c.phone} onChange={(e) => updateContact(i, { phone: e.target.value })} placeholder="Phone (optional)" className={cn(miniInputCls, phoneInvalid && "border-red-400")} />
                  {phoneInvalid && <p className="text-[10px] text-red-500 mt-0.5">Enter a valid phone number.</p>}
                </div>
              </div>
              <input
                value={c.socialMedia}
                onChange={(e) => updateContact(i, { socialMedia: e.target.value })}
                placeholder="Social media accounts (optional, comma-separated)"
                className={miniInputCls}
              />
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={addContact}
        title="Add contact"
        aria-label="Add contact"
        className={cn(
          "inline-flex items-center justify-center w-11 h-11 mt-2 rounded-[9px] border-[1.5px] bg-transparent cursor-pointer transition-colors",
          isDark ? "border-brand/30 text-brand hover:bg-brand/10" : "border-brand/25 text-brand hover:bg-brand/5"
        )}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

function RichTextField({
  label, value, onChange, placeholder, isDark, minHeightClass = "min-h-[80px]", maxHeightClass, hasError,
}: {
  label: string; value: string; onChange: (html: string) => void; placeholder?: string;
  isDark: boolean; minHeightClass?: string; maxHeightClass?: string; hasError?: boolean;
}) {
  const editor = useEditor({
    // StarterKit v3 already bundles Underline — don't add @tiptap/extension-underline
    // separately here, that causes a "Duplicate extension names" runtime warning.
    extensions: [StarterKit],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "outline-none px-3.5 py-[11px] text-sm [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
          "[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5",
          minHeightClass,
          // maxHeightClass caps growth and scrolls internally once content exceeds it —
          // opt-in per field (undefined = unbounded growth, the original behavior).
          maxHeightClass && cn(maxHeightClass, "overflow-y-auto"),
          isDark ? "text-slate-200" : "text-slate-900"
        ),
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";

  const marks: { label: string; title: string; cls: string; action: () => void; active: () => boolean }[] = [
    { label: "B", title: "Bold", cls: "font-bold", action: () => editor?.chain().focus().toggleBold().run(), active: () => editor?.isActive("bold") ?? false },
    { label: "I", title: "Italic", cls: "italic", action: () => editor?.chain().focus().toggleItalic().run(), active: () => editor?.isActive("italic") ?? false },
    { label: "U", title: "Underline", cls: "underline", action: () => editor?.chain().focus().toggleUnderline().run(), active: () => editor?.isActive("underline") ?? false },
  ];

  return (
    <div>
      <label className={cn("block text-[13px] font-medium mb-1.5", textPrimary)}>{label}</label>
      <div
        className={cn(
          "rounded-[9px] border-[1.5px] overflow-hidden transition-[border-color,box-shadow] duration-150",
          isDark ? "bg-transparent" : "bg-white",
          hasError
            ? "border-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.25)] focus-within:border-red-500 focus-within:shadow-[0_0_0_3px_rgba(239,68,68,0.35)]"
            : isDark
              ? "border-white/[0.12] focus-within:border-brand focus-within:shadow-[0_0_0_3px_rgba(51,88,244,0.18)]"
              : "border-slate-200 focus-within:border-brand focus-within:shadow-[0_0_0_3px_rgba(51,88,244,0.1)]"
        )}
      >
        <div className={cn("flex items-center gap-0.5 px-2 py-1.5 border-b", isDark ? "border-white/[0.08] bg-white/[0.02]" : "border-slate-100 bg-slate-50/50")}>
          {marks.map((btn) => (
            <button
              key={btn.title}
              type="button"
              title={btn.title}
              onClick={btn.action}
              className={cn(
                "text-[12px] w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors border-none",
                btn.cls,
                btn.active() ? "bg-brand/15 text-brand" : isDark ? "text-slate-400 hover:bg-white/[0.06]" : "text-slate-500 hover:bg-slate-100"
              )}
            >
              {btn.label}
            </button>
          ))}
          <span className={cn("w-px h-4 mx-0.5", isDark ? "bg-white/[0.08]" : "bg-slate-200")} />
          <button
            type="button"
            title="Bullet List"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            className={cn(
              "text-[11px] px-2 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors border-none",
              (editor?.isActive("bulletList") ?? false) ? "bg-brand/15 text-brand" : isDark ? "text-slate-400 hover:bg-white/[0.06]" : "text-slate-500 hover:bg-slate-100"
            )}
          >
            • List
          </button>
        </div>
        <EditorContent editor={editor} />
      </div>
      {placeholder && <p className={cn("text-[11px] mt-1", textMuted)}>{placeholder}</p>}
    </div>
  );
}

function FileUploadBox({
  files, uploading, onFile, onRemove, onView, viewingId, isDark,
}: {
  files: AssetRow[]; uploading: boolean; onFile: (file: File) => void; onRemove?: (id: string) => void;
  onView?: (id: string) => void; viewingId?: string | null; isDark: boolean;
}) {
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
              <div className={cn("text-[11.5px] font-medium truncate flex-1", textPrimary)}>{f.file_name}</div>
              {onView && (
                <button
                  type="button"
                  onClick={() => onView(f.id)}
                  disabled={viewingId === f.id}
                  aria-label={`View ${f.file_name}`}
                  title="View"
                  className="shrink-0 p-1 rounded-md cursor-pointer border-none bg-transparent text-brand hover:bg-brand/10 transition-colors disabled:opacity-50"
                >
                  <Eye size={12} />
                </button>
              )}
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(f.id)}
                  aria-label={`Remove ${f.file_name}`}
                  title="Remove"
                  className="shrink-0 p-1 rounded-md cursor-pointer border-none bg-transparent text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const OFFICE_MIME_TYPES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

// Renders the actual preview content, branching on mime type — everything here uses the
// signed URL directly (image/PDF/text) or hands it to a document-rendering service
// (Office Online, since browsers can't render docx/xlsx natively) rather than letting the
// browser fall back to a download prompt.
function FilePreview({ file, url }: { file: AssetRow; url: string }) {
  const mime = file.file_mime_type ?? "";
  const fileName = file.file_name ?? "file";

  if (mime.startsWith("image/")) {
    return (
      <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived, per-request Supabase Storage URL; not a static/optimizable src next/image can allowlist */}
        <img src={url} alt={fileName} className="max-w-full max-h-full object-contain" />
      </div>
    );
  }

  if (mime === "application/pdf") {
    return <iframe src={url} title={fileName} className="w-full h-full border-0" />;
  }

  if (OFFICE_MIME_TYPES.includes(mime)) {
    const officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
    return <iframe src={officeViewerUrl} title={fileName} className="w-full h-full border-0" />;
  }

  if (mime === "text/html") {
    // Supabase Storage's signed URL serves .html objects with Content-Type: text/plain
    // (a deliberate sanitization — confirmed by inspecting the actual response headers —
    // so browsers won't execute/render arbitrary stored HTML just from a direct link).
    // An <iframe src={url}> would therefore show raw markup as text, not a rendered page.
    // Fetching the content ourselves and injecting it via srcDoc bypasses that header
    // entirely — the browser parses whatever HTML string it's given, regardless of the
    // Content-Type the bytes were served with.
    return <HtmlFilePreview url={url} fileName={fileName} />;
  }

  if (mime === "text/csv") {
    // Unlike text/plain, browsers render an iframe pointed at Content-Type: text/csv as
    // blank rather than inline text (confirmed: the sandboxed iframe silently showed
    // nothing, no download either — CSV is treated as a "document" type, not literal
    // text, by browser MIME handling). Fetching the content and rendering an actual
    // table client-side sidesteps that entirely and is also just a better preview.
    return <CsvFilePreview url={url} />;
  }

  if (mime === "text/plain" || mime === "text/markdown") {
    // Plain text/markdown are supposed to show as literal text, so the server's
    // Content-Type (also text/plain here) doesn't need the srcDoc workaround above.
    return <iframe src={url} title={fileName} sandbox="" className="w-full h-full border-0 bg-white" />;
  }

  return (
    <div className="w-full h-full flex items-center justify-center px-6 text-center">
      <span className="text-[12.5px] text-slate-500">Preview not available for this file type.</span>
    </div>
  );
}

// Fetches the HTML file's raw text client-side and renders it via iframe srcDoc — see the
// comment at FilePreview's text/html branch for why src={url} alone doesn't work here.
function HtmlFilePreview({ url, fileName }: { url: string; fileName: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch HTML content");
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setHtml(text);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load HTML preview.");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center px-6 text-center">
        <span className="text-[12.5px] text-red-500">{error}</span>
      </div>
    );
  }
  if (html === null) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <span className="text-[12.5px] text-slate-500">Loading preview…</span>
      </div>
    );
  }
  // Empty sandbox = no script execution, no same-origin, no forms/popups/top-nav —
  // renders uploaded HTML visually inert, since this may be unreviewed client content.
  return <iframe srcDoc={html} title={fileName} sandbox="" className="w-full h-full border-0 bg-white" />;
}

// Fetches the CSV file's raw text and renders it as an actual table — a simple split on
// newlines/commas, not a full RFC4180 parser (no quoted-field/escaped-comma handling), which
// is a reasonable tradeoff for a preview of Bert's KPI/targets sheets rather than a general
// CSV engine.
function CsvFilePreview({ url }: { url: string }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch CSV content");
        return res.text();
      })
      .then((text) => {
        if (cancelled) return;
        const parsed = text
          .split(/\r\n|\n/)
          .filter((line) => line.length > 0)
          .map((line) => line.split(","));
        setRows(parsed);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load CSV preview.");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center px-6 text-center">
        <span className="text-[12.5px] text-red-500">{error}</span>
      </div>
    );
  }
  if (rows === null) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <span className="text-[12.5px] text-slate-500">Loading preview…</span>
      </div>
    );
  }

  const [header, ...body] = rows;
  return (
    <div className="w-full h-full overflow-auto p-4 bg-white">
      <table className="min-w-full text-[12px] border-collapse">
        <thead>
          <tr>
            {header?.map((cell, i) => (
              <th key={i} className="text-left font-semibold text-slate-700 px-3 py-2 border-b-2 border-slate-200 bg-slate-50 whitespace-nowrap">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-1.5 border-b border-slate-100 text-slate-700 whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// In-app file preview modal — deliberately does not window.open()/download the file;
// everything renders inline via <img>/<iframe> so the signed URL is only ever fetched
// by the browser for display, not offered to the user as a download.
function FileViewerModal({
  file, url, loading, error, isDark, onClose,
}: {
  file: AssetRow; url: string | null; loading: boolean; error: string | null; isDark: boolean; onClose: () => void;
}) {
  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";
  const cardCls = isDark ? "bg-[#121726] border border-white/[0.08] rounded-xl" : "bg-white border border-slate-200 rounded-xl";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div className={cn(cardCls, "w-full max-w-4xl h-[85vh] shadow-xl overflow-hidden flex flex-col")} onClick={(e) => e.stopPropagation()}>
        <div className={cn("flex items-center justify-between gap-3 px-5 py-3 border-b shrink-0", isDark ? "border-white/[0.08]" : "border-slate-100")}>
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={14} className="text-brand shrink-0" />
            <h2 className={cn("text-[13.5px] font-semibold truncate", textPrimary)}>{file.file_name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className={cn("p-1 rounded-md cursor-pointer border-none bg-transparent shrink-0 hover:bg-slate-500/10 transition-colors", textMuted)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 relative bg-slate-100">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={cn("text-[12.5px]", textMuted)}>Loading preview…</span>
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
              <span className="text-[12.5px] text-red-500">{error}</span>
            </div>
          )}
          {url && !loading && !error && <FilePreview file={file} url={url} />}
        </div>
      </div>
    </div>
  );
}

function WizardDeliverableRow({
  name, description, owner, status, isDark, toggling, onClick,
}: {
  name: string; description: string; owner: string; status: string; isDark: boolean; toggling: boolean; onClick?: () => void;
}) {
  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";
  const cfg: Record<string, { border: string; bg: string; icon: React.ReactNode; label: string }> = {
    done: { border: isDark ? "border-green-500/25" : "border-green-200", bg: isDark ? "bg-green-500/10" : "bg-green-50", icon: <CheckCircle2 size={15} className="text-green-500" />, label: "Done" },
    in_progress: { border: isDark ? "border-blue-500/25" : "border-blue-200", bg: isDark ? "bg-blue-500/10" : "bg-blue-50", icon: <Clock size={15} className="text-blue-500" />, label: "In progress" },
    pending: { border: isDark ? "border-white/[0.08]" : "border-slate-200", bg: isDark ? "bg-white/[0.02]" : "bg-slate-50", icon: <Circle size={15} className={textMuted} />, label: "Pending" },
  };
  const c = cfg[status] ?? cfg.pending;
  const readOnly = !onClick;
  const label = readOnly ? `"${name}"` : `Mark "${name}"`;
  return (
    <button
      onClick={onClick}
      disabled={toggling || readOnly}
      title={readOnly ? "Status is derived automatically from the checklist below" : undefined}
      className={cn(
        "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors disabled:opacity-60",
        readOnly ? "cursor-default" : "cursor-pointer",
        c.border, c.bg
      )}
    >
      <div className="shrink-0 mt-0.5">{toggling ? <span className={cn("text-[11px]", textMuted)}>…</span> : c.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-[13px] font-medium", status === "done" ? cn(textMuted, "line-through") : textPrimary)}>{label}</span>
          <span className={cn("text-[10px] rounded px-1.5 py-px", isDark ? "bg-white/[0.06] text-slate-400" : "bg-slate-100 text-slate-500")}>{owner}</span>
        </div>
        <div className={cn("text-[11px] mt-0.5", textMuted)}>{description}</div>
      </div>
      <span className={cn("text-[11px] font-medium shrink-0 mt-0.5", status === "done" ? "text-green-500" : textMuted)}>{c.label}</span>
    </button>
  );
}
