import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeWikiTags } from "@/lib/wiki/tags";
import type { Database } from "@/types/database";
import { conflictResponse, isRpcError } from "@/lib/wiki/save-errors";
import type { WikiContributor, WikiPageDetail, WikiProduct, WikiStatus } from "@/types/wiki";

type WikiPageUpdate = Database["public"]["Tables"]["wiki_pages"]["Update"];

// Task 395 — single wiki page: full detail (GET) + content/status/tags update (PATCH).
// Permission enforced by RLS (migration 149), same as /api/wiki/pages. Task 402 — content/status
// writes go through the `wiki_save_page` RPC (migration 151): conflict-checked against the
// caller's `baseRevision`, snapshot into the revision log, own draft cleared, one transaction.

const DETAIL_SELECT =
  "id, product, parent_id, title, content_html, status, sort_order, version, revision, tags, created_at, updated_at, " +
  "created_by_profile:profiles!wiki_pages_created_by_fkey(id, full_name), " +
  "updated_by_profile:profiles!wiki_pages_updated_by_fkey(id, full_name)";

type DetailRow = {
  id: string;
  product: WikiProduct;
  parent_id: string | null;
  title: string;
  content_html: string;
  status: WikiStatus;
  sort_order: number;
  version: number;
  revision: number;
  tags: string[];
  created_at: string;
  updated_at: string;
  created_by_profile: { id: string; full_name: string | null } | null;
  updated_by_profile: { id: string; full_name: string | null } | null;
};

