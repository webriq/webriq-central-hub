import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Task 311 — rename/delete a note folder. Deleting a folder does NOT delete its notes — the
// `notes.folder_id` FK is `on delete set null` (migration 120), so notes are simply unfiled.
// Task 337 — the PATCH also accepts `visibility` ('private' | 'public'). RLS (migration 120's
// `note_folders_update` = creator or admin/super_admin) is the gate for both fields.

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; folderId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId, folderId } = await params;
    const body = await request.json();
    const { name, visibility } = body as { name?: string; visibility?: string };

    const updates: { name?: string; visibility?: "private" | "public" } = {};
    if (name !== undefined) {
      if (!name.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
      updates.name = name.trim();
    }
    if (visibility !== undefined) {
      if (visibility !== "private" && visibility !== "public") {
        return NextResponse.json({ error: "visibility must be 'private' or 'public'" }, { status: 400 });
      }
      updates.visibility = visibility;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "name or visibility is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("note_folders")
      .update(updates)
      .eq("id", folderId)
      .eq("project_id", projectId)
      .select();

    if (error) {
      console.error("PATCH .../notes/folders/[folderId] error:", error);
      return NextResponse.json({ error: "Failed to update folder" }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Not permitted to modify this folder" }, { status: 403 });
    }

    return NextResponse.json(data[0]);
  } catch (err) {
    console.error("PATCH .../notes/folders/[folderId] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; folderId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId, folderId } = await params;

    const { data, error } = await supabase
      .from("note_folders")
      .delete()
      .eq("id", folderId)
      .eq("project_id", projectId)
      .select("id");

    if (error) {
      console.error("DELETE .../notes/folders/[folderId] error:", error);
      return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Not permitted to modify this folder" }, { status: 403 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE .../notes/folders/[folderId] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
