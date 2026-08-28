import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

// Staff-only internal note (task 303 detail page) — inserts a ticket_messages row with
// visibility: 'internal'. NOT a customer-facing reply; no email is sent (see task doc
// Out of Scope — outbound reply-by-email is a separate follow-up).
export async function POST(request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["admin", "super_admin", "pm"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ticketId } = await params;
  if (!/^TKT-\d+$/.test(ticketId)) {
    return NextResponse.json({ error: "Invalid ticket id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const noteBody = typeof body.body === "string" ? body.body.trim() : "";
  // Task 320 — body is now Tiptap HTML; an "empty" editor still serializes to "<p></p>", which
  // is a non-empty string, so a plain truthiness check no longer rejects an empty note.
  if (!noteBody || noteBody.replace(/<[^>]*>/g, "").trim().length === 0) {
    return NextResponse.json({ error: "Note body is required" }, { status: 400 });
  }

  const { data: ticket } = await adminClient
    .from("tickets")
    .select("id")
    .eq("ticket_id", ticketId)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const { data, error } = await adminClient
    .from("ticket_messages")
    .insert({
      ticket_id: ticket.id,
      author_type: "staff",
      author_id: user.id,
      body: noteBody,
      visibility: "internal",
      // Task 320 — body is now Tiptap HTML, not plain text; see reply/route.ts for why this
      // flag is required for the detail page to render it as formatted HTML.
      source_meta: { contentType: "text/html" },
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[api/desk/tickets/[ticketId]/notes] insert failed:", error?.message);
    return NextResponse.json({ error: "Failed to add note" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
