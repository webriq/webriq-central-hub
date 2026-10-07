import { cache } from "react";
import { adminClient } from "@/lib/supabase/admin";
import { fetchAll } from "./queries";

export interface PersonDirectoryEntry {
  avatarUrl: string | null;
  role: string;
}

/**
 * employee id → profile photo + role, for rendering avatars and the "Reporting to" options.
 * adminClient is deliberate: profiles are owner-read under RLS and HR screens show other people's
 * photos (same exception the project listings make). Read-only, and only display fields leave here.
 */
export const loadPersonDirectory = cache(async (): Promise<Record<string, PersonDirectoryEntry>> => {
  const employees = await fetchAll<{ id: string; profile_id: string }>((a, b) =>
    adminClient.from("hr_employees").select("id, profile_id").range(a, b)
  );
  const profiles = await fetchAll<{ id: string; avatar_url: string | null; role: string }>((a, b) =>
    adminClient.from("profiles").select("id, avatar_url, role").range(a, b)
  );
  const byProfile = new Map(profiles.map((p) => [p.id, p]));
  const out: Record<string, PersonDirectoryEntry> = {};
  for (const e of employees) {
    const p = byProfile.get(e.profile_id);
    if (p) out[e.id] = { avatarUrl: p.avatar_url, role: p.role };
  }
  return out;
});
