"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Mail, User, ShieldCheck, Building2 } from "lucide-react";
import { ROLE_OPTIONS, type HubUser, type SelectRole } from "./page";
import type { DepartmentOption } from "./_user-row";
import { DEPARTMENT_INVITE_ROLES, type DepartmentName } from "@/lib/auth/department-map";

// Modal shell/token pattern matches `projects/_shared/_create-task-modal.tsx` — the
// codebase's existing precedent for translating `_final_design/guide/` tokens into
// literal Tailwind arbitrary hex values (task 365).
const inputClass =
  "w-full pl-10 pr-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]";
const labelClass = "text-[11px] font-semibold text-[#0B1533]";

export function InviteUserModal({
  onClose,
  onInvited,
}: {
  onClose: () => void;
  onInvited: (user: HubUser) => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [role, setRole] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);

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

  const selectedDepartmentName = departments.find((d) => d.id === departmentId)?.name as DepartmentName | undefined;
  const availableRoles: SelectRole[] = selectedDepartmentName ? DEPARTMENT_INVITE_ROLES[selectedDepartmentName] : [];

  function handleDepartmentChange(newDepartmentId: string) {
    setDepartmentId(newDepartmentId);
    const newDeptName = departments.find((d) => d.id === newDepartmentId)?.name as DepartmentName | undefined;
    const newAvailableRoles: SelectRole[] = newDeptName ? DEPARTMENT_INVITE_ROLES[newDeptName] : [];
    if (role && !(newAvailableRoles as string[]).includes(role)) {
      setRole("");
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!departmentId) {
      setError("Select a department.");
      return;
    }
    if (!role) {
      setError("Select a role.");
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/hub-users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role, fullName: fullName.trim() || undefined, departmentId }),
      });
      const d = await res.json() as { user?: HubUser; error?: string };
      if (!res.ok || !d.user) {
        setError(d.error ?? "Failed to send invite.");
        setSaving(false);
        return;
      }
      onInvited(d.user);
      onClose();
    } catch {
      setError("Failed to send invite. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1533]/40 p-4" onClick={saving ? undefined : onClose}>
      <div
        className="w-full max-w-md rounded-[14px] bg-white shadow-xl border border-[#E2E7F2] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDF0F7] shrink-0">
          <h2 className="text-[15px] font-semibold text-[#0B1533]">Invite user</h2>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1 rounded-md text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#F4F6FB] cursor-pointer transition-colors disabled:opacity-45 disabled:pointer-events-none"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="p-5 flex flex-col gap-4">
            <p className="text-[13px] text-[#3A4565]">
              Create an account and send an invitation email with a link to set their password.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="invite-department" className={labelClass}>Department</label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5F6A88]" aria-hidden />
                <select
                  id="invite-department"
                  required
                  autoFocus
                  value={departmentId}
                  onChange={(e) => handleDepartmentChange(e.target.value)}
                  disabled={saving}
                  className={`${inputClass} appearance-none cursor-pointer`}
                >
                  <option value="" disabled>Select a department…</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="invite-role" className={labelClass}>Role</label>
              <div className="relative">
                <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5F6A88] pointer-events-none" aria-hidden />
                <select
                  id="invite-role"
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={saving || !departmentId}
                  className={`${inputClass} appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  <option value="" disabled>
                    {departmentId ? "Select a role…" : "Select a department first…"}
                  </option>
                  {ROLE_OPTIONS.filter((r) => r.value !== "other" && availableRoles.includes(r.value)).map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="invite-email" className={labelClass}>Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5F6A88]" aria-hidden />
                <input
                  id="invite-email"
                  type="email"
                  required
                  placeholder="ada@webriq.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={saving}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="invite-fullname" className={labelClass}>Full name (optional)</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5F6A88]" aria-hidden />
                <input
                  id="invite-fullname"
                  type="text"
                  placeholder="Ada Lovelace"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={saving}
                  className={inputClass}
                />
              </div>
            </div>

            {error && <p className="text-[12px] text-[#C0392B]">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EDF0F7] bg-[#F4F6FB] shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-full text-[13px] text-[#3A4565] bg-white border border-[#E2E7F2] hover:border-[#A8C6F5] cursor-pointer transition-colors disabled:opacity-45 disabled:pointer-events-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#007BFF] text-white text-[13px] font-medium hover:bg-[#0063D6] disabled:opacity-45 disabled:pointer-events-none cursor-pointer transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Sending…" : "Send invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
