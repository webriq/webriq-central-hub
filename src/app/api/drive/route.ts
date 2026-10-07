import { NextRequest, NextResponse } from "next/server";
import { getDriveViewer, isResponse, json } from "@/lib/drive/access";
import { loadMyShares, loadVisibleDrive } from "@/lib/drive/load";
import { annotateDrive } from "@/lib/drive/levels";
import type { DrivePayload, DriveView } from "@/lib/drive/types";

// Task 436 — everything the caller can see for one Drive section. Reads go through the session
// client, so RLS (drive_folder_level/drive_file_level) decides visibility; annotateDrive() only
// works out what they may DO with each row.
export async function GET(request: NextRequest) {
  try {
    const viewer = await getDriveViewer();
    if (isResponse(viewer)) return viewer;

    const param = new URL(request.url).searchParams.get("view");
    const view: DriveView = param === "shared" ? "shared" : "mine";

    const [visible, shares] = await Promise.all([loadVisibleDrive(viewer), loadMyShares(viewer)]);
    if (!visible || !shares) return json("Couldn't load your files — try again.", 500);

    const { folders, files } = annotateDrive({ ...visible, shares, userId: viewer.userId, role: viewer.role, view });
    const payload: DrivePayload = { folders, files, me: { id: viewer.userId, role: viewer.role } };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("GET /api/drive unexpected error:", err);
    return json("Internal server error", 500);
  }
}
