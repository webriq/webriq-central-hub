import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireNotSuperAdminTarget } from "@/lib/users/admin-guard";
import { reactivateUser } from "@/lib/users/deactivate";

// Task 378 — lifts a deactivation: unban at the GoTrue layer, flag hub_users.status active.
//
// Project/phase memberships are deliberately NOT restored — deactivation deleted those rows
// and nothing records what they were. The confirmation dialog warns about this up front.
//
// No self-target block here: a deactivated caller can't hold a session to make this request in
// the first place, so there is nothing to guard against, and self-reactivation is harmless.

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const superAdminBlock = await requireNotSuperAdminTarget(guard.callerRole, userId);
  if (superAdminBlock) return superAdminBlock;

  try {
    const result = await reactivateUser(userId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Failed to reactivate user." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/v2/users/[userId]/reactivate failed:", err);
    return NextResponse.json({ error: "Failed to reactivate user." }, { status: 500 });
  }
}
