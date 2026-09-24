import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeWikiTags } from "@/lib/wiki/tags";
import type { WikiPageSummary, WikiProduct, WikiStatus } from "@/types/wiki";

// Task 395 — Wiki page tree (list) + page creation. Permission is enforced entirely by RLS
// (migration 149) — this route never uses `adminClient`, matching the Project Notes routes'
// "never bypass RLS for regular reads" convention.

type WikiPageRow = {
  id: string;
  product: WikiProduct;
  parent_id: string | null;
  title: string;
  status: WikiStatus;
  sort_order: number;
  version: number;
  updated_at: string;
  tags: string[];
};

function toSummary(row: WikiPageRow): WikiPageSummary {
  return {
    id: row.id,
    product: row.product,
    parentId: row.parent_id,
    title: row.title,
    status: row.status,
    sortOrder: row.sort_order,
    version: row.version,
    updatedAt: row.updated_at,
    tags: row.tags,
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("wiki_pages")
      .select("id, product, parent_id, title, status, sort_order, version, updated_at, tags")
      .order("product", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("GET /api/wiki/pages error:", error);
      return NextResponse.json({ error: "Failed to fetch wiki pages" }, { status: 500 });
    }

    return NextResponse.json((data ?? []).map(toSummary));
  } catch (err) {
    console.error("GET /api/wiki/pages unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const { product, title, parentId, contentHtml, tags } = (body ?? {}) as {
      product?: WikiProduct;
      title?: string;
      parentId?: string | null;
      contentHtml?: string;
      tags?: unknown;
    };

    if (!product || !title?.trim()) {
      return NextResponse.json({ error: "product and title are required" }, { status: 400 });
    }

    // Task 396 — Import passes real content_html (already converted + sanitized client-side,
    // or escaped-paragraph HTML from the server-side PDF route); every other caller omits it
    // and gets the original empty-page behavior.
    const initialContentHtml = contentHtml ?? "";

    const { data: page, error } = await supabase
      .from("wiki_pages")
      .insert({
        product,
        parent_id: parentId ?? null,
        title: title.trim(),
        content_html: initialContentHtml,
        // Task 401 — New Page modal sends tags; Import omits them and gets `[]`.
        tags: normalizeWikiTags(tags),
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id, product, parent_id, title, status, sort_order, version, updated_at, tags")
      .single();

    if (error || !page) {
      console.error("POST /api/wiki/pages error:", error);
      return NextResponse.json({ error: "Failed to create page" }, { status: 500 });
    }

    // Seed version 1 so the new page immediately has a contributor/version history —
    // mirrors the row the first real edit would otherwise create.
    const { error: versionError } = await supabase.from("wiki_page_versions").insert({
      page_id: page.id,
      version: 1,
      title: page.title,
      content_html: initialContentHtml,
      edited_by: user.id,
    });
    if (versionError) {
      console.error("POST /api/wiki/pages version-seed error:", versionError);
    }

    return NextResponse.json(toSummary(page), { status: 201 });
  } catch (err) {
    console.error("POST /api/wiki/pages unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
