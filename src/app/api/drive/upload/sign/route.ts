import { NextRequest, NextResponse } from "next/server";
import { folderLevel, getDriveViewer, isResponse, json } from "@/lib/drive/access";
import { signUploadSchema } from "@/lib/drive/schemas";
import { DRIVE_MAX_FILE_SIZE, DRIVE_MAX_SIZE_LABEL } from "@/lib/drive/constants";
import { buildDrivePath, createDriveUploadUrl, DRIVE_ALLOWED_MIME_TYPES } from "@/lib/drive/storage";

// Mints a short-lived signed upload URL so the browser PUTs straight to the private `user-drive`
// bucket (Vercel's ~4.5 MB handler body cap would 413 anything larger — task 350's reasoning).
// Runs every gate check; the register `POST /api/drive/files` creates the row afterwards.
export async function POST(request: NextRequest) {
  try {
    const viewer = await getDriveViewer();
    if (isResponse(viewer)) return viewer;

    const parsed = signUploadSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json("filename, size and mimeType are required.", 400);
    const { filename, size, mimeType, folderId } = parsed.data;

    if (!DRIVE_ALLOWED_MIME_TYPES.includes(mimeType)) {
      return json(`${mimeType} isn't supported. Upload documents, images, spreadsheets, presentations, archives or audio/video recordings.`, 400);
    }
    if (size > DRIVE_MAX_FILE_SIZE) {
      return json(`${(size / (1024 * 1024)).toFixed(1)} MB exceeds the ${DRIVE_MAX_SIZE_LABEL} limit — compress or split the file, then try again.`, 400);
    }

    // The path lives under the DRIVE OWNER's id: the caller's own for root uploads, the folder
    // owner's when an editor uploads into a shared folder.
    let ownerId = viewer.userId;
    if (folderId) {
      if ((await folderLevel(viewer, folderId)) < 2) return json("You can't upload to this folder.", 403);
      const { data: folder } = await viewer.supabase.from("drive_folders").select("owner_id").eq("id", folderId).maybeSingle();
      if (!folder) return json("Folder not found.", 404);
      ownerId = folder.owner_id;
    }

    const signed = await createDriveUploadUrl(buildDrivePath({ ownerId, filename }));
    return NextResponse.json(signed);
  } catch (err) {
    console.error("POST /api/drive/upload/sign unexpected error:", err);
    return json("Internal server error", 500);
  }
}
