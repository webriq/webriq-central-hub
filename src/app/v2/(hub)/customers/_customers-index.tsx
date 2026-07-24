"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Search, FolderKanban, Mail, Plus, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CalendarClock, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { V2_ROUTES } from "@/config/constants";
import { getCurrentProgrammeDay, getPhaseForDay } from "@/config/customer-phases";
import { Chip } from "../dashboard/_components/dashboard-shared";

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
// `customers.status` is a coarse lifecycle flag, not the fine-grained 120-day phase tracked
// per-project — never map it onto one of the five reserved phase hues (DESIGN.md Section 2).
// `completed_onboarding` reuses `ok` too (same green as `active`), distinguished by a leading
// checkmark instead of a dot, mirroring `OnboardingStatusPill`'s completed-vs-in-progress pattern.
const STATUS_TONE: Record<string, "ok" | "warn" | "neutral"> = {
  active: "ok",
  onboarding: "warn",
  completed_onboarding: "ok",
  inactive: "neutral",
};
const PAGE_SIZES = [20, 50, 100] as const;

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "neutral";
  const label = STATUS_LABELS[status] ?? status;
  if (status === "completed_onboarding") {
    return (
      <Chip tone={tone}>
        <Check size={9} strokeWidth={3} className="shrink-0" />
        {label}
      </Chip>
    );
  }
  return (
    <Chip tone={tone} dot={status === "active" || status === "onboarding"}>
      {label}
    </Chip>
  );
}

function ProgrammeBadge({ programmeStartedAt }: { programmeStartedAt: string }) {
  const day = Math.min(120, getCurrentProgrammeDay(programmeStartedAt));
  const phase = getPhaseForDay(day);
  return (
    <div className="inline-flex items-center gap-1 text-[10.5px] font-mono text-[#5F6A88] mt-0.5">
      <CalendarClock size={10} />
      Day {day}/120 · Phase {phase.number}
    </div>
  );
}

