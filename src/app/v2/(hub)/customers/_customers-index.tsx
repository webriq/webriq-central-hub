"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Search, FolderKanban, Mail, Plus, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { V2_ROUTES } from "@/config/constants";
import { getCurrentProgrammeDay, getPhaseForDay } from "@/config/customer-phases";

export type CustomerProductProgress = {
  id: string;
  product_name: string;
  completed_percentage: number;
};

export type CustomerListItem = {
  customer_id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  status: string;
  project_count: number;
  customer_products: CustomerProductProgress[];
  desk_contact_count: number;
  // Derived from the customer's *visible* project(s) only — hidden (still-onboarding) projects
  // never surface here. `null` = no visible project has started its 120-day clock.
  programme_started_at: string | null;
};

export type PaginationMeta = { page: number; pageSize: number; total: number };

// Matches the real `customers.status` DB constraint (supabase/migrations/010_completed_onboarding_status.sql:6-7).
const STATUS_FILTERS = ["all", "active", "onboarding", "completed_onboarding", "inactive"] as const;
const STATUS_LABELS: Record<string, string> = {
  all: "All",
  active: "Active",
  onboarding: "Onboarding",
  completed_onboarding: "Completed Onboarding",
  inactive: "Inactive",
};
const STATUS_STYLE: Record<string, { text: string; bg: string; border: string }> = {
  active:               { text: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  onboarding:           { text: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  completed_onboarding: { text: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  inactive:             { text: "#94A3B8", bg: "#F8FAFC", border: "#E2E8F0" },
};
const PAGE_SIZES = [20, 50, 100] as const;

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_STYLE[status] ?? STATUS_STYLE.inactive;
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap"
      style={{ color: c.text, background: c.bg, borderColor: c.border }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function ProgrammeBadge({ programmeStartedAt }: { programmeStartedAt: string }) {
  const day = Math.min(120, getCurrentProgrammeDay(programmeStartedAt));
  const phase = getPhaseForDay(day);
  return (
    <div className="inline-flex items-center gap-1 text-[10.5px] text-slate-400 mt-0.5">
      <CalendarClock size={10} />
      Day {day}/120 · Phase {phase.number}
    </div>
  );
}

function ProgressCell({ products }: { products: CustomerProductProgress[] }) {
  if (products.length === 0) {
    return <span className="text-[12px] text-slate-300">—</span>;
  }
  const avg = products.reduce((sum, p) => sum + p.completed_percentage, 0) / products.length;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
          style={{ width: `${Math.min(100, Math.round(avg))}%` }}
        />
      </div>
      <span className="text-[11px] text-slate-500 w-8 text-right font-mono">{Math.round(avg)}%</span>
    </div>
  );
}

export default function CustomersIndex({
  customers,
  paginationMeta,
}: {
  customers: CustomerListItem[];
  paginationMeta: PaginationMeta;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL-driven filter values — server is the source of truth.
  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  const statusValue = (searchParams.get("status") ?? "all") as (typeof STATUS_FILTERS)[number];
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scrolled, setScrolled] = useState(false);

  // Live onboarding progress overlay — keyed by customer_products.id, merged at render time.
  // (A per-id override map, not a forked copy of `customers`, so it never needs to resync
  // when the `customers` prop changes across page/filter navigations.)
  const [productOverrides, setProductOverrides] = useState<Record<string, number>>({});

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("v2_customers_products")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "customer_products" }, (payload) => {
        const updated = payload.new as { id: string; completed_percentage: number };
        setProductOverrides((prev) => ({ ...prev, [updated.id]: updated.completed_percentage }));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const onScroll = () => setScrolled(main.scrollTop > 4);
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  function getProductsFor(c: CustomerListItem): CustomerProductProgress[] {
    return c.customer_products.map((p) =>
      p.id in productOverrides ? { ...p, completed_percentage: productOverrides[p.id] } : p
    );
  }

  function buildUrl(overrides: Record<string, string | number | null>) {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) { p.delete(k); } else { p.set(k, String(v)); }
    }
    return `${V2_ROUTES.CUSTOMERS}?${p.toString()}`;
  }

  const { page, pageSize, total } = paginationMeta;
  const from = (page - 1) * pageSize;
  const hasNext = from + pageSize < total;
  const hasPrev = page > 1;
  const showPagination = total > 0;

  return (
    <div>
      {/* ── Sticky header (title row + toolbar row) ─────────────────────────── */}
      <div className={`sticky top-0 z-20 bg-slate-50 transition-shadow duration-150 ${scrolled ? "shadow-[0_1px_0_0_rgba(0,0,0,0.08)]" : ""}`}>
        <div className="max-w-[1400px] mx-auto px-8 pt-6 pb-4">
          {/* Title row */}
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-[22px] font-bold text-slate-900 tracking-[-0.02em]">Customers</h1>
              <p className="text-[13px] text-slate-500 mt-0.5">{total} customer{total === 1 ? "" : "s"}</p>
            </div>
            <button
              onClick={() => router.push(V2_ROUTES.CUSTOMERS_ONBOARD)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-[13px] font-medium hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              <Plus size={16} /> New Customer
            </button>
          </div>

          {/* Toolbar row: search + status filter + pagination (right) */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative min-w-[220px] max-w-md flex-shrink-0">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
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
                placeholder="Search customers…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-700 outline-none focus:border-slate-400 placeholder:text-slate-400"
              />
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shrink-0">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => router.push(buildUrl({ status: s === "all" ? null : s, page: 1 }))}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap",
                    statusValue === s ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>

            {/* Spacer */}
            <div className="flex-1 min-w-0" />

            {/* Pagination controls — only when there are results */}
            {showPagination && (
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={pageSize}
                  onChange={(e) => router.push(buildUrl({ pageSize: Number(e.target.value), page: 1 }))}
                  className="h-8 px-2.5 pr-7 rounded-lg border border-slate-200 bg-white text-[12px] text-slate-600 outline-none focus:border-slate-400 cursor-pointer appearance-none"
                  style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2394a3b8'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>{n} per page</option>
                  ))}
                </select>
                <span className="text-[12px] text-slate-400 tabular-nums">
                  {from + 1}–{Math.min(from + pageSize, total)} of {total}
                </span>
                <div className="flex items-center gap-1 text-slate-500">
                  <button
                    onClick={() => router.push(buildUrl({ page: 1 }))}
                    disabled={!hasPrev}
                    className="flex items-center justify-center w-7 h-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="First page"
                  >
                    <ChevronsLeft size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => router.push(buildUrl({ page: page - 1 }))}
                    disabled={!hasPrev}
                    className="flex items-center justify-center w-7 h-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="Previous page"
                  >
                    <ChevronLeft size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => router.push(buildUrl({ page: page + 1 }))}
                    disabled={!hasNext}
                    className="flex items-center justify-center w-7 h-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="Next page"
                  >
                    <ChevronRight size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => router.push(buildUrl({ page: Math.ceil(total / pageSize) }))}
                    disabled={!hasNext}
                    className="flex items-center justify-center w-7 h-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="Last page"
                  >
                    <ChevronsRight size={14} strokeWidth={2} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Scrollable content ───────────────────────────────────────────────── */}
      <div className="max-w-[1400px] mx-auto px-8 py-5">
        {customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Building2 size={26} className="text-slate-400" />
            </div>
            <div className="text-center">
              <div className="text-[15px] font-semibold text-slate-700">No customers found</div>
              <p className="text-[13px] text-slate-400 mt-1">Try a different search or filter.</p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_90px_140px_100px] items-center gap-3 px-5 py-2.5 border-b border-slate-100 bg-slate-50">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Company</span>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Contact</span>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</span>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Onboarding</span>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Projects</span>
            </div>
            {customers.map((c) => (
              <div
                key={c.customer_id}
                className="grid grid-cols-[1fr_1fr_90px_140px_100px] items-center gap-3 px-5 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors group"
              >
                <button
                  onClick={() => router.push(`${V2_ROUTES.CUSTOMERS}/${c.customer_id}`)}
                  className="text-left min-w-0 cursor-pointer"
                >
                  <div className="text-[13px] font-medium text-slate-800 truncate group-hover:text-blue-600">{c.company_name}</div>
                  <div className="text-[11px] font-mono text-slate-400 truncate">{c.customer_id}</div>
                  {c.programme_started_at && (
                    <ProgrammeBadge programmeStartedAt={c.programme_started_at} />
                  )}
                </button>
                <div className="min-w-0">
                  <div className="text-[13px] text-slate-600 truncate">{c.contact_name ?? "—"}</div>
                  {c.contact_email && (
                    <div className="inline-flex items-center gap-1 text-[11px] text-slate-400 truncate">
                      <Mail size={10} /> {c.contact_email}
                    </div>
                  )}
                  {c.desk_contact_count > 0 && (
                    <div className="text-[11px] text-slate-400 truncate">
                      +{c.desk_contact_count} Desk contact{c.desk_contact_count > 1 ? "s" : ""}
                    </div>
                  )}
                </div>
                <StatusBadge status={c.status} />
                <ProgressCell products={getProductsFor(c)} />
                <div className="flex justify-end">
                  <button
                    onClick={() => router.push(`${V2_ROUTES.PROJECTS}?customer=${encodeURIComponent(c.customer_id)}`)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-100 hover:border-slate-300 cursor-pointer"
                  >
                    <FolderKanban size={13} /> {c.project_count}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
