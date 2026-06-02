import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import type { ProductName } from "@/types/hub";
import type { Database } from "@/types/database";

type CustomerProductUpdate = Database["public"]["Tables"]["customer_products"]["Update"];

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
    const { data: onboardingData, completedPercentage, explicitSubmit } = body;

    if (onboardingData === undefined) {
      return NextResponse.json({ error: "data field is required" }, { status: 400 });
    }

    // Only mark as submitted when the customer explicitly clicks Submit — not on auto-save.
    const isExplicitSubmit = explicitSubmit === true;

    const updatePayload: CustomerProductUpdate = {
      onboarding_data: onboardingData,
      completed_percentage: completedPercentage ?? 0,
    };
    if (isExplicitSubmit) {
      updatePayload.onboarding_complete = true;
    }

    const { data, error } = await adminClient
      .from("customer_products")
      .update(updatePayload)
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

    // On explicit submit: check if all products are now complete.
    // If so: transition customer status and notify PM via Cliq (once only — guarded by status check).
    // Zoho project creation is a deliberate PM action from the customer profile page.
    if (isExplicitSubmit) {
      try {
        const { data: allProducts } = await adminClient
          .from("customer_products")
          .select("onboarding_complete")
          .eq("customer_id", customerId);

        const allDone = allProducts?.every(p => p.onboarding_complete) ?? false;

        if (allDone) {
          const { data: customer } = await adminClient
            .from("customers")
            .select("company_name, status")
            .eq("customer_id", customerId)
            .single();

          // Idempotency guard — skip if already transitioned to prevent duplicate Cliq messages.
          if (customer?.status !== "completed_onboarding") {
            await adminClient
              .from("customers")
              .update({ status: "completed_onboarding" })
              .eq("customer_id", customerId);

            const { sendCliqNotification } = await import("@/lib/zoho");
            await sendCliqNotification(
              `✅ ${customer?.company_name ?? customerId} has completed all onboarding forms. Ready for Zoho project creation.`
            );
          }
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