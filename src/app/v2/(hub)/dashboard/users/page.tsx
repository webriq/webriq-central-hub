"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Mail, CheckCircle2, Clock, Loader2, AlertCircle, UserCog, ToggleLeft, ToggleRight, Lock, LockOpen } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProfileRole = "admin" | "super_admin" | "hr" | "pm" | "developer" | "client";
type SelectRole  = ProfileRole | "other" | "";

interface HubUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;              // hub_users.role — display string, null = unassigned
  profile_role: ProfileRole | null; // profiles.role — auth enum
  full_name: string | null;
  status: string;
  is_invited: boolean;
  joined_at: string | null;
  external_id: string | null;
  created_at: string;
  otp_locked_until: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_OPTIONS: { value: SelectRole; label: string }[] = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin",       label: "Admin" },
  { value: "hr",          label: "HR" },
  { value: "pm",          label: "PM" },
  { value: "developer",   label: "Developer" },
  { value: "client",      label: "Client" },
  { value: "other",       label: "Other" },
];

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

// ── Helpers ───────────────────────────────────────────────────────────────────

// Drive the select off hub_users.role (display string, nullable) so that imported users
// with hub_users.role = null show "--" even though profiles.role defaults to "client".
function getSelectValue(user: HubUser): SelectRole {
  if (!user.role) return "";
  if (user.role === "Other") return "other";
  return user.profile_role ?? "";
}

function getInitials(user: HubUser): string {
  const name = user.full_name ?? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  if (!name) return user.email.slice(0, 2).toUpperCase();
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const AVATAR_COLORS = ["#2563EB", "#7C3AED", "#0D9488", "#DC2626", "#D97706", "#0891B2"];

function avatarColor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── KPI Cards ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-5 flex items-center gap-4">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", accent)}>
        {icon}
      </div>
      <div>
        <p className="text-[12px] font-medium text-slate-500">{label}</p>
        <p className="text-[26px] font-bold text-slate-900 leading-tight">{value}</p>
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

interface RowProps {
  user: HubUser;
  idx: number;
  savingId: string | null;
  toastMsg: string | null;
  onRoleChange: (userId: string, role: SelectRole) => void;
  onStatusToggle: (userId: string, current: string) => void;
  onInvite: (userId: string) => void;
  invitingId: string | null;
  viewerRole: ProfileRole | null;
  onUnlock: (userId: string) => void;
  unlockingId: string | null;
}

