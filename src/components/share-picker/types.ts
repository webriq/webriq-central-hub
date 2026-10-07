// Task 438 — shared Share Picker types. A surface adapts its own people/role types to these at the
// call site (StaffPerson, DrivePerson, notes `allMembers`) so none of those modules change.

export type ShareRoleOption = { value: string; label: string };

export type SharePerson = {
  id: string;
  name: string;
  /** Raw role value; compared against `ShareRoleOption.value` to hide members of a selected role. */
  role: string;
  /** Human label shown under the name ("Developers"). Falls back to `role`. */
  roleLabel?: string;
  /** `profiles.avatar_url`; null/absent → initials fallback. */
  avatarUrl?: string | null;
  /** Deactivated users are never offered, but stay resolvable (existing chips / access lists). */
  inactive?: boolean;
};

export type ShareSelection = { roles: string[]; userIds: string[] };

export const EMPTY_SELECTION: ShareSelection = { roles: [], userIds: [] };
