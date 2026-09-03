import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatHoursAsHHMM, formatClockTime } from "@/lib/timer/format";
import { formatDate } from "@/lib/utils";
import {
  groupByDate, groupByEmployee, periodToRange, sumHours,
  MONTH_NAMES, type PeriodValue, type TimeLogEntry,
} from "./_time-logs-shared";

// "Timesheet" PDF export (task 227 rewrite of task 226's flat table) — client-side
// jspdf/jspdf-autotable, no server round-trip. `entries` is the caller's already fully-resolved,
// filtered set (period + project + role scope + the task-227 User filter) — this module never
// re-fetches or re-scopes, it only lays the given rows out on paper. Employee identity is a
// section heading per employee (not a table column, task 227 point 2), one heading+table block
// per distinct employee in `entries`, page-break-aware so a block never gets visually squeezed
// into a sliver of remaining page space.

const MARGIN_X = 14;
const HEADER_HEIGHT = 26; // vertical space every page reserves at the top for the logo/exported-on strip
const BOTTOM_MARGIN = 14;
const MIN_BLOCK_HEIGHT = 45; // heading + header row + >=1 data row + total — below this, start a new page
const BLOCK_GAP = 8; // vertical gap between two employees' blocks sharing the same page

type LoadedImage = { dataUrl: string; width: number; height: number };

