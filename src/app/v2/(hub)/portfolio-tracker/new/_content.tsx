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
import { usePMSettings } from "@/hooks/use-pm-settings";
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
  darkBorder: string;
  darkBg: string;
  darkRing: string;
  darkText: string;
  darkIconBg: string;
  darkIconText: string;
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
    darkBorder: "border-blue-500/50",
    darkBg: "bg-blue-500/10",
    darkRing: "shadow-[0_0_0_3px_rgba(37,99,235,0.25)]",
    darkText: "text-blue-400",
    darkIconBg: "bg-blue-500/20",
    darkIconText: "text-blue-400",
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
    darkBorder: "border-blue-500/50",
    darkBg: "bg-blue-500/10",
    darkRing: "shadow-[0_0_0_3px_rgba(37,99,235,0.25)]",
    darkText: "text-blue-400",
    darkIconBg: "bg-blue-500/20",
    darkIconText: "text-blue-400",
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
    darkBorder: "border-violet-500/50",
    darkBg: "bg-violet-500/10",
    darkRing: "shadow-[0_0_0_3px_rgba(124,58,237,0.25)]",
    darkText: "text-violet-400",
    darkIconBg: "bg-violet-500/20",
    darkIconText: "text-violet-400",
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
    darkBorder: "border-violet-500/50",
    darkBg: "bg-violet-500/10",
    darkRing: "shadow-[0_0_0_3px_rgba(124,58,237,0.25)]",
    darkText: "text-violet-400",
    darkIconBg: "bg-violet-500/20",
    darkIconText: "text-violet-400",
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
    darkBorder: "border-teal-500/50",
    darkBg: "bg-teal-500/10",
    darkRing: "shadow-[0_0_0_3px_rgba(13,148,136,0.25)]",
    darkText: "text-teal-400",
    darkIconBg: "bg-teal-500/20",
    darkIconText: "text-teal-400",
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
    darkBorder: "border-orange-500/50",
    darkBg: "bg-orange-500/10",
    darkRing: "shadow-[0_0_0_3px_rgba(249,115,22,0.25)]",
    darkText: "text-orange-400",
    darkIconBg: "bg-orange-500/20",
    darkIconText: "text-orange-400",
  },
};

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, isDark }: { current: Step; isDark: boolean }) {
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
                  background: done || active ? "#2563EB" : isDark ? "rgba(255,255,255,0.1)" : "#E2E8F0",
                  boxShadow: active ? "0 0 0 4px rgba(37,99,235,0.15)" : "0 0 0 0 rgba(37,99,235,0)",
                }}
                transition={{ duration: 0.25 }}
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full"
              >
                {done ? (
                  <Check size={15} color="#FFFFFF" strokeWidth={2.5} />
                ) : (
                  <span className={cn("text-sm font-bold", active ? "text-white" : isDark ? "text-slate-400" : "text-[#64748B]")}>
                    {step.id}
                  </span>
                )}
              </motion.div>
              <span
                className={cn(
                  "whitespace-nowrap text-[11px]",
                  active
                    ? isDark ? "font-semibold text-slate-100" : "font-semibold text-[#0F172A]"
                    : done
                      ? "font-normal text-[#2563EB]"
                      : isDark ? "font-normal text-slate-500" : "font-normal text-[#64748B]"
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <motion.div
                animate={{ background: done ? "#2563EB" : isDark ? "rgba(255,255,255,0.1)" : "#E2E8F0" }}
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
  isDark,
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
  isDark: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={cn("flex items-center gap-1 text-[13px] font-medium", isDark ? "text-slate-200" : "text-[#0F172A]")}>
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
          disabled={disabled}
          className={cn(
            "peer w-full rounded-[9px] border-[1.5px] px-3.5 py-[11px] text-sm outline-none transition-[border-color,box-shadow] duration-150",
            isDark ? "bg-transparent text-slate-100" : "bg-white text-[#0F172A]",
            icon && "pl-[38px]",
            disabled
              ? isDark ? "cursor-not-allowed bg-white/[0.04] text-slate-500" : "cursor-not-allowed bg-[#F8FAFC] text-[#64748B]"
              : error
                ? "border-[#DC2626] shadow-[0_0_0_3px_rgba(220,38,38,0.08)]"
                : isDark
                  ? "border-white/[0.12] focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)]"
                  : "border-[#E2E8F0] focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)]"
          )}
        />
        {icon && (
          <span className={cn("pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 transition-colors peer-focus:text-[#2563EB]", isDark ? "text-slate-600" : "text-[#CBD5E1]")}>
            {icon}
          </span>
        )}
      </div>
      {error && <span className={cn("text-xs", isDark ? "text-red-400" : "text-[#DC2626]")}>{error}</span>}
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
  isDark,
}: {
  value: string;
  onChange: (v: string) => void;
  min: Date;
  max: Date;
  disabled?: boolean;
  isDark: boolean;
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
          "flex w-full cursor-pointer items-center gap-2 rounded-[9px] border-[1.5px] px-3.5 py-[11px] text-left text-sm outline-none transition-[border-color,box-shadow] duration-150",
          isDark ? "bg-transparent" : "bg-white",
          disabled
            ? isDark ? "cursor-not-allowed bg-white/[0.04] text-slate-500" : "cursor-not-allowed bg-[#F8FAFC] text-[#64748B]"
            : open
              ? isDark
                ? "border-[#2563EB] shadow-[0_0_0_3px_rgba(37,99,235,0.15)] text-slate-100"
                : "border-[#2563EB] shadow-[0_0_0_3px_rgba(37,99,235,0.1)] text-[#0F172A]"
              : isDark
                ? "border-white/[0.12] text-slate-100 hover:border-white/[0.2]"
                : "border-[#E2E8F0] text-[#0F172A] hover:border-[#CBD5E1]"
        )}
      >
        <CalendarClock size={15} className={cn("shrink-0", isDark ? "text-slate-400" : "text-[#64748B]")} />
        {selectedDate ? (
          selectedDate.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
        ) : (
          <span className={isDark ? "text-slate-400" : "text-[#64748B]"}>Pick a date &amp; time</span>
        )}
      </button>

      {open && !disabled && (
        <div
          ref={panelRef}
          className={cn(
            "absolute left-0 z-30 flex overflow-hidden rounded-xl border shadow-lg",
            isDark ? "border-white/[0.1] bg-[#121726]" : "border-[#E2E8F0] bg-white",
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
              caption_label: cn("text-[13px] font-bold", isDark ? "text-slate-100" : "text-[#0F172A]"),
              nav: "absolute inset-x-1 top-0 flex h-8 items-center justify-between",
              button_previous: cn(
                "flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-30",
                isDark ? "text-slate-400 hover:bg-white/[0.08]" : "text-[#64748B] hover:bg-[#F1F5F9]"
              ),
              button_next: cn(
                "flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-30",
                isDark ? "text-slate-400 hover:bg-white/[0.08]" : "text-[#64748B] hover:bg-[#F1F5F9]"
              ),
              month_grid: "w-full border-collapse",
              weekdays: "flex",
              weekday: cn("w-8 text-center text-[10px] font-semibold uppercase tracking-wide", isDark ? "text-slate-500" : "text-[#64748B]"),
              weeks: "mt-1 flex flex-col gap-0.5",
              week: "flex",
              day: "p-0 text-center",
              day_button: cn(
                "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-[13px] transition-colors",
                isDark ? "text-slate-200 hover:bg-white/[0.08]" : "text-[#0F172A] hover:bg-[#F1F5F9]"
              ),
              selected: "[&>button]:bg-[#2563EB] [&>button]:font-semibold [&>button]:text-white [&>button]:hover:bg-[#2563EB]",
              today: "[&>button]:font-bold [&>button]:text-[#2563EB]",
              outside: isDark ? "[&>button]:text-slate-600" : "[&>button]:text-[#CBD5E1]",
              disabled: isDark
                ? "[&>button]:cursor-not-allowed [&>button]:text-slate-700 [&>button]:hover:bg-transparent"
                : "[&>button]:cursor-not-allowed [&>button]:text-[#E2E8F0] [&>button]:hover:bg-transparent",
            }}
            components={{
              Chevron: ({ orientation }) =>
                orientation === "left" ? <ChevronLeft size={14} /> : <ChevronRight size={14} />,
            }}
          />
          <div className={cn("flex w-[168px] flex-col gap-3 border-l p-3.5", isDark ? "border-white/[0.08]" : "border-[#F1F5F9]")}>
            <div className={cn("text-[10px] font-bold uppercase tracking-wider", isDark ? "text-slate-500" : "text-[#64748B]")}>Time</div>
            <div className="flex items-center gap-1.5">
              <select
                value={hour12}
                onChange={(e) => handleTimeChange({ hour12: Number(e.target.value) })}
                className={cn(
                  "h-9 w-full cursor-pointer rounded-[8px] border-[1.5px] text-center text-sm outline-none focus:border-[#2563EB]",
                  isDark ? "border-white/[0.12] bg-transparent text-slate-100" : "border-[#E2E8F0] bg-white text-[#0F172A]"
                )}
              >
                {HOURS_12.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <span className={cn("text-sm font-semibold", isDark ? "text-slate-500" : "text-[#64748B]")}>:</span>
              <select
                value={minute}
                onChange={(e) => handleTimeChange({ minute: Number(e.target.value) })}
                className={cn(
                  "h-9 w-full cursor-pointer rounded-[8px] border-[1.5px] text-center text-sm outline-none focus:border-[#2563EB]",
                  isDark ? "border-white/[0.12] bg-transparent text-slate-100" : "border-[#E2E8F0] bg-white text-[#0F172A]"
                )}
              >
                {MINUTES_60.map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
            <div className={cn("flex w-fit items-center gap-1 rounded-lg p-1", isDark ? "bg-white/[0.06]" : "bg-[#F1F5F9]")}>
              {([false, true] as const).map((pm) => (
                <button
                  key={String(pm)}
                  type="button"
                  onClick={() => handleTimeChange({ pm })}
                  className={cn(
                    "cursor-pointer rounded-md border-none px-3 py-1.5 text-xs font-medium transition-colors",
                    isPm === pm
                      ? isDark ? "bg-white/[0.12] text-slate-100" : "bg-white text-[#0F172A] shadow-sm"
                      : isDark ? "bg-transparent text-slate-400 hover:text-slate-100" : "bg-transparent text-[#64748B] hover:text-[#0F172A]"
                  )}
                >
                  {pm ? "PM" : "AM"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-auto cursor-pointer rounded-[8px] border-none bg-[#2563EB] py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1D4ED8]"
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

function ClassificationCard({
  classification,
  selected,
  onSelect,
  isDark,
}: {
  classification: Classification;
  selected: boolean;
  onSelect: () => void;
  isDark: boolean;
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
        selected
          ? isDark ? cn(meta.darkBorder, meta.darkBg, meta.darkRing) : cn(meta.border, meta.bg, meta.ring)
          : isDark ? "border-white/[0.1] bg-[#121726] hover:border-white/[0.2]" : "border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#CBD5E1]"
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
          selected
            ? isDark ? cn(meta.darkIconBg, meta.darkIconText) : cn(meta.iconBg, meta.iconText)
            : isDark ? "bg-white/[0.06] text-slate-400" : "bg-[#F8FAFC] text-[#64748B]"
        )}
      >
        {meta.icon}
      </div>

      <div className={cn("mb-1 text-sm font-bold", selected ? (isDark ? meta.darkText : meta.text) : isDark ? "text-slate-100" : "text-[#0F172A]")}>
        {classification}
      </div>
      <div className={cn("text-xs leading-relaxed", isDark ? "text-slate-400" : "text-[#64748B]")}>{meta.desc}</div>
    </motion.button>
  );
}

// ─── Review row ───────────────────────────────────────────────────────────────

function ReviewRow({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-2.5">
      <span className={cn("text-xs", isDark ? "text-slate-400" : "text-[#64748B]")}>{label}</span>
      <span className={cn("text-[13px] font-medium", isDark ? "text-slate-100" : "text-[#0F172A]")}>{value}</span>
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
  isDark,
}: {
  projectName: string;
  customerId: string;
  showCustomerId: boolean;
  copied: boolean;
  onCopy: () => void;
  onBack: () => void;
  onView: () => void;
  isDark: boolean;
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

      <h2 className={cn("mb-1.5 text-2xl font-bold tracking-[-0.025em]", isDark ? "text-slate-100" : "text-[#0F172A]")}>
        {projectName} is ready
      </h2>
      <p className={cn("mb-7 text-sm leading-relaxed", isDark ? "text-slate-400" : "text-[#64748B]")}>
        Project created successfully and added to the onboarding queue.
      </p>

      {showCustomerId && (
        <div className={cn("mb-3 flex items-center gap-2 rounded-[10px] border-[1.5px] px-3.5 py-3 text-left", isDark ? "border-white/[0.1] bg-white/[0.04]" : "border-[#E2E8F0] bg-[#F8FAFC]")}>
          <div className="min-w-0 flex-1">
            <div className={cn("mb-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]", isDark ? "text-slate-500" : "text-[#64748B]")}>Customer ID</div>
            <span className={cn("font-mono text-xs", isDark ? "text-slate-100" : "text-[#0F172A]")}>{customerId}</span>
          </div>
          <button
            type="button"
            onClick={onCopy}
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              copied
                ? isDark ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]"
                : isDark ? "border-white/[0.1] bg-transparent text-slate-300" : "border-[#E2E8F0] bg-white text-[#475569]"
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
          className={cn(
            "flex-1 cursor-pointer rounded-[9px] border-[1.5px] px-4 py-[11px] text-[13px] font-medium transition-colors",
            isDark ? "border-white/[0.1] bg-transparent text-slate-100 hover:border-white/[0.2] hover:bg-white/[0.06]" : "border-[#E2E8F0] bg-white text-[#0F172A] hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
          )}
        >
          Back to projects
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

export default function NewProjectWizard({ role }: { role: string | null }) {
  const { settings } = usePMSettings();
  const isDark = settings.theme === "dark";
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
    <div className={cn("flex min-h-full flex-col items-center px-6 py-10", isDark ? "bg-[#070E1F]" : "bg-[#F8FAFC]")}>
      {!success && (
        <div className="mb-2 w-full max-w-[560px]">
          <button
            type="button"
            onClick={goBack}
            className={cn("flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-xs transition-colors hover:text-[#2563EB]", isDark ? "text-slate-400" : "text-[#64748B]")}
          >
            <ArrowLeft size={13} />
            {step === 1 ? "Back to projects" : "Previous step"}
          </button>
        </div>
      )}

      <div className={cn(
        "w-full max-w-[560px] rounded-2xl border px-10 py-9",
        isDark ? "border-white/[0.08] bg-[#121726]" : "border-[#E2E8F0] bg-white shadow-[0_4px_24px_rgba(15,23,42,0.07)]"
      )}>
        {success ? (
          <SuccessScreen
            projectName={displayedProjectName}
            customerId={success.customer_id}
            showCustomerId={success.isNewCustomer}
            copied={copied}
            onCopy={() => copyCustomerId(success.customer_id)}
            onBack={() => router.push(V2_ROUTES.PORTFOLIO_TRACKER)}
            onView={() => router.push(`${V2_ROUTES.PORTFOLIO_TRACKER}/${success.project_id}`)}
            isDark={isDark}
          />
        ) : (
          <>
            <StepIndicator current={step} isDark={isDark} />

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
                      <h2 className={cn("mb-1 text-xl font-bold tracking-[-0.02em]", isDark ? "text-slate-100" : "text-[#0F172A]")}>
                        Company &amp; contact
                      </h2>
                      <p className={cn("text-[13px]", isDark ? "text-slate-400" : "text-[#64748B]")}>
                        This will be used to set up the customer&apos;s workspace and this project&apos;s onboarding.
                      </p>
                    </div>

                    <div className={cn("mb-5 flex w-fit items-center gap-1 rounded-lg p-1", isDark ? "bg-white/[0.06]" : "bg-[#F1F5F9]")}>
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
                            companyMode === m
                              ? isDark ? "bg-white/[0.12] text-slate-100" : "bg-white text-[#0F172A] shadow-sm"
                              : isDark ? "bg-transparent text-slate-400 hover:text-slate-100" : "bg-transparent text-[#64748B] hover:text-[#0F172A]"
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
                          isDark={isDark}
                        />
                      ) : selectedCustomer ? (
                        <div>
                          <label className={cn("mb-1.5 flex items-center gap-1 text-[13px] font-medium", isDark ? "text-slate-200" : "text-[#0F172A]")}>
                            Company <span className="text-[#2563EB]">*</span>
                          </label>
                          <div className={cn("flex items-center justify-between gap-2 rounded-[9px] border-[1.5px] px-3.5 py-2.5", isDark ? "border-white/[0.1] bg-white/[0.04]" : "border-[#E2E8F0] bg-[#F8FAFC]")}>
                            <div className="min-w-0">
                              <div className={cn("truncate text-sm font-medium", isDark ? "text-slate-100" : "text-[#0F172A]")}>{selectedCustomer.company_name}</div>
                              <div className={cn("font-mono truncate text-[11px]", isDark ? "text-slate-400" : "text-[#64748B]")}>{selectedCustomer.customer_id}</div>
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
                          <label className={cn("mb-1.5 flex items-center gap-1 text-[13px] font-medium", isDark ? "text-slate-200" : "text-[#0F172A]")}>
                            Company <span className="text-[#2563EB]">*</span>
                          </label>
                          <div className="relative">
                            <input
                              value={existingSearch}
                              onChange={(e) => handleSearchChange(e.target.value)}
                              placeholder="Search existing customers…"
                              className={cn(
                                "w-full rounded-[9px] border-[1.5px] py-2.75 pl-8.5 pr-3.5 text-sm outline-none transition-colors focus:border-[#2563EB]",
                                isDark ? "border-white/[0.12] bg-transparent text-slate-100" : "border-[#E2E8F0] bg-white text-[#0F172A]"
                              )}
                            />
                            <Search size={14} className={cn("pointer-events-none absolute left-3 top-1/2 -translate-y-1/2", isDark ? "text-slate-400" : "text-[#64748B]")} />
                          </div>
                          {existingSearch.trim() && (
                            <div className={cn("mt-1.5 max-h-48 overflow-y-auto rounded-[9px] border", isDark ? "border-white/[0.1] bg-[#121726]" : "border-[#E2E8F0] bg-white shadow-sm")}>
                              {searching ? (
                                <div className={cn("px-3.5 py-2.5 text-xs", isDark ? "text-slate-400" : "text-[#64748B]")}>Searching…</div>
                              ) : existingMatches.length === 0 ? (
                                <div className={cn("px-3.5 py-2.5 text-xs", isDark ? "text-slate-400" : "text-[#64748B]")}>No matches.</div>
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
                                    className={cn(
                                      "block w-full cursor-pointer border-none bg-transparent px-3.5 py-2 text-left text-[13px]",
                                      isDark ? "text-slate-100 hover:bg-white/[0.06]" : "text-[#0F172A] hover:bg-[#F8FAFC]"
                                    )}
                                  >
                                    {c.company_name} <span className={cn("font-mono text-[11px]", isDark ? "text-slate-400" : "text-[#64748B]")}>{c.customer_id}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {companyMode === "existing" && errors1.companyName && (
                        <span className={cn("text-xs", isDark ? "text-red-400" : "text-[#DC2626]")}>{errors1.companyName}</span>
                      )}

                      <div className={cn("h-px", isDark ? "bg-white/[0.08]" : "bg-[#F1F5F9]")} />

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
                        isDark={isDark}
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
                          isDark={isDark}
                        />
                        <Field
                          id="contact-phone"
                          label="Phone"
                          value={contactPhone}
                          onChange={setContactPhone}
                          placeholder={contactLoading ? "Loading phone number…" : "Optional"}
                          icon={<Phone size={15} />}
                          disabled={contactLoading}
                          isDark={isDark}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div>
                    <div className="mb-6">
                      <h2 className={cn("mb-1 text-xl font-bold tracking-[-0.02em]", isDark ? "text-slate-100" : "text-[#0F172A]")}>
                        Project details
                      </h2>
                      <p className={cn("text-[13px]", isDark ? "text-slate-400" : "text-[#64748B]")}>
                        Choose the engagement type. This drives which product and project type get created.
                      </p>
                    </div>

                    <div className="mb-6 flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-3">
                        {CLASSIFICATIONS.map((c) => (
                          <ClassificationCard key={c} classification={c} selected={classifications.includes(c)} onSelect={() => toggleClassification(c)} isDark={isDark} />
                        ))}
                      </div>
                      {classificationError && <span className={cn("text-xs", isDark ? "text-red-400" : "text-[#DC2626]")}>{classificationError}</span>}
                    </div>

                    <div className={cn("mb-6 h-px", isDark ? "bg-white/[0.08]" : "bg-[#F1F5F9]")} />

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
                        isDark={isDark}
                      />
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div>
                    <div className="mb-6">
                      <h2 className={cn("mb-1 text-xl font-bold tracking-[-0.02em]", isDark ? "text-slate-100" : "text-[#0F172A]")}>
                        Review &amp; create
                      </h2>
                      <p className={cn("text-[13px]", isDark ? "text-slate-400" : "text-[#64748B]")}>Confirm the details below before creating this project.</p>
                    </div>

                    <div className={cn(
                      "mb-4 rounded-xl border px-5 py-1",
                      isDark ? "divide-y divide-white/[0.08] border-white/[0.1] bg-white/[0.03]" : "divide-y divide-[#F1F5F9] border-[#E2E8F0] bg-[#F8FAFC]"
                    )}>
                      <ReviewRow label="Company" value={companyName || "—"} isDark={isDark} />
                      <ReviewRow label="Primary contact" value={contactName || "—"} isDark={isDark} />
                      <ReviewRow label="Contact email" value={contactEmail || "—"} isDark={isDark} />
                      {contactPhone.trim() && <ReviewRow label="Phone" value={contactPhone} isDark={isDark} />}
                      <ReviewRow label="Classification" value={classifications.length > 0 ? classifications.join(", ") : "—"} isDark={isDark} />
                      <ReviewRow label="Project name" value={displayedProjectName || "—"} isDark={isDark} />
                      {scheduledAt && (
                        <ReviewRow
                          label="Scheduled start"
                          value={new Date(scheduledAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          isDark={isDark}
                        />
                      )}
                    </div>

                    {companyMode === "new" && (
                      <div className={cn(
                        "mb-1 flex items-center gap-2.5 rounded-[10px] border px-4 py-3.5",
                        isDark ? "border-amber-500/25 bg-amber-500/10" : "border-[rgba(245,158,11,0.3)] bg-gradient-to-r from-[rgba(245,158,11,0.08)] to-[rgba(249,115,22,0.08)]"
                      )}>
                        <Sparkles size={14} className="shrink-0 text-[#F97316]" />
                        <span className={cn("text-xs leading-snug", isDark ? "text-amber-300" : "text-[#92400E]")}>
                          A unique customer ID (<span className="font-mono">WRQ-CUST-XXXX</span>) will be generated for this new company.
                        </span>
                      </div>
                    )}

                    {submitError && <p className={cn("mt-3 text-xs", isDark ? "text-red-400" : "text-[#DC2626]")}>{submitError}</p>}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {step < 3 ? (
              <div className="mt-7 flex items-center justify-between">
                <button
                  type="button"
                  onClick={goBack}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-[9px] border-[1.5px] bg-transparent px-4 py-2.5 text-[13px] font-medium transition-colors",
                    isDark ? "border-white/[0.1] text-slate-300 hover:border-white/[0.2] hover:bg-white/[0.06]" : "border-[#E2E8F0] text-[#475569] hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
                  )}
                >
                  <ArrowLeft size={14} />
                  {step === 1 ? "Cancel" : "Back"}
                </button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={goNext}
                  disabled={validatingStep}
                  className="flex cursor-pointer items-center gap-1.5 rounded-[9px] border-none bg-[#2563EB] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(37,99,235,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {validatingStep ? "Checking…" : (
                    <>
                      Continue <ArrowRight size={14} />
                    </>
                  )}
                </motion.button>
              </div>
            ) : (
              <div className="mt-7 flex flex-col gap-2.5">
                {canManagePhases && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="start-phase" className={cn("text-[13px] font-medium", isDark ? "text-slate-200" : "text-[#0F172A]")}>
                      Start at phase
                    </label>
                    <select
                      id="start-phase"
                      value={startPhase}
                      onChange={(e) => setStartPhase(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                      disabled={!!submitting}
                      className={cn(
                        "h-[42px] w-full cursor-pointer appearance-none rounded-[9px] border-[1.5px] px-3.5 pr-8 text-sm outline-none transition-colors focus:border-[#2563EB] disabled:cursor-not-allowed disabled:opacity-60",
                        isDark ? "border-white/[0.12] bg-transparent text-slate-100" : "border-[#E2E8F0] bg-white text-[#0F172A]"
                      )}
                      style={{
                        backgroundImage:
                          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2394a3b8'/%3E%3C/svg%3E\")",
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
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => (canManagePhases ? startAtPhase(startPhase) : submit("start"))}
                    disabled={!!submitting}
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[9px] border-none bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] px-5 py-3 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(37,99,235,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
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
                  </motion.button>
                )}
                {scheduleExpanded && (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label htmlFor="scheduled-start" className={cn("mb-1.5 block text-[13px] font-medium", isDark ? "text-slate-200" : "text-[#0F172A]")}>
                        Scheduled start
                      </label>
                      <DateTimePicker value={scheduledAt} onChange={setScheduledAt} min={scheduleMin} max={scheduleMax} isDark={isDark} />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setScheduleExpanded(false);
                        setScheduledAt("");
                        setSubmitError(null);
                      }}
                      aria-label="Cancel scheduling"
                      className={cn(
                        "mb-0.5 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[9px] border-[1.5px] bg-transparent transition-colors",
                        isDark ? "border-white/[0.12] text-slate-400 hover:border-white/[0.2] hover:bg-white/[0.06]" : "border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
                      )}
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
                    className={cn(
                      "flex-1 cursor-pointer rounded-[9px] border-[1.5px] bg-transparent px-4 py-2.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      isDark ? "border-white/[0.1] text-slate-300 hover:border-white/[0.2] hover:bg-white/[0.06]" : "border-[#E2E8F0] text-[#475569] hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
                    )}
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
                      "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      scheduleExpanded
                        ? "border-none bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] font-semibold text-white shadow-[0_2px_10px_rgba(37,99,235,0.3)]"
                        : isDark
                          ? "border-[1.5px] border-white/[0.1] bg-transparent px-4 py-2.5 text-slate-300 hover:border-white/[0.2] hover:bg-white/[0.06]"
                          : "border-[1.5px] border-[#E2E8F0] bg-transparent px-4 py-2.5 text-[#475569] hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
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
                  className={cn(
                    "mt-1 flex cursor-pointer items-center gap-1.5 self-start border-none bg-transparent px-1 py-1 text-xs font-medium transition-colors hover:text-[#2563EB] disabled:opacity-60",
                    isDark ? "text-slate-400" : "text-[#64748B]"
                  )}
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
