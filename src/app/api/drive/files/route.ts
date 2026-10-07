import { NextRequest, NextResponse } from "next/server";
import { folderLevel, getDriveViewer, isForbidden, isResponse, json } from "@/lib/drive/access";
import { registerFileSchema } from "@/lib/drive/schemas";
import { driveObjectExists } from "@/lib/drive/storage";

// Register an uploaded object as a Drive file. The path was minted by /upload/sign; here we assert
// it sits inside the owner's tree and that the browser's PUT actually landed before inserting.
export async function POST(request: NextRequest) {
  try {
    const viewer = await getDriveViewer();
    if (isResponse(viewer)) return viewer;
    const { supabase, userId } = viewer;

    const parsed = registerFileSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
    const body = parsed.data;

    let ownerId = userId;
    if (body.folder_id) {
      if ((await folderLevel(viewer, body.folder_id)) < 2) return json("You can't upload to this folder.", 403);
      const { data: folder } = await supabase.from("drive_folders").select("owner_id").eq("id", body.folder_id).maybeSingle();
      if (!folder) return json("Folder not found.", 404);
      ownerId = folder.owner_id;
    }
    if (!body.file_path.startsWith(`${ownerId}/`)) return json("Invalid file path.", 400);
    if (!(await driveObjectExists(body.file_path))) return json("The upload didn't finish — try uploading the file again.", 400);

    const { data, error } = await supabase
      .from("drive_files")
      .insert({
        owner_id: ownerId, uploaded_by: userId, folder_id: body.folder_id, file_name: body.file_name,
        file_path: body.file_path, file_size: body.file_size, file_mime_type: body.file_mime_type,
      })
      .select()
      .single();
    if (isForbidden(error)) return json("You can't upload to this folder.", 403);
    if (error || !data) {
      console.error("POST /api/drive/files error:", error);
      return json("Couldn't save the file — try again.", 500);
    }
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("POST /api/drive/files unexpected error:", err);
    return json("Internal server error", 500);
  }
}
