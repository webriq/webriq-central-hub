import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Task 337 — change one folder share's permission, or revoke it. RLS (migration 127) restricts
// both to the folder's creator or an admin/super_admin. 403-on-zero-rows mirrors the sibling
// `.../collaborators/[userId]` route.

const SHARE_SELECT =
  "id, folder_id, user_id, role, permission, added_by, " +
  "user:profiles!note_folder_shares_user_id_fkey(id, full_name, avatar_url)";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; folderId: string; shareId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { folderId, shareId } = await params;
    const body = await request.json();
    const { permission } = body as { permission?: string };
    if (permission !== "view" && permission !== "edit") {
      return NextResponse.json({ error: "permission must be 'view' or 'edit'" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("note_folder_shares")
      .update({ permission })
      .eq("id", shareId)
      .eq("folder_id", folderId)
      .select(SHARE_SELECT);

    if (error) {
      console.error("PATCH .../folders/[folderId]/shares/[shareId] error:", error);
      return NextResponse.json({ error: "Failed to update folder share" }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Not permitted to modify this folder share" }, { status: 403 });
    }

    return NextResponse.json(data[0]);
  } catch (err) {
    console.error("PATCH .../folders/[folderId]/shares/[shareId] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; folderId: string; shareId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { folderId, shareId } = await params;

    const { data, error } = await supabase
      .from("note_folder_shares")
      .delete()
      .eq("id", shareId)
      .eq("folder_id", folderId)
      .select("id");

    if (error) {
      console.error("DELETE .../folders/[folderId]/shares/[shareId] error:", error);
      return NextResponse.json({ error: "Failed to remove folder share" }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Not permitted to modify this folder share" }, { status: 403 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE .../folders/[folderId]/shares/[shareId] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
