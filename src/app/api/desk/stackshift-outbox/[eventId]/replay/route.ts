import { after, NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { dispatchTicketSoon } from "@/lib/stackshift-support/dispatch";

// Task 446 — admin replay of a dead StackShift outbox event. The event keeps its original `sequence` (the
// receiver applies events by sequence and ignores stale ones), so a replay may arrive after later events.
// admin / super_admin only, same session + adminClient role-check shape as the other Desk routes.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["admin", "super_admin"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { eventId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  // Conditional on status='dead' so a double-click or an already-delivered event is never reset.
  const { data, error } = await adminClient
    .from("stackshift_outbox")
    .update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString(), last_error: null, last_status_code: null })
    .eq("id", eventId)
    .eq("status", "dead")
    .select("id, ticket_id")
    .maybeSingle();

  if (error) {
    console.error("[api/desk/stackshift-outbox/replay] update failed:", error.message);
    return NextResponse.json({ error: "Failed to replay event" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Event not found or not dead" }, { status: 404 });

  after(() => dispatchTicketSoon(data.ticket_id));
  return NextResponse.json({ ok: true });
}
