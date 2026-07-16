import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET — case-insensitive exact-match check for the New Project intake's "new company" step,
// so a PM/marketing user can't unknowingly create a duplicate customer under a name that
// already exists.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name")?.trim();
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const { data, error } = await supabase
      .from("customers")
      .select("customer_id")
      .ilike("company_name", name)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("GET /api/customers/check-name error:", error);
      return NextResponse.json({ error: "Failed to check company name" }, { status: 500 });
    }

    return NextResponse.json({ exists: !!data });
  } catch (err) {
    console.error("GET /api/customers/check-name unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
