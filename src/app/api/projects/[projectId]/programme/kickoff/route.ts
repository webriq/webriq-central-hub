import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { rematerialiseProgrammeDates } from "@/lib/programme/store";
import { canEditKickoff, kickoffTimestamp, parseKickoffDate } from "@/lib/programme/note-rules";

// Task 455 — set a running programme's kickoff (projects.programme_started_at) to the PM-confirmed
// date. admin/super_admin/pm. Only the kickoff and the derived phase/deliverable start/due dates
// change (rematerialiseProgrammeDates); phase status and actual dates are untouched. adminClient after
// the role check: programme project_phases rows are RLS-writable by admin/super_admin/marketing only,
// and pm needs to re-materialise them here (same pattern as the phase-tagging route).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!canEditKickoff(profile?.role)) {
      return NextResponse.json({ error: "Not permitted to change the kickoff date" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    // "Today" in the furthest-ahead timezone (UTC+14), so a PM whose local date is already tomorrow relative
    // to UTC can still pick their own today.
    const latestTodayYmd = new Date(Date.now() + 14 * 3_600_000).toISOString().slice(0, 10);
    const parsed = parseKickoffDate(body?.kickoff_date, latestTodayYmd);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { projectId } = await params;
    const { data: project } = await supabase
      .from("projects")
      .select("id, programme_started_at")
      .eq("id", projectId)
      .neq("status", "deleted")
      .maybeSingle();
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (!project.programme_started_at) {
      return NextResponse.json({ error: "The programme hasn't started yet — start it first" }, { status: 409 });
    }

    const startedAt = kickoffTimestamp(parsed.ymd);
    const { error } = await adminClient.from("projects").update({ programme_started_at: startedAt }).eq("id", projectId);
    if (error) {
      console.error("PATCH .../programme/kickoff update error:", error);
      return NextResponse.json({ error: "Failed to update the kickoff date" }, { status: 500 });
    }
    try {
      await rematerialiseProgrammeDates(adminClient, projectId, startedAt);
    } catch (err) {
      // The kickoff itself is saved; the derived dates are recomputed again by the next save.
      console.error("PATCH .../programme/kickoff rematerialise error:", err);
      return NextResponse.json({ error: "Kickoff saved, but phase dates failed to update — save again to retry" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, programme_started_at: startedAt });
  } catch (err) {
    console.error("PATCH .../programme/kickoff unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
