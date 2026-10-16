import { adminClient } from "@/lib/supabase/admin";
import type { ProgrammeClient } from "@/lib/programme/store";

// Task 455 — server-side reads for programme delay notes. Server-only (adminClient): never import
// from a Client Component; the pure rules live in note-rules.ts.

export type ProjectDelayNote = { note: string; updatedAt: string | null; updatedById: string | null };

const UNDEFINED_COLUMN = "42703";
const ID_CHUNK = 100;

// Migration 177 (written, not applied by the agent) adds the note/audit columns; until then reads and
// writes that name them fail with Postgres 42703 and callers degrade instead of erroring.
export function isUndefinedColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === UNDEFINED_COLUMN;
}

/** Project-level delay notes for the given project UUIDs (only projects that have one). Empty before migration 177. */
export async function loadProjectDelayNotes(client: ProgrammeClient, projectIds: string[]): Promise<Map<string, ProjectDelayNote>> {
  const notes = new Map<string, ProjectDelayNote>();
  for (let i = 0; i < projectIds.length; i += ID_CHUNK) {
    const { data, error } = await client
      .from("projects")
      .select("id, delay_note, delay_note_updated_at, delay_note_updated_by")
      .in("id", projectIds.slice(i, i + ID_CHUNK))
      .not("delay_note", "is", null);
    if (isUndefinedColumn(error)) return notes;
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.delay_note) notes.set(row.id, { note: row.delay_note, updatedAt: row.delay_note_updated_at, updatedById: row.delay_note_updated_by });
    }
  }
  return notes;
}

// adminClient: profiles_read_own RLS (migration 048) only lets a non-admin read their own row — same
// workaround the status-report route already uses for phase assignee names.
export async function resolveUserNames(userIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data } = await adminClient.from("profiles").select("id, full_name").in("id", ids.slice(i, i + ID_CHUNK));
    for (const row of data ?? []) if (row.full_name) names.set(row.id, row.full_name);
  }
  return names;
}
