import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getInternalDeliverable } from "@/config/customer-phases";

const WRITE_ROLES = ["admin", "super_admin", "marketing"];
const STATUSES = ["pending", "in_progress", "done"];

// Status cycling for Bert's internal-only deliverables (QBR 2.3) — never shown to PM/dev/hr.
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
      return NextResponse.json({ error: "Not permitted to update internal deliverables" }, { status: 403 });
    }

    const body = await request.json();
    const status = body?.status;
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: "status must be one of pending, in_progress, done" }, { status: 400 });
    }

    const { projectId, deliverableKey } = await params;
    if (!getInternalDeliverable(deliverableKey)) {
      return NextResponse.json({ error: "Unknown internal deliverable" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("onboarding_internal_deliverables")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("project_id", projectId)
      .eq("deliverable_key", deliverableKey)
      .select()
      .single();

    if (error) {
      console.error("PATCH .../internal-deliverables/[deliverableKey] error:", error);
      return NextResponse.json({ error: "Failed to update internal deliverable" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("PATCH .../internal-deliverables/[deliverableKey] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
