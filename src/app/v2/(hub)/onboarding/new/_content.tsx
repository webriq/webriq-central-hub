"use client";

import { useRef, useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { CLASSIFICATIONS, type Classification, deriveProjectSuffix } from "@/config/customer-phases";
import { spaceGrotesk, inter, jetBrainsMono } from "../_fonts";

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

type ClassificationMeta = {
  desc: string;
  icon: React.ReactNode;
  border: string;
  bg: string;
  ring: string;
  text: string;
  solid: string;
  iconBg: string;
  iconText: string;
};

const CLASSIFICATION_META: Record<Classification, ClassificationMeta> = {
  "StackShift I": {
    desc: "Standard StackShift build — single site, core CMS setup.",
    icon: <Layers size={20} />,
    border: "border-[#2563EB]",
    bg: "bg-[#EFF6FF]",
    ring: "shadow-[0_0_0_3px_rgba(37,99,235,0.09)]",
    text: "text-[#2563EB]",
    solid: "bg-[#2563EB]",
    iconBg: "bg-[#2563EB]/15",
    iconText: "text-[#2563EB]",
  },
  "StackShift II": {
    desc: "Expanded StackShift build — multi-section site, deeper migration.",
    icon: <LayoutGrid size={20} />,
    border: "border-[#2563EB]",
    bg: "bg-[#EFF6FF]",
    ring: "shadow-[0_0_0_3px_rgba(37,99,235,0.09)]",
    text: "text-[#2563EB]",
    solid: "bg-[#2563EB]",
    iconBg: "bg-[#2563EB]/15",
    iconText: "text-[#2563EB]",
  },
  "StackShift Access": {
    desc: "StackShift with ongoing managed access & support.",
    icon: <Shield size={20} />,
    border: "border-[#7C3AED]",
    bg: "bg-[#F5F3FF]",
    ring: "shadow-[0_0_0_3px_rgba(124,58,237,0.09)]",
    text: "text-[#7C3AED]",
    solid: "bg-[#7C3AED]",
    iconBg: "bg-[#7C3AED]/15",
    iconText: "text-[#7C3AED]",
  },
  "StackShift Access Plus": {
    desc: "StackShift Access with an expanded scope of ongoing work.",
    icon: <ShieldCheck size={20} />,
    border: "border-[#7C3AED]",
    bg: "bg-[#F5F3FF]",
    ring: "shadow-[0_0_0_3px_rgba(124,58,237,0.09)]",
    text: "text-[#7C3AED]",
    solid: "bg-[#7C3AED]",
    iconBg: "bg-[#7C3AED]/15",
    iconText: "text-[#7C3AED]",
  },
  PipelineForge: {
    desc: "Build automation & deployment pipeline engagement.",
    icon: <GitBranch size={20} />,
    border: "border-[#0D9488]",
    bg: "bg-[#F0FDFA]",
    ring: "shadow-[0_0_0_3px_rgba(13,148,136,0.09)]",
    text: "text-[#0D9488]",
    solid: "bg-[#0D9488]",
    iconBg: "bg-[#0D9488]/15",
    iconText: "text-[#0D9488]",
  },
  "Discrete Development": {
    desc: "Custom app — scoped, one-off development work.",
    icon: <Code2 size={20} />,
    border: "border-[#F97316]",
    bg: "bg-[#FFF7ED]",
    ring: "shadow-[0_0_0_3px_rgba(249,115,22,0.09)]",
    text: "text-[#F97316]",
    solid: "bg-[#F97316]",
    iconBg: "bg-[#F97316]/15",
    iconText: "text-[#F97316]",
  },
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
                  background: done || active ? "#2563EB" : "#E2E8F0",
                  boxShadow: active ? "0 0 0 4px rgba(37,99,235,0.15)" : "0 0 0 0 rgba(37,99,235,0)",
                }}
                transition={{ duration: 0.25 }}
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full"
              >
                {done ? (
                  <Check size={15} color="#FFFFFF" strokeWidth={2.5} />
                ) : (
                  <span className={cn(spaceGrotesk.className, "text-sm font-bold", active ? "text-white" : "text-[#94A3B8]")}>
                    {step.id}
                  </span>
                )}
              </motion.div>
              <span
                className={cn(
                  "whitespace-nowrap text-[11px]",
                  active ? "font-semibold text-[#0F172A]" : done ? "font-normal text-[#2563EB]" : "font-normal text-[#94A3B8]"
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <motion.div
                animate={{ background: done ? "#2563EB" : "#E2E8F0" }}
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
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-center gap-1 text-[13px] font-medium text-[#0F172A]">
        {label}
        {required && <span className="text-[#2563EB]">*</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "peer w-full rounded-[9px] border-[1.5px] bg-white px-3.5 py-[11px] text-sm text-[#0F172A] outline-none transition-[border-color,box-shadow] duration-150",
            icon && "pl-[38px]",
            error
              ? "border-[#DC2626] shadow-[0_0_0_3px_rgba(220,38,38,0.08)]"
              : "border-[#E2E8F0] focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)]"
          )}
        />
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#CBD5E1] transition-colors peer-focus:text-[#2563EB]">
            {icon}
          </span>
        )}
      </div>
      {error && <span className="text-xs text-[#DC2626]">{error}</span>}
    </div>
  );
}

