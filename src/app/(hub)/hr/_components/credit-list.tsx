import { CalendarHeart, HeartPulse, Palmtree, type LucideIcon } from "lucide-react";
import { formatDays } from "@/lib/hr/format";
import { formatShort } from "@/lib/hr/dates";
import type { CreditSummary } from "@/lib/hr/types";
import { CreditMeter } from "./credit-meter";
import { Panel } from "./page-shell";
import { EmptyState } from "./empty-state";

const ICONS: Record<string, LucideIcon> = {
  mandatory_holidays: CalendarHeart,
  paid_time_off: Palmtree,
  personal_sick_leave: HeartPulse,
};

function periodLabel(c: CreditSummary): string {
  if (!c.period) return "No allotment set for this period";
  const y = (d: string) => d.slice(0, 4);
  return `${formatShort(c.period.period_start)} ${y(c.period.period_start)} – ${formatShort(c.period.period_end)} ${y(c.period.period_end)}`;
}

function CreditRow({ c }: { c: CreditSummary }) {
  const Icon = ICONS[c.type.code] ?? Palmtree;
  const unlimited = c.period && c.allotted === null;
  const low = c.remaining !== null && c.allotted !== null && c.allotted > 0 && c.remaining / c.allotted <= 0.2;
  const remainingColor = c.remaining !== null && c.remaining <= 0 ? "text-[#C0392B]" : low ? "text-[#8A5A00]" : "text-[#0B1533]";
  return (
    <li className="grid items-center gap-x-6 gap-y-3 border-b border-[#EDF0F7] px-[18px] py-4 last:border-0 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_auto]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#E5F1FF] text-[#0063D6]">
          <Icon size={17} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[#0B1533]">{c.type.name}</p>
          <p className="truncate font-mono text-[10.5px] text-[#5F6A88]">{periodLabel(c)}</p>
        </div>
      </div>

      {c.period ? (
        <div className="flex flex-col gap-1.5">
          <CreditMeter allotted={c.allotted} used={c.used} pending={c.pending} />
          <p className="font-mono text-[10.5px] text-[#5F6A88]">
            Used {formatDays(c.used, false)} · Pending {formatDays(c.pending, false)} · {unlimited ? "Unlimited" : `of ${formatDays(c.allotted, false)}`}
          </p>
        </div>
      ) : (
        <p className="text-[12px] text-[#5F6A88]">Ask an admin to set an allotment for this leave type.</p>
      )}

      <div className="md:text-right">
        <p className={`font-heading text-[28px] font-bold leading-none tracking-[-0.02em] ${remainingColor}`}>
          {c.period ? (c.remaining === null ? "∞" : formatDays(c.remaining, false)) : "—"}
        </p>
        <p className="mt-1 text-[11px] font-semibold text-[#5F6A88]">{c.remaining === 1 ? "day left" : "days left"}</p>
      </div>
    </li>
  );
}

/** Per-type credits as rows in one panel (Zoho's Leave tab, plus the meter). */
export function CreditList({ credits, hint }: { credits: CreditSummary[]; hint?: string }) {
  return (
    <Panel title="Leave credits" hint={hint}>
      {credits.length ? (
        <ul>{credits.map((c) => <CreditRow key={c.type.id} c={c} />)}</ul>
      ) : (
        <EmptyState icon={Palmtree} title="No leave types yet" hint="Once an admin adds leave types and allotments, your credits show up here." />
      )}
    </Panel>
  );
}
