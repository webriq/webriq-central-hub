import { NextRequest, NextResponse } from "next/server";
import { authorizeMerge } from "@/lib/projects/merge/auth";
import { rankSimilarProjects } from "@/lib/projects/merge/similarity";
import { fetchAll } from "@/lib/projects/merge/load";

// GET /api/v2/projects/[projectId]/merge/suggest — every non-deleted project, closest name first (task 468)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await authorizeMerge((await params).projectId);
  if (!auth.ok) return auth.res;
  const { db, sourceId } = auth;

  const rows = await fetchAll<{ id: string; project_id: string | null; name: string; customer_id: string; status: string }>((from, to) =>
    db.from("projects").select("id,project_id,name,customer_id,status").neq("status", "deleted").order("name").range(from, to));
  const source = rows.find((r) => r.id === sourceId);
  if (!source) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  return NextResponse.json({ source: { id: source.id, name: source.name }, candidates: rankSimilarProjects(source, rows.filter((r) => r.id !== sourceId)) });
}