function UserRow({ user, idx, savingId, onRoleChange, onStatusToggle, onInvite, invitingId, viewerRole, onUnlock, unlockingId }: RowProps) {
  const initials = getInitials(user);
  const displayName =
    (user.full_name ?? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()) || user.email;
  const isActive = user.status === "active";
  const isSaving = savingId === user.id;
  const isInviting = invitingId === user.id;
  const isLocked = !!user.otp_locked_until && new Date(user.otp_locked_until) > new Date();
  const isUnlocking = unlockingId === user.id;

  return (
    <tr className={cn("border-b border-slate-100 last:border-0 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-slate-50/40", "hover:bg-slate-50")}>
      {/* User */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
            style={{ background: avatarColor(user.id) }}
          >
            {initials}
          </div>
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

      {/* Status */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onStatusToggle(user.id, user.status)}
            disabled={isSaving}
            title={isActive ? "Click to deactivate" : "Click to activate"}
            className={cn(
              "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all cursor-pointer",
              isActive
                ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100",
              isSaving && "opacity-50 cursor-not-allowed pointer-events-none"
            )}
          >
            {isActive
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers] = useState<HubUser[]>([]);
  const [viewerRole, setViewerRole] = useState<ProfileRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [search, setSearch] = useState("");

  function showToast(msg: string, type: "ok" | "err" = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const fetchAndSetUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/users");
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setFetchError(d.error ?? `HTTP ${res.status}`);
        return;
      }
      const data = await res.json() as { viewerRole: ProfileRole; users: HubUser[] };
      setUsers(data.users);
      setViewerRole(data.viewerRole);
      setFetchError(null);
    } catch {
      setFetchError("Failed to load users. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(() => {
    setLoading(true);
    setFetchError(null);
    void fetchAndSetUsers();
  }, [fetchAndSetUsers]);

  // Mount-only fetch, inlined (rather than calling fetchAndSetUsers) so no setState
  // setter is reachable synchronously from the effect body — `loading` already
  // defaults to true, so nothing needs to run before the fetch's own .then()/.catch().
  useEffect(() => {
    let ignore = false;
    fetch("/api/v2/users")
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json() as { error?: string };
          if (!ignore) setFetchError(d.error ?? `HTTP ${res.status}`);
          return;
        }
        const data = await res.json() as { viewerRole: ProfileRole; users: HubUser[] };
        if (!ignore) {
          setUsers(data.users);
          setViewerRole(data.viewerRole);
          setFetchError(null);
        }
      })
      .catch(() => { if (!ignore) setFetchError("Failed to load users. Please refresh."); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  const handleRoleChange = useCallback(async (userId: string, role: SelectRole) => {
    setSavingId(userId);
    try {
      const res = await fetch(`/api/v2/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        showToast(d.error ?? "Failed to update role", "err");
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                profile_role: role === "other" ? "client" : role as ProfileRole,
                role: ROLE_OPTIONS.find((r) => r.value === role)?.label ?? u.role,
              }
            : u
        )
      );
      showToast("Role updated");
    } catch {
      showToast("Failed to update role", "err");
    } finally {
      setSavingId(null);
    }
  }, []);

  const handleStatusToggle = useCallback(async (userId: string, current: string) => {
    const next = current === "active" ? "inactive" : "active";
    setSavingId(userId);
    try {
      const res = await fetch(`/api/v2/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        showToast(d.error ?? "Failed to update status", "err");
        return;
      }
      setUsers((prev) =>
        prev.map((u) => u.id === userId ? { ...u, status: next } : u)
      );
      showToast(`User ${next === "active" ? "activated" : "deactivated"}`);
    } catch {
      showToast("Failed to update status", "err");
    } finally {
      setSavingId(null);
    }
  }, []);

  const handleUnlock = useCallback(async (userId: string) => {
    setUnlockingId(userId);
    try {
      const res = await fetch(`/api/v2/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unlockOtp: true }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        showToast(d.error ?? "Failed to unlock account", "err");
        return;
      }
      setUsers((prev) =>
        prev.map((u) => u.id === userId ? { ...u, otp_locked_until: null } : u)
      );
      showToast("Account unlocked");
    } catch {
      showToast("Failed to unlock account", "err");
    } finally {
      setUnlockingId(null);
    }
  }, []);

  const handleInvite = useCallback(async (userId: string) => {
    setInvitingId(userId);
    try {
      const res = await fetch(`/api/admin/hub-users/${userId}/invite`, { method: "POST" });
      const d = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || d.error) {
        showToast(d.error ?? "Failed to send invite", "err");
        return;
      }
      setUsers((prev) =>
        prev.map((u) => u.id === userId ? { ...u, is_invited: true } : u)
      );
      showToast("Invite sent successfully");
    } catch {
      showToast("Failed to send invite", "err");
    } finally {
      setInvitingId(null);
    }
  }, []);

  // Derived stats
  const totalUsers = users.length;
  const invitedCount = users.filter((u) => u.is_invited).length;
  const unassignedCount = users.filter((u) => !u.profile_role).length;
  const activeCount = users.filter((u) => u.status === "active").length;

  // Filter
  const filtered = search.trim()
    ? users.filter((u) => {
        const q = search.toLowerCase();
        return (
          u.email.toLowerCase().includes(q) ||
          (u.full_name ?? "").toLowerCase().includes(q) ||
          (`${u.first_name ?? ""} ${u.last_name ?? ""}`).toLowerCase().includes(q) ||
          (u.profile_role ?? "").includes(q)
        );
      })
    : users;

  return (
    <div className="py-6.5 px-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <UserCog size={20} className="text-slate-500" />
            Users
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            Manage team members, roles, and account invitations.
          </p>
        </div>
        <button
          onClick={loadUsers}
          disabled={loading}
          className="text-[12px] font-medium text-slate-500 hover:text-slate-900 transition-colors disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Users" value={totalUsers} icon={<Users size={18} className="text-blue-600" />} accent="bg-blue-50" />
        <KpiCard label="Active" value={activeCount} icon={<CheckCircle2 size={18} className="text-green-600" />} accent="bg-green-50" />
        <KpiCard label="Invited" value={invitedCount} icon={<Mail size={18} className="text-brand-orange" />} accent="bg-orange-50" />
        <KpiCard label="Unassigned" value={unassignedCount} icon={<AlertCircle size={18} className="text-amber-600" />} accent="bg-amber-50" />
      </div>

      {/* Table card */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
        {/* Table header + search */}
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-100">
          <span className="text-[13px] font-semibold text-slate-900">
            {filtered.length === users.length
              ? `${users.length} member${users.length !== 1 ? "s" : ""}`
              : `${filtered.length} of ${users.length} members`}
          </span>
          <input
            type="search"
            placeholder="Search by name, email or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-52 rounded-md border border-slate-200 bg-slate-50 px-3 text-[12px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-colors"
          />
        </div>

        {/* Body */}
        {loading ? (
          <div className="space-y-2 p-5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : fetchError ? (
          <div className="flex items-center gap-2 px-5 py-10 text-sm text-red-600">
            <AlertCircle size={16} />
            {fetchError}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  {["Member", "Role", "Status", "Invite", "Joined", "Actions"].map((h) => (
                    <th key={h} className="text-left py-2.5 px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[13px] text-slate-400">
                      {search ? "No users match your search." : "No users found."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((user, i) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      idx={i}
                      savingId={savingId}
                      toastMsg={null}
                      onRoleChange={handleRoleChange}
                      onStatusToggle={handleStatusToggle}
                      onInvite={handleInvite}
                      invitingId={invitingId}
                      viewerRole={viewerRole}
                      onUnlock={handleUnlock}
                      unlockingId={unlockingId}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 text-[13px] font-medium shadow-lg border transition-all",
            toast.type === "ok"
              ? "bg-white text-slate-900 border-slate-200"
              : "bg-red-50 text-red-700 border-red-200"
          )}
        >
          {toast.type === "ok"
            ? <CheckCircle2 size={15} className="text-green-600 shrink-0" />
            : <AlertCircle size={15} className="text-red-600 shrink-0" />
          }
          {toast.msg}
        </div>
      )}
    </div>
  );
}
