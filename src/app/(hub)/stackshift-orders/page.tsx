import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import OrdersTable, { type OrderListItem, type OrderTab, type PaginationMeta } from "./_components/orders-table";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "StackShift Orders" };

const TAB_VALUES: OrderTab[] = ["pending_review", "converted", "dismissed", "archived"];

const SELECT =
  "id, status, company_name, contact_name, business_email, services, mapped_classifications, created_at, submitted_at, customer_id, project_id, contact_risk";

// Task 498 — tab membership as .filter() triples (keeps each builder's own type): status tabs hide
// archived orders, the Archived tab shows archived orders of every status, deleted orders are hidden
// everywhere. `withFlags=false` is the pre-migration-191 shape: today's status-only filter, Archived empty.
function tabFilters(tab: OrderTab, withFlags: boolean): [string, "eq" | "is" | "not.is", string | null][] {
  if (!withFlags) return tab === "archived" ? [["id", "is", null]] : [["status", "eq", tab]];
  return tab === "archived"
    ? [["deleted_at", "is", null], ["archived_at", "not.is", null]]
    : [["deleted_at", "is", null], ["status", "eq", tab], ["archived_at", "is", null]];
}

export default async function StackShiftOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; search?: string; status?: string }>;
}) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = claims.claims.sub as string;
  // Task 499 — department embedded in the profile read (one round trip, not two).
  const [{ data: profile }, params] = await Promise.all([
    supabase.from("profiles").select("role, departments(name)").eq("id", userId).maybeSingle(),
    searchParams,
  ]);
  const role = profile?.role ?? null;
  if (role !== "admin" && role !== "super_admin") redirect(V2_ROUTES.DASHBOARD);

  // Task 366 — Finance is read-only on Orders: no row menu.
  const readOnly = profile?.departments?.name === "Finance";

  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const pageSize = Math.max(1, Math.min(100, parseInt(params.pageSize ?? "20", 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const searchQ = params.search?.trim() ?? "";
  const tab = (TAB_VALUES as string[]).includes(params.status ?? "") ? (params.status as OrderTab) : "pending_review";

  function listQuery(withFlags: boolean) {
    let query = supabase.from("stackshift_orders").select(SELECT, { count: "exact" });
    for (const [col, op, val] of tabFilters(tab, withFlags)) query = query.filter(col, op, val);
    if (searchQ) {
      const esc = searchQ.replace(/[%,()]/g, "");
      query = query.or(`company_name.ilike.%${esc}%,business_email.ilike.%${esc}%,contact_name.ilike.%${esc}%`);
    }
    return query.order("created_at", { ascending: false }).range(from, to);
  }

  // Per-tab counts for the tab badges; a null count (e.g. missing column) shows 0.
  async function countsFor(withFlags: boolean) {
    const entries = await Promise.all(
      TAB_VALUES.map(async (t) => {
        let q = supabase.from("stackshift_orders").select("id", { count: "exact", head: true });
        for (const [col, op, val] of tabFilters(t, withFlags)) q = q.filter(col, op, val);
        const { count: c } = await q;
        return [t, c ?? 0] as const;
      })
    );
    return Object.fromEntries(entries) as Record<OrderTab, number>;
  }

  // Task 499 — list and counts in parallel (they don't depend on each other). Migration 191 is
  // written-not-applied: on 42703 re-run both with today's status-only filters.
  let [{ data, count, error }, counts] = await Promise.all([listQuery(true), countsFor(true)]);
  if (error?.code === "42703") {
    [{ data, count, error }, counts] = await Promise.all([listQuery(false), countsFor(false)]);
  }
  if (error) console.error("[stackshift-orders] list query error:", error);

  const paginationMeta: PaginationMeta = { page, pageSize, total: count ?? 0 };

  return (
    <OrdersTable
      orders={(data ?? []) as OrderListItem[]}
      tab={tab}
      readOnly={readOnly}
      isSuperAdmin={role === "super_admin"}
      counts={counts}
      searchQ={searchQ}
      paginationMeta={paginationMeta}
    />
  );
}
