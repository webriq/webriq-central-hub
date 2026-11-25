"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, AlertTriangle,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { normalizeClassifications } from "@/config/customer-phases";
import OrderRowMenu from "./order-row-menu";
import OrderFormLink from "./order-form-link";
import { OrdersTableSkeleton } from "./orders-skeleton";
import OrdersEmpty from "./orders-empty";

export type OrderStatus = "pending_review" | "converted" | "dismissed";
// Task 498 — "archived" is a tab, not a status: archived orders keep their status.
export type OrderTab = OrderStatus | "archived";

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
  contact_risk: "low" | "medium" | "high" | null;
};

export type PaginationMeta = { page: number; pageSize: number; total: number };

const STATUS_TABS: { value: OrderTab; label: string }[] = [
  { value: "pending_review", label: "Pending review" },
  { value: "converted", label: "Converted" },
  { value: "dismissed", label: "Dismissed" },
  { value: "archived", label: "Archived" },
];

const COLS = "grid-cols-[1.3fr_1.2fr_1.4fr_120px]";

export default function OrdersTable({
  orders,
  tab,
  counts,
  searchQ,
  paginationMeta,
  readOnly,
  isSuperAdmin,
}: {
  orders: OrderListItem[];
  tab: OrderTab;
  counts: Record<OrderTab, number>;
  readOnly: boolean;
  isSuperAdmin: boolean;
  searchQ: string;
  paginationMeta: PaginationMeta;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchQ);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Task 499 — loading.tsx only covers the first load; search-param navigations (tab, search,
  // pager) go through a transition so isPending can swap the rows for the skeleton instantly.
  const [isPending, startTransition] = useTransition();
  const [pendingTab, setPendingTab] = useState<OrderTab | null>(null);
  const activeTab = isPending && pendingTab ? pendingTab : tab;

  function navigate(overrides: Record<string, string | number | null>) {
    // Set on every navigation (null when the tab isn't changing) so a stale tab never flashes active.
    setPendingTab((overrides.status as OrderTab | undefined) ?? null);
    startTransition(() => router.push(buildUrl(overrides)));
  }

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
    return `${V2_ROUTES.ORDERS}?${p.toString()}`;
  }

  return (
    <div>
      <div className="sticky top-0 z-20 bg-[#F4F6FB]">
        <div className="max-w-[1400px] mx-auto px-8 pt-6 pb-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#0B1533]">Orders</h1>
              <p className="text-[13px] text-[#5F6A88] mt-0.5">
                Order Form submissions from webriq.com — review and convert to a customer &amp; project.
              </p>
            </div>
            {/* Task 504 — public Order Form link + Copy password, for every Orders viewer. */}
            <OrderFormLink />
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
                    navigate({ search: q || null, page: 1 });
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
                  onClick={() => navigate({ status: t.value, page: 1 })}
                  aria-pressed={activeTab === t.value}
                  className={cn(
                    "px-3 py-[4.5px] rounded-full border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap",
                    activeTab === t.value
                      ? "bg-[#071133] border-[#071133] text-white"
                      : "bg-white border-[#E2E7F2] text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533]"
                  )}
                >
                  {t.label}
                  <span className={cn("ml-1.5 font-mono", activeTab === t.value ? "text-white/70" : "text-[#5F6A88]/70")}>
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
                  {[
                    { title: "First page", Icon: ChevronsLeft, to: 1, enabled: hasPrev },
                    { title: "Previous page", Icon: ChevronLeft, to: page - 1, enabled: hasPrev },
                    { title: "Next page", Icon: ChevronRight, to: page + 1, enabled: hasNext },
                    { title: "Last page", Icon: ChevronsRight, to: Math.ceil(total / pageSize), enabled: hasNext },
                  ].map(({ title, Icon, to, enabled }) => (
                    <button key={title} onClick={() => navigate({ page: to })} disabled={!enabled} title={title} aria-label={title}
                      className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors">
                      <Icon size={14} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-8 py-5" aria-busy={isPending}>
        {isPending ? (
          <OrdersTableSkeleton rows={Math.min(pageSize, 20)} withMenu={!readOnly} />
        ) : orders.length === 0 ? (
          <OrdersEmpty
            searchQ={searchQ}
            tabLabel={STATUS_TABS.find((t) => t.value === tab)?.label ?? ""}
            archived={tab === "archived"}
            onClear={() => { setSearchInput(""); navigate({ search: null, page: 1 }); }}
          />
        ) : (
          <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden">
            <div className={cn("grid items-center border-b border-[#EDF0F7] bg-[#FAFBFE]", readOnly ? "grid-cols-1" : "grid-cols-[1fr_44px]")}>
              <div className={cn("grid items-center gap-3 px-5 py-2.5", COLS)}>
                <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Company</span>
                <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Contact</span>
                <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Services</span>
                <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] text-right">Submitted</span>
              </div>
              {!readOnly && <span className="sr-only">Actions</span>}
            </div>
            {orders.map((o) => (
              // The menu can't nest inside the row <button>, so the row is a grid of [button, menu cell].
              <div
                key={o.id}
                className={cn(
                  "grid items-center border-b border-[#EDF0F7] last:border-0 hover:bg-[#F0F7FF] transition-colors",
                  readOnly ? "grid-cols-1" : "grid-cols-[1fr_44px]"
                )}
              >
                <button
                  onClick={() => router.push(`${V2_ROUTES.ORDERS}/${o.id}`)}
                  className={cn("w-full text-left grid items-center gap-3 px-5 py-3 group cursor-pointer", COLS)}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[13px] font-medium text-[#0B1533] truncate group-hover:text-[#007BFF]">{o.company_name}</span>
                      {(o.contact_risk === "medium" || o.contact_risk === "high") && (
                        <span
                          title={o.contact_risk === "high" ? "Contact email/phone flagged high risk" : "Contact email/phone flagged for review"}
                          className={cn(
                            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold shrink-0",
                            o.contact_risk === "high" ? "bg-[#FDECEC] text-[#9B2C2C]" : "bg-[#FFF3D6] text-[#8A5A00]"
                          )}
                        >
                          <AlertTriangle size={10} /> Contact
                        </span>
                      )}
                    </div>
                    {o.mapped_classifications.length > 0 && (
                      <div className="text-[11px] text-[#5F6A88] truncate">{normalizeClassifications(o.mapped_classifications).join(", ")}</div>
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
                {!readOnly && (
                  <div className="pr-3">
                    <OrderRowMenu order={o} archived={tab === "archived"} isSuperAdmin={isSuperAdmin} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
