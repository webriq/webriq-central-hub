"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { fieldClass } from "../_components/ui";
import type { EmployeeRow, LeaveTypeRow } from "@/lib/hr/types";

const TABS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Denied" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

/** URL-driven filters: status pills (navy = selected), leave type, and — for admins — employee. */
export function RequestFilters({ status, types, employees, manager }: { status: string; types: LeaveTypeRow[]; employees: EmployeeRow[]; manager: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function set(key: string, value: string | null) {
    const p = new URLSearchParams(sp.toString());
    if (value) p.set(key, value); else p.delete(key);
    p.delete("page");
    router.push(`${pathname}?${p.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[#EDF0F7] px-[18px] py-3">
      <div role="group" aria-label="Status" className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            aria-pressed={status === t.value}
            onClick={() => set("status", t.value === "pending" ? null : t.value)}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF] ${
              status === t.value ? "border-[#071133] bg-[#071133] text-white" : "border-[#E2E7F2] bg-white text-[#3A4565] hover:border-[#A8C6F5]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <select aria-label="Leave type" className={`${fieldClass} !w-44 !py-1.5 !text-[12px]`} value={sp.get("type") ?? ""} onChange={(e) => set("type", e.target.value || null)}>
          <option value="">All leave types</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {manager && (
          <select aria-label="Employee" className={`${fieldClass} !w-44 !py-1.5 !text-[12px]`} value={sp.get("employee") ?? ""} onChange={(e) => set("employee", e.target.value || null)}>
            <option value="">Everyone</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}
