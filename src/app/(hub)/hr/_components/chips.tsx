import { STATUS_LABEL, KIND_LABEL, type HolidayKind, type LeaveStatus } from "@/lib/hr/types";

const STATUS_STYLE: Record<LeaveStatus, string> = {
  pending: "bg-[#FFF3D6] text-[#8A5A00]",
  approved: "bg-[#E3F5EA] text-[#177E48]",
  rejected: "bg-[#FDE8E6] text-[#C0392B]",
  cancelled: "bg-[#EDF0F7] text-[#5F6A88]",
};

const chip = "inline-flex items-center gap-1.5 rounded-[5px] px-2 py-[3px] text-[10px] font-bold leading-none whitespace-nowrap";

/** Status chip: leading dot + text, so colour is never the only signal. */
export function StatusChip({ status }: { status: LeaveStatus }) {
  return (
    <span className={`${chip} ${STATUS_STYLE[status]}`}>
      <span aria-hidden className="size-[5px] rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Leave-type chip — deliberately neutral: phase hues are reserved for the 120-day programme. */
export function LeaveTypeChip({ name }: { name: string }) {
  return <span className={`${chip} bg-[#EDF0F7] text-[#5F6A88]`}>{name}</span>;
}

export function HolidayChip({ kind }: { kind?: HolidayKind }) {
  return <span className={`${chip} bg-[#E5F1FF] text-[#0063D6]`}>{kind ? KIND_LABEL[kind] : "Holiday"}</span>;
}
