import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { WikiRevisionDetail, WikiRevisionSnapshot } from "@/types/wiki";

// Task 402 — one revision's full content plus its immediate predecessor (the default "vs
// previous" diff baseline), so the history view needs a single request per selection.

const SNAPSHOT_SELECT = "id, revision, title, content_html, tags, created_at";

type SnapshotRow = {
  id: string;
  revision: number | null;
  title: string;
  content_html: string;
  tags: string[];
  created_at: string;
};

function toSnapshot(row: SnapshotRow): WikiRevisionSnapshot {
  return {
    id: row.id,
    revision: row.revision,
    title: row.title,
    contentHtml: row.content_html,
    tags: row.tags,
    createdAt: row.created_at,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ pageId: string; revisionId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pageId, revisionId } = await params;

    const { data: row, error } = await supabase
      .from("wiki_page_versions")
      .select(SNAPSHOT_SELECT)
      .eq("id", revisionId)
      .eq("page_id", pageId)
      .maybeSingle<SnapshotRow>();

    if (error) {
      console.error("GET /api/wiki/pages/[pageId]/revisions/[revisionId] error:", error);
      return NextResponse.json({ error: "Failed to fetch revision" }, { status: 500 });
    }
    if (!row) return NextResponse.json({ error: "Revision not found" }, { status: 404 });

    const { data: previousRow } = await supabase
      .from("wiki_page_versions")
      .select(SNAPSHOT_SELECT)
      .eq("page_id", pageId)
      .lt("created_at", row.created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<SnapshotRow>();

    const detail: WikiRevisionDetail = {
      revision: toSnapshot(row),
      previous: previousRow ? toSnapshot(previousRow) : null,
    };
    return NextResponse.json(detail);
  } catch (err) {
    console.error("GET /api/wiki/pages/[pageId]/revisions/[revisionId] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
