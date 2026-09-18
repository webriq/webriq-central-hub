"use client";

import { Mail, CheckCircle2, Clock, Loader2, ToggleLeft, ToggleRight, Lock, LockOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_OPTIONS, type HubUser, type ProfileRole, type SelectRole } from "./page";

// ── Constants ─────────────────────────────────────────────────────────────────

// Keyed by select value (not profile_role) so "other" and "" get their own colours
const ROLE_BADGE: Record<string, string> = {
  "":             "bg-amber-50 text-amber-700 border-amber-200",
  "super_admin":  "bg-violet-50 text-violet-700 border-violet-200",
  "admin":        "bg-purple-50 text-purple-700 border-purple-200",
  "hr":           "bg-teal-50 text-teal-700 border-teal-200",
  "pm":           "bg-blue-50 text-blue-700 border-blue-200",
  "developer":    "bg-green-50 text-green-700 border-green-200",
  "client":       "bg-slate-50 text-slate-600 border-slate-200",
  "other":        "bg-orange-50 text-orange-700 border-orange-200",
};

const AVATAR_COLORS = ["#2563EB", "#7C3AED", "#0D9488", "#DC2626", "#D97706", "#0891B2"];

// ── Helpers ───────────────────────────────────────────────────────────────────

// Drive the select off hub_users.role (display string, nullable) so that imported users
// with hub_users.role = null show "--" even though profiles.role defaults to "client".
function getSelectValue(user: HubUser): SelectRole {
  if (!user.role) return "";
  if (user.role === "Other") return "other";
  return user.profile_role ?? "";
}

// /simplify pass (task 378): shared by getInitials below and by _deactivate-dialog.tsx, which
// previously carried its own copy of this same fallback expression.
export function getDisplayName(user: HubUser): string {
  return (user.full_name ?? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()) || user.email;
}

