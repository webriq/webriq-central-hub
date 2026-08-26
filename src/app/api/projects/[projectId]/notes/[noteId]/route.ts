import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Task 311 — single-note update/delete. RLS (migration 120) is the actual gate: a view-only
// collaborator's PATCH matches the row (visible) but updates 0 rows (not editable) — that
// distinction is what separates the 404 (can't even see it) from the 403 (sees it, can't
// change it) responses below, mirroring the existing `.../assets/[assetId]` route's shape.

const NOTE_SELECT =
  "*, author:profiles!notes_created_by_fkey(id, full_name, avatar_url), " +
  "collaborators:note_collaborators(id, user_id, permission, added_by, user:profiles!note_collaborators_user_id_fkey(id, full_name, avatar_url))";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; noteId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId, noteId } = await params;
    const body = await request.json();
    const { title, content, color, folder_id, is_pinned, is_archived } = body as {
      title?: string | null;
      content?: string | null;
      color?: string;
      folder_id?: string | null;
      is_pinned?: boolean;
      is_archived?: boolean;
    };

    const { data: existing, error: fetchError } = await supabase
      .from("notes")
      .select("id")
      .eq("id", noteId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (fetchError) {
      console.error("PATCH .../notes/[noteId] lookup error:", fetchError);
      return NextResponse.json({ error: "Failed to look up note" }, { status: 500 });
    }
    if (!existing) return NextResponse.json({ error: "Note not found" }, { status: 404 });

    const updates: {
      title?: string | null; content?: string | null; color?: string;
      folder_id?: string | null; is_pinned?: boolean; is_archived?: boolean;
    } = {};
    if (title !== undefined) updates.title = title?.trim() || null;
    if (content !== undefined) updates.content = content;
    if (color !== undefined) updates.color = color;
    if (folder_id !== undefined) updates.folder_id = folder_id;
    if (is_pinned !== undefined) updates.is_pinned = is_pinned;
    if (is_archived !== undefined) updates.is_archived = is_archived;

    const { data: updated, error: updateError } = await supabase
      .from("notes")
      .update(updates)
      .eq("id", noteId)
      .eq("project_id", projectId)
      .select(NOTE_SELECT);

    if (updateError) {
      console.error("PATCH .../notes/[noteId] update error:", updateError);
      return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: "Not permitted to modify this note" }, { status: 403 });
    }

    return NextResponse.json(updated[0]);
  } catch (err) {
    console.error("PATCH .../notes/[noteId] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; noteId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId, noteId } = await params;

    const { data: existing, error: fetchError } = await supabase
      .from("notes")
      .select("id")
      .eq("id", noteId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (fetchError) {
      console.error("DELETE .../notes/[noteId] lookup error:", fetchError);
      return NextResponse.json({ error: "Failed to look up note" }, { status: 500 });
    }
    if (!existing) return NextResponse.json({ error: "Note not found" }, { status: 404 });

    const { data: deleted, error } = await supabase
      .from("notes")
      .delete()
      .eq("id", noteId)
      .eq("project_id", projectId)
      .select("id");

    if (error) {
      console.error("DELETE .../notes/[noteId] error:", error);
      return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
    }
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: "Not permitted to delete this note" }, { status: 403 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE .../notes/[noteId] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
