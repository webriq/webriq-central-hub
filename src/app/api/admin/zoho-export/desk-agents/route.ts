// Admin-only export: fetches all Zoho Desk agents, returns desk-agents.json for download.
// No new OAuth scope needed — Desk.agents.READ was already granted on day one (task 117's doc).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";
import { fetchAllDeskPages } from "@/lib/zoho/desk";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  if (!process.env.ZOHO_DESK_ORG_ID) {
    return NextResponse.json({ error: "ZOHO_DESK_ORG_ID not configured" }, { status: 500 });
  }

  let agents: Record<string, unknown>[];
  try {
    ({ items: agents } = await fetchAllDeskPages("/agents", token, "zoho-export/desk-agents"));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const scopeHint = message.includes("403")
      ? " — likely missing the Desk.agents.READ OAuth scope on your Zoho API client (see env.example)"
      : "";
    return NextResponse.json({ error: `${message}${scopeHint}` }, { status: 502 });
  }

  return new NextResponse(JSON.stringify(agents, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="desk-agents.json"',
    },
  });
}
