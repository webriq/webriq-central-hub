import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeWikiTags } from "@/lib/wiki/tags";
import type { WikiDraftContent } from "@/types/wiki";

// Task 402 — the caller's OWN autosaved draft for a page (GET / PUT upsert / DELETE). RLS on
// wiki_page_drafts (migration 151) is owner-only, so there is no way to reach another user's
// draft content through this route; other users only ever see draft *holders* via the
// `wiki_page_draft_holders()` definer fn in the page GET.

const MAX_CONTENT_CHARS = 2_000_000;

async function getUserAndPage(params: Promise<{ pageId: string }>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { pageId } = await params;
  return { supabase, user, pageId };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  try {
    const { supabase, user, pageId } = await getUserAndPage(params);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("wiki_page_drafts")
      .select("title, content_html, tags, base_revision, updated_at")
      .eq("page_id", pageId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("GET /api/wiki/pages/[pageId]/draft error:", error);
      return NextResponse.json({ error: "Failed to fetch draft" }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No draft" }, { status: 404 });

    const draft: WikiDraftContent = {
      title: data.title,
      contentHtml: data.content_html,
      tags: data.tags,
      baseRevision: data.base_revision,
      updatedAt: data.updated_at,
    };
    return NextResponse.json(draft);
  } catch (err) {
    console.error("GET /api/wiki/pages/[pageId]/draft unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  try {
    const { supabase, user, pageId } = await getUserAndPage(params);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const { title, contentHtml, tags, baseRevision } = (body ?? {}) as {
      title?: unknown;
      contentHtml?: unknown;
      tags?: unknown;
      baseRevision?: unknown;
    };

    if (typeof title !== "string" || typeof contentHtml !== "string") {
      return NextResponse.json({ error: "title and contentHtml are required" }, { status: 400 });
    }
    if (typeof baseRevision !== "number" || !Number.isInteger(baseRevision)) {
      return NextResponse.json({ error: "baseRevision is required" }, { status: 400 });
    }
    if (contentHtml.length > MAX_CONTENT_CHARS) {
      return NextResponse.json({ error: "Draft too large" }, { status: 413 });
    }

    const { data, error } = await supabase
      .from("wiki_page_drafts")
      .upsert(
        {
          page_id: pageId,
          user_id: user.id,
          title,
          content_html: contentHtml,
          tags: normalizeWikiTags(tags),
          base_revision: baseRevision,
        },
        { onConflict: "page_id,user_id" }
      )
      .select("updated_at")
      .single();

    if (error || !data) {
      console.error("PUT /api/wiki/pages/[pageId]/draft error:", error);
      return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
    }
    return NextResponse.json({ updatedAt: data.updated_at });
  } catch (err) {
    console.error("PUT /api/wiki/pages/[pageId]/draft unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  try {
    const { supabase, user, pageId } = await getUserAndPage(params);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { error } = await supabase
      .from("wiki_page_drafts")
      .delete()
      .eq("page_id", pageId)
      .eq("user_id", user.id);

    if (error) {
      console.error("DELETE /api/wiki/pages/[pageId]/draft error:", error);
      return NextResponse.json({ error: "Failed to discard draft" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/wiki/pages/[pageId]/draft unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
