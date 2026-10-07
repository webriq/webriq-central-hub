import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fileLevel, folderLevel, getDriveViewer, isForbidden, isResponse, json } from "@/lib/drive/access";
import { patchFileSchema } from "@/lib/drive/schemas";
import { removeDriveObjects } from "@/lib/drive/storage";

type Ctx = { params: Promise<{ fileId: string }> };
const idSchema = z.string().uuid();

// Rename and/or move. A direct file-level `edit` share allows a rename only (RLS can't compare the
// old and new folder_id), so a move needs ownership or edit on the file's current folder — and edit
// (or ownership, for the drive root) on the destination. The DB trigger additionally refuses a
// destination owned by someone else.
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const viewer = await getDriveViewer();
    if (isResponse(viewer)) return viewer;
    const { supabase, userId } = viewer;
    const { fileId } = await params;
    if (!idSchema.safeParse(fileId).success) return json("Invalid file id.", 400);

    const parsed = patchFileSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
    const { name, folderId } = parsed.data;

    const { data: file } = await supabase.from("drive_files").select("owner_id, folder_id").eq("id", fileId).maybeSingle();
    if (!file) return json("File not found.", 404);
    if ((await fileLevel(viewer, fileId)) < 2) return json("You can't change this file.", 403);

    const update: { file_name?: string; folder_id?: string | null } = {};
    if (name !== undefined) update.file_name = name;
    if (folderId !== undefined && folderId !== file.folder_id) {
      const canMoveFromHere = file.owner_id === userId || (!!file.folder_id && (await folderLevel(viewer, file.folder_id)) >= 2);
      if (!canMoveFromHere) return json("You can't move this file.", 403);
      if (folderId === null ? file.owner_id !== userId : (await folderLevel(viewer, folderId)) < 2) {
        return json("You can't move files there.", 403);
      }
      update.folder_id = folderId;
    }
    if (Object.keys(update).length === 0) return NextResponse.json(file);

    const { data, error } = await supabase.from("drive_files").update(update).eq("id", fileId).select().maybeSingle();
    if (isForbidden(error)) return json("You can't move files there.", 403);
    if (error) {
      console.error("PATCH /api/drive/files/[fileId] error:", error);
      return json("Couldn't update the file — try again.", 500);
    }
    if (!data) return json("You can't change this file.", 403);
    return NextResponse.json(data);
  } catch (err) {
    console.error("PATCH /api/drive/files/[fileId] unexpected error:", err);
    return json("Internal server error", 500);
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const viewer = await getDriveViewer();
    if (isResponse(viewer)) return viewer;
    const { fileId } = await params;
    if (!idSchema.safeParse(fileId).success) return json("Invalid file id.", 400);

    const { data: file } = await viewer.supabase.from("drive_files").select("file_path").eq("id", fileId).maybeSingle();
    if (!file) return json("File not found.", 404);

    const { data, error } = await viewer.supabase.from("drive_files").delete().eq("id", fileId).select("id");
    if (error) {
      console.error("DELETE /api/drive/files/[fileId] error:", error);
      return json("Couldn't delete the file — try again.", 500);
    }
    if (!data || data.length === 0) return json("You can't delete this file.", 403);

    await removeDriveObjects([file.file_path]);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE /api/drive/files/[fileId] unexpected error:", err);
    return json("Internal server error", 500);
  }
}
