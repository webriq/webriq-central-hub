// Admin-only export: fetches the Zoho Desk Knowledge Base (articles + root categories),
// returns desk-kb.json for download. Shape: { articles: [...], categories: [...] }.
// Requires the Desk.articles.READ OAuth scope (Desk.settings.READ too for categories) —
// neither is granted by default, see env.example. List Articles omits the HTML `answer`
// body, so every article gets a per-article Get Article enrichment pass.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";
import { fetchAllDeskPages, enrichArticlesWithBody } from "@/lib/zoho/desk";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  if (!process.env.ZOHO_DESK_ORG_ID) {
    return NextResponse.json({ error: "ZOHO_DESK_ORG_ID not configured" }, { status: 500 });
  }

  // Articles. A bare List Articles returns Published only; the `status` filter pulls the
  // other states (Draft / Review / Unpublished / Expired). Zoho's exact accepted values for
  // this portal aren't guaranteed, so each status is fetched independently: a per-status 422
  // (unknown value / param) is logged and skipped, and if nothing at all works we fall back
  // to a bare list so the export still succeeds with the published set. `/articles` caps
  // `limit` at 50. Results are merged by article id.
  const STATUSES = ["Published", "Draft", "Review", "Unpublished", "Expired"];
  const stubsById = new Map<string, Record<string, unknown>>();
  let currentToken = token;
  let anyStatusFetched = false;

  for (const status of STATUSES) {
    try {
      const { items, token: next } = await fetchAllDeskPages(
        "/articles",
        currentToken,
        `zoho-export/desk-kb:${status}`,
        { params: { status }, perPage: 50 }
      );
      currentToken = next;
      for (const a of items) {
        const id = String(a.id ?? "");
        if (id) stubsById.set(id, a);
      }
      anyStatusFetched = true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("403")) {
        return NextResponse.json(
          { error: `${message} — likely missing the Desk.articles.READ OAuth scope on your Zoho API client (see env.example)` },
          { status: 502 }
        );
      }
      console.log(`[zoho-export/desk-kb] status="${status}" skipped: ${message}`);
    }
  }

  if (!anyStatusFetched) {
    try {
      const { items, token: next } = await fetchAllDeskPages(
        "/articles",
        currentToken,
        "zoho-export/desk-kb",
        { perPage: 50 }
      );
      currentToken = next;
      for (const a of items) {
        const id = String(a.id ?? "");
        if (id) stubsById.set(id, a);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const scopeHint = message.includes("403")
        ? " — likely missing the Desk.articles.READ OAuth scope on your Zoho API client (see env.example)"
        : "";
      return NextResponse.json({ error: `${message}${scopeHint}` }, { status: 502 });
    }
  }

  const stubs = [...stubsById.values()];
  console.log(`[zoho-export/desk-kb] ${stubs.length} article stub(s) across statuses (anyStatusFetched=${anyStatusFetched})`);

  const { enriched: articles, token: afterEnrichToken, failedArticleIds } =
    await enrichArticlesWithBody(stubs, currentToken, "zoho-export/desk-kb");
  currentToken = afterEnrichToken;
  if (failedArticleIds.length > 0) {
    console.log(`[zoho-export/desk-kb] ${failedArticleIds.length} article(s) failed body enrichment:`, failedArticleIds.join(", "));
  }

  // Root categories — best-effort: a missing Desk.settings.READ scope degrades to [] rather
  // than failing the whole export (the article rows already carry category name+id inline).
  let categories: Record<string, unknown>[] = [];
  try {
    const { items } = await fetchAllDeskPages("/kbRootCategories", currentToken, "zoho-export/desk-kb-categories", { perPage: 50 });
    categories = items;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.log(`[zoho-export/desk-kb] categories skipped (${message}) — likely missing Desk.settings.READ`);
  }

  return new NextResponse(JSON.stringify({ articles, categories }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="desk-kb.json"',
    },
  });
}
