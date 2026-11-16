import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSettingsViewer, MIGRATION_MISSING } from "@/lib/test-data";

// Suggestions per search; selected items are dropped client-side, so fetch a few extra.
export const SUGGESTION_LIMIT = 15;

// Task 476 — Settings access. `admins`: Test Users field. `adminsOrTestUsers`: Test Companies / Test Projects fields.
// Settings reads flagged rows with adminClient after this gate: RLS hides test rows from admins,
// and admins manage the flags here (documented adminClient read exception).
// Returns an error response, or null when the caller may proceed.
export async function settingsGate(who: "admins" | "adminsOrTestUsers"): Promise<NextResponse | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const viewer = await getSettingsViewer(user.id);
  const allowed = who === "admins" ? viewer.isAdmin : viewer.isAdmin || viewer.isTestUser;
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!viewer.migrated) return NextResponse.json({ error: MIGRATION_MISSING }, { status: 503 });
  return null;
}

// `{ add: string[], remove: string[] }`, each capped at 200 ids; null if the shape is wrong.
export function parseIdLists(body: unknown): { add: string[]; remove: string[] } | null {
  const b = body as { add?: unknown; remove?: unknown } | null;
  const ok = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 200 && v.every((x) => typeof x === "string" && x.length > 0);
  if (!b || !ok(b.add ?? []) || !ok(b.remove ?? [])) return null;
  return { add: [...new Set((b.add ?? []) as string[])], remove: [...new Set((b.remove ?? []) as string[])] };
}
