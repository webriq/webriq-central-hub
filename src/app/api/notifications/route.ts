import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const requestedLimit = Number(searchParams.get("limit"));
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 && requestedLimit <= 100 ? requestedLimit : 20;

  const [{ data: notifications, error: listError }, { count: unreadCount, error: countError }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type:event_type, title, body, url:link, read_at, created_at, actor:profiles!notifications_actor_id_fkey(full_name, avatar_url)")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .is("read_at", null),
  ]);

  if (listError || countError) {
    console.error("GET /api/notifications error:", listError ?? countError);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }

  return NextResponse.json({ notifications: notifications ?? [], unreadCount: unreadCount ?? 0 });
}
