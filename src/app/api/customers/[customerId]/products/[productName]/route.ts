import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_FIELDS = ["product_instance_id"] as const;
type AllowedField = (typeof ALLOWED_FIELDS)[number];

const VALID_STATUSES = ["active", "inactive", "archived"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string; productName: string }> }
) {
  try {
    const supabase = await createClient();
    const { customerId, productName } = await params;
    const body = await request.json();

    const metadataUpdate: Partial<Record<AllowedField, string | null>> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in body) metadataUpdate[key] = body[key] ?? null;
    }

    const statusUpdate: { status?: string } = {};
    if ("status" in body) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      statusUpdate.status = body.status;
    }

    const update = { ...metadataUpdate, ...statusUpdate };

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
