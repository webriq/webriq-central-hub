import { Metadata } from "next";
import { adminClient } from "@/lib/supabase/admin";
import OnboardingFormClient from "./client";

interface OnboardingPageProps {
  params: Promise<{ customerId: string }>;
}

export async function generateMetadata({ params }: OnboardingPageProps): Promise<Metadata> {
  const { customerId } = await params;
  try {
    // Using adminClient intentionally: this route is publicly accessible (no auth)
    // by design. Customers open their onboarding link without logging in.
    // adminClient bypasses RLS to allow unauthenticated reads.
    const { data: customer } = await adminClient
      .from("customers")
      .select("company_name")
      .eq("customer_id", customerId)
      .single();

    return {
      title: customer ? `Onboarding — ${customer.company_name}` : "Customer Not Found",
    };
  } catch {
    return { title: "Onboarding" };
  }
}

export default async function OnboardingPage({ params }: OnboardingPageProps) {
  const { customerId } = await params;
  // Using adminClient intentionally — see comment in generateMetadata above.
  const { data: customer, error } = await adminClient
    .from("customers")
    .select("*, customer_products(*)")
    .eq("customer_id", customerId)
    .single();

  if (error || !customer) {
    return (
      <div className="p-12 text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-3">Customer Not Found</h1>
        <p className="text-sm text-slate-500 mb-6">
          The onboarding link you used is invalid or the customer record no longer exists.
        </p>
        <a
          href="/pm"
          className="inline-block py-2.5 px-[22px] bg-brand text-white text-[13px] font-semibold rounded-full no-underline font-[inherit]"
        >
          Go to PM Dashboard
        </a>
      </div>
    );
  }

  const products = (customer.customer_products as Array<{
    id: string;
    product_name: string;
    onboarding_data: Record<string, unknown>;
  }>) ?? [];

  return (
    <OnboardingFormClient
      customerId={customerId}
      companyName={customer.company_name}
      products={products}
    />
  );
}
