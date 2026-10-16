import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { canWriteDelayNotes, parseDelayNote } from "@/lib/programme/note-rules";
import { isUndefinedColumn } from "@/lib/programme/delay-notes";

// Task 455 — project-level "why is this programme delayed" note (projects.delay_note, migration 177).
// Same writers as the per-phase note: admin/super_admin/marketing/pm. adminClient is used for the write
// after the role check so pm doesn't need a broader projects update policy; only the three note columns
// are ever written here.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
    if (!canWriteDelayNotes(profile?.role)) {
      return NextResponse.json({ error: "Not permitted to edit this project's delay note" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = parseDelayNote(body?.note);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const note = parsed.note;

    const { projectId } = await params;
    const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).neq("status", "deleted").maybeSingle();
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const updatedAt = new Date().toISOString();
    const { error } = await adminClient
      .from("projects")
      .update({ delay_note: note, delay_note_updated_at: updatedAt, delay_note_updated_by: user.id })
      .eq("id", projectId);
    if (isUndefinedColumn(error)) {
      return NextResponse.json({ error: "Project notes are not available yet (database migration 177 pending)" }, { status: 503 });
    }
    if (error) {
      console.error("PATCH .../programme/note error:", error);
      return NextResponse.json({ error: "Failed to save project note" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, note, updatedAt: note ? updatedAt : null, updatedBy: note ? profile?.full_name ?? null : null });
  } catch (err) {
    console.error("PATCH .../programme/note unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
