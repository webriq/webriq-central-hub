import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Filled-circle pie progress indicator: an outer ring, a small gap, then a base circle with a
// solid pie wedge (clockwise from 12 o'clock) filled to `percentage`. At 100% the pie is a full
// solid disc (same ring+gap+pie structure) with a white checkmark centered on top. `colorClass`
// is a Tailwind `text-*` class (from PHASE_VISUALS); `fill-current`/`stroke-current` pick it up.
export default function ProgressRing({ percentage, colorClass, size = 22 }: { percentage: number; colorClass: string; size?: number }) {
  const cx = size / 2;
  const outerR = size / 2 - 1;
  const gap = 2.5;
  const pieR = outerR - gap;

  if (percentage >= 100) {
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={cx} cy={cx} r={outerR} fill="none" strokeWidth={1} className={cn("stroke-current", colorClass, "opacity-40")} />
          <circle cx={cx} cy={cx} r={pieR} className={cn("fill-current", colorClass)} />
        </svg>
        <Check size={size * 0.55} strokeWidth={3} className="absolute inset-0 m-auto text-white" />
      </div>
    );
  }

  const clamped = Math.max(0, Math.min(100, percentage));
  const angle = (clamped / 100) * 360;
  const rad = ((angle - 90) * Math.PI) / 180;
  const endX = cx + pieR * Math.cos(rad);
  const endY = cx + pieR * Math.sin(rad);
  const largeArcFlag = angle > 180 ? 1 : 0;
  const wedgePath = clamped > 0 ? `M ${cx} ${cx} L ${cx} ${cx - pieR} A ${pieR} ${pieR} 0 ${largeArcFlag} 1 ${endX} ${endY} Z` : "";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden="true">
      {/* Opaque white backdrop under the ring/gap — without it, the gap is transparent SVG space
          and the card's own solid-fill background (often the *same* phase color as the ring)
          shows through, making the ring invisible against itself. */}
      <circle cx={cx} cy={cx} r={outerR} className="fill-white" />
      <circle cx={cx} cy={cx} r={outerR} fill="none" strokeWidth={1.25} className={cn("stroke-current", colorClass)} />
      <circle cx={cx} cy={cx} r={pieR} strokeWidth={1} className="fill-white stroke-[#E2E7F2]" />
      {wedgePath && <path d={wedgePath} className={cn("fill-current", colorClass, "opacity-50")} />}
    </svg>
  );
}
