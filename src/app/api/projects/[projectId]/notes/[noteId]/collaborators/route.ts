import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Task 311 — share a note. RLS (migration 120) restricts writes to the note's author or an
// admin/super_admin. `upsert` on the (note_id, user_id) unique constraint lets re-sharing an
// already-shared person just change their permission instead of erroring.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; noteId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId, noteId } = await params;
    const body = await request.json();
    const { user_id, permission } = body as { user_id?: string; permission?: string };

    if (!user_id) return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    if (permission !== "view" && permission !== "edit") {
      return NextResponse.json({ error: "permission must be 'view' or 'edit'" }, { status: 400 });
    }

    const { data: note, error: noteError } = await supabase
      .from("notes")
      .select("id")
      .eq("id", noteId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (noteError) {
      console.error("POST .../notes/[noteId]/collaborators lookup error:", noteError);
      return NextResponse.json({ error: "Failed to look up note" }, { status: 500 });
    }
    if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });

    const { data, error } = await supabase
      .from("note_collaborators")
      .upsert(
        { note_id: noteId, user_id, permission, added_by: user.id },
        { onConflict: "note_id,user_id" }
      )
      .select("id, user_id, permission, added_by, user:profiles!note_collaborators_user_id_fkey(id, full_name, avatar_url)")
      .single();

    if (error) {
      console.error("POST .../notes/[noteId]/collaborators error:", error);
      return NextResponse.json({ error: "Not permitted to share this note" }, { status: 403 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("POST .../notes/[noteId]/collaborators unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
