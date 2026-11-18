import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Task 482 — saves the caller's own UI preferences (RLS: own row only). Missing table
// (migration 182 not applied) is a silent no-op so the listing keeps working.
// Task 487 — also `tasks_density` (migration 184); a missing column is the same silent no-op.
const MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204"]);
const ALLOWED: Record<string, readonly string[]> = {
  projects_view: ["list", "grid"],
  tasks_density: ["comfortable", "compact"],
};

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const prefs: Record<string, string> = {};
  for (const [key, values] of Object.entries(ALLOWED)) {
    if (body?.[key] === undefined) continue;
    if (!values.includes(body[key])) {
      return NextResponse.json({ error: `${key} must be ${values.map((v) => `'${v}'`).join(" or ")}` }, { status: 400 });
    }
    prefs[key] = body[key];
  }
  if (Object.keys(prefs).length === 0) {
    return NextResponse.json({ error: "Send projects_view or tasks_density" }, { status: 400 });
  }

  // user_preferences isn't in the generated Database types until `supabase gen types` re-runs.
  // Upsert writes only the keys sent, so saving one preference never resets another.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("user_preferences")
    .upsert(
      { user_id: data.claims.sub as string, ...prefs, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error && !MISSING.has(error.code)) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
