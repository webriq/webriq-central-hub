import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { conflictResponse, isRpcError } from "@/lib/wiki/save-errors";

// Task 402 — restore a revision's title/content/tags as a NEW `restore` revision (via the
// `wiki_restore_revision` RPC, migration 151), so a restore is itself undoable. Same
// conflict contract as PATCH /api/wiki/pages/[pageId]: stale `baseRevision` → 409.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string; revisionId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pageId, revisionId } = await params;
    const body = await request.json().catch(() => null);
    const baseRevision = (body as { baseRevision?: unknown } | null)?.baseRevision;
    if (typeof baseRevision !== "number" || !Number.isInteger(baseRevision)) {
      return NextResponse.json({ error: "baseRevision is required" }, { status: 400 });
    }

    const { data: saved, error } = await supabase.rpc("wiki_restore_revision", {
      p_page_id: pageId,
      p_revision_id: revisionId,
      p_base_revision: baseRevision,
    });

    if (error || !saved) {
      if (isRpcError(error, "P0409")) return conflictResponse(supabase, pageId);
      if (isRpcError(error, "P0404")) return NextResponse.json({ error: "Revision not found" }, { status: 404 });
      if (isRpcError(error, "42501")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      console.error("POST /api/wiki/pages/[pageId]/revisions/[revisionId]/restore error:", error);
      return NextResponse.json({ error: "Failed to restore revision" }, { status: 500 });
    }

    return NextResponse.json({ id: saved.id, version: saved.version, revision: saved.revision });
  } catch (err) {
    console.error("POST /api/wiki/pages/[pageId]/revisions/[revisionId]/restore unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
