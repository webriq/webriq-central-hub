"use client";

import { cn } from "@/lib/utils";
import { usePMSettings } from "@/hooks/use-pm-settings";

const ROLE_BADGE_LIGHT: Record<string, string> = {
  admin:   "bg-red-50 text-red-700 border border-red-200",
  pm:      "bg-blue-50 text-blue-700 border border-blue-200",
  dev:     "bg-green-50 text-green-700 border border-green-200",
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
};
const ROLE_BADGE_DARK: Record<string, string> = {
  admin:   "text-red-400 bg-red-500/15 border border-red-500/20",
  pm:      "text-blue-400 bg-blue-500/15 border border-blue-500/20",
  dev:     "text-green-400 bg-green-500/15 border border-green-500/20",
  pending: "text-amber-400 bg-amber-500/15 border border-amber-500/20",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

type HubUser = {
  id: string;
  email: string | null;
  role: string;
  display_name: string | null;
  zoho_user_id: string | null;
  created_at: string;
};

interface UsersTableProps {
  users: HubUser[];
  currentUserId: string;
  approveAction: (formData: FormData) => Promise<void>;
}

export default function UsersTable({ users, currentUserId, approveAction }: UsersTableProps) {
  const { settings } = usePMSettings();
  const isDark = settings.theme === "dark";
  const pendingCount = users.filter((u) => u.role === "pending").length;

  return (
    <div className="flex-1 overflow-y-auto py-6.5 px-8">
      <div className="mb-6">
        <h1 className={cn("text-xl font-bold", isDark ? "text-white" : "text-slate-900")}>Users</h1>
        <p className="text-[13px] text-slate-400 mt-0.5">
          {users.length} registered users
          {pendingCount > 0 && (
            <span className="ml-2 text-amber-600 font-semibold">· {pendingCount} pending approval</span>
          )}
        </p>
      </div>

      <div className={cn("rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden", isDark ? "bg-[#121726] border border-white/[0.08]" : "bg-white border border-slate-200")}>
        <table className="w-full text-sm">
          <thead>
            <tr className={cn("border-b", isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-slate-100 bg-slate-50")}>
              {["User", "Role", "Zoho ID", "Joined", "Actions"].map((h) => (
                <th key={h} className="text-left py-3 px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-[13px] text-slate-400">No users found.</td>
              </tr>
            ) : users.map((user, i) => (
              <tr key={user.id} className={cn("border-b last:border-0", isDark ? "border-white/[0.05]" : "border-slate-100", i % 2 !== 0 && (isDark ? "bg-white/[0.02]" : "bg-slate-50/40"))}>
                <td className="py-3 px-4">
                  <div className={cn("font-semibold text-[13px]", isDark ? "text-slate-200" : "text-slate-900")}>{user.display_name ?? "—"}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {user.email}
                    {user.id === currentUserId && (
                      <span className={cn("ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded", isDark ? "text-slate-400 bg-white/10" : "text-slate-400 bg-slate-100")}>(You)</span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4">
                  <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded", user.role === "pm" ? "uppercase" : "capitalize", (isDark ? ROLE_BADGE_DARK : ROLE_BADGE_LIGHT)[user.role] ?? (isDark ? "text-slate-400 bg-slate-500/15 border border-slate-500/20" : "bg-slate-50 text-slate-600 border border-slate-200"))}>
                    {user.role}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span className="text-[12px] font-mono text-slate-500">{user.zoho_user_id ?? "—"}</span>
                </td>
                <td className="py-3 px-4 text-[12px] text-slate-400">
                  {user.created_at ? formatDate(user.created_at) : "—"}
                </td>
                <td className="py-3 px-4">
                  {user.role === "pending" ? (
                    <form action={approveAction} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={user.id} />
                      <select name="role" className={cn("text-[11px] border rounded px-1.5 py-0.5", isDark ? "border-white/[0.08] bg-white/5 text-slate-300" : "border-slate-200 bg-white text-slate-700")}>
                        <option value="dev">Dev</option>
                        <option value="pm">PM</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button type="submit" className="text-[11px] font-semibold text-white bg-slate-800 hover:bg-slate-900 px-2.5 py-0.5 rounded">
                        Approve
                      </button>
                    </form>
                  ) : (
                    <span className="text-[12px] text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
