"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Clock, Upload,
  FileText, Plus, Trash2, Sparkles, AlertTriangle, ListChecks, X, Eye, Pencil,
  Monitor, Tablet, Smartphone, Folder, Lock, Grid3x3, LayoutList,
  MoreVertical, FolderPlus, FolderInput, Share2, ChevronRight, Loader2,
  Users, Crown, ArrowRightLeft,
} from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { html as htmlLang } from "@codemirror/lang-html";
import { markdown as markdownLang } from "@codemirror/lang-markdown";
import { githubLight, githubDark } from "@uiw/codemirror-theme-github";
import { marked } from "marked";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { stepKeyToWizardParams } from "./_wizard-step-params";

// CodeMirror uses browser-only APIs — dynamic-imported with ssr:false, same isolation
// pattern this codebase already uses for recharts.
const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });
import { getPhaseByNumber, internalDeliverablesForSubPhase } from "@/config/customer-phases";
import type { InternalDeliverableConfig } from "@/config/customer-phases";
import type { CustomerDeliverableRow, OnboardingInternalDeliverableRow, Database } from "@/types/database";
import type { SaveStatus } from "@/types/onboarding";
import SaveIndicator from "@/components/onboarding/save-indicator";

type AssetRow = Database["public"]["Tables"]["customer_assets"]["Row"];
type AssetFolder = Database["public"]["Tables"]["customer_asset_folders"]["Row"];

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

// Thin shadcn Tooltip composition for icon-only buttons throughout this file — wraps a single
// child (the actual button/element, which keeps its own aria-label for a11y) via Base UI's
// `render` prop instead of duplicating <Tooltip><TooltipTrigger><TooltipContent> at every call
// site. `side` defaults to "top" but every call site picks whichever side keeps the bubble clear
// of nearby text per the surrounding layout.
function IconTip({ label, side = "top", children }: { label: string; side?: "top" | "bottom" | "left" | "right"; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
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
  project: {
    id: string;
    name: string;
    customer_id: string;
    project_id: string | null;
    company_name: string;
    contact_name: string | null;
    contact_email: string | null;
    primary_contact_phone: string | null;
  };
  deliverables: CustomerDeliverableRow[];
  internalDeliverables: OnboardingInternalDeliverableRow[];
  wizardData: Record<string, unknown>;
  currentDay: number;
  isDark: boolean;
  // Task 146: pm gets read-only steps 1-5/7, full Step 6 file/folder access, no checklist
  // editing anywhere, and no Complete Phase 1 action. Developer never reaches this component.
  role: string | null;
  // Task 160: whether Phase 1 is still the project's DB-active phase. false once Phase 1 has
  // been jumped past (status becomes "skipped"/"completed") — locks every step, including
  // storage-kb (no PM carve-out), for every role. Viewing existing content/files stays available.
  isPhaseActive: boolean;
  initialStepKey?: string;
  onBack: () => void;
  onDeliverableChange: (updated: CustomerDeliverableRow) => void;
  onInternalDeliverableChange: (updated: OnboardingInternalDeliverableRow) => void;
  // Task 156 — Phase 1 access management moved here from the Timeline page (_onboarding-detail
  // .tsx), which still owns the actual phase1Members state/handlers and the Wizard-entry
  // restriction gate; this component only renders the UI and calls the passed-down handlers.
  canManagePhase1: boolean;
  phase1Members: WizardMemberRow[];
  phase1Busy: boolean;
  phase1Error: string | null;
  onAddPhase1Member: (userId: string) => void;
  onRemovePhase1Member: (userId: string) => void;
  onTransferPhaseOwnership: (userId: string) => void;
}

// Mirrors _onboarding-detail.tsx's MemberRow exactly — duplicated locally (not imported) to
// avoid a circular import between the two files (OnboardingDetail imports OnboardingWizard),
// matching this codebase's page-scoped-UI convention of inlining small shared shapes.
type WizardMemberRow = { id: string; user_id: string; is_owner: boolean; full_name: string | null; role: string | null };

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

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// `finishing` covers the gap XHR's `upload.onprogress` can't see: it only tracks bytes
// leaving the browser, so it hits 100 as soon as the request body is fully sent — before the
// server has processed/stored the file and before the second (asset-record) request even
// starts. Without a distinct state here, the bar sits at "100%" doing nothing for that whole
// window, which reads as broken/frozen instead of still working.
type UploadProgressEntry = { id: string; name: string; progress: number; finishing?: boolean };
type UploadedAsset = { path: string; filename: string; size: number; mimeType: string };

// XMLHttpRequest (not fetch) is required here specifically because it's the only browser API
// that exposes real upload byte-progress (`upload.onprogress`) — used by every `handle*Upload`
// step handler below to drive a live per-file progress bar.
function uploadFileWithProgress(url: string, formData: FormData, onProgress: (pct: number) => void): Promise<UploadedAsset> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Failed to upload file"));
        }
      } else {
        let message = "Failed to upload file";
        try { message = JSON.parse(xhr.responseText).error ?? message; } catch { /* keep default */ }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("Failed to upload file"));
    xhr.send(formData);
  });
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

