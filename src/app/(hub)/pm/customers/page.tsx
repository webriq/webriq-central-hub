"use client";

import React, { useEffect, useState, useRef } from "react";
import { usePMSettings } from "@/hooks/use-pm-settings";
import { createClient } from "@/lib/supabase/client";
import ClientsTab from "@/components/hub/pm-tabs/clients-tab";
import type { CustomerWithProducts } from "@/components/hub/pm-tabs/clients-tab";
import type { CustomerProductRow } from "@/types/database";

export default function PMCustomersPage() {
  const { settings } = usePMSettings();
  const [customers, setCustomers] = useState<CustomerWithProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const retryRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    const fetchCustomers = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "100" });
        if (search) params.set("search", search);
        if (statusFilter) params.set("status", statusFilter);
        const res = await fetch(`/api/customers?${params}`);
        if (!res.ok) throw new Error("Failed to load customers");
        const data = await res.json();
        if (!cancelled) setCustomers(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load customers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    retryRef.current = fetchCustomers;
    fetchCustomers();
    return () => { cancelled = true; };
  }, [search, statusFilter]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("pm_customers_products")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "customer_products" }, (payload) => {
        const updated = payload.new as CustomerProductRow;
        setCustomers(prev =>
          prev.map(c => ({
            ...c,
            customer_products: c.customer_products.map(p =>
              p.id === updated.id ? { ...p, ...updated } : p
            ),
          }))
        );
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  return (
    <div
      className={`flex-1 overflow-y-auto py-6.5 px-8 ${settings.theme === "dark" ? "bg-[#090c18]" : "bg-[#f5f4f1]"}`}
    >
      <ClientsTab
        customers={customers} loading={loading} error={error}
        search={search} onSearchChange={setSearch}
        statusFilter={statusFilter} onStatusFilterChange={setStatusFilter}
        sortBy={sortBy} sortDir={sortDir} onSort={handleSort}
        onRetry={() => retryRef.current()} settings={settings}
      />
    </div>
  );
}
