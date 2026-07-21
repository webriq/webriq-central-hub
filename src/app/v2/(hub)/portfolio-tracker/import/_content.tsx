"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  FileSpreadsheet,
  Check,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePMSettings } from "@/hooks/use-pm-settings";
import { V2_ROUTES } from "@/config/constants";
import { CLASSIFICATIONS, type Classification, STACKSHIFT_VARIANTS, PROGRAMME_PHASES, getCurrentProgrammeDay } from "@/config/customer-phases";

type Step = 1 | 2;

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: "Upload File" },
  { id: 2, label: "Review & Fix" },
];

const stepVariants = {
  enter: (d: number) => ({ opacity: 0, x: d * 28 }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: d * -20 }),
};

// Same hue groupings as the New Project wizard's CLASSIFICATION_META (../new/_content.tsx) —
// not imported directly since that map is private to that page (page-scoped UI convention);
// this is the condensed subset this page's compact chips actually need. Light values are the
// original pale-tint design; dark values swap the tint for a translucent wash of the same hue
// plus a brighter 400-shade text (the pale light-mode hex would read as a near-white blob on a
// dark surface).
const TYPE_CHIP_COLORS: Record<Classification, { bg: string; text: string; border: string; darkBg: string; darkText: string; darkBorder: string }> = {
  "StackShift I": { bg: "bg-[#EFF6FF]", text: "text-[#2563EB]", border: "border-[#2563EB]", darkBg: "bg-blue-500/15", darkText: "text-blue-400", darkBorder: "border-blue-500/40" },
  "StackShift II": { bg: "bg-[#EFF6FF]", text: "text-[#2563EB]", border: "border-[#2563EB]", darkBg: "bg-blue-500/15", darkText: "text-blue-400", darkBorder: "border-blue-500/40" },
  "StackShift Access": { bg: "bg-[#F5F3FF]", text: "text-[#7C3AED]", border: "border-[#7C3AED]", darkBg: "bg-violet-500/15", darkText: "text-violet-400", darkBorder: "border-violet-500/40" },
  "StackShift Access Plus": { bg: "bg-[#F5F3FF]", text: "text-[#7C3AED]", border: "border-[#7C3AED]", darkBg: "bg-violet-500/15", darkText: "text-violet-400", darkBorder: "border-violet-500/40" },
  PipelineForge: { bg: "bg-[#F0FDFA]", text: "text-[#0D9488]", border: "border-[#0D9488]", darkBg: "bg-teal-500/15", darkText: "text-teal-400", darkBorder: "border-teal-500/40" },
  "Discrete Development": { bg: "bg-[#FFF7ED]", text: "text-[#F97316]", border: "border-[#F97316]", darkBg: "bg-orange-500/15", darkText: "text-orange-400", darkBorder: "border-orange-500/40" },
};

type ImportRow = {
  id: string;
  account: string;
  classifications: Classification[];
  primaryContact: string;
  primaryContactRaw: string | null; // original sheet text when it was a placeholder value (see resolvePrimaryContact)
  kickoffDate: string; // yyyy-mm-dd, "" = default to now
  currentPhase: string; // PROGRAMME_PHASES[n].name, "" = default to Phase 1
};

// "Customer"/"Project Type" are this page's display names (renamed from the original
// "Account"/"Type" task-159 spec for clarity) — both old and new header text are accepted so
// files built against either naming still import correctly.
const IMPORT_HEADERS = {
  account: ["account", "customer"],
  type: ["type", "project type"],
  primaryContact: ["primary contact"],
  kickoffDate: ["kickoff date"],
  currentPhase: ["current phase"],
} as const;

