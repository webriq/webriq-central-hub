import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  getMyZohoTasks,
  getUnassignedZohoTasks,
  getMyZohoTimeLogs,
} from "@/lib/zoho";

function todayZohoFormat(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}

function mondayZohoFormat(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await adminClient
    .from("hub_users")
    .select("zoho_user_id, display_name")
    .eq("id", user.id)
    .single();

  const portalId = process.env.ZOHO_PORTAL_ID ?? "";
  const zohoUserId = profile?.zoho_user_id ?? "";

  if (!zohoUserId) {
    return NextResponse.json(
      {
        myTasks: [],
        unassignedTasks: [],
        timeLogs: [],
        warning: "no_zoho_id",
      },
      { status: 200 }
    );
  }

  const range = new URL(req.url).searchParams.get("range") ?? "today";
  const dateStr = range === "week" ? mondayZohoFormat() : todayZohoFormat();

  try {
    const [myTasks, unassignedTasks, timeLogs] = await Promise.all([
      getMyZohoTasks(portalId, zohoUserId),
      getUnassignedZohoTasks(portalId),
      getMyZohoTimeLogs(portalId, zohoUserId, dateStr),
    ]);
    return NextResponse.json({ myTasks, unassignedTasks, timeLogs });
  } catch (err) {
    console.error("[dev/tasks] Zoho fetch error:", err);
    return NextResponse.json({ error: "zoho_fetch_failed" }, { status: 502 });
  }
}
