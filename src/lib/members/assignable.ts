import { adminClient } from "@/lib/supabase/admin";

// Task 351 — single source of truth for "who can be assigned a task or issue".
//
// The pool is every internal staff-role profile MINUS the exclude list below. Widened from the
// old per-surface role filters (New Task was `developer`-only; the listing pickers were
// developer/pm/admin/super_admin) so an admin-who-also-does-work, HR, or marketing can be
// assigned — while a denylist keeps specific people (currently Philippe Bodart) out of every
// picker without another code change.
//
// server-only: `getAssignableMembers()` uses `adminClient` (bypasses the profiles_read_own RLS,
// same documented display-lookup exception `_get-project-detail-data.ts` already relies on) and
// `auth.admin.listUsers()`. Import it only from server components / route handlers / loaders.

export const ASSIGNABLE_ROLES = [
  "admin",
  "super_admin",
  "pm",
  "developer",
  "hr",
  "marketing",
] as const;

/**
 * Hide these people from every assignee picker. Each entry is matched case-insensitively
 * against a profile's `full_name` OR the user's `auth.users` email. To exclude someone else
 * later, append their display name or an email address — nothing else to change.
 */
export const ASSIGNEE_EXCLUDE: string[] = [
  "Philippe Bodart",
  "philippe.bodart@webriq.services",
  "philippe.bodart@webtools2go.com",
];

export type AssignableMember = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
};

const excludeSet = () => new Set(ASSIGNEE_EXCLUDE.map((e) => e.trim().toLowerCase()).filter(Boolean));

/**
 * Pure filter — excludes a member when their lowercased `full_name`, or the email resolved for
 * their id via `emailById`, is in `ASSIGNEE_EXCLUDE`. Split out for unit-testability.
 */
export function filterExcludedMembers(
  members: AssignableMember[],
  emailById: Map<string, string>,
): AssignableMember[] {
  const excluded = excludeSet();
  return members.filter((m) => {
    const name = m.full_name?.trim().toLowerCase();
    if (name && excluded.has(name)) return false;
    const email = emailById.get(m.id)?.trim().toLowerCase();
    if (email && excluded.has(email)) return false;
    return true;
  });
}

/**
 * All staff-role profiles minus `ASSIGNEE_EXCLUDE`, ordered by name. The `auth.users` email
 * lookup only runs when an exclude entry contains "@" (name-only excludes skip it); a lookup
 * failure degrades to name-only filtering rather than failing the caller.
 */
export async function getAssignableMembers(): Promise<AssignableMember[]> {
  const { data: profiles, error } = await adminClient
    .from("profiles")
    .select("id, full_name, avatar_url, role")
    .in("role", [...ASSIGNABLE_ROLES])
    .order("full_name", { ascending: true });

  if (error) {
    console.error("[members/assignable] profiles fetch failed:", error.message);
    return [];
  }

  const rows: AssignableMember[] = (profiles ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name ?? null,
    avatar_url: p.avatar_url ?? null,
    role: p.role ?? "",
  }));

  const emailById = new Map<string, string>();
  if (ASSIGNEE_EXCLUDE.some((e) => e.includes("@"))) {
    try {
      const idSet = new Set(rows.map((r) => r.id));
      for (let page = 1; page <= 20; page++) {
        const { data, error: listErr } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
        if (listErr || !data) break;
        for (const u of data.users) {
          if (u.email && idSet.has(u.id)) emailById.set(u.id, u.email.toLowerCase());
        }
        if (data.users.length < 1000) break;
      }
    } catch (err) {
      console.error("[members/assignable] auth.users email lookup failed — falling back to name-only exclude:", err);
    }
  }

  return filterExcludedMembers(rows, emailById);
}
