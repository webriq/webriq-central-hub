import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requireOrderReviewer } from "../../_auth";
import { convertSchema } from "@/lib/stackshift-orders/schema";
import { createFromOrder } from "@/lib/stackshift-orders/create-from-order";
import { isValidClassificationCombo } from "@/config/customer-phases";

// Task 347 — convert a reviewed submission into a customer + DRAFT project.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const auth = await requireOrderReviewer();
  if (auth instanceof NextResponse) return auth;

  const { orderId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = convertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  if (!isValidClassificationCombo(parsed.data.classifications)) {
    return NextResponse.json(
      { error: "At most one StackShift tier may be selected" },
      { status: 400 }
    );
  }

  const { data: order, error } = await adminClient
    .from("stackshift_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    console.error("[stackshift-order] convert lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // Idempotent: an already-converted order returns its existing linkage.
  if (order.status === "converted" && order.customer_id && order.project_id) {
    return NextResponse.json({
      ok: true,
      customerId: order.customer_id,
      projectId: order.project_id,
      isNewCustomer: order.is_new_customer ?? false,
      alreadyConverted: true,
    });
  }
  if (order.status === "dismissed") {
    return NextResponse.json({ error: "Order is dismissed — reopen it first" }, { status: 409 });
  }

  try {
    const result = await createFromOrder({
      order,
      mode: parsed.data.mode,
      existingCustomerId: parsed.data.existingCustomerId,
      classifications: parsed.data.classifications,
      projectName: parsed.data.projectName,
      actingUserId: auth.userId,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    console.error("[stackshift-order] convert failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Conversion failed" },
      { status: 500 }
    );
  }
}
