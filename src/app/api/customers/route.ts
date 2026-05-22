import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { generateCustomerId } from "@/lib/customers/generate-id";
import { validateCustomerCreate } from "@/lib/customers/validate";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const limit = parseInt(searchParams.get("limit") ?? "20", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    let query = supabase
      .from("customers")
      .select("*, customer_products(*)")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.ilike("company_name", `%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("GET /api/customers error:", error);
      return NextResponse.json({ error: "Failed to fetch customers" }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("GET /api/customers unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate
    const validation = validateCustomerCreate(body);
    if (!validation.valid) {
      return NextResponse.json({ error: "Validation failed", details: validation.errors }, { status: 400 });
    }

    // Generate unique customer_id
    const customerId = await generateCustomerId();

    const insertData = {
      customer_id: customerId,
      company_name: body.company_name.trim(),
      contact_name: body.contact_name?.trim() ?? null,
      contact_email: body.contact_email?.trim() ?? null,
      status: "onboarding",
    };

    // Use adminClient (secret) to bypass RLS for customer creation.
    // The user may not have an active session during onboarding form submission.
    const { data, error } = await adminClient
      .from("customers")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("POST /api/customers error:", error);
      return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("POST /api/customers unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
