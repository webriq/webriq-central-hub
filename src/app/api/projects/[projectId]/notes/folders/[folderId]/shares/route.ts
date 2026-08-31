import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Task 337 — folder-level shares. Each row targets exactly one of a user OR a staff role, at
// 'view' or 'edit'. RLS (migration 127's `note_folder_shares_*` policies) restricts writes to
// the folder's creator or an admin/super_admin — identical to who can rename/delete the folder.
// Mirrors the 403-on-zero-rows shape of the sibling `.../collaborators` routes.

const SHARE_SELECT =
  "id, folder_id, user_id, role, permission, added_by, " +
  "user:profiles!note_folder_shares_user_id_fkey(id, full_name, avatar_url)";

const ROLES = ["pm", "developer", "admin", "super_admin"] as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; folderId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { folderId } = await params;
    const { data, error } = await supabase
      .from("note_folder_shares")
      .select(SHARE_SELECT)
      .eq("folder_id", folderId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("GET .../notes/folders/[folderId]/shares error:", error);
      return NextResponse.json({ error: "Failed to fetch folder shares" }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("GET .../notes/folders/[folderId]/shares unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; folderId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { folderId } = await params;
    const body = await request.json();
    const { user_id, role, permission } = body as { user_id?: string; role?: string; permission?: string };
    type Role = (typeof ROLES)[number];

    if ((user_id ? 1 : 0) + (role ? 1 : 0) !== 1) {
      return NextResponse.json({ error: "provide exactly one of user_id or role" }, { status: 400 });
    }
    if (role !== undefined && !ROLES.includes(role as Role)) {
      return NextResponse.json({ error: `role must be one of ${ROLES.join(", ")}` }, { status: 400 });
    }
    if (permission !== "view" && permission !== "edit") {
      return NextResponse.json({ error: "permission must be 'view' or 'edit'" }, { status: 400 });
    }
    const perm: "view" | "edit" = permission;
    const roleValue = (role ?? null) as Role | null;

    const insertRow = {
      folder_id: folderId,
      user_id: user_id ?? null,
      role: roleValue,
      permission: perm,
      added_by: user.id,
    };

    const { data, error } = await supabase
      .from("note_folder_shares")
      .insert(insertRow)
      .select(SHARE_SELECT)
      .single();

    if (!error) return NextResponse.json(data, { status: 201 });

    // Duplicate target (partial unique index) → just update that row's permission instead.
    if (error.code === "23505") {
      const match = supabase.from("note_folder_shares").update({ permission: perm }).eq("folder_id", folderId);
      const scoped = user_id ? match.eq("user_id", user_id) : match.eq("role", roleValue as Role);
      const { data: updated, error: updateError } = await scoped.select(SHARE_SELECT);
      if (updateError || !updated || updated.length === 0) {
        console.error("POST .../folders/[folderId]/shares update-on-conflict error:", updateError);
        return NextResponse.json({ error: "Not permitted to share this folder" }, { status: 403 });
      }
      return NextResponse.json(updated[0], { status: 200 });
    }

    console.error("POST .../notes/folders/[folderId]/shares error:", error);
    return NextResponse.json({ error: "Not permitted to share this folder" }, { status: 403 });
  } catch (err) {
    console.error("POST .../notes/folders/[folderId]/shares unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
