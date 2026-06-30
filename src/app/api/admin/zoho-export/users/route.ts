// Admin-only export: fetches all Zoho portal users with auto-pagination, returns users.json
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) return NextResponse.json({ error: "ZOHO_PORTAL_ID not configured" }, { status: 500 });

  const all: unknown[] = [];
  let page = 1;

  while (true) {
    const query = new URLSearchParams({
      type: "portal_user",
      view_type: "active",
      page: String(page),
      per_page: "50",
    });

    const res = await fetch(
      `https://projectsapi.zoho.com/api/v3.1/portal/${portalId}/users?${query}`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
    );

    if (!res.ok) {
      console.error("[zoho-export/users] API error:", res.status, await res.text());
      break;
    }

    const json = await res.json() as { users?: unknown[]; page_info?: { has_next_page?: boolean } };
    const batch = json.users ?? [];
    all.push(...batch);

    if (!json.page_info?.has_next_page) break;
    page++;
    await sleep(100);
  }

  return new NextResponse(JSON.stringify(all, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="users.json"',
    },
  });
}
