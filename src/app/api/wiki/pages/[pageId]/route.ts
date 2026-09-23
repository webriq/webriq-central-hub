import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { WikiContributor, WikiPageDetail, WikiProduct, WikiStatus } from "@/types/wiki";

type WikiPageUpdate = Database["public"]["Tables"]["wiki_pages"]["Update"];

// Task 395 — single wiki page: full detail (GET) + content/status/tags update (PATCH).
// Permission enforced by RLS (migration 149), same as /api/wiki/pages.

const DETAIL_SELECT =
  "id, product, parent_id, title, content_html, status, sort_order, version, tags, created_at, updated_at, " +
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
      .select("id, product, parent_id, title, status, sort_order, version, updated_at")
      .eq("product", page.product)
      .neq("id", pageId)
      .order("sort_order", { ascending: true })
      .limit(6);

    const [{ data: versionRows }, { data: siblingRows }] = await Promise.all([
      supabase
        .from("wiki_page_versions")
        .select("edited_by, created_at, editor:profiles(id, full_name)")
        .eq("page_id", pageId)
        .order("created_at", { ascending: false }),
      page.parent_id === null
        ? siblingsQuery.is("parent_id", null)
        : siblingsQuery.eq("parent_id", page.parent_id),
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
      tags: page.tags,
      createdAt: page.created_at,
      createdBy: toContributor(page.created_by_profile),
      updatedBy: toContributor(page.updated_by_profile),
      contributors,
      relatedPages: (siblingRows ?? []).map((row) => ({
        id: row.id,
        product: row.product,
        parentId: row.parent_id,
        title: row.title,
        status: row.status,
        sortOrder: row.sort_order,
        version: row.version,
        updatedAt: row.updated_at,
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
    const { title, contentHtml, status, tags, parentId } = (body ?? {}) as {
      title?: string;
      contentHtml?: string;
      status?: WikiStatus;
      tags?: string[];
      parentId?: string | null;
    };

    const { data: current, error: currentError } = await supabase
      .from("wiki_pages")
      .select("id, title, content_html, status, version")
      .eq("id", pageId)
      .maybeSingle();

    if (currentError) {
      console.error("PATCH /api/wiki/pages/[pageId] lookup error:", currentError);
      return NextResponse.json({ error: "Failed to load page" }, { status: 500 });
    }
    if (!current) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    // Task 399 — version now auto-increments on publish only (matches the mockup's own
    // "Page metadata" wording), not on every content-changing save. A content-only save
    // (title/body/tags) updates those columns with no version bump and no history row; only
    // a transition into "published" logs a new version, snapshotting whatever content is on
    // the row at that moment.
    const isPublishing = status === "published" && current.status !== "published";
    const nextVersion = isPublishing ? current.version + 1 : current.version;

    const update: WikiPageUpdate = { updated_by: user.id };
    if (title !== undefined) update.title = title.trim();
    if (contentHtml !== undefined) update.content_html = contentHtml;
    if (status !== undefined) update.status = status;
    if (tags !== undefined) update.tags = tags;
    if (parentId !== undefined) update.parent_id = parentId;
    if (isPublishing) update.version = nextVersion;

    // Minimal select — the only caller (WikiShell) checks `res.ok` and always re-fetches the
    // full detail via GET afterwards (contributors/related pages need a fresh query anyway
    // once a new version row exists), so there's no reason to pay for the DETAIL_SELECT
    // profile joins here.
    const { data: updated, error: updateError } = await supabase
      .from("wiki_pages")
      .update(update)
      .eq("id", pageId)
      .select("id, title, content_html, version")
      .single();

    if (updateError || !updated) {
      console.error("PATCH /api/wiki/pages/[pageId] update error:", updateError);
      return NextResponse.json({ error: "Failed to update page" }, { status: 500 });
    }

    if (isPublishing) {
      const { error: versionError } = await supabase.from("wiki_page_versions").insert({
        page_id: pageId,
        version: nextVersion,
        title: updated.title,
        content_html: updated.content_html,
        edited_by: user.id,
      });
      if (versionError) {
        console.error("PATCH /api/wiki/pages/[pageId] version-insert error:", versionError);
      }
    }

    return NextResponse.json({ id: updated.id, version: updated.version });
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
