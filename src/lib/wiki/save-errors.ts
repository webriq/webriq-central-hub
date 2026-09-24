import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { WikiConflictInfo } from "@/types/wiki";

// Task 402 — shared by the page PATCH and revision-restore routes, which both call the
// `wiki_save_page` RPC (migration 151). The RPC signals its outcomes with custom SQLSTATEs:
// P0409 stale baseRevision, P0404 page/revision missing, 42501 non-writer role.

export function isRpcError(error: { code?: string } | null, code: string): boolean {
  return error?.code === code;
}

// 409 body carries who/when made the newer revision so the client's conflict dialog can say
// "Jane saved a newer version 2 min ago" before offering Overwrite / Reload.
export async function conflictResponse(supabase: SupabaseClient<Database>, pageId: string) {
  const { data } = await supabase
    .from("wiki_pages")
    .select("revision, updated_at, updated_by_profile:profiles!wiki_pages_updated_by_fkey(id, full_name, avatar_url)")
    .eq("id", pageId)
    .maybeSingle();

  const current: WikiConflictInfo | null = data
    ? {
        revision: data.revision,
        updatedAt: data.updated_at,
        updatedBy: data.updated_by_profile
          ? { id: data.updated_by_profile.id, name: data.updated_by_profile.full_name ?? "Unknown", avatarUrl: data.updated_by_profile.avatar_url }
          : null,
      }
    : null;

  return NextResponse.json({ error: "conflict", current }, { status: 409 });
}
