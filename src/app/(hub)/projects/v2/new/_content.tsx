"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Building2,
  User,
  Mail,
  Phone,
  Search,
  Sparkles,
  ExternalLink,
  Copy,
  Layers,
  LayoutGrid,
  Shield,
  ShieldCheck,
  GitBranch,
  Code2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { type Classification, deriveProjectSuffixMulti } from "@/config/customer-phases";
import TypeConfigCard from "./_type-config-card";
import PhasesStep from "./_phases-step";
import {
  PRIMARY_TYPES,
  initTypeCardState,
  phasePlanDraftToInput,
  skipPhaseNumbersFromDraft,
  customPhasesFromDraft,
  defaultPhaseOverridesFromDraft,
  phasePlanValidationErrors,
  programmeDurationError,
  phasePlanEmptyNameErrors,
  emptyNameFieldId,
  scheduledStartError,
  type TypeCardState,
} from "./_new-project-types";

type CustomerMatch = { customer_id: string; company_name: string };
type Step = 1 | 2 | 3 | 4;
// Task 240 — outcome of one type-card's create call, part of a multi-type submission.
type SubmitOutcome = { classification: Classification; projectName: string; status: "success" | "error"; project_id?: string; error?: string };

// Task 244: split the old 3-step wizard's "Project Details" step in two — a dedicated "Phases &
// Deliverables" step now holds the (often long) phase/deliverable/checklist builder, so "Project
// Setup" stays a short, quick-to-scan config form (name, add-on, duration, schedule per type).
const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: "Company & Contact" },
  { id: 2, label: "Project Setup" },
  { id: 3, label: "Phases & Deliverables" },
  { id: 4, label: "Review & Create" },
];

const stepVariants = {
  enter: (d: number) => ({ opacity: 0, x: d * 28 }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: d * -20 }),
};

// Design System v2.0 (DESIGN.md) — classification cards no longer color-code by hue (that
// reused 4 of the 5 phase hues reserved exclusively for the programme's Onboard/Migrate/
// Publish/AI-Visibility/Optimize vocabulary, a direct spec violation — task 183). Icons alone
// now differentiate the six classifications; selection state uses one neutral/blue treatment
// shared by every card, matching Field's own focus styling.
const CLASSIFICATION_ICON: Record<Classification, React.ReactNode> = {
  "StackShift I": <Layers size={20} />,
  "StackShift II": <LayoutGrid size={20} />,
  "StackShift Access": <Shield size={20} />,
  "StackShift Access Plus": <ShieldCheck size={20} />,
  PipelineForge: <GitBranch size={20} />,
  "Discrete Development": <Code2 size={20} />,
};

const CLASSIFICATION_DESC: Record<Classification, string> = {
  "StackShift I": "Standard StackShift build — single site, core CMS setup.",
  "StackShift II": "Expanded StackShift build — multi-section site, deeper migration.",
  "StackShift Access": "StackShift with ongoing managed access & support.",
  "StackShift Access Plus": "StackShift Access with an expanded scope of ongoing work.",
  PipelineForge: "Build automation & deployment pipeline engagement.",
  "Discrete Development": "Custom app — scoped, one-off development work.",
};

// ─── Step indicator ───────────────────────────────────────────────────────────

// Task 244 follow-up: was a flex row where each step's connector shared leftover space with its
// own label column (`flex-1` wrapper, label sized to its own text) — a long label like "Company &
// Contact" left almost no room for its trailing connector while a short one like "Project Setup"
// stretched its connector long, so the 4 connector segments ended up wildly uneven widths. A CSS
// grid with dedicated `1fr` connector columns (separate from the `auto`-sized circle/label
// columns) makes every connector segment equal width regardless of label length.
function StepIndicator({ current }: { current: Step }) {
  const gridTemplateColumns = STEPS.map((_, i) => (i < STEPS.length - 1 ? "auto 1fr" : "auto")).join(" ");
  return (
    <div className="mb-10 grid items-start" style={{ gridTemplateColumns }}>
      {STEPS.map((step, i) => {
        const done = step.id < current;
        const active = step.id === current;
        return (
          <Fragment key={step.id}>
            <div className="flex flex-col items-center gap-2 px-1">
              <motion.div
                animate={{
                  background: done || active ? "#007BFF" : "#EDF0F7",
                  boxShadow: active ? "0 0 0 4px rgba(0,123,255,0.15)" : "0 0 0 0 rgba(0,123,255,0)",
                }}
                transition={{ duration: 0.25 }}
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full"
              >
                {done ? (
                  <Check size={15} color="#FFFFFF" strokeWidth={2.5} />
                ) : (
                  <span className={cn("text-sm font-bold", active ? "text-white" : "text-[#5F6A88]")}>{step.id}</span>
                )}
              </motion.div>
              <span
                className={cn(
                  "whitespace-nowrap text-[11px]",
                  active ? "font-semibold text-[#0B1533]" : done ? "font-normal text-[#007BFF]" : "font-normal text-[#5F6A88]"
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <motion.div
                animate={{ background: done ? "#007BFF" : "#EDF0F7" }}
                transition={{ duration: 0.4 }}
                className="mt-[17px] h-0.5 min-w-[16px]"
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

// ─── Input field ──────────────────────────────────────────────────────────────

export function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  icon,
  required,
  error,
  disabled,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  required?: boolean;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-center gap-1 text-[13px] font-medium text-[#0B1533]">
        {label}
        {required && <span className="text-[#007BFF]">*</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "peer w-full rounded-[9px] border px-3.5 py-[11px] text-sm text-[#0B1533] outline-none transition-colors duration-150",
            icon && "pl-[38px]",
            disabled
              ? "cursor-not-allowed border-[#E2E7F2] bg-[#EDF0F7] text-[#5F6A88]"
              : error
                ? "border-[#C0392B] bg-white shadow-[0_0_0_3px_rgba(192,57,43,0.08)]"
                : "border-[#E2E7F2] bg-[#F4F6FB] focus:border-[#007BFF] focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,123,255,0.14)]"
          )}
        />
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5F6A88] transition-colors peer-focus:text-[#007BFF]">
            {icon}
          </span>
        )}
      </div>
      {error && <span className="text-xs text-[#C0392B]">{error}</span>}
    </div>
  );
}

// ─── Classification card ──────────────────────────────────────────────────────
// DESIGN.md: phase hues are reserved for the programme's 5 phases only. A single
// neutral/blue selection treatment (matching Field's own focus styling) replaces the old
// per-classification rainbow — icons alone differentiate cards now (task 183).

function ClassificationCard({
  classification,
  selected,
  onSelect,
}: {
  classification: Classification;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "relative w-full cursor-pointer rounded-xl border p-4 text-left transition-colors",
        selected
          ? "border-[#007BFF] bg-[#F0F7FF] shadow-[0_0_0_3px_rgba(0,123,255,0.09)]"
          : "border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] hover:border-[#A8C6F5]"
      )}
    >
      {selected && (
        <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#007BFF]">
          <Check size={11} color="#FFFFFF" strokeWidth={2.5} />
        </div>
      )}

      <div
        className={cn(
          "mb-2.5 flex h-10 w-10 items-center justify-center rounded-[11px] transition-colors",
          selected ? "bg-[#E5F1FF] text-[#0063D6]" : "bg-[#EDF0F7] text-[#5F6A88]"
        )}
      >
        {CLASSIFICATION_ICON[classification]}
      </div>

      <div className={cn("mb-1 text-sm font-bold", selected ? "text-[#0063D6]" : "text-[#0B1533]")}>{classification}</div>
      <div className="text-xs leading-relaxed text-[#5F6A88]">{CLASSIFICATION_DESC[classification]}</div>
    </button>
  );
}

// ─── Review row ───────────────────────────────────────────────────────────────

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-2.5">
      <span className="text-xs text-[#5F6A88]">{label}</span>
      <span className={cn("text-[13px] font-medium text-[#0B1533]", mono && "font-mono text-xs")}>{value}</span>
    </div>
  );
}

