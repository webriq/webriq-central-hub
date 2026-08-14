import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Task 221 — persists customer_phases.delay_note from the Portfolio Tracker status report page.
// Mirrors the WRITE_ROLES convention used by every other phase-write route (phase/route.ts,
// deliverables/[key]/route.ts, complete-phase/route.ts): admin/super_admin/marketing only.
// pm/developer/hr see the note read-only (it's already included in the status-report GET payload).
const WRITE_ROLES = ["admin", "super_admin", "marketing"];

function parsePhaseNumber(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Every project with programme_started_at set already has a customer_phases row for every phase
// in its plan (seedAndStartProgramme/seedProgrammeAtPhase insert them up front, defaults + any
// customs — task 246) — a plain update is enough, no upsert needed.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseNumber: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile?.role || !WRITE_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Not permitted to edit this phase's delay note" }, { status: 403 });
    }

    const { projectId, phaseNumber: phaseNumberRaw } = await params;
    const phaseNumber = parsePhaseNumber(phaseNumberRaw);
    if (!phaseNumber) return NextResponse.json({ error: "phaseNumber must be a positive integer" }, { status: 400 });

    const body = await request.json();
    const note: string | null = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

    const { error } = await supabase
      .from("customer_phases")
      .update({ delay_note: note })
      .eq("project_id", projectId)
      .eq("phase_number", phaseNumber);

    if (error) {
      console.error("PATCH .../phases/[phaseNumber]/note error:", error);
      return NextResponse.json({ error: "Failed to save delay note" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, note });
  } catch (err) {
    console.error("PATCH .../phases/[phaseNumber]/note unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
