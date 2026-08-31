"use client";

import { useMemo, useRef, useState } from "react";
import { Pin, Archive, ArchiveRestore, Trash2, Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOTE_CARD_BG, getNotePermission, type NoteRow, type NoteFolder, type NoteColor, type NoteVisibility } from "./_notes-types";
import { NoteColorPicker } from "./_note-color-picker";
import { NoteCollaboratorPicker } from "./_note-collaborator-picker";
import { NoteRichTextEditor } from "./_note-rich-text-editor";
import { IconTip } from "./_icon-tip";

export type NoteDraftPatch = {
  title: string | null;
  content: string | null;
  color: NoteColor;
  folder_id: string | null;
  is_pinned: boolean;
};

const FOLDER_ROLE_LABEL: Record<string, string> = {
  pm: "PMs",
  developer: "developers",
  admin: "admins",
  super_admin: "super admins",
};

// Task 337 — human phrase for the confirm-to-public dialog ("…let everyone <audience> see it").
function describeFolderAudience(folder: NoteFolder | null): string {
  if (!folder) return "with folder access";
  if (folder.visibility === "public") return "on staff";
  const shares = folder.shares ?? [];
  const names = shares.filter((s) => s.user_id).map((s) => s.user?.full_name ?? "a teammate");
  const roles = shares.filter((s) => s.role).map((s) => FOLDER_ROLE_LABEL[s.role as string] ?? s.role);
  const parts = [...names, ...roles];
  if (parts.length === 0) return "with folder access";
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// Task 311 — create/edit modal matching the reference screenshot: Title, body, pin toggle
// top-right, a toolbar row (background color, add-collaborator, archive, delete) and a Close
// button. Reminders/images/text-color/undo-redo from the reference toolbar are deliberately not
// implemented — see task doc's Out-of-Scope list. Title/body save on close (Keep's own
// behavior); pin/color/folder/archive/share are immediate actions.
export function NoteEditorModal({
  projectId,
  note,
  defaultFolderId,
  folders,
  allMembers,
  currentUserId,
  currentUserRole,
  folderPermission,
  exposedFolderIds,
  onClose,
  onCreate,
  onSaveDraft,
  onDelete,
  onTogglePin,
  onToggleArchive,
  onChangeColor,
  onChangeFolder,
  onChangeVisibility,
  onShare,
  onChangePermission,
  onUnshare,
}: {
  projectId: string;
  note: NoteRow | null;
  // Task 315 — folder the note is created into when opened via the composer while a specific
  // folder is selected in the rail; ignored when editing an existing note (`note.folder_id`
  // wins, per `note?.folder_id ?? defaultFolderId` below).
  defaultFolderId: string | null;
  folders: NoteFolder[];
  allMembers: { id: string; full_name: string | null; avatar_url: string | null; role: string }[];
  currentUserId: string;
  currentUserRole: string | null;
  // Task 337 — folder-granted permission map + the set of folders that expose their public
  // notes. The Public/Private toggle only appears when the note's folder is in `exposedFolderIds`.
  folderPermission?: Map<string, "view" | "edit">;
  exposedFolderIds: Set<string>;
  onClose: () => void;
  onCreate: (patch: NoteDraftPatch) => Promise<NoteRow | null>;
  onSaveDraft: (noteId: string, patch: { title: string | null; content: string | null }) => void;
  onDelete: (noteId: string) => void;
  onTogglePin: (noteId: string) => void;
  onToggleArchive: (noteId: string) => void;
  onChangeColor: (noteId: string, color: NoteColor) => void;
  onChangeFolder: (noteId: string, folderId: string | null) => void;
  onChangeVisibility: (noteId: string, visibility: NoteVisibility) => void;
  onShare: (noteId: string, userId: string, permission: "view" | "edit") => void;
  onChangePermission: (noteId: string, userId: string, permission: "view" | "edit") => void;
  onUnshare: (noteId: string, userId: string) => void;
}) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [contentEmpty, setContentEmpty] = useState(!note?.content);
  const [color, setColor] = useState<NoteColor>(note?.color ?? "default");
  const [folderId, setFolderId] = useState<string | null>(note?.folder_id ?? defaultFolderId);
  const [isPinned, setIsPinned] = useState(note?.is_pinned ?? false);
  // Task 337 — per-note opt-in to the folder's audience. `private` by default; only the author
  // (or admin/super_admin) can flip it, and only when the note's folder is shared / public.
  const [visibility, setVisibility] = useState<NoteVisibility>(note?.visibility ?? "private");
  const [confirmPublicOpen, setConfirmPublicOpen] = useState(false);

  // Task 315 — `note` is only the *initial* value (null while composing a brand-new note).
  // `activeNote` tracks the note actually being edited in this modal session, and flips from
  // null to a real row the moment sharing auto-creates it (see `ensureNoteCreated` below) —
  // every other action (pin/archive/color/folder/delete/further-share/close) then correctly
  // targets the real note instead of silently no-op'ing against a stale null.
  const [activeNote, setActiveNote] = useState<NoteRow | null>(note);
  // Memoizes the in-flight creation promise so a rapid double-click on "Share" during the
  // auto-create moment can't fire two concurrent POSTs and create two notes.
  const creatingRef = useRef<Promise<NoteRow | null> | null>(null);

  const permission = activeNote ? getNotePermission(activeNote, currentUserId, currentUserRole, folderPermission) : "owner";
  const readOnly = permission === "view";

  // Task 337 — the visibility toggle is offered only to the note's author / an admin, and only
  // when the note actually sits in a folder with an audience (shared or public).
  const activeFolder = useMemo(() => folders.find((f) => f.id === folderId) ?? null, [folders, folderId]);
  const folderIsSharedOrPublic = folderId != null && exposedFolderIds.has(folderId);
  const canSetVisibility = permission === "owner" && folderIsSharedOrPublic;
  const audienceLabel = describeFolderAudience(activeFolder);

  function handleToggleVisibility() {
    if (visibility === "public") {
      setVisibility("private");
      if (activeNote) onChangeVisibility(activeNote.id, "private");
      return;
    }
    setConfirmPublicOpen(true);
  }

  async function confirmMakePublic() {
    setConfirmPublicOpen(false);
    const target = await ensureNoteCreated();
    if (!target) return;
    setVisibility("public");
    onChangeVisibility(target.id, "public");
  }
  // "owner" per `getNotePermission` covers both the literal author and admin/super_admin
  // (oversight parity, per the task doc's scope decisions) — the note_collaborators RLS insert
  // policy already allows either to share a note, so the UI control shouldn't be narrower.
  const canManageSharing = permission === "owner";

  async function ensureNoteCreated(): Promise<NoteRow | null> {
    if (activeNote) return activeNote;
    if (!creatingRef.current) {
      const trimmedTitle = title.trim() || null;
      const trimmedContent = contentEmpty ? null : content;
      creatingRef.current = onCreate({ title: trimmedTitle, content: trimmedContent, color, folder_id: folderId, is_pinned: isPinned });
    }
    const created = await creatingRef.current;
    if (created) setActiveNote(created);
    return created;
  }

  async function handleShareMany(userIds: string[], sharePermission: "view" | "edit") {
    const target = await ensureNoteCreated();
    if (!target) return; // silently drop on failure — matches this app's existing convention (e.g. image upload)
    userIds.forEach((userId) => onShare(target.id, userId, sharePermission));
  }

  function handleClose() {
    const trimmedTitle = title.trim() || null;
    const trimmedContent = contentEmpty ? null : content;
    if (!activeNote) {
      // `creatingRef.current` set means a share already kicked off `ensureNoteCreated()` and it
      // hasn't resolved yet (e.g. the user clicked Share then immediately closed) — don't start
      // a second, independent create here, or the note ends up duplicated.
      if (!creatingRef.current && (trimmedTitle || trimmedContent)) {
        onCreate({ title: trimmedTitle, content: trimmedContent, color, folder_id: folderId, is_pinned: isPinned });
      }
    } else if (!readOnly && (trimmedTitle !== activeNote.title || trimmedContent !== activeNote.content)) {
      onSaveDraft(activeNote.id, { title: trimmedTitle, content: trimmedContent });
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1533]/40 p-4"
      onClick={handleClose}
    >
      <div
        className={cn("w-full max-w-lg rounded-[14px] border shadow-[0_8px_24px_rgba(7,17,51,.10)] flex flex-col", NOTE_CARD_BG[color])}
        style={{ borderColor: "rgba(11,21,51,0.10)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 px-4 pt-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            readOnly={readOnly}
            placeholder="Title"
            className={cn(
              "flex-1 bg-transparent text-[15px] font-semibold text-[#0B1533] outline-none placeholder:text-[#5F6A88]",
              readOnly && "cursor-not-allowed"
            )}
          />
          {permission !== "view" && (
            <IconTip label={isPinned ? "Unpin note" : "Pin note"}>
              <button
                type="button"
                onClick={() => { if (activeNote) onTogglePin(activeNote.id); else setIsPinned((p) => !p); }}
                aria-label={isPinned ? "Unpin note" : "Pin note"}
                className={cn(
                  "p-1.5 rounded-full transition-colors cursor-pointer shrink-0",
                  isPinned ? "text-[#007BFF]" : "text-[#5F6A88] hover:bg-black/[0.04]"
                )}
              >
                <Pin size={16} fill={isPinned ? "currentColor" : "none"} />
              </button>
            </IconTip>
          )}
        </div>

        <NoteRichTextEditor
          projectId={projectId}
          value={content}
          onChange={setContent}
          onEmptyChange={setContentEmpty}
          readOnly={readOnly}
        />

        {folders.length > 0 && permission !== "view" && (
          <div className="px-4 mt-2">
            <select
              value={folderId ?? ""}
              onChange={(e) => {
                const value = e.target.value || null;
                setFolderId(value);
                if (activeNote) onChangeFolder(activeNote.id, value);
              }}
              className="text-[11px] font-medium text-[#3A4565] bg-white border border-[#E2E7F2] rounded-full px-2.5 py-1 outline-none cursor-pointer"
            >
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center justify-between px-3 py-2.5 mt-2 border-t border-black/[0.06]">
          <div className="flex items-center gap-0.5">
            <NoteColorPicker
              value={color}
              disabled={readOnly}
              onChange={(c) => { setColor(c); if (activeNote) onChangeColor(activeNote.id, c); }}
            />
            {canManageSharing && (
              <NoteCollaboratorPicker
                collaborators={activeNote?.collaborators ?? []}
                allMembers={allMembers}
                authorId={activeNote?.created_by ?? currentUserId}
                currentUserId={currentUserId}
                onShareMany={handleShareMany}
                onChangePermission={(userId, perm) => activeNote && onChangePermission(activeNote.id, userId, perm)}
                onUnshare={(userId) => activeNote && onUnshare(activeNote.id, userId)}
              />
            )}
            {canSetVisibility && (
              <IconTip label={visibility === "public" ? "Make private" : "Make public to this folder"}>
                <button
                  type="button"
                  onClick={handleToggleVisibility}
                  aria-label={visibility === "public" ? "Make note private" : "Make note public to this folder"}
                  className={cn(
                    "p-1.5 rounded-full transition-colors cursor-pointer shrink-0",
                    visibility === "public"
                      ? "text-[#007BFF]"
                      : "text-[#5F6A88] hover:bg-black/[0.04] hover:text-[#0B1533]"
                  )}
                >
                  {visibility === "public" ? <Globe size={16} /> : <Lock size={16} />}
                </button>
              </IconTip>
            )}
            {activeNote && permission !== "view" && (
              <IconTip label={activeNote.is_archived ? "Unarchive note" : "Archive note"}>
                <button
                  type="button"
                  onClick={() => onToggleArchive(activeNote.id)}
                  aria-label={activeNote.is_archived ? "Unarchive note" : "Archive note"}
                  className="p-1.5 rounded-full text-[#5F6A88] hover:bg-black/[0.04] hover:text-[#0B1533] transition-colors cursor-pointer"
                >
                  {activeNote.is_archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                </button>
              </IconTip>
            )}
            {activeNote && permission === "owner" && (
              <IconTip label="Delete note">
                <button
                  type="button"
                  onClick={() => { onDelete(activeNote.id); onClose(); }}
                  aria-label="Delete note"
                  className="p-1.5 rounded-full text-[#5F6A88] hover:bg-black/[0.04] hover:text-[#C0392B] transition-colors cursor-pointer"
                >
                  <Trash2 size={16} />
                </button>
              </IconTip>
            )}
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold text-[#3A4565] hover:bg-black/[0.04] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Task 337 — confirm-to-public. In-app overlay, never a browser confirm(). */}
      {confirmPublicOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0B1533]/40 p-4"
          onClick={(e) => { e.stopPropagation(); setConfirmPublicOpen(false); }}
        >
          <div
            className="w-full max-w-sm rounded-[14px] border border-[#E2E7F2] bg-white p-4 shadow-[0_8px_24px_rgba(7,17,51,.10)]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[13px] font-semibold text-[#0B1533] mb-1.5">Make this note public?</p>
            <p className="text-[13px] text-[#3A4565] mb-4">
              This note is in a {activeFolder?.visibility === "public" ? "public" : "shared"} folder.
              Making it public will let everyone {audienceLabel} see it.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmPublicOpen(false)}
                className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold text-[#3A4565] hover:bg-black/[0.04] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmMakePublic}
                className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold text-white bg-[#007BFF] hover:bg-[#0063D6] transition-colors cursor-pointer"
              >
                Make public
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
