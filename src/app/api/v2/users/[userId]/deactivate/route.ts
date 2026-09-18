import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, blockSelfTarget, requireNotSuperAdminTarget } from "@/lib/users/admin-guard";
import { getDeactivationImpact, deactivateUser } from "@/lib/users/deactivate";

// Task 378 — account deactivation.
//   GET  → read-only impact preview, powering the confirmation dialog's counts.
//   POST → perform it (ban → force-logout → drop memberships → flag inactive).
//
// Both are admin/super_admin only, neither may target the caller, and only a Super Admin may
// act on a Super Admin — see admin-guard.ts's three composable checks.

// /simplify pass, round 3: GET and POST both need this exact three-check combination (unlike
// route.ts's PATCH, which only needs requireAdmin, or reactivate's POST, which skips
// blockSelfTarget) — local to this file since no other route needs this specific combination.
async function guardDeactivateTarget(
  userId: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const selfBlock = blockSelfTarget(guard.callerId, userId);
  if (selfBlock) return { ok: false, response: selfBlock };
  const superAdminBlock = await requireNotSuperAdminTarget(guard.callerRole, userId);
  if (superAdminBlock) return { ok: false, response: superAdminBlock };
  return { ok: true };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  const guard = await guardDeactivateTarget(userId);
  if (!guard.ok) return guard.response;

  try {
    return NextResponse.json({ impact: await getDeactivationImpact(userId) });
  } catch (err) {
    console.error("GET /api/v2/users/[userId]/deactivate failed:", err);
    return NextResponse.json({ error: "Failed to check deactivation impact." }, { status: 500 });
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  const guard = await guardDeactivateTarget(userId);
  if (!guard.ok) return guard.response;

  try {
    const result = await deactivateUser(userId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      impact: result.impact,
      sessionsCleared: result.sessionsCleared,
    });
  } catch (err) {
    console.error("POST /api/v2/users/[userId]/deactivate failed:", err);
    return NextResponse.json({ error: "Failed to deactivate user." }, { status: 500 });
  }
}
