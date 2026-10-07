import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDriveViewer, isResponse, json } from "@/lib/drive/access";
import { updateShareSchema } from "@/lib/drive/schemas";
import { scheduleDriveShareNotice } from "@/lib/drive/notify-share";

type Ctx = { params: Promise<{ shareId: string }> };
const idSchema = z.string().uuid();

// Owner-only (drive_shares_update / drive_shares_delete); a zero-row result means not allowed.
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const viewer = await getDriveViewer();
    if (isResponse(viewer)) return viewer;
    const { shareId } = await params;
    if (!idSchema.safeParse(shareId).success) return json("Invalid share id.", 400);
    const parsed = updateShareSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json("Choose Can view or Can edit.", 400);

    // Read the previous permission first: only a view → edit upgrade notifies (task 437).
    const { data: prev } = await viewer.supabase.from("drive_shares").select("permission").eq("id", shareId).maybeSingle();
    const { data, error } = await viewer.supabase.from("drive_shares").update({ permission: parsed.data.permission }).eq("id", shareId).select().maybeSingle();
    if (error) return json("Couldn't update access — try again.", 500);
    if (!data) return json("Only the owner can change access.", 403);
    if (prev?.permission === "view" && data.permission === "edit") {
      scheduleDriveShareNotice(viewer.userId, {
        target: data.folder_id ? { kind: "folder", id: data.folder_id } : { kind: "file", id: data.file_id! },
        grantee: data.user_id ? { userId: data.user_id } : { role: data.role! },
        permission: "edit",
        isUpgrade: true,
      });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("PATCH /api/drive/shares/[shareId] unexpected error:", err);
    return json("Internal server error", 500);
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const viewer = await getDriveViewer();
    if (isResponse(viewer)) return viewer;
    const { shareId } = await params;
    if (!idSchema.safeParse(shareId).success) return json("Invalid share id.", 400);

    const { data, error } = await viewer.supabase.from("drive_shares").delete().eq("id", shareId).select("id");
    if (error) return json("Couldn't remove access — try again.", 500);
    if (!data || data.length === 0) return json("Only the owner can remove access.", 403);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE /api/drive/shares/[shareId] unexpected error:", err);
    return json("Internal server error", 500);
  }
}
