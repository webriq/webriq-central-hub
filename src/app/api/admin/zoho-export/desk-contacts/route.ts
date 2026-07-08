// Admin-only export: fetches all Zoho Desk contacts, returns desk-contacts.json for download.
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

  let contacts: Record<string, unknown>[];
  try {
    contacts = await fetchAllDeskPages("/contacts", token, "zoho-export/desk-contacts");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return new NextResponse(JSON.stringify(contacts, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="desk-contacts.json"',
    },
  });
}
