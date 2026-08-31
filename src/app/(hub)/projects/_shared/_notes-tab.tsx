"use client";

import { useEffect, useMemo, useState } from "react";
import { NotesBoard } from "./_notes/_notes-board";
import { NoteEditorModal, type NoteDraftPatch } from "./_notes/_note-editor-modal";
import { NoteFolderShareDialog } from "./_notes/_note-folder-share-dialog";
import type { NotesView } from "./_notes/_note-folder-rail";
import {
  folderPermissionForUser,
  type NoteRow,
  type NoteFolder,
  type NoteFolderShare,
  type NoteColor,
  type NoteVisibility,
} from "./_notes/_notes-types";

// Task 311 — Notes tab, shared by both the legacy and v2 project-detail routes (same pattern
// as `_files-tab.tsx`): this component owns fetch + mutation, `_notes/_notes-board.tsx` and
// `_notes/_note-editor-modal.tsx` are pure presentational. All access control is enforced by
// RLS (migration 120) — this file just reflects the server's response, never assumes success.
export function NotesTab({
  projectId,
  currentUserId,
  currentUserRole,
  allMembers,
}: {
  projectId: string;
  currentUserId: string;
  currentUserRole: string | null;
  allMembers: { id: string; full_name: string | null; avatar_url: string | null; role: string }[];
}) {
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [view, setView] = useState<NotesView>("all");
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteRow | null>(null);
  // Task 337 — the "Share folder" dialog target (null = closed).
  const [sharingFolder, setSharingFolder] = useState<NoteFolder | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [activeRes, archivedRes, foldersRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/notes`),
        fetch(`/api/projects/${projectId}/notes?archived=true`),
        fetch(`/api/projects/${projectId}/notes/folders`),
      ]);
      if (cancelled) return;
      const active: NoteRow[] = activeRes.ok ? await activeRes.json() : [];
      const archived: NoteRow[] = archivedRes.ok ? await archivedRes.json() : [];
      setNotes([...active, ...archived]);
      if (foldersRes.ok) setFolders(await foldersRes.json());
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const { pinnedNotes, otherNotes, archivedNotes } = useMemo(() => {
    const scoped = notes.filter((n) => !activeFolderId || n.folder_id === activeFolderId);
    return {
      pinnedNotes: scoped.filter((n) => !n.is_archived && n.is_pinned),
      otherNotes: scoped.filter((n) => !n.is_archived && !n.is_pinned),
      archivedNotes: notes.filter((n) => n.is_archived),
    };
  }, [notes, activeFolderId]);

  // Task 312 — folder-rail note-count badges, derived client-side from the already-loaded
  // `notes` array rather than a new query.
  const noteCountByFolder = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const note of notes) {
      if (note.is_archived || !note.folder_id) continue;
      counts[note.folder_id] = (counts[note.folder_id] ?? 0) + 1;
    }
    return counts;
  }, [notes]);

  // Task 337 — the current user's effective folder-granted permission per folder (widens access
  // to a folder's `public` notes; never narrows a per-note collaborator). One pass over
  // `folders` (visibility + RLS-filtered shares), reused by the board, cards and editor.
  const folderPermission = useMemo(
    () => folderPermissionForUser(folders, currentUserId, currentUserRole),
    [folders, currentUserId, currentUserRole]
  );

  // Task 337 — folders that expose their `public` notes to someone (public, or with any share).
  // Drives the folder-rail indicator and gates the editor's Public/Private toggle.
  const exposedFolderIds = useMemo(
    () => new Set(folders.filter((f) => f.visibility === "public" || (f.shares ?? []).length > 0).map((f) => f.id)),
    [folders]
  );

  // Task 314 — "Shared with me": notes where the current user is a collaborator (individually
  // or via a prior "select all" share) but not the author, excluding archived. Folder-agnostic,
  // same as `archivedNotes` above — shared notes can live in any folder or none.
  // Task 337 — also lists `public` notes reachable via a folder share / public folder.
  const sharedNotes = useMemo(
    () => notes.filter((n) =>
      !n.is_archived && n.created_by !== currentUserId && (
        n.collaborators.some((c) => c.user_id === currentUserId) ||
        (n.visibility === "public" && n.folder_id != null && folderPermission.has(n.folder_id))
      )
    ),
    [notes, currentUserId, folderPermission]
  );

  function openComposer() {
    setEditingNote(null);
    setEditorOpen(true);
  }

  function openNote(note: NoteRow) {
    setEditingNote(note);
    setEditorOpen(true);
  }

  // Task 315 — returns the created note (or null on failure) so the editor modal's
  // share-triggered auto-create can retarget pin/archive/color/folder/delete/further-share at
  // the real note for the rest of that modal session.
  async function createNote(patch: NoteDraftPatch): Promise<NoteRow | null> {
    const res = await fetch(`/api/projects/${projectId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return null;
    const created: NoteRow = await res.json();
    setNotes((prev) => [created, ...prev]);
    setEditingNote(created);
    return created;
  }

  async function patchNote(
    noteId: string,
    patch: Partial<Pick<NoteRow, "title" | "content" | "color" | "folder_id" | "is_pinned" | "is_archived" | "visibility">>
  ) {
    const res = await fetch(`/api/projects/${projectId}/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    const updated: NoteRow = await res.json();
    setNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)));
  }

  async function deleteNote(noteId: string) {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    await fetch(`/api/projects/${projectId}/notes/${noteId}`, { method: "DELETE" });
  }

  async function createFolder(name: string) {
    const res = await fetch(`/api/projects/${projectId}/notes/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    const created: NoteFolder = await res.json();
    setFolders((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function renameFolder(folderId: string, name: string) {
    const res = await fetch(`/api/projects/${projectId}/notes/folders/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    const updated: NoteFolder = await res.json();
    setFolders((prev) => prev.map((f) => (f.id === folderId ? updated : f)).sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function deleteFolder(folderId: string) {
    const res = await fetch(`/api/projects/${projectId}/notes/folders/${folderId}`, { method: "DELETE" });
    if (!res.ok) return;
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setNotes((prev) => prev.map((n) => (n.folder_id === folderId ? { ...n, folder_id: null } : n)));
    if (activeFolderId === folderId) setActiveFolderId(null);
  }

  function patchFolderState(folderId: string, patch: Partial<NoteFolder>) {
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, ...patch } : f)));
  }

  // Task 337 — folder visibility + folder-share mutations. RLS (migrations 120/127) is the real
  // gate; a failed response leaves local state untouched.
  async function setFolderVisibility(folderId: string, visibility: NoteVisibility) {
    const res = await fetch(`/api/projects/${projectId}/notes/folders/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility }),
    });
    if (!res.ok) return;
    patchFolderState(folderId, { visibility });
  }

  async function shareFolder(
    folderId: string,
    targets: { userIds: string[]; roles: NoteFolderShare["role"][] },
    permission: "view" | "edit"
  ) {
    const payloads = [
      ...targets.userIds.map((user_id) => ({ user_id, permission })),
      ...targets.roles.map((role) => ({ role, permission })),
    ];
    const created: NoteFolderShare[] = [];
    for (const payload of payloads) {
      const res = await fetch(`/api/projects/${projectId}/notes/folders/${folderId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) created.push(await res.json());
    }
    if (created.length === 0) return;
    setFolders((prev) => prev.map((f) => {
      if (f.id !== folderId) return f;
      const kept = (f.shares ?? []).filter((s) => !created.some((c) => c.id === s.id
        || (c.user_id && c.user_id === s.user_id) || (c.role && c.role === s.role)));
      return { ...f, shares: [...kept, ...created] };
    }));
  }

  async function changeFolderSharePermission(folderId: string, shareId: string, permission: "view" | "edit") {
    const res = await fetch(`/api/projects/${projectId}/notes/folders/${folderId}/shares/${shareId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permission }),
    });
    if (!res.ok) return;
    const updated: NoteFolderShare = await res.json();
    setFolders((prev) => prev.map((f) => (f.id === folderId
      ? { ...f, shares: (f.shares ?? []).map((s) => (s.id === shareId ? updated : s)) }
      : f)));
  }

  async function unshareFolder(folderId: string, shareId: string) {
    setFolders((prev) => prev.map((f) => (f.id === folderId
      ? { ...f, shares: (f.shares ?? []).filter((s) => s.id !== shareId) }
      : f)));
    await fetch(`/api/projects/${projectId}/notes/folders/${folderId}/shares/${shareId}`, { method: "DELETE" });
  }

  async function shareNote(noteId: string, userId: string, permission: "view" | "edit") {
    const res = await fetch(`/api/projects/${projectId}/notes/${noteId}/collaborators`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, permission }),
    });
    if (!res.ok) return;
    const collaborator = await res.json();
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, collaborators: [...n.collaborators.filter((c) => c.user_id !== userId), collaborator] } : n)));
    setEditingNote((prev) => (prev?.id === noteId ? { ...prev, collaborators: [...prev.collaborators.filter((c) => c.user_id !== userId), collaborator] } : prev));
  }

  async function changeCollaboratorPermission(noteId: string, userId: string, permission: "view" | "edit") {
    const res = await fetch(`/api/projects/${projectId}/notes/${noteId}/collaborators/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permission }),
    });
    if (!res.ok) return;
    const collaborator = await res.json();
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, collaborators: n.collaborators.map((c) => (c.user_id === userId ? collaborator : c)) } : n)));
    setEditingNote((prev) => (prev?.id === noteId ? { ...prev, collaborators: prev.collaborators.map((c) => (c.user_id === userId ? collaborator : c)) } : prev));
  }

  async function unshareNote(noteId: string, userId: string) {
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, collaborators: n.collaborators.filter((c) => c.user_id !== userId) } : n)));
    setEditingNote((prev) => (prev?.id === noteId ? { ...prev, collaborators: prev.collaborators.filter((c) => c.user_id !== userId) } : prev));
    await fetch(`/api/projects/${projectId}/notes/${noteId}/collaborators/${userId}`, { method: "DELETE" });
  }

  function canManageFolder(folder: NoteFolder) {
    return folder.created_by === currentUserId || currentUserRole === "admin" || currentUserRole === "super_admin";
  }

  return (
    <>
      <NotesBoard
        loading={loading}
        pinnedNotes={pinnedNotes}
        otherNotes={otherNotes}
        archivedNotes={archivedNotes}
        sharedNotes={sharedNotes}
        folders={folders}
        noteCountByFolder={noteCountByFolder}
        view={view}
        activeFolderId={activeFolderId}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        canManageFolder={canManageFolder}
        folderPermission={folderPermission}
        exposedFolderIds={exposedFolderIds}
        onSelectAll={() => { setView("all"); setActiveFolderId(null); }}
        onSelectShared={() => setView("shared")}
        onSelectFolder={(folderId) => { setView("all"); setActiveFolderId(folderId); }}
        onSelectArchived={() => setView("archived")}
        onCreateFolder={createFolder}
        onRenameFolder={renameFolder}
        onDeleteFolder={deleteFolder}
        onShareFolder={(folderId) => setSharingFolder(folders.find((f) => f.id === folderId) ?? null)}
        onOpenComposer={openComposer}
        onOpenNote={openNote}
        onTogglePin={(note) => patchNote(note.id, { is_pinned: !note.is_pinned })}
        onToggleArchive={(note) => patchNote(note.id, { is_archived: !note.is_archived })}
        onDelete={(note) => deleteNote(note.id)}
      />

      {editorOpen && (
        <NoteEditorModal
          projectId={projectId}
          note={editingNote}
          defaultFolderId={activeFolderId}
          folders={folders}
          allMembers={allMembers}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          folderPermission={folderPermission}
          exposedFolderIds={exposedFolderIds}
          onClose={() => setEditorOpen(false)}
          onCreate={createNote}
          onSaveDraft={(noteId, patch) => patchNote(noteId, patch)}
          onDelete={deleteNote}
          onTogglePin={(noteId) => {
            const note = notes.find((n) => n.id === noteId);
            if (note) patchNote(noteId, { is_pinned: !note.is_pinned });
          }}
          onToggleArchive={(noteId) => {
            const note = notes.find((n) => n.id === noteId);
            if (note) patchNote(noteId, { is_archived: !note.is_archived });
          }}
          onChangeColor={(noteId, color: NoteColor) => patchNote(noteId, { color })}
          onChangeFolder={(noteId, folderId) => patchNote(noteId, { folder_id: folderId })}
          onChangeVisibility={(noteId, visibility) => patchNote(noteId, { visibility })}
          onShare={shareNote}
          onChangePermission={changeCollaboratorPermission}
          onUnshare={unshareNote}
        />
      )}

      {sharingFolder && (
        <NoteFolderShareDialog
          folder={folders.find((f) => f.id === sharingFolder.id) ?? sharingFolder}
          allMembers={allMembers}
          currentUserId={currentUserId}
          onClose={() => setSharingFolder(null)}
          onSetVisibility={setFolderVisibility}
          onShare={shareFolder}
          onChangeSharePermission={changeFolderSharePermission}
          onUnshare={unshareFolder}
        />
      )}
    </>
  );
}
