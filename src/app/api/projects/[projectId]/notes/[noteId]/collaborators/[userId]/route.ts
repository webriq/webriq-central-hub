import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Task 311 — change or revoke one collaborator's share. RLS (migration 120) restricts both
// to the note's author or an admin/super_admin.

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; noteId: string; userId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { noteId, userId } = await params;
    const body = await request.json();
    const { permission } = body as { permission?: string };
    if (permission !== "view" && permission !== "edit") {
      return NextResponse.json({ error: "permission must be 'view' or 'edit'" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("note_collaborators")
      .update({ permission })
      .eq("note_id", noteId)
      .eq("user_id", userId)
      .select("id, user_id, permission, added_by, user:profiles!note_collaborators_user_id_fkey(id, full_name, avatar_url)");

    if (error) {
      console.error("PATCH .../collaborators/[userId] error:", error);
      return NextResponse.json({ error: "Failed to update collaborator" }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Not permitted to modify this share" }, { status: 403 });
    }

    return NextResponse.json(data[0]);
  } catch (err) {
    console.error("PATCH .../collaborators/[userId] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; noteId: string; userId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { noteId, userId } = await params;

    const { data, error } = await supabase
      .from("note_collaborators")
      .delete()
      .eq("note_id", noteId)
      .eq("user_id", userId)
      .select("id");

    if (error) {
      console.error("DELETE .../collaborators/[userId] error:", error);
      return NextResponse.json({ error: "Failed to remove collaborator" }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Not permitted to modify this share" }, { status: 403 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE .../collaborators/[userId] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