function ProgressCell({ products }: { products: CustomerProductProgress[] }) {
  if (products.length === 0) {
    return <span className="text-[12px] text-[#5F6A88]/40">—</span>;
  }
  const avg = products.reduce((sum, p) => sum + p.completed_percentage, 0) / products.length;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-[#EDF0F7]">
        <div
          className="h-full rounded-full bg-[#007BFF] transition-[width] duration-300"
          style={{ width: `${Math.min(100, Math.round(avg))}%` }}
        />
      </div>
      <span className="text-[11px] font-mono text-[#5F6A88] w-8 text-right">{Math.round(avg)}%</span>
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
  const isFiltered = (searchParams.get("search")?.trim().length ?? 0) > 0 || statusValue !== "all";

  return (
    <div>
      {/* ── Sticky header (title row + toolbar row) ─────────────────────────── */}
      <div className={cn("sticky top-0 z-20 bg-[#F4F6FB] transition-shadow duration-150", scrolled && "shadow-[0_1px_0_0_rgba(7,17,51,0.08)]")}>
        <div className="max-w-[1400px] mx-auto px-8 pt-6 pb-4">
          {/* Title row */}
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#0B1533]">Customers</h1>
              <p className="text-[13px] text-[#5F6A88] mt-0.5">{total} customer{total === 1 ? "" : "s"}</p>
            </div>
            <button
              onClick={() => router.push(V2_ROUTES.CUSTOMERS_ONBOARD)}
              className="inline-flex items-center gap-2 px-[15px] py-2 rounded-full text-[12px] font-semibold transition-colors cursor-pointer bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white shrink-0"
            >
              <Plus size={14} /> New Customer
            </button>
          </div>

          {/* Toolbar row: search + status filter + pagination (right) */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
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
                placeholder="Search company, contact, or customer ID…"
                className="w-full pl-9 pr-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] placeholder:text-[#5F6A88]"
              />
            </div>

            {/* Status filter pills — DESIGN.md: individual floating pills, active fills navy
                (never blue, so filters read as selection state, not an action). */}
            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => router.push(buildUrl({ status: s === "all" ? null : s, page: 1 }))}
                  aria-pressed={statusValue === s}
                  className={cn(
                    "px-3 py-[4.5px] rounded-full border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap",
                    statusValue === s ? "bg-[#071133] border-[#071133] text-white" : "bg-white border-[#E2E7F2] text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533]"
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
                  className="h-8 px-2.5 pr-7 rounded-[10px] border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] outline-none focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] cursor-pointer appearance-none"
                  style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235F6A88'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>{n} per page</option>
                  ))}
                </select>
                <span className="text-[12px] font-mono text-[#5F6A88] tabular-nums">
                  {from + 1}–{Math.min(from + pageSize, total)} of {total}
                </span>
                <div className="flex items-center gap-1 text-[#5F6A88]">
                  <button
                    onClick={() => router.push(buildUrl({ page: 1 }))}
                    disabled={!hasPrev}
                    className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="First page"
                  >
                    <ChevronsLeft size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => router.push(buildUrl({ page: page - 1 }))}
                    disabled={!hasPrev}
                    className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="Previous page"
                  >
                    <ChevronLeft size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => router.push(buildUrl({ page: page + 1 }))}
                    disabled={!hasNext}
                    className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="Next page"
                  >
                    <ChevronRight size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => router.push(buildUrl({ page: Math.ceil(total / pageSize) }))}
                    disabled={!hasNext}
                    className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
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
          isFiltered ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-[14px] border border-[#E2E7F2] bg-white">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#FFF3D6]">
                <Search size={24} className="text-[#8A5A00]" />
              </div>
              <div className="text-center">
                <div className="text-[15px] font-semibold text-[#0B1533]">No customers match your search</div>
                <p className="text-[13px] text-[#5F6A88] mt-1">Try a different search term or clear the filter.</p>
              </div>
              <button
                onClick={() => { setSearchInput(""); router.push(V2_ROUTES.CUSTOMERS); }}
                className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] hover:bg-[#F0F7FF] cursor-pointer transition-colors"
              >
                <X size={13} /> Clear filters
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-[14px] border border-[#E2E7F2] bg-white">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#F0F7FF]">
                <Building2 size={26} className="text-[#007BFF]" />
              </div>
              <div className="text-center">
                <div className="text-[15px] font-semibold text-[#0B1533]">No customers yet</div>
                <p className="text-[13px] text-[#5F6A88] mt-1">New customers you onboard will appear here.</p>
              </div>
            </div>
          )
        ) : (
          <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_90px_140px_100px] items-center gap-3 px-5 py-2.5 border-b border-[#EDF0F7] bg-[#FAFBFE]">
              <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Company</span>
              <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Contact</span>
              <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Status</span>
              <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Onboarding</span>
              <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] text-right">Projects</span>
            </div>
            {customers.map((c) => (
              <div
                key={c.customer_id}
                className="grid grid-cols-[1fr_1fr_90px_140px_100px] items-center gap-3 px-5 py-3 border-b border-[#EDF0F7] last:border-0 hover:bg-[#F0F7FF] transition-colors group"
              >
                <button
                  onClick={() => router.push(`${V2_ROUTES.CUSTOMERS}/${c.customer_id}`)}
                  className="text-left min-w-0 cursor-pointer"
                >
                  <div className="text-[13px] font-medium text-[#0B1533] truncate group-hover:text-[#007BFF]">{c.company_name}</div>
                  <div className="text-[11px] font-mono text-[#5F6A88] truncate">{c.customer_id}</div>
                  {c.programme_started_at && (
                    <ProgrammeBadge programmeStartedAt={c.programme_started_at} />
                  )}
                </button>
                <div className="min-w-0">
                  <div className="text-[13px] text-[#3A4565] truncate">{c.contact_name ?? "—"}</div>
                  {c.contact_email && (
                    <div className="inline-flex items-center gap-1 text-[11px] text-[#5F6A88] truncate">
                      <Mail size={10} /> {c.contact_email}
                    </div>
                  )}
                  {c.desk_contact_count > 0 && (
                    <div className="text-[11px] text-[#5F6A88] truncate">
                      +{c.desk_contact_count} Desk contact{c.desk_contact_count > 1 ? "s" : ""}
                    </div>
                  )}
                </div>
                <StatusBadge status={c.status} />
                <ProgressCell products={getProductsFor(c)} />
                <div className="flex justify-end">
                  <button
                    onClick={() => router.push(`${V2_ROUTES.PROJECTS}?customer=${encodeURIComponent(c.customer_id)}`)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#E2E7F2] text-[12px] text-[#3A4565] hover:bg-[#F0F7FF] hover:border-[#A8C6F5] cursor-pointer transition-colors"
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
