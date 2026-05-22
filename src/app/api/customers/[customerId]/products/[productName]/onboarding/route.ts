import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import type { ProductName } from "@/types/hub";

const VALID_PRODUCTS: ProductName[] = ["StackShift", "PublishForge", "PipelineForge"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string; productName: string }> }
) {
  try {
    const { customerId, productName } = await params;

    if (!VALID_PRODUCTS.includes(productName as ProductName)) {
      return NextResponse.json({ error: "Invalid product name" }, { status: 400 });
    }

    const body = await request.json();
    const { data: onboardingData, completedPercentage } = body;

    if (onboardingData === undefined) {
      return NextResponse.json({ error: "data field is required" }, { status: 400 });
    }

    const isComplete = completedPercentage !== undefined && completedPercentage >= 100;

    const { data, error } = await adminClient
      .from("customer_products")
      .update({
        onboarding_data: onboardingData,
        onboarding_complete: isComplete,
        completed_percentage: completedPercentage ?? 0,
      })
      .eq("customer_id", customerId)
      .eq("product_name", productName)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Product association not found" }, { status: 404 });
      }
      console.error("PATCH onboarding error:", error);
      return NextResponse.json({ error: "Failed to save onboarding data" }, { status: 500 });
    }

    // When this product reaches 100%, check if all products for this customer are complete.
    // If so: transition customer to "completed_onboarding" and notify PM via Cliq.
    // Zoho project creation is now a deliberate PM action from the customer profile page.
    if (isComplete) {
      try {
        const { data: allProducts } = await adminClient
          .from("customer_products")
          .select("onboarding_complete")
          .eq("customer_id", customerId);

        const allDone = allProducts?.every(p => p.onboarding_complete) ?? false;

        if (allDone) {
          const { data: customer } = await adminClient
            .from("customers")
            .select("company_name")
            .eq("customer_id", customerId)
            .single();

          await adminClient
            .from("customers")
            .update({ status: "completed_onboarding" })
            .eq("customer_id", customerId);

          const { sendCliqNotification } = await import("@/lib/zoho");
          await sendCliqNotification(
            `✅ ${customer?.company_name ?? customerId} has completed all onboarding forms. Ready for Zoho project creation.`
          );
        }
      } catch (completionErr) {
        // Non-fatal — log but don't fail the save response
        console.error("PATCH onboarding completion trigger error:", completionErr);
      }
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("PATCH onboarding unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}