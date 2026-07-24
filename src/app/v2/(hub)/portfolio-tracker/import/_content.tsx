"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { motion, AnimatePresence } from "motion/react";
import { DayPicker } from "react-day-picker";
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
  CalendarClock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { CLASSIFICATIONS, type Classification, STACKSHIFT_VARIANTS, PROGRAMME_PHASES, getCurrentProgrammeDay } from "@/config/customer-phases";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

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

function needsAttention(row: ImportRow): string | null {
  if (!row.account.trim()) return "Customer is required";
  if (row.classifications.length === 0) return "Select at least one Project Type";
  return null;
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

function StepIndicator({ current }: { current: Step }) {
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

// ─── Per-row Project Type picker — compact search-and-select-multiple combobox. Selected
// values render as small neutral pills on the trigger (DESIGN.md: phase hues are reserved for
// the programme's 5 phases only — task 183 dropped the old per-type rainbow, matching
// ../new/_content.tsx's ClassificationCard fix); the option list opens in a document.body
// portal (position computed from the trigger's rect, mirroring ../new/_content.tsx's
// DateTimePicker pattern) so it's never clipped by the review table's horizontal-scroll
// container. Still enforces the New Project wizard's exact grouping rule via
// toggleClassification: at most one StackShift variant at a time, PipelineForge/Discrete
// Development combine freely with it or each other. ─────────────────────────────────────────

function TypeMultiSelect({
  value,
  onChange,
  minHeight,
}: {
  value: Classification[];
  onChange: (v: Classification[]) => void;
  minHeight?: number;
}) {
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
        style={minHeight ? { height: minHeight } : undefined}
        className={cn(
          "flex min-h-[34px] w-full cursor-pointer flex-wrap items-center gap-1 rounded-[7px] border px-2 py-1 text-left outline-none transition-colors",
          open ? "border-[#007BFF] bg-white" : "border-transparent bg-transparent hover:bg-[#F4F6FB] group-hover:border-[#E2E7F2]"
        )}
      >
        {value.length === 0 ? (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-[#5F6A88]">
            <Search size={11} /> Search &amp; select…
          </span>
        ) : (
          value.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-md border border-[#E2E7F2] bg-[#EDF0F7] py-0.5 pl-1.5 pr-1 text-[10px] font-medium text-[#5F6A88]"
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
          ))
        )}
      </div>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="z-50 overflow-hidden rounded-lg border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)]"
          >
            <div className="border-b border-[#EDF0F7] p-2">
              <div className="relative">
                <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[#5F6A88]" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search types…"
                  className="w-full rounded-md border border-[#E2E7F2] py-1 pl-6 pr-2 text-[12px] text-[#0B1533] outline-none placeholder:text-[#5F6A88] focus:border-[#007BFF]"
                />
              </div>
            </div>
            <div className="max-h-[180px] overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <div className="px-2 py-2 text-[11.5px] text-[#5F6A88]">No matches</div>
              ) : (
                filtered.map((c) => {
                  const selected = value.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onChange(toggleClassification(value, c))}
                      className={cn(
                        "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[#F4F6FB]",
                        selected && "bg-[#F0F7FF]"
                      )}
                    >
                      <span className={selected ? "font-medium text-[#0B1533]" : "text-[#3A4565]"}>{c}</span>
                      {selected && <Check size={12} className="text-[#007BFF]" />}
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

// ─── Kickoff Date picker — date-only variant of ../new/_content.tsx's DateTimePicker (no time
// panel needed; ImportRow.kickoffDate is a plain yyyy-mm-dd). Mirrors TypeMultiSelect's
// document.body portal/rect-positioning above (not DateTimePicker's simple relative
// positioning) since this also lives inside the review table's horizontal-scroll container —
// a relatively-positioned dropdown would get clipped by that container's overflow-x. Replaces
// the native <input type="date">, whose OS-chrome calendar UI reads inconsistently across
// browsers and breaks the row's visual rhythm against every other v2.0-styled control. ───────

function KickoffDatePicker({
  value,
  onChange,
  hasError,
  minHeight,
}: {
  value: string;
  onChange: (v: string) => void;
  hasError?: boolean;
  minHeight?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedDate = value ? new Date(`${value}T00:00:00`) : undefined;

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ top: r.bottom + 4, left: r.left });
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

  function handleSelect(d: Date | undefined) {
    if (!d) return;
    const pad = (n: number) => String(n).padStart(2, "0");
    onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={minHeight ? { height: minHeight } : undefined}
        className={cn(
          "flex w-full cursor-pointer items-center gap-1.5 rounded-[7px] border px-2.5 py-1.5 text-left text-[12.5px] outline-none transition-colors",
          open
            ? "border-[#007BFF] bg-white"
            : hasError
              ? "border-[#F5C6C2] bg-white hover:border-[#F5C6C2]"
              : "border-transparent bg-transparent hover:bg-[#F4F6FB] group-hover:border-[#E2E7F2]"
        )}
      >
        <CalendarClock size={12} className="shrink-0 text-[#5F6A88]" />
        {selectedDate ? (
          <span className="truncate text-[#0B1533]">{selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        ) : (
          <span className="truncate text-[#5F6A88]">Pick a date</span>
        )}
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className="z-50 overflow-hidden rounded-xl border border-[#E2E7F2] bg-white p-3 shadow-[0_8px_24px_rgba(7,17,51,0.10)]"
          >
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={handleSelect}
              showOutsideDays
              classNames={{
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
                Chevron: ({ orientation }) => (orientation === "left" ? <ChevronLeft size={14} /> : <ChevronRight size={14} />),
              }}
            />
          </div>,
          document.body
        )}
    </>
  );
}

// ─── Review table row — measures both auto-growing textareas (Customer, Primary Contact) and
// applies the taller of the two as an explicit pixel height to every field in the row
// (TypeMultiSelect, KickoffDatePicker, the Current Phase <select>, and both textareas
// themselves). Relying on CSS `min-height: 100%` inside the table row (task 183 revision 3)
// hit the classic "percentage height against an auto-height containing block resolves to
// none" case — table cells are a documented spec exception that *can* support this, but support
// wasn't holding up row-to-row here, so this replaces it with a deterministic JS measurement
// that doesn't depend on that resolution succeeding. ──────────────────────────────────────────

const ROW_MIN_HEIGHT = 34;

function ReviewTableRow({
  row,
  rowIdx,
  updateRow,
  removeRow,
}: {
  row: ImportRow;
  rowIdx: number;
  updateRow: (id: string, patch: Partial<ImportRow>) => void;
  removeRow: (id: string) => void;
}) {
  const attention = needsAttention(row);
  const accountRef = useRef<HTMLTextAreaElement>(null);
  const contactRef = useRef<HTMLTextAreaElement>(null);
  const [rowHeight, setRowHeight] = useState(ROW_MIN_HEIGHT);

  useLayoutEffect(() => {
    const a = accountRef.current;
    const c = contactRef.current;
    if (!a || !c) return;
    // Reset both to auto before reading scrollHeight — otherwise a field already stretched from
    // a previous render just reports its own stretched height back, and the row can never shrink
    // again after its longer field gets edited down to something shorter.
    a.style.height = "auto";
    c.style.height = "auto";
    const next = Math.max(ROW_MIN_HEIGHT, a.scrollHeight, c.scrollHeight);
    a.style.height = `${next}px`;
    c.style.height = `${next}px`;
    setRowHeight(next);
  }, [row.account, row.primaryContact]);

  return (
    <tr className={cn("group border-t border-[#EDF0F7] transition-colors hover:bg-[#F0F7FF]", attention && "bg-[#FFF3D6]/40")}>
      <td className="px-3 py-2.5 align-top">
        <textarea
          ref={accountRef}
          value={row.account}
          onChange={(e) => updateRow(row.id, { account: e.target.value })}
          onKeyDown={(e) => {
            // Wraps long values instead of clipping them — not meant for literal multi-line
            // entry, so Enter is a no-op rather than inserting a newline.
            if (e.key === "Enter") e.preventDefault();
          }}
          rows={1}
          placeholder="Customer name"
          aria-label={`Customer name for row ${rowIdx + 1}`}
          className={cn(
            "w-full resize-none overflow-hidden rounded-[7px] border bg-transparent px-2.5 py-1.5 text-[12.5px] leading-snug text-[#0B1533] outline-none transition-colors hover:bg-[#F4F6FB] focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,123,255,0.10)]",
            !row.account.trim()
              ? "border-[#F5C6C2] bg-[#FDE8E6]/40 hover:bg-[#FDE8E6]/40"
              : "border-transparent group-hover:border-[#E2E7F2] focus:border-[#007BFF]"
          )}
        />
      </td>
      <td className="px-3 py-2.5 align-top">
        <TypeMultiSelect value={row.classifications} onChange={(v) => updateRow(row.id, { classifications: v })} minHeight={rowHeight} />
        {row.classifications.length === 0 && (
          <div className="mt-1 pl-[23px] text-[10.5px] leading-snug text-[#C0392B]">Select at least one</div>
        )}
      </td>
      <td className="px-3 py-2.5 align-top">
        <textarea
          ref={contactRef}
          value={row.primaryContact}
          onChange={(e) => updateRow(row.id, { primaryContact: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          rows={1}
          placeholder="Optional"
          aria-label={`Primary contact for row ${rowIdx + 1}`}
          className="w-full resize-none overflow-hidden rounded-[7px] border border-transparent bg-transparent px-2.5 py-1.5 text-[12.5px] leading-snug text-[#0B1533] outline-none transition-colors hover:bg-[#F4F6FB] group-hover:border-[#E2E7F2] focus:border-[#007BFF] focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,123,255,0.10)]"
        />
        {row.primaryContactRaw && (
          <div className="mt-1 pl-2.5 text-[10.5px] leading-snug text-[#B85512]">&quot;{row.primaryContactRaw}&quot;</div>
        )}
      </td>
      <td className="px-3 py-2.5 align-top">
        <KickoffDatePicker
          value={row.kickoffDate}
          onChange={(v) => updateRow(row.id, { kickoffDate: v })}
          hasError={isOverdue(row.kickoffDate, row.currentPhase)}
          minHeight={rowHeight}
        />
      </td>
      <td className="px-3 py-2.5 align-top">
        <select
          value={row.currentPhase}
          onChange={(e) => updateRow(row.id, { currentPhase: e.target.value })}
          aria-label={`Current phase for row ${rowIdx + 1}`}
          style={{ height: rowHeight }}
          className="w-full cursor-pointer rounded-[7px] border border-transparent bg-transparent px-2.5 py-1.5 text-[12.5px] text-[#0B1533] outline-none transition-colors hover:bg-[#F4F6FB] group-hover:border-[#E2E7F2] focus:border-[#007BFF] focus:bg-white"
        >
          <option value="">Phase 1: Onboard (default)</option>
          {PROGRAMME_PHASES.map((p) => (
            <option key={p.number} value={p.name}>
              Phase {p.number}: {p.name}
            </option>
          ))}
        </select>
        {isOverdue(row.kickoffDate, row.currentPhase) && (
          <div className="mt-1 pl-2.5 text-[10.5px] leading-snug text-[#C0392B]">
            Overdue — Day {getCurrentProgrammeDay(row.kickoffDate)}, past the 15-day Onboarding window
          </div>
        )}
      </td>
      <td className="px-2 py-2.5 align-top">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                aria-label="Remove row"
                className="cursor-pointer rounded-full p-1.5 text-[#5F6A88] transition-colors hover:bg-[#FDE8E6] hover:text-[#C0392B]"
              >
                <Trash2 size={14} />
              </button>
            }
          />
          <TooltipContent side="top">Remove</TooltipContent>
        </Tooltip>
      </td>
    </tr>
  );
}

// ─── Main wizard ────────────────────────────────────────────────────────────────────────

export default function ImportProjectWizard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    <div className="flex min-h-full flex-col items-center bg-[#F4F6FB] px-6 py-10">
      {!result && (
        <div className="mb-2 w-full max-w-300">
          <button
            type="button"
            onClick={goBack}
            className="flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-xs text-[#5F6A88] transition-colors hover:text-[#007BFF]"
          >
            <ArrowLeft size={13} />
            {step === 1 ? "Back to projects" : "Choose a different file"}
          </button>
        </div>
      )}

      <div className="w-full max-w-300 rounded-[14px] border border-[#E2E7F2] bg-white px-10 py-9 shadow-[0_1px_2px_rgba(7,17,51,0.05)]">
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
                "mx-auto mb-6 flex h-18 w-18 items-center justify-center rounded-full",
                result.imported > 0 ? "bg-[#177E48] shadow-[0_4px_16px_rgba(23,126,72,0.28)]" : "bg-[#C0392B] shadow-[0_4px_16px_rgba(192,57,43,0.28)]"
              )}
            >
              {result.imported > 0 ? (
                <Check size={34} color="#FFFFFF" strokeWidth={2.5} />
              ) : (
                <AlertCircle size={34} color="#FFFFFF" strokeWidth={2.5} />
              )}
            </motion.div>

            <h2 className="font-heading mb-1.5 text-2xl font-bold tracking-tight text-[#0B1533]">
              {result.imported} project{result.imported === 1 ? "" : "s"} imported
            </h2>
            <p className="mb-7 text-sm leading-relaxed text-[#5F6A88]">
              {result.errors.length > 0
                ? `${result.errors.length} row${result.errors.length === 1 ? "" : "s"} failed and were skipped — see below.`
                : "All rows imported successfully."}
            </p>

            {result.errors.length > 0 && (
              <div className="mb-6 max-h-70 overflow-y-auto rounded-[10px] border border-[#E2E7F2] text-left">
                {result.errors.map((e, i) => (
                  <div
                    key={i}
                    className={cn("px-4 py-2.5 text-[12.5px] text-[#3A4565]", i > 0 && "border-t border-[#EDF0F7]")}
                  >
                    <span className="font-semibold text-[#0B1533]">
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
                className="flex-1 cursor-pointer rounded-full border border-[#E2E7F2] bg-white px-4 py-2.75 text-[13px] font-medium text-[#0B1533] transition-colors hover:border-[#A8C6F5] hover:bg-[#F4F6FB]"
              >
                Import another file
              </button>
              <button
                type="button"
                onClick={() => router.push(V2_ROUTES.PORTFOLIO_TRACKER)}
                className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border-none bg-[#007BFF] px-4 py-2.75 text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(0,123,255,0.3)] transition-colors hover:bg-[#0063D6]"
              >
                Back to projects <ArrowRight size={13} />
              </button>
            </div>
          </motion.div>
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
                      <h2 className="font-heading mb-1 text-xl font-bold tracking-[-0.02em] text-[#0B1533]">Import project</h2>
                      <p className="text-[13px] text-[#5F6A88]">
                        Upload a CSV or Excel file to bulk-create onboarding projects. Expected columns:{" "}
                        <span className="font-medium text-[#0B1533]">Customer, Project Type, Primary Contact, Kickoff Date, Current Phase</span>.
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
                        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center transition-colors",
                        dragOver ? "border-[#007BFF] bg-[#F0F7FF]" : "border-[#E2E7F2] bg-[#F4F6FB] hover:border-[#A8C6F5]"
                      )}
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-[#E5F1FF] text-[#007BFF]">
                        <Upload size={22} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-[#0B1533]">Click to upload or drag and drop</div>
                        <div className="mt-0.5 text-xs text-[#5F6A88]">.csv, .xlsx, or .xls</div>
                      </div>
                    </div>

                    {parseError && (
                      <p className="mt-3 flex items-center gap-1.5 text-xs text-[#C0392B]">
                        <AlertCircle size={13} /> {parseError}
                      </p>
                    )}
                  </div>
                )}

                {step === 2 && (
                  <div>
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <h2 className="font-heading mb-1 text-xl font-bold tracking-[-0.02em] text-[#0B1533]">Review &amp; fix</h2>
                        <p className="flex items-center gap-1.5 text-[13px] text-[#5F6A88]">
                          <FileSpreadsheet size={13} /> {fileName} · <span className="font-mono">{rows.length}</span> row{rows.length === 1 ? "" : "s"} parsed
                        </p>
                      </div>
                      {attentionCount > 0 ? (
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#F0D896] bg-[#FFF3D6] px-3 py-1.5 text-[11.5px] font-medium text-[#8A5A00]">
                          <AlertCircle size={12} /> {attentionCount} row{attentionCount === 1 ? "" : "s"} need attention
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#BEE7CD] bg-[#E3F5EA] px-3 py-1.5 text-[11.5px] font-medium text-[#177E48]">
                          <CheckCircle2 size={12} /> All rows ready
                        </span>
                      )}
                    </div>

                    {rows.length === 0 ? (
                      <div className="rounded-xl border border-[#E2E7F2] bg-[#F4F6FB] px-6 py-12 text-center text-sm text-[#5F6A88]">
                        No rows left. Choose a different file to continue.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-[#E2E7F2]">
                        <table className="w-full table-fixed border-collapse text-[12.5px]">
                          <colgroup>
                            <col className="w-[220px]" />
                            <col className="w-[190px]" />
                            <col className="w-[200px]" />
                            <col className="w-[150px]" />
                            <col className="w-[210px]" />
                            <col className="w-[52px]" />
                          </colgroup>
                          <thead className="bg-[#FAFBFE] text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">
                            <tr>
                              <th className="px-3 py-2.5 text-left">Customer</th>
                              <th className="px-3 py-2.5 text-left">Project Type</th>
                              <th className="px-3 py-2.5 text-left">Primary Contact</th>
                              <th className="px-3 py-2.5 text-left">Kickoff Date</th>
                              <th className="px-3 py-2.5 text-left">Current Phase</th>
                              <th className="px-2 py-2.5" />
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, rowIdx) => (
                              <ReviewTableRow key={row.id} row={row} rowIdx={rowIdx} updateRow={updateRow} removeRow={removeRow} />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {submitError && <p className="mt-3 text-xs text-[#C0392B]">{submitError}</p>}
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
                  className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#E2E7F2] bg-transparent px-4 py-2.5 text-[13px] font-medium text-[#3A4565] transition-colors hover:border-[#A8C6F5] hover:bg-[#F4F6FB] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ArrowLeft size={14} /> Choose a different file
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || importableCount === 0}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-[#FB914E] px-5 py-2.5 text-[13px] font-semibold text-[#471F02] transition-colors hover:bg-[#E2762F] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
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
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
