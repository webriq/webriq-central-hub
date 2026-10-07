"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatRange } from "@/lib/hr/dates";
import { formatDays } from "@/lib/hr/format";
import type { LeaveRequestView } from "@/lib/hr/types";
import { LeaveTypeChip, StatusChip } from "../_components/chips";
import { PersonAvatar } from "../_components/person-avatar";
import { cellClass, circleBtn, monoDate, tableHeadClass } from "../_components/ui";
import { RequestDrawer } from "./_request-drawer";

export function RequestTable({ rows, total, page, pageSize, canNote }: { rows: LeaveRequestView[]; total: number; page: number; pageSize: number; canNote: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.id === openId) ?? null;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  function go(p: number) {
    const q = new URLSearchParams(sp.toString());
    q.set("page", String(p));
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>
              <th className={`${tableHeadClass} pl-[18px]`}>Employee</th>
              <th className={tableHeadClass}>Leave</th>
              <th className={tableHeadClass}>Dates</th>
              <th className={tableHeadClass}>Days</th>
              <th className={tableHeadClass}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`cursor-pointer transition-colors hover:bg-[#F0F7FF] ${r.id === openId ? "bg-[#F0F7FF]" : ""}`} onClick={() => setOpenId(r.id)}>
                <td className={`${cellClass} pl-[18px]`}>
                  <button type="button" className="flex items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]" onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }} aria-label={`Review ${r.employee_name}'s request`}>
                    <PersonAvatar id={r.employee_id} name={r.employee_name} />
                    <span className="font-semibold text-[#0B1533]">{r.employee_name}</span>
                  </button>
                </td>
                <td className={cellClass}><LeaveTypeChip name={r.leave_type_name} /></td>
                <td className={`${cellClass} ${monoDate}`}>{formatRange(r.start_date, r.end_date)}{r.half_day ? " · half day" : ""}</td>
                <td className={`${cellClass} ${monoDate}`}>{formatDays(r.working_days, false)}</td>
                <td className={cellClass}><StatusChip status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-[18px] py-3">
        <span className="font-mono text-[11px] text-[#5F6A88]">{total} {total === 1 ? "request" : "requests"} · page {page} of {pages}</span>
        <div className="flex gap-2">
          <button type="button" className={circleBtn} aria-label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)}><ChevronLeft size={15} /></button>
          <button type="button" className={circleBtn} aria-label="Next page" disabled={page >= pages} onClick={() => go(page + 1)}><ChevronRight size={15} /></button>
        </div>
      </div>
      {open && <RequestDrawer key={open.id} request={open} canNote={canNote} onClose={() => setOpenId(null)} />}
    </>
  );
}
