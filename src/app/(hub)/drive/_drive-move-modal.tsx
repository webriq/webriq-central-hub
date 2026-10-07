"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DriveFolder } from "@/lib/drive/types";
import { textMuted, textPrimary } from "./_reuse";

export type MoveTarget = { id: string | null; name: string; depth: number };

// Indented flat tree of the folders a file may be moved into. `allowed` already encodes the rules
// (same owner as the file, edit access); `canMoveToRoot` is only true for the owner's own drive.
export function buildMoveTargets({
  folders, allowed, excludeId, canMoveToRoot, rootLabel,
}: { folders: DriveFolder[]; allowed: (f: DriveFolder) => boolean; excludeId: string | null; canMoveToRoot: boolean; rootLabel: string }): MoveTarget[] {
  const out: MoveTarget[] = canMoveToRoot && excludeId !== null ? [{ id: null, name: `${rootLabel} (top level)`, depth: 0 }] : [];
  const loaded = new Set(folders.map((f) => f.id));
  const seen = new Set<string>();
  const walk = (level: DriveFolder[], depth: number) => {
    for (const f of level) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      if (allowed(f) && f.id !== excludeId) out.push({ id: f.id, name: f.name, depth });
      walk(folders.filter((c) => c.parent_folder_id === f.id), f.id === excludeId ? depth : depth + 1);
    }
  };
  // Roots = no parent, or a parent the caller can't see (the top of a shared subtree).
  walk(folders.filter((f) => !f.parent_folder_id || !loaded.has(f.parent_folder_id)), 0);
  return out;
}

export function DriveMoveModal({ targets, onClose, onSubmit }: {
  targets: MoveTarget[]; onClose: () => void; onSubmit: (folderId: string | null) => Promise<void>;
}) {
  const [moving, setMoving] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071133]/60 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Move to folder"
        className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)]"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-[#EDF0F7] px-5 py-3.5">
          <h2 className={cn("text-[14px] font-semibold", textPrimary)}>Move to folder</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={cn("cursor-pointer rounded-md border-none bg-transparent p-2 transition-colors hover:bg-[#5F6A88]/10", textMuted)}><X size={16} /></button>
        </div>
        <div className="p-2">
          {targets.length === 0 ? (
            <p className={cn("px-3 py-4 text-[12.5px]", textMuted)}>No other folder to move into.</p>
          ) : targets.map((t) => {
            const key = t.id ?? "root";
            return (
              <button
                key={key} type="button" disabled={moving !== null}
                onClick={async () => { setMoving(key); await onSubmit(t.id); setMoving(null); onClose(); }}
                className="w-full cursor-pointer rounded-lg border-none bg-transparent py-2.5 pr-3.5 text-left text-[13px] text-[#3A4565] transition-colors hover:bg-[#EDF0F7] disabled:opacity-60"
                // Indent by tree depth — a computed value Tailwind can't express statically.
                style={{ paddingLeft: 14 + t.depth * 16 }}
              >
                {moving === key ? "Moving…" : t.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
