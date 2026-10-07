import { formatDays } from "@/lib/hr/format";

/** Pill track: used (solid) then pending (lighter). Turns amber at ≤20% left, red at 0. */
export function CreditMeter({ allotted, used, pending }: { allotted: number | null; used: number; pending: number }) {
  if (allotted === null || allotted === 0) {
    return <div className="h-2 rounded-full bg-[#EDF0F7]" aria-hidden />;
  }
  const usedPct = Math.min(100, (used / allotted) * 100);
  const pendingPct = Math.min(100 - usedPct, (pending / allotted) * 100);
  const remaining = allotted - used;
  const fill = remaining <= 0 ? "bg-[#C0392B]" : remaining / allotted <= 0.2 ? "bg-[#8A5A00]" : "bg-[#007BFF]";
  return (
    <div
      role="img"
      aria-label={`${formatDays(used)} used and ${formatDays(pending)} pending of ${formatDays(allotted)}`}
      className="flex h-2 overflow-hidden rounded-full bg-[#EDF0F7]"
    >
      <div className={`${fill} transition-[width] duration-150`} style={{ width: `${usedPct}%` }} />
      <div className="bg-[#A8C6F5]" style={{ width: `${pendingPct}%` }} />
    </div>
  );
}
