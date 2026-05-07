"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { CustomerRow, CustomerProductRow } from "@/types/database";

interface CustomerWithProducts extends CustomerRow {
  customer_products: CustomerProductRow[];
}

const PRODUCT_ABBREV: Record<string, string> = {
  StackShift: "SS",
  PublishForge: "PF",
  CiteForge: "CF",
  PipelineForge: "PpF",
};

const PRODUCT_COLORS: Record<string, string> = {
  StackShift: "#3358F4",
  PublishForge: "#7C3AED",
  CiteForge: "#22C55E",
  PipelineForge: "#F97316",
};

const statusClass = (status: string) =>
  ({
    onboarding: "bg-[#FFF4EC] text-orange-500",
    active: "bg-green-50 text-green-600",
    inactive: "bg-slate-100 text-slate-500",
  } as Record<string, string>)[status] ?? "bg-slate-100 text-slate-500";

const thCls =
  "text-[10px] font-bold text-slate-400 tracking-[0.06em] uppercase px-2 py-1.5 text-left border-b border-slate-100 cursor-pointer whitespace-nowrap";

export default function PMDashboardPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerWithProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const retryRef = useRef<() => void>(() => {});

  // Fetch customers on mount and when filters change
  useEffect(() => {
    let cancelled = false;
    const fetchCustomers = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("limit", "100");
        if (search) params.set("search", search);
        if (statusFilter) params.set("status", statusFilter);
        const res = await fetch(`/api/customers?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load customers");
        const data = await res.json();
        if (!cancelled) setCustomers(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load customers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    retryRef.current = fetchCustomers;
    fetchCustomers();
    return () => { cancelled = true; };
  }, [search, statusFilter]);

  // Supabase Realtime — patch product rows in-place as customers fill the form
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("pm_product_progress")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "customer_products" },
        (payload) => {
          const updated = payload.new as CustomerProductRow;
          setCustomers((prev) =>
            prev.map((c) => ({
              ...c,
              customer_products: c.customer_products.map((p) =>
                p.id === updated.id ? { ...p, ...updated } : p
              ),
            }))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
  };

  const sortedCustomers = [...customers].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortBy === "created_at")
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
    if (sortBy === "company_name") return a.company_name.localeCompare(b.company_name) * dir;
    if (sortBy === "status") return (a.status ?? "").localeCompare(b.status ?? "") * dir;
    return 0;
  });

  const getRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getProductBadges = (products: CustomerProductRow[] | undefined) => {
    if (!products || products.length === 0) return null;
    return products.map((p) => (
      <span
        key={p.id}
        className="inline-block px-2 py-px rounded text-[11px] font-semibold mr-1 mb-1"
        style={{
          background: `${PRODUCT_COLORS[p.product_name] ?? "#94A3B8"}15`,
          color: PRODUCT_COLORS[p.product_name] ?? "#94A3B8",
        }}
      >
        {p.product_name}
      </span>
    ));
  };

  return (
    <div className="p-6 overflow-y-auto flex-1">
      {/* Header */}
      <div className="flex justify-between items-center mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 m-0">Customers</h1>
          <p className="text-[13px] text-slate-500 mt-1 mb-0">
            {customers.length} customer{customers.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => router.push("/onboarding")}
          className="font-[inherit] py-2.5 px-[22px] bg-brand-orange text-white text-[13px] font-semibold border-none rounded-full cursor-pointer"
        >
          + New Customer
        </button>
      </div>

      {/* Search / Filter */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="font-[inherit] flex-1 max-w-[320px] text-[13px] py-[9px] px-3 border border-slate-200 rounded-lg text-slate-900 bg-white outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="font-[inherit] text-[13px] py-[9px] px-3 border border-slate-200 rounded-lg text-slate-900 bg-white outline-none"
        >
          <option value="">All Statuses</option>
          <option value="onboarding">Onboarding</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-[13px] text-red-600 mb-4">
          {error}
          <button
            onClick={() => retryRef.current()}
            className="ml-3 font-[inherit] text-xs font-semibold bg-none border-none text-red-600 underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={cn(thCls, "w-[140px]")} onClick={() => handleSort("customer_id")}>
                ID {sortBy === "customer_id" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className={thCls} onClick={() => handleSort("company_name")}>
                Company {sortBy === "company_name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className={thCls}>Contact</th>
              <th className={thCls}>Products</th>
              <th className={thCls} onClick={() => handleSort("status")}>
                Status {sortBy === "status" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className={cn(thCls, "w-[180px]")}>Progress</th>
              <th className={cn(thCls, "w-[100px]")} onClick={() => handleSort("created_at")}>
                Created {sortBy === "created_at" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400 text-[13px]">
                  Loading customers...
                </td>
              </tr>
            ) : sortedCustomers.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400 text-[13px]">
                  No customers found.{" "}
                  <Link href="/onboarding" className="text-brand font-semibold">
                    Create your first customer
                  </Link>
                </td>
              </tr>
            ) : (
              sortedCustomers.map((customer) => {
                const status = customer.status ?? "onboarding";
                const products = customer.customer_products ?? [];
                return (
                  <tr
                    key={customer.id}
                    onClick={() => router.push(`/customers/${customer.customer_id}`)}
                    className="border-b border-slate-100 cursor-pointer transition-colors duration-100 hover:bg-slate-50"
                  >
                    <td className="p-2 align-middle">
                      <span className="font-mono text-xs text-slate-400">
                        {customer.customer_id}
                      </span>
                    </td>
                    <td className="p-2 align-middle">
                      <span className="text-[13px] font-medium text-slate-900">
                        {customer.company_name}
                      </span>
                    </td>
                    <td className="p-2 align-middle">
                      <div className="text-[13px] text-slate-600">
                        {customer.contact_name || "—"}
                      </div>
                      {customer.contact_email && (
                        <div className="text-[11px] text-slate-400">{customer.contact_email}</div>
                      )}
                    </td>
                    <td className="p-2 align-middle">
                      {getProductBadges(products)}
                    </td>
                    <td className="p-2 align-middle">
                      <span
                        className={cn(
                          "inline-block px-2 py-px rounded text-[11px] font-semibold",
                          statusClass(status)
                        )}
                      >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </td>
                    {/* Per-product progress bars */}
                    <td className="p-2 align-middle">
                      {products.length === 0 ? (
                        <span className="text-[11px] text-slate-400">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {products.map((p) => {
                            const pct = p.completed_percentage ?? 0;
                            return (
                              <div key={p.id} className="flex items-center gap-1.5">
                                <span
                                  className="text-[9px] font-bold text-slate-400 w-[18px] flex-shrink-0 leading-none"
                                  title={p.product_name}
                                >
                                  {PRODUCT_ABBREV[p.product_name] ?? p.product_name.slice(0, 2)}
                                </span>
                                <div className="flex-1 h-[4px] bg-slate-100 rounded-full overflow-hidden min-w-[40px]">
                                  <div
                                    className="h-full rounded-full transition-[width] duration-300"
                                    style={{
                                      width: `${pct}%`,
                                      background: pct >= 100 ? "#22C55E" : "#3358F4",
                                    }}
                                  />
                                </div>
                                <span className="text-[9px] text-slate-400 w-[22px] text-right flex-shrink-0">
                                  {Math.round(pct)}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="p-2 align-middle">
                      <span className="text-xs text-slate-500">
                        {getRelativeTime(customer.created_at)}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
