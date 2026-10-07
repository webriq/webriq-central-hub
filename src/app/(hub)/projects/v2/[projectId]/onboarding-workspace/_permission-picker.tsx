"use client";

import { useMemo } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SharePicker, useAnchoredMenu, type ShareSelection } from "@/components/share-picker";
import { ASSET_ROLE_OPTIONS, StaffPerson } from "./_wizard-v2-types";
import { textMuted } from "./_shared-ui";

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

// Task 438 — the picker body is the shared SharePicker (searchable, multi-select, role chips; a
// selected role hides its members). Semantics are unchanged: an EMPTY selection means "all roles"
// (shown as a muted pseudo-chip) and every change applies immediately — there is no Share button
// here. Used inside both the floating PermissionPicker (Access tab, bulk share) and
// InlinePermissionsPanel (Files tab tiles).
const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

function PermissionFields({ allowedRoles, allowedUserIds, staffDirectory, onChange }: {
  allowedRoles: string[] | null; allowedUserIds: string[] | null; staffDirectory: StaffPerson[];
  onChange: (updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => void;
}) {
  const roleOptions = useMemo(() => ASSET_ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label })), []);
  const people = useMemo(
    () => staffDirectory.map((p) => ({ id: p.id, name: p.full_name ?? "Unnamed", role: p.role, roleLabel: ASSET_ROLE_LABELS[p.role], avatarUrl: p.avatar_url, inactive: p.inactive })),
    [staffDirectory],
  );
  const roles = allowedRoles ?? [];
  const userIds = allowedUserIds ?? [];

  const handleChange = (next: ShareSelection) => {
    const updates: { allowed_roles?: string[]; allowed_user_ids?: string[] } = {};
    if (!sameIds(next.roles, roles)) updates.allowed_roles = next.roles;
    if (!sameIds(next.userIds, userIds)) updates.allowed_user_ids = next.userIds;
    if (Object.keys(updates).length > 0) onChange(updates);
  };

  return (
    <SharePicker
      aria-label="Visible to" roles={roleOptions} people={people} value={{ roles, userIds }} onChange={handleChange}
      emptyLabel="All roles" placeholder="Add people or roles…"
    />
  );
}

// Floating popover version — used by the Access tab's Credentials/Links list and the Files tab's
// bulk-selection Share action. Task 438: portaled + fixed via useAnchoredMenu, so it opens upward
// when there isn't room below (it used to be `absolute mt-1.5 right-0` and ran off the screen).
export function PermissionPicker({
  allowedRoles, allowedUserIds, staffDirectory, onChange, triggerLabel,
}: {
  allowedRoles: string[] | null;
  allowedUserIds: string[] | null;
  staffDirectory: StaffPerson[];
  onChange: (updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => void;
  triggerLabel?: string;
}) {
  const { anchorRef, menuRef, open, show, hide, menuStyle } = useAnchoredMenu({ width: 288, align: "end" });

  return (
    <div className="relative" ref={anchorRef}>
      <button
        type="button"
        onClick={() => (open ? hide() : show())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer transition-colors bg-white border-[#E2E7F2] text-[#5F6A88] hover:border-[#A8C6F5]"
      >
        {triggerLabel ?? permissionSummary(allowedRoles, allowedUserIds)}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              style={menuStyle}
              role="dialog"
              aria-label="Visible to"
              className="z-[70] flex flex-col overflow-visible rounded-[10px] border border-[#E2E7F2] bg-white p-3.5 shadow-[0_8px_24px_rgba(7,17,51,.10)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-semibold text-[#0B1533]">Visible to</span>
                <button type="button" onClick={hide} aria-label="Close" className="p-1 rounded-md cursor-pointer border-none bg-transparent text-[#5F6A88] hover:bg-[#EDF0F7]">
                  <X size={13} />
                </button>
              </div>
              <PermissionFields allowedRoles={allowedRoles} allowedUserIds={allowedUserIds} staffDirectory={staffDirectory} onChange={onChange} />
            </div>,
            document.body,
          )
        : null}
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
