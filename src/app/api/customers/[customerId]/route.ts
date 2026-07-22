import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { validateCustomerUpdate } from "@/lib/customers/validate";
import { upsertPrimaryContact, demotePrimaryContact } from "@/lib/customers/primary-contact";
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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: callerProfile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!["pm", "admin", "super_admin"].includes(callerProfile?.role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { customerId } = await params;
    const body = await request.json();

    // Validate
    const validation = validateCustomerUpdate(body);
    if (!validation.valid) {
      return NextResponse.json({ error: "Validation failed", details: validation.errors }, { status: 400 });
    }

    // Build update object with only provided fields. contact_name/contact_email are handled
    // separately below — they now route through contacts.is_primary (task 151), not a direct
    // customers column write.
    type CustomerUpdate = Database["public"]["Tables"]["customers"]["Update"];
    const updateData: CustomerUpdate = {};
    if (body.company_name !== undefined) updateData.company_name = body.company_name.trim();
    if (body.communication_tone !== undefined) updateData.communication_tone = body.communication_tone?.trim() ?? "";
    if (body.status !== undefined) updateData.status = body.status as CustomerUpdate["status"];
    if (body.automation_toggle !== undefined) updateData.automation_toggle = body.automation_toggle;
    if (body.llm_excluded !== undefined) updateData.llm_excluded = body.llm_excluded;
    if (body.daily_token_budget !== undefined) updateData.daily_token_budget = body.daily_token_budget;

    const hasContactUpdate = body.contact_name !== undefined || body.contact_email !== undefined;
    if (Object.keys(updateData).length === 0 && !hasContactUpdate) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    if (hasContactUpdate) {
      const name = body.contact_name?.trim() ?? null;
      const email = body.contact_email?.trim() ?? null;
      const contactResult = name === null && email === null
        ? await demotePrimaryContact(adminClient, customerId)
        : await upsertPrimaryContact(adminClient, customerId, { name, email });
      if (contactResult.error) {
        console.error("PATCH /api/customers/[customerId] primary contact error:", contactResult.error);
        return NextResponse.json({ error: "Failed to update primary contact" }, { status: 500 });
      }
    }

    // If only the primary contact changed, fetch the current row instead of a no-op update —
    // the primary-contact write above already synced contact_name/contact_email onto it.
    const { data, error } = Object.keys(updateData).length > 0
      ? await adminClient.from("customers").update(updateData).eq("customer_id", customerId).select().single()
      : await adminClient.from("customers").select().eq("customer_id", customerId).single();

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