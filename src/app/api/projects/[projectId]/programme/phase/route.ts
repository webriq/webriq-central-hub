import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { sendCliqNotification } from "@/lib/zoho";
import { PROGRAMME_PHASES, getPhaseByNumber } from "@/config/customer-phases";
import { cancelProjectAutostart } from "@/lib/qstash";
import { seedProgrammeAtPhase } from "@/lib/programme/seed";

const WRITE_ROLES = ["admin", "super_admin", "marketing"];

// Manual "Jump to phase" override — lets Bert/admin tag a project as starting from any of the 5
// phases instead of always Day 1. Works whether or not the programme has been started yet:
//   - Not started: this call also starts it, back-dating programme_started_at so "today" lands
//     on the target phase's first day.
//   - Already started: programme_started_at is also backdated the same way, so the calendar-day
//     -driven "Day N" marker moves into the newly-active phase's range instead of staying frozen.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile?.role || !WRITE_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Not permitted to override the programme phase" }, { status: 403 });
    }

    const body = await request.json();
    const phaseNumber = Number(body?.phase_number);
    const note: string | null = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

    if (!Number.isInteger(phaseNumber) || phaseNumber < 1 || phaseNumber > 5) {
      return NextResponse.json({ error: "phase_number must be an integer between 1 and 5" }, { status: 400 });
    }

    const { projectId } = await params;
    const targetPhase = getPhaseByNumber(phaseNumber);

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, customer_id, programme_started_at, qstash_message_id, customers(company_name)")
      .eq("id", projectId)
      .single();
    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const companyName = (project.customers as unknown as { company_name: string } | null)?.company_name ?? "Customer";

    const today = new Date().toISOString().slice(0, 10);
    const wasStarted = !!project.programme_started_at;

    if (!wasStarted) {
      const backdated = new Date();
      backdated.setDate(backdated.getDate() - (targetPhase.dayStart - 1));

      const seedResult = await seedProgrammeAtPhase({ id: projectId, customer_id: project.customer_id }, phaseNumber, backdated, note);
      if (seedResult.error) {
        console.error("PATCH /api/projects/[projectId]/programme/phase seed error:", seedResult.error);
        return NextResponse.json({ error: seedResult.error }, { status: 500 });
      }

      // This manual jump beat any scheduled QStash message to it — cancel the now-redundant
      // pending message (best-effort; the qstash-start route is idempotent regardless).
      if (project.qstash_message_id) {
        await cancelProjectAutostart(project.qstash_message_id);
        await supabase.from("projects").update({ qstash_message_id: null }).eq("id", projectId);
      }

      await sendCliqNotification(
        `${companyName}: manually tagged to start at Phase ${phaseNumber} (${targetPhase.name}).${note ? ` Note: ${note}` : ""}`,
        "pm"
      );

      const { data: seededPhases } = await supabase.from("customer_phases").select("*").eq("project_id", projectId).order("phase_number");
      return NextResponse.json({ phases: seededPhases ?? [] });
    }

    // Already started — backdate programme_started_at so "today" lands inside the target phase's
    // day range (mirrors the not-started branch's own calculation), then re-status the phase rows.
    const backdated = new Date();
    backdated.setDate(backdated.getDate() - (targetPhase.dayStart - 1));
    const { error: dateUpdateError } = await adminClient
      .from("projects")
      .update({ programme_started_at: backdated.toISOString() })
      .eq("id", projectId);
    if (dateUpdateError) {
      console.error("PATCH /api/projects/[projectId]/programme/phase already-started date backdate error:", dateUpdateError);
      return NextResponse.json({ error: "Failed to update programme start date" }, { status: 500 });
    }

    const updates = PROGRAMME_PHASES.map(async (p) => {
      if (p.number === phaseNumber) {
        return supabase
          .from("customer_phases")
          .update({ status: "active", actual_start_date: today, is_manual_override: true, override_note: note })
          .eq("project_id", projectId)
          .eq("phase_number", p.number);
      }
      if (p.number < phaseNumber) {
        return supabase
          .from("customer_phases")
          .update({ status: "skipped" })
          .eq("project_id", projectId)
          .eq("phase_number", p.number)
          .neq("status", "completed");
      }
      return supabase
        .from("customer_phases")
        .update({ status: "not_started", actual_start_date: null, is_manual_override: false, override_note: null })
        .eq("project_id", projectId)
        .eq("phase_number", p.number)
        .neq("status", "completed");
    });

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error("PATCH /api/projects/[projectId]/programme/phase update error:", failed.error);
      return NextResponse.json({ error: "Failed to update programme phase" }, { status: 500 });
    }

    await sendCliqNotification(
      `${companyName}: manually jumped to Phase ${phaseNumber} (${targetPhase.name}).${note ? ` Note: ${note}` : ""}`,
      "pm"
    );

    const { data: phases } = await supabase.from("customer_phases").select("*").eq("project_id", projectId).order("phase_number");
    return NextResponse.json({ phases: phases ?? [] });
  } catch (err) {
    console.error("PATCH /api/projects/[projectId]/programme/phase unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
