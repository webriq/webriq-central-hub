import { NextRequest, NextResponse } from "next/server";
import { applyRoleRules, authorizeMerge } from "@/lib/projects/merge/auth";
import { loadProject } from "@/lib/projects/merge/load";
import { narrate } from "@/lib/projects/merge/narrate";
import { buildPlan } from "@/lib/projects/merge/plan";

export const maxDuration = 30;

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);

// POST /api/v2/projects/[projectId]/merge/narrate  { kind:"review", targetId } | { kind:"summary", summary }
// Facts are rebuilt server-side (review) or validated numbers (summary) — never client prose. Returns { text: string|null }.
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await authorizeMerge((await params).projectId);
  if (!auth.ok) return auth.res;
  const body = await req.json().catch(() => ({}));

  if (body.kind === "summary") {
    const s = body.summary ?? {};
    const facts = `Merge finished. Moved ${n(s.moved)} items, folded ${n(s.merged)} duplicates into existing items, left ${n(s.skipped)} redundant items on the archived source project.`;
    return NextResponse.json({ text: await narrate("summary", facts, auth.sourceId) });
  }

  const targetId = typeof body.targetId === "string" ? body.targetId : "";
  const [src, tgt] = await Promise.all([loadProject(auth.db, auth.sourceId), loadProject(auth.db, targetId)]);
  if (!src || !tgt) return NextResponse.json({ text: null });
  const plan = applyRoleRules(buildPlan(src, tgt), auth.role);
  const facts = [
    `Merging "${plan.sourceName}" into "${plan.targetName}".`,
    `${plan.counts.task.total} tasks (${plan.counts.task.collisions} duplicates), ${plan.counts.file.total} files (${plan.counts.file.collisions} exact duplicates), ${plan.counts.timelog.total} time logs.`,
    ...plan.headsUp.map((h) => h.text),
  ].join("\n");
  return NextResponse.json({ text: await narrate("review", facts, auth.sourceId) });
}
