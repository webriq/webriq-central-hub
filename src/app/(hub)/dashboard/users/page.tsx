"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Mail, CheckCircle2, AlertCircle, UserCog, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { InviteUserModal } from "./_invite-user-modal";
import { UserRow, type DepartmentOption } from "./_user-row";
import { DeactivateUserDialog, membershipParts } from "./_deactivate-dialog";
import { useDeactivateUser, type DeactivationImpact } from "./_use-deactivate-user";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProfileRole = "admin" | "super_admin" | "hr" | "pm" | "developer" | "client";
export type SelectRole  = ProfileRole | "other" | "";

export interface HubUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;              // hub_users.role — display string, null = unassigned
  profile_role: ProfileRole | null; // profiles.role — auth enum
  full_name: string | null;
  avatar_url: string | null;
  status: string;
  is_invited: boolean;
  joined_at: string | null;
  external_id: string | null;
  created_at: string;
  otp_locked_until: string | null;
  department_id: string | null;
  department_name: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const ROLE_OPTIONS: { value: SelectRole; label: string }[] = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin",       label: "Admin" },
  { value: "hr",          label: "HR" },
  { value: "pm",          label: "PM" },
  { value: "developer",   label: "Developer" },
  { value: "client",      label: "Client" },
  { value: "other",       label: "Other" },
];

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
  const [showInvite, setShowInvite] = useState(false);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);

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

  useEffect(() => {
    let ignore = false;
    fetch("/api/departments")
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json() as { departments: DepartmentOption[] };
        if (!ignore) setDepartments(data.departments);
      })
      .catch(() => {});
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

  const handleDepartmentChange = useCallback(async (userId: string, departmentId: string | null) => {
    setSavingId(userId);
    try {
      const res = await fetch(`/api/v2/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department_id: departmentId }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        showToast(d.error ?? "Failed to update department", "err");
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                department_id: departmentId,
                department_name: departmentId ? departments.find((d) => d.id === departmentId)?.name ?? null : null,
              }
            : u
        )
      );
      showToast("Department updated");
    } catch {
      showToast("Failed to update department", "err");
    } finally {
      setSavingId(null);
    }
  }, [departments]);

  // Task 378 — deactivation is no longer a status flip: it bans the auth user, ends their
  // sessions and drops their project/phase memberships, so it goes through a confirmation
  // dialog with a pre-flight impact check. Reactivation is non-destructive and stays one-click.
  const handleDeactivated = useCallback((userId: string, impact: DeactivationImpact, sessionsCleared: boolean) => {
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, status: "inactive" } : u));
    const removed = membershipParts(impact);
    const base = removed.length > 0 ? `User deactivated — removed from ${removed.join(" and ")}` : "User deactivated";
    // sessionsCleared is false when the force_logout_user RPC failed — most likely because
    // migration 144 hasn't been applied yet. The ban already blocks their next sign-in either
    // way; this just tells the admin an existing open session may still work until it expires.
    showToast(sessionsCleared ? base : `${base}. Their existing session may still work until it expires.`);
  }, []);

  const handleReactivated = useCallback((userId: string) => {
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, status: "active" } : u));
    showToast("User activated");
  }, []);

  const deact = useDeactivateUser({
    onDeactivated: handleDeactivated,
    onReactivated: handleReactivated,
    onError: (message) => showToast(message, "err"),
  });

  const handleStatusToggle = useCallback((user: HubUser) => {
    if (user.status === "active") {
      deact.request(user);
      return;
    }
    void deact.reactivate(user.id);
  }, [deact]);

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
        <div className="flex items-center gap-4">
          <button
            onClick={loadUsers}
            disabled={loading}
            className="text-[12px] font-medium text-slate-500 hover:text-slate-900 transition-colors disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            onClick={() => setShowInvite(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FB914E] text-[#471F02] text-[12.5px] font-medium hover:bg-[#E2762F] hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <UserPlus size={15} /> Invite
          </button>
        </div>
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
                  {["Member", "Role", "Department", "Status", "Invite", "Joined", "Actions"].map((h) => (
                    <th key={h} className="text-left py-2.5 px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[13px] text-slate-400">
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
                      departments={departments}
                      onRoleChange={handleRoleChange}
                      onDepartmentChange={handleDepartmentChange}
                      onStatusToggle={handleStatusToggle}
                      statusBusyId={deact.busyId}
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

      {/* Deactivation confirmation (task 378) */}
      <DeactivateUserDialog
        pending={deact.pending}
        impact={deact.impact}
        loadingImpact={deact.loadingImpact}
        submitting={deact.submitting}
        onConfirm={() => void deact.confirm()}
        onCancel={deact.cancel}
      />

      {/* Invite modal */}
      {showInvite && (
        <InviteUserModal
          onClose={() => setShowInvite(false)}
          onInvited={(newUser) => {
            setUsers((prev) => [newUser, ...prev]);
            showToast(`Invitation sent to ${newUser.email}`);
          }}
        />
      )}
    </div>
  );
}
