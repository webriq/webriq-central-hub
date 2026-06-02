import { Metadata } from "next";
import { redirect } from "next/navigation";
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
          href="/dashboard"
          className="inline-block py-2.5 px-5.5 bg-brand text-white text-[13px] font-semibold rounded-full no-underline font-[inherit]"
        >
          Go to Dashboard
        </a>
      </div>
    );
  }

  // Filter out CiteForge — it is an add-on to StackShift, not a standalone product.
  // Customers may have legacy CiteForge rows in customer_products from before task 017.
  const products = ((customer.customer_products as Array<{
    id: string;
    product_name: string;
    onboarding_data: Record<string, unknown>;
    onboarding_complete: boolean;
  }>) ?? []).filter((p) => p.product_name !== "CiteForge");

  // All products submitted — show a completion screen instead of the picker.
  if (products.length > 0 && products.every(p => p.onboarding_complete)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-3 text-center">All Forms Submitted</h2>
        <p className="text-sm text-slate-500 leading-relaxed text-center max-w-sm">
          Thank you, {customer.company_name}. All onboarding forms have been submitted. WebriQ administrator will be in touch shortly.
        </p>
      </div>
    );
  }

  // Single-product with pending submission: redirect directly to the product form.
  if (products.length === 1 && !products[0].onboarding_complete) {
    const slug = products[0].product_name.toLowerCase().replace(/\s+/g, "");
    redirect(`/onboard/${customerId}/${slug}`);
  }

  return (
    <OnboardingFormClient
      customerId={customerId}
      companyName={customer.company_name}
      products={products}
    />
  );
}
