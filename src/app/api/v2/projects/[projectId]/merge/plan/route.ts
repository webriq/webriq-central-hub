import { NextRequest, NextResponse } from "next/server";
import { applyRoleRules, authorizeMerge, resolveProjectId } from "@/lib/projects/merge/auth";
import { loadProject } from "@/lib/projects/merge/load";
import { buildPlan } from "@/lib/projects/merge/plan";
import { ndjsonResponse } from "@/lib/projects/merge/stream";
import type { Decisions, MergePlan } from "@/lib/projects/merge/types";

export const maxDuration = 120;

// POST /api/v2/projects/[projectId]/merge/plan  { targetId } — read-only scan, streamed as NDJSON (task 468)
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await authorizeMerge((await params).projectId);
  if (!auth.ok) return auth.res;
  const { db, sourceId, role } = auth;
  const body = await req.json().catch(() => ({}));
  const targetId = typeof body.targetId === "string" ? body.targetId : "";
  if (!targetId || targetId === sourceId) return NextResponse.json({ error: "Choose a different target project" }, { status: 400 });

  return ndjsonResponse(async (emit) => {
    emit({ type: "note", text: "Reading both projects…" });
    if (!(await resolveProjectId(db, targetId))) return emit({ type: "error", message: "Target project not found or deleted." });
    const [src, tgt] = await Promise.all([loadProject(db, sourceId), loadProject(db, targetId)]);
    if (!src || !tgt) return emit({ type: "error", message: "Target project not found." });
    emit({ type: "note", text: `Comparing ${src.tasks.length} tasks, ${src.files.length} files and ${src.logs.length} time logs against ${tgt.name}…` });
    const plan: MergePlan = applyRoleRules(buildPlan(src, tgt), role);

    // an unfinished earlier run for this pair can be resumed (table may not exist yet → ignore)
    const { data: prev } = await db.from("project_merges").select("id,decisions").eq("source_project_id", sourceId).eq("target_project_id", targetId).neq("status", "succeeded").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (prev) plan.resumable = { mergeId: prev.id as string, decisions: prev.decisions as Decisions };
    emit({ type: "plan", plan });
  });
}
