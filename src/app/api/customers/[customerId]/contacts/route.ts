import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  const { data, error } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, secondary_email, phone, mobile, title")
    .eq("customer_id", customerId)
    .order("last_name");

  if (error) {
    console.error("GET /api/customers/[customerId]/contacts error:", error);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
