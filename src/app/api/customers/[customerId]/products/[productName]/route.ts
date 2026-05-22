import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_FIELDS = ["product_instance_id", "zoho_project_id", "sanity_project_id", "github_repo"] as const;
type AllowedField = (typeof ALLOWED_FIELDS)[number];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string; productName: string }> }
) {
  try {
    const supabase = await createClient();
    const { customerId, productName } = await params;
    const body = await request.json();

    const update: Partial<Record<AllowedField, string | null>> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in body) update[key] = body[key] ?? null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("customer_products")
      .update(update)
      .eq("customer_id", customerId)
      .eq("product_name", productName)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }
      console.error("PATCH product metadata error:", error);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("PATCH /api/customers/[customerId]/products/[productName] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
