// Task 311 — shared types + the fixed note-color palette. Kept as a static lookup map (never
// construct Tailwind class strings dynamically) per this repo's dynamic-styling convention.

export type NoteColor = "default" | "yellow" | "green" | "blue" | "purple" | "peach" | "gray";

// Task 337 — the second sharing axis. A folder can be `public` (any staff, view-only) or
// `private` (explicit `note_folder_shares` only); a note is only ever exposed to a folder's
// audience when its own author has flipped it `public`.
export type NoteVisibility = "private" | "public";

export type NoteFolderShareRole = "pm" | "developer" | "admin" | "super_admin";

export type NoteFolderShare = {
  id: string;
  folder_id: string;
  user_id: string | null;
  role: NoteFolderShareRole | null;
  permission: "view" | "edit";
  added_by: string | null;
  user: NotePerson | null;
};

export type NotePerson = { id: string; full_name: string | null; avatar_url: string | null };

export type NoteCollaborator = {
  id: string;
  user_id: string;
  permission: "view" | "edit";
  added_by: string | null;
  user: NotePerson | null;
};

export type NoteRow = {
  id: string;
  project_id: string;
  folder_id: string | null;
  title: string | null;
  content: string | null;
  color: NoteColor;
  visibility: NoteVisibility;
  is_pinned: boolean;
  is_archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  author: NotePerson | null;
  collaborators: NoteCollaborator[];
};

export type NoteFolder = {
  id: string;
  project_id: string;
  name: string;
  visibility: NoteVisibility;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Task 337 — RLS-filtered folder shares. Absent (undefined) until migration 127 is applied —
  // the folders GET falls back to a bare select then, and every consumer must treat it as `[]`.
  shares?: NoteFolderShare[];
};

export type NotePermission = "owner" | "edit" | "view";

// Task 337 — `folderPermission` is `folder_id → the current user's effective folder-granted
// permission`, computed once in NotesTab via `folderPermissionForUser`. It only widens access
// (a public note in a folder the user can reach); it never narrows a per-note collaborator.
export function getNotePermission(
  note: NoteRow,
  currentUserId: string,
  currentUserRole: string | null,
  folderPermission?: Map<string, "view" | "edit">
): NotePermission {
  if (note.created_by === currentUserId) return "owner";
  if (currentUserRole === "admin" || currentUserRole === "super_admin") return "owner";
  const collab = note.collaborators.find((c) => c.user_id === currentUserId);
  if (collab?.permission === "edit") return "edit";
  if (collab) return "view";
  if (note.visibility === "public" && note.folder_id) {
    const fp = folderPermission?.get(note.folder_id);
    if (fp === "edit") return "edit";
    if (fp) return "view";
  }
  return "view";
}

// Task 337 — the effective folder-granted permission per folder for one user. `'edit'` when a
// share row targets this user or their role at edit; `'view'` when a share targets them at view
// or the folder is `public` (all-staff, view-only); omitted when neither applies. Public-folder
// access is gated to staff roles, matching migration 127's `can_access_note_folder`.
const STAFF_ROLES = new Set(["pm", "developer", "admin", "super_admin"]);

export function folderPermissionForUser(
  folders: NoteFolder[],
  userId: string,
  role: string | null
): Map<string, "view" | "edit"> {
  const map = new Map<string, "view" | "edit">();
  for (const folder of folders) {
    let effective: "view" | "edit" | null = null;
    for (const share of folder.shares ?? []) {
      if (share.user_id === userId || (share.role && share.role === role)) {
        if (share.permission === "edit") { effective = "edit"; break; }
        effective = "view";
      }
    }
    if (effective !== "edit" && folder.visibility === "public" && role && STAFF_ROLES.has(role)) {
      effective = effective ?? "view";
    }
    if (effective) map.set(folder.id, effective);
  }
  return map;
}

export const NOTE_COLOR_OPTIONS: { value: NoteColor; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "yellow", label: "Yellow" },
  { value: "green", label: "Green" },
  { value: "blue", label: "Blue" },
  { value: "purple", label: "Purple" },
  { value: "peach", label: "Peach" },
  { value: "gray", label: "Gray" },
];

export const NOTE_CARD_BG: Record<NoteColor, string> = {
  default: "bg-white",
  yellow: "bg-[#FFF6D8]",
  green: "bg-[#E6F6EC]",
  blue: "bg-[#E8F2FF]",
  purple: "bg-[#F1EBFC]",
  peach: "bg-[#FFEFE2]",
  gray: "bg-[#EEF1F7]",
};

export const NOTE_CARD_BORDER: Record<NoteColor, string> = {
  default: "border-[#E2E7F2]",
  yellow: "border-[#F0E2A3]",
  green: "border-[#BFE5CE]",
  blue: "border-[#BFD9F7]",
  purple: "border-[#D8C9F0]",
  peach: "border-[#F3CFA8]",
  gray: "border-[#DADFEC]",
};

export const NOTE_SWATCH_BG: Record<NoteColor, string> = NOTE_CARD_BG;
