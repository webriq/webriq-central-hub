import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    // Auth guard — hub users only
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { customerId } = await params;

    // Reset customer status to onboarding
    // Using adminClient intentionally: bypasses RLS for admin write operation.
    const { error: customerError } = await adminClient
      .from("customers")
      .update({ status: "onboarding" })
      .eq("customer_id", customerId);

    if (customerError) {
      console.error("reopen-onboarding customer update error:", customerError);
      return NextResponse.json({ error: "Failed to reopen onboarding" }, { status: 500 });
    }

    // Reset all products' onboarding_complete so the public form URLs become live again
    const { error: productsError } = await adminClient
      .from("customer_products")
      .update({ onboarding_complete: false })
      .eq("customer_id", customerId);

    if (productsError) {
      console.error("reopen-onboarding products update error:", productsError);
      return NextResponse.json({ error: "Failed to reset product submission status" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("reopen-onboarding unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
