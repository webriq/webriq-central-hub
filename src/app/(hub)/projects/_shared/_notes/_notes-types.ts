// Task 311 — shared types + the fixed note-color palette. Kept as a static lookup map (never
// construct Tailwind class strings dynamically) per this repo's dynamic-styling convention.

export type NoteColor = "default" | "yellow" | "green" | "blue" | "purple" | "peach" | "gray";

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
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NotePermission = "owner" | "edit" | "view";

export function getNotePermission(
  note: NoteRow,
  currentUserId: string,
  currentUserRole: string | null
): NotePermission {
  if (note.created_by === currentUserId) return "owner";
  if (currentUserRole === "admin" || currentUserRole === "super_admin") return "owner";
  const collab = note.collaborators.find((c) => c.user_id === currentUserId);
  if (collab?.permission === "edit") return "edit";
  return "view";
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
