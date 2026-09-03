import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requireOrderReviewer } from "../_auth";
import { patchOrderSchema } from "@/lib/stackshift-orders/schema";
import type { Database } from "@/types/database";

type OrderUpdate = Database["public"]["Tables"]["stackshift_orders"]["Update"];

// Task 347 — lifecycle actions on a submission: dismiss (spam/duplicate/handled elsewhere)
// and reopen. Optional free-text review notes on either.
export async function PATCH(
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
  const parsed = patchOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: order } = await adminClient
    .from("stackshift_orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status === "converted") {
    return NextResponse.json({ error: "Converted orders can't change status" }, { status: 409 });
  }

  const update: OrderUpdate = { updated_at: new Date().toISOString() };
  if (parsed.data.action === "dismiss") {
    update.status = "dismissed";
    update.dismiss_reason = parsed.data.dismissReason ?? null;
  } else {
    update.status = "pending_review";
    update.dismiss_reason = null;
  }
  if (parsed.data.reviewNotes !== undefined) {
    update.review_notes = parsed.data.reviewNotes || null;
  }

  const { data, error } = await adminClient
    .from("stackshift_orders")
    .update(update)
    .eq("id", orderId)
    .select("id, status, dismiss_reason, review_notes")
    .single();
  if (error) {
    console.error("[stackshift-order] PATCH failed:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, order: data });
}
