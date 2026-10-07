"use client";

import { useMemo, useState } from "react";
import { Lock, Trash2, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PersonAvatar, RoleChip, SharePicker, selectionCount, EMPTY_SELECTION, type ShareSelection } from "@/components/share-picker";
import { DRIVE_SHARE_ROLES } from "@/lib/drive/constants";
import type { DrivePermission, DrivePerson, DriveShare } from "@/lib/drive/types";
import { textMuted, textPrimary } from "./_reuse";
import { useDriveShares, type ShareTarget } from "./_use-drive-shares";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admins", super_admin: "Super admins", pm: "Project managers", developer: "Developers", hr: "HR", marketing: "Marketing",
};
const ROLE_OPTIONS = DRIVE_SHARE_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));
const select = "cursor-pointer rounded-[10px] border border-[#E2E7F2] bg-[#F4F6FB] px-2.5 py-1.5 text-[12.5px] text-[#0B1533] outline-none transition-colors focus:border-[#007BFF] focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,123,255,0.14)]";

function PermissionSelect({ value, onChange, label }: { value: DrivePermission; onChange: (v: DrivePermission) => void; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as DrivePermission)} className={select}>
      <option value="view">Can view</option>
      <option value="edit">Can edit</option>
    </select>
  );
}

// Navy = the selected option, per the design system's selection convention.
function PermissionToggle({ value, onChange }: { value: DrivePermission; onChange: (v: DrivePermission) => void }) {
  return (
    <div role="radiogroup" aria-label="Access level for new people" className="flex shrink-0 items-center rounded-full border border-[#E2E7F2] bg-white p-0.5">
      {(["view", "edit"] as const).map((p) => (
        <button
          key={p} type="button" role="radio" aria-checked={value === p} onClick={() => onChange(p)}
          className={cn("cursor-pointer rounded-full border-none px-3 py-1 text-[12px] font-semibold transition-colors", value === p ? "bg-[#071133] text-white" : "bg-transparent text-[#3A4565] hover:text-[#0B1533]")}
        >
          {p === "view" ? "Can view" : "Can edit"}
        </button>
      ))}
    </div>
  );
}

function AccessRow({ share, people, onPermission, onRemove }: {
  share: DriveShare; people: Map<string, DrivePerson>; onPermission: (v: DrivePermission) => void; onRemove: () => void;
}) {
  const person = share.user_id ? people.get(share.user_id) : undefined;
  const name = share.role ? ROLE_LABEL[share.role] ?? share.role : person?.full_name ?? "Unknown user";
  return (
    <li className="flex items-center gap-3 py-2.5">
      {share.role ? <RoleChip label={name} /> : <PersonAvatar id={share.user_id ?? name} name={name} size={30} avatarUrl={person?.avatar_url} />}
      <div className="min-w-0 flex-1">
        {share.role ? <p className={cn("text-[11px]", textMuted)}>Everyone with this role</p> : (
          <>
            <p className={cn("truncate text-[13px] font-medium", textPrimary)}>{name}</p>
            {person ? <p className={cn("text-[11px]", textMuted)}>{ROLE_LABEL[person.role] ?? person.role}</p> : null}
          </>
        )}
      </div>
      <PermissionSelect value={share.permission} onChange={onPermission} label={`Permission for ${name}`} />
      <button type="button" onClick={onRemove} aria-label={`Remove access for ${name}`}
        className="shrink-0 cursor-pointer rounded-md border-none bg-transparent p-1.5 text-[#5F6A88] transition-colors hover:bg-[#FDE8E6] hover:text-[#C0392B]">
        <Trash2 size={14} />
      </button>
    </li>
  );
}