function toContributor(profile: { id: string; full_name: string | null } | null): WikiContributor | null {
  if (!profile) return null;
  return { id: profile.id, name: profile.full_name ?? "Unknown" };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pageId } = await params;

    const { data: page, error } = await supabase
      .from("wiki_pages")
      .select(DETAIL_SELECT)
      .eq("id", pageId)
      .maybeSingle<DetailRow>();

    if (error) {
      console.error("GET /api/wiki/pages/[pageId] error:", error);
      return NextResponse.json({ error: "Failed to fetch page" }, { status: 500 });
    }
    if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    const siblingsQuery = supabase
      .from("wiki_pages")
      .select("id, product, parent_id, title, status, sort_order, version, updated_at, tags")
      .eq("product", page.product)
      .neq("id", pageId)
      .order("sort_order", { ascending: true })
      .limit(6);

    const [{ data: versionRows }, { data: siblingRows }, { data: myDraftRow }, { data: holderRows }] = await Promise.all([
      supabase
        .from("wiki_page_versions")
        .select("edited_by, created_at, editor:profiles(id, full_name)")
        .eq("page_id", pageId)
        .order("created_at", { ascending: false }),
      page.parent_id === null
        ? siblingsQuery.is("parent_id", null)
        : siblingsQuery.eq("parent_id", page.parent_id),
      supabase
        .from("wiki_page_drafts")
        .select("base_revision, updated_at")
        .eq("page_id", pageId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.rpc("wiki_page_draft_holders", { p_page_id: pageId }),
    ]);

    const seen = new Set<string>();
    const contributors: WikiContributor[] = [];
    for (const row of versionRows ?? []) {
      const editor = row.editor;
      if (!editor || seen.has(editor.id)) continue;
      seen.add(editor.id);
      contributors.push({ id: editor.id, name: editor.full_name ?? "Unknown" });
    }

    const detail: WikiPageDetail = {
      id: page.id,
      product: page.product,
      parentId: page.parent_id,
      title: page.title,
      status: page.status,
      sortOrder: page.sort_order,
      updatedAt: page.updated_at,
      contentHtml: page.content_html,
      version: page.version,
      revision: page.revision,
      tags: page.tags,
      createdAt: page.created_at,
      createdBy: toContributor(page.created_by_profile),
      updatedBy: toContributor(page.updated_by_profile),
      contributors,
      myDraft: myDraftRow ? { baseRevision: myDraftRow.base_revision, updatedAt: myDraftRow.updated_at } : null,
      draftHolders: (holderRows ?? []).map((h) => ({
        id: h.user_id,
        name: h.full_name ?? h.email ?? "Unknown",
        email: h.email,
        updatedAt: h.updated_at,
        baseRevision: h.base_revision,
      })),
      relatedPages: (siblingRows ?? []).map((row) => ({
        id: row.id,
        product: row.product,
        parentId: row.parent_id,
        title: row.title,
        status: row.status,
        sortOrder: row.sort_order,
        version: row.version,
        updatedAt: row.updated_at,
        tags: row.tags,
      })),
    };

    return NextResponse.json(detail);
  } catch (err) {
    console.error("GET /api/wiki/pages/[pageId] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pageId } = await params;
    const body = await request.json().catch(() => null);
    const { title, contentHtml, status, tags, parentId, baseRevision } = (body ?? {}) as {
      title?: string;
      contentHtml?: string;
      status?: WikiStatus;
      tags?: unknown;
      parentId?: string | null;
      baseRevision?: unknown;
    };

    const isContentWrite =
      title !== undefined || contentHtml !== undefined || status !== undefined || tags !== undefined;

    // Structural-only move (no caller today) — not a content change, so no revision/conflict check.
    if (!isContentWrite) {
      if (parentId === undefined) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
      const update: WikiPageUpdate = { parent_id: parentId, updated_by: user.id };
      const { error } = await supabase.from("wiki_pages").update(update).eq("id", pageId);
      if (error) {
        console.error("PATCH /api/wiki/pages/[pageId] move error:", error);
        return NextResponse.json({ error: "Failed to update page" }, { status: 500 });
      }
      return NextResponse.json({ id: pageId });
    }

    if (typeof baseRevision !== "number" || !Number.isInteger(baseRevision)) {
      return NextResponse.json({ error: "baseRevision is required" }, { status: 400 });
    }

    // Task 399's publish-only version bump now lives in the RPC (old status read inside the
    // same UPDATE). A transition into "published" is logged as a `publish` revision; anything
    // else (content save, draft/archive status change) as a `save`.
    const { data: current } = await supabase
      .from("wiki_pages")
      .select("status")
      .eq("id", pageId)
      .maybeSingle();
    const isPublishing = status === "published" && current?.status !== "published";

    // `wiki_save_page` returns a single composite (not `setof`), so PostgREST responds with one
    // object — no `.single()` needed.
    const { data: saved, error: saveError } = await supabase.rpc("wiki_save_page", {
      p_page_id: pageId,
      p_base_revision: baseRevision,
      p_title: title !== undefined ? title.trim() : null,
      p_content_html: contentHtml ?? null,
      p_tags: tags !== undefined ? normalizeWikiTags(tags) : null,
      p_status: status ?? null,
      p_kind: isPublishing ? "publish" : "save",
    });

    if (saveError || !saved) {
      if (isRpcError(saveError, "P0409")) return conflictResponse(supabase, pageId);
      if (isRpcError(saveError, "P0404")) return NextResponse.json({ error: "Page not found" }, { status: 404 });
      if (isRpcError(saveError, "42501")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      console.error("PATCH /api/wiki/pages/[pageId] save error:", saveError);
      return NextResponse.json({ error: "Failed to update page" }, { status: 500 });
    }

    return NextResponse.json({ id: saved.id, version: saved.version, revision: saved.revision });
  } catch (err) {
    console.error("PATCH /api/wiki/pages/[pageId] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Task 399 — delete a page. Permission is RLS-only (wiki_pages_staff_write covers `for all`),
// matching this route's existing GET/PATCH convention. Child pages and wiki_page_versions rows
// cascade via their `on delete cascade` FKs (migration 149) — no manual cleanup needed.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pageId } = await params;

    const { error } = await supabase.from("wiki_pages").delete().eq("id", pageId);

    if (error) {
      console.error("DELETE /api/wiki/pages/[pageId] error:", error);
      return NextResponse.json({ error: "Failed to delete page" }, { status: 500 });
    }

    return NextResponse.json({ id: pageId });
  } catch (err) {
    console.error("DELETE /api/wiki/pages/[pageId] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
