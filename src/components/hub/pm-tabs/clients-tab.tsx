"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { CustomerRow, CustomerProductRow } from "@/types/database";
import type { PMSettings } from "@/hooks/use-pm-settings";
import { getTokens, DARK, ProgressBar, StatusBadge, ProductBadge, ClientAvatar, getClientColor } from "./shared";
import type { Tokens } from "./shared";

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

const CARD = "rounded-[14px] border border-[var(--c-border)] shadow-[0_1px_4px_rgba(0,0,0,0.05)] bg-[var(--c-card)]";

function buildVars(C: Tokens): React.CSSProperties {
  return {
    "--c-text": C.text, "--c-sub": C.sub, "--c-muted": C.muted,
    "--c-card": C.card, "--c-border": C.border,
    "--c-blue": C.blue, "--c-orange": C.orange, "--c-sky": C.sky,
    "--c-green": C.green, "--c-red": C.red,
    "--c-sky-tint": `${C.sky}0d`,
    "--c-sky-border3": `${C.sky}25`,
    "--c-blue-border": `${C.blue}30`,
    "--c-track": C === DARK ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
  } as React.CSSProperties;
}

interface FiltersProps {
  search: string; onSearchChange: (v: string) => void;
  filter: string; onFilterChange: (v: string) => void;
}

function Filters({ search, onSearchChange, filter, onFilterChange }: FiltersProps) {
  return (
    <div className="flex gap-[10px] mb-4 items-center">
      <div className="relative flex-1 max-w-[300px]">
        <input
          placeholder="Search clients…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full text-[13px] py-2 pr-3 pl-[34px] bg-[var(--c-card)] border border-[var(--c-border)] rounded-[9px] text-[var(--c-text)] outline-none box-border"
        />
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none stroke-[var(--c-muted)]">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
      </div>
      {(["all", "onboarding", "active", "inactive"] as const).map(f => {
        const active = (f === "all" && !filter) || filter === f;
        return (
          <button
            key={f}
            onClick={() => onFilterChange(f === "all" ? "" : f)}
            className={`text-xs font-semibold rounded-lg px-[14px] py-[7px] cursor-pointer border transition-colors ${
              active
                ? "text-white bg-[var(--c-blue)] border-[var(--c-blue)]"
                : "text-[var(--c-sub)] bg-[var(--c-card)] border-[var(--c-border)]"
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
  tokens: Tokens;
  sortArrow: (col: string) => string;
  onSort: (col: string) => void;
  router: ReturnType<typeof useRouter>;
}

function ClientTable({ data, tokens: C, sortArrow, onSort, router }: ClientTableProps) {
  const thBase = "py-[9px] px-4 text-left text-[10px] font-bold text-[var(--c-muted)] tracking-[0.06em] uppercase border-b border-[var(--c-border)] whitespace-nowrap";
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
            const avgPct = prods.length > 0
              ? Math.round(prods.reduce((sum, p) => sum + (p.completed_percentage ?? 0), 0) / prods.length)
              : 0;
            return (
              <tr key={c.id} className={i < data.length - 1 ? "border-b border-[var(--c-border)]" : ""}>
                <td className="py-[13px] px-5">
                  <div className="flex items-center gap-[10px]">
                    <ClientAvatar name={c.company_name} color={getClientColor(c.company_name)} />
                    <div>
                      <div className="text-[13px] font-semibold text-[var(--c-text)]">{c.company_name}</div>
                      <code className="text-[10px] text-[var(--c-muted)] font-mono">{c.customer_id}</code>
                    </div>
                  </div>
                </td>
                <td className="py-[13px] px-4"><StatusBadge status={c.status ?? "onboarding"} tokens={C} /></td>
                <td className="py-[13px] px-4">
                  <div className="flex gap-1 flex-wrap">
                    {prods.map(p => <ProductBadge key={p.id} name={p.product_name} />)}
                  </div>
                </td>
                <td className="py-[13px] px-4 min-w-[160px]">
                  {prods.length === 0
                    ? <span className="text-[11px] text-[var(--c-muted)]">—</span>
                    : <ProgressBar pct={avgPct} tokens={C} color={avgPct >= 100 ? C.green : C.blue} />}
                </td>
                <td className="py-[13px] px-5">
                  <button
                    onClick={e => { e.stopPropagation(); router.push(`/customers/${c.customer_id}`); }}
                    className="text-xs font-semibold text-[var(--c-sky)] bg-[var(--c-sky-tint)] border border-[var(--c-sky-border3)] rounded-[7px] px-3 py-[6px] cursor-pointer"
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
  const C = getTokens(settings);

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
      <div style={buildVars(C)}>
        <div className={`${CARD} py-4 px-[18px]`}>
          <div className="text-[13px] text-[var(--c-red)] mb-2">{error}</div>
          <button
            onClick={onRetry}
            className="text-xs font-semibold text-[var(--c-blue)] bg-transparent border border-[var(--c-blue-border)] rounded-[6px] px-3 py-[5px] cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={buildVars(C)}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[22px] font-bold text-[var(--c-text)] tracking-[-0.02em]">Customers</div>
          <div className="text-xs text-[var(--c-sub)] mt-[2px]">{customers.length} total clients</div>
        </div>
        <button
          onClick={() => router.push("/onboarding")}
          className="text-xs font-semibold text-white bg-[var(--c-orange)] rounded-[9px] px-[18px] py-[9px] cursor-pointer border-0"
        >
          + New Client
        </button>
      </div>
      <Filters search={search} onSearchChange={onSearchChange} filter={statusFilter} onFilterChange={onStatusFilterChange} />
      {loading ? (
        <div className={`${CARD} p-6 text-center`}>
          <div className="text-[13px] text-[var(--c-sub)]">Loading customers…</div>
        </div>
      ) : sorted.length === 0 ? (
        <div className={`${CARD} p-6 text-center`}>
          <div className="text-[13px] text-[var(--c-sub)]">No customers found.</div>
        </div>
      ) : (
        <ClientTable data={sorted} tokens={C} sortArrow={sortArrow} onSort={onSort} router={router} />
      )}
    </div>
  );
}
