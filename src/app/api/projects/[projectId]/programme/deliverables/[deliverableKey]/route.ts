import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDeliverable } from "@/config/customer-phases";

const WRITE_ROLES = ["admin", "super_admin", "marketing"];
const STATUSES = ["pending", "in_progress", "done"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; deliverableKey: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile?.role || !WRITE_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Not permitted to update programme deliverables" }, { status: 403 });
    }

    const body = await request.json();
    const phaseNumber = Number(body?.phase_number);
    const status = body?.status;

    if (!Number.isInteger(phaseNumber) || phaseNumber < 1 || phaseNumber > 5) {
      return NextResponse.json({ error: "phase_number must be an integer between 1 and 5" }, { status: 400 });
    }
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: "status must be one of pending, in_progress, done" }, { status: 400 });
    }

    const { projectId, deliverableKey } = await params;
    if (!getDeliverable(phaseNumber, deliverableKey)) {
      return NextResponse.json({ error: "Unknown deliverable for that phase" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("customer_deliverables")
      .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
      .eq("project_id", projectId)
      .eq("phase_number", phaseNumber)
      .eq("deliverable_key", deliverableKey)
      .select()
      .single();

    if (error) {
      console.error("PATCH /api/projects/[projectId]/programme/deliverables/[deliverableKey] error:", error);
      return NextResponse.json({ error: "Failed to update deliverable" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("PATCH /api/projects/[projectId]/programme/deliverables/[deliverableKey] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
