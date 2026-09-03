"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ClipboardList, Search, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";

export type OrderStatus = "pending_review" | "converted" | "dismissed";

export type OrderListItem = {
  id: string;
  status: OrderStatus;
  company_name: string;
  contact_name: string | null;
  business_email: string | null;
  services: string[];
  mapped_classifications: string[];
  created_at: string;
  submitted_at: string | null;
  customer_id: string | null;
  project_id: string | null;
};

export type PaginationMeta = { page: number; pageSize: number; total: number };

const STATUS_TABS: { value: OrderStatus; label: string }[] = [
  { value: "pending_review", label: "Pending review" },
  { value: "converted", label: "Converted" },
  { value: "dismissed", label: "Dismissed" },
];

export default function OrdersTable({
  orders,
  status,
  counts,
  searchQ,
  paginationMeta,
}: {
  orders: OrderListItem[];
  status: OrderStatus;
  counts: Record<OrderStatus, number>;
  searchQ: string;
  paginationMeta: PaginationMeta;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchQ);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { page, pageSize, total } = paginationMeta;
  const from = (page - 1) * pageSize;
  const hasNext = from + pageSize < total;
  const hasPrev = page > 1;

  function buildUrl(overrides: Record<string, string | number | null>) {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) p.delete(k);
      else p.set(k, String(v));
    }
    return `${V2_ROUTES.STACKSHIFT_ORDERS}?${p.toString()}`;
  }

  return (
    <div>
      <div className="sticky top-0 z-20 bg-[#F4F6FB]">
        <div className="max-w-[1400px] mx-auto px-8 pt-6 pb-4">
          <div className="mb-4">
            <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#0B1533]">StackShift Orders</h1>
            <p className="text-[13px] text-[#5F6A88] mt-0.5">
              Order Form submissions from webriq.com — review and convert to a customer &amp; project.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative min-w-[220px] max-w-md flex-shrink-0">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5F6A88]" />
              <input
                value={searchInput}
                onChange={(e) => {
                  const q = e.target.value;
                  setSearchInput(q);
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  debounceRef.current = setTimeout(() => {
                    router.push(buildUrl({ search: q || null, page: 1 }));
                  }, 300);
                }}
                placeholder="Search company, contact, or email…"
                className="w-full pl-9 pr-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] placeholder:text-[#5F6A88]"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
              {STATUS_TABS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => router.push(buildUrl({ status: t.value, page: 1 }))}
                  aria-pressed={status === t.value}
                  className={cn(
                    "px-3 py-[4.5px] rounded-full border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap",
                    status === t.value
                      ? "bg-[#071133] border-[#071133] text-white"
                      : "bg-white border-[#E2E7F2] text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533]"
                  )}
                >
                  {t.label}
                  <span className={cn("ml-1.5 font-mono", status === t.value ? "text-white/70" : "text-[#5F6A88]/70")}>
                    {counts[t.value]}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex-1 min-w-0" />

            {total > 0 && (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[12px] font-mono text-[#5F6A88] tabular-nums">
                  {from + 1}–{Math.min(from + pageSize, total)} of {total}
                </span>
                <div className="flex items-center gap-1 text-[#5F6A88]">
                  <button onClick={() => router.push(buildUrl({ page: 1 }))} disabled={!hasPrev} title="First page"
                    className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors">
                    <ChevronsLeft size={14} />
                  </button>
                  <button onClick={() => router.push(buildUrl({ page: page - 1 }))} disabled={!hasPrev} title="Previous page"
                    className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors">
                    <ChevronLeft size={14} />
                  </button>
                  <button onClick={() => router.push(buildUrl({ page: page + 1 }))} disabled={!hasNext} title="Next page"
                    className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors">
                    <ChevronRight size={14} />
                  </button>
                  <button onClick={() => router.push(buildUrl({ page: Math.ceil(total / pageSize) }))} disabled={!hasNext} title="Last page"
                    className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors">
                    <ChevronsRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-8 py-5">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-[14px] border border-[#E2E7F2] bg-white">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#F0F7FF]">
              {searchQ ? <Search size={24} className="text-[#007BFF]" /> : <ClipboardList size={26} className="text-[#007BFF]" />}
            </div>
            <div className="text-center">
              <div className="text-[15px] font-semibold text-[#0B1533]">
                {searchQ ? "No orders match your search" : `No ${STATUS_TABS.find((t) => t.value === status)?.label.toLowerCase()} orders`}
              </div>
              <p className="text-[13px] text-[#5F6A88] mt-1">
                {searchQ ? "Try a different search term or clear the filter." : "New submissions from the StackShift Order Form will appear here."}
              </p>
            </div>
            {searchQ && (
              <button
                onClick={() => { setSearchInput(""); router.push(buildUrl({ search: null, page: 1 })); }}
                className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] hover:bg-[#F0F7FF] cursor-pointer transition-colors"
              >
                <X size={13} /> Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden">
            <div className="grid grid-cols-[1.3fr_1.2fr_1.4fr_120px] items-center gap-3 px-5 py-2.5 border-b border-[#EDF0F7] bg-[#FAFBFE]">
              <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Company</span>
              <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Contact</span>
              <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Services</span>
              <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] text-right">Submitted</span>
            </div>
            {orders.map((o) => (
              <button
                key={o.id}
                onClick={() => router.push(`${V2_ROUTES.STACKSHIFT_ORDERS}/${o.id}`)}
                className="w-full text-left grid grid-cols-[1.3fr_1.2fr_1.4fr_120px] items-center gap-3 px-5 py-3 border-b border-[#EDF0F7] last:border-0 hover:bg-[#F0F7FF] transition-colors group cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[#0B1533] truncate group-hover:text-[#007BFF]">{o.company_name}</div>
                  {o.mapped_classifications.length > 0 && (
                    <div className="text-[11px] text-[#5F6A88] truncate">{o.mapped_classifications.join(", ")}</div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] text-[#3A4565] truncate">{o.contact_name ?? "—"}</div>
                  {o.business_email && <div className="text-[11px] text-[#5F6A88] truncate">{o.business_email}</div>}
                </div>
                <div className="min-w-0 flex flex-wrap gap-1">
                  {o.services.length === 0 ? (
                    <span className="text-[12px] text-[#5F6A88]/40">—</span>
                  ) : (
                    o.services.map((s) => (
                      <span key={s} className="px-2 py-0.5 rounded-full bg-[#EEF3FF] text-[10.5px] font-medium text-[#2B4C86] whitespace-nowrap">
                        {s}
                      </span>
                    ))
                  )}
                </div>
                <div className="text-right text-[12px] text-[#5F6A88] font-mono tabular-nums">
                  {formatDate(o.submitted_at ?? o.created_at)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
