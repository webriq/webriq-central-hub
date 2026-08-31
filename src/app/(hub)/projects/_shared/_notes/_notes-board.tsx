"use client";

import { StickyNote, Archive as ArchiveIcon, Plus, Users } from "lucide-react";
import { NoteCard } from "./_note-card";
import { NoteFolderRail, type NotesView } from "./_note-folder-rail";
import { NotesLoadingSkeleton } from "./_notes-loading-skeleton";
import type { NoteRow, NoteFolder } from "./_notes-types";
import type { LucideIcon } from "lucide-react";

// Task 311 — Keep-style main view (image 1): capture bar, folder rail, Pinned section above
// Others, or the Archived list when that view is selected. The capture bar's checkbox/palette/
// image icons are visual-only affordances matching the reference screenshot's "Take a note…"
// bar — clicking anywhere on the bar opens the full editor modal (checklist notes and inline
// image attachment are out of scope, see task doc).
export function NotesBoard({
  loading,
  pinnedNotes,
  otherNotes,
  archivedNotes,
  sharedNotes,
  folders,
  noteCountByFolder,
  view,
  activeFolderId,
  currentUserId,
  currentUserRole,
  canManageFolder,
  folderPermission,
  exposedFolderIds,
  onSelectAll,
  onSelectShared,
  onSelectFolder,
  onSelectArchived,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onShareFolder,
  onOpenComposer,
  onOpenNote,
  onTogglePin,
  onToggleArchive,
  onDelete,
}: {
  loading?: boolean;
  pinnedNotes: NoteRow[];
  otherNotes: NoteRow[];
  archivedNotes: NoteRow[];
  sharedNotes: NoteRow[];
  folders: NoteFolder[];
  noteCountByFolder: Record<string, number>;
  view: NotesView;
  activeFolderId: string | null;
  currentUserId: string;
  currentUserRole: string | null;
  canManageFolder: (folder: NoteFolder) => boolean;
  // Task 337 — folder-granted permission map + the set of folders that expose their public
  // notes, both threaded to every card so `getNotePermission` and the "Public" badge are right.
  folderPermission: Map<string, "view" | "edit">;
  exposedFolderIds: Set<string>;
  onSelectAll: () => void;
  onSelectShared: () => void;
  onSelectFolder: (folderId: string) => void;
  onSelectArchived: () => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onShareFolder: (folderId: string) => void;
  onOpenComposer: () => void;
  onOpenNote: (note: NoteRow) => void;
  onTogglePin: (note: NoteRow) => void;
  onToggleArchive: (note: NoteRow) => void;
  onDelete: (note: NoteRow) => void;
}) {
  const gridProps = { currentUserId, currentUserRole, folderPermission, exposedFolderIds, onOpen: onOpenNote, onTogglePin, onToggleArchive, onDelete };

  if (loading) return <NotesLoadingSkeleton />;

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden bg-[#F4F6FB]">
      <div className="p-5">
        <NoteFolderRail
          folders={folders}
          noteCountByFolder={noteCountByFolder}
          view={view}
          activeFolderId={activeFolderId}
          onSelectAll={onSelectAll}
          onSelectShared={onSelectShared}
          onSelectFolder={onSelectFolder}
          onSelectArchived={onSelectArchived}
          onCreateFolder={onCreateFolder}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
          onShareFolder={onShareFolder}
          canManageFolder={canManageFolder}
        />
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5">
        {view === "all" && (
          <button
            type="button"
            onClick={onOpenComposer}
            className="w-full max-w-xl mx-auto flex items-center px-4 py-3 rounded-[14px] border border-[#E2E7F2] bg-white text-left cursor-pointer transition-colors hover:shadow-[0_8px_24px_rgba(7,17,51,.10)] mb-6"
          >
            <span className="text-[13px] text-[#5F6A88]">Take a note…</span>
          </button>
        )}

        {view === "archived" ? (
          archivedNotes.length === 0 ? (
            <EmptyState icon={ArchiveIcon} label="No archived notes" hint="Notes you archive will show up here." />
          ) : (
            <NoteGrid notes={archivedNotes} {...gridProps} />
          )
        ) : view === "shared" ? (
          sharedNotes.length === 0 ? (
            <EmptyState icon={Users} label="No notes shared with you" hint="Notes teammates share with you will show up here." />
          ) : (
            <NoteGrid notes={sharedNotes} {...gridProps} />
          )
        ) : (
          <>
            {pinnedNotes.length > 0 && (
              <>
                <SectionLabel>Pinned</SectionLabel>
                <NoteGrid notes={pinnedNotes} {...gridProps} />
              </>
            )}
            {otherNotes.length > 0 && (
              <>
                {pinnedNotes.length > 0 && <SectionLabel>Others</SectionLabel>}
                <NoteGrid notes={otherNotes} {...gridProps} />
              </>
            )}
            {pinnedNotes.length === 0 && otherNotes.length === 0 && (
              <EmptyState
                icon={StickyNote}
                label="No notes yet"
                hint="Capture your first note for this project."
                action={{ label: "Take a note…", onClick: onOpenComposer }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold text-[#5F6A88] uppercase tracking-wide mb-2 mt-1">{children}</p>;
}

function NoteGrid({
  notes, currentUserId, currentUserRole, folderPermission, exposedFolderIds, onOpen, onTogglePin, onToggleArchive, onDelete,
}: {
  notes: NoteRow[];
  currentUserId: string;
  currentUserRole: string | null;
  folderPermission: Map<string, "view" | "edit">;
  exposedFolderIds: Set<string>;
  onOpen: (note: NoteRow) => void;
  onTogglePin: (note: NoteRow) => void;
  onToggleArchive: (note: NoteRow) => void;
  onDelete: (note: NoteRow) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 mb-6">
      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          folderPermission={folderPermission}
          isFolderExposed={note.folder_id != null && exposedFolderIds.has(note.folder_id)}
          onOpen={() => onOpen(note)}
          onTogglePin={() => onTogglePin(note)}
          onToggleArchive={() => onToggleArchive(note)}
          onDelete={() => onDelete(note)}
        />
      ))}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  label,
  hint,
  action,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-10 h-10 rounded-full bg-[#E2E7F2] flex items-center justify-center mb-3">
        <Icon size={18} className="text-[#5F6A88]" />
      </div>
      <p className="text-[13px] font-semibold text-[#0B1533] mb-1">{label}</p>
      <p className="text-[13px] text-[#5F6A88]">{hint}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex items-center gap-1.5 mt-3 text-[12px] font-semibold text-[#007BFF] hover:text-[#0063D6] cursor-pointer transition-colors"
        >
          <Plus size={13} /> {action.label}
        </button>
      )}
    </div>
  );
}
