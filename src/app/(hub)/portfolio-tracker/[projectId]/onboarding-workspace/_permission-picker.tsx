"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ASSET_ROLE_OPTIONS, StaffPerson } from "./_wizard-v2-types";
import { textMuted, fieldInputCls } from "./_shared-ui";

const ASSET_ROLE_LABELS: Record<string, string> = Object.fromEntries(ASSET_ROLE_OPTIONS.map((r) => [r.value, r.label]));

export function permissionSummary(allowedRoles: string[] | null, allowedUserIds: string[] | null): string {
  const roleRestricted = !!allowedRoles && allowedRoles.length > 0;
  const userRestricted = !!allowedUserIds && allowedUserIds.length > 0;
  if (!roleRestricted && !userRestricted) return "All roles";
  return [
    roleRestricted ? allowedRoles!.map((r) => ASSET_ROLE_LABELS[r] ?? r).join(", ") : null,
    userRestricted ? `${allowedUserIds!.length} ${allowedUserIds!.length === 1 ? "person" : "people"}` : null,
  ].filter(Boolean).join(" + ");
}

// Shared role-toggle + search-to-add person picker body — mirrors
// ../_onboarding-wizard.tsx's renderPersonPicker/role-pill shape (tasks 138/144). Used inside
// both the floating PermissionPicker (Access tab, bulk share) and InlinePermissionsPanel (Files
// tab tiles, matching the original's inline renderPermissionsPanel/renderFolderPermissionsPanel
// rather than a floating popover for that surface).
function PermissionFields({ allowedRoles, allowedUserIds, staffDirectory, onChange }: {
  allowedRoles: string[] | null; allowedUserIds: string[] | null; staffDirectory: StaffPerson[];
  onChange: (updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => void;
}) {
  const [personSearch, setPersonSearch] = useState("");
  const roles = allowedRoles ?? [];
  const userIds = allowedUserIds ?? [];
  const selectedPeople = userIds.map((id) => staffDirectory.find((p) => p.id === id)).filter((p): p is StaffPerson => !!p);
  const filteredPeople = staffDirectory.filter((p) => !userIds.includes(p.id)).filter((p) => (p.full_name ?? "").toLowerCase().includes(personSearch.toLowerCase()));

  return (
    <>
      <div className="flex flex-wrap gap-1.5 mb-2">
        <button
          type="button"
          onClick={() => onChange({ allowed_roles: [] })}
          className={cn("px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer transition-colors", roles.length === 0 ? "bg-[#007BFF] text-white border-[#007BFF]" : "bg-transparent text-[#5F6A88] border-[#E2E7F2]")}
        >
          All roles
        </button>
        {ASSET_ROLE_OPTIONS.map((role) => {
          const active = roles.includes(role.value);
          return (
            <button
              key={role.value}
              type="button"
              onClick={() => onChange({ allowed_roles: active ? roles.filter((r) => r !== role.value) : [...roles, role.value] })}
              className={cn("px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer transition-colors", active ? "bg-[#007BFF] text-white border-[#007BFF]" : "bg-transparent text-[#5F6A88] border-[#E2E7F2]")}
            >
              {role.label}
            </button>
          );
        })}
      </div>
      {selectedPeople.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedPeople.map((person) => (
            <span key={person.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-medium bg-[#E5F1FF] text-[#007BFF]">
              {person.full_name ?? "Unnamed"}
              <button
                type="button"
                onClick={() => onChange({ allowed_user_ids: userIds.filter((id) => id !== person.id) })}
                aria-label={`Remove ${person.full_name ?? "person"}`}
                className="p-1 rounded-full cursor-pointer border-none bg-transparent text-[#007BFF] hover:bg-[#E5F1FF]"
              >
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={personSearch}
        onChange={(e) => setPersonSearch(e.target.value)}
        placeholder="Search people to share with…"
        className={cn(fieldInputCls, "text-[12px] py-2")}
      />
      {personSearch && (
        <div className="mt-1 max-h-32 overflow-y-auto rounded-[8px] border border-[#E2E7F2]">
          {filteredPeople.length === 0 ? (
            <div className={cn("px-2.5 py-1.5 text-[11.5px]", textMuted)}>No matches.</div>
          ) : (
            filteredPeople.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => { onChange({ allowed_user_ids: [...userIds, person.id] }); setPersonSearch(""); }}
                className="w-full text-left px-2.5 py-1.5 text-[12px] cursor-pointer border-none bg-transparent text-[#3A4565] hover:bg-[#EDF0F7]"
              >
                {person.full_name ?? "Unnamed"}
              </button>
            ))
          )}
        </div>
      )}
    </>
  );
}

// Floating popover version — used by the Access tab's Credentials/Links list and the Files
// tab's bulk-selection Share action, where an always-visible per-row trigger fits the layout.
export function PermissionPicker({
  allowedRoles, allowedUserIds, staffDirectory, onChange, triggerLabel,
}: {
  allowedRoles: string[] | null;
  allowedUserIds: string[] | null;
  staffDirectory: StaffPerson[];
  onChange: (updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer transition-colors bg-white border-[#E2E7F2] text-[#5F6A88] hover:border-[#A8C6F5]"
      >
        {triggerLabel ?? permissionSummary(allowedRoles, allowedUserIds)}
      </button>
      {open && (
        <div className="absolute z-30 mt-1.5 right-0 w-72 rounded-[10px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,.10)] p-3.5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-semibold text-[#0B1533]">Visible to</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 rounded-md cursor-pointer border-none bg-transparent text-[#5F6A88] hover:bg-[#EDF0F7]">
              <X size={13} />
            </button>
          </div>
          <PermissionFields allowedRoles={allowedRoles} allowedUserIds={allowedUserIds} staffDirectory={staffDirectory} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

// Inline expandable panel — matches ../_onboarding-wizard.tsx's renderPermissionsPanel /
// renderFolderPermissionsPanel exactly (a bordered block rendered below the tile, opened via a
// "Permissions" menu item, not a floating popover). Used by the Files tab's file/folder tiles.
export function InlinePermissionsPanel({
  allowedRoles, allowedUserIds, staffDirectory, onChange, onClose,
}: {
  allowedRoles: string[] | null;
  allowedUserIds: string[] | null;
  staffDirectory: StaffPerson[];
  onChange: (updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 px-2.5 py-2 rounded-lg mt-1.5 border bg-[#F4F6FB] border-[#EDF0F7]">
      <div className="flex items-center justify-between">
        <span className={cn("text-[10px] font-semibold uppercase tracking-wide", textMuted)}>Permissions</span>
        <button type="button" onClick={onClose} aria-label="Close permissions" className={cn("p-1.5 rounded-md cursor-pointer border-none bg-transparent transition-colors hover:bg-[#E2E7F2]", textMuted)}>
          <X size={12} />
        </button>
      </div>
      <PermissionFields allowedRoles={allowedRoles} allowedUserIds={allowedUserIds} staffDirectory={staffDirectory} onChange={onChange} />
    </div>
  );
}
