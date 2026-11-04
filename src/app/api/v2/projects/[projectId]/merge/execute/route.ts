import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin"; // writes only, after the role check below — task 468 documented exception
import { authorizeMerge } from "@/lib/projects/merge/auth";
import { executeMerge } from "@/lib/projects/merge/execute";
import { ndjsonResponse } from "@/lib/projects/merge/stream";
import type { Db } from "@/lib/projects/merge/load";
import type { Decisions, Resolution } from "@/lib/projects/merge/types";

export const maxDuration = 300;

const RESOLUTIONS: Resolution[] = ["move", "merge", "keep-both", "skip"];

// POST /api/v2/projects/[projectId]/merge/execute  { targetId, decisions, mergeId? } — streamed NDJSON (task 468)
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await authorizeMerge((await params).projectId);
  if (!auth.ok) return auth.res;
  const body = await req.json().catch(() => ({}));
  const targetId = typeof body.targetId === "string" ? body.targetId : "";
  if (!targetId || targetId === auth.sourceId) return NextResponse.json({ error: "Choose a different target project" }, { status: 400 });

  const decisions: Decisions = {};
  for (const [k, v] of Object.entries((body.decisions ?? {}) as Record<string, unknown>)) {
    if (RESOLUTIONS.includes(v as Resolution)) decisions[k] = v as Resolution;
  }

  return ndjsonResponse((emit) =>
    executeMerge({
      session: auth.db, admin: adminClient as unknown as Db, sourceId: auth.sourceId, targetId, decisions,
      userId: auth.userId, role: auth.role, mergeId: typeof body.mergeId === "string" ? body.mergeId : null, emit,
    }));
}
