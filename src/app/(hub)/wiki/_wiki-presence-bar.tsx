"use client";

import { Mail, PencilLine, RefreshCw, FileClock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WikiContributor, WikiDraftHolder, WikiPresenceState } from "@/types/wiki";
import { WikiAvatar } from "./_wiki-avatar";

// Task 402 — the doc header's awareness strip: who is editing this page right now (Realtime
// Presence), who has unsaved draft changes on it (server drafts), who else is just viewing,
// and a "newer version saved" notice (Realtime Broadcast). Every person is reachable via a
// mailto link so the reader can ask them directly before editing over their work.

export type WikiStaleNotice = { byName: string; revision: number };

function relative(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

function MailLink({ name, email }: { name: string; email: string | null }) {
  if (!email) return null;
  return (
    <a
      href={`mailto:${email}`}
      aria-label={`Email ${name}`}
      title={email}
      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-current opacity-70 hover:opacity-100 hover:bg-white/70 transition-colors"
    >
      <Mail size={11} />
    </a>
  );
}

export function WikiPresenceBar({
  editors,
  viewers,
  draftHolders,
  knownPeople,
  pageRevision,
  staleNotice,
  editMode,
  onReload,
}: {
  editors: WikiPresenceState[];
  viewers: WikiPresenceState[];
  draftHolders: WikiDraftHolder[];
  // Task 403 — server-resolved people on this page (owner, last editor, contributors), used as an
  // avatar fallback when a presence entry has none (a tab loaded before `avatarUrl` was tracked).
  knownPeople: WikiContributor[];
  pageRevision: number;
  staleNotice: WikiStaleNotice | null;
  editMode: boolean;
  onReload: () => void;
}) {
  // Someone editing live already shows in the editors row — don't repeat them as a draft holder.
  const liveIds = new Set(editors.map((e) => e.userId));
  const idleDrafts = draftHolders.filter((h) => !liveIds.has(h.id));

  const knownAvatars = new Map<string, string>();
  for (const person of [...knownPeople, ...draftHolders]) {
    if (person.avatarUrl) knownAvatars.set(person.id, person.avatarUrl);
  }
  const presenceAvatar = (entry: WikiPresenceState) => entry.avatarUrl || knownAvatars.get(entry.userId) || null;

  if (editors.length === 0 && idleDrafts.length === 0 && viewers.length === 0 && !staleNotice) return null;

  return (
    <div className="flex flex-col gap-1.5 mb-4" aria-live="polite">
      {staleNotice && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px]",
            editMode ? "border-[#F3D48A] bg-[#FFF8E6] text-[#8A5A00]" : "border-[#D7E3FF] bg-[#EEF3FF] text-[#243B6B]"
          )}
        >
          <RefreshCw size={12} className="shrink-0" />
          <span className="flex-1">
            {editMode
              ? `${staleNotice.byName} saved a newer version. When you save, you'll be asked to review the differences.`
              : `${staleNotice.byName} updated this page.`}
          </span>
          {!editMode && (
            <button
              type="button"
              onClick={onReload}
              className="text-[12px] font-semibold text-[#0063D6] hover:text-[#0B1533] cursor-pointer transition-colors"
            >
              Reload
            </button>
          )}
        </div>
      )}

      {editors.map((editor) => (
        <div key={editor.userId} className="flex items-center gap-2 rounded-[10px] border border-[#F3D48A] bg-[#FFF8E6] px-3 py-1.5 text-[12px] text-[#8A5A00]">
          <PencilLine size={12} className="shrink-0" />
          <WikiAvatar contributor={{ id: editor.userId, name: editor.name, avatarUrl: presenceAvatar(editor) }} size="sm" />
          <span className="flex-1">
            <span className="font-semibold">{editor.name}</span> is editing now · {relative(editor.since)}
          </span>
          <MailLink name={editor.name} email={editor.email} />
        </div>
      ))}

      {idleDrafts.map((holder) => (
        <div key={holder.id} className="flex items-center gap-2 rounded-[10px] border border-[#E2E7F2] bg-[#FAFBFE] px-3 py-1.5 text-[12px] text-[#5F6A88]">
          <FileClock size={12} className="shrink-0" />
          <WikiAvatar contributor={{ id: holder.id, name: holder.name, avatarUrl: holder.avatarUrl }} size="sm" />
          <span className="flex-1">
            <span className="font-semibold text-[#0B1533]">{holder.name}</span> has unsaved draft changes · {relative(holder.updatedAt)} ago
            {holder.baseRevision < pageRevision && " (based on an older version)"}
          </span>
          <MailLink name={holder.name} email={holder.email} />
        </div>
      ))}

      {viewers.length > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-[#94A3B8] px-1">
          <span>Also viewing</span>
          <div className="flex">
            {viewers.slice(0, 6).map((viewer) => (
              <WikiAvatar key={viewer.userId} contributor={{ id: viewer.userId, name: viewer.name, avatarUrl: presenceAvatar(viewer) }} size="sm" overlap />
            ))}
          </div>
          {viewers.length > 6 && <span>+{viewers.length - 6}</span>}
        </div>
      )}
    </div>
  );
}