// ─── Classification card ──────────────────────────────────────────────────────

function ClassificationCard({
  classification,
  selected,
  onSelect,
}: {
  classification: Classification;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = CLASSIFICATION_META[classification];
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "relative w-full cursor-pointer rounded-xl border-[1.5px] p-4 text-left transition-colors",
        selected ? cn(meta.border, meta.bg, meta.ring) : "border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#CBD5E1]"
      )}
    >
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className={cn("absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full", meta.solid)}
          >
            <Check size={11} color="#FFFFFF" strokeWidth={2.5} />
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={cn(
          "mb-2.5 flex h-10 w-10 items-center justify-center rounded-[11px] transition-colors",
          selected ? cn(meta.iconBg, meta.iconText) : "bg-[#F8FAFC] text-[#94A3B8]"
        )}
      >
        {meta.icon}
      </div>

      <div className={cn(spaceGrotesk.className, "mb-1 text-sm font-bold", selected ? meta.text : "text-[#0F172A]")}>
        {classification}
      </div>
      <div className="text-xs leading-relaxed text-[#64748B]">{meta.desc}</div>
    </motion.button>
  );
}

// ─── Review row ───────────────────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-2.5">
      <span className="text-xs text-[#64748B]">{label}</span>
      <span className="text-[13px] font-medium text-[#0F172A]">{value}</span>
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
        className="mx-auto mb-6 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-gradient-to-br from-[#22C55E] to-[#16A34A] shadow-[0_4px_20px_rgba(34,197,94,0.35)]"
      >
        <Check size={34} color="#FFFFFF" strokeWidth={2.5} />
      </motion.div>

      <h2 className={cn(spaceGrotesk.className, "mb-1.5 text-2xl font-bold tracking-[-0.025em] text-[#0F172A]")}>
        {projectName} is ready
      </h2>
      <p className="mb-7 text-sm leading-relaxed text-[#64748B]">
        Project created successfully and added to the onboarding queue.
      </p>

      {showCustomerId && (
        <div className="mb-3 flex items-center gap-2 rounded-[10px] border-[1.5px] border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-3 text-left">
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">Customer ID</div>
            <span className={cn(jetBrainsMono.className, "text-xs text-[#0F172A]")}>{customerId}</span>
          </div>
          <button
            type="button"
            onClick={onCopy}
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              copied ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]" : "border-[#E2E8F0] bg-white text-[#475569]"
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
          className="flex-1 cursor-pointer rounded-[9px] border-[1.5px] border-[#E2E8F0] bg-white px-4 py-[11px] text-[13px] font-medium text-[#0F172A] transition-colors hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
        >
          Back to onboarding
        </button>
        <button
          type="button"
          onClick={onView}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border-none bg-[#2563EB] px-4 py-[11px] text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(37,99,235,0.3)] transition-colors hover:bg-[#1D4ED8]"
        >
          View project <ExternalLink size={13} />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function NewProjectWizard() {
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
  const [errors1, setErrors1] = useState<Record<string, string>>({});

  const [classification, setClassification] = useState<Classification>(CLASSIFICATIONS[0]);
  const [projectName, setProjectName] = useState("");
  const [projectNameTouched, setProjectNameTouched] = useState(false);
  const [projectNameError, setProjectNameError] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const [submitting, setSubmitting] = useState<"save" | "save_scheduled" | "start" | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ project_id: string; customer_id: string; isNewCustomer: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const companyName = companyMode === "existing" ? selectedCustomer?.company_name ?? "" : newCompanyName;
  // Derived at render time, not synced via effect — task 123 hit react-hooks/set-state-in-effect
  // doing this the naive way; this form must not regress it.
  const displayedProjectName = projectNameTouched || !companyName.trim()
    ? projectName
    : `${companyName.trim()} ${deriveProjectSuffix(classification)}`;

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

  function goNext() {
    if (step === 1) {
      const errs: Record<string, string> = {};
      if (companyMode === "new" && !newCompanyName.trim()) errs.companyName = "Company name is required.";
      if (companyMode === "existing" && !selectedCustomer) errs.companyName = "Select an existing company.";
      if (!contactName.trim()) errs.contactName = "Contact name is required.";
      if (!contactEmail.trim()) errs.contactEmail = "Email is required.";
      else if (!/^\S+@\S+\.\S+$/.test(contactEmail)) errs.contactEmail = "Enter a valid email address.";
      if (Object.keys(errs).length) {
        setErrors1(errs);
        return;
      }
      setErrors1({});
    }
    if (step === 2) {
      if (!displayedProjectName.trim()) {
        setProjectNameError("Project name is required.");
        return;
      }
      setProjectNameError("");
    }
    setDirection(1);
    setStep((s) => (s + 1) as Step);
  }

  function goBack() {
    if (step === 1) {
      router.push(V2_ROUTES.ONBOARDING);
      return;
    }
    setDirection(-1);
    setStep((s) => (s - 1) as Step);
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
        body: JSON.stringify({
          mode,
          scheduled_start_at: mode === "save_scheduled" ? new Date(scheduledAt).toISOString() : undefined,
          customer: companyMode === "existing" ? { existing_customer_id: selectedCustomer!.customer_id } : { company_name: newCompanyName.trim() },
          contact: { name: contactName.trim(), email: contactEmail.trim() || undefined, phone: contactPhone.trim() || undefined },
          classification,
          project_name: displayedProjectName.trim(),
        }),
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

  function copyCustomerId(id: string) {
    navigator.clipboard.writeText(id).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={cn(inter.className, "flex min-h-full flex-col items-center bg-[#F8FAFC] px-6 py-10")}>
      {!success && (
        <div className="mb-2 w-full max-w-[560px]">
          <button
            type="button"
            onClick={goBack}
            className="flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-xs text-[#64748B] transition-colors hover:text-[#2563EB]"
          >
            <ArrowLeft size={13} />
            {step === 1 ? "Back to onboarding" : "Previous step"}
          </button>
        </div>
      )}

      <div className="w-full max-w-[560px] rounded-2xl border border-[#E2E8F0] bg-white px-10 py-9 shadow-[0_4px_24px_rgba(15,23,42,0.07)]">
        {success ? (
          <SuccessScreen
            projectName={displayedProjectName}
            customerId={success.customer_id}
            showCustomerId={success.isNewCustomer}
            copied={copied}
            onCopy={() => copyCustomerId(success.customer_id)}
            onBack={() => router.push(V2_ROUTES.ONBOARDING)}
            onView={() => router.push(`${V2_ROUTES.ONBOARDING}/${success.project_id}`)}
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
                      <h2 className={cn(spaceGrotesk.className, "mb-1 text-xl font-bold tracking-[-0.02em] text-[#0F172A]")}>
                        Company &amp; contact
                      </h2>
                      <p className="text-[13px] text-[#64748B]">
                        This will be used to set up the customer&apos;s workspace and this project&apos;s onboarding.
                      </p>
                    </div>

                    <div className="mb-5 flex w-fit items-center gap-1 rounded-lg bg-[#F1F5F9] p-1">
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
                            companyMode === m ? "bg-white text-[#0F172A] shadow-sm" : "bg-transparent text-[#64748B] hover:text-[#0F172A]"
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
                          <label className="mb-1.5 flex items-center gap-1 text-[13px] font-medium text-[#0F172A]">
                            Company <span className="text-[#2563EB]">*</span>
                          </label>
                          <div className="flex items-center justify-between gap-2 rounded-[9px] border-[1.5px] border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-[#0F172A]">{selectedCustomer.company_name}</div>
                              <div className={cn(jetBrainsMono.className, "truncate text-[11px] text-[#94A3B8]")}>{selectedCustomer.customer_id}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedCustomer(null)}
                              className="shrink-0 cursor-pointer border-none bg-transparent text-xs font-medium text-[#2563EB]"
                            >
                              Change
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="mb-1.5 flex items-center gap-1 text-[13px] font-medium text-[#0F172A]">
                            Company <span className="text-[#2563EB]">*</span>
                          </label>
                          <div className="relative">
                            <input
                              value={existingSearch}
                              onChange={(e) => handleSearchChange(e.target.value)}
                              placeholder="Search existing customers…"
                              className="w-full rounded-[9px] border-[1.5px] border-[#E2E8F0] bg-white py-[11px] pl-[34px] pr-3.5 text-sm text-[#0F172A] outline-none transition-colors focus:border-[#2563EB]"
                            />
                            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                          </div>
                          {existingSearch.trim() && (
                            <div className="mt-1.5 max-h-48 overflow-y-auto rounded-[9px] border border-[#E2E8F0] bg-white shadow-sm">
                              {searching ? (
                                <div className="px-3.5 py-2.5 text-xs text-[#94A3B8]">Searching…</div>
                              ) : existingMatches.length === 0 ? (
                                <div className="px-3.5 py-2.5 text-xs text-[#94A3B8]">No matches.</div>
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
                                        return n;
                                      });
                                    }}
                                    className="block w-full cursor-pointer border-none bg-transparent px-3.5 py-2 text-left text-[13px] text-[#0F172A] hover:bg-[#F8FAFC]"
                                  >
                                    {c.company_name} <span className={cn(jetBrainsMono.className, "text-[11px] text-[#94A3B8]")}>{c.customer_id}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {errors1.companyName && <span className="text-xs text-[#DC2626]">{errors1.companyName}</span>}

                      <div className="h-px bg-[#F1F5F9]" />

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
                        placeholder="Full name"
                        icon={<User size={15} />}
                        required
                        error={errors1.contactName}
                      />
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
                        placeholder="contact@company.com"
                        icon={<Mail size={15} />}
                        required
                        error={errors1.contactEmail}
                      />
                      <Field
                        id="contact-phone"
                        label="Phone"
                        value={contactPhone}
                        onChange={setContactPhone}
                        placeholder="Optional"
                        icon={<Phone size={15} />}
                      />
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div>
                    <div className="mb-6">
                      <h2 className={cn(spaceGrotesk.className, "mb-1 text-xl font-bold tracking-[-0.02em] text-[#0F172A]")}>
                        Project details
                      </h2>
                      <p className="text-[13px] text-[#64748B]">
                        Choose the engagement type. This drives which product and project type get created.
                      </p>
                    </div>

                    <div className="mb-6 grid grid-cols-2 gap-3">
                      {CLASSIFICATIONS.map((c) => (
                        <ClassificationCard key={c} classification={c} selected={classification === c} onSelect={() => setClassification(c)} />
                      ))}
                    </div>

                    <div className="mb-6 h-px bg-[#F1F5F9]" />

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
                      <div className="flex flex-col gap-1.5">
                        <Field
                          id="scheduled-start"
                          label="Scheduled start"
                          type="datetime-local"
                          value={scheduledAt}
                          onChange={setScheduledAt}
                          icon={<CalendarClock size={15} />}
                        />
                        <p className="text-xs text-[#94A3B8]">Optional — only required for &quot;Save + Set Schedule&quot;.</p>
                      </div>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div>
                    <div className="mb-6">
                      <h2 className={cn(spaceGrotesk.className, "mb-1 text-xl font-bold tracking-[-0.02em] text-[#0F172A]")}>
                        Review &amp; create
                      </h2>
                      <p className="text-[13px] text-[#64748B]">Confirm the details below before creating this project.</p>
                    </div>

                    <div className="mb-4 divide-y divide-[#F1F5F9] rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-1">
                      <ReviewRow label="Company" value={companyName || "—"} />
                      <ReviewRow label="Primary contact" value={contactName || "—"} />
                      <ReviewRow label="Contact email" value={contactEmail || "—"} />
                      {contactPhone.trim() && <ReviewRow label="Phone" value={contactPhone} />}
                      <ReviewRow label="Classification" value={classification} />
                      <ReviewRow label="Project name" value={displayedProjectName || "—"} />
                      {scheduledAt && (
                        <ReviewRow
                          label="Scheduled start"
                          value={new Date(scheduledAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        />
                      )}
                    </div>

                    {companyMode === "new" && (
                      <div className="mb-1 flex items-center gap-2.5 rounded-[10px] border border-[rgba(245,158,11,0.3)] bg-gradient-to-r from-[rgba(245,158,11,0.08)] to-[rgba(249,115,22,0.08)] px-4 py-3.5">
                        <Sparkles size={14} className="shrink-0 text-[#F97316]" />
                        <span className="text-xs leading-snug text-[#92400E]">
                          A unique customer ID (<span className={jetBrainsMono.className}>WRQ-CUST-XXXX</span>) will be generated for this new company.
                        </span>
                      </div>
                    )}

                    {submitError && <p className="mt-3 text-xs text-[#DC2626]">{submitError}</p>}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {step < 3 ? (
              <div className="mt-7 flex items-center justify-between">
                <button
                  type="button"
                  onClick={goBack}
                  className="flex cursor-pointer items-center gap-1.5 rounded-[9px] border-[1.5px] border-[#E2E8F0] bg-transparent px-4 py-2.5 text-[13px] font-medium text-[#475569] transition-colors hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
                >
                  <ArrowLeft size={14} />
                  {step === 1 ? "Cancel" : "Back"}
                </button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={goNext}
                  className="flex cursor-pointer items-center gap-1.5 rounded-[9px] border-none bg-[#2563EB] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(37,99,235,0.3)]"
                >
                  Continue <ArrowRight size={14} />
                </motion.button>
              </div>
            ) : (
              <div className="mt-7 flex flex-col gap-2.5">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => submit("start")}
                  disabled={!!submitting}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[9px] border-none bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] px-5 py-3 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(37,99,235,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting === "start" ? (
                    "Starting…"
                  ) : (
                    <>
                      <Check size={14} strokeWidth={2.5} /> Start onboarding (Day 1 now)
                    </>
                  )}
                </motion.button>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => submit("save")}
                    disabled={!!submitting}
                    className="flex-1 cursor-pointer rounded-[9px] border-[1.5px] border-[#E2E8F0] bg-transparent px-4 py-2.5 text-[13px] font-medium text-[#475569] transition-colors hover:border-[#CBD5E1] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting === "save" ? "Saving…" : "Just save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => submit("save_scheduled")}
                    disabled={!!submitting}
                    className="flex-1 cursor-pointer rounded-[9px] border-[1.5px] border-[#E2E8F0] bg-transparent px-4 py-2.5 text-[13px] font-medium text-[#475569] transition-colors hover:border-[#CBD5E1] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting === "save_scheduled" ? "Saving…" : "Save + set schedule"}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={goBack}
                  disabled={!!submitting}
                  className="mt-1 flex cursor-pointer items-center gap-1.5 self-start border-none bg-transparent px-1 py-1 text-xs font-medium text-[#64748B] transition-colors hover:text-[#2563EB] disabled:opacity-60"
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