// Task 436/438 — owner-only sharing. Empty means private (the inverse of Project Files' permission
// picker, where an empty list means everyone), so the header states which one it is. Recipients are
// chosen with the shared SharePicker: search, multi-select, role chips (a role hides its members).
export function ShareDialog({ target, people, meId, onClose, onCountChange }: {
  target: ShareTarget; people: DrivePerson[]; meId: string; onClose: () => void; onCountChange: (count: number) => void;
}) {
  const { shares, loading, busy, error, addMany, setPermission, remove } = useDriveShares(target, onCountChange);
  const [selection, setSelection] = useState<ShareSelection>(EMPTY_SELECTION);
  const [permission, setPermissionValue] = useState<DrivePermission>("view");
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const pickerPeople = useMemo(
    () => people.map((p) => ({ id: p.id, name: p.full_name ?? "Unnamed", role: p.role, roleLabel: ROLE_LABEL[p.role] ?? p.role, avatarUrl: p.avatar_url, inactive: p.inactive })),
    [people],
  );
  const excludeUserIds = useMemo(() => [meId, ...shares.flatMap((s) => (s.user_id ? [s.user_id] : []))], [meId, shares]);
  const excludeRoles = useMemo(() => shares.flatMap((s) => (s.role ? [s.role] : [])), [shares]);
  const count = selectionCount(selection);

  const submit = async () => {
    if (count === 0) return;
    setSelection(await addMany(selection, permission)); // failed targets stay selected for a retry
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071133]/60 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="share-dialog-title"
        className="flex max-h-[85vh] w-full max-w-[500px] flex-col overflow-hidden rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)]"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-[#EDF0F7] px-5 py-3.5">
          <div className="min-w-0">
            <h2 id="share-dialog-title" className={cn("truncate font-heading text-[15px] font-semibold tracking-[-0.01em]", textPrimary)}>Share {target.name}</h2>
            <p className={cn("mt-0.5 flex items-center gap-1.5 text-[12px]", textMuted)}>
              {shares.length === 0 ? <><Lock size={11} aria-hidden /> Only you can see this.</> : <><Users size={11} aria-hidden /> Shared with <span className="font-mono">{shares.length}</span> {shares.length === 1 ? "person or role" : "people and roles"}.</>}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={cn("cursor-pointer rounded-md border-none bg-transparent p-2 transition-colors hover:bg-[#5F6A88]/10", textMuted)}><X size={16} /></button>
        </div>

        <div className="flex flex-col gap-2.5 border-b border-[#EDF0F7] px-5 py-3.5">
          <SharePicker
            aria-label="People and roles to share with" roles={ROLE_OPTIONS} people={pickerPeople} value={selection} onChange={setSelection}
            excludeRoles={excludeRoles} excludeUserIds={excludeUserIds} disabled={busy}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <PermissionToggle value={permission} onChange={setPermissionValue} />
            <button type="button" onClick={submit} disabled={count === 0 || busy}
              className="shrink-0 cursor-pointer rounded-full border-none bg-[#007BFF] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#0063D6] disabled:cursor-not-allowed disabled:opacity-45">
              {busy ? "Sharing…" : count > 1 ? `Share with ${count}` : "Share"}
            </button>
          </div>
        </div>

        <div className="min-h-24 flex-1 overflow-y-auto px-5 py-2">
          {loading ? <p className={cn("py-4 text-[12.5px]", textMuted)}>Loading access…</p> : shares.length === 0 ? (
            <p className={cn("py-4 text-[12.5px]", textMuted)}>No one else has access yet. Add people or roles above.</p>
          ) : (
            <ul className="divide-y divide-[#EDF0F7]">
              {shares.map((s) => (
                <AccessRow key={s.id} share={s} people={peopleById} onPermission={(v) => setPermission(s.id, v)} onRemove={() => remove(s.id)} />
              ))}
            </ul>
          )}
          {error ? <p role="alert" className="py-2 text-[12px] text-[#C0392B]">{error}</p> : null}
        </div>

        <div className="flex justify-end border-t border-[#EDF0F7] bg-[#F4F6FB] px-5 py-3.5">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-full border border-[#E2E7F2] bg-white px-4 py-2 text-[12px] font-semibold text-[#3A4565] transition-colors hover:border-[#A8C6F5]">Done</button>
        </div>
      </div>
    </div>
  );
}
