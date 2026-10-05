import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProgrammePhase, upsertPhaseState } from "@/lib/programme/store";

// Task 221 — persists phase_programme_state.delay_note from the Portfolio Tracker status report page.
// Mirrors the WRITE_ROLES convention used by every other phase-write route (phase/route.ts,
// deliverables/[key]/route.ts, complete-phase/route.ts): admin/super_admin/marketing only.
// pm/developer/hr see the note read-only (it's already included in the status-report GET payload).
const WRITE_ROLES = ["admin", "super_admin", "marketing"];

function parsePhaseNumber(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Every started project already has a programme phase row for every phase in its plan (the seed
// inserts them up front); its state row is upserted so a phase without one still saves.
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

    const phase = await getProgrammePhase(supabase, projectId, phaseNumber);
    if (!phase) return NextResponse.json({ error: "Unknown phase for that project" }, { status: 404 });
    try {
      await upsertPhaseState(supabase, phase.id, { delay_note: note });
    } catch (error) {
      console.error("PATCH .../phases/[phaseNumber]/note error:", error);
      return NextResponse.json({ error: "Failed to save delay note" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, note });
  } catch (err) {
    console.error("PATCH .../phases/[phaseNumber]/note unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
