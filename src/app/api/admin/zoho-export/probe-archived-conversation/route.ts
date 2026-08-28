// dev-only diagnostic (task 332) — the one unknown task 325 left open: does Zoho Desk's
// per-ticket /threads and /comments endpoint serve an ARCHIVED ticket id at all?
//
// Reads the first ticket id from _from_zoho/desk-archived-tickets.json and probes both
// endpoints with limit=1, returning the raw HTTP status + a short body sample so the
// operator can confirm before kicking off a full desk-archived-threads / -ticket-comments
// export. Read-only, admin-gated, downloads nothing. Safe to delete once the live run has
// confirmed the endpoints work.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient, readFromZoho } from "@/lib/migrate/zoho-import";
import { getZohoAccessToken } from "@/lib/zoho";
import { fetchDeskPage } from "@/lib/zoho/desk";

type ArchivedTicketStub = { id?: string | number; ticketNumber?: string | number };

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  if (!process.env.ZOHO_DESK_ORG_ID) {
    return NextResponse.json({ error: "ZOHO_DESK_ORG_ID not configured" }, { status: 500 });
  }

  let archived: ArchivedTicketStub[];
  try {
    archived = readFromZoho<ArchivedTicketStub>("desk-archived-tickets.json");
  } catch {
    return NextResponse.json(
      { error: "Could not read _from_zoho/desk-archived-tickets.json — export Desk Archived Tickets first" },
      { status: 400 }
    );
  }

  const sample = archived.find((t) => t.id != null);
  if (!sample) {
    return NextResponse.json({ error: "desk-archived-tickets.json has no ticket with an id" }, { status: 400 });
  }
  const ticketId = String(sample.id);

  const probe = async (suffix: "threads" | "comments") => {
    const { res, token: next, throttleExhausted } = await fetchDeskPage(
      `/tickets/${ticketId}/${suffix}`,
      token,
      { from: "1", limit: "1" },
      "probe-archived-conversation"
    );
    token = next;
    const body = await res.text();
    return {
      status: res.status,
      ok: res.ok,
      throttleExhausted,
      bodySample: body.slice(0, 500),
    };
  };

  const threads = await probe("threads");
  const comments = await probe("comments");

  return NextResponse.json({
    ticketId,
    ticketNumber: sample.ticketNumber ?? null,
    threads,
    comments,
    verdict:
      threads.ok || comments.ok
        ? "OK — at least one endpoint serves archived ticket ids; proceed with the archived conversation export."
        : "BLOCKED — neither endpoint returned 2xx for an archived ticket id; see task 332 Open Questions for fallbacks.",
  });
}
