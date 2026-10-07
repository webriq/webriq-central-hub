import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDriveStaffRole } from "./constants";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;
export type DriveViewer = { supabase: ServerSupabase; userId: string; role: string };

// Auth + staff-role gate shared by every /api/drive route. `client` (and anything else outside
// DRIVE_STAFF_ROLES) gets 403; RLS (drive_is_staff()) is the second, independent line of defense.
export async function getDriveViewer(): Promise<DriveViewer | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (profile?.role as string | null) ?? null;
  if (!isDriveStaffRole(role)) return NextResponse.json({ error: "Drive isn't available for your account." }, { status: 403 });
  return { supabase, userId: user.id, role };
}

export const isResponse = (v: DriveViewer | NextResponse): v is NextResponse => v instanceof NextResponse;

// Level the caller holds on a folder (3 owner · 2 edit · 1 view · 0 none) via the same SQL
// function the RLS policies use, so the route and the database can't disagree.
export async function folderLevel(viewer: DriveViewer, folderId: string): Promise<number> {
  const { data } = await viewer.supabase.rpc("drive_folder_level", { p_folder_id: folderId });
  return typeof data === "number" ? data : 0;
}

export async function fileLevel(viewer: DriveViewer, fileId: string): Promise<number> {
  const { data } = await viewer.supabase.rpc("drive_file_level", { p_file_id: fileId });
  return typeof data === "number" ? data : 0;
}

export const json = (error: string, status: number) => NextResponse.json({ error }, { status });

// Postgres unique-violation / RLS / trigger codes the routes translate into plain messages.
export const isUniqueViolation = (e: { code?: string } | null) => e?.code === "23505";
export const isForbidden = (e: { code?: string } | null) => e?.code === "42501";