// ─── Success / results screen ──────────────────────────────────────────────────
// Task 240: a submission can create several projects at once (one per selected type). This
// lists every outcome — successes with a "View" link each, failures with the error and a single
// "Retry failed" action that re-runs only the failed types (already-created projects are real,
// independently valid, and are never rolled back or re-submitted).

function SuccessScreen({
  results,
  customerId,
  showCustomerId,
  copied,
  onCopy,
  onBack,
  onView,
  onRetry,
  retrying,
}: {
  results: SubmitOutcome[];
  customerId: string;
  showCustomerId: boolean;
  copied: boolean;
  onCopy: () => void;
  onBack: () => void;
  onView: (projectId: string) => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const succeeded = results.filter((r) => r.status === "success");
  const failed = results.filter((r) => r.status === "error");
  const allSucceeded = failed.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="py-4 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 18 }}
        className={cn(
          "mx-auto mb-6 flex h-[72px] w-[72px] items-center justify-center rounded-full shadow-[0_4px_16px_rgba(23,126,72,0.28)]",
          allSucceeded ? "bg-[#177E48]" : "bg-[#FB914E]"
        )}
      >
        {allSucceeded ? <Check size={34} color="#FFFFFF" strokeWidth={2.5} /> : <AlertTriangle size={32} color="#FFFFFF" strokeWidth={2.5} />}
      </motion.div>

      <h2 className="font-heading mb-1.5 text-2xl font-bold tracking-[-0.025em] text-[#0B1533]">
        {allSucceeded
          ? succeeded.length === 1
            ? `${succeeded[0].projectName} is ready`
            : `${succeeded.length} projects are ready`
          : `${succeeded.length} of ${results.length} projects created`}
      </h2>
      <p className="mb-7 text-sm leading-relaxed text-[#5F6A88]">
        {allSucceeded
          ? "Created successfully and added to the onboarding queue."
          : "Some types failed to create — the ones below succeeded and are safe; retry the rest."}
      </p>

      {showCustomerId && customerId && (
        <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-[#E2E7F2] bg-[#F4F6FB] px-3.5 py-3 text-left">
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#5F6A88]">Customer ID</div>
            <span className="font-mono text-xs text-[#0B1533]">{customerId}</span>
          </div>
          <button
            type="button"
            onClick={onCopy}
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              copied ? "border-[#BEE7CD] bg-[#E3F5EA] text-[#177E48]" : "border-[#E2E7F2] bg-white text-[#3A4565]"
            )}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      <div className="mb-5 divide-y divide-[#EDF0F7] rounded-[10px] border border-[#E2E7F2] text-left">
        {results.map((r) => (
          <div key={r.classification} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-[#0B1533]">{r.projectName}</div>
              <div className="text-[11px] text-[#5F6A88]">
                {r.classification}
                {r.status === "error" && <span className="text-[#C0392B]"> — {r.error}</span>}
              </div>
            </div>
            {r.status === "success" && r.project_id ? (
              <button
                type="button"
                onClick={() => onView(r.project_id!)}
                className="flex shrink-0 cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-xs font-semibold text-[#007BFF] transition-colors hover:text-[#0063D6]"
              >
                View <ExternalLink size={11} />
              </button>
            ) : (
              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[#C0392B]">
                <AlertTriangle size={11} /> Failed
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 cursor-pointer rounded-full border border-[#E2E7F2] bg-white px-4 py-[11px] text-[13px] font-medium text-[#3A4565] transition-colors hover:border-[#A8C6F5] hover:text-[#0B1533]"
        >
          Back to projects
        </button>
        {allSucceeded ? (
          succeeded.length === 1 && succeeded[0].project_id ? (
            <button
              type="button"
              onClick={() => onView(succeeded[0].project_id!)}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border-none bg-[#007BFF] px-4 py-[11px] text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(0,123,255,0.3)] transition-colors hover:bg-[#0063D6]"
            >
              View project <ExternalLink size={13} />
            </button>
          ) : null
        ) : (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border-none bg-[#FB914E] px-4 py-[11px] text-[13px] font-semibold text-[#471F02] shadow-[0_2px_8px_rgba(251,145,78,0.3)] transition-colors hover:bg-[#E2762F] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {retrying ? "Retrying…" : <><RefreshCw size={13} /> Retry failed ({failed.length})</>}
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function NewProjectWizard({ role }: { role: string | null }) {
  // Mirrors _onboarding-detail.tsx's canManagePhases exactly — jumping straight to a later
  // phase is an admin/super_admin/marketing action there too, deliberately excluding pm.
  const canManagePhases = role !== "pm" && role !== "developer";
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState<1 | -1>(1);

  const [companyMode, setCompanyMode] = useState<"new" | "existing">("new");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [existingSearch, setExistingSearch] = useState("");
  const [existingMatches, setExistingMatches] = useState<CustomerMatch[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerMatch | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Task 195: `submitting` state alone is an async, best-effort re-entrancy guard — a second
  // click can still fire before React re-renders `disabled`. This ref is checked/set
  // synchronously, before any await, so a rapid double-invoke of runSubmission() can't send two
  // overlapping requests.
  const submitLockRef = useRef(false);

  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactLoading, setContactLoading] = useState(false);
  const [errors1, setErrors1] = useState<Record<string, string>>({});
  const [validatingStep, setValidatingStep] = useState(false);

  // Task 240: the 5 primary types are independently multi-selectable — each selected type gets
  // its own TypeCardState (name/duration/phase-plan/PipelineForge-addon), and submitting creates
  // one project per selected type. PipelineForge itself is never a member of `selectedTypes` — it
  // only ever exists as a per-card `pipelineforgeAddon` flag.
  const [selectedTypes, setSelectedTypes] = useState<Classification[]>([]);
  const [classificationError, setClassificationError] = useState("");
  const [cardsByType, setCardsByType] = useState<Partial<Record<Classification, TypeCardState>>>({});
  // Task 249 (Requirement D) — step 3 -> 4 transition guard's error message, keyed by nothing in
  // particular (only one message shown at a time, for the first invalid card found).
  const [phasesStepError, setPhasesStepError] = useState("");

  // Scheduling bounds: no scheduling into the past, and no more than a year out. Task 244: shared
  // by every card's own DateTimePicker now (was a single wizard-level scheduledAt/scheduleExpanded
  // pair applied uniformly to the whole submission before this task).
  const { scheduleMin, scheduleMax } = useMemo(() => {
    const now = new Date();
    const oneYearOut = new Date(now);
    oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
    return { scheduleMin: now, scheduleMax: oneYearOut };
  }, []);

  // Task 240: no more "at most one StackShift variant" swap rule — any number of the 5 primary
  // types can be selected simultaneously, each an independent tracker with its own card.
  // `selectedTypes` is read directly (not via a functional updater) since this only ever runs
  // synchronously from a click handler — React state updaters must stay pure, so the two setState
  // calls below are siblings, not one nested inside the other's updater.
  function toggleType(c: Classification) {
    if (selectedTypes.includes(c)) {
      setSelectedTypes((prev) => prev.filter((x) => x !== c));
      setCardsByType((cards) => {
        const next = { ...cards };
        delete next[c];
        return next;
      });
    } else {
      setSelectedTypes((prev) => [...prev, c]);
      setCardsByType((cards) => ({ ...cards, [c]: initTypeCardState(c) }));
    }
    setClassificationError("");
  }

  function updateCard(c: Classification, next: TypeCardState) {
    setCardsByType((cards) => ({ ...cards, [c]: next }));
  }

  // Task 244: no longer a single global action kind — each card's own `startMode` decides its
  // request's `mode`, so "in flight" is now just a boolean across the whole submission loop.
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResults, setSubmitResults] = useState<SubmitOutcome[] | null>(null);
  const [resolvedCustomerId, setResolvedCustomerId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const companyName = companyMode === "existing" ? selectedCustomer?.company_name ?? "" : newCompanyName;
  // Derived at render time, not synced via effect — task 123 hit react-hooks/set-state-in-effect
  // doing this the naive way; this form must not regress it.
  function displayedNameForCard(classification: Classification, card: TypeCardState): string {
    if (card.projectNameTouched || !companyName.trim()) return card.projectName;
    const suffixTypes: Classification[] = [classification, ...(card.pipelineforgeAddon ? (["PipelineForge"] as Classification[]) : [])];
    return `${companyName.trim()} ${deriveProjectSuffixMulti(suffixTypes)}`;
  }

  function handleSearchChange(value: string) {
    setExistingSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!value.trim()) {
        setExistingMatches([]);
        return;
      }
      setSearching(true);
      fetch(`/api/customers?search=${encodeURIComponent(value.trim())}&limit=8`)
        .then((r) => r.json())
        .then((data: unknown) => {
          const rows = Array.isArray(data) ? data : [];
          setExistingMatches(rows.map((c: { customer_id: string; company_name: string }) => ({ customer_id: c.customer_id, company_name: c.company_name })));
        })
        .catch(() => setExistingMatches([]))
        .finally(() => setSearching(false));
    }, 300);
  }

  // Task 244 follow-up: scrolls the first invalid field into view and focuses it after a
  // validation failure, instead of leaving the PM to spot a small red error string unassisted.
  // Wrapped in requestAnimationFrame — the id being targeted may belong to an element whose error
  // state (and therefore visibility, e.g. a newly-expanded Step 3 section) was just set via
  // setState in this same tick, so the DOM needs a frame to catch up before scrollIntoView/focus.
  // Chat follow-up: accepts a fallback chain of ids, not just one — an empty phase/deliverable/
  // checklist-item name can be nested inside a collapsed phase or type section (both default open,
  // but either can be collapsed by the PM before hitting Continue), so the exact field might not
  // be in the DOM. Scrolls to the first candidate that's actually rendered, falling back outward
  // (offending phase's own container, then the whole type section) so the PM always lands
  // somewhere useful instead of the call silently doing nothing.
  function scrollToField(id: string | string[]) {
    const candidates = Array.isArray(id) ? id : [id];
    requestAnimationFrame(() => {
      for (const candidateId of candidates) {
        const el = document.getElementById(candidateId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.focus({ preventScroll: true });
          return;
        }
      }
    });
  }

  async function goNext() {
    if (step === 1) {
      const errs: Record<string, string> = {};
      if (companyMode === "new" && !newCompanyName.trim()) errs.companyName = "Company name is required.";
      if (companyMode === "existing" && !selectedCustomer) errs.companyName = "Select an existing company.";
      if (contactEmail.trim() && !/^\S+@\S+\.\S+$/.test(contactEmail)) errs.contactEmail = "Enter a valid email address.";
      if (Object.keys(errs).length) {
        setErrors1(errs);
        scrollToField(errs.companyName ? "company-name" : "contact-email");
        return;
      }
      setErrors1({});

      if (companyMode === "new") {
        setValidatingStep(true);
        try {
          const res = await fetch(`/api/customers/check-name?name=${encodeURIComponent(newCompanyName.trim())}`);
          const data = await res.json().catch(() => ({}));
          if (data.exists) {
            setErrors1({ companyName: "A company with this name already exists." });
            scrollToField("company-name");
            return;
          }
        } finally {
          setValidatingStep(false);
        }
      }
    }
    if (step === 2) {
      if (selectedTypes.length === 0) {
        setClassificationError("Select at least one classification.");
        scrollToField("classification-grid");
        return;
      }
      setClassificationError("");

      // Per-card name validation: required, and unique across every card in this submission
      // (they'll be created as N separate projects in one go — a repeated name would collide at
      // the API's own uniqueness check anyway, but catching it here gives a clearer per-card error).
      const names = selectedTypes.map((t) => displayedNameForCard(t, cardsByType[t]!).trim());
      const errorsByType = new Map<Classification, string>();
      selectedTypes.forEach((t, i) => {
        if (!names[i]) errorsByType.set(t, "Project name is required.");
      });
      selectedTypes.forEach((t, i) => {
        if (errorsByType.has(t)) return;
        const dupIndex = names.findIndex((n, j) => j !== i && n.toLowerCase() === names[i].toLowerCase());
        if (dupIndex !== -1) errorsByType.set(t, "Project names must be unique across the types you're creating.");
      });
      if (errorsByType.size > 0) {
        setCardsByType((prev) => {
          const next = { ...prev };
          for (const [t, message] of errorsByType) next[t] = { ...next[t]!, projectNameError: message };
          return next;
        });
        const firstErrored = selectedTypes.find((t) => errorsByType.has(t));
        if (firstErrored) scrollToField(`project-name-${firstErrored}`);
        return;
      }

      setValidatingStep(true);
      try {
        const checks = await Promise.all(
          selectedTypes.map(async (t, i) => {
            const res = await fetch(`/api/onboarding/projects/check-name?name=${encodeURIComponent(names[i])}`);
            const data = await res.json().catch(() => ({}));
            return { t, exists: !!data.exists };
          })
        );
        const existing = checks.filter((c) => c.exists);
        if (existing.length > 0) {
          setCardsByType((prev) => {
            const next = { ...prev };
            for (const { t } of existing) next[t] = { ...next[t]!, projectNameError: "A project with this name already exists." };
            return next;
          });
          const firstExisting = selectedTypes.find((t) => existing.some((e) => e.t === t));
          if (firstExisting) scrollToField(`project-name-${firstExisting}`);
          return;
        }
      } finally {
        setValidatingStep(false);
      }
    }
    if (step === 3) {
      // Task 249 (Requirement D) + chat follow-up: blocks progression on, per type in display
      // order, the first of (a) an invalid day range (dayEnd < dayStart, a phase span shorter than
      // its own deliverable count, or any phase's day range running past the card's own Programme
      // duration — including the reciprocal case where the duration field itself was set shorter
      // than the last phase's target day) or (b) an empty phase/deliverable/checklist-item name —
      // both would otherwise submit silently wrong/dropped rather than surfaced to the PM
      // (phasePlanDraftToInput, defaultPhaseOverridesFromDraft, and customPhasesFromDraft all just
      // skip blank rows).
      for (const t of selectedTypes) {
        const card = cardsByType[t]!;
        const usesFixedPhases = t === "StackShift I" || (t === "StackShift II" && card.useDefaultPhases);
        const mode: "fixed-phases" | "free-form" = usesFixedPhases ? "fixed-phases" : "free-form";

        if (
          usesFixedPhases &&
          (phasePlanValidationErrors(card.phasePlan, card.durationDays).size > 0 ||
            programmeDurationError(card.phasePlan, card.durationDays) != null)
        ) {
          setPhasesStepError(`Fix the day-range errors for ${t} before continuing.`);
          scrollToField(`phases-step-${t}`);
          return;
        }

        const nameErrors = phasePlanEmptyNameErrors(card.phasePlan, mode);
        if (nameErrors.size > 0) {
          const [firstId, firstError] = nameErrors.entries().next().value!;
          setPhasesStepError(`Fix the empty name${nameErrors.size === 1 ? "" : "s"} for ${t} before continuing.`);
          scrollToField([emptyNameFieldId(firstId, firstError.kind), `phase-${firstError.phaseId}`, `phases-step-${t}`]);
          return;
        }

        // Task 251: a card set to "Scheduled" with no date picked (or a picked moment already in
        // the past) previously only surfaced at the Review step's submit-time banner — now blocked
        // here too, same pattern as the day-range/empty-name checks above.
        if (scheduledStartError(card.startMode, card.scheduledStartAt, scheduleMin)) {
          setPhasesStepError(`Fix the scheduled start for ${t} before continuing.`);
          scrollToField([`schedule-${t}`, `phases-step-${t}`]);
          return;
        }
      }
      setPhasesStepError("");
    }
    setDirection(1);
    setStep((s) => (s + 1) as Step);
  }

  function goBack() {
    if (step === 1) {
      router.push(V2_ROUTES.PROJECTS_V2);
      return;
    }
    setDirection(-1);
    setStep((s) => (s - 1) as Step);
  }

  // Task 244: `mode`/`scheduled_start_at`/`start_phase` are now derived entirely from the card
  // itself (its own `startMode`/`scheduledStartAt`/`startPhase`) instead of being passed in from a
  // single wizard-level action shared by the whole submission.
  function buildCreatePayload(
    classification: Classification,
    card: TypeCardState,
    customerId: string | null,
    projectName: string,
    mode: "save" | "save_scheduled" | "start"
  ) {
    const isStackShiftI = classification === "StackShift I";
    // Task 246 (Requirement G): StackShift II opts into the same customer_phases engine StackShift
    // I always uses by checking "Generate default phases" — every other card (including StackShift
    // II with that checkbox off) stays on the generic phase_plan model, unchanged.
    const isStackShiftII = classification === "StackShift II";
    const usesCustomerPhasesEngine = isStackShiftI || (isStackShiftII && card.useDefaultPhases);
    const cardClassifications: Classification[] = [classification, ...(card.pipelineforgeAddon ? (["PipelineForge"] as Classification[]) : [])];
    const skipPhaseNumbers = usesCustomerPhasesEngine ? skipPhaseNumbersFromDraft(card.phasePlan) : [];
    const customPhases = usesCustomerPhasesEngine ? customPhasesFromDraft(card.phasePlan) : [];
    const defaultPhaseOverrides = usesCustomerPhasesEngine ? defaultPhaseOverridesFromDraft(card.phasePlan) : [];
    return {
      mode,
      scheduled_start_at: mode === "save_scheduled" ? new Date(card.scheduledStartAt).toISOString() : undefined,
      // Carries the "Start at phase" selection through to a scheduled start too, so the
      // auto-start cron seeds the right phase once the scheduled time arrives. Only meaningful
      // for a card on the customer_phases engine — the API rejects start_phase for any other
      // classification's programme_duration_days/phase_plan pairing anyway.
      start_phase: mode === "save_scheduled" && canManagePhases && usesCustomerPhasesEngine ? card.startPhase : undefined,
      // After the first call in a multi-type submission resolves the customer, every subsequent
      // call reuses it — mirrors how `companyMode === "existing"` already works for a single
      // project today, just generalized to N calls.
      customer: customerId
        ? { existing_customer_id: customerId }
        : companyMode === "existing"
          ? { existing_customer_id: selectedCustomer!.customer_id }
          : { company_name: newCompanyName.trim() },
      contact: { name: contactName.trim(), email: contactEmail.trim() || undefined, phone: contactPhone.trim() || undefined },
      classifications: cardClassifications,
      project_name: projectName,
      use_default_phase_engine: isStackShiftII ? card.useDefaultPhases : undefined,
      programme_duration_days: usesCustomerPhasesEngine ? card.durationDays : undefined,
      phase_plan: usesCustomerPhasesEngine ? undefined : phasePlanDraftToInput(card.phasePlan),
      // Task 244 — customer_phases engine only: the default-phase(s) this specific project opts
      // out of. Task 248 persists this on the `projects` row for every mode server-side; task 249
      // fixed this call site to actually SEND it for every mode too (was gated to `mode ===
      // "start"` only, which meant a Draft/Scheduled submission never sent it in the first place —
      // 248's server-side persistence had nothing to read). The jump-to-phase two-step (create +
      // PATCH) relays it separately via runSubmission's own PATCH call below, for the immediate
      // "start at phase N" path.
      skip_phase_numbers: usesCustomerPhasesEngine && skipPhaseNumbers.length > 0 ? skipPhaseNumbers : undefined,
      // Task 246 — customer_phases engine only; same mode-gating fix as skip_phase_numbers above.
      custom_phases: usesCustomerPhasesEngine && customPhases.length > 0 ? customPhases : undefined,
      // Task 249 — customer_phases engine only: PM-edited day ranges for the 5 default phases
      // (and their computed phase 2-5 deliverable sub-ranges), sent for every mode same as the two
      // fields above.
      default_phase_overrides: usesCustomerPhasesEngine && defaultPhaseOverrides.length > 0 ? defaultPhaseOverrides : undefined,
    };
  }

  // Runs one POST per target type, sequentially (not Promise.all — the first call must resolve
  // the customer before the rest can reuse it). A per-card Phase 2-5 jump (StackShift I only,
  // mirrors the Timeline's existing "Jump to phase" override) creates with mode "save" then
  // PATCHes .../programme/phase, same two-step shape the single-project wizard used before this
  // task; every other card just sends its own `startMode`-derived mode outright. A failed type
  // does not roll back or block already-succeeded types — `typesOverride` lets the failed-only
  // retry re-run just those, each with its own already-configured card settings.
  async function runSubmission(typesOverride?: Classification[]) {
    const targets = typesOverride ?? selectedTypes;
    const isValid =
      (companyMode === "new" ? newCompanyName.trim().length > 0 : !!selectedCustomer) &&
      targets.every((t) => displayedNameForCard(t, cardsByType[t]!).trim().length > 0);
    if (!isValid) {
      setSubmitError("Company and project name are required.");
      scrollToField("submit-error");
      return;
    }
    const missingSchedule = targets.filter((t) => cardsByType[t]!.startMode === "scheduled" && !cardsByType[t]!.scheduledStartAt);
    if (missingSchedule.length > 0) {
      setSubmitError(`Pick a schedule date/time for: ${missingSchedule.join(", ")}.`);
      scrollToField("submit-error");
      return;
    }
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    setSubmitError(null);

    let customerId = resolvedCustomerId;
    const priorResults = (submitResults ?? []).filter((r) => !targets.includes(r.classification));
    const newResults: SubmitOutcome[] = [];

    for (const type of targets) {
      const card = cardsByType[type]!;
      const projectName = displayedNameForCard(type, card).trim();
      const usesCustomerPhasesEngine = type === "StackShift I" || (type === "StackShift II" && card.useDefaultPhases);
      const jumpToPhase = usesCustomerPhasesEngine && card.startMode === "now" && card.startPhase !== 1;
      const effectiveMode: "save" | "save_scheduled" | "start" =
        card.startMode === "draft" ? "save" : card.startMode === "scheduled" ? "save_scheduled" : jumpToPhase ? "save" : "start";

      try {
        const res = await fetch("/api/onboarding/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildCreatePayload(type, card, customerId, projectName, effectiveMode)),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          newResults.push({ classification: type, projectName, status: "error", error: d.error ?? "Failed to create project" });
          continue;
        }
        const data = (await res.json()) as { project_id: string; customer_id: string };
        if (!customerId) customerId = data.customer_id;

        if (jumpToPhase) {
          const skipPhaseNumbers = skipPhaseNumbersFromDraft(card.phasePlan);
          const customPhases = customPhasesFromDraft(card.phasePlan);
          // Task 249: relayed the same way skip_phase_numbers/custom_phases already are — a PM
          // who both edited a default phase's day range and chose "Start at phase N" at intake
          // shouldn't lose the day-range edit on this two-step (create + PATCH) path.
          const defaultPhaseOverrides = defaultPhaseOverridesFromDraft(card.phasePlan);
          const phaseRes = await fetch(`/api/projects/${data.project_id}/programme/phase`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phase_number: card.startPhase,
              skip_phase_numbers: skipPhaseNumbers.length > 0 ? skipPhaseNumbers : undefined,
              custom_phases: customPhases.length > 0 ? customPhases : undefined,
              default_phase_overrides: defaultPhaseOverrides.length > 0 ? defaultPhaseOverrides : undefined,
            }),
          });
          if (!phaseRes.ok) {
            const d = await phaseRes.json().catch(() => ({}));
            newResults.push({
              classification: type,
              projectName,
              status: "error",
              project_id: data.project_id,
              error: d.error ?? `Project created, but failed to start at Phase ${card.startPhase}.`,
            });
            continue;
          }
        }

        newResults.push({ classification: type, projectName, status: "success", project_id: data.project_id });
      } catch (err) {
        newResults.push({ classification: type, projectName, status: "error", error: err instanceof Error ? err.message : "Failed to create project" });
      }
    }

    setSubmitResults([...priorResults, ...newResults]);
    if (customerId) setResolvedCustomerId(customerId);
    setSubmitting(false);
    submitLockRef.current = false;
  }

  function retryFailed() {
    const failedTypes = (submitResults ?? []).filter((r) => r.status === "error").map((r) => r.classification);
    if (failedTypes.length === 0) return;
    runSubmission(failedTypes);
  }

  function copyCustomerId(id: string) {
    navigator.clipboard.writeText(id).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex min-h-full flex-col items-center bg-[#F4F6FB] px-6 py-10">
      {!submitResults && (
        <div className="mb-2 w-full max-w-[560px]">
          <button
            type="button"
            onClick={goBack}
            className="flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-xs text-[#5F6A88] transition-colors hover:text-[#007BFF]"
          >
            <ArrowLeft size={13} />
            {step === 1 ? "Back to projects" : "Previous step"}
          </button>
        </div>
      )}

      <div className="w-full max-w-[560px] rounded-[14px] border border-[#E2E7F2] bg-white px-10 py-9 shadow-[0_1px_2px_rgba(7,17,51,0.05)]">
        {submitResults ? (
          <SuccessScreen
            results={submitResults}
            customerId={resolvedCustomerId ?? ""}
            showCustomerId={companyMode === "new"}
            copied={copied}
            onCopy={() => copyCustomerId(resolvedCustomerId ?? "")}
            onBack={() => router.push(V2_ROUTES.PROJECTS_V2)}
            // Task 282 (item E) — V2's default landing tab is now Timeline, not Overview.
            onView={(projectId) => router.push(`${V2_ROUTES.PROJECTS_V2}/${projectId}/timeline`)}
            onRetry={retryFailed}
            retrying={!!submitting}
          />
        ) : (
          <>
            <StepIndicator current={step} />

            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                {step === 1 && (
                  <div>
                    <div className="mb-7">
                      <h2 className="font-heading mb-1 text-xl font-bold tracking-[-0.02em] text-[#0B1533]">Company &amp; contact</h2>
                      <p className="text-[13px] text-[#5F6A88]">
                        This will be used to set up the customer&apos;s workspace and this project&apos;s onboarding.
                      </p>
                    </div>

                    <div className="mb-5 flex w-fit items-center gap-1 rounded-lg bg-[#EDF0F7] p-1">
                      {(["new", "existing"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setCompanyMode(m);
                            setErrors1({});
                          }}
                          className={cn(
                            "cursor-pointer rounded-md border-none px-3 py-1.5 text-xs font-medium transition-colors",
                            companyMode === m ? "bg-white text-[#0B1533] shadow-sm" : "bg-transparent text-[#5F6A88] hover:text-[#0B1533]"
                          )}
                        >
                          {m === "new" ? "New company" : "Existing company"}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-col gap-4.5">
                      {companyMode === "new" ? (
                        <Field
                          id="company-name"
                          label="Company name"
                          value={newCompanyName}
                          onChange={(v) => {
                            setNewCompanyName(v);
                            setErrors1((e) => {
                              const n = { ...e };
                              delete n.companyName;
                              return n;
                            });
                          }}
                          placeholder="e.g. Acme Corporation"
                          icon={<Building2 size={15} />}
                          required
                          error={errors1.companyName}
                        />
                      ) : selectedCustomer ? (
                        <div>
                          <label className="mb-1.5 flex items-center gap-1 text-[13px] font-medium text-[#0B1533]">
                            Company <span className="text-[#007BFF]">*</span>
                          </label>
                          <div className="flex items-center justify-between gap-2 rounded-[9px] border border-[#E2E7F2] bg-[#F4F6FB] px-3.5 py-2.5">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-[#0B1533]">{selectedCustomer.company_name}</div>
                              <div className="truncate font-mono text-[11px] text-[#5F6A88]">{selectedCustomer.customer_id}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedCustomer(null)}
                              className="shrink-0 cursor-pointer border-none bg-transparent text-xs font-medium text-[#007BFF]"
                            >
                              Change
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="mb-1.5 flex items-center gap-1 text-[13px] font-medium text-[#0B1533]">
                            Company <span className="text-[#007BFF]">*</span>
                          </label>
                          <div className="relative">
                            <input
                              id="company-name"
                              value={existingSearch}
                              onChange={(e) => handleSearchChange(e.target.value)}
                              placeholder="Search existing customers…"
                              className="w-full rounded-[9px] border border-[#E2E7F2] bg-[#F4F6FB] py-2.75 pl-8.5 pr-3.5 text-sm text-[#0B1533] outline-none transition-colors focus:border-[#007BFF] focus:bg-white"
                            />
                            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5F6A88]" />
                          </div>
                          {existingSearch.trim() && (
                            <div className="mt-1.5 max-h-48 overflow-y-auto rounded-[9px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)]">
                              {searching ? (
                                <div className="px-3.5 py-2.5 text-xs text-[#5F6A88]">Searching…</div>
                              ) : existingMatches.length === 0 ? (
                                <div className="px-3.5 py-2.5 text-xs text-[#5F6A88]">No matches.</div>
                              ) : (
                                existingMatches.map((c) => (
                                  <button
                                    key={c.customer_id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedCustomer(c);
                                      setExistingSearch("");
                                      setExistingMatches([]);
                                      setErrors1((e) => {
                                        const n = { ...e };
                                        delete n.companyName;
                                        delete n.contactName;
                                        delete n.contactEmail;
                                        return n;
                                      });
                                      setContactLoading(true);
                                      fetch(`/api/customers/${c.customer_id}/primary-contact`)
                                        .then((r) => (r.ok ? r.json() : null))
                                        .then((contact: { full_name: string | null; email: string | null; phone: string | null } | null) => {
                                          if (!contact) return;
                                          setContactName(contact.full_name ?? "");
                                          setContactEmail(contact.email ?? "");
                                          setContactPhone(contact.phone ?? "");
                                        })
                                        .catch(() => {})
                                        .finally(() => setContactLoading(false));
                                    }}
                                    className="block w-full cursor-pointer border-none bg-transparent px-3.5 py-2 text-left text-[13px] text-[#0B1533] hover:bg-[#F4F6FB]"
                                  >
                                    {c.company_name} <span className="font-mono text-[11px] text-[#5F6A88]">{c.customer_id}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {companyMode === "existing" && errors1.companyName && (
                        <span className="text-xs text-[#C0392B]">{errors1.companyName}</span>
                      )}

                      <div className="h-px bg-[#EDF0F7]" />

                      <Field
                        id="contact-name"
                        label="Primary contact"
                        value={contactName}
                        onChange={(v) => {
                          setContactName(v);
                          setErrors1((e) => {
                            const n = { ...e };
                            delete n.contactName;
                            return n;
                          });
                        }}
                        placeholder={contactLoading ? "Loading full name…" : "Full name (optional — can also be added during Kickoff)"}
                        icon={<User size={15} />}
                        error={errors1.contactName}
                        disabled={contactLoading}
                      />
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field
                          id="contact-email"
                          label="Contact email"
                          type="email"
                          value={contactEmail}
                          onChange={(v) => {
                            setContactEmail(v);
                            setErrors1((e) => {
                              const n = { ...e };
                              delete n.contactEmail;
                              return n;
                            });
                          }}
                          placeholder={contactLoading ? "Loading email address…" : "contact@company.com"}
                          icon={<Mail size={15} />}
                          error={errors1.contactEmail}
                          disabled={contactLoading}
                        />
                        <Field
                          id="contact-phone"
                          label="Phone"
                          value={contactPhone}
                          onChange={setContactPhone}
                          placeholder={contactLoading ? "Loading phone number…" : "Optional"}
                          icon={<Phone size={15} />}
                          disabled={contactLoading}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div>
                    <div className="mb-6">
                      <h2 className="font-heading mb-1 text-xl font-bold tracking-[-0.02em] text-[#0B1533]">Project setup</h2>
                      <p className="text-[13px] text-[#5F6A88]">
                        Choose one or more engagement types — StackShift I/II, Access, Access Plus, and Discrete Development are
                        distinct trackers, each created as its own project.
                      </p>
                    </div>

                    <div id="classification-grid" className="mb-6 flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-3">
                        {PRIMARY_TYPES.map((c) => (
                          <ClassificationCard key={c} classification={c} selected={selectedTypes.includes(c)} onSelect={() => toggleType(c)} />
                        ))}
                      </div>
                      {classificationError && <span className="text-xs text-[#C0392B]">{classificationError}</span>}
                    </div>

                    {selectedTypes.length > 0 && (
                      <>
                        <div className="mb-6 h-px bg-[#EDF0F7]" />
                        <div className="flex flex-col gap-3.5">
                          {selectedTypes.map((type) => (
                            <TypeConfigCard
                              key={type}
                              classification={type}
                              state={cardsByType[type]!}
                              displayedName={displayedNameForCard(type, cardsByType[type]!)}
                              onChange={(next) => updateCard(type, next)}
                              onRemove={() => toggleType(type)}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {step === 3 && (
                  <div>
                    <div className="mb-6">
                      <h2 className="font-heading mb-1 text-xl font-bold tracking-[-0.02em] text-[#0B1533]">Phases &amp; deliverables</h2>
                      <p className="text-[13px] text-[#5F6A88]">
                        Set up the plan for each project — StackShift I&apos;s default phases can be deselected per project;
                        every other type starts from a free-form builder, or skip for now and add phases later.
                      </p>
                    </div>
                    <PhasesStep
                      selectedTypes={selectedTypes}
                      cardsByType={cardsByType}
                      onChangeCard={updateCard}
                      getDisplayName={displayedNameForCard}
                      canManagePhases={canManagePhases}
                      scheduleMin={scheduleMin}
                      scheduleMax={scheduleMax}
                    />
                    {phasesStepError && <p className="mt-3 text-xs text-[#C0392B]">{phasesStepError}</p>}
                  </div>
                )}

                {step === 4 && (
                  <div>
                    <div className="mb-6">
                      <h2 className="font-heading mb-1 text-xl font-bold tracking-[-0.02em] text-[#0B1533]">Review &amp; create</h2>
                      <p className="text-[13px] text-[#5F6A88]">Confirm the details below before creating this project.</p>
                    </div>

                    <div className="mb-4 divide-y divide-[#EDF0F7] rounded-[10px] border border-[#E2E7F2] bg-[#F4F6FB] px-5 py-1">
                      <ReviewRow label="Company" value={companyName || "—"} />
                      <ReviewRow label="Primary contact" value={contactName || "—"} />
                      <ReviewRow label="Contact email" value={contactEmail || "—"} />
                      {contactPhone.trim() && <ReviewRow label="Phone" value={contactPhone} />}
                    </div>

                    <div className="mb-4 flex flex-col gap-2">
                      {selectedTypes.map((type) => {
                        const card = cardsByType[type]!;
                        const phaseCount = card.phasePlan.phases.length;
                        const includedCount = card.phasePlan.phases.filter((p) => p.included).length;
                        const isStackShiftI = type === "StackShift I";
                        const isStackShiftII = type === "StackShift II";
                        const usesFixedPhases = isStackShiftI || (isStackShiftII && card.useDefaultPhases);
                        const phaseSummary = usesFixedPhases
                          ? `${includedCount} of ${phaseCount} phase${phaseCount === 1 ? "" : "s"} included`
                          : phaseCount === 0
                            ? "No phases yet — skipped for now"
                            : `${phaseCount} phase${phaseCount === 1 ? "" : "s"} planned`;
                        const startSummary =
                          card.startMode === "draft"
                            ? "Draft — not started"
                            : card.startMode === "scheduled"
                              ? card.scheduledStartAt
                                ? `Scheduled ${new Date(card.scheduledStartAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                                : "Scheduled — pick a date"
                              : usesFixedPhases && canManagePhases && card.startPhase !== 1
                                ? `Starts now at Phase ${card.startPhase}`
                                : "Starts immediately";
                        return (
                          <div key={type} className="rounded-[9px] border border-[#E2E7F2] bg-white px-3.5 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[13px] font-semibold text-[#0B1533]">{displayedNameForCard(type, card) || "—"}</span>
                              {card.pipelineforgeAddon && (
                                <span className="shrink-0 rounded-full bg-[#E5F1FF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0063D6]">
                                  + PipelineForge
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#5F6A88]">
                              {type} · {card.durationDays}-day duration · {phaseSummary}
                            </div>
                            <div className="text-[11px] text-[#5F6A88]">{startSummary}</div>
                          </div>
                        );
                      })}
                    </div>

                    {companyMode === "new" && (
                      <div className="mb-1 flex items-center gap-2.5 rounded-[10px] border border-[#F0D896] bg-[#FFF3D6] px-4 py-3.5">
                        <Sparkles size={14} className="shrink-0 text-[#8A5A00]" />
                        <span className="text-xs leading-snug text-[#8A5A00]">
                          A unique customer ID (<span className="font-mono">WRQ-CUST-XXXXXXXX</span>) will be generated for this new company.
                        </span>
                      </div>
                    )}

                    {submitError && (
                      <p id="submit-error" tabIndex={-1} className="mt-3 text-xs text-[#C0392B] outline-none">
                        {submitError}
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {step < 4 ? (
              <div className="mt-7 flex items-center justify-between">
                <button
                  type="button"
                  onClick={goBack}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#E2E7F2] bg-transparent px-4 py-2.5 text-[13px] font-medium text-[#3A4565] transition-colors hover:border-[#A8C6F5] hover:bg-[#F4F6FB]"
                >
                  <ArrowLeft size={14} />
                  {step === 1 ? "Cancel" : "Back"}
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={validatingStep}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-[#007BFF] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(0,123,255,0.3)] transition-colors hover:bg-[#0063D6] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {validatingStep ? "Checking…" : (
                    <>
                      Continue <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            ) : (
              // Task 244: duration/schedule/"start at phase" now live per card on Step 3
              // (Phases & Deliverables) — every selected card already carries its own resolved
              // mode by Review, so this footer is a single submit action instead of the old 3-way
              // Just Save / Save + Set Schedule / Start Now buttons applied uniformly.
              // Task 244 follow-up: matches steps 1-3's row layout/Back-button styling exactly
              // (was a stacked full-width CTA over a bare text link, visually inconsistent with
              // every other step's footer).
              <div className="mt-7 flex items-center justify-between">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={submitting}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#E2E7F2] bg-transparent px-4 py-2.5 text-[13px] font-medium text-[#3A4565] transition-colors hover:border-[#A8C6F5] hover:bg-[#F4F6FB] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ArrowLeft size={14} /> Back
                </button>
                <button
                  type="button"
                  onClick={() => runSubmission()}
                  disabled={submitting}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-[#FB914E] px-5 py-2.5 text-[13px] font-semibold text-[#471F02] shadow-[0_2px_10px_rgba(251,145,78,0.3)] transition-colors hover:bg-[#E2762F] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    "Creating…"
                  ) : (
                    <>
                      <Check size={14} strokeWidth={2.5} />
                      {selectedTypes.length === 1 ? "Create project" : `Create ${selectedTypes.length} projects`}
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
