import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import { mapServicesToClassifications } from "@/lib/stackshift-orders/service-map";
import { matchCustomer } from "@/lib/stackshift-orders/match-customer";
import OrderReview, { type OrderDetail } from "./_components/order-review";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "StackShift Order" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StackShiftOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  if (!UUID_RE.test(orderId)) notFound();

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = claims.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;
  if (role !== "admin" && role !== "super_admin" && role !== "pm") redirect(V2_ROUTES.DASHBOARD);

  const { data: order, error } = await supabase
    .from("stackshift_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error) console.error("[stackshift-orders] detail query error:", error);
  if (!order) notFound();

  const mapped = mapServicesToClassifications(order.services);

  // Advisory match — never auto-acts.
  const match =
    order.status === "pending_review"
      ? await matchCustomer(supabase, {
          companyName: order.company_name,
          businessEmail: order.business_email,
          website: order.website,
        })
      : null;

  // Resolve linked customer/project names for a converted order.
  let linkedCustomerName: string | null = null;
  let linkedProjectName: string | null = null;
  if (order.customer_id) {
    const { data: c } = await supabase
      .from("customers")
      .select("company_name")
      .eq("customer_id", order.customer_id)
      .maybeSingle();
    linkedCustomerName = c?.company_name ?? null;
  }
  if (order.project_id) {
    const { data: pr } = await supabase
      .from("projects")
      .select("name")
      .eq("id", order.project_id)
      .maybeSingle();
    linkedProjectName = pr?.name ?? null;
  }

  const detail: OrderDetail = {
    ...order,
    _mappedClassifications: mapped.classifications,
    _unknownServices: mapped.unknownServices,
    _validCombo: mapped.validCombo,
    _match: match,
    _linkedCustomerName: linkedCustomerName,
    _linkedProjectName: linkedProjectName,
  };

  return <OrderReview order={detail} />;
}
