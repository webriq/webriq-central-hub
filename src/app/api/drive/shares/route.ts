import { NextRequest, NextResponse } from "next/server";
import { getDriveViewer, isResponse, json } from "@/lib/drive/access";
import { createShareSchema, listSharesSchema } from "@/lib/drive/schemas";
import { scheduleDriveShareNotice } from "@/lib/drive/notify-share";

// Share management is owner-only. RLS (drive_shares_*) enforces it; the explicit owner check here
// gives a readable 403 instead of an empty result.
async function ownsTarget(viewer: Exclude<Awaited<ReturnType<typeof getDriveViewer>>, Response>, t: { folderId?: string; fileId?: string }) {
  const table = t.folderId ? "drive_folders" : "drive_files";
  const { data } = await viewer.supabase.from(table).select("owner_id").eq("id", (t.folderId ?? t.fileId)!).maybeSingle();
  return data?.owner_id === viewer.userId;
}

export async function GET(request: NextRequest) {
  try {
    const viewer = await getDriveViewer();
    if (isResponse(viewer)) return viewer;
    const sp = new URL(request.url).searchParams;
    const parsed = listSharesSchema.safeParse({ folderId: sp.get("folderId") ?? undefined, fileId: sp.get("fileId") ?? undefined });
    if (!parsed.success) return json("folderId or fileId is required.", 400);
    if (!(await ownsTarget(viewer, parsed.data))) return json("Only the owner can see who has access.", 403);

    const col = parsed.data.folderId ? "folder_id" : "file_id";
    const { data, error } = await viewer.supabase.from("drive_shares").select("*")
      .eq(col, (parsed.data.folderId ?? parsed.data.fileId)!).order("created_at", { ascending: true });
    if (error) return json("Couldn't load who has access — try again.", 500);
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("GET /api/drive/shares unexpected error:", err);
    return json("Internal server error", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const viewer = await getDriveViewer();
    if (isResponse(viewer)) return viewer;
    const parsed = createShareSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
    const b = parsed.data;
    if (b.userId === viewer.userId) return json("You already own this item.", 400);
    if (!(await ownsTarget(viewer, b))) return json("Only the owner can share this.", 403);

    // Re-sharing with the same person/role just updates the permission (the partial unique
    // indexes make a plain upsert awkward).
    const col = b.folderId ? "folder_id" : "file_id";
    const targetId = (b.folderId ?? b.fileId)!;
    let existing = viewer.supabase.from("drive_shares").select("id, permission").eq(col, targetId);
    existing = b.userId ? existing.eq("user_id", b.userId) : existing.eq("role", b.role!);
    const { data: found } = await existing.maybeSingle();
    const notice = {
      target: { kind: (b.folderId ? "folder" : "file") as "folder" | "file", id: targetId },
      grantee: b.userId ? { userId: b.userId } : { role: b.role! },
      permission: b.permission,
    };
    if (found) {
      const { data, error } = await viewer.supabase.from("drive_shares").update({ permission: b.permission }).eq("id", found.id).select().single();
      if (error || !data) return json("Couldn't update access — try again.", 500);
      // Task 437 — only a view → edit upgrade re-notifies; same permission or a downgrade is silent.
      if (found.permission === "view" && b.permission === "edit") scheduleDriveShareNotice(viewer.userId, { ...notice, isUpgrade: true });
      return NextResponse.json(data);
    }

    const { data, error } = await viewer.supabase.from("drive_shares").insert({
      folder_id: b.folderId ?? null, file_id: b.fileId ?? null, user_id: b.userId ?? null, role: b.role ?? null,
      permission: b.permission, added_by: viewer.userId,
    }).select().single();
    if (error || !data) {
      console.error("POST /api/drive/shares error:", error);
      return json("Couldn't share — try again.", 500);
    }
    scheduleDriveShareNotice(viewer.userId, { ...notice, isUpgrade: false });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("POST /api/drive/shares unexpected error:", err);
    return json("Internal server error", 500);
  }
}
