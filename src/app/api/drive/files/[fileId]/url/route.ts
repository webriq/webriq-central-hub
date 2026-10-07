import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDriveViewer, isResponse, json } from "@/lib/drive/access";
import { signDriveFileUrl } from "@/lib/drive/storage";

// Short-lived signed URL for preview/download. The select goes through RLS, so a row only comes
// back when the caller owns the file or it was shared with them; adminClient (inside
// signDriveFileUrl) only signs afterwards.
export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const viewer = await getDriveViewer();
    if (isResponse(viewer)) return viewer;
    const { fileId } = await params;
    if (!z.string().uuid().safeParse(fileId).success) return json("Invalid file id.", 400);

    const { data: file } = await viewer.supabase.from("drive_files").select("file_path, file_name").eq("id", fileId).maybeSingle();
    if (!file) return json("You don't have access to this file. Ask the owner to share it with you.", 404);

    const download = new URL(request.url).searchParams.get("download") === "1";
    const url = await signDriveFileUrl(file.file_path, download ? { download: file.file_name } : undefined);
    if (!url) return json("Couldn't prepare the file — try again.", 500);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("GET /api/drive/files/[fileId]/url unexpected error:", err);
    return json("Internal server error", 500);
  }
}
