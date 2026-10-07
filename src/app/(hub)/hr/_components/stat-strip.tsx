import Link from "next/link";
import type { ReactNode } from "react";

export interface Stat {
  label: string;
  value: ReactNode;
  hint?: string;
  href?: string;
}

/** One bordered strip divided into stats — avoids a row of identical cards. */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid overflow-hidden rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] sm:grid-cols-3 sm:divide-x sm:divide-[#EDF0F7] max-sm:divide-y max-sm:divide-[#EDF0F7]">
      {stats.map((s) => {
        const body = (
          <>
            <p className="text-[11px] font-semibold text-[#5F6A88]">{s.label}</p>
            <p className="mt-1.5 font-heading text-[28px] font-bold leading-none tracking-[-0.02em] text-[#0B1533]">{s.value}</p>
            {s.hint && <p className="mt-1.5 truncate font-mono text-[10.5px] text-[#5F6A88]">{s.hint}</p>}
          </>
        );
        return s.href ? (
          <Link key={s.label} href={s.href} className="px-[18px] py-4 transition-colors hover:bg-[#F0F7FF] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#007BFF]">{body}</Link>
        ) : (
          <div key={s.label} className="px-[18px] py-4">{body}</div>
        );
      })}
    </div>
  );
}
