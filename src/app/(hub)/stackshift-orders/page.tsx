import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import OrdersTable, { type OrderListItem, type OrderStatus, type PaginationMeta } from "./_components/orders-table";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "StackShift Orders" };

const STATUS_VALUES: OrderStatus[] = ["pending_review", "converted", "dismissed"];

export default async function StackShiftOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; search?: string; status?: string }>;
}) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = claims.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;
  if (role !== "admin" && role !== "super_admin" && role !== "pm") redirect(V2_ROUTES.DASHBOARD);

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const pageSize = Math.max(1, Math.min(100, parseInt(params.pageSize ?? "20", 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const searchQ = params.search?.trim() ?? "";
  const status = (STATUS_VALUES as string[]).includes(params.status ?? "")
    ? (params.status as OrderStatus)
    : "pending_review";

  let query = supabase
    .from("stackshift_orders")
    .select(
      "id, status, company_name, contact_name, business_email, services, mapped_classifications, created_at, submitted_at, customer_id, project_id",
      { count: "exact" }
    )
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (searchQ) {
    const esc = searchQ.replace(/[%,()]/g, "");
    query = query.or(
      `company_name.ilike.%${esc}%,business_email.ilike.%${esc}%,contact_name.ilike.%${esc}%`
    );
  }

  const { data, count, error } = await query.range(from, to);
  if (error) console.error("[stackshift-orders] list query error:", error);

  // Per-status counts for the tab badges.
  const counts: Record<OrderStatus, number> = { pending_review: 0, converted: 0, dismissed: 0 };
  await Promise.all(
    STATUS_VALUES.map(async (s) => {
      const { count: c } = await supabase
        .from("stackshift_orders")
        .select("id", { count: "exact", head: true })
        .eq("status", s);
      counts[s] = c ?? 0;
    })
  );

  const paginationMeta: PaginationMeta = { page, pageSize, total: count ?? 0 };

  return (
    <OrdersTable
      orders={(data ?? []) as OrderListItem[]}
      status={status}
      counts={counts}
      searchQ={searchQ}
      paginationMeta={paginationMeta}
    />
  );
}
