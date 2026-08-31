"use client";

import { useState } from "react";
import { StickyNote, Archive, Folder, Plus, Pencil, Trash2, Check, X, Users, Globe, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTip } from "./_icon-tip";
import type { NoteFolder } from "./_notes-types";

export type NotesView = "all" | "archived" | "shared";

// Task 311 — slim left rail (image 1's Notes/Reminders/labels sidebar, scoped down to one
// project): All notes, one row per folder + inline rename/delete, "New folder", Archived.
// Task 314 adds a built-in "Shared with me" row between "All notes" and the folder list.
export function NoteFolderRail({
  folders,
  noteCountByFolder,
  view,
  activeFolderId,
  onSelectAll,
  onSelectShared,
  onSelectFolder,
  onSelectArchived,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onShareFolder,
  canManageFolder,
}: {
  folders: NoteFolder[];
  noteCountByFolder: Record<string, number>;
  view: NotesView;
  activeFolderId: string | null;
  onSelectAll: () => void;
  onSelectShared: () => void;
  onSelectFolder: (folderId: string) => void;
  onSelectArchived: () => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onDeleteFolder: (folderId: string) => void;
  // Task 337 — open the "Share folder" dialog for one folder (only rendered when manageable).
  onShareFolder: (folderId: string) => void;
  // Task 311 — per-folder check (creator or admin/super_admin), matching migration 120's RLS:
  // any staff can create a folder, but only its creator or an admin can rename/delete it.
  canManageFolder: (folder: NoteFolder) => boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Task 312 — trim + case-insensitive duplicate check against existing folder names, excluding
  // the folder currently being renamed so a no-op rename doesn't trip its own duplicate check.
  function validateName(name: string, excludeId: string | null): string | null {
    const trimmed = name.trim();
    if (!trimmed) return "Folder name can't be empty";
    const isDuplicate = folders.some((f) => f.id !== excludeId && f.name.toLowerCase() === trimmed.toLowerCase());
    if (isDuplicate) return "A folder with this name already exists";
    return null;
  }

  const createError = creating ? validateName(newName, null) : null;
  const renameError = editingId ? validateName(editName, editingId) : null;

  function submitCreate() {
    if (createError) return;
    onCreateFolder(newName.trim());
    setNewName("");
    setCreating(false);
  }

  function submitRename(id: string) {
    if (renameError) return;
    onRenameFolder(id, editName.trim());
    setEditingId(null);
  }

  const rowBase = "w-full flex items-center gap-2 px-3.5 py-2.5 rounded-[10px] text-[13px] font-medium transition-colors cursor-pointer text-left";
  const rowActive = "bg-[#E5F1FF] text-[#007BFF]";
  const rowInactive = "text-[#3A4565] hover:bg-[#F4F6FB]";
  const nameInputClass = "flex-1 min-w-0 text-[13px] px-2.5 py-1.5 rounded-[8px] border border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] outline-none transition-colors focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] placeholder:text-[#5F6A88]";

  return (
    <div className="w-60 shrink-0 flex flex-col gap-0.5 pr-3 border-r border-[#E2E7F2]">
      <button type="button" onClick={onSelectAll} className={cn(rowBase, view === "all" && !activeFolderId ? rowActive : rowInactive)}>
        <StickyNote size={15} />
        All notes
      </button>

      <button type="button" onClick={onSelectShared} className={cn(rowBase, view === "shared" ? rowActive : rowInactive)}>
        <Users size={15} />
        Shared with me
      </button>

      {folders.map((folder) => (
        <div key={folder.id} className="group flex items-center">
          {editingId === folder.id ? (
            <div className="flex-1 flex flex-col gap-1 px-2 py-1">
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitRename(folder.id); if (e.key === "Escape") setEditingId(null); }}
                  className={nameInputClass}
                />
                <IconTip label="Save">
                  <button type="button" onClick={() => submitRename(folder.id)} disabled={!!renameError} aria-label="Save" className="p-1 rounded-full text-[#177E48] hover:bg-[#E3F5EA] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"><Check size={13} /></button>
                </IconTip>
                <IconTip label="Cancel">
                  <button type="button" onClick={() => setEditingId(null)} aria-label="Cancel" className="p-1 rounded-full text-[#5F6A88] hover:bg-[#F4F6FB] cursor-pointer"><X size={13} /></button>
                </IconTip>
              </div>
              {renameError && <p className="text-[11px] text-[#C0392B] px-0.5">{renameError}</p>}
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onSelectFolder(folder.id)}
                className={cn(rowBase, "flex-1 min-w-0", view === "all" && activeFolderId === folder.id ? rowActive : rowInactive)}
              >
                <Folder size={15} className="shrink-0" />
                <span className="truncate flex-1">{folder.name}</span>
                {/* Task 337 — persistent Public / shared indicator beside the count badge. */}
                {folder.visibility === "public" ? (
                  <span title="Public — visible to all staff" aria-label="Public folder" className="shrink-0 text-[#007BFF]">
                    <Globe size={12} />
                  </span>
                ) : (folder.shares?.length ?? 0) > 0 ? (
                  <span title={`Shared with ${folder.shares!.length} ${folder.shares!.length === 1 ? "person or role" : "people and roles"}`} aria-label="Shared folder" className="shrink-0 text-[#5F6A88]">
                    <Users size={12} />
                  </span>
                ) : null}
                <span className="text-[11px] font-medium text-[#5F6A88] bg-[#F4F6FB] rounded-full px-1.5 py-0.5 shrink-0">
                  {noteCountByFolder[folder.id] ?? 0}
                </span>
              </button>
              {canManageFolder(folder) && (
                <div className="hidden group-hover:flex items-center gap-0.5 pr-1 shrink-0">
                  <IconTip label={`Share ${folder.name}`}>
                    <button
                      type="button"
                      onClick={() => onShareFolder(folder.id)}
                      aria-label={`Share ${folder.name}`}
                      className="p-1 rounded-full text-[#5F6A88] hover:bg-[#F4F6FB] hover:text-[#007BFF] cursor-pointer"
                    >
                      <Share2 size={12} />
                    </button>
                  </IconTip>
                  <IconTip label={`Rename ${folder.name}`}>
                    <button
                      type="button"
                      onClick={() => { setEditingId(folder.id); setEditName(folder.name); }}
                      aria-label={`Rename ${folder.name}`}
                      className="p-1 rounded-full text-[#5F6A88] hover:bg-[#F4F6FB] hover:text-[#0B1533] cursor-pointer"
                    >
                      <Pencil size={12} />
                    </button>
                  </IconTip>
                  <IconTip label={`Delete ${folder.name}`}>
                    <button
                      type="button"
                      onClick={() => onDeleteFolder(folder.id)}
                      aria-label={`Delete ${folder.name}`}
                      className="p-1 rounded-full text-[#5F6A88] hover:bg-[#F4F6FB] hover:text-[#C0392B] cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </IconTip>
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {creating ? (
        <div className="flex flex-col gap-1 px-1 py-1">
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitCreate(); if (e.key === "Escape") setCreating(false); }}
              placeholder="Folder name"
              className={nameInputClass}
            />
            <IconTip label="Create folder">
              <button type="button" onClick={submitCreate} disabled={!!createError} aria-label="Create folder" className="p-1 rounded-full text-[#177E48] hover:bg-[#E3F5EA] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"><Check size={13} /></button>
            </IconTip>
            <IconTip label="Cancel">
              <button type="button" onClick={() => { setCreating(false); setNewName(""); }} aria-label="Cancel" className="p-1 rounded-full text-[#5F6A88] hover:bg-[#F4F6FB] cursor-pointer"><X size={13} /></button>
            </IconTip>
          </div>
          {createError && newName.trim() !== "" && <p className="text-[11px] text-[#C0392B] px-0.5">{createError}</p>}
        </div>
      ) : (
        <button type="button" onClick={() => setCreating(true)} className={cn(rowBase, rowInactive)}>
          <Plus size={15} />
          New folder
        </button>
      )}

      <div className="h-px bg-[#E2E7F2] my-1.5" />

      <button type="button" onClick={onSelectArchived} className={cn(rowBase, view === "archived" ? rowActive : rowInactive)}>
        <Archive size={15} />
        Archived
      </button>
    </div>
  );
}
