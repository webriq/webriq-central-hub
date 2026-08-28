// dev-only import endpoint — reads _from_zoho/desk-kb.json (a { articles, categories }
// object, not an array), upserts the articles into the `kb_articles` table (migration 126 /
// task 336). KB articles are global content — no customer matching. The import body lives in
// importDeskKb() (mirrors the desk-accounts helper split).
import { NextResponse } from "next/server";
import { readFromZohoObject } from "@/lib/migrate/zoho-import";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { importDeskKb, DeskKbFile } from "@/lib/migrate/desk-kb-import";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let file: DeskKbFile;
  try {
    file = readFromZohoObject<DeskKbFile>("desk-kb.json");
  } catch {
    return NextResponse.json(
      { error: "Could not read _from_zoho/desk-kb.json — run the Desk Knowledge Base export first" },
      { status: 400 }
    );
  }

  if (!file.articles || file.articles.length === 0) {
    return NextResponse.json({ error: "No articles found in desk-kb.json" }, { status: 400 });
  }

  const result = await importDeskKb(file);
  return NextResponse.json(result);
}
