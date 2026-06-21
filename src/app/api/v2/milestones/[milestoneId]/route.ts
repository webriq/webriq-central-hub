import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

const VALID_STATUS = ["planned", "active", "completed"] as const;
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
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.description === "string") patch.description = body.description.trim() || null;
  if ("due_date" in body) patch.due_date = body.due_date || null;
  if (typeof body.position === "number") patch.position = body.position;
  if (typeof body.status === "string") {
    if (!(VALID_STATUS as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    patch.status = body.status as (typeof VALID_STATUS)[number];
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
