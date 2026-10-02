import type { createClient } from "@/lib/supabase/server";

// Task 416 — shared by the /projects/v2 and /projects/legacy listing loaders. "recent" (Recently
// accessed, the default) orders by the current user's project_views row, which PostgREST can't
// order a parent by (one-to-many embed), so the loaders fetch every matching row, order it here,
// and slice the requested page themselves.
export const RECENT_SORT = "recent";
export const RECENT_FETCH_PAGE = 1000;

type ViewStat = { lastAccessedAt: string; accessCount: number };

// The caller's own project_views rows (RLS-scoped to them anyway). Paginated per CLAUDE.md's
// 1000-row rule. Any error — notably migration 156 not being applied yet — yields an empty map,
// which makes "recent" degrade to the loader's base order (its "newest").
export async function loadViewStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<Map<string, ViewStat>> {
  const stats = new Map<string, ViewStat>();
  for (let offset = 0; ; offset += RECENT_FETCH_PAGE) {
    const { data, error } = await supabase
      .from("project_views")
      .select("project_id, last_accessed_at, access_count")
      .eq("user_id", userId)
      .order("project_id")
      .range(offset, offset + RECENT_FETCH_PAGE - 1);
    if (error) {
      console.warn(`[projects-list] project_views unavailable, falling back to newest: ${error.message}`);
      return new Map();
    }
    for (const row of data ?? []) {
      stats.set(row.project_id, { lastAccessedAt: row.last_accessed_at, accessCount: row.access_count });
    }
    if ((data?.length ?? 0) < RECENT_FETCH_PAGE) return stats;
  }
}

// Viewed projects first (last access desc, then access_count desc); unviewed keep the incoming
// base order (Array.sort is stable). Sorts in place and returns the same array.
export function sortByRecentAccess<T extends { id: string }>(rows: T[], views: Map<string, ViewStat>): T[] {
  return rows.sort((a, b) => {
    const va = views.get(a.id);
    const vb = views.get(b.id);
    if (va && vb) return vb.lastAccessedAt.localeCompare(va.lastAccessedAt) || vb.accessCount - va.accessCount;
    return va ? -1 : vb ? 1 : 0;
  });
}
