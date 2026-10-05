import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProgrammeDeliverable } from "@/lib/programme/store";
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
    const previous = await getProgrammeDeliverable(supabase, projectId, phaseNumber, deliverableKey);
    if (!previous) {
      return NextResponse.json({ error: "Unknown deliverable for that phase" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("project_deliverables")
      .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
      .eq("id", previous.id)
      .select()
      .single();

    if (error) {
      console.error("PATCH /api/projects/[projectId]/programme/deliverables/[deliverableKey] error:", error);
      return NextResponse.json({ error: "Failed to update deliverable" }, { status: 500 });
    }

    // Notify only on the transition into "done" — not on every touch of an already-done
    // deliverable, and not on the "in_progress" transition (not requested).
    if (status === "done" && previous.status !== "done") {
      const { data: project } = await supabase.from("projects").select("project_id, name").eq("id", projectId).maybeSingle();
      const actorName = profile.full_name ?? "Someone";
      await notifyProjectMembers(projectId, {
        type: "deliverable_complete",
        title: "Deliverable complete",
        body: `${actorName} marked "${previous.name}" done — Phase ${phaseNumber}${project?.name ? ` · ${project.name}` : ""}.`,
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
