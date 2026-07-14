import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getInternalDeliverable, internalDeliverablesForSubPhase } from "@/config/customer-phases";

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
    const internalConfig = getInternalDeliverable(deliverableKey);
    if (!internalConfig) {
      return NextResponse.json({ error: "Unknown internal deliverable" }, { status: 400 });
    }

    // Upsert rather than a strict update — a project seeded before this deliverable_key existed
    // in INTERNAL_DELIVERABLES (i.e. its backfill migration hasn't run yet, or hasn't run at
    // all) would otherwise have 0 matching rows here, and .single() throws PGRST116 on an
    // empty result instead of creating the row on first toggle.
    const { data, error } = await supabase
      .from("onboarding_internal_deliverables")
      .upsert(
        { project_id: projectId, deliverable_key: deliverableKey, status, updated_at: new Date().toISOString() },
        { onConflict: "project_id,deliverable_key" }
      )
      .select()
      .single();

    if (error) {
      console.error("PATCH .../internal-deliverables/[deliverableKey] error:", error);
      return NextResponse.json({ error: "Failed to update internal deliverable" }, { status: 500 });
    }

    // Auto-derive the parent deliverable's status from all sibling internal checklist items —
    // status is no longer manually toggled for sub-phases that have a checklist (task 127).
    let updatedDeliverable = null;
    const siblingKeys = internalDeliverablesForSubPhase(internalConfig.subPhaseKey).map((d) => d.key);
    const { data: siblings } = await supabase
      .from("onboarding_internal_deliverables")
      .select("status")
      .eq("project_id", projectId)
      .in("deliverable_key", siblingKeys);

    const statuses = siblings?.map((s) => s.status) ?? [];
    const allDone = statuses.length > 0 && statuses.every((s) => s === "done");
    const anyStarted = statuses.some((s) => s !== "pending");
    const computedStatus = allDone ? "done" : anyStarted ? "in_progress" : "pending";

    const { data: currentDeliverable } = await supabase
      .from("customer_deliverables")
      .select("*")
      .eq("project_id", projectId)
      .eq("phase_number", 1)
      .eq("deliverable_key", internalConfig.subPhaseKey)
      .maybeSingle();

    if (currentDeliverable && currentDeliverable.status !== computedStatus) {
      const { data: newDeliverable, error: deliverableError } = await supabase
        .from("customer_deliverables")
        .update({ status: computedStatus, completed_at: computedStatus === "done" ? new Date().toISOString() : null })
        .eq("id", currentDeliverable.id)
        .select()
        .single();
      if (deliverableError) {
        console.error("PATCH .../internal-deliverables/[deliverableKey] auto-status error:", deliverableError);
      } else {
        updatedDeliverable = newDeliverable;
      }
    }

    return NextResponse.json({ internalDeliverable: data, deliverable: updatedDeliverable });
  } catch (err) {
    console.error("PATCH .../internal-deliverables/[deliverableKey] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
