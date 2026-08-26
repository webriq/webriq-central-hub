"use client";

import { Pin, Archive, ArchiveRestore, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOTE_CARD_BG, NOTE_CARD_BORDER, getNotePermission, type NoteRow } from "./_notes-types";
import { IconTip } from "./_icon-tip";

// Task 311 — Keep-style note card (image 1). Pin toggle top-right, quick actions revealed on
// hover (archive/delete), "Shared by <author>" byline when the current viewer is a collaborator
// rather than the author, collaborator avatar-initial stack when the note has been shared out.
export function NoteCard({
  note,
  currentUserId,
  currentUserRole,
  onOpen,
  onTogglePin,
  onToggleArchive,
  onDelete,
}: {
  note: NoteRow;
  currentUserId: string;
  currentUserRole: string | null;
  onOpen: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  const permission = getNotePermission(note, currentUserId, currentUserRole);
  const isAuthor = note.created_by === currentUserId;
  const canDelete = permission === "owner";
  const canPin = permission !== "view";

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-[14px] border p-3.5 min-h-[140px] cursor-pointer transition-colors",
        NOTE_CARD_BG[note.color],
        NOTE_CARD_BORDER[note.color],
        "hover:shadow-[0_8px_24px_rgba(7,17,51,.10)]"
      )}
      onClick={onOpen}
    >
      {canPin && (
        <IconTip label={note.is_pinned ? "Unpin note" : "Pin note"}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
            aria-label={note.is_pinned ? "Unpin note" : "Pin note"}
            className={cn(
              "absolute top-2.5 right-2.5 p-1 rounded-full transition-colors cursor-pointer",
              note.is_pinned
                ? "text-[#007BFF] opacity-100"
                : "text-[#5F6A88] opacity-0 group-hover:opacity-100 hover:bg-black/[0.04]"
            )}
          >
            <Pin size={14} fill={note.is_pinned ? "currentColor" : "none"} />
          </button>
        </IconTip>
      )}

      {note.title && (
        <h3 className="text-[13px] font-semibold text-[#0B1533] pr-6 mb-1 line-clamp-2">{note.title}</h3>
      )}
      {note.content && (
        <div
          className="text-[13px] text-[#3A4565] line-clamp-6 flex-1 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5 [&_img]:max-w-full [&_img]:rounded-[8px] [&_img]:my-1.5"
          dangerouslySetInnerHTML={{ __html: note.content }}
        />
      )}
      {!note.title && !note.content && (
        <p className="text-[13px] text-[#5F6A88] italic flex-1">Empty note</p>
      )}

      {!isAuthor && (
        <p className="text-[11px] text-[#5F6A88] mt-2">
          Shared by {note.author?.full_name ?? "Unknown"}
        </p>
      )}

      <div className="flex items-center justify-between mt-1 pt-1 border-t border-transparent transition-colors group-hover:border-black/[0.08]">
        {note.collaborators.length > 0 ? (
          <div className="flex items-center gap-1 text-[#5F6A88]">
            <Users size={12} />
            <span className="text-[11px] font-medium">{note.collaborators.length}</span>
          </div>
        ) : <span />}

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {permission !== "view" && (
            <IconTip label={note.is_archived ? "Unarchive note" : "Archive note"}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleArchive(); }}
                aria-label={note.is_archived ? "Unarchive note" : "Archive note"}
                className="p-1 rounded-full text-[#5F6A88] hover:bg-black/[0.05] hover:text-[#0B1533] transition-colors cursor-pointer"
              >
                {note.is_archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
              </button>
            </IconTip>
          )}
          {canDelete && (
            <IconTip label="Delete note">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                aria-label="Delete note"
                className="p-1 rounded-full text-[#5F6A88] hover:bg-black/[0.05] hover:text-[#C0392B] transition-colors cursor-pointer"
              >
                <Trash2 size={13} />
              </button>
            </IconTip>
          )}
        </div>
      </div>
    </div>
  );
}
