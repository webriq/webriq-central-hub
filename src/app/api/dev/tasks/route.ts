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
    .select("external_id, first_name, last_name")
    .eq("id", user.id)
    .single();

  const portalId = process.env.ZOHO_PORTAL_ID ?? "";
  const zohoUserId = profile?.external_id ?? "";

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

    // Exclude AI-eligible tasks — devs should not self-assign tasks the AI pipeline will handle
    const { data: aiRecords } = await adminClient
      .from("classification_records")
      .select("zoho_task_id")
      .eq("llm_eligible", "YES")
      .not("zoho_task_id", "is", null);
    const aiZohoIds = new Set((aiRecords ?? []).map((r) => r.zoho_task_id));
    const filteredUnassigned = unassignedTasks.filter((t) => !aiZohoIds.has(t.id));

    return NextResponse.json({ myTasks, unassignedTasks: filteredUnassigned, timeLogs });
  } catch (err) {
    console.error("[dev/tasks] Zoho fetch error:", err);
    return NextResponse.json({ error: "zoho_fetch_failed" }, { status: 502 });
  }
}
