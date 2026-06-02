import { Metadata } from "next";
import { adminClient } from "@/lib/supabase/admin";
import FormEngine from "@/components/onboarding/form-engine";

const SLUG_TO_PRODUCT: Record<string, string> = {
  stackshift: "StackShift",
  publishforge: "PublishForge",
  pipelineforge: "PipelineForge",
};

interface Props {
  params: Promise<{ customerId: string; productSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { customerId, productSlug } = await params;
  const productName = SLUG_TO_PRODUCT[productSlug];
  try {
    // Using adminClient intentionally: public route, customers have no session.
    const { data: customer } = await adminClient
      .from("customers")
      .select("company_name")
      .eq("customer_id", customerId)
      .single();

    const base = customer ? customer.company_name : "Customer";
    return { title: productName ? `${productName} Onboarding — ${base}` : "Onboarding" };
  } catch {
    return { title: "Onboarding" };
  }
}

export default async function ProductOnboardingPage({ params }: Props) {
  const { customerId, productSlug } = await params;
  const productName = SLUG_TO_PRODUCT[productSlug];

  if (!productName) {
    return (
      <div className="p-12 text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-3">Product Not Found</h1>
        <p className="text-sm text-slate-500 mb-6">
          The product link you used is not recognized. Please contact your project manager.
        </p>
        <a
          href={`/onboard/${customerId}`}
          className="inline-block py-2.5 px-5.5 bg-brand text-white text-[13px] font-semibold rounded-full no-underline font-[inherit]"
        >
          ← Back to Product Selection
        </a>
      </div>
    );
  }

  // Using adminClient intentionally: this is a public route with no customer session.
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
          className="inline-block py-2.5 px-5.5 bg-brand text-white text-[13px] font-semibold rounded-full no-underline font-[inherit]"
        >
          Go to PM Dashboard
        </a>
      </div>
    );
  }

  const productRow = (customer.customer_products as Array<{
    id: string;
    product_name: string;
    onboarding_data: Record<string, unknown>;
    onboarding_complete: boolean;
  }>)?.find((p) => p.product_name === productName);

  if (!productRow) {
    return (
      <div className="p-12 text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-3">Product Not Available</h1>
        <p className="text-sm text-slate-500 mb-6">
          {productName} is not assigned to this account. Please contact your project manager.
        </p>
        <a
          href={`/onboard/${customerId}`}
          className="inline-block py-2.5 px-5.5 bg-brand text-white text-[13px] font-semibold rounded-full no-underline font-[inherit]"
        >
          ← Back to Product Selection
        </a>
      </div>
    );
  }

  if (productRow.onboarding_complete) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-3 text-center">Already Submitted</h2>
        <p className="text-sm text-slate-500 leading-relaxed text-center max-w-sm">
          You have already submitted the {productName} onboarding form. WebriQ administrator has been notified and will be in touch shortly.
        </p>
        <a
          href={`/onboard/${customerId}`}
          className="mt-8 inline-block py-2.5 px-5.5 bg-brand text-white text-[13px] font-semibold rounded-full no-underline font-[inherit] hover:opacity-90 transition-opacity"
        >
          ← Back
        </a>
      </div>
    );
  }

  // Seed Company Info + Contacts fields from the customer record.
  // Saved onboarding_data spreads last so customer edits are never overwritten.
  const mergedInitialData: Record<string, unknown> = {
    companyName: customer.company_name ?? "",
    primaryContactName: customer.contact_name ?? "",
    primaryContactEmail: customer.contact_email ?? "",
    ...((productRow.onboarding_data as Record<string, unknown>) ?? {}),
  };

  return (
    <FormEngine
      productName={productName}
      customerId={customerId}
      initialData={mergedInitialData}
    />
  );
}
