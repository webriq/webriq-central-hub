"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssetFolder } from "./_wizard-v2-types";
import { textPrimary, textMuted, cardCls, fieldInputCls } from "./_shared-ui";

export function RenameModal({ initialValue, kind, onClose, onSubmit }: {
  initialValue: string; kind: "file" | "folder"; onClose: () => void; onSubmit: (value: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed) { setError("Enter a name."); return; }
    setSaving(true);
    const ok = await onSubmit(trimmed);
    setSaving(false);
    if (ok) onClose();
    else setError("Failed to rename — the name may already be in use.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071133]/60 p-4" onClick={onClose}>
      <div className={cn(cardCls, "w-full max-w-sm shadow-xl overflow-hidden")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#EDF0F7]">
          <h2 className={cn("text-[14px] font-semibold", textPrimary)}>Rename {kind === "folder" ? "folder" : "file"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={cn("p-2 rounded-md cursor-pointer border-none bg-transparent hover:bg-[#5F6A88]/10 transition-colors", textMuted)}>
            <X size={16} />
          </button>
        </div>
        <div className="p-5">
          <input autoFocus value={value} onChange={(e) => { setValue(e.target.value); setError(null); }} onKeyDown={(e) => e.key === "Enter" && submit()} className={fieldInputCls} />
          {error && <p className="text-[11px] text-[#C0392B] mt-1.5">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EDF0F7] bg-[#F4F6FB]">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer border-none bg-transparent text-[#3A4565] hover:bg-[#EDF0F7]">Cancel</button>
          <button type="button" onClick={submit} disabled={saving} className="px-4 py-2 rounded-lg bg-[#007BFF] text-white text-[13px] font-semibold cursor-pointer border-none hover:bg-[#0063D6] transition-colors disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MoveModal({ folders, currentFolderId, onClose, onSubmit }: {
  folders: AssetFolder[]; currentFolderId: string | null; onClose: () => void; onSubmit: (folderId: string) => Promise<void>;
}) {
  const [moving, setMoving] = useState<string | null>(null);
  const targets = folders.filter((f) => f.parent_folder_id === null && f.id !== currentFolderId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071133]/60 p-4" onClick={onClose}>
      <div className={cn(cardCls, "w-full max-w-sm shadow-xl overflow-hidden max-h-[80vh] overflow-y-auto")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#EDF0F7]">
          <h2 className={cn("text-[14px] font-semibold", textPrimary)}>Move to folder</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={cn("p-2 rounded-md cursor-pointer border-none bg-transparent hover:bg-[#5F6A88]/10 transition-colors", textMuted)}>
            <X size={16} />
          </button>
        </div>
        <div className="p-2">
          {targets.length === 0 ? (
            <p className={cn("text-[12.5px] px-3 py-4", textMuted)}>No other folders to move into.</p>
          ) : (
            targets.map((folder) => (
              <button
                key={folder.id}
                type="button"
                disabled={moving !== null}
                onClick={async () => { setMoving(folder.id); await onSubmit(folder.id); setMoving(null); onClose(); }}
                className="w-full text-left px-3.5 py-2.5 rounded-lg text-[13px] cursor-pointer border-none bg-transparent text-[#3A4565] hover:bg-[#EDF0F7] disabled:opacity-60"
              >
                {moving === folder.id ? "Moving…" : folder.name}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
