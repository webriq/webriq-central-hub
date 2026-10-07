import { NextResponse } from "next/server";
import { getDriveViewer, isResponse, json } from "@/lib/drive/access";
import { adminClient } from "@/lib/supabase/admin";
import { DRIVE_STAFF_ROLES } from "@/lib/drive/constants";
import { getInactiveHubUserIds } from "@/lib/users/status";
import type { DrivePerson } from "@/lib/drive/types";

// Names for the share picker and the "Shared by" labels. adminClient: profiles RLS only lets some
// roles read other people's rows, but every staff member with a Drive needs to name collaborators.
// The caller has already passed getDriveViewer()'s staff gate, and only id/full_name/role/avatar_url (+ an
// inactive flag) of other staff come back (clients and every other column stay out) — the same narrow shape as
// /api/staff-directory, minus its admin/pm-only gate.
export async function GET() {
  try {
    const viewer = await getDriveViewer();
    if (isResponse(viewer)) return viewer;

    const [{ data, error }, inactiveIds] = await Promise.all([
      adminClient
        .from("profiles")
        .select("id, full_name, role, avatar_url")
        .in("role", [...DRIVE_STAFF_ROLES])
        .order("full_name", { ascending: true }),
      getInactiveHubUserIds(),
    ]);
    if (error) return json("Couldn't load people.", 500);
    // Deactivated users are flagged, not dropped: the picker hides them, but names still resolve for
    // existing shares and "Shared by …" labels.
    const people: DrivePerson[] = (data ?? []).map((p) => ({ ...p, inactive: inactiveIds.has(p.id) }));
    return NextResponse.json(people);
  } catch (err) {
    console.error("GET /api/drive/people unexpected error:", err);
    return json("Internal server error", 500);
  }
}
