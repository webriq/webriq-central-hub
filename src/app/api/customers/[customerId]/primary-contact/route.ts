import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

// GET — an existing customer's primary contact (contacts.is_primary, task 151), for the New
// Project intake's "existing company" pre-fill. Uses adminClient: marketing can create onboarding
// projects (CREATE_ROLES in /api/onboarding/projects) but isn't covered by contacts_staff_read
// RLS (admin|super_admin|pm|developer only, migration 056) — same rationale as
// upsertPrimaryContact and the onboarding wizard page.tsx's primaryContact query.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { customerId } = await params;
    const { data, error } = await adminClient
      .from("contacts")
      .select("full_name, email, phone")
      .eq("customer_id", customerId)
      .eq("is_primary", true)
      .maybeSingle();

    if (error) {
      console.error("GET /api/customers/[customerId]/primary-contact error:", error);
      return NextResponse.json({ error: "Failed to fetch primary contact" }, { status: 500 });
    }

    return NextResponse.json(data ?? null);
  } catch (err) {
    console.error("GET /api/customers/[customerId]/primary-contact unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
