import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDriveViewer, isResponse, isUniqueViolation, json } from "@/lib/drive/access";
import { renameFolderSchema } from "@/lib/drive/schemas";
import { collectDriveSubtree } from "@/lib/drive/collect-subtree";
import { removeDriveObjects } from "@/lib/drive/storage";

type Ctx = { params: Promise<{ folderId: string }> };
const idSchema = z.string().uuid();

// Rename. RLS (drive_folders_update) is the authority: owners, or editors with edit on the PARENT —
// never the shared root itself — so a zero-row result means "not allowed" (or not visible).
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const viewer = await getDriveViewer();
    if (isResponse(viewer)) return viewer;
    const { folderId } = await params;
    if (!idSchema.safeParse(folderId).success) return json("Invalid folder id.", 400);

    const parsed = renameFolderSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json(parsed.error.issues[0]?.message ?? "Invalid request.", 400);

    const { data, error } = await viewer.supabase
      .from("drive_folders").update({ name: parsed.data.name }).eq("id", folderId).select().maybeSingle();
    if (isUniqueViolation(error)) return json(`A folder named "${parsed.data.name}" already exists here.`, 409);
    if (error) {
      console.error("PATCH /api/drive/folders/[folderId] error:", error);
      return json("Couldn't rename the folder — try again.", 500);
    }
    if (!data) return json("You can't rename this folder.", 403);
    return NextResponse.json(data);
  } catch (err) {
    console.error("PATCH /api/drive/folders/[folderId] unexpected error:", err);
    return json("Internal server error", 500);
  }
}

// Delete the folder and its subtree. Storage paths are collected first (the FK cascade drops the
// file rows), then removed best-effort once the DB delete succeeded.
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const viewer = await getDriveViewer();
    if (isResponse(viewer)) return viewer;
    const { folderId } = await params;
    if (!idSchema.safeParse(folderId).success) return json("Invalid folder id.", 400);

    const { data: existing } = await viewer.supabase.from("drive_folders").select("id").eq("id", folderId).maybeSingle();
    if (!existing) return json("Folder not found.", 404);

    const filePaths = await collectDriveSubtree(viewer, folderId);
    const { data, error } = await viewer.supabase.from("drive_folders").delete().eq("id", folderId).select("id");
    if (error) {
      console.error("DELETE /api/drive/folders/[folderId] error:", error);
      return json("Couldn't delete the folder — try again.", 500);
    }
    if (!data || data.length === 0) return json("You can't delete this folder.", 403);

    await removeDriveObjects(filePaths);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE /api/drive/folders/[folderId] unexpected error:", err);
    return json("Internal server error", 500);
  }
}
