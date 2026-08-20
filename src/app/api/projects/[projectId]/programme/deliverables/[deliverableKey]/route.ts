import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveEffectiveDeliverable } from "@/config/customer-phases";
import { notifyProjectMembers } from "@/lib/notifications";

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

    const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
    if (!profile?.role || !WRITE_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Not permitted to update programme deliverables" }, { status: 403 });
    }

    const body = await request.json();
    const phaseNumber = Number(body?.phase_number);
    const status = body?.status;

    if (!Number.isInteger(phaseNumber) || phaseNumber <= 0) {
      return NextResponse.json({ error: "phase_number must be a positive integer" }, { status: 400 });
    }
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: "status must be one of pending, in_progress, done" }, { status: 400 });
    }

    const { projectId, deliverableKey } = await params;
    // Task 246: existence + display name now come from the row itself, not a static
    // getDeliverable(phaseNumber, key) lookup — that lookup throws for a custom phase's
    // phase_number, which has no PROGRAMME_PHASES entry to look up.
    const { data: previous } = await supabase
      .from("customer_deliverables")
      .select("status, custom_name")
      .eq("project_id", projectId)
      .eq("phase_number", phaseNumber)
      .eq("deliverable_key", deliverableKey)
      .maybeSingle();
    if (!previous) {
      return NextResponse.json({ error: "Unknown deliverable for that phase" }, { status: 400 });
    }
    const deliverableConfig = resolveEffectiveDeliverable(phaseNumber, {
      deliverable_key: deliverableKey,
      custom_name: previous.custom_name,
      custom_description: null,
      custom_owner: null,
    });

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

    // Notify only on the transition into "done" — not on every touch of an already-done
    // deliverable, and not on the "in_progress" transition (not requested).
    if (status === "done" && previous?.status !== "done") {
      const { data: project } = await supabase.from("projects").select("project_id, name").eq("id", projectId).maybeSingle();
      const actorName = profile.full_name ?? "Someone";
      await notifyProjectMembers(projectId, {
        type: "deliverable_complete",
        title: "Deliverable complete",
        body: `${actorName} marked "${deliverableConfig.name}" done — Phase ${phaseNumber}${project?.name ? ` · ${project.name}` : ""}.`,
        url: project?.project_id ? `/projects/v2/${project.project_id}` : undefined,
        actorId: user.id,
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("PATCH /api/projects/[projectId]/programme/deliverables/[deliverableKey] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
