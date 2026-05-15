"use client";

import React, { useEffect, useState } from "react";
import { usePMSettings } from "@/hooks/use-pm-settings";
import { createClient } from "@/lib/supabase/client";
import { getTokens } from "@/components/hub/pm-tabs/shared";
import HomeTab from "@/components/hub/pm-tabs/home-tab";
import type { CustomerWithProducts } from "@/components/hub/pm-tabs/clients-tab";
import type { CustomerProductRow } from "@/types/database";

export default function PMHomePage() {
  const { settings } = usePMSettings();
  const C = getTokens(settings);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerWithProducts[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase
        .from("hub_users")
        .select("display_name")
        .eq("id", data.user.id)
        .single()
        .then(({ data: profile }) => {
          if (profile?.display_name) setDisplayName(profile.display_name);
        });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/customers?limit=100")
      .then(r => r.json())
      .then(data => { if (!cancelled) setCustomers(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("pm_home_products")
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

  return (
    <div
      className="flex-1 overflow-y-auto py-[26px] px-8 bg-[var(--c-page-bg)]"
      style={{ "--c-page-bg": C.bg } as React.CSSProperties}
    >
      <HomeTab customers={customers} settings={settings} displayName={displayName} />
    </div>
  );
}
