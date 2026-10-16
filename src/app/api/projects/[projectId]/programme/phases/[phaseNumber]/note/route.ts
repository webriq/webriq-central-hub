import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getProgrammePhase } from "@/lib/programme/store";
import { canWriteDelayNotes, parseDelayNote } from "@/lib/programme/note-rules";
import { isUndefinedColumn } from "@/lib/programme/delay-notes";

// Task 221 — persists phase_programme_state.delay_note from the Status Report / Status Summary drawer.
// Task 455 — pm can now write it too (admin/super_admin/marketing/pm; pm is unrestricted per task 291),
// and who/when is recorded. The write uses adminClient on purpose: phase_programme_state's RLS write
// policy stays admin/super_admin/marketing so PMs can't touch wizard_data/override_note, and this route
// writes ONLY the note + its audit columns after its own role check.

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

    const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
    if (!canWriteDelayNotes(profile?.role)) {
      return NextResponse.json({ error: "Not permitted to edit this phase's delay note" }, { status: 403 });
    }

    const { projectId, phaseNumber: phaseNumberRaw } = await params;
    const phaseNumber = parsePhaseNumber(phaseNumberRaw);
    if (!phaseNumber) return NextResponse.json({ error: "phaseNumber must be a positive integer" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const parsed = parseDelayNote(body?.note);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const note = parsed.note;

    const phase = await getProgrammePhase(supabase, projectId, phaseNumber);
    if (!phase) return NextResponse.json({ error: "Unknown phase for that project" }, { status: 404 });

    const updatedAt = new Date().toISOString();
    let { error } = await adminClient
      .from("phase_programme_state")
      .upsert({ phase_id: phase.id, delay_note: note, delay_note_updated_at: updatedAt, delay_note_updated_by: user.id }, { onConflict: "phase_id" });
    // Migration 177 not applied yet — save the note without its audit columns.
    if (isUndefinedColumn(error)) {
      ({ error } = await adminClient.from("phase_programme_state").upsert({ phase_id: phase.id, delay_note: note }, { onConflict: "phase_id" }));
    }
    if (error) {
      console.error("PATCH .../phases/[phaseNumber]/note error:", error);
      return NextResponse.json({ error: "Failed to save delay note" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, note, updatedAt: note ? updatedAt : null, updatedBy: note ? profile?.full_name ?? null : null });
  } catch (err) {
    console.error("PATCH .../phases/[phaseNumber]/note unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
