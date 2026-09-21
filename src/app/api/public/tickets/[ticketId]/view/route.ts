// Task 379 — public, unauthenticated password check for the customer ticket-view page.
// adminClient is intentional here (documented (public)-route exception, same as onboarding):
// the caller has no Supabase session, and RLS is bypassed on purpose behind the password gate.
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { verifyCustomerViewPassword } from "@/lib/desk/customer-view-access";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Inbound customer email is routinely HTML (source_meta.contentType, set by email-poll) — this
// is a public, unauthenticated page, so render as plain text rather than dangerouslySetInnerHTML
// (no sanitizer in this codebase; escaping-by-default avoids any XSS surface from message
// bodies). Mirrors the regex approach already used for the same problem in support-form.ts.
function htmlToText(html: string): string {
  return html
    .replace(/<\s*(?:br|\/p|\/div|\/tr|\/li|\/h[1-6])\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  if (!UUID_RE.test(ticketId)) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password) {
    return NextResponse.json({ error: "Enter the password from your ticket email." }, { status: 400 });
  }

  const result = await verifyCustomerViewPassword(ticketId, password);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.locked
          ? "Too many incorrect attempts. Try again later."
          : "Incorrect password.",
        locked: result.locked,
        lockedUntil: result.lockedUntil,
        attemptsRemaining: result.attemptsRemaining,
      },
      { status: result.locked ? 429 : 401 }
    );
  }

  const { data: ticket } = await adminClient
    .from("inbox")
    .select("ticket_number, subject, status, created_at")
    .eq("id", ticketId)
    .maybeSingle();

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  const { data: messages } = await adminClient
    .from("inbox_messages")
    .select("id, author_type, body, source_meta, created_at")
    .eq("inbox_id", ticketId)
    .eq("visibility", "public")
    .order("created_at", { ascending: true });

  return NextResponse.json({
    ticket: {
      ticketNumber: ticket.ticket_number,
      subject: ticket.subject,
      status: ticket.status,
      createdAt: ticket.created_at,
    },
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      authorType: m.author_type,
      body: m.source_meta?.contentType === "text/html" ? htmlToText(m.body) : m.body,
      createdAt: m.created_at,
    })),
  });
}