function loadImageAsDataUrl(src: string): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas 2D context unavailable")); return; }
      ctx.drawImage(img, 0, 0);
      resolve({ dataUrl: canvas.toDataURL("image/png"), width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

// Loaded once per page session and reused across exports — the logo never changes mid-session.
let logoPromise: Promise<LoadedImage> | null = null;
function loadLogo() {
  logoPromise ??= loadImageAsDataUrl("/webriq_logo.webp");
  return logoPromise;
}

// Repeating page header (task 227 point 9) — drawn via autoTable's `didDrawPage`, which fires for
// every page a table spans (including pages autoTable adds itself on overflow), so this reliably
// repeats without the caller tracking which pages exist.
function drawPageHeader(doc: jsPDF, logo: LoadedImage, exportedOnLabel: string) {
  const logoTop = 8;
  const logoHeight = 12;
  const logoWidth = logoHeight * (logo.width / logo.height);

  doc.addImage(logo.dataUrl, "PNG", MARGIN_X, logoTop, logoWidth, logoHeight);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(11, 21, 51);
  doc.text("WebriQ Central Hub", MARGIN_X + logoWidth + 8, logoTop + logoHeight / 2 + 3);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(95, 106, 136);
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.text(`Exported On: ${exportedOnLabel}`, pageWidth - MARGIN_X, logoTop + logoHeight / 2 + 3, { align: "right" });

  doc.setDrawColor(226, 231, 242);
  doc.line(MARGIN_X, HEADER_HEIGHT - 4, pageWidth - MARGIN_X, HEADER_HEIGHT - 4);
}

function timePeriodText(entry: TimeLogEntry): string {
  return entry.start_time && entry.end_time
    ? `${formatClockTime(entry.start_time)} - ${formatClockTime(entry.end_time)}`
    : "—";
}

function buildColumns(showDate: boolean, showProject: boolean): string[] {
  const cols: string[] = [];
  if (showDate) cols.push("Date"); // Date is always the first column when shown (task 227 point 6)
  cols.push("Log Title");
  if (showProject) cols.push("Project");
  cols.push("Daily Log Hours", "Time Period", "Notes");
  return cols;
}

function buildEntryRow(entry: TimeLogEntry, showDate: boolean, showProject: boolean): string[] {
  const row: string[] = [];
  if (showDate) row.push(formatDate(entry.date_logged));
  // Task 230 — `log_title` (task title / issue title / General Log text) so a task-less General
  // Log entry prints its actual description instead of `task_title`'s "—" fallback.
  row.push(entry.log_title);
  if (showProject) row.push(entry.project_name);
  row.push(formatHoursAsHHMM(entry.hours), timePeriodText(entry), entry.note ?? "");
  return row;
}

// Label-only summary row (day subtotal or the employee's grand total) — no colSpan needed since
// the label text itself ("Subtotal — <date>" / "Total") is unambiguous regardless of which
// columns are visible; `didParseCell` below shades these rows for visual distinction.
function buildSummaryRow(label: string, hours: number, showDate: boolean, showProject: boolean): string[] {
  const row: string[] = [];
  if (showDate) row.push("");
  row.push(label);
  if (showProject) row.push("");
  row.push(formatHoursAsHHMM(hours), "", "");
  return row;
}

function isSummaryRow(raw: unknown): boolean {
  return Array.isArray(raw) && raw.some((c) => typeof c === "string" && (c.startsWith("Subtotal —") || c === "Total"));
}

function compactDate(d: Date, withYear: boolean): string {
  const month = MONTH_NAMES[d.getMonth()];
  const day = d.getDate().toString().padStart(2, "0");
  return withYear ? `${month}${day}_${d.getFullYear()}` : `${month}${day}`;
}

// Filename date segment — "Aug06_2026" (single day) or "Aug06_Aug21_2026" (range), matching the
// two examples given exactly (no comma/space, year appended once at the end).
function filenameDateSegment(period: PeriodValue): string {
  const { from, to } = periodToRange(period);
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);
  return from === to ? compactDate(fromDate, true) : `${compactDate(fromDate, false)}_${compactDate(toDate, true)}`;
}

// Filename employee segment — "FirstName_X" where X is the initial of the *second* name token
// (e.g. "Brandon Dwite Cobacha" -> "Brandon_D": first token + initial of the second token, not
// the last — confirmed against the task's own worked example, which uses the middle name's
// initial, not the surname's). Falls back to "All-Users" when more than one employee is present.
function filenameEmployeeSegment(groups: { name: string }[]): string {
  if (groups.length !== 1) return "All-Users";
  const parts = groups[0].name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "User";
  const secondInitial = parts.length > 1 ? parts[1][0] : "";
  return secondInitial ? `${first}_${secondInitial}` : first;
}

export async function exportTimeLogsToPdf(
  entries: TimeLogEntry[],
  meta: { period: PeriodValue; projectName: string | null }
) {
  const doc = new jsPDF({ orientation: "landscape" });
  const logo = await loadLogo();
  const exportedOnLabel = `${formatDate(new Date())} ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;

  const showDateColumn = meta.period.mode !== "day";
  const showProjectColumn = meta.projectName === null;
  const { from, to } = periodToRange(meta.period);
  const periodText = showDateColumn ? `${formatDate(from)} - ${formatDate(to)}` : formatDate(from);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(11, 21, 51);
  doc.text("Timesheet", MARGIN_X, HEADER_HEIGHT + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(95, 106, 136);
  doc.text(`Project: ${meta.projectName ?? "All Projects"}`, MARGIN_X, HEADER_HEIGHT + 12);
  doc.text(`Period: ${periodText}`, MARGIN_X, HEADER_HEIGHT + 17);

  const groups = groupByEmployee(entries);
  const pageHeight = doc.internal.pageSize.getHeight();
  let cursorY = HEADER_HEIGHT + 23;
  let firstBlock = true;

  for (const group of groups) {
    if (!firstBlock) {
      if (pageHeight - cursorY < MIN_BLOCK_HEIGHT) {
        doc.addPage();
        cursorY = HEADER_HEIGHT + 6;
      } else {
        cursorY += BLOCK_GAP;
      }
    }
    firstBlock = false;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(11, 21, 51);
    doc.text(`Employee: ${group.name}`, MARGIN_X, cursorY);
    cursorY += 5;

    const body: string[][] = [];
    if (showDateColumn) {
      for (const [date, dayEntries] of groupByDate(group.entries)) {
        for (const entry of dayEntries) body.push(buildEntryRow(entry, showDateColumn, showProjectColumn));
        body.push(buildSummaryRow(`Subtotal — ${formatDate(date)}`, sumHours(dayEntries), showDateColumn, showProjectColumn));
      }
    } else {
      for (const entry of group.entries) body.push(buildEntryRow(entry, showDateColumn, showProjectColumn));
    }

    autoTable(doc, {
      startY: cursorY,
      margin: { top: HEADER_HEIGHT, bottom: BOTTOM_MARGIN },
      head: [buildColumns(showDateColumn, showProjectColumn)],
      body,
      foot: [buildSummaryRow("Total", sumHours(group.entries), showDateColumn, showProjectColumn)],
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [7, 17, 51], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [244, 246, 251], textColor: [11, 21, 51], fontStyle: "bold" },
      didParseCell: (data) => {
        if (data.section === "body" && isSummaryRow(data.row.raw)) {
          data.cell.styles.fillColor = [244, 246, 251];
          data.cell.styles.fontStyle = "bold";
        }
      },
      didDrawPage: () => drawPageHeader(doc, logo, exportedOnLabel),
    });

    cursorY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY;
  }

  const filename = `timesheet_${filenameDateSegment(meta.period)}_${filenameEmployeeSegment(groups)}.pdf`;
  doc.save(filename);
}
