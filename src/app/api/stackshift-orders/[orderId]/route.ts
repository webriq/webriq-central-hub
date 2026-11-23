import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requireOrderMutator } from "../_auth";
import { patchOrderSchema } from "@/lib/stackshift-orders/schema";
import type { Database } from "@/types/database";

type OrderUpdate = Database["public"]["Tables"]["stackshift_orders"]["Update"];

// Missing-column codes (Postgres / PostgREST schema cache): migration 191 not applied yet.
const MISSING_COLUMN = new Set(["42703", "PGRST204"]);
const needs191 = () => NextResponse.json({ error: "Apply migration 191 first" }, { status: 503 });

// select("*") so archived_at / deleted_at are read when present without 42703 before migration 191.
async function loadOrder(orderId: string) {
  const { data } = await adminClient.from("stackshift_orders").select("*").eq("id", orderId).maybeSingle();
  return data && !data.deleted_at ? data : null;
}

async function writeOrder(orderId: string, update: OrderUpdate) {
  return adminClient
    .from("stackshift_orders")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .select("id, status, dismiss_reason, review_notes")
    .single();
}

// Task 347 — dismiss (spam/duplicate/handled elsewhere) and reopen, with optional review notes.
// Task 498 — archive / restore (any status; status is kept) from the Orders table row menu.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const auth = await requireOrderMutator();
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
  const { action, dismissReason, reviewNotes } = parsed.data;

  const order = await loadOrder(orderId);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const update: OrderUpdate = {};
  if (action === "archive" || action === "restore") {
    update.archived_at = action === "archive" ? new Date().toISOString() : null;
  } else {
    if (order.status === "converted") {
      return NextResponse.json({ error: "Converted orders can't change status" }, { status: 409 });
    }
    update.status = action === "dismiss" ? "dismissed" : "pending_review";
    update.dismiss_reason = action === "dismiss" ? (dismissReason ?? null) : null;
  }
  if (reviewNotes !== undefined) update.review_notes = reviewNotes || null;

  const { data, error } = await writeOrder(orderId, update);
  if (error && MISSING_COLUMN.has(error.code)) return needs191();
  if (error) {
    console.error("[stackshift-order] PATCH failed:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, order: data });
}

// Task 498 — soft delete. super_admin only (Finance still refused by requireOrderMutator);
// converted orders are archive-only so the project's order history stays.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const auth = await requireOrderMutator();
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "super_admin") {
    return NextResponse.json({ error: "Only a super admin can delete orders" }, { status: 403 });
  }

  const { orderId } = await params;
  const order = await loadOrder(orderId);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status === "converted") {
    return NextResponse.json({ error: "Converted orders can't be deleted — archive it instead" }, { status: 409 });
  }

  const { error } = await writeOrder(orderId, { deleted_at: new Date().toISOString() });
  if (error && MISSING_COLUMN.has(error.code)) return needs191();
  if (error) {
    console.error("[stackshift-order] DELETE failed:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
