import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createZohoProject } from "@/lib/zoho";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const { customerId } = await params;
    const body = await request.json();
    const projects: Record<string, string> = body.projects ?? {};

    const entries = Object.entries(projects).filter(([, name]) => name.trim() !== "");
    if (entries.length === 0) {
      return NextResponse.json(
        { error: "At least one project name is required" },
        { status: 400 }
      );
    }

    const created: Record<string, string> = {};
    for (const [productName, projectName] of entries) {
      const zohoId = await createZohoProject(customerId, projectName.trim());
      if (zohoId) {
        await adminClient
          .from("customer_products")
          .update({ zoho_project_id: zohoId })
          .eq("customer_id", customerId)
          .eq("product_name", productName);
        created[productName] = zohoId;
      }
    }

    await adminClient
      .from("customers")
      .update({ status: "active" })
      .eq("customer_id", customerId);

    return NextResponse.json({ created });
  } catch (err) {
    console.error("POST zoho-projects unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