// Task 156 — Phase 1 access management, relocated here from the Timeline page's AccessPanel
// (task 153/155) since managing who's on this specific phase belongs inside the phase's own
// workspace. Role-filtered <select> add-pickers (small bounded pools, matching task 155's
// scope decision for Phase 1 — search-to-add stayed project-members-only). Panel container
// mirrors renderPermissionsPanel's existing shape in this file for visual consistency.
function PhaseAccessPanel({
  isDark, members, staffDirectory, busy, error, onAdd, onRemove, onTransferOwnership, onClose,
}: {
  isDark: boolean;
  members: WizardMemberRow[];
  staffDirectory: { id: string; full_name: string | null; role: string }[];
  busy: boolean;
  error: string | null;
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
  onTransferOwnership: (userId: string) => void;
  onClose: () => void;
}) {
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";
  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";
  const memberIds = new Set(members.map((m) => m.user_id));

  const marketingOptions = staffDirectory
    .filter((p) => p.role === "marketing" && !memberIds.has(p.id))
    .map((p) => ({ id: p.id, label: p.full_name ?? "Unnamed" }));
  const pmOptions = staffDirectory
    .filter((p) => p.role === "pm" && !memberIds.has(p.id))
    .map((p) => ({ id: p.id, label: p.full_name ?? "Unnamed" }));

  const renderSelect = (options: { id: string; label: string }[], placeholder: string) => (
    <select
      value=""
      disabled={busy || options.length === 0}
      onChange={(e) => { if (e.target.value) onAdd(e.target.value); e.target.value = ""; }}
      className={cn(
        "rounded-full border border-dashed px-2.5 py-1 text-[11px] disabled:opacity-50",
        isDark ? "bg-transparent border-white/[0.15] text-slate-400" : "bg-white border-slate-300 text-slate-500"
      )}
    >
      <option value="">{options.length === 0 ? "No one available" : placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
  );

  return (
    <div className={cn("flex flex-col gap-2 px-3 py-2.5 rounded-lg mb-3 border", isDark ? "bg-white/[0.02] border-white/[0.06]" : "bg-slate-50 border-slate-100")}>
      <div className="flex items-center justify-between">
        <span className={cn("text-[10px] font-semibold uppercase tracking-wide", textMuted)}>Phase 1 access — owner + assigned Marketing/PM</span>
        <IconTip label="Close">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close access management"
            className={cn("p-2 rounded-md cursor-pointer border-none bg-transparent transition-colors", textMuted, isDark ? "hover:bg-white/[0.08]" : "hover:bg-slate-200")}
          >
            <X size={12} />
          </button>
        </IconTip>
      </div>
      {error && <p className="text-[11px] text-red-500">{error}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {members.length === 0 && <span className={cn("text-[11.5px]", textMuted)}>No members yet — open to any Marketing/PM.</span>}
        {members.map((m) => (
          <div key={m.user_id} className={cn("inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2 text-[11.5px]", isDark ? "border-white/[0.1] bg-white/[0.03]" : "border-slate-200 bg-white")}>
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/10 text-[9px] font-bold text-brand">
              {(m.full_name ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <span className={cn("font-medium", textPrimary)}>{m.full_name ?? "Unnamed"}</span>
            <span className={textMuted}>{m.role ?? ""}</span>
            {m.is_owner && <Crown size={11} className="text-amber-500" aria-label="Owner" />}
            {!m.is_owner && (m.role === "marketing" || m.role === "admin" || m.role === "super_admin") && (
              <IconTip label="Transfer ownership to this person">
                <button
                  type="button"
                  onClick={() => onTransferOwnership(m.user_id)}
                  disabled={busy}
                  aria-label="Transfer ownership to this person"
                  className={cn("cursor-pointer rounded-full border-none bg-transparent p-2 transition-colors disabled:opacity-50", textMuted, "hover:text-brand")}
                >
                  <ArrowRightLeft size={11} />
                </button>
              </IconTip>
            )}
            {!m.is_owner && (
              <IconTip label="Remove">
                <button
                  type="button"
                  onClick={() => onRemove(m.user_id)}
                  disabled={busy}
                  aria-label={`Remove ${m.full_name ?? "person"}`}
                  className={cn("cursor-pointer rounded-full border-none bg-transparent p-2 transition-colors disabled:opacity-50", textMuted, "hover:text-red-500")}
                >
                  <X size={11} />
                </button>
              </IconTip>
            )}
          </div>
        ))}
        {renderSelect(marketingOptions, "+ Add marketing agent")}
        {renderSelect(pmOptions, "+ Add PM")}
      </div>
      <p className={cn("flex items-center gap-1 text-[10.5px]", textMuted)}>
        Adding a PM unlocks Step 6 (Storage folder + KB) for them, and adds them as a project
        member (visible on the Onboarding list) automatically.
      </p>
    </div>
  );
}

export default function OnboardingWizard({
  project, deliverables, internalDeliverables, wizardData, currentDay, isDark, role, isPhaseActive, initialStepKey,
  onBack, onDeliverableChange, onInternalDeliverableChange,
  canManagePhase1, phase1Members, phase1Busy, phase1Error,
  onAddPhase1Member, onRemovePhase1Member, onTransferPhaseOwnership,
}: OnboardingWizardProps) {
  const router = useRouter();
  const [phase1AccessOpen, setPhase1AccessOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(() => {
    const idx = STEPS.findIndex((s) => s.key === initialStepKey);
    return idx >= 0 ? idx : 0;
  });
  // Task 150(c): keeps the ?phase=&deliverable= query params in sync with every step transition
  // (Continue, Back-within-wizard, Steps-indicator jump) without threading router.push through
  // each of those call sites individually. Ref starts at the step already reflected by the URL
  // on mount (either the server-rendered searchParams, or the plain project URL the parent
  // pushed to just before opening the wizard) so mount itself never fires a redundant push.
  const lastPushedStepKeyRef = useRef(STEPS[stepIdx].key);
  useEffect(() => {
    const key = STEPS[stepIdx].key;
    if (lastPushedStepKeyRef.current === key) return;
    lastPushedStepKeyRef.current = key;
    const stepParams = stepKeyToWizardParams(key);
    if (!stepParams) return;
    const projectUrlKey = project.project_id ?? project.id;
    router.push(`${V2_ROUTES.PORTFOLIO_TRACKER}/${projectUrlKey}?phase=${stepParams.phase}&deliverable=${stepParams.deliverable}`, { scroll: false });
  }, [stepIdx, project.project_id, project.id, router]);
  const [done, setDone] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [showTransition, setShowTransition] = useState(false);

  const kickoffData = (wizardData.kickoff as Record<string, unknown>) ?? {};
  const outcomeTargetData = (wizardData["outcome-target"] as Record<string, unknown>) ?? {};
  const migrationChecklistData = (wizardData["migration-checklist"] as Record<string, unknown>) ?? {};
  const contentMapData = (wizardData["content-map"] as Record<string, unknown>) ?? {};
  const clientSignoffData = (wizardData["client-signoff"] as Record<string, unknown>) ?? {};

  const initialContacts = (kickoffData.contacts as ContactEntry[] | undefined) ?? [];
  const defaultContacts: ContactEntry[] =
    initialContacts.length > 0
      ? initialContacts
      : [{
          fullName: project.contact_name ?? "",
          position: "",
          email: project.contact_email ?? "",
          phone: project.primary_contact_phone ?? "",
          socialMedia: "",
        }];
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
  const [businessFactsUploadError, setBusinessFactsUploadError] = useState<string | null>(null);
  const [businessFactsUploadProgress, setBusinessFactsUploadProgress] = useState<UploadProgressEntry[]>([]);
  const [viewingBusinessFactsFileId, setViewingBusinessFactsFileId] = useState<string | null>(null);

  const [checklistValidationError, setChecklistValidationError] = useState<string | null>(null);
  const [contactsFieldError, setContactsFieldError] = useState(false);
  const [businessFactsFieldError, setBusinessFactsFieldError] = useState(false);
  const [outcomeFieldError, setOutcomeFieldError] = useState(false);

  const [incompleteItems, setIncompleteItems] = useState<InternalDeliverableConfig[]>([]);
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [showForceConfirmModal, setShowForceConfirmModal] = useState(false);
  // Whether finalizeMarkAllDone should advance stepIdx/complete the phase after marking items
  // done — true for the Continue/Complete gate's own "mark all as done" (unchanged behavior),
  // false when opened from the per-step checklist's inline "Mark All as Done" button, which
  // should only check items off and leave the user on the current step (task 161).
  const [markAllAdvance, setMarkAllAdvance] = useState(true);
  // Message for the Steps-indicator's own gate — set when a forward click to an unreached step
  // is blocked because the current step isn't done/overdue yet; null hides the alert.
  const [stepGateAlert, setStepGateAlert] = useState<string | null>(null);

  // Escape dismisses whichever of the three custom modals below is currently open.
  useEffect(() => {
    if (!showIncompleteModal && !showForceConfirmModal && !stepGateAlert) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setShowIncompleteModal(false);
      setShowForceConfirmModal(false);
      setStepGateAlert(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showIncompleteModal, showForceConfirmModal, stepGateAlert]);

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

  // documentsNote (free-text "Documents (branding / proposals / collateral)" note) removed
  // (task 141) — superseded by real Branding/Proposals/Collateral sub-folders under
  // "Business Files" in the File Explorer below. dnsAccess/credentialsNote textareas were
  // already removed earlier (task 140 follow-up) — superseded by the structured
  // "Credentials & links" list.

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
  // Folder tree (task 141) — fetched (and, on first load, provisioned + backfilled
  // server-side) before phase1Assets, so assets already carry a real folder_id by the
  // time they're rendered.
  const [phase1Folders, setPhase1Folders] = useState<AssetFolder[]>([]);
  const [phase1FoldersError, setPhase1FoldersError] = useState<string | null>(null);
  const [phase1Loading, setPhase1Loading] = useState(true);
  const [movingAssetId, setMovingAssetId] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  // Folder permissions/rename/delete + file rename (task 144).
  const [folderPermissionsUpdatingId, setFolderPermissionsUpdatingId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [renamingAssetId, setRenamingAssetId] = useState<string | null>(null);
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
  const [outcomeUploadError, setOutcomeUploadError] = useState<string | null>(null);
  const [outcomeUploadProgress, setOutcomeUploadProgress] = useState<UploadProgressEntry[]>([]);
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
  const [migrationChecklistUploadError, setMigrationChecklistUploadError] = useState<string | null>(null);
  const [migrationChecklistUploadProgress, setMigrationChecklistUploadProgress] = useState<UploadProgressEntry[]>([]);
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
  const [contentMapUploadError, setContentMapUploadError] = useState<string | null>(null);
  const [contentMapUploadProgress, setContentMapUploadProgress] = useState<UploadProgressEntry[]>([]);
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
  const [htmlMockupUploadError, setHtmlMockupUploadError] = useState<string | null>(null);
  const [htmlMockupUploadProgress, setHtmlMockupUploadProgress] = useState<UploadProgressEntry[]>([]);
  const [viewingHtmlMockupFileId, setViewingHtmlMockupFileId] = useState<string | null>(null);
  const isHtmlMockupFilled = htmlMockupFiles.length > 0;
  const [editingHtmlAsset, setEditingHtmlAsset] = useState<AssetRow | null>(null);
  const [editingHtmlContent, setEditingHtmlContent] = useState<string | null>(null);
  const [editingHtmlLoadError, setEditingHtmlLoadError] = useState<string | null>(null);

  const [signoffNotes, setSignoffNotes] = useState((clientSignoffData.signoffNotes as string) ?? "");
  const [signoffFiles, setSignoffFiles] = useState<AssetRow[]>([]);
  const [signoffUploadError, setSignoffUploadError] = useState<string | null>(null);
  const [signoffUploadProgress, setSignoffUploadProgress] = useState<UploadProgressEntry[]>([]);
  const [viewingSignoffFileId, setViewingSignoffFileId] = useState<string | null>(null);
  // Gates the "signoff-agreement-filed" checklist item only (handleValidatedInternalToggle) —
  // not the Complete Phase 1 button itself, which is gated on the checklist being marked done,
  // not on this field directly (task 135 follow-up).
  const isSignoffFilled = stripHtml(signoffNotes).length > 0 || signoffFiles.length > 0;

  const [signoffSaveStatus, setSignoffSaveStatus] = useState<SaveStatus>("idle");
  const [signoffLastSavedAt, setSignoffLastSavedAt] = useState<Date | null>(null);
  const [signoffSaveError, setSignoffSaveError] = useState<string | null>(null);
  const lastSignoffSavedRef = useRef<string>(
    JSON.stringify({ signoffNotes: (clientSignoffData.signoffNotes as string) ?? "" })
  );

  const [localDeliverables, setLocalDeliverables] = useState(deliverables);
  const [localInternal, setLocalInternal] = useState(internalDeliverables);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const kickoffSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outcomeSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outcomeProgressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const migrationChecklistSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentMapSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signoffSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Moved up from just above the render return (still used there) so the auto-progress
  // effect below — and any other hook — can reference `step` safely, without depending on
  // a value computed after the early `if (done) return`.
  const step = STEPS[stepIdx];
  const stepRow = localDeliverables.find((r) => r.deliverable_key === step.key);
  const stepStatus = stepRow?.status ?? "pending";
  const stepInternal = internalDeliverablesForSubPhase(step.key);
  const isLastStep = stepIdx === STEPS.length - 1;

  // checklistValidationError renders unconditionally under whichever step's checklist is
  // currently on screen — without this it kept showing a previous step's validation message
  // (e.g. Outcome target's) after navigating away to a different, unrelated step.
  useEffect(() => {
    setChecklistValidationError(null);
  }, [stepIdx]);

  // Task 146: pm gets read-only fields on every step except storage-kb (Step 6, where file/
  // folder management stays live), and can never edit any checklist item (including Step 6's
  // own) or complete Phase 1 — that stays marketing/admin/super_admin-only.
  // Task 160: the PM storage-kb carve-out only applies while Phase 1 is still the DB's active
  // phase — once jumped past, every step (including storage-kb) is read-only for every role.
  const isPM = role === "pm";
  const isStepReadOnly = (isPM && step.key !== "storage-kb") || !isPhaseActive;
  const canEditChecklist = !isPM && isPhaseActive;

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

  // Fetch the folder tree, then Phase 1 assets, for the Storage/KB File Explorer — small
  // dataset, fetched once on mount rather than gated to only when the storage-kb step is
  // active, since switching steps shouldn't show a loading flash for what's normally a
  // handful of files. Folders are fetched first: that call idempotently provisions the
  // system folders and backfills any asset missing a folder_id (task 141), so the
  // subsequent assets fetch already returns fully-filed rows.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const foldersRes = await fetch(
          `/api/customers/${project.customer_id}/assets/folders?projectId=${project.id}&phaseNumber=1`
        );
        if (!foldersRes.ok) throw new Error("Failed to fetch folders");
        const folders: AssetFolder[] = await foldersRes.json();
        if (cancelled) return;
        setPhase1Folders(folders);
      } catch {
        if (!cancelled) setPhase1FoldersError("Failed to load folders.");
      }

      try {
        const assetsRes = await fetch(`/api/customers/${project.customer_id}/assets`);
        if (!assetsRes.ok) throw new Error("Failed to fetch assets");
        const data: AssetRow[] = await assetsRes.json();
        if (cancelled) return;
        setPhase1Assets(data.filter((a) => a.phase_number === 1 && a.project_id === project.id));
      } catch {
        if (!cancelled) setPhase1AssetsError("Failed to load project files.");
      }

      if (!cancelled) setPhase1Loading(false);
    })();
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

  // Debounced autosave — Client sign-off field. Same skip-if-unchanged + save-status
  // pattern as the Content map effect above.
  useEffect(() => {
    const payload = { signoffNotes };
    const payloadJson = JSON.stringify(payload);
    if (payloadJson === lastSignoffSavedRef.current) return;

    if (signoffSaveRef.current) clearTimeout(signoffSaveRef.current);
    signoffSaveRef.current = setTimeout(() => {
      setSignoffSaveStatus("saving");
      fetch(`/api/projects/${project.id}/programme/wizard-data`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subPhaseKey: "client-signoff", data: payload }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to save");
          lastSignoffSavedRef.current = payloadJson;
          setSignoffSaveStatus("saved");
          setSignoffLastSavedAt(new Date());
        })
        .catch(() => {
          setSignoffSaveStatus("error");
          setSignoffSaveError("Failed to save changes");
        });
    }, 2000);
    return () => { if (signoffSaveRef.current) clearTimeout(signoffSaveRef.current); };
  }, [project.id, signoffNotes]);

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
      // Match by deliverable_key, not id: the PATCH route now upserts (task 135 follow-up), so
      // a project whose row didn't exist yet gets one created on first toggle with a brand-new
      // id that was never in localInternal — an id-keyed .map would silently no-op (0 matches),
      // leaving the checklist item stuck showing "pending" until a full page reload re-fetched
      // internalDeliverables from the server. deliverable_key is stable and unique per project
      // regardless of whether the row pre-existed.
      setLocalInternal((prev) => {
        const exists = prev.some((d) => d.deliverable_key === internalDeliverable.deliverable_key);
        return exists
          ? prev.map((d) => (d.deliverable_key === internalDeliverable.deliverable_key ? internalDeliverable : d))
          : [...prev, internalDeliverable];
      });
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

  // folderId (task 141): the File Explorer always passes the currently-open folder's id,
  // so a file uploaded from inside a folder lands in that folder directly — replacing the
  // previous hardcoded `label: "Documents"` (which always landed in "Business Files"
  // regardless of which folder was open when "Add file" was clicked).
  const handleUpload = async (file: File, folderId: string | null) => {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("project_id", project.project_id ?? project.id);
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
          folder_id: folderId,
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
    const tempId = crypto.randomUUID();
    setBusinessFactsUploadProgress((prev) => [...prev, { id: tempId, name: file.name, progress: 0 }]);
    setBusinessFactsUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("project_id", project.project_id ?? project.id);
      const uploaded = await uploadFileWithProgress(
        `/api/customers/${project.customer_id}/assets/upload`,
        formData,
        (pct) => setBusinessFactsUploadProgress((prev) => prev.map((p) => (p.id === tempId ? { ...p, progress: pct, finishing: pct >= 100 } : p)))
      );
      setBusinessFactsUploadProgress((prev) => prev.map((p) => (p.id === tempId ? { ...p, finishing: true } : p)));
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
      setBusinessFactsUploadProgress((prev) => prev.filter((p) => p.id !== tempId));
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

  // In-app preview — reuses the shared viewerFile/viewerUrl/viewerLoading/viewerError state,
  // same as handleViewOutcomeFile.
  const handleViewBusinessFactsFile = async (id: string) => {
    const file = businessFactsFiles.find((f) => f.id === id);
    if (!file) return;
    setViewerFile(file);
    setViewerUrl(null);
    setViewerError(null);
    setViewerLoading(true);
    setViewingBusinessFactsFileId(id);
    try {
      const res = await fetch(`/api/customers/${project.customer_id}/assets/${id}/file-url`);
      if (!res.ok) throw new Error("Failed to get file URL");
      const { url } = await res.json();
      setViewerUrl(url);
    } catch {
      setViewerError("Failed to load file preview.");
    } finally {
      setViewerLoading(false);
      setViewingBusinessFactsFileId(null);
    }
  };

  const handleOutcomeFileUpload = async (file: File) => {
    const tempId = crypto.randomUUID();
    setOutcomeUploadProgress((prev) => [...prev, { id: tempId, name: file.name, progress: 0 }]);
    setOutcomeUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("project_id", project.project_id ?? project.id);
      const uploaded = await uploadFileWithProgress(
        `/api/customers/${project.customer_id}/assets/upload`,
        formData,
        (pct) => setOutcomeUploadProgress((prev) => prev.map((p) => (p.id === tempId ? { ...p, progress: pct, finishing: pct >= 100 } : p)))
      );
      setOutcomeUploadProgress((prev) => prev.map((p) => (p.id === tempId ? { ...p, finishing: true } : p)));
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
      setOutcomeUploadProgress((prev) => prev.filter((p) => p.id !== tempId));
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

  // Move a single file to a different folder (task 141) — also the primitive bulk moves
  // loop over, one PATCH per selected asset, since the small dataset here doesn't warrant
  // a dedicated bulk endpoint.
  const handleMoveAsset = async (assetId: string, folderId: string | null) => {
    setMovingAssetId(assetId);
    try {
      const res = await fetch(`/api/customers/${project.customer_id}/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: folderId }),
      });
      if (!res.ok) throw new Error();
      const updated: AssetRow = await res.json();
      setPhase1Assets((prev) => prev.map((a) => (a.id === assetId ? updated : a)));
    } catch {
      setPhase1AssetsError("Failed to move file.");
    } finally {
      setMovingAssetId(null);
    }
  };

  // Create a folder at root (parentFolderId: null) or nested inside any existing folder
  // (task 141) — the new folders route provisions/backfills lazily, so this is purely
  // additive against whatever's already in phase1Folders.
  const handleCreateFolder = async (name: string, parentFolderId: string | null): Promise<AssetFolder | null> => {
    setCreatingFolder(true);
    setPhase1FoldersError(null);
    try {
      const res = await fetch(`/api/customers/${project.customer_id}/assets/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, phaseNumber: 1, name, parent_folder_id: parentFolderId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to create folder");
      }
      const created: AssetFolder = await res.json();
      setPhase1Folders((prev) => [...prev, created]);
      return created;
    } catch (err) {
      setPhase1FoldersError(err instanceof Error ? err.message : "Failed to create folder");
      return null;
    } finally {
      setCreatingFolder(false);
    }
  };

  // Folder role/user sharing (task 144) — same shape as handlePermissionsChange, targeting
  // the folders PATCH route instead.
  const handleFolderPermissionsChange = async (
    folderId: string,
    updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }
  ) => {
    setFolderPermissionsUpdatingId(folderId);
    try {
      const res = await fetch(`/api/customers/${project.customer_id}/assets/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error();
      const updated: AssetFolder = await res.json();
      setPhase1Folders((prev) => prev.map((f) => (f.id === folderId ? updated : f)));
    } catch {
      setPhase1FoldersError("Failed to update folder permissions.");
    } finally {
      setFolderPermissionsUpdatingId(null);
    }
  };

  // Rename is allowed on any folder, including system-provisioned ones — cosmetic only,
  // folder membership is folder_id-based since task 141's provisioning backfill (task 144).
  const handleRenameFolder = async (folderId: string, name: string): Promise<boolean> => {
    setRenamingFolderId(folderId);
    try {
      const res = await fetch(`/api/customers/${project.customer_id}/assets/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to rename folder");
      }
      const updated: AssetFolder = await res.json();
      setPhase1Folders((prev) => prev.map((f) => (f.id === folderId ? updated : f)));
      return true;
    } catch (err) {
      setPhase1FoldersError(err instanceof Error ? err.message : "Failed to rename folder");
      return false;
    } finally {
      setRenamingFolderId(null);
    }
  };

  // Delete is blocked server-side on system folders and non-empty folders (task 144) —
  // the UI also disables the button client-side for the same reasons, this is the
  // authoritative check.
  const handleDeleteFolder = async (folderId: string): Promise<boolean> => {
    setDeletingFolderId(folderId);
    try {
      const res = await fetch(`/api/customers/${project.customer_id}/assets/folders/${folderId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to delete folder");
      }
      setPhase1Folders((prev) => prev.filter((f) => f.id !== folderId));
      return true;
    } catch (err) {
      setPhase1FoldersError(err instanceof Error ? err.message : "Failed to delete folder");
      return false;
    } finally {
      setDeletingFolderId(null);
    }
  };

  // File rename (task 144) — display-name only, file_path/Storage object untouched.
  const handleRenameAsset = async (assetId: string, fileName: string): Promise<boolean> => {
    setRenamingAssetId(assetId);
    try {
      const res = await fetch(`/api/customers/${project.customer_id}/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_name: fileName }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to rename file");
      }
      const updated: AssetRow = await res.json();
      setPhase1Assets((prev) => prev.map((a) => (a.id === assetId ? updated : a)));
      return true;
    } catch (err) {
      setPhase1AssetsError(err instanceof Error ? err.message : "Failed to rename file");
      return false;
    } finally {
      setRenamingAssetId(null);
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
    const tempId = crypto.randomUUID();
    setMigrationChecklistUploadProgress((prev) => [...prev, { id: tempId, name: file.name, progress: 0 }]);
    setMigrationChecklistUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("project_id", project.project_id ?? project.id);
      const uploaded = await uploadFileWithProgress(
        `/api/customers/${project.customer_id}/assets/upload`,
        formData,
        (pct) => setMigrationChecklistUploadProgress((prev) => prev.map((p) => (p.id === tempId ? { ...p, progress: pct, finishing: pct >= 100 } : p)))
      );
      setMigrationChecklistUploadProgress((prev) => prev.map((p) => (p.id === tempId ? { ...p, finishing: true } : p)));
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
      setMigrationChecklistUploadProgress((prev) => prev.filter((p) => p.id !== tempId));
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
    const tempId = crypto.randomUUID();
    setContentMapUploadProgress((prev) => [...prev, { id: tempId, name: file.name, progress: 0 }]);
    setContentMapUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("project_id", project.project_id ?? project.id);
      const uploaded = await uploadFileWithProgress(
        `/api/customers/${project.customer_id}/assets/upload`,
        formData,
        (pct) => setContentMapUploadProgress((prev) => prev.map((p) => (p.id === tempId ? { ...p, progress: pct, finishing: pct >= 100 } : p)))
      );
      setContentMapUploadProgress((prev) => prev.map((p) => (p.id === tempId ? { ...p, finishing: true } : p)));
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
      setContentMapUploadProgress((prev) => prev.filter((p) => p.id !== tempId));
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

  const handleSignoffUpload = async (file: File) => {
    const tempId = crypto.randomUUID();
    setSignoffUploadProgress((prev) => [...prev, { id: tempId, name: file.name, progress: 0 }]);
    setSignoffUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("project_id", project.project_id ?? project.id);
      const uploaded = await uploadFileWithProgress(
        `/api/customers/${project.customer_id}/assets/upload`,
        formData,
        (pct) => setSignoffUploadProgress((prev) => prev.map((p) => (p.id === tempId ? { ...p, progress: pct, finishing: pct >= 100 } : p)))
      );
      setSignoffUploadProgress((prev) => prev.map((p) => (p.id === tempId ? { ...p, finishing: true } : p)));
      const res = await fetch(`/api/customers/${project.customer_id}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "file",
          label: "Signed Agreement",
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
      setSignoffFiles((prev) => [...prev, newAsset]);
    } catch (err) {
      setSignoffUploadError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setSignoffUploadProgress((prev) => prev.filter((p) => p.id !== tempId));
    }
  };

  const handleRemoveSignoffFile = async (id: string) => {
    setSignoffFiles((prev) => prev.filter((f) => f.id !== id));
    try {
      await fetch(`/api/customers/${project.customer_id}/assets?id=${id}`, { method: "DELETE" });
    } catch {
      setSignoffUploadError("Failed to remove file");
    }
  };

  // In-app preview — reuses the shared viewerFile/viewerUrl/viewerLoading/viewerError state,
  // same as handleViewOutcomeFile/handleViewContentMapFile.
  const handleViewSignoffFile = async (id: string) => {
    const file = signoffFiles.find((f) => f.id === id);
    if (!file) return;
    setViewerFile(file);
    setViewerUrl(null);
    setViewerError(null);
    setViewerLoading(true);
    setViewingSignoffFileId(id);
    try {
      const res = await fetch(`/api/customers/${project.customer_id}/assets/${id}/file-url`);
      if (!res.ok) throw new Error("Failed to get file URL");
      const { url } = await res.json();
      setViewerUrl(url);
    } catch {
      setViewerError("Failed to load file preview.");
    } finally {
      setViewerLoading(false);
      setViewingSignoffFileId(null);
    }
  };

  const handleHtmlMockupUpload = async (file: File) => {
    const tempId = crypto.randomUUID();
    setHtmlMockupUploadProgress((prev) => [...prev, { id: tempId, name: file.name, progress: 0 }]);
    setHtmlMockupUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("project_id", project.project_id ?? project.id);
      const uploaded = await uploadFileWithProgress(
        `/api/customers/${project.customer_id}/assets/upload`,
        formData,
        (pct) => setHtmlMockupUploadProgress((prev) => prev.map((p) => (p.id === tempId ? { ...p, progress: pct, finishing: pct >= 100 } : p)))
      );
      setHtmlMockupUploadProgress((prev) => prev.map((p) => (p.id === tempId ? { ...p, finishing: true } : p)));
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
      setHtmlMockupUploadProgress((prev) => prev.filter((p) => p.id !== tempId));
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
    if (!canEditChecklist) return; // pm: checklist is locked on every step (task 146)
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
      if (key === "outcome-target-filed" && !isOutcomeFilled) {
        setChecklistValidationError("Fill in the agreed measurable outcomes — text or an attached document — before marking this done.");
        setOutcomeFieldError(true);
        return;
      }
      if (key === "html-md-files" && !isHtmlMockupFilled) {
        setChecklistValidationError("Upload at least one mockup file before marking this done.");
        return;
      }
      if (key === "signoff-agreement-filed" && !isSignoffFilled) {
        setChecklistValidationError("Add sign-off call notes or upload the signed agreement before marking this done.");
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
  // where at least some text was saved). None of these three ever hard-blocks with no way
  // forward: Outcome target's field is also the "outcome-target-filed" checklist item, so it's
  // already caught by — and gets the normal Mark-all-as-done → force-confirm bypass from — the
  // stepInternal gate below; Migration checklist/Content map have no checklist item tied to their
  // own field, so falling through to the same "Missing required fields" force-confirm modal
  // directly (with nothing to list, since there's no matching item) still gives an equivalent
  // "proceed anyway" escape hatch instead of a dead end.
  const handleContinueClick = () => {
    // pm can't fill in any of these gated fields/checklists (read-only), so none of these
    // guards can ever be satisfied for that role — skip straight to navigating (task 146).
    if (!isPM) {
      let fieldMissing = false;
      if (step.key === "outcome-target" && !isOutcomeFilled) {
        setOutcomeFieldError(true);
        fieldMissing = true;
      }
      if (step.key === "migration-checklist" && !isMigrationChecklistFilled) {
        setMigrationChecklistFieldError(true);
        fieldMissing = true;
      }
      if (step.key === "content-map" && !isContentMapFilled) {
        setContentMapFieldError(true);
        fieldMissing = true;
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
      if (fieldMissing) {
        setIncompleteItems([]);
        setShowForceConfirmModal(true);
        return;
      }
    }
    setStepIdx((s) => s + 1);
  };

  // isLastStep's "Mark all as done" completes Phase 1 directly instead of advancing stepIdx —
  // there's no next step to land on (task 135 follow-up: client-signoff routes its incomplete
  // checklist through this same modal/bypass flow instead of a standalone inline block).
  const finalizeMarkAllDone = async (items: InternalDeliverableConfig[]) => {
    await Promise.all(items.map((item) => setInternalStatus(item.key, "done")));
    setShowIncompleteModal(false);
    setShowForceConfirmModal(false);
    setIncompleteItems([]);
    setChecklistValidationError(null);
    setContactsFieldError(false);
    setBusinessFactsFieldError(false);
    const advance = markAllAdvance;
    setMarkAllAdvance(true);
    if (!advance) return;
    if (isLastStep) {
      await completePhase();
    } else {
      setStepIdx((s) => s + 1);
    }
  };

  // "Mark all as done" from the incomplete-checklist modal — defers to the required-fields
  // confirmation modal if any gated item (Kickoff's two, Outcome target's, html-mockup's file
  // requirement, or Client Sign-off's agreement requirement) would otherwise fail the same
  // validation handleValidatedInternalToggle applies per-item.
  const handleMarkAllDone = () => {
    const hasFailing = incompleteItems.some(
      (item) =>
        (item.key === "kickoff-contacts-confirmed" && !isContactsValid) ||
        (item.key === "kickoff-goals-timeline-filed" && !isBusinessFactsFilled) ||
        (item.key === "outcome-target-filed" && !isOutcomeFilled) ||
        (item.key === "html-md-files" && !isHtmlMockupFilled) ||
        (item.key === "signoff-agreement-filed" && !isSignoffFilled)
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
    if (!isOutcomeFilled) setOutcomeFieldError(true);
    if (!isMigrationChecklistFilled) setMigrationChecklistFieldError(true);
    if (!isContentMapFilled) setContentMapFieldError(true);
  };

  // Per-step checklist header's "Mark All as Done" button — reuses the same incomplete-items
  // modal (and its field-validation/force-confirm-bypass logic in handleMarkAllDone) as the
  // Continue/Complete gate, but flags finalizeMarkAllDone to skip the advance/complete side
  // effect since this button is just a checklist convenience, not a step-navigation action.
  const handleMarkAllChecklistDone = () => {
    if (!canEditChecklist || stepInternal.length === 0) return;
    const incomplete = stepInternal.filter((item) => {
      const row = localInternal.find((r) => r.deliverable_key === item.key);
      return (row?.status ?? "pending") !== "done";
    });
    if (incomplete.length === 0) return;
    setMarkAllAdvance(false);
    setIncompleteItems(incomplete);
    setShowIncompleteModal(true);
  };

  // Steps indicator — clicking a circle jumps straight to that step. Already-reached steps
  // (i <= stepIdx) are always open to revisit; jumping ahead to a step never reached is only
  // allowed once the *currently viewed* step is done, or that step is overdue (today's
  // programme day is past its own dayEnd) — otherwise it's blocked with an explanatory message,
  // matching Continue's own gate. PM mirrors handleContinueClick's own pm bypass (read-only
  // viewing, no data at risk) — never gated, can jump anywhere.
  const handleStepIndicatorClick = (i: number) => {
    if (i === stepIdx) return;
    if (i < stepIdx || isPM) {
      setStepIdx(i);
      return;
    }
    const isCurrentOverdue = currentDay > step.dayEnd;
    if (stepStatus === "done" || isCurrentOverdue) {
      setStepIdx(i);
      return;
    }
    setStepGateAlert(`"${step.name}" needs to be completed first before continuing to the other step.`);
  };

  const completePhase = async () => {
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

  // Client sign-off is gated on its own checklist (both items marked done), not directly on the
  // notes/file fields — a deliberate live-run correction (task 135 follow-up). Routes through
  // the same incomplete-checklist modal / "Mark all as done" / force-confirm bypass flow as
  // handleContinueClick, since there's no Continue button on the last step to reach it from
  // otherwise; finalizeMarkAllDone completes Phase 1 instead of advancing stepIdx when isLastStep.
  const handleComplete = async () => {
    if (step.key === "client-signoff" && stepInternal.length > 0) {
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
    await completePhase();
  };

  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";
  const cardCls = isDark ? "bg-[#121726] border border-white/[0.08] rounded-xl" : "bg-white border border-slate-200 rounded-xl";
  const labelCls = cn("block text-[12.5px] font-semibold mb-1.5", textPrimary);

  // Kickoff-step-only Field styling, matching the New Project wizard's
  // rounded-[9px]/border-[1.5px]/focus-glow look — isDark-aware pair, not a
  // `dark:` variant.
  const kickoffLabelCls = cn("block text-[13px] font-medium mb-1.5", textPrimary);
  const kickoffInputCls = cn(
    "w-full text-sm rounded-[9px] px-3.5 py-[11px] border-[1.5px] outline-none transition-[border-color,box-shadow] duration-150 font-[inherit]",
    isDark
      ? "bg-transparent border-white/[0.12] text-slate-200 placeholder:text-slate-500 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.18)]"
      : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-500 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.1)]"
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
          <div className="flex items-center gap-2">
            <div className={cn("text-base font-bold", textPrimary)}>Onboarding Wizard</div>
            {canManagePhase1 && (
              <button
                type="button"
                onClick={() => setPhase1AccessOpen((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium cursor-pointer transition-colors",
                  phase1AccessOpen
                    ? "border-brand text-brand bg-brand/10"
                    : cn("border-transparent", textMuted, isDark ? "hover:bg-white/[0.06]" : "hover:bg-slate-100")
                )}
              >
                <Users size={12} /> Access
              </button>
            )}
          </div>
          <div className={cn("rounded-lg px-3 py-1.5 border text-center", isDark ? "border-blue-500/25 bg-blue-500/10" : "border-blue-100 bg-blue-50")}>
            <div className="text-[15px] font-bold text-brand leading-none">{doneCount}/{localDeliverables.length}</div>
            <div className={cn("text-[10px] mt-0.5", textMuted)}>complete</div>
          </div>
        </div>
        {phase1AccessOpen && canManagePhase1 && (
          <PhaseAccessPanel
            isDark={isDark}
            members={phase1Members}
            staffDirectory={staffDirectory}
            busy={phase1Busy}
            error={phase1Error}
            onAdd={onAddPhase1Member}
            onRemove={onRemovePhase1Member}
            onTransferOwnership={onTransferPhaseOwnership}
            onClose={() => setPhase1AccessOpen(false)}
          />
        )}
        {/* p-1 -m-1 keeps the active step's ring-4 glow from being clipped by the scroll
            container's edge — horizontally on the first/last circle, and vertically on every
            circle (overflow-x-auto forces the browser to also compute overflow-y as non-visible
            per spec, so the ring's top/bottom bleed needs the same clearance as its left/right). */}
        <div className="flex items-center gap-1 overflow-x-auto p-1 -m-1">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center flex-1 last:flex-none min-w-8">
              <IconTip label={s.name} side="bottom">
                <button
                  type="button"
                  onClick={() => handleStepIndicatorClick(i)}
                  aria-label={`Go to ${s.name}`}
                  className="flex flex-col items-center gap-1 bg-transparent border-none p-0 cursor-pointer transition-opacity hover:opacity-80"
                >
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                    i < stepIdx ? "bg-brand text-white" : i === stepIdx ? "bg-brand text-white ring-4 ring-brand/15" : isDark ? "bg-white/[0.08] text-slate-500" : "bg-slate-100 text-slate-500"
                  )}>
                    {i < stepIdx ? <Check size={11} /> : i + 1}
                  </div>
                  <span className={cn("text-[9px] whitespace-nowrap max-w-16 truncate", i === stepIdx ? cn("font-semibold", textPrimary) : textMuted)}>{s.name}</span>
                </button>
              </IconTip>
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
          {step.key === "client-signoff" && (
            <SaveIndicator status={signoffSaveStatus} lastSavedAt={signoffLastSavedAt} error={signoffSaveError} />
          )}
        </div>

        {step.key === "kickoff" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4 mb-5">
            <div className="flex flex-col gap-4">
              <ContactsField contacts={contacts} onChange={setContacts} isDark={isDark} hasError={contactsFieldError && !isContactsValid} disabled={isStepReadOnly} />
              <div>
                <label className={kickoffLabelCls}>Current website URL</label>
                <input
                  value={websiteUrl}
                  onChange={(e) => { setWebsiteUrl(e.target.value); setWebsiteUrlError(null); }}
                  onBlur={() => setWebsiteUrlError(websiteUrl.trim() && !isValidUrl(websiteUrl.trim()) ? "Enter a full URL starting with http:// or https://" : null)}
                  placeholder="https://client.com"
                  className={kickoffInputCls}
                  disabled={isStepReadOnly}
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
                  disabled={isStepReadOnly}
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
                  disabled={isStepReadOnly}
                />
                {businessFactsUploadError && <p className="text-[12px] text-red-500 mt-2">{businessFactsUploadError}</p>}
                <FileUploadBox
                  files={businessFactsFiles}
                  uploading={businessFactsUploadProgress.length > 0}
                  uploadProgress={businessFactsUploadProgress}
                  onFile={handleBusinessFactsUpload}
                  onRemove={handleRemoveBusinessFactsFile}
                  onView={handleViewBusinessFactsFile}
                  viewingId={viewingBusinessFactsFileId}
                  isDark={isDark}
                  disabled={isStepReadOnly}
                />
              </div>
              <RichTextField
                label="Additional Notes"
                value={additionalNotes}
                onChange={setAdditionalNotes}
                placeholder="Leave blank if none."
                isDark={isDark}
                minHeightClass="min-h-[80px]"
                maxHeightClass="max-h-[220px]"
                disabled={isStepReadOnly}
              />
            </div>
          </div>
        )}

        {step.key === "storage-kb" && (
          <div className="flex flex-col gap-4 mb-5">
            <div>
              <label className={labelCls}>Project files</label>
              <StorageFileExplorer
                assets={phase1Assets}
                error={phase1AssetsError}
                folders={phase1Folders}
                foldersError={phase1FoldersError}
                loading={phase1Loading}
                rootLabel={project.project_id ?? project.id}
                isDark={isDark}
                onView={handleViewAsset}
                viewingId={viewerLoading ? (viewerFile?.id ?? null) : null}
                onPermissionsChange={handlePermissionsChange}
                permissionsUpdatingId={permissionsUpdatingId}
                onUpload={handleUpload}
                uploading={uploading}
                uploadError={uploadError}
                onRemove={handleRemoveFile}
                onMove={handleMoveAsset}
                movingAssetId={movingAssetId}
                onCreateFolder={handleCreateFolder}
                creatingFolder={creatingFolder}
                onFolderPermissionsChange={handleFolderPermissionsChange}
                folderPermissionsUpdatingId={folderPermissionsUpdatingId}
                onRenameFolder={handleRenameFolder}
                renamingFolderId={renamingFolderId}
                onDeleteFolder={handleDeleteFolder}
                deletingFolderId={deletingFolderId}
                onRenameAsset={handleRenameAsset}
                renamingAssetId={renamingAssetId}
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
                            <IconTip label="Remove">
                              <button
                                type="button"
                                onClick={() => handleDeleteCredentialLink(asset.id)}
                                aria-label={`Remove ${asset.label}`}
                                className="p-2 rounded-md cursor-pointer border-none bg-transparent text-red-500 hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 size={12} />
                              </button>
                            </IconTip>
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
                disabled={isStepReadOnly}
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
                uploading={outcomeUploadProgress.length > 0}
                uploadProgress={outcomeUploadProgress}
                onFile={handleOutcomeFileUpload}
                onRemove={handleRemoveOutcomeFile}
                onView={handleViewOutcomeFile}
                viewingId={viewingOutcomeFileId}
                isDark={isDark}
                disabled={isStepReadOnly}
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
                disabled={isStepReadOnly}
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
                uploading={migrationChecklistUploadProgress.length > 0}
                uploadProgress={migrationChecklistUploadProgress}
                onFile={handleMigrationChecklistUpload}
                onRemove={handleRemoveMigrationChecklistFile}
                onView={handleViewMigrationChecklistFile}
                viewingId={viewingMigrationChecklistFileId}
                isDark={isDark}
                disabled={isStepReadOnly}
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
                disabled={isStepReadOnly}
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
                uploading={contentMapUploadProgress.length > 0}
                uploadProgress={contentMapUploadProgress}
                onFile={handleContentMapUpload}
                onRemove={handleRemoveContentMapFile}
                onView={handleViewContentMapFile}
                viewingId={viewingContentMapFileId}
                isDark={isDark}
                disabled={isStepReadOnly}
              />
            </div>
          </div>
        )}

        {step.key === "client-signoff" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_280px] gap-x-6 gap-y-4 mb-5">
            <div>
              <RichTextField
                label="Sign-off call notes"
                value={signoffNotes}
                onChange={setSignoffNotes}
                placeholder="e.g. Scope, mockup, and migration plan discussed and approved; handover topics covered…"
                isDark={isDark}
                minHeightClass="min-h-[220px]"
                maxHeightClass="max-h-[420px]"
                disabled={isStepReadOnly}
              />
            </div>
            <div className="hidden lg:flex flex-col items-center gap-2 px-1 pt-1">
              <div className={cn("w-px flex-1", isDark ? "bg-white/[0.08]" : "bg-slate-200")} />
              <span className={cn("text-[10px] font-semibold uppercase tracking-wide", textMuted)}>Or</span>
              <div className={cn("w-px flex-1", isDark ? "bg-white/[0.08]" : "bg-slate-200")} />
            </div>
            <div>
              <label className={kickoffLabelCls}>Upload the signed agreement instead</label>
              <p className={cn("text-[11px] mb-1.5", textMuted)}>Prefer to attach the signed agreement over typing notes? Upload it here instead.</p>
              {signoffUploadError && <p className="text-[12px] text-red-500 mb-2">{signoffUploadError}</p>}
              <FileUploadBox
                files={signoffFiles}
                uploading={signoffUploadProgress.length > 0}
                uploadProgress={signoffUploadProgress}
                onFile={handleSignoffUpload}
                onRemove={handleRemoveSignoffFile}
                onView={handleViewSignoffFile}
                viewingId={viewingSignoffFileId}
                isDark={isDark}
                disabled={isStepReadOnly}
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
              uploading={htmlMockupUploadProgress.length > 0}
              uploadProgress={htmlMockupUploadProgress}
              onFile={handleHtmlMockupUpload}
              onRemove={handleRemoveHtmlMockupFile}
              onView={handleViewHtmlMockupFile}
              onEdit={handleOpenHtmlEditor}
              viewingId={viewingHtmlMockupFileId}
              isDark={isDark}
              disabled={isStepReadOnly}
            />
          </div>
        )}

        {/* Sub-phase deliverable + its internal deliverables */}
        <div className={cn("rounded-lg border p-3", isDark ? "border-white/[0.08]" : "border-slate-200")}>
          <WizardDeliverableRow
            name={step.name} description={step.description}
            status={stepStatus} isDark={isDark} toggling={togglingKey === step.key}
            onClick={stepInternal.length > 0 ? undefined : () => setDeliverableStatus(step.key, cycle(stepStatus))}
          />
          {stepInternal.length > 0 && (
            <div className="mt-2.5 pt-2.5 border-t border-dashed border-slate-200 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className={cn("text-[10.5px] font-semibold uppercase tracking-wide flex items-center gap-1.5", textMuted)}>
                  <ListChecks size={11} /> Checklist
                </div>
                {canEditChecklist && stepInternal.some((item) => (localInternal.find((r) => r.deliverable_key === item.key)?.status ?? "pending") !== "done") && (
                  <button
                    onClick={handleMarkAllChecklistDone}
                    className={cn(
                      "text-[10.5px] font-semibold rounded-md px-2 py-1 border cursor-pointer transition-colors",
                      isDark ? "border-white/[0.1] text-slate-300 bg-white/[0.03] hover:bg-white/[0.08]" : "border-slate-200 text-slate-600 bg-white hover:bg-slate-50"
                    )}
                  >
                    Mark All as Done
                  </button>
                )}
              </div>
              {stepInternal.map((id) => {
                const row = localInternal.find((r) => r.deliverable_key === id.key);
                const iStatus = row?.status ?? "pending";
                const isDone = iStatus === "done";
                const itemLabel = (
                  <span className={cn("text-[12px]", isDone ? cn(textMuted, "line-through") : textPrimary)}>{id.name}</span>
                );
                return (
                  <button
                    key={id.key}
                    onClick={() => handleValidatedInternalToggle(id.key, iStatus)}
                    disabled={togglingKey === `internal-${id.key}` || !canEditChecklist}
                    className={cn(
                      "w-full flex items-center gap-2 py-1 rounded-md bg-transparent border-none text-left transition-colors disabled:opacity-60",
                      canEditChecklist ? "cursor-pointer" : "cursor-default",
                      canEditChecklist && (isDark ? "hover:bg-white/[0.04]" : "hover:bg-slate-50")
                    )}
                  >
                    <span
                      className={cn(
                        "shrink-0 h-5 w-5 rounded border flex items-center justify-center transition-colors",
                        isDone ? "bg-green-500 border-green-500" : isDark ? "border-white/[0.2] bg-white/[0.02]" : "border-slate-300 bg-white"
                      )}
                    >
                      {isDone && <Check size={11} strokeWidth={3} className="text-white" />}
                    </span>
                    {canEditChecklist ? (
                      <Tooltip>
                        <TooltipTrigger render={itemLabel} />
                        <TooltipContent side="right">{isDone ? "Uncheck" : "Mark as Done"}</TooltipContent>
                      </Tooltip>
                    ) : (
                      itemLabel
                    )}
                  </button>
                );
              })}
              {checklistValidationError && (
                <p className="text-[11px] text-red-500 mt-1">{checklistValidationError}</p>
              )}
            </div>
          )}
        </div>

        {isLastStep && !isPM && isPhaseActive && (
          <div className="mt-5">
            {doneCount < localDeliverables.length && (
              <div className={cn("flex gap-2.5 p-3 rounded-lg border mb-4 text-[12px]", isDark ? "border-amber-500/25 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800")}>
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span><strong>{localDeliverables.length - doneCount} deliverable{localDeliverables.length - doneCount !== 1 ? "s" : ""} not yet done.</strong> You can still complete Phase 1, but outstanding items will be flagged to the PM.</span>
              </div>
            )}
            <div className={cn("flex gap-2.5 p-3 rounded-lg border text-[12px]", isDark ? "border-amber-500/25 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800")}>
              <Sparkles size={14} className="shrink-0 mt-0.5" />
              <span>Marking Phase 1 complete will notify the PM, make the project visible in Customers/Projects, and start Day 16 tracking for Phase 2.</span>
            </div>
          </div>
        )}
      </div>

      <div className={cn(cardCls, "p-4")}>
        {isLastStep && !isPM && isPhaseActive && completeError && <p className="text-[12px] text-red-500 mb-3">{completeError}</p>}
        <div className="flex items-center justify-between">
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
          ) : isPM || !isPhaseActive ? (
            // pm can view every step but never completes Phase 1 — that's Marketing/Admin/
            // Super Admin's call, gated server-side too (complete-phase route, task 146).
            // Task 160: an inactive (jumped-past) phase can't be marked complete either, for
            // any role — there's nothing left to "complete" once the jump moved past it.
            <span className={cn("text-[12px]", textMuted)}>
              {isPM ? "Only Marketing/Admin can complete Phase 1" : "Phase 1 is no longer active"}
            </span>
          ) : (
            <button
              onClick={handleComplete}
              disabled={completing}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white rounded-lg px-4 py-2 border-none cursor-pointer disabled:opacity-60 bg-gradient-to-br from-green-600 to-green-700 hover:opacity-90 transition-opacity"
            >
              {completing ? "Completing…" : <><Check size={14} strokeWidth={2.5} /> Complete Phase 1 &amp; notify PM</>}
            </button>
          )}
        </div>
      </div>

      {showIncompleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setShowIncompleteModal(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="incomplete-checklist-title" className={cn(cardCls, "w-full max-w-md shadow-xl overflow-hidden")} onClick={(e) => e.stopPropagation()}>
            <div className={cn("flex items-center justify-between px-5 py-4 border-b", isDark ? "border-white/[0.08]" : "border-slate-100")}>
              <h2 id="incomplete-checklist-title" className={cn("text-[15px] font-semibold", textPrimary)}>Incomplete checklist items</h2>
              <IconTip label="Close" side="bottom">
                <button onClick={() => setShowIncompleteModal(false)} aria-label="Close" className={cn("p-2 rounded-md cursor-pointer border-none bg-transparent", textMuted)}>
                  <X size={16} />
                </button>
              </IconTip>
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
          <div role="dialog" aria-modal="true" aria-labelledby="force-confirm-title" className={cn(cardCls, "w-full max-w-sm shadow-xl overflow-hidden")} onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                <h2 id="force-confirm-title" className={cn("text-[15px] font-semibold", textPrimary)}>Missing required fields</h2>
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

      {stepGateAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setStepGateAlert(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="step-gate-title" className={cn(cardCls, "w-full max-w-sm shadow-xl overflow-hidden")} onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                <h2 id="step-gate-title" className={cn("text-[15px] font-semibold", textPrimary)}>Step not available yet</h2>
              </div>
              <p className={cn("text-[13px]", textMuted)}>{stepGateAlert}</p>
            </div>
            <div className={cn("flex items-center justify-end gap-2 px-5 py-4 border-t", isDark ? "border-white/[0.08]" : "border-slate-100 bg-slate-50")}>
              <button
                onClick={() => setStepGateAlert(null)}
                className="px-4 py-2 rounded-lg bg-brand text-white text-[13px] font-semibold cursor-pointer border-none hover:opacity-90 transition-opacity"
              >
                OK
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
  label, tags, input, setInput, onAdd, onRemove, placeholder, isDark, disabled,
}: {
  label: string; tags: string[]; input: string; setInput: (v: string) => void;
  onAdd: () => void; onRemove: (i: number) => void; placeholder?: string; isDark: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className={cn("block text-[13px] font-medium mb-1.5", isDark ? "text-slate-200" : "text-slate-900")}>{label}</label>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand bg-brand/10 rounded-md px-2.5 py-1">
              {t}
              {!disabled && (
                <IconTip label="Remove">
                  <button onClick={() => onRemove(i)} className="bg-transparent border-none cursor-pointer text-brand p-0 flex" aria-label={`Remove ${t}`}>
                    <Trash2 size={10} />
                  </button>
                </IconTip>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
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
                : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-500 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.1)]"
            )}
          />
          <IconTip label="Add" side="bottom">
            <button
              type="button"
              onClick={onAdd}
              aria-label="Add"
              className={cn(
                "inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-[9px] border-[1.5px] bg-transparent cursor-pointer transition-colors",
                isDark ? "border-brand/30 text-brand hover:bg-brand/10" : "border-brand/25 text-brand hover:bg-brand/5"
              )}
            >
              <Plus size={16} />
            </button>
          </IconTip>
        </div>
      )}
    </div>
  );
}

function ContactsField({
  contacts, onChange, isDark, hasError, disabled,
}: {
  contacts: ContactEntry[]; onChange: (contacts: ContactEntry[]) => void; isDark: boolean; hasError?: boolean;
  disabled?: boolean;
}) {
  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";
  const miniInputCls = cn(
    "w-full text-[13px] rounded-[9px] px-3 py-2.5 border-[1.5px] outline-none transition-[border-color,box-shadow] duration-150 font-[inherit]",
    isDark
      ? "bg-transparent border-white/[0.12] text-slate-200 placeholder:text-slate-500 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.18)]"
      : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-500 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.1)]"
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
                {i > 0 && !disabled && (
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
                <input value={c.fullName} onChange={(e) => updateContact(i, { fullName: e.target.value })} placeholder="Full name" className={miniInputCls} disabled={disabled} />
                <input value={c.position} onChange={(e) => updateContact(i, { position: e.target.value })} placeholder="Position (optional)" className={miniInputCls} disabled={disabled} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input value={c.email} onChange={(e) => updateContact(i, { email: e.target.value })} placeholder="Email" className={cn(miniInputCls, emailInvalid && "border-red-400")} disabled={disabled} />
                  {emailInvalid && <p className="text-[10px] text-red-500 mt-0.5">Enter a valid email.</p>}
                </div>
                <div>
                  <input value={c.phone} onChange={(e) => updateContact(i, { phone: e.target.value })} placeholder="Phone (optional)" className={cn(miniInputCls, phoneInvalid && "border-red-400")} disabled={disabled} />
                  {phoneInvalid && <p className="text-[10px] text-red-500 mt-0.5">Enter a valid phone number.</p>}
                </div>
              </div>
              <input
                value={c.socialMedia}
                onChange={(e) => updateContact(i, { socialMedia: e.target.value })}
                placeholder="Social media accounts (optional, comma-separated)"
                className={miniInputCls}
                disabled={disabled}
              />
            </div>
          );
        })}
      </div>
      {!disabled && (
        <IconTip label="Add contact" side="bottom">
          <button
            type="button"
            onClick={addContact}
            aria-label="Add contact"
            className={cn(
              "inline-flex items-center justify-center w-11 h-11 mt-2 rounded-[9px] border-[1.5px] bg-transparent cursor-pointer transition-colors",
              isDark ? "border-brand/30 text-brand hover:bg-brand/10" : "border-brand/25 text-brand hover:bg-brand/5"
            )}
          >
            <Plus size={16} />
          </button>
        </IconTip>
      )}
    </div>
  );
}

function RichTextField({
  label, value, onChange, placeholder, isDark, minHeightClass = "min-h-[80px]", maxHeightClass, hasError, disabled,
}: {
  label: string; value: string; onChange: (html: string) => void; placeholder?: string;
  isDark: boolean; minHeightClass?: string; maxHeightClass?: string; hasError?: boolean;
  disabled?: boolean;
}) {
  const editor = useEditor({
    // StarterKit v3 already bundles Underline — don't add @tiptap/extension-underline
    // separately here, that causes a "Duplicate extension names" runtime warning.
    extensions: [StarterKit],
    content: value,
    editable: !disabled,
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

  // Keeps the editor's editable state in sync if `disabled` changes after mount (the
  // `editable` option above only applies at creation) — task 146's PM read-only mode.
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

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
        {!disabled && (
          <div className={cn("flex items-center gap-0.5 px-2 py-1.5 border-b", isDark ? "border-white/[0.08] bg-white/[0.02]" : "border-slate-100 bg-slate-50/50")}>
            {marks.map((btn) => (
              <IconTip key={btn.title} label={btn.title} side="bottom">
                <button
                  type="button"
                  onClick={btn.action}
                  className={cn(
                    "text-[12px] w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors border-none",
                    btn.cls,
                    btn.active() ? "bg-brand/15 text-brand" : isDark ? "text-slate-400 hover:bg-white/[0.06]" : "text-slate-500 hover:bg-slate-100"
                  )}
                >
                  {btn.label}
                </button>
              </IconTip>
            ))}
            <span className={cn("w-px h-4 mx-0.5", isDark ? "bg-white/[0.08]" : "bg-slate-200")} />
            <IconTip label="Bullet List" side="bottom">
              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
                className={cn(
                  "text-[11px] px-2 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors border-none",
                  (editor?.isActive("bulletList") ?? false) ? "bg-brand/15 text-brand" : isDark ? "text-slate-400 hover:bg-white/[0.06]" : "text-slate-500 hover:bg-slate-100"
                )}
              >
                • List
              </button>
            </IconTip>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
      {placeholder && <p className={cn("text-[11px] mt-1", textMuted)}>{placeholder}</p>}
    </div>
  );
}

function FileUploadBox({
  files, uploading, uploadProgress, onFile, onRemove, onView, viewingId, isDark, disabled,
}: {
  files: AssetRow[]; uploading: boolean; uploadProgress?: UploadProgressEntry[]; onFile: (file: File) => void; onRemove?: (id: string) => void;
  onView?: (id: string) => void; viewingId?: string | null; isDark: boolean; disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";
  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    Array.from(fileList).forEach((f) => onFile(f));
  }

  return (
    <div className="mt-2.5">
      {!disabled && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files); }}
            className={cn(
              "w-full rounded-lg border-2 border-dashed py-4 text-center cursor-pointer transition-colors disabled:opacity-60",
              isDark
                ? isDragOver ? "border-brand bg-brand/[0.06]" : "border-white/[0.12] bg-white/[0.02] hover:border-brand"
                : isDragOver ? "border-brand bg-brand/[0.04]" : "border-slate-200 bg-slate-50 hover:border-brand"
            )}
          >
            <Upload size={16} className={cn("mx-auto mb-1.5", textMuted)} />
            <div className={cn("text-[11.5px]", textMuted)}>{uploading ? "Uploading…" : <>Drag files here or <span className="text-brand font-medium">click to upload</span></>}</div>
          </button>
        </>
      )}
      {uploadProgress && uploadProgress.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {uploadProgress.map((p) => (
            <div key={p.id} className={cn("flex flex-col gap-1.5 px-2.5 py-2 rounded-lg", isDark ? "bg-white/[0.03]" : "bg-slate-50")}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-brand/10 flex items-center justify-center shrink-0">
                  <FileText size={11} className="text-brand" />
                </div>
                <div className={cn("text-[11.5px] font-medium truncate flex-1", textPrimary)}>{p.name}</div>
                <div className={cn("flex items-center gap-1 text-[10.5px] tabular-nums shrink-0", textMuted)}>
                  {p.finishing ? (
                    <>
                      <Loader2 size={10} className="animate-spin motion-reduce:animate-none" />
                      Finishing…
                    </>
                  ) : (
                    `${p.progress}%`
                  )}
                </div>
              </div>
              <div className={cn("h-1.5 rounded-full overflow-hidden", isDark ? "bg-white/[0.08]" : "bg-slate-200")}>
                <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${p.progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {files.map((f) => (
            <div key={f.id} className={cn("flex items-center gap-2 px-2.5 py-2 rounded-lg", isDark ? "bg-white/[0.03]" : "bg-slate-50")}>
              <div className="w-6 h-6 rounded-md bg-brand/10 flex items-center justify-center shrink-0">
                <FileText size={11} className="text-brand" />
              </div>
              <div className={cn("text-[11.5px] font-medium truncate flex-1", textPrimary)}>{f.file_name}</div>
              {onView && (
                <IconTip label="View">
                  <button
                    type="button"
                    onClick={() => onView(f.id)}
                    disabled={viewingId === f.id}
                    aria-label={`View ${f.file_name}`}
                    className="shrink-0 p-2 rounded-md cursor-pointer border-none bg-transparent text-brand hover:bg-brand/10 transition-colors disabled:opacity-50"
                  >
                    <Eye size={12} />
                  </button>
                </IconTip>
              )}
              {onRemove && !disabled && (
                <IconTip label="Remove">
                  <button
                    type="button"
                    onClick={() => onRemove(f.id)}
                    aria-label={`Remove ${f.file_name}`}
                    className="shrink-0 p-2 rounded-md cursor-pointer border-none bg-transparent text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </IconTip>
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
  assets, error, folders, foldersError, loading, rootLabel, isDark, onView, viewingId,
  onPermissionsChange, permissionsUpdatingId, onUpload, uploading, uploadError, onRemove,
  onMove, movingAssetId, onCreateFolder, creatingFolder,
  onFolderPermissionsChange, folderPermissionsUpdatingId,
  onRenameFolder, renamingFolderId, onDeleteFolder, deletingFolderId,
  onRenameAsset, renamingAssetId, staffDirectory,
}: {
  assets: AssetRow[]; error: string | null;
  folders: AssetFolder[]; foldersError: string | null;
  loading: boolean; rootLabel: string;
  isDark: boolean; onView: (asset: AssetRow) => void; viewingId: string | null;
  onPermissionsChange: (assetId: string, updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => Promise<void>;
  permissionsUpdatingId: string | null;
  onUpload: (file: File, folderId: string | null) => void; uploading: boolean; uploadError: string | null;
  onRemove: (assetId: string) => Promise<void>;
  onMove: (assetId: string, folderId: string | null) => Promise<void>; movingAssetId: string | null;
  onCreateFolder: (name: string, parentFolderId: string | null) => Promise<AssetFolder | null>; creatingFolder: boolean;
  onFolderPermissionsChange: (folderId: string, updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => Promise<void>;
  folderPermissionsUpdatingId: string | null;
  onRenameFolder: (folderId: string, name: string) => Promise<boolean>; renamingFolderId: string | null;
  onDeleteFolder: (folderId: string) => Promise<boolean>; deletingFolderId: string | null;
  onRenameAsset: (assetId: string, fileName: string) => Promise<boolean>; renamingAssetId: string | null;
  staffDirectory: { id: string; full_name: string | null; role: string }[];
}) {
  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";
  const inputRef = useRef<HTMLInputElement>(null);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [permissionsOpenId, setPermissionsOpenId] = useState<string | null>(null);
  const [openFileMenuId, setOpenFileMenuId] = useState<string | null>(null);
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState<string | null>(null);
  const [moveModalAssetIds, setMoveModalAssetIds] = useState<string[] | null>(null);
  const [bulkSharePanelOpen, setBulkSharePanelOpen] = useState(false);
  const [bulkRoles, setBulkRoles] = useState<string[]>([]);
  const [bulkUserIds, setBulkUserIds] = useState<string[]>([]);
  const [bulkPersonSearch, setBulkPersonSearch] = useState("");
  const [bulkPersonDropdownOpen, setBulkPersonDropdownOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  // Per-file "Share with specific people" search — reset whenever a different file's
  // Permissions panel is opened/closed (only one is ever open at a time via permissionsOpenId).
  const [filePersonSearch, setFilePersonSearch] = useState("");
  const [filePersonDropdownOpen, setFilePersonDropdownOpen] = useState(false);
  // Folder Permissions panel (task 144) — same shape as the per-file one above, its own
  // search state since a folder panel and a file panel could theoretically both be open.
  const [folderPermissionsOpenId, setFolderPermissionsOpenId] = useState<string | null>(null);
  const [folderPersonSearch, setFolderPersonSearch] = useState("");
  const [folderPersonDropdownOpen, setFolderPersonDropdownOpen] = useState(false);
  // Shared rename modal (task 144) — used for both folder rename and file rename.
  const [renameTarget, setRenameTarget] = useState<{ kind: "folder" | "file"; id: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const closeBulkSharePanel = () => {
    setBulkSharePanelOpen(false);
    setBulkPersonSearch("");
    setBulkPersonDropdownOpen(false);
  };

  const navigateTo = (folderId: string | null) => {
    setCurrentFolderId(folderId);
    setSelectedIds(new Set());
    setPermissionsOpenId(null);
    setOpenFileMenuId(null);
    setOpenFolderMenuId(null);
    setFolderPermissionsOpenId(null);
    closeBulkSharePanel();
  };

  const foldersById = new Map(folders.map((f) => [f.id, f]));
  const childrenOf = (parentId: string | null) => folders.filter((f) => f.parent_folder_id === parentId);

  const breadcrumb: AssetFolder[] = [];
  {
    let cur = currentFolderId ? foldersById.get(currentFolderId) ?? null : null;
    while (cur) {
      breadcrumb.unshift(cur);
      cur = cur.parent_folder_id ? foldersById.get(cur.parent_folder_id) ?? null : null;
    }
  }

  const childFolders = childrenOf(currentFolderId);
  const filesHere = assets.filter((a) => (a.folder_id ?? null) === currentFolderId);

  const folderTreeFlat: { folder: AssetFolder; depth: number }[] = [];
  const flattenTree = (parentId: string | null, depth: number) => {
    for (const f of childrenOf(parentId)) {
      folderTreeFlat.push({ folder: f, depth });
      flattenTree(f.id, depth + 1);
    }
  };
  flattenTree(null, 0);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  // Search-to-add person picker (mirrors AddCredentialLinkModal's pattern) — reused by
  // both the per-file Permissions panel and the bulk Share panel, since listing every
  // staff directory entry as toggle pills doesn't scale for a large directory.
  const renderPersonPicker = (
    selectedUserIds: string[],
    onAdd: (personId: string) => void,
    onRemove: (personId: string) => void,
    search: string,
    setSearch: (v: string) => void,
    dropdownOpen: boolean,
    setDropdownOpen: (v: boolean) => void
  ) => {
    const selectedPeople = selectedUserIds
      .map((id) => staffDirectory.find((p) => p.id === id))
      .filter((p): p is { id: string; full_name: string | null; role: string } => !!p);
    const filteredPeople = staffDirectory
      .filter((p) => !selectedUserIds.includes(p.id))
      .filter((p) => (p.full_name ?? "").toLowerCase().includes(search.toLowerCase()));
    return (
      <div>
        <div className={cn("text-[10px] font-semibold uppercase tracking-wide mb-1", textMuted)}>Share with specific people</div>
        {selectedPeople.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {selectedPeople.map((person) => (
              <span
                key={person.id}
                className={cn("inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-medium", isDark ? "bg-brand/20 text-brand" : "bg-brand/10 text-brand")}
              >
                {person.full_name ?? "Unnamed"}
                <IconTip label="Remove">
                  <button
                    type="button"
                    onClick={() => onRemove(person.id)}
                    aria-label={`Remove ${person.full_name ?? "person"}`}
                    className="p-2 rounded-full cursor-pointer border-none bg-transparent text-brand hover:bg-brand/20 transition-colors"
                  >
                    <X size={10} />
                  </button>
                </IconTip>
              </span>
            ))}
          </div>
        )}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setDropdownOpen(true); }}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
            placeholder="Search people…"
            className={cn(
              "w-full text-[11.5px] rounded-md px-2.5 py-1.5 border outline-none transition-colors font-[inherit]",
              isDark ? "bg-transparent border-white/[0.1] text-slate-200 placeholder:text-slate-500 focus:border-brand" : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-500 focus:border-brand"
            )}
          />
          {dropdownOpen && (
            <div className={cn("absolute z-30 mt-1 w-full max-h-32 overflow-y-auto rounded-lg border shadow-lg", isDark ? "bg-[#171c2c] border-white/[0.08]" : "bg-white border-slate-200")}>
              {filteredPeople.length === 0 ? (
                <div className={cn("px-2.5 py-1.5 text-[11.5px]", textMuted)}>{staffDirectory.length === 0 ? "No staff directory entries found." : "No matches."}</div>
              ) : (
                filteredPeople.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { onAdd(person.id); setSearch(""); }}
                    className={cn("w-full text-left px-2.5 py-1.5 text-[11.5px] cursor-pointer border-none bg-transparent transition-colors", isDark ? "text-slate-200 hover:bg-white/[0.06]" : "text-slate-700 hover:bg-slate-50")}
                  >
                    {person.full_name ?? "Unnamed"}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPermissionsPanel = (f: AssetRow, roleRestricted: boolean) => (
    <div className={cn("flex flex-col gap-2 px-2.5 py-2 rounded-lg mt-1 border", isDark ? "bg-white/[0.02] border-white/[0.06]" : "bg-slate-50 border-slate-100")}>
      <div className="flex items-center justify-between">
        <span className={cn("text-[10px] font-semibold uppercase tracking-wide", textMuted)}>Permissions</span>
        <IconTip label="Close" side="bottom">
          <button
            type="button"
            onClick={() => { setPermissionsOpenId(null); setFilePersonSearch(""); setFilePersonDropdownOpen(false); }}
            aria-label="Close permissions"
            className={cn("p-2 rounded-md cursor-pointer border-none bg-transparent transition-colors", textMuted, isDark ? "hover:bg-white/[0.08]" : "hover:bg-slate-200")}
          >
            <X size={12} />
          </button>
        </IconTip>
      </div>
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
      {renderPersonPicker(
        f.allowed_user_ids ?? [],
        (personId) => onPermissionsChange(f.id, { allowed_user_ids: [...(f.allowed_user_ids ?? []), personId] }),
        (personId) => onPermissionsChange(f.id, { allowed_user_ids: (f.allowed_user_ids ?? []).filter((id) => id !== personId) }),
        filePersonSearch, setFilePersonSearch, filePersonDropdownOpen, setFilePersonDropdownOpen
      )}
    </div>
  );

  // Folder Permissions panel (task 144) — same role-pill + renderPersonPicker shape as
  // renderPermissionsPanel above, targeting a folder via onFolderPermissionsChange instead.
  const renderFolderPermissionsPanel = (folder: AssetFolder) => {
    const roleRestricted = !!folder.allowed_roles && folder.allowed_roles.length > 0;
    return (
      <div className={cn("flex flex-col gap-2 px-2.5 py-2 rounded-lg mt-1 mb-1 border", isDark ? "bg-white/[0.02] border-white/[0.06]" : "bg-slate-50 border-slate-100")}>
        <div className="flex items-center justify-between">
          <span className={cn("text-[10px] font-semibold uppercase tracking-wide", textMuted)}>Permissions</span>
          <IconTip label="Close" side="bottom">
            <button
              type="button"
              onClick={() => { setFolderPermissionsOpenId(null); setFolderPersonSearch(""); setFolderPersonDropdownOpen(false); }}
              aria-label="Close permissions"
              className={cn("p-2 rounded-md cursor-pointer border-none bg-transparent transition-colors", textMuted, isDark ? "hover:bg-white/[0.08]" : "hover:bg-slate-200")}
            >
              <X size={12} />
            </button>
          </IconTip>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onFolderPermissionsChange(folder.id, { allowed_roles: [] })}
            className={cn(
              "px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer transition-colors",
              !roleRestricted ? "bg-brand text-white border-brand" : "bg-transparent text-slate-500 border-slate-200 hover:border-slate-300"
            )}
          >
            All
          </button>
          {ASSET_ROLE_OPTIONS.map((role) => {
            const active = folder.allowed_roles?.includes(role.value) ?? false;
            return (
              <button
                key={role.value}
                type="button"
                onClick={() => {
                  const current = folder.allowed_roles ?? [];
                  const next = active ? current.filter((r) => r !== role.value) : [...current, role.value];
                  onFolderPermissionsChange(folder.id, { allowed_roles: next });
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
        {renderPersonPicker(
          folder.allowed_user_ids ?? [],
          (personId) => onFolderPermissionsChange(folder.id, { allowed_user_ids: [...(folder.allowed_user_ids ?? []), personId] }),
          (personId) => onFolderPermissionsChange(folder.id, { allowed_user_ids: (folder.allowed_user_ids ?? []).filter((id) => id !== personId) }),
          folderPersonSearch, setFolderPersonSearch, folderPersonDropdownOpen, setFolderPersonDropdownOpen
        )}
      </div>
    );
  };

  const openRenameModal = (kind: "folder" | "file", id: string, currentName: string) => {
    setRenameTarget({ kind, id });
    setRenameValue(currentName);
    setRenameError(null);
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    const value = renameValue.trim();
    if (!value) {
      setRenameError("Enter a name.");
      return;
    }
    const ok =
      renameTarget.kind === "folder"
        ? await onRenameFolder(renameTarget.id, value)
        : await onRenameAsset(renameTarget.id, value);
    if (ok) setRenameTarget(null);
    else setRenameError(`Failed to rename ${renameTarget.kind === "folder" ? "folder" : "file"} — the name may already be in use.`);
  };

  const fileMenu = (f: AssetRow) => (
    <div className="relative">
      <IconTip label="Actions">
        <button
          type="button"
          onClick={() => setOpenFileMenuId((id) => (id === f.id ? null : f.id))}
          aria-label={`Actions for ${f.file_name}`}
          className={cn("shrink-0 p-2 rounded-md cursor-pointer border-none transition-colors", textMuted, isDark ? "hover:bg-white/[0.08]" : "hover:bg-slate-200/70")}
        >
          <MoreVertical size={14} />
        </button>
      </IconTip>
      {openFileMenuId === f.id && (
        <div
          className={cn(
            "absolute right-0 top-full mt-1 z-20 w-40 rounded-lg border shadow-lg py-1 flex flex-col",
            isDark ? "bg-[#171c2c] border-white/[0.08]" : "bg-white border-slate-200"
          )}
        >
          <button
            type="button"
            onClick={() => { setOpenFileMenuId(null); onView(f); }}
            disabled={viewingId === f.id}
            className={cn("flex items-center gap-2 px-3 py-1.5 text-[12px] text-left cursor-pointer border-none bg-transparent disabled:opacity-50", textPrimary, isDark ? "hover:bg-white/[0.06]" : "hover:bg-slate-50")}
          >
            <Eye size={13} /> View
          </button>
          <button
            type="button"
            onClick={() => {
              setOpenFileMenuId(null);
              setFilePersonSearch("");
              setFilePersonDropdownOpen(false);
              setPermissionsOpenId((id) => (id === f.id ? null : f.id));
            }}
            disabled={permissionsUpdatingId === f.id}
            className={cn("flex items-center gap-2 px-3 py-1.5 text-[12px] text-left cursor-pointer border-none bg-transparent disabled:opacity-50", textPrimary, isDark ? "hover:bg-white/[0.06]" : "hover:bg-slate-50")}
          >
            <Lock size={13} /> Permissions
          </button>
          <button
            type="button"
            onClick={() => { setOpenFileMenuId(null); openRenameModal("file", f.id, f.file_name ?? ""); }}
            disabled={renamingAssetId === f.id}
            className={cn("flex items-center gap-2 px-3 py-1.5 text-[12px] text-left cursor-pointer border-none bg-transparent disabled:opacity-50", textPrimary, isDark ? "hover:bg-white/[0.06]" : "hover:bg-slate-50")}
          >
            <Pencil size={13} /> Rename
          </button>
          <button
            type="button"
            onClick={() => { setOpenFileMenuId(null); setMoveModalAssetIds([f.id]); }}
            disabled={movingAssetId === f.id}
            className={cn("flex items-center gap-2 px-3 py-1.5 text-[12px] text-left cursor-pointer border-none bg-transparent disabled:opacity-50", textPrimary, isDark ? "hover:bg-white/[0.06]" : "hover:bg-slate-50")}
          >
            <FolderInput size={13} /> Move to folder
          </button>
          <button
            type="button"
            onClick={() => { setOpenFileMenuId(null); onRemove(f.id); }}
            className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-left cursor-pointer border-none bg-transparent text-red-500 hover:bg-red-500/10"
          >
            <Trash2 size={13} /> Remove
          </button>
        </div>
      )}
    </div>
  );

  const uploadInput = (
    <>
      <input ref={inputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f, currentFolderId); e.target.value = ""; }} />
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

  const openNewFolderModal = (parentId: string | null) => {
    setNewFolderParentId(parentId);
    setNewFolderName("");
    setNewFolderError(null);
    setNewFolderModalOpen(true);
  };

  const submitNewFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setNewFolderError("Enter a folder name.");
      return;
    }
    const created = await onCreateFolder(name, newFolderParentId);
    if (created) setNewFolderModalOpen(false);
    else setNewFolderError("Failed to create folder — it may already exist here.");
  };

  const runMove = async (targetFolderId: string | null) => {
    if (!moveModalAssetIds) return;
    setBulkBusy(true);
    await Promise.all(moveModalAssetIds.map((id) => onMove(id, targetFolderId)));
    setBulkBusy(false);
    setMoveModalAssetIds(null);
    setSelectedIds(new Set());
    closeBulkSharePanel();
  };

  const runBulkDelete = async () => {
    closeBulkSharePanel();
    setBulkBusy(true);
    await Promise.all(Array.from(selectedIds).map((id) => onRemove(id)));
    setBulkBusy(false);
    setSelectedIds(new Set());
  };

  const runBulkShare = async () => {
    setBulkBusy(true);
    await Promise.all(
      Array.from(selectedIds).map((id) => onPermissionsChange(id, { allowed_roles: bulkRoles, allowed_user_ids: bulkUserIds }))
    );
    setBulkBusy(false);
    setSelectedIds(new Set());
    closeBulkSharePanel();
  };

  return (
    <div className={cn("rounded-lg overflow-visible", isDark ? "bg-white/[0.02]" : "bg-white")}>
      {(openFileMenuId || openFolderMenuId) && (
        <div className="fixed inset-0 z-10" onClick={() => { setOpenFileMenuId(null); setOpenFolderMenuId(null); }} />
      )}
      {(error || foldersError) && <p className="text-[12px] text-red-500 px-1 pb-2">{error || foldersError}</p>}

      {selectedIds.size > 0 ? (
        <div className={cn("flex items-center gap-1 p-2 rounded-lg mb-2", isDark ? "bg-white/[0.04]" : "bg-slate-100")}>
          <IconTip label="Clear selection">
            <button
              type="button"
              onClick={() => { setSelectedIds(new Set()); closeBulkSharePanel(); }}
              aria-label="Clear selection"
              className={cn("p-2 rounded-md cursor-pointer border-none bg-transparent transition-colors", textMuted, isDark ? "hover:bg-white/[0.08]" : "hover:bg-slate-200")}
            >
              <X size={14} />
            </button>
          </IconTip>
          <span className={cn("text-[12px] font-medium mr-1", textPrimary)}>{selectedIds.size} selected</span>
          <div className="flex-1" />
          <IconTip label="Share">
            <button
              type="button"
              onClick={() => {
                setBulkSharePanelOpen((v) => {
                  if (v) { setBulkPersonSearch(""); setBulkPersonDropdownOpen(false); }
                  return !v;
                });
                setBulkRoles([]);
                setBulkUserIds([]);
              }}
              disabled={bulkBusy}
              aria-label="Share"
              className={cn("p-2 rounded-md cursor-pointer border-none transition-colors disabled:opacity-50", bulkSharePanelOpen ? "bg-brand/15 text-brand" : cn(textMuted, isDark ? "hover:bg-white/[0.08]" : "hover:bg-slate-200"))}
            >
              <Share2 size={14} />
            </button>
          </IconTip>
          <IconTip label="Move to folder">
            <button
              type="button"
              onClick={() => { closeBulkSharePanel(); setMoveModalAssetIds(Array.from(selectedIds)); }}
              disabled={bulkBusy}
              aria-label="Move to folder"
              className={cn("p-2 rounded-md cursor-pointer border-none transition-colors disabled:opacity-50", textMuted, isDark ? "hover:bg-white/[0.08]" : "hover:bg-slate-200")}
            >
              <FolderInput size={14} />
            </button>
          </IconTip>
          <IconTip label="Delete">
            <button
              type="button"
              onClick={runBulkDelete}
              disabled={bulkBusy}
              aria-label="Delete"
              className="p-2 rounded-md cursor-pointer border-none transition-colors disabled:opacity-50 text-red-500 hover:bg-red-500/10"
            >
              <Trash2 size={14} />
            </button>
          </IconTip>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {loading ? (
              <span className={cn("text-[12px] font-medium", textMuted)}>Loading folders…</span>
            ) : (
              <>
                {currentFolderId === null ? (
                  <span className={cn("text-[12px] font-medium px-1 py-0.5 truncate max-w-[160px] opacity-60", textMuted)}>
                    {rootLabel}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigateTo(null)}
                    className={cn("text-[12px] font-medium cursor-pointer border-none bg-transparent px-1 py-0.5 rounded transition-colors truncate max-w-[160px]", textMuted, "hover:text-brand")}
                  >
                    {rootLabel}
                  </button>
                )}
                {breadcrumb.map((f) => (
                  <span key={f.id} className="flex items-center gap-1">
                    <ChevronRight size={12} className={textMuted} />
                    <button
                      type="button"
                      onClick={() => navigateTo(f.id)}
                      className={cn(
                        "text-[12px] font-medium cursor-pointer border-none bg-transparent px-1 py-0.5 rounded transition-colors truncate max-w-[140px]",
                        f.id === currentFolderId ? textPrimary : cn(textMuted, "hover:text-brand")
                      )}
                    >
                      {f.name}
                    </button>
                  </span>
                ))}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => openNewFolderModal(currentFolderId)}
            disabled={loading}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md cursor-pointer border-none transition-colors text-brand hover:bg-brand/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FolderPlus size={12} /> New folder
          </button>
          {currentFolderId !== null && (
            <>
              <div className={cn("flex items-center gap-0.5 p-0.5 rounded-md", isDark ? "bg-white/[0.04]" : "bg-slate-100")}>
                <IconTip label="Grid view">
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    aria-label="Grid view"
                    className={cn("p-2 rounded cursor-pointer border-none transition-colors", viewMode === "grid" ? "bg-brand/15 text-brand" : cn("bg-transparent", textMuted))}
                  >
                    <Grid3x3 size={13} />
                  </button>
                </IconTip>
                <IconTip label="List view">
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    aria-label="List view"
                    className={cn("p-2 rounded cursor-pointer border-none transition-colors", viewMode === "list" ? "bg-brand/15 text-brand" : cn("bg-transparent", textMuted))}
                  >
                    <LayoutList size={13} />
                  </button>
                </IconTip>
              </div>
              {uploadInput}
            </>
          )}
        </div>
      )}

      {selectedIds.size > 0 && bulkSharePanelOpen && (
        <div className={cn("flex flex-col gap-2 px-2.5 py-2 rounded-lg mb-2 border", isDark ? "bg-white/[0.02] border-white/[0.06]" : "bg-slate-50 border-slate-100")}>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setBulkRoles([])}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer transition-colors",
                bulkRoles.length === 0 ? "bg-brand text-white border-brand" : "bg-transparent text-slate-500 border-slate-200 hover:border-slate-300"
              )}
            >
              All
            </button>
            {ASSET_ROLE_OPTIONS.map((role) => {
              const active = bulkRoles.includes(role.value);
              return (
                <button
                  key={role.value}
                  type="button"
                  onClick={() => setBulkRoles((prev) => (active ? prev.filter((r) => r !== role.value) : [...prev, role.value]))}
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
          {renderPersonPicker(
            bulkUserIds,
            (personId) => setBulkUserIds((prev) => [...prev, personId]),
            (personId) => setBulkUserIds((prev) => prev.filter((id) => id !== personId)),
            bulkPersonSearch, setBulkPersonSearch, bulkPersonDropdownOpen, setBulkPersonDropdownOpen
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={runBulkShare}
              disabled={bulkBusy}
              className="text-[11.5px] font-medium px-2.5 py-1 rounded-md cursor-pointer border-none bg-brand text-white disabled:opacity-60"
            >
              Apply to {selectedIds.size} file{selectedIds.size === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}

      {uploadError && <p className="text-[11.5px] text-red-500 mb-1.5">{uploadError}</p>}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2" aria-label="Loading folders and files">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={cn("h-11 rounded-lg animate-pulse motion-reduce:animate-none", isDark ? "bg-white/[0.04]" : "bg-slate-100")} />
          ))}
        </div>
      ) : (
        <>
      {childFolders.length === 0 && filesHere.length === 0 && (
        <div className={cn("text-[12.5px] py-8 text-center", textMuted)}>
          {currentFolderId === null ? "No folders yet." : "This folder is empty."}
        </div>
      )}

      {childFolders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-3">
          {childFolders.map((folder) => {
            const isEmpty = childrenOf(folder.id).length === 0 && !assets.some((a) => a.folder_id === folder.id);
            const deleteDisabled = folder.is_system || !isEmpty || deletingFolderId === folder.id;
            const deleteTitle = folder.is_system ? "System folders can't be deleted" : !isEmpty ? "Folder is not empty" : "Delete";
            return (
              <div key={folder.id} className="flex flex-col">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => navigateTo(folder.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer border-none text-left transition-colors",
                      isDark ? "bg-white/[0.03] hover:bg-white/[0.07]" : "bg-slate-50 hover:bg-slate-100"
                    )}
                  >
                    <Folder size={18} className="text-brand shrink-0" fill="currentColor" fillOpacity={0.18} />
                    <span className={cn("text-[12px] font-medium truncate flex-1", textPrimary)}>{folder.name}</span>
                  </button>
                  <IconTip label="Actions">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setOpenFolderMenuId((id) => (id === folder.id ? null : folder.id)); }}
                      aria-label={`Actions for ${folder.name}`}
                      className={cn("absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-md cursor-pointer border-none transition-colors", textMuted, isDark ? "hover:bg-white/[0.1]" : "hover:bg-slate-200")}
                    >
                      <MoreVertical size={13} />
                    </button>
                  </IconTip>
                  {openFolderMenuId === folder.id && (
                    <div className={cn("absolute right-1 top-full mt-1 z-20 w-44 rounded-lg border shadow-lg py-1 flex flex-col", isDark ? "bg-[#171c2c] border-white/[0.08]" : "bg-white border-slate-200")}>
                      <button
                        type="button"
                        onClick={() => { setOpenFolderMenuId(null); openNewFolderModal(folder.id); }}
                        className={cn("flex items-center gap-2 px-3 py-1.5 text-[12px] text-left w-full cursor-pointer border-none bg-transparent", textPrimary, isDark ? "hover:bg-white/[0.06]" : "hover:bg-slate-50")}
                      >
                        <FolderPlus size={13} /> New sub-folder
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenFolderMenuId(null);
                          setFolderPersonSearch("");
                          setFolderPersonDropdownOpen(false);
                          setFolderPermissionsOpenId((id) => (id === folder.id ? null : folder.id));
                        }}
                        disabled={folderPermissionsUpdatingId === folder.id}
                        className={cn("flex items-center gap-2 px-3 py-1.5 text-[12px] text-left w-full cursor-pointer border-none bg-transparent disabled:opacity-50", textPrimary, isDark ? "hover:bg-white/[0.06]" : "hover:bg-slate-50")}
                      >
                        <Lock size={13} /> Permissions
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenFolderMenuId(null); openRenameModal("folder", folder.id, folder.name); }}
                        disabled={renamingFolderId === folder.id}
                        className={cn("flex items-center gap-2 px-3 py-1.5 text-[12px] text-left w-full cursor-pointer border-none bg-transparent disabled:opacity-50", textPrimary, isDark ? "hover:bg-white/[0.06]" : "hover:bg-slate-50")}
                      >
                        <Pencil size={13} /> Rename
                      </button>
                      <IconTip label={deleteTitle}>
                        <button
                          type="button"
                          onClick={() => { setOpenFolderMenuId(null); onDeleteFolder(folder.id); }}
                          disabled={deleteDisabled}
                          className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-left w-full cursor-pointer border-none bg-transparent text-red-500 hover:bg-red-500/10 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </IconTip>
                    </div>
                  )}
                </div>
                {folderPermissionsOpenId === folder.id && renderFolderPermissionsPanel(folder)}
              </div>
            );
          })}
        </div>
      )}

      {filesHere.length > 0 && (
        viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {filesHere.map((f) => {
              const { roleRestricted, restricted, permissionBadge } = getPermissionInfo(f);
              return (
                <div key={f.id} className="flex flex-col">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => toggleSelect(f.id)}
                      aria-pressed={selectedIds.has(f.id)}
                      aria-label={`Select ${f.file_name}`}
                      className={cn(
                        "w-full text-left rounded-lg overflow-hidden cursor-pointer border-none transition-colors",
                        selectedIds.has(f.id) ? (isDark ? "bg-brand/20" : "bg-brand/10") : (isDark ? "bg-white/[0.03] hover:bg-white/[0.06]" : "bg-slate-50 hover:bg-slate-100")
                      )}
                    >
                      <div className="flex items-center gap-1.5 pl-2 pr-7 py-1.5">
                        <FileText size={14} className="text-brand shrink-0" />
                        <span className={cn("text-[11px] font-medium truncate flex-1", textPrimary)}>{f.file_name}</span>
                      </div>
                      <div className={cn("flex items-center justify-center h-20 mx-2 mb-2 rounded-md", isDark ? "bg-white/[0.02]" : "bg-white")}>
                        <FileText size={28} className={textMuted} />
                      </div>
                      <div className="flex items-center justify-between px-2 pb-2">
                        <span className={cn("text-[9.5px]", textMuted)}>{formatFileSize(f.file_size)}</span>
                        <span className={cn(
                          "text-[9px] rounded-full px-1.5 py-0.5 whitespace-nowrap",
                          restricted ? (isDark ? "bg-amber-500/15 text-amber-400" : "bg-amber-50 text-amber-700") : (isDark ? "bg-white/[0.06] text-slate-400" : "bg-slate-100 text-slate-500")
                        )}>
                          {permissionBadge}
                        </span>
                      </div>
                    </button>
                    <div className="absolute top-1.5 right-1">{fileMenu(f)}</div>
                  </div>
                  {permissionsOpenId === f.id && renderPermissionsPanel(f, roleRestricted)}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filesHere.map((f) => {
              const { roleRestricted, restricted, permissionBadge } = getPermissionInfo(f);
              return (
                <div key={f.id} className="flex flex-col">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => toggleSelect(f.id)}
                      aria-pressed={selectedIds.has(f.id)}
                      aria-label={`Select ${f.file_name}`}
                      className={cn(
                        "w-full flex items-center gap-2 pl-2.5 pr-9 py-2 rounded-lg text-left cursor-pointer border-none transition-colors",
                        selectedIds.has(f.id) ? (isDark ? "bg-brand/20" : "bg-brand/10") : (isDark ? "bg-white/[0.03] hover:bg-white/[0.06]" : "bg-slate-50 hover:bg-slate-100")
                      )}
                    >
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
                    </button>
                    <div className="absolute right-1 top-1/2 -translate-y-1/2">{fileMenu(f)}</div>
                  </div>
                  {permissionsOpenId === f.id && renderPermissionsPanel(f, roleRestricted)}
                </div>
              );
            })}
          </div>
        )
      )}
        </>
      )}

      {newFolderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setNewFolderModalOpen(false)}>
          <div className={cn("w-full max-w-sm rounded-xl shadow-xl p-4", isDark ? "bg-[#121726] border border-white/[0.08]" : "bg-white border border-slate-200")} onClick={(e) => e.stopPropagation()}>
            <div className={cn("text-[13px] font-semibold mb-2", textPrimary)}>New folder</div>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => { setNewFolderName(e.target.value); setNewFolderError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") submitNewFolder(); }}
              placeholder="Folder name"
              className={cn(
                "w-full text-sm rounded-[9px] px-3 py-2 border-[1.5px] outline-none transition-colors font-[inherit] mb-2",
                isDark ? "bg-transparent border-white/[0.12] text-slate-200 placeholder:text-slate-500 focus:border-brand" : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-500 focus:border-brand"
              )}
            />
            {newFolderError && <p className="text-[11.5px] text-red-500 mb-2">{newFolderError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setNewFolderModalOpen(false)} className={cn("text-[12px] font-medium px-3 py-1.5 rounded-md cursor-pointer border-none bg-transparent", textMuted)}>
                Cancel
              </button>
              <button type="button" onClick={submitNewFolder} disabled={creatingFolder} className="text-[12px] font-medium px-3 py-1.5 rounded-md cursor-pointer border-none bg-brand text-white disabled:opacity-60">
                {creatingFolder ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setRenameTarget(null)}>
          <div className={cn("w-full max-w-sm rounded-xl shadow-xl p-4", isDark ? "bg-[#121726] border border-white/[0.08]" : "bg-white border border-slate-200")} onClick={(e) => e.stopPropagation()}>
            <div className={cn("text-[13px] font-semibold mb-2", textPrimary)}>Rename {renameTarget.kind === "folder" ? "folder" : "file"}</div>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => { setRenameValue(e.target.value); setRenameError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") submitRename(); }}
              placeholder={renameTarget.kind === "folder" ? "Folder name" : "File name"}
              className={cn(
                "w-full text-sm rounded-[9px] px-3 py-2 border-[1.5px] outline-none transition-colors font-[inherit] mb-2",
                isDark ? "bg-transparent border-white/[0.12] text-slate-200 placeholder:text-slate-500 focus:border-brand" : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-500 focus:border-brand"
              )}
            />
            {renameError && <p className="text-[11.5px] text-red-500 mb-2">{renameError}</p>}
            {(() => {
              const renameBusy = renameTarget.kind === "folder" ? renamingFolderId === renameTarget.id : renamingAssetId === renameTarget.id;
              return (
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setRenameTarget(null)} className={cn("text-[12px] font-medium px-3 py-1.5 rounded-md cursor-pointer border-none bg-transparent", textMuted)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitRename}
                    disabled={renameBusy}
                    className="text-[12px] font-medium px-3 py-1.5 rounded-md cursor-pointer border-none bg-brand text-white disabled:opacity-60"
                  >
                    {renameBusy ? "Saving…" : "Save"}
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {moveModalAssetIds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setMoveModalAssetIds(null)}>
          <div className={cn("w-full max-w-sm rounded-xl shadow-xl p-4 max-h-[70vh] overflow-y-auto", isDark ? "bg-[#121726] border border-white/[0.08]" : "bg-white border border-slate-200")} onClick={(e) => e.stopPropagation()}>
            <div className={cn("text-[13px] font-semibold mb-2", textPrimary)}>
              Move {moveModalAssetIds.length} file{moveModalAssetIds.length === 1 ? "" : "s"} to…
            </div>
            <div className="flex flex-col gap-0.5">
              {folderTreeFlat.map(({ folder, depth }) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => runMove(folder.id)}
                  disabled={bulkBusy}
                  style={{ paddingLeft: `${8 + depth * 16}px` }}
                  className={cn("flex items-center gap-1.5 py-1.5 pr-2 rounded-md text-left cursor-pointer border-none bg-transparent transition-colors disabled:opacity-50", textPrimary, isDark ? "hover:bg-white/[0.06]" : "hover:bg-slate-50")}
                >
                  <Folder size={13} className="text-brand shrink-0" />
                  <span className="text-[12px] truncate">{folder.name}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end mt-2">
              <button type="button" onClick={() => setMoveModalAssetIds(null)} className={cn("text-[12px] font-medium px-3 py-1.5 rounded-md cursor-pointer border-none bg-transparent", textMuted)}>
                Cancel
              </button>
            </div>
          </div>
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
      : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-500 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.1)]"
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
          <IconTip label="Close" side="bottom">
            <button type="button" onClick={onClose} aria-label="Close" className={cn("p-2 rounded-md cursor-pointer border-none bg-transparent hover:bg-slate-500/10 transition-colors", textMuted)}>
              <X size={16} />
            </button>
          </IconTip>
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
                    <IconTip label="Sensitive">
                      <div className="flex items-center gap-1 shrink-0">
                        <Switch checked={field.masked} onChange={(v) => setFields((prev) => prev.map((f, j) => (j === i ? { ...f, masked: v } : f)))} label={`Sensitive — ${field.label || "field"}`} />
                      </div>
                    </IconTip>
                    <IconTip label="Remove field">
                      <button
                        type="button"
                        onClick={() => setFields((prev) => prev.filter((_, j) => j !== i))}
                        aria-label="Remove field"
                        className={cn("w-8 h-8 shrink-0 rounded-lg border cursor-pointer bg-transparent leading-none", isDark ? "border-white/[0.1] text-slate-400 hover:text-red-400" : "border-slate-200 text-slate-500 hover:text-red-500")}
                      >
                        ×
                      </button>
                    </IconTip>
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
                    <IconTip label="Remove">
                      <button
                        type="button"
                        onClick={() => setAllowedUserIds((prev) => prev.filter((id) => id !== person.id))}
                        aria-label={`Remove ${person.full_name ?? "person"}`}
                        className="p-2 rounded-full cursor-pointer border-none bg-transparent text-brand hover:bg-brand/20 transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </IconTip>
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
    // scrollbar-light (globals.css) — the app-wide thumb is a translucent white tuned for the
    // Hub's dark surfaces, effectively invisible white-on-white here; without it the overflow
    // was real and scrollable but impossible to see without already knowing to scroll.
    <div className="w-full h-full overflow-auto p-4 bg-white scrollbar-light">
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="file-viewer-title" className={cn(cardCls, "w-full max-w-4xl h-[85vh] shadow-xl overflow-hidden flex flex-col")} onClick={(e) => e.stopPropagation()}>
        <div className={cn("flex items-center justify-between gap-3 px-5 py-3 border-b shrink-0", isDark ? "border-white/[0.08]" : "border-slate-100")}>
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={14} className="text-brand shrink-0" />
            <h2 id="file-viewer-title" className={cn("text-[13.5px] font-semibold truncate", textPrimary)}>{file.file_name}</h2>
          </div>
          <IconTip label="Close" side="bottom">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className={cn("p-2 rounded-md cursor-pointer border-none bg-transparent shrink-0 hover:bg-slate-500/10 transition-colors", textMuted)}
            >
              <X size={18} />
            </button>
          </IconTip>
        </div>
        {/* min-w-0 alongside min-h-0 — without it, this flex-col item's default min-width:auto
            lets a wide child (e.g. CsvFilePreview's table, which has no upper bound on its
            content) stretch the item past the modal's width instead of triggering that child's
            own overflow-auto scrollbar, so the excess columns get silently clipped by the modal
            card's overflow-hidden with no way to reach them. */}
        <div className="flex-1 min-h-0 min-w-0 relative bg-slate-100">
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
  files, uploading, uploadProgress, onFile, onRemove, onView, onEdit, viewingId, isDark, disabled,
}: {
  files: AssetRow[]; uploading: boolean; uploadProgress?: UploadProgressEntry[]; onFile: (file: File) => void; onRemove: (id: string) => void;
  onView: (id: string) => void; onEdit: (asset: AssetRow) => void; viewingId: string | null; isDark: boolean;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";
  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    Array.from(fileList).forEach((f) => onFile(f));
  }

  return (
    <div className="mt-1">
      {!disabled && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files); }}
            className={cn(
              "w-full rounded-lg border-2 border-dashed py-4 text-center cursor-pointer transition-colors disabled:opacity-60",
              isDark
                ? isDragOver ? "border-brand bg-brand/[0.06]" : "border-white/[0.12] bg-white/[0.02] hover:border-brand"
                : isDragOver ? "border-brand bg-brand/[0.04]" : "border-slate-200 bg-slate-50 hover:border-brand"
            )}
          >
            <Upload size={16} className={cn("mx-auto mb-1.5", textMuted)} />
            <div className={cn("text-[11.5px]", textMuted)}>{uploading ? "Uploading…" : <>Drag files here or <span className="text-brand font-medium">click to upload</span></>}</div>
          </button>
        </>
      )}
      {uploadProgress && uploadProgress.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {uploadProgress.map((p) => (
            <div key={p.id} className={cn("flex flex-col gap-1.5 px-2.5 py-2 rounded-lg", isDark ? "bg-white/[0.03]" : "bg-slate-50")}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-brand/10 flex items-center justify-center shrink-0">
                  <FileText size={11} className="text-brand" />
                </div>
                <div className={cn("text-[11.5px] font-medium truncate flex-1", textPrimary)}>{p.name}</div>
                <div className={cn("flex items-center gap-1 text-[10.5px] tabular-nums shrink-0", textMuted)}>
                  {p.finishing ? (
                    <>
                      <Loader2 size={10} className="animate-spin motion-reduce:animate-none" />
                      Finishing…
                    </>
                  ) : (
                    `${p.progress}%`
                  )}
                </div>
              </div>
              <div className={cn("h-1.5 rounded-full overflow-hidden", isDark ? "bg-white/[0.08]" : "bg-slate-200")}>
                <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${p.progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {files.map((f) => (
            <div key={f.id} className={cn("flex items-center gap-2 px-2.5 py-2 rounded-lg", isDark ? "bg-white/[0.03]" : "bg-slate-50")}>
              <div className="w-6 h-6 rounded-md bg-brand/10 flex items-center justify-center shrink-0">
                <FileText size={11} className="text-brand" />
              </div>
              <div className={cn("text-[11.5px] font-medium truncate flex-1", textPrimary)}>{f.file_name}</div>
              <IconTip label="View">
                <button
                  type="button"
                  onClick={() => onView(f.id)}
                  disabled={viewingId === f.id}
                  aria-label={`View ${f.file_name}`}
                  className="shrink-0 p-2 rounded-md cursor-pointer border-none bg-transparent text-brand hover:bg-brand/10 transition-colors disabled:opacity-50"
                >
                  <Eye size={12} />
                </button>
              </IconTip>
              {!disabled && (f.file_mime_type === "text/html" || f.file_mime_type === "text/markdown") && (
                <IconTip label="Edit">
                  <button
                    type="button"
                    onClick={() => onEdit(f)}
                    aria-label={`Edit ${f.file_name}`}
                    className="shrink-0 p-2 rounded-md cursor-pointer border-none bg-transparent text-brand hover:bg-brand/10 transition-colors"
                  >
                    <Pencil size={12} />
                  </button>
                </IconTip>
              )}
              {!disabled && (
                <IconTip label="Remove">
                  <button
                    type="button"
                    onClick={() => onRemove(f.id)}
                    aria-label={`Remove ${f.file_name}`}
                    className="shrink-0 p-2 rounded-md cursor-pointer border-none bg-transparent text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </IconTip>
              )}
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
            <IconTip label="Close" side="bottom">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close editor"
                className={cn("p-2 rounded-md cursor-pointer border-none bg-transparent hover:bg-slate-500/10 transition-colors", textMuted)}
              >
                <X size={18} />
              </button>
            </IconTip>
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
  name, description, status, isDark, toggling, onClick,
}: {
  name: string; description: string; status: string; isDark: boolean; toggling: boolean; onClick?: () => void;
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
