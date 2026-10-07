"use client";

import { Pencil, Trash2 } from "lucide-react";
import { formatDate, relativeDays } from "@/lib/hr/dates";
import type { HolidayRow } from "@/lib/hr/types";
import { HolidayChip } from "../_components/chips";
import { cellClass, iconBtn, monoDate, tableHeadClass } from "../_components/ui";

export function HolidayList({
  holidays,
  today,
  canManage,
  onEdit,
  onDelete,
}: {
  holidays: HolidayRow[];
  today: string;
  canManage: boolean;
  onEdit: (h: HolidayRow) => void;
  onDelete: (h: HolidayRow) => void;
}) {
  const nextId = holidays.find((h) => h.holiday_date >= today)?.id;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse">
        <thead>
          <tr>
            <th className={`${tableHeadClass} pl-[18px]`}>Date</th>
            <th className={tableHeadClass}>Holiday</th>
            <th className={tableHeadClass}>Type</th>
            <th className={tableHeadClass}>When</th>
            {canManage && <th className={`${tableHeadClass} w-24`}><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {holidays.map((h) => {
            const past = h.holiday_date < today;
            return (
              <tr key={h.id} className={`transition-colors hover:bg-[#F0F7FF] ${h.id === nextId ? "bg-[#F0F7FF]" : ""} ${past ? "opacity-60" : ""}`}>
                <td className={`${cellClass} pl-[18px] ${monoDate}`}>{formatDate(h.holiday_date)}</td>
                <td className={cellClass}>
                  <span className="font-semibold text-[#0B1533]">{h.name}</span>
                  {h.note && <span className="block text-[11px] text-[#5F6A88]">{h.note}</span>}
                </td>
                <td className={cellClass}><HolidayChip kind={h.kind} /></td>
                <td className={`${cellClass} font-mono text-[11px] text-[#5F6A88]`}>{relativeDays(h.holiday_date, today)}</td>
                {canManage && (
                  <td className={`${cellClass} text-right`}>
                    <button type="button" className={iconBtn} aria-label={`Edit ${h.name}`} onClick={() => onEdit(h)}><Pencil size={14} /></button>
                    <button type="button" className={iconBtn} aria-label={`Delete ${h.name}`} onClick={() => onDelete(h)}><Trash2 size={14} /></button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
