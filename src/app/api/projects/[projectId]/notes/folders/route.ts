import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Task 311 — project-scoped note folders (Google Keep "labels", scoped down to one project).
// Task 337 — the GET embeds `visibility` + RLS-filtered `note_folder_shares`. Until migration
// 127 is applied the embed / column don't exist, so it falls back to a bare `select("*")` and
// the Notes tab degrades gracefully (folders still list; sharing controls no-op).

const FOLDER_SELECT_WITH_SHARES =
  "*, shares:note_folder_shares(id, folder_id, user_id, role, permission, added_by, " +
  "user:profiles!note_folder_shares_user_id_fkey(id, full_name, avatar_url))";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId } = await params;
    const enriched = await supabase
      .from("note_folders")
      .select(FOLDER_SELECT_WITH_SHARES)
      .eq("project_id", projectId)
      .order("name", { ascending: true });

    if (!enriched.error) return NextResponse.json(enriched.data ?? []);

    // Migration 127 not applied yet → PostgREST schema-cache error for the `shares` embed. Retry
    // with the bare select so the tab still renders folders (task 337 Compatibility Touchpoints).
    const bare = await supabase
      .from("note_folders")
      .select("*")
      .eq("project_id", projectId)
      .order("name", { ascending: true });

    if (bare.error) {
      console.error("GET .../notes/folders error:", bare.error);
      return NextResponse.json({ error: "Failed to fetch folders" }, { status: 500 });
    }

    return NextResponse.json(bare.data ?? []);
  } catch (err) {
    console.error("GET .../notes/folders unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId } = await params;
    const body = await request.json();
    const { name } = body as { name?: string };
    if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const { data, error } = await supabase
      .from("note_folders")
      .insert({ project_id: projectId, name: name.trim(), created_by: user.id })
      .select()
      .single();

    if (error) {
      console.error("POST .../notes/folders error:", error);
      return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("POST .../notes/folders unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
