"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { DayPicker } from "react-day-picker";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Building2,
  User,
  Mail,
  Phone,
  Search,
  CalendarClock,
  Sparkles,
  ExternalLink,
  Copy,
  Layers,
  LayoutGrid,
  Shield,
  ShieldCheck,
  GitBranch,
  Code2,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { CLASSIFICATIONS, type Classification, STACKSHIFT_VARIANTS, deriveProjectSuffixMulti, PROGRAMME_PHASES } from "@/config/customer-phases";

type CustomerMatch = { customer_id: string; company_name: string };
type Step = 1 | 2 | 3;

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: "Company & Contact" },
  { id: 2, label: "Project Details" },
  { id: 3, label: "Review & Create" },
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

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="mb-10 flex items-center">
      {STEPS.map((step, i) => {
        const done = step.id < current;
        const active = step.id === current;
        return (
          <div key={step.id} className={cn("flex items-center", i < STEPS.length - 1 ? "flex-1" : "flex-none")}>
            <div className="flex flex-col items-center gap-2">
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
                className="mt-[-18px] ml-2 mr-2 h-0.5 flex-1"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Input field ──────────────────────────────────────────────────────────────

function Field({
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

// ─── Date & time picker ────────────────────────────────────────────────────────
// Custom-rendered (react-day-picker, headless) instead of the native <input
// type="datetime-local"> control — the native picker's appearance varies wildly across
// browsers/OS (Chrome's inline spinner vs. Safari's wheel UI vs. Firefox's), so this renders
// identically everywhere and matches the form's own styling instead of the OS chrome.
const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => i);

function DateTimePicker({
  value,
  onChange,
  min,
  max,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  min: Date;
  max: Date;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedDate = value ? new Date(value) : undefined;

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  // Flip above the field when there isn't enough room below, so opening the picker never
  // forces extra scrolling to see it — mirrors the trigger's own rect, no portal needed since
  // this only ever renders inside a page that scrolls as a whole (no clipping ancestor).
  useLayoutEffect(() => {
    if (!open) return;
    function computePlacement() {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const gap = 6;
      const triggerRect = trigger.getBoundingClientRect();
      const panelHeight = panel.getBoundingClientRect().height;
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      setPlacement(spaceBelow < panelHeight + gap && spaceAbove > spaceBelow ? "top" : "bottom");
    }
    computePlacement();
    window.addEventListener("resize", computePlacement);
    return () => window.removeEventListener("resize", computePlacement);
  }, [open]);

  function commit(d: Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  }

  function handleDaySelect(d: Date | undefined) {
    if (!d) return;
    const next = new Date(d);
    next.setHours(selectedDate ? selectedDate.getHours() : 9, selectedDate ? selectedDate.getMinutes() : 0, 0, 0);
    commit(next);
  }

  function handleTimeChange(patch: { hour12?: number; minute?: number; pm?: boolean }) {
    const base = selectedDate ? new Date(selectedDate) : new Date();
    const currentHour12 = base.getHours() % 12 || 12;
    const currentPm = base.getHours() >= 12;
    const hour12 = patch.hour12 ?? currentHour12;
    const pm = patch.pm ?? currentPm;
    const minute = patch.minute ?? base.getMinutes();
    base.setHours((hour12 % 12) + (pm ? 12 : 0), minute, 0, 0);
    commit(base);
  }

  const hour12 = selectedDate ? selectedDate.getHours() % 12 || 12 : 9;
  const minute = selectedDate ? selectedDate.getMinutes() : 0;
  const isPm = selectedDate ? selectedDate.getHours() >= 12 : false;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 rounded-[9px] border px-3.5 py-[11px] text-left text-sm outline-none transition-colors duration-150",
          disabled
            ? "cursor-not-allowed border-[#E2E7F2] bg-[#EDF0F7] text-[#5F6A88]"
            : open
              ? "border-[#007BFF] bg-white text-[#0B1533] shadow-[0_0_0_3px_rgba(0,123,255,0.14)]"
              : "border-[#E2E7F2] bg-[#F4F6FB] text-[#0B1533] hover:border-[#A8C6F5]"
        )}
      >
        <CalendarClock size={15} className="shrink-0 text-[#5F6A88]" />
        {selectedDate ? (
          selectedDate.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
        ) : (
          <span className="text-[#5F6A88]">Pick a date &amp; time</span>
        )}
      </button>

      {open && !disabled && (
        <div
          ref={panelRef}
          className={cn(
            "absolute left-0 z-30 flex overflow-hidden rounded-xl border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)]",
            placement === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"
          )}
        >
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleDaySelect}
            disabled={{ before: min, after: max }}
            showOutsideDays
            classNames={{
              root: "p-3",
              months: "flex",
              month: "flex flex-col gap-2",
              month_caption: "relative flex h-8 items-center justify-center px-8",
              caption_label: "text-[13px] font-bold text-[#0B1533]",
              nav: "absolute inset-x-1 top-0 flex h-8 items-center justify-between",
              button_previous:
                "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#5F6A88] transition-colors hover:bg-[#EDF0F7] disabled:cursor-not-allowed disabled:opacity-30",
              button_next:
                "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#5F6A88] transition-colors hover:bg-[#EDF0F7] disabled:cursor-not-allowed disabled:opacity-30",
              month_grid: "w-full border-collapse",
              weekdays: "flex",
              weekday: "w-8 text-center text-[10px] font-semibold uppercase tracking-wide text-[#5F6A88]",
              weeks: "mt-1 flex flex-col gap-0.5",
              week: "flex",
              day: "p-0 text-center",
              day_button:
                "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-[13px] text-[#0B1533] transition-colors hover:bg-[#EDF0F7]",
              selected: "[&>button]:bg-[#007BFF] [&>button]:font-semibold [&>button]:text-white [&>button]:hover:bg-[#007BFF]",
              today: "[&>button]:font-bold [&>button]:text-[#007BFF]",
              outside: "[&>button]:text-[#B7BFD6]",
              disabled: "[&>button]:cursor-not-allowed [&>button]:text-[#E2E7F2] [&>button]:hover:bg-transparent",
            }}
            components={{
              Chevron: ({ orientation }) =>
                orientation === "left" ? <ChevronLeft size={14} /> : <ChevronRight size={14} />,
            }}
          />
          <div className="flex w-[168px] flex-col gap-3 border-l border-[#EDF0F7] p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#5F6A88]">Time</div>
            <div className="flex items-center gap-1.5">
              <select
                value={hour12}
                onChange={(e) => handleTimeChange({ hour12: Number(e.target.value) })}
                className="h-9 w-full cursor-pointer rounded-[8px] border border-[#E2E7F2] bg-white text-center text-sm text-[#0B1533] outline-none focus:border-[#007BFF]"
              >
                {HOURS_12.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <span className="text-sm font-semibold text-[#5F6A88]">:</span>
              <select
                value={minute}
                onChange={(e) => handleTimeChange({ minute: Number(e.target.value) })}
                className="h-9 w-full cursor-pointer rounded-[8px] border border-[#E2E7F2] bg-white text-center text-sm text-[#0B1533] outline-none focus:border-[#007BFF]"
              >
                {MINUTES_60.map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex w-fit items-center gap-1 rounded-lg bg-[#EDF0F7] p-1">
              {([false, true] as const).map((pm) => (
                <button
                  key={String(pm)}
                  type="button"
                  onClick={() => handleTimeChange({ pm })}
                  className={cn(
                    "cursor-pointer rounded-md border-none px-3 py-1.5 text-xs font-medium transition-colors",
                    isPm === pm ? "bg-white text-[#0B1533] shadow-sm" : "bg-transparent text-[#5F6A88] hover:text-[#0B1533]"
                  )}
                >
                  {pm ? "PM" : "AM"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-auto cursor-pointer rounded-full border-none bg-[#007BFF] py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0063D6]"
            >
              Done
            </button>
          </div>
        </div>
      )}
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

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({
  projectName,
  customerId,
  showCustomerId,
  copied,
  onCopy,
  onBack,
  onView,
}: {
  projectName: string;
  customerId: string;
  showCustomerId: boolean;
  copied: boolean;
  onCopy: () => void;
  onBack: () => void;
  onView: () => void;
}) {
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
        className="mx-auto mb-6 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#177E48] shadow-[0_4px_16px_rgba(23,126,72,0.28)]"
      >
        <Check size={34} color="#FFFFFF" strokeWidth={2.5} />
      </motion.div>

      <h2 className="font-heading mb-1.5 text-2xl font-bold tracking-[-0.025em] text-[#0B1533]">{projectName} is ready</h2>
      <p className="mb-7 text-sm leading-relaxed text-[#5F6A88]">Project created successfully and added to the onboarding queue.</p>

      {showCustomerId && (
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

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 cursor-pointer rounded-full border border-[#E2E7F2] bg-white px-4 py-[11px] text-[13px] font-medium text-[#3A4565] transition-colors hover:border-[#A8C6F5] hover:text-[#0B1533]"
        >
          Back to projects
        </button>
        <button
          type="button"
          onClick={onView}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border-none bg-[#007BFF] px-4 py-[11px] text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(0,123,255,0.3)] transition-colors hover:bg-[#0063D6]"
        >
          View project <ExternalLink size={13} />
        </button>
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

  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactLoading, setContactLoading] = useState(false);
  const [errors1, setErrors1] = useState<Record<string, string>>({});
  const [validatingStep, setValidatingStep] = useState(false);

  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [classificationError, setClassificationError] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectNameTouched, setProjectNameTouched] = useState(false);
  const [projectNameError, setProjectNameError] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const [startPhase, setStartPhase] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Scheduling bounds: no scheduling into the past, and no more than a year out.
  const { scheduleMin, scheduleMax } = useMemo(() => {
    const now = new Date();
    const oneYearOut = new Date(now);
    oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
    return { scheduleMin: now, scheduleMax: oneYearOut };
  }, []);

  function toggleClassification(c: Classification) {
    setClassifications((prev) => {
      if (prev.includes(c)) return prev.filter((x) => x !== c);
      if (STACKSHIFT_VARIANTS.includes(c)) {
        // At most one StackShift variant: swap it in, drop any other StackShift variant, keep
        // everything else (PipelineForge / Discrete Development) untouched.
        return [...prev.filter((x) => !STACKSHIFT_VARIANTS.includes(x)), c];
      }
      return [...prev, c];
    });
    setClassificationError("");
  }

  const [submitting, setSubmitting] = useState<"save" | "save_scheduled" | "start" | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ project_id: string; customer_id: string; isNewCustomer: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const companyName = companyMode === "existing" ? selectedCustomer?.company_name ?? "" : newCompanyName;
  // Derived at render time, not synced via effect — task 123 hit react-hooks/set-state-in-effect
  // doing this the naive way; this form must not regress it.
  const displayedProjectName = projectNameTouched || !companyName.trim()
    ? projectName
    : `${companyName.trim()} ${deriveProjectSuffixMulti(classifications)}`;

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

  async function goNext() {
    if (step === 1) {
      const errs: Record<string, string> = {};
      if (companyMode === "new" && !newCompanyName.trim()) errs.companyName = "Company name is required.";
      if (companyMode === "existing" && !selectedCustomer) errs.companyName = "Select an existing company.";
      if (contactEmail.trim() && !/^\S+@\S+\.\S+$/.test(contactEmail)) errs.contactEmail = "Enter a valid email address.";
      if (Object.keys(errs).length) {
        setErrors1(errs);
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
            return;
          }
        } finally {
          setValidatingStep(false);
        }
      }
    }
    if (step === 2) {
      if (classifications.length === 0) {
        setClassificationError("Select at least one classification.");
        return;
      }
      setClassificationError("");
      if (!displayedProjectName.trim()) {
        setProjectNameError("Project name is required.");
        return;
      }
      setProjectNameError("");

      setValidatingStep(true);
      try {
        const res = await fetch(`/api/onboarding/projects/check-name?name=${encodeURIComponent(displayedProjectName.trim())}`);
        const data = await res.json().catch(() => ({}));
        if (data.exists) {
          setProjectNameError("A project with this name already exists.");
          return;
        }
      } finally {
        setValidatingStep(false);
      }
    }
    setDirection(1);
    setStep((s) => (s + 1) as Step);
  }

  function goBack() {
    if (step === 1) {
      router.push(V2_ROUTES.PORTFOLIO_TRACKER);
      return;
    }
    if (step === 3) setScheduleExpanded(false);
    setDirection(-1);
    setStep((s) => (s - 1) as Step);
  }

  function buildCreatePayload(mode: "save" | "save_scheduled" | "start") {
    return {
      mode,
      scheduled_start_at: mode === "save_scheduled" ? new Date(scheduledAt).toISOString() : undefined,
      // Carries the "Start at phase" selection through to a scheduled start too, so the
      // auto-start cron seeds the right phase once the scheduled time arrives.
      start_phase: mode === "save_scheduled" && canManagePhases ? startPhase : undefined,
      customer: companyMode === "existing" ? { existing_customer_id: selectedCustomer!.customer_id } : { company_name: newCompanyName.trim() },
      contact: { name: contactName.trim(), email: contactEmail.trim() || undefined, phone: contactPhone.trim() || undefined },
      classifications,
      project_name: displayedProjectName.trim(),
    };
  }

  async function submit(mode: "save" | "save_scheduled" | "start") {
    const isValid =
      (companyMode === "new" ? newCompanyName.trim().length > 0 : !!selectedCustomer) &&
      displayedProjectName.trim().length > 0;
    if (!isValid) {
      setSubmitError("Company and project name are required.");
      return;
    }
    if (mode === "save_scheduled" && !scheduledAt) {
      setSubmitError("Pick a schedule date/time to Save + Set Schedule.");
      return;
    }
    setSubmitting(mode);
    setSubmitError(null);
    try {
      const res = await fetch("/api/onboarding/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCreatePayload(mode)),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to create project");
      }
      const data = (await res.json()) as { project_id: string; customer_id: string };
      setSuccess({ project_id: data.project_id, customer_id: data.customer_id, isNewCustomer: companyMode === "new" });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setSubmitting(null);
    }
  }

  // Phase 1 reuses the existing mode: "start" path unchanged (seedAndStartProgramme). Phase 2-5
  // creates the project without that phase-1-only seed, then reuses the Timeline's existing
  // "Jump to phase" override (PATCH .../programme/phase) to seed all 5 phases with the target
  // marked active/backdated and earlier phases "skipped" — rather than duplicating that seeding
  // logic here. Only shown to roles that can manage phases (canManagePhases, mirroring
  // _onboarding-detail.tsx exactly — pm/developer never see this, same boundary as the Timeline).
  async function startAtPhase(phaseNumber: 1 | 2 | 3 | 4 | 5) {
    const isValid =
      (companyMode === "new" ? newCompanyName.trim().length > 0 : !!selectedCustomer) &&
      displayedProjectName.trim().length > 0;
    if (!isValid) {
      setSubmitError("Company and project name are required.");
      return;
    }
    setSubmitting("start");
    setSubmitError(null);
    try {
      if (phaseNumber === 1) {
        const res = await fetch("/api/onboarding/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildCreatePayload("start")),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? "Failed to create project");
        }
        const data = (await res.json()) as { project_id: string; customer_id: string };
        setSuccess({ project_id: data.project_id, customer_id: data.customer_id, isNewCustomer: companyMode === "new" });
        return;
      }

      const createRes = await fetch("/api/onboarding/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCreatePayload("save")),
      });
      if (!createRes.ok) {
        const d = await createRes.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to create project");
      }
      const created = (await createRes.json()) as { project_id: string; customer_id: string };

      const phaseRes = await fetch(`/api/projects/${created.project_id}/programme/phase`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase_number: phaseNumber }),
      });
      if (!phaseRes.ok) {
        const d = await phaseRes.json().catch(() => ({}));
        throw new Error(d.error ?? `Project created, but failed to start at Phase ${phaseNumber}.`);
      }

      setSuccess({ project_id: created.project_id, customer_id: created.customer_id, isNewCustomer: companyMode === "new" });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setSubmitting(null);
    }
  }

  function copyCustomerId(id: string) {
    navigator.clipboard.writeText(id).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex min-h-full flex-col items-center bg-[#F4F6FB] px-6 py-10">
      {!success && (
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
        {success ? (
          <SuccessScreen
            projectName={displayedProjectName}
            customerId={success.customer_id}
            showCustomerId={success.isNewCustomer}
            copied={copied}
            onCopy={() => copyCustomerId(success.customer_id)}
            onBack={() => router.push(V2_ROUTES.PORTFOLIO_TRACKER)}
            onView={() => router.push(`${V2_ROUTES.PORTFOLIO_TRACKER}/${success.project_id}`)}
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
                      <h2 className="font-heading mb-1 text-xl font-bold tracking-[-0.02em] text-[#0B1533]">Project details</h2>
                      <p className="text-[13px] text-[#5F6A88]">
                        Choose the engagement type. This drives which product and project type get created.
                      </p>
                    </div>

                    <div className="mb-6 flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-3">
                        {CLASSIFICATIONS.map((c) => (
                          <ClassificationCard key={c} classification={c} selected={classifications.includes(c)} onSelect={() => toggleClassification(c)} />
                        ))}
                      </div>
                      {classificationError && <span className="text-xs text-[#C0392B]">{classificationError}</span>}
                    </div>

                    <div className="mb-6 h-px bg-[#EDF0F7]" />

                    <div className="flex flex-col gap-4.5">
                      <Field
                        id="project-name"
                        label="Project name"
                        value={displayedProjectName}
                        onChange={(v) => {
                          setProjectName(v);
                          setProjectNameTouched(true);
                          setProjectNameError("");
                        }}
                        placeholder="Auto-generated from company + classification"
                        required
                        error={projectNameError}
                      />
                    </div>
                  </div>
                )}

                {step === 3 && (
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
                      <ReviewRow label="Classification" value={classifications.length > 0 ? classifications.join(", ") : "—"} />
                      <ReviewRow label="Project name" value={displayedProjectName || "—"} />
                      {scheduledAt && (
                        <ReviewRow
                          label="Scheduled start"
                          value={new Date(scheduledAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          mono
                        />
                      )}
                    </div>

                    {companyMode === "new" && (
                      <div className="mb-1 flex items-center gap-2.5 rounded-[10px] border border-[#F0D896] bg-[#FFF3D6] px-4 py-3.5">
                        <Sparkles size={14} className="shrink-0 text-[#8A5A00]" />
                        <span className="text-xs leading-snug text-[#8A5A00]">
                          A unique customer ID (<span className="font-mono">WRQ-CUST-XXXXXXXX</span>) will be generated for this new company.
                        </span>
                      </div>
                    )}

                    {submitError && <p className="mt-3 text-xs text-[#C0392B]">{submitError}</p>}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {step < 3 ? (
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
              <div className="mt-7 flex flex-col gap-2.5">
                {canManagePhases && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="start-phase" className="text-[13px] font-medium text-[#0B1533]">
                      Start at phase
                    </label>
                    <select
                      id="start-phase"
                      value={startPhase}
                      onChange={(e) => setStartPhase(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                      disabled={!!submitting}
                      className="h-[42px] w-full cursor-pointer appearance-none rounded-[9px] border border-[#E2E7F2] bg-[#F4F6FB] px-3.5 pr-8 text-sm text-[#0B1533] outline-none transition-colors focus:border-[#007BFF] disabled:cursor-not-allowed disabled:opacity-60"
                      style={{
                        backgroundImage:
                          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235F6A88'/%3E%3C/svg%3E\")",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 14px center",
                      }}
                    >
                      {PROGRAMME_PHASES.map((p) => (
                        <option key={p.number} value={p.number}>
                          Phase {p.number}: {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {!scheduleExpanded && (
                  <button
                    type="button"
                    onClick={() => (canManagePhases ? startAtPhase(startPhase) : submit("start"))}
                    disabled={!!submitting}
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-[#FB914E] px-5 py-3 text-[13px] font-semibold text-[#471F02] transition-colors hover:bg-[#E2762F] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting === "start" ? (
                      "Starting…"
                    ) : canManagePhases ? (
                      <>
                        <Check size={14} strokeWidth={2.5} /> Start Phase {startPhase}: {PROGRAMME_PHASES.find((p) => p.number === startPhase)?.name} Now
                      </>
                    ) : (
                      <>
                        <Check size={14} strokeWidth={2.5} /> Start onboarding (Day 1 now)
                      </>
                    )}
                  </button>
                )}
                {scheduleExpanded && (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label htmlFor="scheduled-start" className="mb-1.5 block text-[13px] font-medium text-[#0B1533]">
                        Scheduled start
                      </label>
                      <DateTimePicker value={scheduledAt} onChange={setScheduledAt} min={scheduleMin} max={scheduleMax} />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setScheduleExpanded(false);
                        setScheduledAt("");
                        setSubmitError(null);
                      }}
                      aria-label="Cancel scheduling"
                      className="mb-0.5 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[#E2E7F2] bg-transparent text-[#5F6A88] transition-colors hover:border-[#A8C6F5] hover:bg-[#F4F6FB]"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setScheduleExpanded(false);
                      setScheduledAt("");
                      submit("save");
                    }}
                    disabled={!!submitting}
                    className="flex-1 cursor-pointer rounded-full border border-[#E2E7F2] bg-transparent px-4 py-2.5 text-[13px] font-medium text-[#3A4565] transition-colors hover:border-[#A8C6F5] hover:bg-[#F4F6FB] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting === "save" ? "Saving…" : "Just save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!scheduleExpanded) {
                        setScheduleExpanded(true);
                        return;
                      }
                      submit("save_scheduled");
                    }}
                    disabled={!!submitting}
                    className={cn(
                      "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      scheduleExpanded
                        ? "border-none bg-[#FB914E] font-semibold text-[#471F02] hover:bg-[#E2762F] hover:text-white"
                        : "border border-[#E2E7F2] bg-transparent px-4 py-2.5 text-[#3A4565] hover:border-[#A8C6F5] hover:bg-[#F4F6FB]"
                    )}
                  >
                    {submitting === "save_scheduled" ? (
                      "Saving…"
                    ) : scheduleExpanded ? (
                      <>
                        <Check size={14} strokeWidth={2.5} /> Confirm &amp; schedule
                      </>
                    ) : (
                      "Save + set schedule"
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={goBack}
                  disabled={!!submitting}
                  className="mt-1 flex cursor-pointer items-center gap-1.5 self-start border-none bg-transparent px-1 py-1 text-xs font-medium text-[#5F6A88] transition-colors hover:text-[#007BFF] disabled:opacity-60"
                >
                  <ArrowLeft size={13} /> Back
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
