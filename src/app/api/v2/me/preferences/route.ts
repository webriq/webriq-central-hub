import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Task 482 — saves the caller's own UI preferences (RLS: own row only). Missing table
// (migration 182 not applied) is a silent no-op so the listing keeps working.
const MISSING_TABLE = new Set(["42P01", "PGRST205"]);

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const view = body?.projects_view;
  if (view !== "list" && view !== "grid") {
    return NextResponse.json({ error: "projects_view must be 'list' or 'grid'" }, { status: 400 });
  }

  // user_preferences isn't in the generated Database types until `supabase gen types` re-runs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("user_preferences")
    .upsert(
      { user_id: data.claims.sub as string, projects_view: view, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error && !MISSING_TABLE.has(error.code)) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
