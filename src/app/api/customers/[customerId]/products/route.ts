import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import type { ProductName } from "@/types/hub";

const VALID_PRODUCTS: ProductName[] = ["StackShift", "PublishForge", "PipelineForge"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const { customerId } = await params;
    const body = await request.json();
    const productName = body.product_name as string;

    if (!productName || !VALID_PRODUCTS.includes(productName as ProductName)) {
      return NextResponse.json(
        { error: "Invalid product_name. Must be one of: StackShift, PublishForge, PipelineForge" },
        { status: 400 }
      );
    }

    // Verify customer exists
    const { data: customer, error: customerError } = await adminClient
      .from("customers")
      .select("customer_id")
      .eq("customer_id", customerId)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    // Check if product already associated
    const { data: existing } = await adminClient
      .from("customer_products")
      .select("id")
      .eq("customer_id", customerId)
      .eq("product_name", productName)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "Product already associated with this customer" }, { status: 409 });
    }

    const { data, error } = await adminClient
      .from("customer_products")
      .insert({
        customer_id: customerId,
        product_name: productName,
        product_instance_id: body.product_instance_id ?? null,
        status: "active",
        onboarding_complete: false,
        onboarding_data: {},
      })
      .select()
      .single();

    if (error) {
      console.error("POST /api/customers/[customerId]/products error:", error);
      return NextResponse.json({ error: "Failed to add product" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("POST /api/customers/[customerId]/products unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const { customerId } = await params;
    const { searchParams } = new URL(request.url);
    const productName = searchParams.get("product_name");

    if (!productName || !VALID_PRODUCTS.includes(productName as ProductName)) {
      return NextResponse.json(
        { error: "product_name query param is required and must be a valid product" },
        { status: 400 }
      );
    }

    const { error } = await adminClient
      .from("customer_products")
      .delete()
      .eq("customer_id", customerId)
      .eq("product_name", productName);

    if (error) {
      console.error("DELETE /api/customers/[customerId]/products error:", error);
      return NextResponse.json({ error: "Failed to remove product" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/customers/[customerId]/products unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
