import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Task 311 — rename/delete a note folder. Deleting a folder does NOT delete its notes — the
// `notes.folder_id` FK is `on delete set null` (migration 120), so notes are simply unfiled.

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
    const { name } = body as { name?: string };
    if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const { data, error } = await supabase
      .from("note_folders")
      .update({ name: name.trim() })
      .eq("id", folderId)
      .eq("project_id", projectId)
      .select();

    if (error) {
      console.error("PATCH .../notes/folders/[folderId] error:", error);
      return NextResponse.json({ error: "Failed to rename folder" }, { status: 500 });
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