function normalizeSheetRow(raw: Record<string, unknown>) {
  const lowerEntries = Object.entries(raw).map(([k, v]) => [k.trim().toLowerCase(), v] as const);
  const pick = (candidates: readonly string[]) => {
    const hit = lowerEntries.find(([k]) => candidates.includes(k));
    return hit ? String(hit[1] ?? "").trim() : "";
  };
  // Kickoff Date keeps its raw (possibly numeric) value instead of being stringified here —
  // resolveDate() needs to tell an Excel date-serial number apart from sheet text itself.
  const pickRaw = (candidates: readonly string[]): unknown => {
    const hit = lowerEntries.find(([k]) => candidates.includes(k));
    return hit ? hit[1] : "";
  };
  return {
    account: pick(IMPORT_HEADERS.account),
    type: pick(IMPORT_HEADERS.type),
    primaryContact: pick(IMPORT_HEADERS.primaryContact),
    kickoffDate: pickRaw(IMPORT_HEADERS.kickoffDate),
    currentPhase: pick(IMPORT_HEADERS.currentPhase),
  };
}

// Same delimited-list + at-most-one-StackShift-variant rule the import route enforces
// server-side — best-effort auto-resolve from the sheet's raw text so most rows need zero
// manual fixing; anything that doesn't match cleanly is left for the row's TypeChips picker
// (below) to fix rather than guessed at.
function resolveClassifications(raw: string): Classification[] {
  const parts = raw.split(/[,/+&]/).map((p) => p.trim()).filter(Boolean);
  const resolved: Classification[] = [];
  for (const part of parts) {
    const match = CLASSIFICATIONS.find((c) => c.toLowerCase() === part.toLowerCase());
    if (!match || resolved.includes(match)) continue;
    if (STACKSHIFT_VARIANTS.includes(match) && resolved.some((r) => STACKSHIFT_VARIANTS.includes(r))) continue;
    resolved.push(match);
  }
  return resolved;
}

// Deliberately lenient — real spreadsheets label this column all sorts of ways ("Phase 2",
// "P2", a bare "2", "Migrate", "Migrate and Rebrand" instead of "Migrate & Rebrand"). Tries,
// in order: a phase number embedded in the text, an exact name/shortName match, then a
// substring match either direction. Only an empty cell resolves to "" (→ defaults to Phase 1);
// anything present that still can't be matched also falls back to "" rather than guessing.
function resolvePhase(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const needle = trimmed.toLowerCase();

  const numMatch = needle.match(/^p(?:hase)?\s*(\d)$/) ?? needle.match(/^(\d)$/) ?? needle.match(/phase\s*(\d)/);
  if (numMatch) {
    const byNumber = PROGRAMME_PHASES.find((p) => p.number === Number(numMatch[1]));
    if (byNumber) return byNumber.name;
  }

  const exact = PROGRAMME_PHASES.find((p) => p.name.toLowerCase() === needle || p.shortName.toLowerCase() === needle);
  if (exact) return exact.name;

  const partial = PROGRAMME_PHASES.find((p) => {
    const name = p.name.toLowerCase();
    const shortName = p.shortName.toLowerCase();
    return needle.includes(shortName) || shortName.includes(needle) || needle.includes(name) || name.includes(needle);
  });
  return partial?.name ?? "";
}

// "To be confirmed"/"Unknown" aren't real contact names — clearing them leaves the optional
// field genuinely empty (so it reads as "not yet known" rather than a placeholder string
// getting written to the customer record), while the original sheet text is kept for display
// so the user can see what the source actually said.
const PRIMARY_CONTACT_PLACEHOLDERS = ["to be confirmed", "unknown"];

function resolvePrimaryContact(raw: string): { value: string; placeholder: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: "", placeholder: null };
  if (PRIMARY_CONTACT_PLACEHOLDERS.includes(trimmed.toLowerCase())) {
    return { value: "", placeholder: trimmed };
  }
  return { value: trimmed, placeholder: null };
}

