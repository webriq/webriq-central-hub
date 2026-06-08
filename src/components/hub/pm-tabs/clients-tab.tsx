"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { CustomerRow, CustomerProductRow } from "@/types/database";
import type { PMSettings } from "@/hooks/use-pm-settings";
import { ProgressBar, StatusBadge, ProductBadge, ClientAvatar, getClientColor } from "./shared";
import { getOnboardingSchema, computeCompletionPercentage } from "@/config/onboarding-schemas";

function getMissingFields(productName: string, onboardingData: Record<string, unknown>) {
  const schema = getOnboardingSchema(productName);
  if (!schema) return [];
  const missing: { section: string; field: string }[] = [];
  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (!field.required) continue;
      if (field.condition) {
        const cv = onboardingData[field.condition.field];
        if (String(cv) !== String(field.condition.value)) continue;
      }
      const v = onboardingData[field.name];
      if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
        missing.push({ section: section.title, field: field.label });
      }
    }
  }
  return missing;
}

export interface CustomerWithProducts extends CustomerRow {
  customer_products: CustomerProductRow[];
}

interface ClientsTabProps {
  customers: CustomerWithProducts[]; loading: boolean; error: string | null;
  search: string; onSearchChange: (v: string) => void;
  statusFilter: string; onStatusFilterChange: (v: string) => void;
  sortBy: string; sortDir: "asc" | "desc"; onSort: (col: string) => void;
  onRetry: () => void; settings: PMSettings;
}

const CARD = "rounded-[14px] border border-(--c-border) shadow-[0_1px_4px_rgba(0,0,0,0.05)] bg-(--c-card)";

interface FiltersProps {
  search: string; onSearchChange: (v: string) => void;
  filter: string; onFilterChange: (v: string) => void;
}

