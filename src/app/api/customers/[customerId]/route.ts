import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { validateCustomerUpdate } from "@/lib/customers/validate";
import type { Database } from "@/types/database";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const supabase = await createClient();
    const { customerId } = await params;

    const { data, error } = await supabase
      .from("customers")
      .select("*, customer_products(*)")
      .eq("customer_id", customerId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      }
      console.error("GET /api/customers/[customerId] error:", error);
      return NextResponse.json({ error: "Failed to fetch customer" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("GET /api/customers/[customerId] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const { customerId } = await params;
    const body = await request.json();

    // Validate
    const validation = validateCustomerUpdate(body);
    if (!validation.valid) {
      return NextResponse.json({ error: "Validation failed", details: validation.errors }, { status: 400 });
    }

    // Build update object with only provided fields
    type CustomerUpdate = Database["public"]["Tables"]["customers"]["Update"];
    const updateData: CustomerUpdate = {};
    if (body.company_name !== undefined) updateData.company_name = body.company_name.trim();
    if (body.contact_name !== undefined) updateData.contact_name = body.contact_name?.trim() ?? null;
    if (body.contact_email !== undefined) updateData.contact_email = body.contact_email?.trim() ?? null;
    if (body.zoho_account_id !== undefined) updateData.zoho_account_id = body.zoho_account_id?.trim() ?? null;
    if (body.communication_tone !== undefined) updateData.communication_tone = body.communication_tone?.trim() ?? "";
    if (body.status !== undefined) updateData.status = body.status as CustomerUpdate["status"];

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await adminClient
      .from("customers")
      .update(updateData)
      .eq("customer_id", customerId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      }
      console.error("PATCH /api/customers/[customerId] error:", error);
      return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("PATCH /api/customers/[customerId] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}