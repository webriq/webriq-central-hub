import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Task 311 — Project Notes. `projectId` here is `projects.id` (the UUID), matching the
// convention already established by the sibling `/api/projects/[projectId]/members` route,
// not the human-readable `project_id` display column. Visibility/edit permission is enforced
// entirely by RLS (migration 120) — this route never uses `adminClient`, per the "never bypass
// RLS for regular reads" convention.

const NOTE_SELECT =
  "*, author:profiles!notes_created_by_fkey(id, full_name, avatar_url), " +
  "collaborators:note_collaborators(id, user_id, permission, added_by, user:profiles!note_collaborators_user_id_fkey(id, full_name, avatar_url))";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId } = await params;
    const archived = new URL(request.url).searchParams.get("archived") === "true";

    const { data, error } = await supabase
      .from("notes")
      .select(NOTE_SELECT)
      .eq("project_id", projectId)
      .eq("is_archived", archived)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("GET /api/projects/[projectId]/notes error:", error);
      return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("GET /api/projects/[projectId]/notes unexpected error:", err);
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
    const { title, content, color, folder_id, is_pinned } = body as {
      title?: string | null;
      content?: string | null;
      color?: string;
      folder_id?: string | null;
      is_pinned?: boolean;
    };

    const { data, error } = await supabase
      .from("notes")
      .insert({
        project_id: projectId,
        title: title?.trim() || null,
        content: content ?? null,
        color: color ?? "default",
        folder_id: folder_id ?? null,
        is_pinned: is_pinned ?? false,
        created_by: user.id,
      })
      .select(NOTE_SELECT)
      .single();

    if (error) {
      console.error("POST /api/projects/[projectId]/notes error:", error);
      return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("POST /api/projects/[projectId]/notes unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
