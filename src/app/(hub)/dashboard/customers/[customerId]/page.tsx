import { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — cross-route-group import; path is valid at runtime
import CustomerProfileClient from "../../../customers/[customerId]/client";

interface CustomerProfilePageProps {
  params: Promise<{ customerId: string }>;
}

export async function generateMetadata({ params }: CustomerProfilePageProps): Promise<Metadata> {
  const { customerId } = await params;
  try {
    const supabase = await createClient();
    const { data: customer } = await supabase
      .from("customers")
      .select("company_name")
      .eq("customer_id", customerId)
      .single();

    return {
      title: customer ? `${customer.company_name} — Customer Profile` : "Customer Not Found",
    };
  } catch {
    return { title: "Customer Profile" };
  }
}

export default async function CustomerProfilePage({ params }: CustomerProfilePageProps) {
  const { customerId } = await params;
  const supabase = await createClient();

  const { data: customer, error } = await supabase
    .from("customers")
    .select("*, customer_products(*)")
    .eq("customer_id", customerId)
    .single();

  if (error || !customer) {
    notFound();
  }

  return (
    <div className="overflow-y-auto flex-1">
      <CustomerProfileClient customer={customer} zohoPortalId={process.env.ZOHO_PORTAL_ID ?? ""} zohoPortalName={process.env.ZOHO_PORTAL_NAME ?? ""} />
    </div>
  );
}