function Filters({ search, onSearchChange, filter, onFilterChange }: FiltersProps) {
  return (
    <div className="flex gap-2.5 mb-4 items-center">
      <div className="relative flex-1 max-w-75">
        <input
          placeholder="Search customers…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full text-[13px] py-2 pr-3 pl-8.5 bg-(--c-card) border border-(--c-border) rounded-[9px] text-(--c-text) outline-none box-border"
        />
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-(--c-muted)" />
      </div>
      {(["all", "onboarding", "active", "inactive"] as const).map(f => {
        const active = (f === "all" && !filter) || filter === f;
        return (
          <button
            key={f}
            onClick={() => onFilterChange(f === "all" ? "" : f)}
            className={`text-xs font-semibold rounded-lg px-3.5 py-1.75 cursor-pointer border transition-colors ${
              active
                ? "text-white bg-(--c-blue) border-(--c-blue)"
                : "text-(--c-sub) bg-(--c-card) border-(--c-border)"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        );
      })}
    </div>
  );
}

interface ClientTableProps {
  data: CustomerWithProducts[];
  sortArrow: (col: string) => string;
  onSort: (col: string) => void;
  router: ReturnType<typeof useRouter>;
}

function ClientTable({ data, sortArrow, onSort, router }: ClientTableProps) {
  const thBase = "py-[9px] px-4 text-left text-[10px] font-bold text-(--c-muted) tracking-[0.06em] uppercase border-b border-(--c-border) whitespace-nowrap";
  return (
    <div className={`${CARD} overflow-hidden`}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${thBase} pl-5 cursor-pointer`} onClick={() => onSort("company_name")}>Client{sortArrow("company_name")}</th>
            <th className={`${thBase} cursor-pointer`} onClick={() => onSort("status")}>Status{sortArrow("status")}</th>
            <th className={`${thBase}`}>Products</th>
            <th className={`${thBase}`}>Progress</th>
            <th className={`${thBase} pr-5`}></th>
          </tr>
        </thead>
        <tbody>
          {data.map((c, i) => {
            const prods = c.customer_products ?? [];
            const scoredProds = prods
              .filter(p => p.status !== 'archived')
              .map(p => ({ p, schema: getOnboardingSchema(p.product_name) }))
              .filter((x): x is { p: typeof x.p; schema: NonNullable<typeof x.schema> } => x.schema !== null);
            const avgPct = scoredProds.length > 0
              ? Math.round(
                  scoredProds.reduce((sum, { p, schema }) =>
                    sum + computeCompletionPercentage(schema, (p.onboarding_data as Record<string, unknown>) ?? {}), 0
                  ) / scoredProds.length
                )
              : 0;
            const allMissing = prods.flatMap(p =>
              getMissingFields(p.product_name, (p.onboarding_data as unknown as Record<string, unknown>) ?? {})
            );
            const displayMissing = allMissing.slice(0, 8);
            const overflow = Math.max(0, allMissing.length - 8);
            const hasCiteForge = prods.some(
              p => p.product_name === "StackShift" &&
                (p.onboarding_data as Record<string, unknown>)?.includeCiteForge === "Yes"
            );
            return (
              <tr key={c.id} className={i < data.length - 1 ? "border-b border-(--c-border)" : ""}>
                <td className="py-3.25 px-5">
                  <div className="flex items-center gap-2.5">
                    <ClientAvatar name={c.company_name} color={getClientColor(c.company_name)} />
                    <div>
                      <div className="text-[13px] font-semibold text-(--c-text)">{c.company_name}</div>
                      <code className="text-[10px] text-(--c-muted) font-mono">{c.customer_id}</code>
                    </div>
                  </div>
                </td>
                <td className="py-3.25 px-4"><StatusBadge status={c.status ?? "onboarding"} /></td>
                <td className="py-3.25 px-4">
                  <div className="flex gap-1 flex-wrap">
                    {prods.map(p => <ProductBadge key={p.id} name={p.product_name} />)}
                    {hasCiteForge && <ProductBadge key="citeforge-addon" name="CiteForge" />}
                  </div>
                </td>
                <td className="py-3.25 px-4 min-w-45">
                  {prods.length === 0 ? (
                    <span className="text-[11px] text-(--c-muted)">—</span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <ProgressBar pct={avgPct} colorClass={avgPct >= 100 ? "bg-(--c-green)" : "bg-(--c-blue)"} />
                      {allMissing.length > 0 && (
                        <details className="cursor-pointer">
                          <summary className="text-[10px] text-(--c-orange) select-none">
                            ⚠ {allMissing.length} field{allMissing.length !== 1 ? "s" : ""} missing
                          </summary>
                          <div className="mt-1 flex flex-col gap-px">
                            {displayMissing.map((m, idx) => (
                              <div key={idx} className="text-[10px] text-(--c-sub) leading-snug">
                                <span className="text-(--c-muted)">{m.section}: </span>{m.field}
                              </div>
                            ))}
                            {overflow > 0 && (
                              <div className="text-[10px] text-(--c-muted) mt-0.5">…and {overflow} more</div>
                            )}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </td>
                <td className="py-3.25 px-5">
                  <button
                    onClick={e => { e.stopPropagation(); router.push(`/dashboard/customers/${c.customer_id}`); }}
                    className="text-xs font-semibold text-(--c-sky) bg-(--c-sky-tint) border border-(--c-sky-border3) rounded-[7px] px-3 py-1.5 cursor-pointer"
                  >
                    View →
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ClientsTab(props: ClientsTabProps) {
  const { customers, loading, error, search, onSearchChange,
    statusFilter, onStatusFilterChange, sortBy, sortDir, onSort, onRetry, settings } = props;
  const router = useRouter();

  const sorted = [...customers].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortBy === "created_at") return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
    if (sortBy === "company_name") return a.company_name.localeCompare(b.company_name) * dir;
    if (sortBy === "status") return (a.status ?? "").localeCompare(b.status ?? "") * dir;
    if (sortBy === "customer_id") return (a.customer_id ?? "").localeCompare(b.customer_id ?? "") * dir;
    return 0;
  });

  const sortArrow = (col: string) => sortBy === col ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  if (error) {
    return (
      <div className={settings.theme === "dark" ? "pm-dark" : "pm-light"}>
        <div className={`${CARD} py-4 px-4.5`}>
          <div className="text-[13px] text-(--c-red) mb-2">{error}</div>
          <button
            onClick={onRetry}
            className="text-xs font-semibold text-(--c-blue) bg-transparent border border-(--c-blue-border) rounded-[6px] px-3 py-1.25 cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={settings.theme === "dark" ? "pm-dark" : "pm-light"}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[22px] font-bold text-(--c-text) tracking-[-0.02em]">Customers</div>
          <div className="text-xs text-(--c-sub) mt-0.5">{customers.length} total clients</div>
        </div>
        <button
          onClick={() => router.push("/dashboard/customers/onboard")}
          className="text-xs font-semibold text-white bg-(--c-orange) rounded-[9px] px-4.5 py-2.25 cursor-pointer border-0"
        >
          + New Customer
        </button>
      </div>
      <Filters search={search} onSearchChange={onSearchChange} filter={statusFilter} onFilterChange={onStatusFilterChange} />
      {loading ? (
        <div className={`${CARD} p-6 text-center`}>
          <div className="text-[13px] text-(--c-sub)">Loading customers…</div>
        </div>
      ) : sorted.length === 0 ? (
        <div className={`${CARD} p-6 text-center`}>
          <div className="text-[13px] text-(--c-sub)">No customers found.</div>
        </div>
      ) : (
        <ClientTable data={sorted} sortArrow={sortArrow} onSort={onSort} router={router} />
      )}
    </div>
  );
}
