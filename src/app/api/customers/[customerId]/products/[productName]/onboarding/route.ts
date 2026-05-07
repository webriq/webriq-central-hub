import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import type { ProductName } from "@/types/hub";

const VALID_PRODUCTS: ProductName[] = ["StackShift", "PublishForge", "CiteForge", "PipelineForge"];

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

    return NextResponse.json(data);
  } catch (err) {
    console.error("PATCH onboarding unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}