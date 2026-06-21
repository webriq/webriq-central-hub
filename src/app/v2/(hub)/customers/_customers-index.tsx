"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Building2, Search, FolderKanban, Mail } from "lucide-react";
import { V2_ROUTES } from "@/config/constants";

export type CustomerListItem = {
  customer_id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  status: string;
  project_count: number;
};

const STATUS_STYLE: Record<string, { text: string; bg: string; border: string }> = {
  active:     { text: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  onboarding: { text: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  pending:    { text: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  inactive:   { text: "#94A3B8", bg: "#F8FAFC", border: "#E2E8F0" },
  churned:    { text: "#DC2626", bg: "#FFF1F2", border: "#FECACA" },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_STYLE[status] ?? STATUS_STYLE.inactive;
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize whitespace-nowrap"
      style={{ color: c.text, background: c.bg, borderColor: c.border }}
    >
      {status}
    </span>
  );
}

export default function CustomersIndex({ customers }: { customers: CustomerListItem[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const statuses = useMemo(
    () => ["all", ...Array.from(new Set(customers.map((c) => c.status)))],
    [customers]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (q && !c.company_name.toLowerCase().includes(q) && !c.customer_id.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [customers, search, status]);

  return (
    <div className="px-8 py-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-slate-900 tracking-[-0.02em]">Customers</h1>
        <p className="text-[13px] text-slate-500 mt-0.5">{filtered.length} customer{filtered.length === 1 ? "" : "s"}</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-700 outline-none focus:border-slate-400 placeholder:text-slate-400"
          />
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium capitalize transition-colors cursor-pointer ${
                status === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
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
          <div className="grid grid-cols-[1fr_1fr_120px_120px] items-center gap-3 px-5 py-2.5 border-b border-slate-100 bg-slate-50">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Company</span>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Contact</span>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</span>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Projects</span>
          </div>
          {filtered.map((c) => (
            <div
              key={c.customer_id}
              className="grid grid-cols-[1fr_1fr_120px_120px] items-center gap-3 px-5 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors group"
            >
              <button
                onClick={() => router.push(`${V2_ROUTES.CUSTOMERS}/${c.customer_id}`)}
                className="text-left min-w-0 cursor-pointer"
              >
                <div className="text-[13px] font-medium text-slate-800 truncate group-hover:text-blue-600">{c.company_name}</div>
                <div className="text-[11px] font-mono text-slate-400 truncate">{c.customer_id}</div>
              </button>
              <div className="min-w-0">
                <div className="text-[13px] text-slate-600 truncate">{c.contact_name ?? "—"}</div>
                {c.contact_email && (
                  <div className="inline-flex items-center gap-1 text-[11px] text-slate-400 truncate">
                    <Mail size={10} /> {c.contact_email}
                  </div>
                )}
              </div>
              <StatusBadge status={c.status} />
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
  );
}
