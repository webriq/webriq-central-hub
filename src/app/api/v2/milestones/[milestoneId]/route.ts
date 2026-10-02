import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

const VALID_STATUS = ["planned", "active", "completed"] as const;
const NAME_MAX = 200;
type MilestoneUpdate = Database["public"]["Tables"]["milestones"]["Update"];

// PATCH /api/v2/milestones/[milestoneId]  — update (PM/Admin via RLS)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ milestoneId: string }> }
) {
  const { milestoneId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const patch: MilestoneUpdate = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (name.length > NAME_MAX) {
      return NextResponse.json({ error: `name must be ${NAME_MAX} characters or fewer` }, { status: 400 });
    }
    patch.name = name;
  }
  if (typeof body.description === "string") patch.description = body.description.trim() || null;
  if ("due_date" in body) patch.due_date = body.due_date || null;
  if ("start_date" in body) patch.start_date = body.start_date || null;
  if (typeof body.position === "number") patch.position = body.position;
  if (typeof body.status === "string") {
    if (!(VALID_STATUS as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    patch.status = body.status as (typeof VALID_STATUS)[number];
  }

  // Task 412 — date-order check against the merged row when either date is patched.
  if ("start_date" in patch || "due_date" in patch) {
    const { data: current } = await supabase
      .from("milestones")
      .select("start_date, due_date")
      .eq("id", milestoneId)
      .maybeSingle();
    if (!current) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    const start = "start_date" in patch ? patch.start_date : current.start_date;
    const due = "due_date" in patch ? patch.due_date : current.due_date;
    if (start && due && start > due) {
      return NextResponse.json({ error: "start date must be on or before due date" }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("milestones")
    .update(patch)
    .eq("id", milestoneId)
    .select()
    .single();

  if (error) {
    console.error("[api/v2/milestones/[id]] patch failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}

// DELETE /api/v2/milestones/[milestoneId]  — delete (PM/Admin via RLS)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ milestoneId: string }> }
) {
  const { milestoneId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("milestones").delete().eq("id", milestoneId);
  if (error) {
    console.error("[api/v2/milestones/[id]] delete failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
