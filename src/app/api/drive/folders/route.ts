import { NextRequest, NextResponse } from "next/server";
import { folderLevel, getDriveViewer, isForbidden, isResponse, isUniqueViolation, json } from "@/lib/drive/access";
import { createFolderSchema } from "@/lib/drive/schemas";

// Create a folder at the drive root (parentFolderId null → owner is the caller) or inside a folder
// the caller owns / can edit (the new folder belongs to that folder's owner).
export async function POST(request: NextRequest) {
  try {
    const viewer = await getDriveViewer();
    if (isResponse(viewer)) return viewer;
    const { supabase, userId } = viewer;

    const parsed = createFolderSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
    const { name, parentFolderId } = parsed.data;

    let ownerId = userId;
    if (parentFolderId) {
      if ((await folderLevel(viewer, parentFolderId)) < 2) return json("You can't add folders here.", 403);
      const { data: parent } = await supabase.from("drive_folders").select("owner_id").eq("id", parentFolderId).maybeSingle();
      if (!parent) return json("Folder not found.", 404);
      ownerId = parent.owner_id;
    }

    const { data, error } = await supabase
      .from("drive_folders")
      .insert({ owner_id: ownerId, parent_folder_id: parentFolderId, name })
      .select()
      .single();
    if (isUniqueViolation(error)) return json(`A folder named "${name}" already exists here.`, 409);
    if (isForbidden(error)) return json("You can't add folders here.", 403);
    if (error || !data) {
      console.error("POST /api/drive/folders error:", error);
      return json("Couldn't create the folder — try again.", 500);
    }
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("POST /api/drive/folders unexpected error:", err);
    return json("Internal server error", 500);
  }
}
