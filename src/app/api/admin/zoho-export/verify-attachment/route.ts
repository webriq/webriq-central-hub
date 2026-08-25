// dev-only diagnostic endpoint — checks whether a Zoho Desk attachment content URL is
// fetchable server-side with the Hub's existing Desk OAuth token, without downloading or
// storing the file. Built to settle task 304's open question: unlike Zoho Projects/WorkDrive
// attachments (architecturally blocked server-side, 401 INVALID_OAUTHSCOPE — see task 106),
// Desk attachment content lives behind a plain Desk API endpoint that may work with the
// already-granted Desk.tickets.READ scope.
//
// Issues a GET via the shared fetchZohoWithRetry() helper (it has no HEAD-request option) but
// never reads the response body — only status/headers are inspected, so the file content is
// never buffered into memory or returned to the client. Restricted to desk.zoho.com — this
// attaches a live OAuth bearer token to an admin-supplied URL, so an open-ended proxy would
// leak that token to an arbitrary host.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken, fetchZohoWithRetry } from "@/lib/zoho";
import { deskHeaders } from "@/lib/zoho/desk";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { url } = (await request.json().catch(() => ({}))) as { url?: string };
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (parsed.hostname !== "desk.zoho.com") {
    return NextResponse.json({ error: "Only desk.zoho.com URLs are allowed" }, { status: 400 });
  }

  const token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  let headers: Record<string, string>;
  try {
    headers = deskHeaders();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ZOHO_DESK_ORG_ID not configured" }, { status: 500 });
  }

  try {
    const { res, throttleExhausted } = await fetchZohoWithRetry(url, token, {
      label: "verify-attachment",
      headers,
    });

    if (throttleExhausted) {
      return NextResponse.json({ error: "Zoho rolling throttle exhausted — try again later" }, { status: 502 });
    }

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get("content-type"),
      contentLength: res.headers.get("content-length"),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
