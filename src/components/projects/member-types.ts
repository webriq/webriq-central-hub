// Shared shape for GET /api/projects/[projectId]/members responses — extracted (task 268) from
// duplicated definitions in manage-collaborators-modal.tsx (task 264) and
// set-project-owner-modal.tsx, both of which fetch and map the same members payload.
export type MemberRow = { id: string; user_id: string; is_owner: boolean; full_name: string | null; role: string | null; avatar_url: string | null };
export type RawMemberRow = { id: string; user_id: string; is_owner: boolean; profiles: { full_name: string | null; role: string; avatar_url: string | null } | null };

export function mapMembers(raw: RawMemberRow[]): MemberRow[] {
  return raw.map((m) => ({
    id: m.id,
    user_id: m.user_id,
    is_owner: m.is_owner,
    full_name: m.profiles?.full_name ?? null,
    role: m.profiles?.role ?? null,
    avatar_url: m.profiles?.avatar_url ?? null,
  }));
}
