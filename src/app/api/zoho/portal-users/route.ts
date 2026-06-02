import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getZohoPortalUsers } from "@/lib/zoho";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;

  const filterRaw = sp.get("filter");
  let filter: Record<string, unknown> | undefined;
  if (filterRaw) {
    try { filter = JSON.parse(filterRaw); } catch { /* ignore malformed filter */ }
  }

  try {
    const result = await getZohoPortalUsers({
      type: sp.get("type") ?? undefined,
      view_type: sp.get("view_type") ?? undefined,
      page: sp.get("page") ?? undefined,
      per_page: sp.get("per_page") ?? undefined,
      sort_by: sp.get("sort_by") ?? undefined,
      filter,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/zoho/portal-users]", err);
    return NextResponse.json({ error: "Failed to fetch portal users" }, { status: 502 });
  }
}