function getInitials(user: HubUser): string {
  const name = getDisplayName(user);
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function avatarColor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── Row ───────────────────────────────────────────────────────────────────────

export interface DepartmentOption {
  id: string;
  name: string;
}

interface RowProps {
  user: HubUser;
  idx: number;
  savingId: string | null;
  departments: DepartmentOption[];
  onRoleChange: (userId: string, role: SelectRole) => void;
  onDepartmentChange: (userId: string, departmentId: string | null) => void;
  // Task 378 — takes the whole row, not (id, status): deactivation opens a confirmation
  // dialog that needs the display name for its title.
  onStatusToggle: (user: HubUser) => void;
  statusBusyId: string | null;
  onInvite: (userId: string) => void;
  invitingId: string | null;
  viewerRole: ProfileRole | null;
  onUnlock: (userId: string) => void;
  unlockingId: string | null;
}

export function UserRow({
  user, idx, savingId, departments, onRoleChange, onDepartmentChange, onStatusToggle,
  statusBusyId, onInvite, invitingId, viewerRole, onUnlock, unlockingId,
}: RowProps) {
  const initials = getInitials(user);
  const displayName = getDisplayName(user);
  const isActive = user.status === "active";
  const isSaving = savingId === user.id;
  const isStatusBusy = statusBusyId === user.id;
  const isInviting = invitingId === user.id;
  const isLocked = !!user.otp_locked_until && new Date(user.otp_locked_until) > new Date();
  const isUnlocking = unlockingId === user.id;

  return (
    <tr className={cn("border-b border-slate-100 last:border-0 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-slate-50/40", "hover:bg-slate-50")}>
      {/* User */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-3 min-w-0">
          {user.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Supabase-auth-provider avatar URL, not a static/optimizable asset
            <img src={user.avatar_url} alt={displayName} className="flex h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : (
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
              style={{ background: avatarColor(user.id) }}
            >
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-slate-900 truncate">{displayName}</p>
            <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
          </div>
        </div>
      </td>

      {/* Role */}
      <td className="py-3 px-4">
        <div className="relative flex items-center gap-1.5">
          <select
            value={getSelectValue(user)}
            onChange={(e) => e.target.value && onRoleChange(user.id, e.target.value as SelectRole)}
            disabled={isSaving}
            className={cn(
              "text-[12px] font-medium border rounded-md px-2.5 py-1 pr-7 appearance-none cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-brand-orange",
              ROLE_BADGE[getSelectValue(user)] ?? ROLE_BADGE[""],
              isSaving && "opacity-50 cursor-not-allowed"
            )}
          >
            {!user.role && <option value="">--</option>}
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          {isSaving && <Loader2 size={12} className="animate-spin text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />}
        </div>
      </td>

      {/* Department */}
      <td className="py-3 px-4">
        <select
          value={user.department_id ?? ""}
          onChange={(e) => onDepartmentChange(user.id, e.target.value || null)}
          disabled={isSaving}
          className={cn(
            "text-[12px] font-medium border rounded-md px-2.5 py-1 pr-7 appearance-none cursor-pointer transition-colors bg-slate-50 text-slate-600 border-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-orange",
            isSaving && "opacity-50 cursor-not-allowed"
          )}
        >
          <option value="">--</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </td>

      {/* Status */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onStatusToggle(user)}
            disabled={isSaving || isStatusBusy}
            title={isActive ? "Click to deactivate" : "Click to activate"}
            className={cn(
              "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all cursor-pointer",
              isActive
                ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100",
              (isSaving || isStatusBusy) && "opacity-50 cursor-not-allowed pointer-events-none"
            )}
          >
            {isStatusBusy
              ? <Loader2 size={13} className="animate-spin" />
              : isActive
                ? <ToggleRight size={13} />
                : <ToggleLeft size={13} />
            }
            {isActive ? "Active" : "Inactive"}
          </button>
          {isLocked && (
            <span
              title={`Locked until ${new Date(user.otp_locked_until!).toLocaleTimeString()}`}
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-red-50 text-red-700 border-red-200"
            >
              <Lock size={12} />
              Locked
            </span>
          )}
        </div>
      </td>

      {/* Invite status */}
      <td className="py-3 px-4">
        {user.is_invited ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
            <CheckCircle2 size={11} />
            Invited
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
            <Clock size={11} />
            Pending
          </span>
        )}
      </td>

      {/* Joined */}
      <td className="py-3 px-4 text-[12px] text-slate-400 whitespace-nowrap">
        {formatDate(user.joined_at)}
      </td>

      {/* Actions */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
        {isLocked && viewerRole === "super_admin" && (
          <button
            onClick={() => onUnlock(user.id)}
            disabled={isUnlocking || isSaving}
            className={cn(
              "inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-all",
              "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 cursor-pointer",
              (isUnlocking || isSaving) && "opacity-50 cursor-not-allowed pointer-events-none"
            )}
          >
            {isUnlocking ? <Loader2 size={12} className="animate-spin" /> : <LockOpen size={12} />}
            {isUnlocking ? "Unlocking…" : "Unlock"}
          </button>
        )}
        {!user.is_invited && user.profile_role && (
          <button
            onClick={() => onInvite(user.id)}
            disabled={isInviting || isSaving}
            className={cn(
              "inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-all",
              "bg-brand-orange text-white hover:bg-brand-orange/90 shadow-sm cursor-pointer",
              (isInviting || isSaving) && "opacity-50 cursor-not-allowed pointer-events-none"
            )}
          >
            {isInviting ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
            {isInviting ? "Sending…" : "Send Invite"}
          </button>
        )}
        {!user.is_invited && !user.profile_role && (
          <span className="text-[11px] text-slate-400 italic">Assign a role first</span>
        )}
        {user.is_invited && (
          <button
            onClick={() => onInvite(user.id)}
            disabled={isInviting || isSaving}
            className={cn(
              "inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg transition-all",
              "bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer border border-slate-200",
              (isInviting || isSaving) && "opacity-50 cursor-not-allowed pointer-events-none"
            )}
          >
            {isInviting ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
            {isInviting ? "Sending…" : "Resend"}
          </button>
        )}
        </div>
      </td>
    </tr>
  );
}
