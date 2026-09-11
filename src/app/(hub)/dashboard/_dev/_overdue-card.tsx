"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysLate, type DevWorkItem } from "./_types";
import { OptionalLink, TRANSITION } from "./_ui";

// Task 360 — "Overdue — needs attention". Renders nothing at all when there is no overdue work:
// the card exists only to raise a warning, so an "all clear" version would be noise (unlike the
// other panels, whose empty states teach what will eventually appear there).

const MAX_ROWS = 5;

export default function DevOverdueCard({ items, today }: { items: DevWorkItem[]; today: string }) {
  if (items.length === 0) return null;

  const rows = items.slice(0, MAX_ROWS);
  const hidden = items.length - rows.length;

  return (
    <section className="rounded-[14px] border border-[#F5C6C2] bg-[#FDE8E6] px-4 py-3.5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={16} className="text-[#C0392B] shrink-0" />
        <h3 className="font-heading text-[13px] font-bold text-[#8A1F1F] m-0">Overdue — needs attention</h3>
      </div>

      <div className="flex flex-col gap-2.5">
        {rows.map((item) => {
          const n = daysLate(item.dueDate, today);
          return (
            <OptionalLink
              key={`${item.kind}-${item.id}`}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md",
                TRANSITION,
                "hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C0392B]"
              )}
            >
              <span className="flex-1 min-w-0">
                <span className="block text-[12.5px] font-semibold text-[#7A1B1B] truncate">{item.title}</span>
                <span className="block text-[11px] text-[#B4534F] truncate mt-px">{item.projectName}</span>
              </span>
              <span className="font-mono text-[10.5px] font-bold text-white bg-[#C0392B] px-1.5 py-[3px] rounded-md shrink-0">
                {n}D
              </span>
            </OptionalLink>
          );
        })}
      </div>

      {hidden > 0 ? (
        <p className="text-[11px] font-semibold text-[#B4534F] mt-3 mb-0">
          +{hidden} more overdue in My work
        </p>
      ) : null}
    </section>
  );
}