// This codebase's source files write Kickoff Date as day-first (DD-MM-YYYY / DD/MM/YYYY), not
// the US month-first convention `new Date(string)` assumes — "09/07/2026" must resolve to July
// 9, not September 7. `raw` is the cell's untouched value from `sheet_to_json({ raw: true })`:
// a number for a genuine Excel date-typed cell (no string-format ambiguity possible — decoded
// via the standard Excel-serial epoch), otherwise the literal sheet text.
function resolveDate(raw: unknown): string {
  if (raw === "" || raw == null) return "";
  const pad = (n: number) => String(n).padStart(2, "0");

  if (typeof raw === "number") {
    // Excel/Lotus serial date: day 0 = 1899-12-30 (the historic Lotus 1-2-3 leap-year bug
    // Excel inherited); 25569 is the day-count offset between that epoch and 1970-01-01 UTC.
    const utcDays = Math.floor(raw - 25569);
    const d = new Date(utcDays * 86_400_000);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  const trimmed = String(raw).trim();
  if (!trimmed) return "";

  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;

  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Phase 1 (Onboard) is a fixed 15-day window. A row that's still tagged Phase 1 (explicitly or
// by the blank/default) whose Kickoff Date is more than 15 days in the past should already be
// in a later phase — flagged here so the user notices before importing stale sheet data as-is.
function isOverdue(kickoffDate: string, currentPhase: string): boolean {
  if (!kickoffDate) return false;
  const phaseNumber = currentPhase ? PROGRAMME_PHASES.find((p) => p.name === currentPhase)?.number ?? 1 : 1;
  if (phaseNumber !== 1) return false;
  return getCurrentProgrammeDay(kickoffDate) > 15;
}

// Mirrors the New Project wizard's toggleClassification exactly (../new/_content.tsx) — at
// most one StackShift variant at a time (swap, not blocked); PipelineForge/Discrete
// Development combine freely with it or each other.
function toggleClassification(current: Classification[], c: Classification): Classification[] {
  if (current.includes(c)) return current.filter((x) => x !== c);
  if (STACKSHIFT_VARIANTS.includes(c)) {
    return [...current.filter((x) => !STACKSHIFT_VARIANTS.includes(x)), c];
  }
  return [...current, c];
}

// ─── Step indicator (mirrors ../new/_content.tsx's, 2 steps instead of 3) ──────────────────

function StepIndicator({ current, isDark }: { current: Step; isDark: boolean }) {
  return (
    <div className="mb-8 flex items-center">
      {STEPS.map((step, i) => {
        const done = step.id < current;
        const active = step.id === current;
        return (
          <div key={step.id} className={cn("flex items-center", i < STEPS.length - 1 ? "flex-1" : "flex-none")}>
            <div className="flex flex-col items-center gap-2">
              <motion.div
                animate={{
                  background: done || active ? "#2563EB" : isDark ? "rgba(255,255,255,0.08)" : "#E2E8F0",
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
                    : done ? "font-normal text-[#2563EB]" : isDark ? "font-normal text-slate-400" : "font-normal text-[#64748B]"
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <motion.div
                animate={{ background: done ? "#2563EB" : isDark ? "rgba(255,255,255,0.08)" : "#E2E8F0" }}
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

// ─── Per-row Project Type picker — compact search-and-select-multiple combobox. Selected
// values render as small colored pills on the trigger; the option list opens in a
// document.body portal (position computed from the trigger's rect, mirroring ../new/_content
// .tsx's DateTimePicker pattern) so it's never clipped by the review table's horizontal-scroll
// container. Still enforces the New Project wizard's exact grouping rule via
// toggleClassification: at most one StackShift variant at a time, PipelineForge/Discrete
// Development combine freely with it or each other. ─────────────────────────────────────────

function TypeMultiSelect({ value, onChange, isDark }: { value: Classification[]; onChange: (v: Classification[]) => void; isDark: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function place() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const filtered = CLASSIFICATIONS.filter((c) => c.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      {/* A real <button> can't nest the per-pill remove <button>s (invalid HTML, breaks click
          handling) — role="button" + onKeyDown keeps this keyboard-operable as a div instead. */}
      <div
        ref={triggerRef}
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className={cn(
          "flex min-h-[34px] w-[190px] cursor-pointer flex-wrap items-center gap-1 rounded-[7px] border-[1.5px] px-2 py-1 text-left outline-none transition-colors",
          isDark ? "bg-white/[0.03]" : "bg-white",
          open ? "border-[#2563EB]" : isDark ? "border-white/[0.12] hover:border-white/[0.25]" : "border-[#E2E8F0] hover:border-[#CBD5E1]"
        )}
      >
        {value.length === 0 ? (
          <span className={cn("inline-flex items-center gap-1 text-[11.5px]", isDark ? "text-slate-500" : "text-[#64748B]")}>
            <Search size={11} /> Search &amp; select…
          </span>
        ) : (
          value.map((c) => {
            const meta = TYPE_CHIP_COLORS[c];
            return (
              <span
                key={c}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border py-0.5 pl-1.5 pr-1 text-[10px] font-medium",
                  isDark ? [meta.darkBg, meta.darkText, meta.darkBorder] : [meta.bg, meta.text, meta.border]
                )}
              >
                {c}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(value.filter((x) => x !== c));
                  }}
                  aria-label={`Remove ${c}`}
                  className="cursor-pointer rounded-full p-0.5 transition-colors hover:bg-black/10"
                >
                  <X size={9} strokeWidth={2.5} />
                </button>
              </span>
            );
          })
        )}
      </div>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className={cn("z-50 overflow-hidden rounded-lg border shadow-lg", isDark ? "border-white/[0.1] bg-[#121726]" : "border-[#E2E8F0] bg-white")}
          >
            <div className={cn("border-b p-2", isDark ? "border-white/[0.08]" : "border-[#F1F5F9]")}>
              <div className="relative">
                <Search size={12} className={cn("pointer-events-none absolute left-2 top-1/2 -translate-y-1/2", isDark ? "text-slate-500" : "text-[#64748B]")} />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search types…"
                  className={cn(
                    "w-full rounded-md border py-1 pl-6 pr-2 text-[12px] outline-none focus:border-[#2563EB]",
                    isDark ? "border-white/[0.12] bg-transparent text-slate-100 placeholder:text-slate-500" : "border-[#E2E8F0] text-[#0F172A] placeholder:text-[#64748B]"
                  )}
                />
              </div>
            </div>
            <div className="max-h-[180px] overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <div className={cn("px-2 py-2 text-[11.5px]", isDark ? "text-slate-400" : "text-[#64748B]")}>No matches</div>
              ) : (
                filtered.map((c) => {
                  const selected = value.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onChange(toggleClassification(value, c))}
                      className={cn(
                        "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors",
                        isDark ? "hover:bg-white/[0.06]" : "hover:bg-[#F8FAFC]",
                        selected && (isDark ? "bg-blue-500/15" : "bg-[#EFF6FF]")
                      )}
                    >
                      <span className={selected ? (isDark ? "font-medium text-slate-100" : "font-medium text-[#0F172A]") : (isDark ? "text-slate-400" : "text-[#475569]")}>{c}</span>
                      {selected && <Check size={12} className="text-[#2563EB]" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

// ─── Main wizard ────────────────────────────────────────────────────────────────────────

export default function ImportProjectWizard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { settings } = usePMSettings();
  const isDark = settings.theme === "dark";

  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState<1 | -1>(1);

  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; errors: { row: number; error: string }[] } | null>(null);

  async function handleFile(file: File) {
    setParseError(null);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      // raw: true (both here and in sheet_to_json below) — without it, SheetJS auto-detects
      // date-like CSV text and silently re-parses/reformats it assuming US month-first order,
      // which corrupts an unambiguous day-first "09/07/2026" into September instead of July.
      // With raw: true, CSV text cells are returned exactly as typed and genuine Excel
      // date-typed cells (real .xlsx/.xls files) come back as their numeric serial — both
      // handled explicitly in resolveDate().
      const workbook = XLSX.read(buffer, { type: "array", raw: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
      if (raw.length === 0) {
        setParseError("No rows found in this file.");
        return;
      }
      const parsed: ImportRow[] = raw.map((r) => {
        const n = normalizeSheetRow(r);
        const contact = resolvePrimaryContact(n.primaryContact);
        return {
          id: crypto.randomUUID(),
          account: n.account,
          classifications: resolveClassifications(n.type),
          primaryContact: contact.value,
          primaryContactRaw: contact.placeholder,
          kickoffDate: resolveDate(n.kickoffDate),
          currentPhase: resolvePhase(n.currentPhase),
        };
      });
      setRows(parsed);
      setDirection(1);
      setStep(2);
    } catch {
      setParseError("Failed to read this file — confirm it's a valid CSV or Excel file.");
    }
  }

  function updateRow(id: string, patch: Partial<ImportRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function needsAttention(row: ImportRow): string | null {
    if (!row.account.trim()) return "Customer is required";
    if (row.classifications.length === 0) return "Select at least one Project Type";
    return null;
  }

  const attentionCount = rows.filter((r) => needsAttention(r)).length;
  const importableCount = rows.length - attentionCount;

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/onboarding/projects/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: rows.map((r) => ({
            account: r.account,
            type: r.classifications.join(","),
            primaryContact: r.primaryContact || undefined,
            kickoffDate: r.kickoffDate || undefined,
            currentPhase: r.currentPhase || undefined,
          })),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to import");
      }
      const data = (await res.json()) as { imported: number; errors: { row: number; error: string }[] };
      setResult(data);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to import");
    } finally {
      setSubmitting(false);
    }
  }

  function resetToUpload() {
    setStep(1);
    setDirection(-1);
    setRows([]);
    setFileName(null);
    setResult(null);
    setSubmitError(null);
  }

  function goBack() {
    if (step === 1) {
      router.push(V2_ROUTES.PORTFOLIO_TRACKER);
      return;
    }
    resetToUpload();
  }

  return (
    <div className={cn("flex min-h-full flex-col items-center px-6 py-10", isDark ? "bg-sidebar-dark" : "bg-[#F8FAFC]")}>
      {!result && (
        <div className="mb-2 w-full max-w-300">
          <button
            type="button"
            onClick={goBack}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-xs transition-colors",
              isDark ? "text-slate-400 hover:text-[#60A5FA]" : "text-[#64748B] hover:text-[#2563EB]"
            )}
          >
            <ArrowLeft size={13} />
            {step === 1 ? "Back to projects" : "Choose a different file"}
          </button>
        </div>
      )}

      <div className={cn(
        "w-full max-w-300 rounded-2xl border px-10 py-9",
        isDark ? "border-white/8 bg-[#121726]" : "border-[#E2E8F0] bg-white shadow-[0_4px_24px_rgba(15,23,42,0.07)]"
      )}>
        {result ? (
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
                "mx-auto mb-6 flex h-18 w-18 items-center justify-center rounded-full shadow-[0_4px_20px_rgba(34,197,94,0.35)]",
                result.imported > 0 ? "bg-linear-to-br from-[#22C55E] to-[#16A34A]" : "bg-linear-to-br from-brand-orange to-[#EA580C]"
              )}
            >
              {result.imported > 0 ? (
                <Check size={34} color="#FFFFFF" strokeWidth={2.5} />
              ) : (
                <AlertCircle size={34} color="#FFFFFF" strokeWidth={2.5} />
              )}
            </motion.div>

            <h2 className={cn("mb-1.5 text-2xl font-bold tracking-tight", isDark ? "text-slate-100" : "text-[#0F172A]")}>
              {result.imported} project{result.imported === 1 ? "" : "s"} imported
            </h2>
            <p className={cn("mb-7 text-sm leading-relaxed", isDark ? "text-slate-400" : "text-[#64748B]")}>
              {result.errors.length > 0
                ? `${result.errors.length} row${result.errors.length === 1 ? "" : "s"} failed and were skipped — see below.`
                : "All rows imported successfully."}
            </p>

            {result.errors.length > 0 && (
              <div className={cn("mb-6 max-h-70 overflow-y-auto rounded-[10px] border text-left", isDark ? "border-white/8" : "border-[#E2E8F0]")}>
                {result.errors.map((e, i) => (
                  <div
                    key={i}
                    className={cn(
                      "px-4 py-2.5 text-[12.5px]",
                      isDark ? "text-slate-300" : "text-[#475569]",
                      i > 0 && (isDark ? "border-t border-white/6" : "border-t border-[#F1F5F9]")
                    )}
                  >
                    <span className={cn("font-semibold", isDark ? "text-slate-100" : "text-[#0F172A]")}>
                      Row {e.row}{rows[e.row - 1]?.account ? ` (${rows[e.row - 1].account})` : ""}:
                    </span>{" "}
                    {e.error}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={resetToUpload}
                className={cn(
                  "flex-1 cursor-pointer rounded-[9px] border-[1.5px] px-4 py-2.75 text-[13px] font-medium transition-colors",
                  isDark ? "border-white/10 bg-transparent text-slate-100 hover:bg-white/6" : "border-[#E2E8F0] bg-white text-[#0F172A] hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
                )}
              >
                Import another file
              </button>
              <button
                type="button"
                onClick={() => router.push(V2_ROUTES.PORTFOLIO_TRACKER)}
                className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border-none bg-[#2563EB] px-4 py-2.75 text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(37,99,235,0.3)] transition-colors hover:bg-[#1D4ED8]"
              >
                Back to projects <ArrowRight size={13} />
              </button>
            </div>
          </motion.div>
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
                        Import Project
                      </h2>
                      <p className={cn("text-[13px]", isDark ? "text-slate-400" : "text-[#64748B]")}>
                        Upload a CSV or Excel file to bulk-create onboarding projects. Expected columns:{" "}
                        <span className={cn("font-medium", isDark ? "text-slate-200" : "text-[#0F172A]")}>Customer, Project Type, Primary Contact, Kickoff Date, Current Phase</span>.
                      </p>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                      }}
                    />
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f) handleFile(f);
                      }}
                      className={cn(
                        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-[1.5px] border-dashed px-6 py-16 text-center transition-colors",
                        dragOver
                          ? isDark ? "border-[#2563EB] bg-blue-500/10" : "border-[#2563EB] bg-[#EFF6FF]"
                          : isDark ? "border-white/12 bg-white/3 hover:border-white/25" : "border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#CBD5E1]"
                      )}
                    >
                      <div className={cn("flex h-12 w-12 items-center justify-center rounded-[12px] text-[#2563EB]", isDark ? "bg-[#2563EB]/20" : "bg-[#2563EB]/10")}>
                        <Upload size={22} />
                      </div>
                      <div>
                        <div className={cn("text-sm font-semibold", isDark ? "text-slate-100" : "text-[#0F172A]")}>Click to upload or drag and drop</div>
                        <div className={cn("mt-0.5 text-xs", isDark ? "text-slate-400" : "text-[#64748B]")}>.csv, .xlsx, or .xls</div>
                      </div>
                    </div>

                    {parseError && (
                      <p className={cn("mt-3 flex items-center gap-1.5 text-xs", isDark ? "text-red-400" : "text-[#DC2626]")}>
                        <AlertCircle size={13} /> {parseError}
                      </p>
                    )}
                  </div>
                )}

                {step === 2 && (
                  <div>
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <h2 className={cn("mb-1 text-xl font-bold tracking-[-0.02em]", isDark ? "text-slate-100" : "text-[#0F172A]")}>
                          Review &amp; fix
                        </h2>
                        <p className={cn("flex items-center gap-1.5 text-[13px]", isDark ? "text-slate-400" : "text-[#64748B]")}>
                          <FileSpreadsheet size={13} /> {fileName} · {rows.length} row{rows.length === 1 ? "" : "s"} parsed
                        </p>
                      </div>
                      {attentionCount > 0 ? (
                        <span className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium",
                          isDark ? "border-orange-500/30 bg-orange-500/15 text-orange-400" : "border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C]"
                        )}>
                          <AlertCircle size={12} /> {attentionCount} row{attentionCount === 1 ? "" : "s"} need attention
                        </span>
                      ) : (
                        <span className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium",
                          isDark ? "border-green-500/30 bg-green-500/15 text-green-400" : "border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]"
                        )}>
                          <CheckCircle2 size={12} /> All rows ready
                        </span>
                      )}
                    </div>

                    {rows.length === 0 ? (
                      <div className={cn("rounded-xl border px-6 py-12 text-center text-sm", isDark ? "border-white/8 bg-white/3 text-slate-400" : "border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]")}>
                        No rows left. Choose a different file to continue.
                      </div>
                    ) : (
                      <div className={cn("overflow-x-auto rounded-xl border", isDark ? "border-white/8" : "border-[#E2E8F0]")}>
                        <table className="w-full border-collapse text-[12.5px]">
                          <thead className={cn(isDark ? "bg-white/3 text-slate-400" : "bg-[#F8FAFC] text-[#64748B]")}>
                            <tr>
                              <th className="px-3 py-2.5 text-left font-medium">Customer</th>
                              <th className="px-3 py-2.5 text-left font-medium">Project Type</th>
                              <th className="px-3 py-2.5 text-left font-medium">Primary Contact</th>
                              <th className="px-3 py-2.5 text-left font-medium">Kickoff Date</th>
                              <th className="px-3 py-2.5 text-left font-medium">Current Phase</th>
                              <th className="px-2 py-2.5" />
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, rowIdx) => {
                              const attention = needsAttention(row);
                              return (
                                <tr key={row.id} className={cn(
                                  isDark ? "border-t border-white/6" : "border-t border-[#F1F5F9]",
                                  attention && (isDark ? "bg-orange-500/8" : "bg-[#FFF7ED]/40")
                                )}>
                                  <td className="px-3 py-2.5 align-top">
                                    <input
                                      value={row.account}
                                      onChange={(e) => updateRow(row.id, { account: e.target.value })}
                                      placeholder="Customer name"
                                      aria-label={`Customer name for row ${rowIdx + 1}`}
                                      className={cn(
                                        "w-40 rounded-[7px] border-[1.5px] px-2.5 py-1.5 text-[12.5px] outline-none transition-colors",
                                        isDark ? "bg-transparent text-slate-100" : "bg-white text-[#0F172A]",
                                        !row.account.trim()
                                          ? isDark ? "border-red-500/50" : "border-[#FCA5A5]"
                                          : isDark ? "border-white/12 focus:border-[#2563EB]" : "border-[#E2E8F0] focus:border-[#2563EB]"
                                      )}
                                    />
                                  </td>
                                  <td className="px-3 py-2.5 align-top">
                                    <TypeMultiSelect value={row.classifications} onChange={(v) => updateRow(row.id, { classifications: v })} isDark={isDark} />
                                    {row.classifications.length === 0 && (
                                      <div className={cn("mt-1 text-[10.5px]", isDark ? "text-red-400" : "text-[#DC2626]")}>Select at least one</div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 align-top">
                                    <input
                                      value={row.primaryContact}
                                      onChange={(e) => updateRow(row.id, { primaryContact: e.target.value })}
                                      placeholder="Optional"
                                      aria-label={`Primary contact for row ${rowIdx + 1}`}
                                      className={cn(
                                        "w-[140px] rounded-[7px] border-[1.5px] px-2.5 py-1.5 text-[12.5px] outline-none transition-colors focus:border-[#2563EB]",
                                        isDark ? "border-white/[0.12] bg-transparent text-slate-100" : "border-[#E2E8F0] bg-white text-[#0F172A]"
                                      )}
                                    />
                                    {row.primaryContactRaw && (
                                      <div className="mt-1 text-[10.5px] text-[#F97316]">&quot;{row.primaryContactRaw}&quot;</div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 align-top">
                                    <input
                                      type="date"
                                      value={row.kickoffDate}
                                      onChange={(e) => updateRow(row.id, { kickoffDate: e.target.value })}
                                      aria-label={`Kickoff date for row ${rowIdx + 1}`}
                                      style={{ colorScheme: isDark ? "dark" : "light" }}
                                      className={cn(
                                        "w-[150px] cursor-pointer rounded-[7px] border-[1.5px] px-2.5 py-1.5 text-[12.5px] outline-none transition-colors focus:border-[#2563EB]",
                                        isDark ? "border-white/[0.12] bg-transparent text-slate-100" : "border-[#E2E8F0] bg-white text-[#0F172A]"
                                      )}
                                    />
                                  </td>
                                  <td className="px-3 py-2.5 align-top">
                                    <select
                                      value={row.currentPhase}
                                      onChange={(e) => updateRow(row.id, { currentPhase: e.target.value })}
                                      aria-label={`Current phase for row ${rowIdx + 1}`}
                                      style={{ colorScheme: isDark ? "dark" : "light" }}
                                      className={cn(
                                        "w-[170px] cursor-pointer rounded-[7px] border-[1.5px] px-2.5 py-1.5 text-[12.5px] outline-none transition-colors focus:border-[#2563EB]",
                                        isDark ? "border-white/[0.12] bg-transparent text-slate-100" : "border-[#E2E8F0] bg-white text-[#0F172A]"
                                      )}
                                    >
                                      <option value="">Phase 1: Onboard (default)</option>
                                      {PROGRAMME_PHASES.map((p) => (
                                        <option key={p.number} value={p.name}>
                                          Phase {p.number}: {p.name}
                                        </option>
                                      ))}
                                    </select>
                                    {isOverdue(row.kickoffDate, row.currentPhase) && (
                                      <div className={cn("mt-1 text-[10.5px]", isDark ? "text-red-400" : "text-[#DC2626]")}>
                                        Overdue — Day {getCurrentProgrammeDay(row.kickoffDate)}, past the 15-day Onboarding window
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-2 py-2.5 align-top">
                                    <button
                                      type="button"
                                      onClick={() => removeRow(row.id)}
                                      aria-label="Remove row"
                                      className={cn(
                                        "cursor-pointer rounded-md p-1.5 transition-colors",
                                        isDark ? "text-slate-400 hover:bg-red-500/15 hover:text-red-400" : "text-[#64748B] hover:bg-[#FEF2F2] hover:text-[#DC2626]"
                                      )}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {submitError && <p className={cn("mt-3 text-xs", isDark ? "text-red-400" : "text-[#DC2626]")}>{submitError}</p>}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {step === 2 && rows.length > 0 && (
              <div className="mt-7 flex items-center justify-between">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={submitting}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-[9px] border-[1.5px] bg-transparent px-4 py-2.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    isDark ? "border-white/[0.1] text-slate-300 hover:bg-white/[0.06]" : "border-[#E2E8F0] text-[#475569] hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
                  )}
                >
                  <ArrowLeft size={14} /> Choose a different file
                </button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSubmit}
                  disabled={submitting || importableCount === 0}
                  className="flex cursor-pointer items-center gap-1.5 rounded-[9px] border-none bg-[#2563EB] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(37,99,235,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin motion-reduce:animate-none" /> Importing…
                    </>
                  ) : (
                    <>
                      Import {importableCount} project{importableCount === 1 ? "" : "s"} <ArrowRight size={14} />
                    </>
                  )}
                </motion.button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
