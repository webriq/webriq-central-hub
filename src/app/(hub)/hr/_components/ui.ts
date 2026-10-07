// Class vocabulary for the HR module — one place for the design-system button/field/label looks
// (central-hub-design-system.md §4) so pages never repeat the hex values.

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]";
const base = `inline-flex items-center justify-center gap-1.5 rounded-full font-semibold cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${focus}`;

export const btn = {
  /** Orange CTA — one per screen. */
  cta: `${base} px-4 py-2 text-[12px] bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white`,
  /** Confirm / navigate. */
  blue: `${base} px-4 py-2 text-[12px] bg-[#007BFF] text-white hover:bg-[#0063D6]`,
  ghost: `${base} px-4 py-2 text-[12px] bg-white border border-[#E2E7F2] text-[#3A4565] hover:border-[#A8C6F5]`,
  danger: `${base} px-4 py-2 text-[12px] bg-white border border-[#E2E7F2] text-[#C0392B] hover:border-[#C0392B]/50`,
  /** Small variants (tables, drawers). */
  sm: "!px-3 !py-1.5 !text-[11px]",
} as const;

export const fieldClass =
  "w-full rounded-[10px] border border-[#E2E7F2] bg-[#F4F6FB] px-3 py-2 text-[13px] text-[#3A4565] outline-none transition-colors placeholder:text-[#5F6A88] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] disabled:opacity-60";
export const fieldErrorClass = "!border-[#C0392B]";
export const labelClass = "mb-1.5 block text-[11px] font-semibold text-[#0B1533]";

export const tableHeadClass =
  "px-4 py-2.5 text-left text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] bg-[#FAFBFE] border-b border-[#EDF0F7]";
export const cellClass = "px-4 py-3 text-[13px] text-[#3A4565] border-b border-[#EDF0F7]";
export const monoDate = "font-mono text-[12px] font-medium tabular-nums text-[#0B1533]";

/** 32px round icon button (prev / next / pager). */
export const circleBtn = `inline-flex size-8 items-center justify-center rounded-full border border-[#E2E7F2] bg-white text-[#3A4565] transition-colors hover:border-[#A8C6F5] disabled:opacity-45 disabled:hover:border-[#E2E7F2] ${focus}`;
/** Borderless icon button used for row actions (edit / delete / close). */
export const iconBtn = "rounded-full p-1.5 text-[#5F6A88] transition-colors hover:bg-[#EDF0F7] hover:text-[#0B1533] focus-visible:outline-2 focus-visible:outline-[#007BFF]";
