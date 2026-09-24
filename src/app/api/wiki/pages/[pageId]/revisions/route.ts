import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { WikiRevisionSummary, WikiStatus } from "@/types/wiki";

// Task 402 — a page's revision log (metadata only, newest first). Content is fetched per
// revision via ./[revisionId] so the list stays light. RLS (migration 149) gates reads to staff.

const PAGE = 1000;

type RevisionRow = {
  id: string;
  revision: number | null;
  version: number;
  kind: WikiRevisionSummary["kind"];
  title: string;
  tags: string[];
  status: WikiStatus | null;
  restored_from: string | null;
  created_at: string;
  editor: { id: string; full_name: string | null } | null;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pageId } = await params;

    // Paginated per the 1000-row PostgREST cap convention — a heavily edited page can exceed it.
    const rows: RevisionRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("wiki_page_versions")
        .select("id, revision, version, kind, title, tags, status, restored_from, created_at, editor:profiles(id, full_name)")
        .eq("page_id", pageId)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1)
        .returns<RevisionRow[]>();
      if (error) {
        console.error("GET /api/wiki/pages/[pageId]/revisions error:", error);
        return NextResponse.json({ error: "Failed to fetch revisions" }, { status: 500 });
      }
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }

    const revisionById = new Map(rows.map((r) => [r.id, r.revision]));
    const revisions: WikiRevisionSummary[] = rows.map((r) => ({
      id: r.id,
      revision: r.revision,
      version: r.version,
      kind: r.kind,
      title: r.title,
      tags: r.tags,
      status: r.status,
      restoredFrom: r.restored_from,
      restoredFromRevision: r.restored_from ? revisionById.get(r.restored_from) ?? null : null,
      editor: r.editor ? { id: r.editor.id, name: r.editor.full_name ?? "Unknown" } : null,
      createdAt: r.created_at,
    }));

    return NextResponse.json(revisions);
  } catch (err) {
    console.error("GET /api/wiki/pages/[pageId]/revisions unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
