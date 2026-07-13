"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Clock, Upload,
  FileText, Plus, Trash2, Sparkles, AlertTriangle, ListChecks, X, Eye, Pencil,
  Monitor, Tablet, Smartphone, Folder, Lock, Grid3x3, LayoutList,
} from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { html as htmlLang } from "@codemirror/lang-html";
import { markdown as markdownLang } from "@codemirror/lang-markdown";
import { githubLight, githubDark } from "@uiw/codemirror-theme-github";
import { marked } from "marked";
import { cn } from "@/lib/utils";

// CodeMirror uses browser-only APIs — dynamic-imported with ssr:false, same isolation
// pattern this codebase already uses for recharts.
const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });
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

// Renders raw Markdown into a self-contained, readable HTML document (headings, code blocks,
// tables, blockquotes styled) for both the read-only viewer and the edit modal's live preview —
// `marked.parse()` alone only returns unstyled body markup, not a full styled page.
function markdownToHtmlDocument(md: string): string {
  const body = marked.parse(md, { async: false }) as string;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.65; color: #1e293b; max-width: 760px; margin: 0 auto; padding: 32px 24px; }
    h1, h2, h3, h4 { font-weight: 700; line-height: 1.3; margin-top: 1.5em; margin-bottom: 0.5em; }
    h1 { font-size: 1.85em; } h2 { font-size: 1.45em; } h3 { font-size: 1.15em; }
    p { margin: 0.75em 0; }
    a { color: #3358f4; }
    code { background: #f1f5f9; padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em; }
    pre { background: #0f172a; color: #e2e8f0; padding: 14px 16px; border-radius: 8px; overflow-x: auto; }
    pre code { background: none; padding: 0; color: inherit; }
    blockquote { border-left: 3px solid #cbd5e1; margin: 1em 0; padding: 0.25em 1em; color: #64748b; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; }
    img { max-width: 100%; }
    ul, ol { padding-left: 1.4em; }
    hr { border: none; border-top: 1px solid #e2e8f0; margin: 2em 0; }
  </style></head><body>${body}</body></html>`;
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

// HTML Mockup editor's preview-pane viewport presets — 768/390 are standard tablet/mobile
// breakpoints, not on Tailwind's spacing scale, hence the arbitrary-value width classes.
const PREVIEW_SIZES = [
  // `width` is the virtual/design viewport the page renders at, scaled to fit the actual
  // preview pane (see the scale-to-fit logic in HtmlEditorModal) — not the pane's own width.
  // Desktop needs a real desktop width (not 100% of the pane, which is usually narrower than
  // the page's own responsive breakpoint, e.g. 900px, and would trigger its mobile layout
  // instead) — 1280px matches Tailwind's `xl` breakpoint.
  { key: "full", label: "Desktop", icon: Monitor, width: 1280 },
  { key: "tablet", label: "Tablet", icon: Tablet, width: 768 },
  { key: "mobile", label: "Mobile", icon: Smartphone, width: 390 },
] as const;
type PreviewSizeKey = (typeof PREVIEW_SIZES)[number]["key"];

// Storage/KB File Explorer — role-picker options, copied from the Customers → Assets tab's
// "Add Asset" modal (src/app/v2/(hub)/customers/[customerId]/client.tsx) to keep the same
// visual/behavioral convention, per this codebase's page-scoped UI rule (inline the pattern
// rather than importing a component across two otherwise-unrelated pages).
const ASSET_ROLE_OPTIONS = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "pm", label: "PM" },
  { value: "developer", label: "Developer" },
] as const;
const ASSET_ROLE_LABELS: Record<string, string> = Object.fromEntries(ASSET_ROLE_OPTIONS.map((r) => [r.value, r.label]));

// Type badge for the Credentials & links list (task 140) — copied from the Customers →
// Assets tab (src/app/v2/(hub)/customers/[customerId]/client.tsx) per the page-scoped UI
// convention, same as ASSET_ROLE_OPTIONS above.
const ASSET_TYPE_LABELS: Record<"link" | "credential", string> = { link: "LINK", credential: "CRED" };
const ASSET_TYPE_CLS_LIGHT: Record<"link" | "credential", string> = { link: "bg-indigo-50 text-indigo-600", credential: "bg-amber-50 text-amber-600" };
const ASSET_TYPE_CLS_DARK: Record<"link" | "credential", string> = { link: "text-indigo-400 bg-indigo-500/15", credential: "text-amber-400 bg-amber-500/15" };
const assetTypeCls = (type: "link" | "credential", isDark: boolean) => (isDark ? ASSET_TYPE_CLS_DARK : ASSET_TYPE_CLS_LIGHT)[type];

// Folder categorization for the File Explorer — derived from each asset's own `label`, which
// every upload call site in this file already sets consistently (Business Facts, Documents,
// Outcome Target, Migration Checklist, Content Map, HTML Mockup). Anything unmapped (e.g. a
// future step's uploads) falls into "Other" rather than being hidden.
const ASSET_FOLDER_BY_LABEL: Record<string, string> = {
  "Business Facts": "Business Files",
  "Documents": "Business Files",
  "Outcome Target": "Outcome Target",
  "Migration Checklist": "Checklist",
  "Content Map": "Content Map",
  "HTML Mockup": "HTML Mockup",
};
function folderForAsset(a: AssetRow): string {
  return ASSET_FOLDER_BY_LABEL[a.label] ?? "Other";
}
const ASSET_FOLDER_ORDER = ["Business Files", "Outcome Target", "Checklist", "Content Map", "HTML Mockup", "Other"];

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Phase 1 completion transition — content sourced from the QBR spec's own "2.4 Phase 1
// Checklist (Item Completion Criteria)" table. Presented as narrative context for what
// Phase 1 covered, not as a live-validated readiness gate — none of these 6 map to a real
// queryable signal today (e.g. "all team members have access" has no membership model to
// check), so this is a fixed animated sequence, not derived from actual per-item status.
const PHASE1_COMPLETION_CRITERIA = [
  { label: "Kickoff meeting held", detail: "Meeting notes filed" },
  { label: "Storage folder created", detail: "All team members have access" },
  { label: "PF knowledge base live", detail: "All KB categories populated" },
  { label: "All 8 deliverables filed", detail: "Correct sub-folders, accessible" },
  { label: "HTML mockup complete", detail: "Internal review approved" },
  { label: "Client call completed", detail: "Written sign-off received" },
] as const;
const PHASE1_TRANSITION_STAGGER = 0.22; // seconds between each criterion animating in

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
  const [showTransition, setShowTransition] = useState(false);

  const kickoffData = (wizardData.kickoff as Record<string, unknown>) ?? {};
  const storageKbData = (wizardData["storage-kb"] as Record<string, unknown>) ?? {};
  const outcomeTargetData = (wizardData["outcome-target"] as Record<string, unknown>) ?? {};
  const migrationChecklistData = (wizardData["migration-checklist"] as Record<string, unknown>) ?? {};
  const contentMapData = (wizardData["content-map"] as Record<string, unknown>) ?? {};

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
  // dnsAccess/credentialsNote textareas removed (task 140 follow-up) — superseded by the
  // structured "Credentials & links" list, which covers the same DNS/3rd-party-credential
  // inputs with per-field sensitivity and sharing controls.

  const [uploadedFiles, setUploadedFiles] = useState<AssetRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Storage/KB File Explorer — every Phase 1 asset across all steps, categorized into
  // folders. Fetched from the generic (already role-filtered server-side) assets endpoint
  // and filtered client-side, since the dataset is small and no phase/project query param
  // exists on that route.
  const [phase1Assets, setPhase1Assets] = useState<AssetRow[]>([]);
  const [phase1AssetsError, setPhase1AssetsError] = useState<string | null>(null);
  const [permissionsUpdatingId, setPermissionsUpdatingId] = useState<string | null>(null);
  // Sharing picker (task 138) — lightweight staff directory for the File Explorer's
  // permissions panel.
  const [staffDirectory, setStaffDirectory] = useState<{ id: string; full_name: string | null; role: string }[]>([]);

  // Credentials & links list (task 140) — non-file Phase 1 assets, sourced from the same
  // phase1Assets state the File Explorer already fetches; no separate fetch needed.
  const [showAddCredentialLink, setShowAddCredentialLink] = useState(false);
  // Keyed by `${assetId}::${fieldIndex}` — per-field reveal, not per-asset (task 140 follow-up).
  const [revealedCredentialFields, setRevealedCredentialFields] = useState<Set<string>>(new Set());
  const [credentialLinkDeleteError, setCredentialLinkDeleteError] = useState<string | null>(null);

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

  const [migrationChecklistText, setMigrationChecklistText] = useState((migrationChecklistData.checklistText as string) ?? "");
  const [migrationChecklistFiles, setMigrationChecklistFiles] = useState<AssetRow[]>([]);
  const [uploadingMigrationChecklistFile, setUploadingMigrationChecklistFile] = useState(false);
  const [migrationChecklistUploadError, setMigrationChecklistUploadError] = useState<string | null>(null);
  const [viewingMigrationChecklistFileId, setViewingMigrationChecklistFileId] = useState<string | null>(null);
  // Satisfied by either typed text or an uploaded document — same either/or pattern as Outcome Target.
  const isMigrationChecklistFilled = stripHtml(migrationChecklistText).length > 0 || migrationChecklistFiles.length > 0;
  const [migrationChecklistFieldError, setMigrationChecklistFieldError] = useState(false);

  const [migrationChecklistSaveStatus, setMigrationChecklistSaveStatus] = useState<SaveStatus>("idle");
  const [migrationChecklistLastSavedAt, setMigrationChecklistLastSavedAt] = useState<Date | null>(null);
  const [migrationChecklistSaveError, setMigrationChecklistSaveError] = useState<string | null>(null);
  const lastMigrationChecklistSavedRef = useRef<string>(
    JSON.stringify({ checklistText: (migrationChecklistData.checklistText as string) ?? "" })
  );

  const [contentMapText, setContentMapText] = useState((contentMapData.contentMapText as string) ?? "");
  const [contentMapFiles, setContentMapFiles] = useState<AssetRow[]>([]);
  const [uploadingContentMapFile, setUploadingContentMapFile] = useState(false);
  const [contentMapUploadError, setContentMapUploadError] = useState<string | null>(null);
  const [viewingContentMapFileId, setViewingContentMapFileId] = useState<string | null>(null);
  // Satisfied by either typed text or an uploaded document — same either/or pattern as Outcome Target.
  const isContentMapFilled = stripHtml(contentMapText).length > 0 || contentMapFiles.length > 0;
  const [contentMapFieldError, setContentMapFieldError] = useState(false);

  const [contentMapSaveStatus, setContentMapSaveStatus] = useState<SaveStatus>("idle");
  const [contentMapLastSavedAt, setContentMapLastSavedAt] = useState<Date | null>(null);
  const [contentMapSaveError, setContentMapSaveError] = useState<string | null>(null);
  const lastContentMapSavedRef = useRef<string>(
    JSON.stringify({ contentMapText: (contentMapData.contentMapText as string) ?? "" })
  );

  // HTML Mockup — file-only, no rich text alternative (a mockup is inherently a file).
  const [htmlMockupFiles, setHtmlMockupFiles] = useState<AssetRow[]>([]);
  const [uploadingHtmlMockupFile, setUploadingHtmlMockupFile] = useState(false);
  const [htmlMockupUploadError, setHtmlMockupUploadError] = useState<string | null>(null);
  const [viewingHtmlMockupFileId, setViewingHtmlMockupFileId] = useState<string | null>(null);
  const isHtmlMockupFilled = htmlMockupFiles.length > 0;
  const [editingHtmlAsset, setEditingHtmlAsset] = useState<AssetRow | null>(null);
  const [editingHtmlContent, setEditingHtmlContent] = useState<string | null>(null);
  const [editingHtmlLoadError, setEditingHtmlLoadError] = useState<string | null>(null);

  const [localDeliverables, setLocalDeliverables] = useState(deliverables);
  const [localInternal, setLocalInternal] = useState(internalDeliverables);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const kickoffSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storageKbSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outcomeSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outcomeProgressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const migrationChecklistSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentMapSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        body: JSON.stringify({ subPhaseKey: "storage-kb", data: { documentsNote } }),
      }).catch(() => {});
    }, 2000);
    return () => { if (storageKbSaveRef.current) clearTimeout(storageKbSaveRef.current); };
  }, [project.id, documentsNote]);

  // Fetch all Phase 1 assets for the Storage/KB File Explorer — small dataset, fetched once
  // on mount rather than gated to only when the storage-kb step is active, since switching
  // steps shouldn't show a loading flash for what's normally a handful of files.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/customers/${project.customer_id}/assets`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch assets");
        return res.json();
      })
      .then((data: AssetRow[]) => {
        if (cancelled) return;
        setPhase1Assets(data.filter((a) => a.phase_number === 1 && a.project_id === project.id));
      })
      .catch(() => {
        if (!cancelled) setPhase1AssetsError("Failed to load project files.");
      });
    return () => {
      cancelled = true;
    };
  }, [project.customer_id, project.id]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/staff-directory")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: { id: string; full_name: string | null; role: string }[]) => {
        if (!cancelled) setStaffDirectory(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Debounced autosave — Migration checklist field. Same skip-if-unchanged +
  // save-status pattern as the Outcome target effect above.
  useEffect(() => {
    const payload = { checklistText: migrationChecklistText };
    const payloadJson = JSON.stringify(payload);
    if (payloadJson === lastMigrationChecklistSavedRef.current) return;

    if (migrationChecklistSaveRef.current) clearTimeout(migrationChecklistSaveRef.current);
    migrationChecklistSaveRef.current = setTimeout(() => {
      setMigrationChecklistSaveStatus("saving");
      fetch(`/api/projects/${project.id}/programme/wizard-data`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subPhaseKey: "migration-checklist", data: payload }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to save");
          lastMigrationChecklistSavedRef.current = payloadJson;
          setMigrationChecklistSaveStatus("saved");
          setMigrationChecklistLastSavedAt(new Date());
        })
        .catch(() => {
          setMigrationChecklistSaveStatus("error");
          setMigrationChecklistSaveError("Failed to save changes");
        });
    }, 2000);
    return () => { if (migrationChecklistSaveRef.current) clearTimeout(migrationChecklistSaveRef.current); };
  }, [project.id, migrationChecklistText]);

  // Debounced autosave — Content map field. Same skip-if-unchanged + save-status
  // pattern as the Migration checklist effect above.
  useEffect(() => {
    const payload = { contentMapText };
    const payloadJson = JSON.stringify(payload);
    if (payloadJson === lastContentMapSavedRef.current) return;

    if (contentMapSaveRef.current) clearTimeout(contentMapSaveRef.current);
    contentMapSaveRef.current = setTimeout(() => {
      setContentMapSaveStatus("saving");
      fetch(`/api/projects/${project.id}/programme/wizard-data`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subPhaseKey: "content-map", data: payload }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to save");
          lastContentMapSavedRef.current = payloadJson;
          setContentMapSaveStatus("saved");
          setContentMapLastSavedAt(new Date());
        })
        .catch(() => {
          setContentMapSaveStatus("error");
          setContentMapSaveError("Failed to save changes");
        });
    }, 2000);
    return () => { if (contentMapSaveRef.current) clearTimeout(contentMapSaveRef.current); };
  }, [project.id, contentMapText]);

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
      formData.append("project_id", project.id);
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
      // Also reflected in the Storage/KB File Explorer's own asset list — kept in sync so a
      // file added from the explorer's "Add file" action (which reuses this same handler)
      // shows up immediately without a refetch.
      setPhase1Assets((prev) => [...prev, newAsset]);
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
      formData.append("project_id", project.id);
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

  // Also doubles as the Storage/KB File Explorer's "Remove" action (any Phase 1 asset, not
  // just "Documents"-labeled ones) — kept in sync with phase1Assets the same way handleUpload
  // above is.
  const handleRemoveFile = async (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
    setPhase1Assets((prev) => prev.filter((f) => f.id !== id));
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
      formData.append("project_id", project.id);
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

  // Generic viewer entry point for the Storage/KB File Explorer — takes the asset row
  // directly (rather than looking it up by id in a step-specific local array, the way
  // handleViewOutcomeFile and its equivalents do), since the explorer shows files uploaded
  // by any step. Reuses the same shared viewerFile/viewerUrl/viewerLoading/viewerError state.
  const handleViewAsset = async (asset: AssetRow) => {
    setViewerFile(asset);
    setViewerUrl(null);
    setViewerError(null);
    setViewerLoading(true);
    try {
      const res = await fetch(`/api/customers/${project.customer_id}/assets/${asset.id}/file-url`);
      if (!res.ok) throw new Error("Failed to get file URL");
      const { url } = await res.json();
      setViewerUrl(url);
    } catch {
      setViewerError("Failed to load file preview.");
    } finally {
      setViewerLoading(false);
    }
  };

  // Accepts either/both keys — the new PATCH route (task 138) applies whichever is present,
  // so toggling a role doesn't require re-sending the current specific-people selection and
  // vice versa.
  const handlePermissionsChange = async (
    assetId: string,
    updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }
  ) => {
    setPermissionsUpdatingId(assetId);
    try {
      const res = await fetch(`/api/customers/${project.customer_id}/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error();
      const updated: AssetRow = await res.json();
      setPhase1Assets((prev) => prev.map((a) => (a.id === assetId ? updated : a)));
    } catch {
      setPhase1AssetsError("Failed to update file permissions.");
    } finally {
      setPermissionsUpdatingId(null);
    }
  };

  const handleDeleteCredentialLink = async (assetId: string) => {
    setCredentialLinkDeleteError(null);
    try {
      const res = await fetch(`/api/customers/${project.customer_id}/assets?id=${assetId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPhase1Assets((prev) => prev.filter((a) => a.id !== assetId));
    } catch {
      setCredentialLinkDeleteError("Failed to remove item.");
    }
  };

  const handleMigrationChecklistUpload = async (file: File) => {
    setUploadingMigrationChecklistFile(true);
    setMigrationChecklistUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("project_id", project.id);
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
          label: "Migration Checklist",
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
      setMigrationChecklistFiles((prev) => [...prev, newAsset]);
    } catch (err) {
      setMigrationChecklistUploadError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploadingMigrationChecklistFile(false);
    }
  };

  const handleRemoveMigrationChecklistFile = async (id: string) => {
    setMigrationChecklistFiles((prev) => prev.filter((f) => f.id !== id));
    try {
      await fetch(`/api/customers/${project.customer_id}/assets?id=${id}`, { method: "DELETE" });
    } catch {
      setMigrationChecklistUploadError("Failed to remove file");
    }
  };

  // In-app preview — reuses the shared viewerFile/viewerUrl/viewerLoading/viewerError state,
  // same as handleViewOutcomeFile.
  const handleViewMigrationChecklistFile = async (id: string) => {
    const file = migrationChecklistFiles.find((f) => f.id === id);
    if (!file) return;
    setViewerFile(file);
    setViewerUrl(null);
    setViewerError(null);
    setViewerLoading(true);
    setViewingMigrationChecklistFileId(id);
    try {
      const res = await fetch(`/api/customers/${project.customer_id}/assets/${id}/file-url`);
      if (!res.ok) throw new Error("Failed to get file URL");
      const { url } = await res.json();
      setViewerUrl(url);
    } catch {
      setViewerError("Failed to load file preview.");
    } finally {
      setViewerLoading(false);
      setViewingMigrationChecklistFileId(null);
    }
  };

  const handleContentMapUpload = async (file: File) => {
    setUploadingContentMapFile(true);
    setContentMapUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("project_id", project.id);
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
          label: "Content Map",
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
      setContentMapFiles((prev) => [...prev, newAsset]);
    } catch (err) {
      setContentMapUploadError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploadingContentMapFile(false);
    }
  };

  const handleRemoveContentMapFile = async (id: string) => {
    setContentMapFiles((prev) => prev.filter((f) => f.id !== id));
    try {
      await fetch(`/api/customers/${project.customer_id}/assets?id=${id}`, { method: "DELETE" });
    } catch {
      setContentMapUploadError("Failed to remove file");
    }
  };

  // In-app preview — reuses the shared viewerFile/viewerUrl/viewerLoading/viewerError state,
  // same as handleViewOutcomeFile/handleViewMigrationChecklistFile.
  const handleViewContentMapFile = async (id: string) => {
    const file = contentMapFiles.find((f) => f.id === id);
    if (!file) return;
    setViewerFile(file);
    setViewerUrl(null);
    setViewerError(null);
    setViewerLoading(true);
    setViewingContentMapFileId(id);
    try {
      const res = await fetch(`/api/customers/${project.customer_id}/assets/${id}/file-url`);
      if (!res.ok) throw new Error("Failed to get file URL");
      const { url } = await res.json();
      setViewerUrl(url);
    } catch {
      setViewerError("Failed to load file preview.");
    } finally {
      setViewerLoading(false);
      setViewingContentMapFileId(null);
    }
  };

  const handleHtmlMockupUpload = async (file: File) => {
    setUploadingHtmlMockupFile(true);
    setHtmlMockupUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("project_id", project.id);
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
          label: "HTML Mockup",
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
      setHtmlMockupFiles((prev) => [...prev, newAsset]);
    } catch (err) {
      setHtmlMockupUploadError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploadingHtmlMockupFile(false);
    }
  };

  const handleRemoveHtmlMockupFile = async (id: string) => {
    setHtmlMockupFiles((prev) => prev.filter((f) => f.id !== id));
    try {
      await fetch(`/api/customers/${project.customer_id}/assets?id=${id}`, { method: "DELETE" });
    } catch {
      setHtmlMockupUploadError("Failed to remove file");
    }
  };

  // In-app read-only preview — reuses the shared viewerFile/viewerUrl/viewerLoading/viewerError
  // state, same as every other step's file viewer.
  const handleViewHtmlMockupFile = async (id: string) => {
    const file = htmlMockupFiles.find((f) => f.id === id);
    if (!file) return;
    setViewerFile(file);
    setViewerUrl(null);
    setViewerError(null);
    setViewerLoading(true);
    setViewingHtmlMockupFileId(id);
    try {
      const res = await fetch(`/api/customers/${project.customer_id}/assets/${id}/file-url`);
      if (!res.ok) throw new Error("Failed to get file URL");
      const { url } = await res.json();
      setViewerUrl(url);
    } catch {
      setViewerError("Failed to load file preview.");
    } finally {
      setViewerLoading(false);
      setViewingHtmlMockupFileId(null);
    }
  };

  // Opens the editable split-view modal — fetches the file's raw HTML text via the same
  // signed-URL endpoint the read-only viewer uses, then a plain fetch(url) for the content.
  const handleOpenHtmlEditor = async (asset: AssetRow) => {
    setEditingHtmlAsset(asset);
    setEditingHtmlContent(null);
    setEditingHtmlLoadError(null);
    try {
      const urlRes = await fetch(`/api/customers/${project.customer_id}/assets/${asset.id}/file-url`);
      if (!urlRes.ok) throw new Error();
      const { url } = await urlRes.json();
      const contentRes = await fetch(url);
      if (!contentRes.ok) throw new Error();
      setEditingHtmlContent(await contentRes.text());
    } catch {
      setEditingHtmlLoadError("Failed to load file content.");
    }
  };

  const closeHtmlEditor = () => {
    setEditingHtmlAsset(null);
    setEditingHtmlContent(null);
    setEditingHtmlLoadError(null);
  };

  const handleHtmlEditorSaved = (assetId: string, newSize: number) => {
    setHtmlMockupFiles((prev) => prev.map((f) => (f.id === assetId ? { ...f, file_size: newSize } : f)));
  };

  // Validates field-dependent checklist items before letting them reach "done" — intercepts
  // the click instead of touching the shared internal-deliverables PATCH route. Used for every
  // step's checklist items (not just Kickoff's original two) since it's a no-op passthrough to
  // setInternalStatus for any key it doesn't specifically validate.
  const handleValidatedInternalToggle = (key: string, currentStatus: string) => {
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
      if (key === "html-md-files" && !isHtmlMockupFilled) {
        setChecklistValidationError("Upload at least one mockup file before marking this done.");
        return;
      }
    }
    setChecklistValidationError(null);
    setInternalStatus(key, target);
  };

  // Continue → gate on any incomplete internal-deliverable checklist item for the current step
  // (html-mockup's own file requirement is validated at the checklist-item level instead — see
  // handleValidatedInternalToggle — not duplicated here, which previously caused a false-positive
  // block when the checklist item was already done from an earlier session but the file list,
  // which isn't hydrated from customer_assets on mount, was empty in the current session),
  // plus Outcome target/Migration checklist/Content map's own required-field checks (each has a
  // text-or-file either/or, so isn't blocked by the same file-hydration gap in the common case
  // where at least some text was saved).
  const handleContinueClick = () => {
    if (step.key === "outcome-target" && !isOutcomeFilled) {
      setOutcomeFieldError(true);
      return;
    }
    if (step.key === "migration-checklist" && !isMigrationChecklistFilled) {
      setMigrationChecklistFieldError(true);
      return;
    }
    if (step.key === "content-map" && !isContentMapFilled) {
      setContentMapFieldError(true);
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

  // "Mark all as done" from the incomplete-checklist modal — defers to the required-fields
  // confirmation modal if any gated item (Kickoff's two, or html-mockup's file requirement)
  // would otherwise fail the same validation handleValidatedInternalToggle applies per-item.
  const handleMarkAllDone = () => {
    const hasFailing = incompleteItems.some(
      (item) =>
        (item.key === "kickoff-contacts-confirmed" && !isContactsValid) ||
        (item.key === "kickoff-goals-timeline-filed" && !isBusinessFactsFilled) ||
        (item.key === "html-md-files" && !isHtmlMockupFilled)
    );
    if (hasFailing) {
      setShowForceConfirmModal(true);
      return;
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
    setShowTransition(true);
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
      setShowTransition(false);
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

  if (showTransition && !done) {
    return <PhaseCompletionTransition isDark={isDark} />;
  }

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
          {step.key === "migration-checklist" && (
            <SaveIndicator status={migrationChecklistSaveStatus} lastSavedAt={migrationChecklistLastSavedAt} error={migrationChecklistSaveError} />
          )}
          {step.key === "content-map" && (
            <SaveIndicator status={contentMapSaveStatus} lastSavedAt={contentMapLastSavedAt} error={contentMapSaveError} />
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
          <div className="flex flex-col gap-4 mb-5">
            <div className="max-w-xl">
              <label className={labelCls}>Documents (branding / proposals / collateral)</label>
              <textarea rows={2} value={documentsNote} onChange={(e) => setDocumentsNote(e.target.value)} placeholder="Notes on what's provided / where it lives…" className={inputBase} />
            </div>
            <div>
              <label className={labelCls}>Project files</label>
              <StorageFileExplorer
                assets={phase1Assets}
                error={phase1AssetsError}
                isDark={isDark}
                onView={handleViewAsset}
                viewingId={viewerLoading ? (viewerFile?.id ?? null) : null}
                onPermissionsChange={handlePermissionsChange}
                permissionsUpdatingId={permissionsUpdatingId}
                onUpload={handleUpload}
                uploading={uploading}
                uploadError={uploadError}
                onRemove={handleRemoveFile}
                staffDirectory={staffDirectory}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelCls}>Credentials & links</label>
                <button
                  type="button"
                  onClick={() => setShowAddCredentialLink(true)}
                  className="inline-flex items-center gap-1 text-[11.5px] font-medium px-2 py-1 rounded-md cursor-pointer border-none transition-colors text-brand hover:bg-brand/10"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
              {credentialLinkDeleteError && <p className="text-[11.5px] text-red-500 mb-1.5">{credentialLinkDeleteError}</p>}
              {(() => {
                const credentialsAndLinks = phase1Assets.filter((a): a is AssetRow & { type: "link" | "credential" } => a.type === "link" || a.type === "credential");
                if (credentialsAndLinks.length === 0) {
                  return <p className={cn("text-[11.5px]", textMuted)}>No credentials or links added yet.</p>;
                }
                return (
                  <div className="flex flex-col gap-1.5">
                    {credentialsAndLinks.map((asset) => {
                      // Per-field sensitivity (task 140 follow-up) — each field carries its own
                      // `masked` flag; fields saved before this change (or the whole-asset
                      // `masked` toggle) fall back to the asset-level flag so nothing regresses
                      // to plaintext-by-default.
                      const credentialFields = asset.type === "credential" && Array.isArray(asset.fields)
                        ? (asset.fields as { label: string; value: string; masked?: boolean }[])
                        : [];
                      return (
                        <div key={asset.id} className={cn("flex items-start gap-3 px-3 py-2.5 rounded-lg", isDark ? "bg-white/[0.03]" : "bg-slate-50")}>
                          <span className={cn("text-[10px] font-bold rounded px-1.5 py-px shrink-0 mt-0.5", assetTypeCls(asset.type, isDark))}>
                            {ASSET_TYPE_LABELS[asset.type]}
                          </span>
                          <span className={cn("text-[12px] font-semibold shrink-0 w-32 truncate mt-0.5", textPrimary)}>{asset.label}</span>
                          <div className="flex-1 min-w-0 flex flex-col gap-1">
                            {asset.type === "credential" ? (
                              credentialFields.map((field, i) => {
                                const fieldKey = `${asset.id}::${i}`;
                                const fieldRevealed = revealedCredentialFields.has(fieldKey);
                                const isSensitive = field.masked ?? asset.masked;
                                return (
                                  <div key={i} className="flex items-center gap-2">
                                    <span className={cn("text-[11px] font-mono shrink-0", textMuted)}>{field.label}:</span>
                                    <span className={cn("text-[11px] font-mono truncate", textPrimary)}>
                                      {isSensitive && !fieldRevealed ? "••••••••" : field.value}
                                    </span>
                                    {isSensitive && (
                                      <button
                                        type="button"
                                        onClick={() => setRevealedCredentialFields((prev) => {
                                          const next = new Set(prev);
                                          if (fieldRevealed) next.delete(fieldKey); else next.add(fieldKey);
                                          return next;
                                        })}
                                        className="text-[10.5px] font-medium text-brand bg-transparent border-none cursor-pointer shrink-0"
                                      >
                                        {fieldRevealed ? "Hide" : "Show"}
                                      </button>
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              <span className={cn("text-[11px] font-mono truncate mt-0.5", textMuted)}>{asset.value}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 mt-0.5">
                            {asset.type === "link" && (
                              <a href={asset.value ?? "#"} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-brand hover:opacity-70 transition-opacity">
                                Open
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteCredentialLink(asset.id)}
                              aria-label={`Remove ${asset.label}`}
                              title="Remove"
                              className="p-1 rounded-md cursor-pointer border-none bg-transparent text-red-500 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {showAddCredentialLink && (
          <AddCredentialLinkModal
            isDark={isDark}
            customerId={project.customer_id}
            projectId={project.id}
            staffDirectory={staffDirectory}
            onClose={() => setShowAddCredentialLink(false)}
            onCreated={(asset) => setPhase1Assets((prev) => [...prev, asset])}
          />
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

        {step.key === "migration-checklist" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_280px] gap-x-6 gap-y-4 mb-5">
            <div>
              <RichTextField
                label="Migration checklist / audit notes"
                value={migrationChecklistText}
                onChange={setMigrationChecklistText}
                placeholder="e.g. Pages to migrate, redirects needed, content gaps found in the audit… (required — text or an attached document)"
                isDark={isDark}
                minHeightClass="min-h-[220px]"
                maxHeightClass="max-h-[420px]"
                hasError={migrationChecklistFieldError && !isMigrationChecklistFilled}
              />
              {migrationChecklistFieldError && !isMigrationChecklistFilled && (
                <p className="text-[11px] text-red-500 mt-1">Add the migration checklist / audit notes — text or an attached document — before continuing.</p>
              )}
            </div>
            <div className="hidden lg:flex flex-col items-center gap-2 px-1 pt-1">
              <div className={cn("w-px flex-1", isDark ? "bg-white/[0.08]" : "bg-slate-200")} />
              <span className={cn("text-[10px] font-semibold uppercase tracking-wide", textMuted)}>Or</span>
              <div className={cn("w-px flex-1", isDark ? "bg-white/[0.08]" : "bg-slate-200")} />
            </div>
            <div>
              <label className={kickoffLabelCls}>Upload a document instead</label>
              <p className={cn("text-[11px] mb-1.5", textMuted)}>Prefer to attach a file (e.g. a site audit spreadsheet) over typing? Upload it here instead.</p>
              {migrationChecklistUploadError && <p className="text-[12px] text-red-500 mb-2">{migrationChecklistUploadError}</p>}
              <FileUploadBox
                files={migrationChecklistFiles}
                uploading={uploadingMigrationChecklistFile}
                onFile={handleMigrationChecklistUpload}
                onRemove={handleRemoveMigrationChecklistFile}
                onView={handleViewMigrationChecklistFile}
                viewingId={viewingMigrationChecklistFileId}
                isDark={isDark}
              />
            </div>
          </div>
        )}

        {step.key === "content-map" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_280px] gap-x-6 gap-y-4 mb-5">
            <div>
              <RichTextField
                label="Content clusters & 90-day publishing schedule"
                value={contentMapText}
                onChange={setContentMapText}
                placeholder="e.g. Topic clusters, target keywords, publishing cadence through Day 90… (required — text or an attached document)"
                isDark={isDark}
                minHeightClass="min-h-[220px]"
                maxHeightClass="max-h-[420px]"
                hasError={contentMapFieldError && !isContentMapFilled}
              />
              {contentMapFieldError && !isContentMapFilled && (
                <p className="text-[11px] text-red-500 mt-1">Add the content clusters and publishing schedule — text or an attached document — before continuing.</p>
              )}
            </div>
            <div className="hidden lg:flex flex-col items-center gap-2 px-1 pt-1">
              <div className={cn("w-px flex-1", isDark ? "bg-white/[0.08]" : "bg-slate-200")} />
              <span className={cn("text-[10px] font-semibold uppercase tracking-wide", textMuted)}>Or</span>
              <div className={cn("w-px flex-1", isDark ? "bg-white/[0.08]" : "bg-slate-200")} />
            </div>
            <div>
              <label className={kickoffLabelCls}>Upload a document instead</label>
              <p className={cn("text-[11px] mb-1.5", textMuted)}>Prefer to attach a file (e.g. a content calendar spreadsheet) over typing? Upload it here instead.</p>
              {contentMapUploadError && <p className="text-[12px] text-red-500 mb-2">{contentMapUploadError}</p>}
              <FileUploadBox
                files={contentMapFiles}
                uploading={uploadingContentMapFile}
                onFile={handleContentMapUpload}
                onRemove={handleRemoveContentMapFile}
                onView={handleViewContentMapFile}
                viewingId={viewingContentMapFileId}
                isDark={isDark}
              />
            </div>
          </div>
        )}

        {step.key === "html-mockup" && (
          <div className="max-w-xl mb-5">
            <label className={kickoffLabelCls}>Mockup file</label>
            <p className={cn("text-[11px] mb-1.5", textMuted)}>Upload the HTML mockup for client approval — HTML files can be edited directly in-app.</p>
            {htmlMockupUploadError && <p className="text-[12px] text-red-500 mb-2">{htmlMockupUploadError}</p>}
            <HtmlMockupFileList
              files={htmlMockupFiles}
              uploading={uploadingHtmlMockupFile}
              onFile={handleHtmlMockupUpload}
              onRemove={handleRemoveHtmlMockupFile}
              onView={handleViewHtmlMockupFile}
              onEdit={handleOpenHtmlEditor}
              viewingId={viewingHtmlMockupFileId}
              isDark={isDark}
            />
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
                    onClick={() => handleValidatedInternalToggle(id.key, iStatus)}
                    disabled={togglingKey === `internal-${id.key}`}
                    className="w-full flex items-center gap-2 py-1 bg-transparent border-none cursor-pointer text-left disabled:opacity-60"
                  >
                    {iStatus === "done" ? <CheckCircle2 size={13} className="text-green-500" /> : iStatus === "in_progress" ? <Clock size={13} className="text-blue-500" /> : <Circle size={13} className={textMuted} />}
                    <span className={cn("text-[12px]", iStatus === "done" ? cn(textMuted, "line-through") : textPrimary)}>{id.name}</span>
                  </button>
                );
              })}
              {checklistValidationError && (
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

      {editingHtmlAsset && (
        <HtmlEditorModal
          file={editingHtmlAsset}
          initialHtml={editingHtmlContent}
          loadError={editingHtmlLoadError}
          isDark={isDark}
          customerId={project.customer_id}
          onClose={closeHtmlEditor}
          onSaved={handleHtmlEditorSaved}
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

// Finder-style file browser for the Storage/KB step — groups every Phase 1 asset (uploaded by
// any step) into folders by label, with an inline expandable permissions panel per file
// (rather than a floating popover, to avoid click-outside/positioning edge cases for a small,
// low-traffic internal tool control) reusing the exact role-toggle-pill visual pattern from
// the Customers → Assets tab's "Add Asset" modal.
function StorageFileExplorer({
  assets, error, isDark, onView, viewingId, onPermissionsChange, permissionsUpdatingId, onUpload, uploading, uploadError, onRemove, staffDirectory,
}: {
  assets: AssetRow[]; error: string | null; isDark: boolean; onView: (asset: AssetRow) => void; viewingId: string | null;
  onPermissionsChange: (assetId: string, updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => void;
  permissionsUpdatingId: string | null;
  onUpload: (file: File) => void; uploading: boolean; uploadError: string | null; onRemove: (assetId: string) => void;
  staffDirectory: { id: string; full_name: string | null; role: string }[];
}) {
  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";
  const inputRef = useRef<HTMLInputElement>(null);
  // No auto-select of the first folder (unlike task 134) — starts on the folder-tiles view,
  // per the requested two-level Finder-style navigation.
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [permissionsOpenId, setPermissionsOpenId] = useState<string | null>(null);

  const grouped = new Map<string, AssetRow[]>();
  for (const a of assets) {
    const folder = folderForAsset(a);
    if (!grouped.has(folder)) grouped.set(folder, []);
    grouped.get(folder)!.push(a);
  }
  const folders = ASSET_FOLDER_ORDER.filter((f) => grouped.has(f));
  const filesInFolder = activeFolder ? (grouped.get(activeFolder) ?? []) : [];

  const getPermissionInfo = (f: AssetRow) => {
    const roleRestricted = !!f.allowed_roles && f.allowed_roles.length > 0;
    const userRestricted = !!f.allowed_user_ids && f.allowed_user_ids.length > 0;
    const restricted = roleRestricted || userRestricted;
    const permissionBadge = [
      roleRestricted ? f.allowed_roles!.map((r) => ASSET_ROLE_LABELS[r] ?? r).join(", ") : null,
      userRestricted ? `${f.allowed_user_ids!.length} ${f.allowed_user_ids!.length === 1 ? "person" : "people"}` : null,
    ].filter(Boolean).join(" + ") || "All roles";
    return { roleRestricted, userRestricted, restricted, permissionBadge };
  };

  const renderPermissionsPanel = (f: AssetRow, roleRestricted: boolean) => (
    <div className={cn("flex flex-col gap-2 px-2.5 py-2 rounded-lg mt-1 border", isDark ? "bg-white/[0.02] border-white/[0.06]" : "bg-slate-50 border-slate-100")}>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onPermissionsChange(f.id, { allowed_roles: [] })}
          className={cn(
            "px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer transition-colors",
            !roleRestricted ? "bg-brand text-white border-brand" : "bg-transparent text-slate-500 border-slate-200 hover:border-slate-300"
          )}
        >
          All
        </button>
        {ASSET_ROLE_OPTIONS.map((role) => {
          const active = f.allowed_roles?.includes(role.value) ?? false;
          return (
            <button
              key={role.value}
              type="button"
              onClick={() => {
                const current = f.allowed_roles ?? [];
                const next = active ? current.filter((r) => r !== role.value) : [...current, role.value];
                onPermissionsChange(f.id, { allowed_roles: next });
              }}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer transition-colors",
                active ? "bg-brand text-white border-brand" : "bg-transparent text-slate-500 border-slate-200 hover:border-slate-300"
              )}
            >
              {role.label}
            </button>
          );
        })}
      </div>
      <div>
        <div className={cn("text-[10px] font-semibold uppercase tracking-wide mb-1", textMuted)}>Share with specific people</div>
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          {staffDirectory.length === 0 && (
            <span className={cn("text-[11px]", textMuted)}>No staff directory entries found.</span>
          )}
          {staffDirectory.map((person) => {
            const active = f.allowed_user_ids?.includes(person.id) ?? false;
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => {
                  const current = f.allowed_user_ids ?? [];
                  const next = active ? current.filter((id) => id !== person.id) : [...current, person.id];
                  onPermissionsChange(f.id, { allowed_user_ids: next });
                }}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer transition-colors",
                  active ? "bg-brand text-white border-brand" : "bg-transparent text-slate-500 border-slate-200 hover:border-slate-300"
                )}
              >
                {person.full_name ?? "Unnamed"}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const fileActions = (f: AssetRow) => (
    <>
      <button
        type="button"
        onClick={() => onView(f)}
        disabled={viewingId === f.id}
        aria-label={`View ${f.file_name}`}
        title="View"
        className="shrink-0 p-1 rounded-md cursor-pointer border-none bg-transparent text-brand hover:bg-brand/10 transition-colors disabled:opacity-50"
      >
        <Eye size={12} />
      </button>
      <button
        type="button"
        onClick={() => setPermissionsOpenId((id) => (id === f.id ? null : f.id))}
        aria-label={`Permissions for ${f.file_name}`}
        title="Permissions"
        disabled={permissionsUpdatingId === f.id}
        className={cn(
          "shrink-0 p-1 rounded-md cursor-pointer border-none transition-colors disabled:opacity-50",
          permissionsOpenId === f.id ? "bg-brand/15 text-brand" : cn("bg-transparent", textMuted, "hover:bg-slate-500/10")
        )}
      >
        <Lock size={12} />
      </button>
      <button
        type="button"
        onClick={() => onRemove(f.id)}
        aria-label={`Remove ${f.file_name}`}
        title="Remove"
        className="shrink-0 p-1 rounded-md cursor-pointer border-none bg-transparent text-red-500 hover:bg-red-500/10 transition-colors"
      >
        <Trash2 size={12} />
      </button>
    </>
  );

  const uploadInput = (
    <>
      <input ref={inputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md cursor-pointer border-none transition-colors disabled:opacity-60 text-brand hover:bg-brand/10"
      >
        <Plus size={12} /> {uploading ? "Uploading…" : "Add file"}
      </button>
    </>
  );

  return (
    <div className={cn("rounded-lg border overflow-hidden", isDark ? "border-white/[0.08]" : "border-slate-200")}>
      {error && <p className="text-[12px] text-red-500 px-3 pt-2.5">{error}</p>}

      {!activeFolder ? (
        // Level 1: folder tiles — large folder icons, Finder/Explorer icon-view style.
        <div className="p-4">
          {folders.length === 0 ? (
            <div className={cn("text-[12.5px] py-8 text-center", textMuted)}>No files yet.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {folders.map((folder) => {
                const count = grouped.get(folder)?.length ?? 0;
                return (
                  <button
                    key={folder}
                    type="button"
                    onClick={() => setActiveFolder(folder)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-lg cursor-pointer border-none transition-colors",
                      isDark ? "bg-transparent hover:bg-white/[0.06]" : "bg-transparent hover:bg-slate-100"
                    )}
                  >
                    <Folder size={40} className="text-brand" fill="currentColor" fillOpacity={0.15} />
                    <span className={cn("text-[12px] font-medium text-center truncate w-full", textPrimary)}>{folder}</span>
                    <span className={cn("text-[10px]", textMuted)}>{count} file{count === 1 ? "" : "s"}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        // Level 2: files inside the selected folder, with a Grid/List toggle (default Grid).
        <div className="p-3 flex flex-col gap-2 min-h-[160px]">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveFolder(null)}
              className={cn("inline-flex items-center gap-1 text-[11.5px] font-medium px-2 py-1 rounded-md cursor-pointer border-none transition-colors", textMuted, isDark ? "hover:bg-white/[0.06]" : "hover:bg-slate-100")}
            >
              <ArrowLeft size={12} /> Folders
            </button>
            <span className={cn("text-[11.5px] font-semibold flex-1", textPrimary)}>{activeFolder}</span>
            <div className={cn("flex items-center gap-0.5 p-0.5 rounded-md", isDark ? "bg-white/[0.04]" : "bg-slate-100")}>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                title="Grid view"
                className={cn(
                  "p-1 rounded cursor-pointer border-none transition-colors",
                  viewMode === "grid" ? "bg-brand/15 text-brand" : cn("bg-transparent", textMuted)
                )}
              >
                <Grid3x3 size={13} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                aria-label="List view"
                title="List view"
                className={cn(
                  "p-1 rounded cursor-pointer border-none transition-colors",
                  viewMode === "list" ? "bg-brand/15 text-brand" : cn("bg-transparent", textMuted)
                )}
              >
                <LayoutList size={13} />
              </button>
            </div>
            {uploadInput}
          </div>
          {uploadError && <p className="text-[11.5px] text-red-500">{uploadError}</p>}
          {filesInFolder.length === 0 && <div className={cn("text-[11.5px] py-6 text-center", textMuted)}>No files in this folder yet.</div>}

          {viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {filesInFolder.map((f) => {
                const { roleRestricted, restricted, permissionBadge } = getPermissionInfo(f);
                return (
                  <div key={f.id} className="flex flex-col">
                    <div className={cn("flex flex-col items-center gap-1 p-2.5 rounded-lg border", isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50")}>
                      <div className="w-11 h-11 rounded-lg bg-brand/10 flex items-center justify-center">
                        <FileText size={20} className="text-brand" />
                      </div>
                      <div className={cn("text-[11px] font-medium text-center line-clamp-2 w-full break-words", textPrimary)}>{f.file_name}</div>
                      <div className={cn("text-[9.5px]", textMuted)}>{formatFileSize(f.file_size)}</div>
                      <span className={cn(
                        "text-[9px] rounded-full px-1.5 py-0.5 whitespace-nowrap",
                        restricted ? (isDark ? "bg-amber-500/15 text-amber-400" : "bg-amber-50 text-amber-700") : (isDark ? "bg-white/[0.06] text-slate-400" : "bg-slate-100 text-slate-500")
                      )}>
                        {permissionBadge}
                      </span>
                      <div className="flex items-center gap-0.5 mt-1">{fileActions(f)}</div>
                    </div>
                    {permissionsOpenId === f.id && renderPermissionsPanel(f, roleRestricted)}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filesInFolder.map((f) => {
                const { roleRestricted, restricted, permissionBadge } = getPermissionInfo(f);
                return (
                  <div key={f.id} className="flex flex-col">
                    <div className={cn("flex items-center gap-2 px-2.5 py-2 rounded-lg", isDark ? "bg-white/[0.03]" : "bg-slate-50")}>
                      <div className="w-6 h-6 rounded-md bg-brand/10 flex items-center justify-center shrink-0">
                        <FileText size={11} className="text-brand" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={cn("text-[11.5px] font-medium truncate", textPrimary)}>{f.file_name}</div>
                        <div className={cn("text-[10px]", textMuted)}>{formatFileSize(f.file_size)}</div>
                      </div>
                      <span className={cn(
                        "text-[10px] rounded-full px-2 py-0.5 shrink-0 whitespace-nowrap",
                        restricted ? (isDark ? "bg-amber-500/15 text-amber-400" : "bg-amber-50 text-amber-700") : (isDark ? "bg-white/[0.06] text-slate-400" : "bg-slate-100 text-slate-500")
                      )}>
                        {permissionBadge}
                      </span>
                      {fileActions(f)}
                    </div>
                    {permissionsOpenId === f.id && renderPermissionsPanel(f, roleRestricted)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Modeled on the Customers → Assets tab's "Add Asset" modal (task 140) — Type narrowed to
// Credential/Link only, since File already has its own upload flow in StorageFileExplorer.
function AddCredentialLinkModal({
  isDark, customerId, projectId, staffDirectory, onClose, onCreated,
}: {
  isDark: boolean; customerId: string; projectId: string;
  staffDirectory: { id: string; full_name: string | null; role: string }[];
  onClose: () => void; onCreated: (asset: AssetRow) => void;
}) {
  const [type, setType] = useState<"link" | "credential">("link");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  // Per-field sensitivity (task 140 follow-up) — replaces the single whole-credential
  // "Mask value in UI" checkbox; each field carries its own Sensitive switch.
  const [fields, setFields] = useState<{ label: string; value: string; masked: boolean }[]>([{ label: "", value: "", masked: true }]);
  const [allowedRoles, setAllowedRoles] = useState<string[]>([]);
  const [allowedUserIds, setAllowedUserIds] = useState<string[]>([]);
  const [personSearch, setPersonSearch] = useState("");
  const [personDropdownOpen, setPersonDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";
  const cardCls = isDark ? "bg-[#121726] border border-white/[0.08] rounded-xl" : "bg-white border border-slate-200 rounded-xl";
  // Matches the Kickoff/New Project wizard field convention (rounded-[9px]/border-[1.5px]/
  // focus-glow), per the request to align this modal's fields with the rest of the wizard.
  const fieldLabelCls = cn("block text-[13px] font-medium mb-1.5", textPrimary);
  const fieldInputCls = cn(
    "w-full text-sm rounded-[9px] px-3.5 py-[11px] border-[1.5px] outline-none transition-[border-color,box-shadow] duration-150 font-[inherit]",
    isDark
      ? "bg-transparent border-white/[0.12] text-slate-200 placeholder:text-slate-500 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.18)]"
      : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.1)]"
  );

  const Switch = ({ checked, onChange, label: ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer border-none",
        checked ? "bg-brand" : isDark ? "bg-white/[0.15]" : "bg-slate-300"
      )}
    >
      <span className={cn("inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform", checked ? "translate-x-[18px]" : "translate-x-[3px]")} />
    </button>
  );

  const isValid =
    label.trim().length > 0 &&
    (type === "link" ? value.trim().length > 0 && isValidUrl(value.trim()) : fields.some((f) => f.label.trim() && f.value.trim()));

  const selectedPeople = allowedUserIds
    .map((id) => staffDirectory.find((p) => p.id === id))
    .filter((p): p is { id: string; full_name: string | null; role: string } => !!p);
  const filteredPeople = staffDirectory
    .filter((p) => !allowedUserIds.includes(p.id))
    .filter((p) => (p.full_name ?? "").toLowerCase().includes(personSearch.toLowerCase()));

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    setError(null);
    try {
      const cleanFields = fields.map((f) => ({ label: f.label.trim(), value: f.value.trim(), masked: f.masked })).filter((f) => f.label && f.value);
      const body = {
        type,
        label: label.trim(),
        // Asset-level masked stays a conservative fallback: true if any field is sensitive,
        // so anything reading the old whole-asset flag (e.g. the Customers -> Assets tab)
        // still errs on the side of hiding data rather than exposing a sensitive field.
        masked: cleanFields.some((f) => f.masked),
        allowed_roles: allowedRoles,
        allowed_user_ids: allowedUserIds,
        ...(type === "link" ? { value: value.trim() } : {}),
        ...(type === "credential" ? { fields: cleanFields } : {}),
        phase_number: 1,
        project_id: projectId,
      };
      const res = await fetch(`/api/customers/${customerId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to create asset");
      }
      const created: AssetRow = await res.json();
      onCreated(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create asset");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div className={cn(cardCls, "w-full max-w-md shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto")} onClick={(e) => e.stopPropagation()}>
        <div className={cn("flex items-center justify-between gap-3 px-5 py-3.5 border-b", isDark ? "border-white/[0.08]" : "border-slate-100")}>
          <h2 className={cn("text-[14px] font-semibold", textPrimary)}>Add credential / link</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={cn("p-1 rounded-md cursor-pointer border-none bg-transparent hover:bg-slate-500/10 transition-colors", textMuted)}>
            <X size={16} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className={fieldLabelCls}>Type</label>
            <select
              value={type}
              onChange={(e) => {
                const t = e.target.value as "link" | "credential";
                setType(t);
                setValue("");
                setFields([{ label: "", value: "", masked: true }]);
              }}
              className={fieldInputCls}
            >
              <option value="link">Link</option>
              <option value="credential">Credential</option>
            </select>
          </div>
          <div>
            <label className={fieldLabelCls}>Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={type === "credential" ? "e.g. DNS Access (LastPass)" : "e.g. Staging URL"}
              className={fieldInputCls}
            />
          </div>
          {type === "link" && (
            <div>
              <label className={fieldLabelCls}>Value</label>
              <input type="url" value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://" className={fieldInputCls} />
              {value.trim().length > 0 && !isValidUrl(value.trim()) && (
                <p className="text-[11px] text-red-500 mt-1">Must start with http:// or https://</p>
              )}
            </div>
          )}
          {type === "credential" && (
            <div>
              <label className={fieldLabelCls}>Fields</label>
              <div className="flex flex-col gap-2">
                {fields.map((field, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => setFields((prev) => prev.map((f, j) => (j === i ? { ...f, label: e.target.value } : f)))}
                      placeholder="e.g. Username"
                      className={fieldInputCls}
                    />
                    <input
                      type="text"
                      value={field.value}
                      onChange={(e) => setFields((prev) => prev.map((f, j) => (j === i ? { ...f, value: e.target.value } : f)))}
                      placeholder="Value"
                      className={fieldInputCls}
                    />
                    <div className="flex items-center gap-1 shrink-0" title="Sensitive">
                      <Switch checked={field.masked} onChange={(v) => setFields((prev) => prev.map((f, j) => (j === i ? { ...f, masked: v } : f)))} label={`Sensitive — ${field.label || "field"}`} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setFields((prev) => prev.filter((_, j) => j !== i))}
                      aria-label="Remove field"
                      className={cn("w-8 h-8 shrink-0 rounded-lg border cursor-pointer bg-transparent leading-none", isDark ? "border-white/[0.1] text-slate-400 hover:text-red-400" : "border-slate-200 text-slate-400 hover:text-red-500")}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <p className={cn("text-[10.5px] mt-1.5", textMuted)}>Toggle Sensitive per field to mask it in the list — not the whole credential.</p>
              <button
                type="button"
                onClick={() => setFields((prev) => [...prev, { label: "", value: "", masked: true }])}
                className="mt-2 text-[12px] font-semibold text-brand bg-transparent border-none cursor-pointer p-0"
              >
                + Add Field
              </button>
            </div>
          )}
          <div>
            <label className={fieldLabelCls}>Visible To</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setAllowedRoles([])}
                className={cn(
                  "px-3 py-1.5 rounded-full text-[12px] font-medium border cursor-pointer transition-colors",
                  allowedRoles.length === 0 ? "bg-brand text-white border-brand" : "bg-transparent text-slate-500 border-slate-200 hover:border-slate-300"
                )}
              >
                All
              </button>
              {ASSET_ROLE_OPTIONS.map((role) => {
                const active = allowedRoles.includes(role.value);
                return (
                  <button
                    key={role.value}
                    type="button"
                    onClick={() => setAllowedRoles((prev) => (active ? prev.filter((r) => r !== role.value) : [...prev, role.value]))}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-[12px] font-medium border cursor-pointer transition-colors",
                      active ? "bg-brand text-white border-brand" : "bg-transparent text-slate-500 border-slate-200 hover:border-slate-300"
                    )}
                  >
                    {role.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className={fieldLabelCls}>Share with specific people</label>
            {selectedPeople.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {selectedPeople.map((person) => (
                  <span
                    key={person.id}
                    className={cn("inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[12px] font-medium", isDark ? "bg-brand/20 text-brand" : "bg-brand/10 text-brand")}
                  >
                    {person.full_name ?? "Unnamed"}
                    <button
                      type="button"
                      onClick={() => setAllowedUserIds((prev) => prev.filter((id) => id !== person.id))}
                      aria-label={`Remove ${person.full_name ?? "person"}`}
                      className="p-0.5 rounded-full cursor-pointer border-none bg-transparent text-brand hover:bg-brand/20 transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <input
                type="text"
                value={personSearch}
                onChange={(e) => { setPersonSearch(e.target.value); setPersonDropdownOpen(true); }}
                onFocus={() => setPersonDropdownOpen(true)}
                onBlur={() => setTimeout(() => setPersonDropdownOpen(false), 150)}
                placeholder="Search people…"
                className={fieldInputCls}
              />
              {personDropdownOpen && (
                <div className={cn("absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-[9px] border-[1.5px] shadow-lg", isDark ? "bg-[#1a2032] border-white/[0.12]" : "bg-white border-slate-200")}>
                  {filteredPeople.length === 0 ? (
                    <div className={cn("px-3 py-2 text-[12.5px]", textMuted)}>{staffDirectory.length === 0 ? "No staff directory entries found." : "No matches."}</div>
                  ) : (
                    filteredPeople.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setAllowedUserIds((prev) => [...prev, person.id]); setPersonSearch(""); }}
                        className={cn("w-full text-left px-3 py-2 text-[12.5px] cursor-pointer border-none bg-transparent transition-colors", isDark ? "text-slate-200 hover:bg-white/[0.06]" : "text-slate-700 hover:bg-slate-50")}
                      >
                        {person.full_name ?? "Unnamed"}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          {error && <p className="text-[12px] text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className={cn("flex items-center justify-end gap-2 px-5 py-4 border-t", isDark ? "border-white/[0.08]" : "border-slate-100 bg-slate-50")}>
          <button
            type="button"
            onClick={onClose}
            className={cn("px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer border-none bg-transparent", isDark ? "text-slate-300 hover:bg-white/[0.06]" : "text-slate-600 hover:bg-slate-100")}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !isValid}
            className="px-4 py-2 rounded-lg bg-brand text-white text-[13px] font-semibold cursor-pointer border-none hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {saving ? "Adding…" : "Add Asset"}
          </button>
        </div>
      </div>
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

  if (mime === "text/markdown") {
    // Rendered as actual formatted Markdown (headings, lists, code blocks, etc.), not literal
    // source text — a much more useful preview than the raw-text treatment text/plain gets.
    return <MarkdownFilePreview url={url} />;
  }

  if (mime === "text/plain") {
    // Plain text is supposed to show as literal text, so the server's Content-Type (also
    // text/plain here) doesn't need the srcDoc workaround used for text/html above.
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

// Fetches the Markdown file's raw text and renders it as actual formatted HTML via
// markdownToHtmlDocument — a much nicer preview than raw source text.
function MarkdownFilePreview({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch Markdown content");
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setHtml(markdownToHtmlDocument(text));
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load Markdown preview.");
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
  return <iframe srcDoc={html} sandbox="" title="Markdown preview" className="w-full h-full border-0 bg-white" />;
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

// HTML Mockup's own file list — not bare FileUploadBox, since it adds an "Edit" action
// (text/html and text/markdown only) next to the existing View/Remove ones.
function HtmlMockupFileList({
  files, uploading, onFile, onRemove, onView, onEdit, viewingId, isDark,
}: {
  files: AssetRow[]; uploading: boolean; onFile: (file: File) => void; onRemove: (id: string) => void;
  onView: (id: string) => void; onEdit: (asset: AssetRow) => void; viewingId: string | null; isDark: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";
  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";
  return (
    <div className="mt-1">
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
        <div className={cn("text-[11.5px]", textMuted)}>{uploading ? "Uploading…" : <>Click to <span className="text-brand font-medium">upload the mockup</span></>}</div>
      </button>
      {files.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {files.map((f) => (
            <div key={f.id} className={cn("flex items-center gap-2 px-2.5 py-2 rounded-lg", isDark ? "bg-white/[0.03]" : "bg-slate-50")}>
              <div className="w-6 h-6 rounded-md bg-brand/10 flex items-center justify-center shrink-0">
                <FileText size={11} className="text-brand" />
              </div>
              <div className={cn("text-[11.5px] font-medium truncate flex-1", textPrimary)}>{f.file_name}</div>
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
              {(f.file_mime_type === "text/html" || f.file_mime_type === "text/markdown") && (
                <button
                  type="button"
                  onClick={() => onEdit(f)}
                  aria-label={`Edit ${f.file_name}`}
                  title="Edit"
                  className="shrink-0 p-1 rounded-md cursor-pointer border-none bg-transparent text-brand hover:bg-brand/10 transition-colors"
                >
                  <Pencil size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemove(f.id)}
                aria-label={`Remove ${f.file_name}`}
                title="Remove"
                className="shrink-0 p-1 rounded-md cursor-pointer border-none bg-transparent text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Split-view editor/preview modal for text/html mockups — the editor pane is
// CodeMirror (dynamic-imported, ssr:false); the preview pane renders the editor's
// current in-memory value via srcDoc, debounced, no signed-URL fetch needed.
function HtmlEditorModal({
  file, initialHtml, loadError, isDark, customerId, onClose, onSaved,
}: {
  file: AssetRow; initialHtml: string | null; loadError: string | null; isDark: boolean; customerId: string;
  onClose: () => void; onSaved: (assetId: string, newSize: number) => void;
}) {
  const loaded = initialHtml !== null;
  const isMarkdown = file.file_mime_type === "text/markdown";
  const [value, setValue] = useState(initialHtml ?? "");
  const [previewValue, setPreviewValue] = useState(initialHtml ?? "");
  // Bumped every time previewValue changes and used as the iframe's `key` below — forces React
  // to fully unmount/recreate the <iframe> DOM node (a fresh sandboxed browsing context) on every
  // update instead of updating `srcdoc` on an existing element. Needed because sandboxed srcdoc
  // iframes were observed to render correctly only on their first creation in a tab session and
  // silently fail to re-initialize their content on later re-renders of the same node.
  const [previewRevision, setPreviewRevision] = useState(0);
  const [previewSize, setPreviewSize] = useState<PreviewSizeKey>("full");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const seededRef = useRef(false);
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scale-to-fit: measures the actual preview pane size so the iframe can be rendered at its
  // real design width (e.g. 1280px for Desktop) and visually scaled down to fit the pane —
  // "zoomed out", no horizontal scrollbar — rather than either clipping at 1:1 or forcing the
  // page into a narrower responsive layout it wasn't designed to collapse into at pane width.
  const previewPaneRef = useRef<HTMLDivElement>(null);
  const [paneSize, setPaneSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = previewPaneRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setPaneSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const previewVirtualWidth = PREVIEW_SIZES.find((s) => s.key === previewSize)?.width ?? 1280;
  const previewScale = paneSize.width > 0 ? Math.min(1, paneSize.width / previewVirtualWidth) : 1;
  const previewVirtualHeight = paneSize.height > 0 && previewScale > 0 ? paneSize.height / previewScale : paneSize.height;
  const previewVisualWidth = previewVirtualWidth * previewScale;
  const previewLeftOffset = Math.max(0, (paneSize.width - previewVisualWidth) / 2);
  // Markdown has no visual rendering of its own — convert to a styled HTML document for the
  // live preview, same treatment the read-only MarkdownFilePreview viewer already gets.
  const previewDocument = isMarkdown ? markdownToHtmlDocument(previewValue) : previewValue;

  useEffect(() => {
    if (initialHtml !== null && !seededRef.current) {
      seededRef.current = true;
      setValue(initialHtml);
      setPreviewValue(initialHtml);
      setPreviewRevision((r) => r + 1);
    }
  }, [initialHtml]);

  useEffect(() => {
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    previewDebounceRef.current = setTimeout(() => {
      setPreviewValue(value);
      setPreviewRevision((r) => r + 1);
    }, 300);
    return () => { if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current); };
  }, [value]);

  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";
  const cardCls = isDark ? "bg-[#121726] border border-white/[0.08] rounded-xl" : "bg-white border border-slate-200 rounded-xl";

  const handleSave = async () => {
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const res = await fetch(`/api/customers/${customerId}/assets/${file.id}/content`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: value }),
      });
      if (!res.ok) throw new Error();
      const updated: AssetRow = await res.json();
      setSaveStatus("saved");
      setSavedAt(new Date());
      onSaved(file.id, updated.file_size ?? new TextEncoder().encode(value).length);
    } catch {
      setSaveStatus("error");
      setSaveError("Failed to save changes");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div className={cn(cardCls, "w-[96vw] h-[94vh] shadow-xl overflow-hidden flex flex-col")} onClick={(e) => e.stopPropagation()}>
        <div className={cn("flex items-center justify-between gap-3 px-5 py-3 border-b shrink-0", isDark ? "border-white/[0.08]" : "border-slate-100")}>
          <div className="flex items-center gap-2 min-w-0">
            <Pencil size={14} className="text-brand shrink-0" />
            <h2 className={cn("text-[13.5px] font-semibold truncate", textPrimary)}>{file.file_name}</h2>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <SaveIndicator status={saveStatus} lastSavedAt={savedAt} error={saveError} />
            <button
              type="button"
              onClick={handleSave}
              disabled={!loaded || saveStatus === "saving"}
              className="px-3 py-1.5 rounded-lg bg-brand text-white text-[12.5px] font-semibold cursor-pointer border-none hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close editor"
              className={cn("p-1 rounded-md cursor-pointer border-none bg-transparent hover:bg-slate-500/10 transition-colors", textMuted)}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        {/* flex (not grid) for the split — grid's default 1fr columns can grow past 50% to
            fit a long unwrapped code line's min-content width; flex-1 + min-w-0 on both
            panes guarantees an even, content-independent split, same flex-1/min-h-0 idiom
            already used for the outer scroll area above. */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <div className={cn("flex-1 min-w-0 min-h-0 overflow-auto border-b lg:border-b-0 lg:border-r", isDark ? "border-white/[0.08]" : "border-slate-200")}>
            {!loaded && !loadError && (
              <div className="h-full flex items-center justify-center"><span className={cn("text-[12.5px]", textMuted)}>Loading…</span></div>
            )}
            {loadError && (
              <div className="h-full flex items-center justify-center px-6 text-center"><span className="text-[12.5px] text-red-500">{loadError}</span></div>
            )}
            {loaded && (
              <CodeMirror
                value={value}
                height="100%"
                theme={isDark ? githubDark : githubLight}
                extensions={[isMarkdown ? markdownLang() : htmlLang()]}
                onChange={(v: string) => setValue(v)}
              />
            )}
          </div>
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <div className={cn("flex items-center gap-0.5 px-2 py-1.5 border-b shrink-0", isDark ? "border-white/[0.08] bg-white/[0.02]" : "border-slate-100 bg-slate-50/50")}>
              {PREVIEW_SIZES.map((s) => {
                const Icon = s.icon;
                const active = previewSize === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    title={s.label}
                    onClick={() => setPreviewSize(s.key)}
                    className={cn(
                      "text-[11px] px-2 h-7 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors border-none",
                      active ? "bg-brand/15 text-brand" : isDark ? "text-slate-400 hover:bg-white/[0.06]" : "text-slate-500 hover:bg-slate-100"
                    )}
                  >
                    <Icon size={13} /> {s.label}
                  </button>
                );
              })}
            </div>
            <div ref={previewPaneRef} className={cn("flex-1 min-h-0 overflow-hidden relative", isDark ? "bg-black/20" : "bg-slate-100")}>
              {loaded && paneSize.width > 0 && (
                <iframe
                  key={previewRevision}
                  srcDoc={previewDocument}
                  sandbox=""
                  title="Live preview"
                  className="block border-0 bg-white absolute top-0"
                  style={{
                    left: previewLeftOffset,
                    width: previewVirtualWidth,
                    height: previewVirtualHeight,
                    transform: `scale(${previewScale})`,
                    transformOrigin: "top left",
                  }}
                />
              )}
            </div>
          </div>
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

// Phase 1's animated closing transition, shown between clicking "Complete Phase 1 & notify
// PM" and the real request resolving. Declarative stagger via framer-motion — no internal
// timer to race against the fetch; each item plays once and holds its final (checked) state,
// and the "Finishing up…" line simply stays visible for as long as the parent keeps this
// component mounted (i.e. until the real request settles), never looping or disappearing.
function PhaseCompletionTransition({ isDark }: { isDark: boolean }) {
  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";
  const cardCls = isDark ? "bg-[#121726] border border-white/[0.08] rounded-xl" : "bg-white border border-slate-200 rounded-xl";
  const finishingDelay = PHASE1_COMPLETION_CRITERIA.length * PHASE1_TRANSITION_STAGGER + 0.35;

  return (
    <div className={cn(cardCls, "max-w-lg mx-auto p-8 mt-8")}>
      <div className="text-center mb-6">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="w-14 h-14 rounded-full bg-brand/10 flex items-center justify-center mx-auto mb-4"
        >
          <Sparkles size={24} className="text-brand" />
        </motion.div>
        <div className={cn("text-lg font-bold mb-1", textPrimary)}>Wrapping up Phase 1…</div>
        <p className={cn("text-[13px]", textMuted)}>Preparing the project view and handing over to the PM.</p>
      </div>
      <div className="flex flex-col gap-2.5">
        {PHASE1_COMPLETION_CRITERIA.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * PHASE1_TRANSITION_STAGGER, duration: 0.3 }}
            className={cn("flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border", isDark ? "border-white/[0.08] bg-white/[0.02]" : "border-slate-100 bg-slate-50/50")}
          >
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * PHASE1_TRANSITION_STAGGER + 0.15, duration: 0.25 }}
              className="shrink-0 mt-0.5"
            >
              <CheckCircle2 size={16} className="text-green-500" />
            </motion.div>
            <div>
              <div className={cn("text-[13px] font-medium", textPrimary)}>{item.label}</div>
              <div className={cn("text-[11.5px]", textMuted)}>{item.detail}</div>
            </div>
          </motion.div>
        ))}
      </div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: finishingDelay, duration: 0.4 }}
        className={cn("text-center text-[12px] mt-5", textMuted)}
      >
        Finishing up…
      </motion.p>
    </div>
  );
}
