import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

// Task 450 — dismiss a reconcile miss (an admin judged it does not need the Hub, e.g. a test ticket). It stays
// recorded as dismissed and is never alerted again. Importing is the other resolution, done through the Desk
// poll route's admin-only import branch. admin / super_admin only.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ deskTicketId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["admin", "super_admin"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { deskTicketId } = await params;
  // Conditional on still being open so a double click (or an already-imported miss) is never overwritten.
  const { data, error } = await adminClient
    .from("stackshift_reconcile_misses")
    .update({ status: "dismissed", resolved_by: user.id, resolved_at: new Date().toISOString() })
    .eq("desk_ticket_id", deskTicketId)
    .eq("status", "open")
    .select("desk_ticket_id")
    .maybeSingle();
  if (error) {
    console.error("[api/desk/stackshift-stepdown/dismiss] failed:", error.message);
    return NextResponse.json({ error: "Failed to dismiss" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Miss not found or not open" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
