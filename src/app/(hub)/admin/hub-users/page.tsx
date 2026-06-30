import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import { approveHubUser } from "@/app/(hub)/actions/approve-hub-user";

const ROLE_BADGE: Record<string, string> = {
  "Super Admin": "bg-purple-50 text-purple-700 border border-purple-200",
  "Admin":       "bg-red-50 text-red-700 border border-red-200",
  "PM":          "bg-blue-50 text-blue-700 border border-blue-200",
  "Developer":   "bg-green-50 text-green-700 border border-green-200",
  "Other":       "bg-slate-50 text-slate-600 border border-slate-200",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

export default async function HubUsersPage() {
  await requireRole("/admin/hub-users");

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const currentUserId = claims?.claims?.sub ?? null;

  const { data: users } = await adminClient
    .from("hub_users")
    .select("id, email, first_name, last_name, role, external_id, is_invited, created_at")
    .order("created_at", { ascending: false });

  const rows = users ?? [];
  const pendingCount = rows.filter((u) => !u.role).length;
  const approveAction = approveHubUser.bind(null, "/admin/hub-users");

  return (
    <div className="flex-1 overflow-y-auto py-6.5 px-8 bg-[#f5f4f1]">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Hub Users</h1>
        <p className="text-[13px] text-slate-400 mt-0.5">
          {rows.length} registered users
          {pendingCount > 0 && (
            <span className="ml-2 text-amber-600 font-semibold">· {pendingCount} pending approval</span>
          )}
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {["First Name", "Last Name", "Email", "Role", "External ID", "Invited", "Joined", "Actions"].map((h) => (
                <th key={h} className="text-left py-3 px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-[13px] text-slate-400">
                  No users found.
                </td>
              </tr>
            ) : rows.map((user, i) => (
              <tr key={user.id} className={cn("border-b border-slate-100 last:border-0", i % 2 === 0 ? "bg-white" : "bg-slate-50/40")}>
                <td className="py-3 px-4 text-[13px] font-semibold text-slate-900">{user.first_name ?? "—"}</td>
                <td className="py-3 px-4 text-[13px] text-slate-700">{user.last_name ?? "—"}</td>
                <td className="py-3 px-4">
                  <div className="text-[12px] text-slate-500">
                    {user.email}
                    {user.id === currentUserId && (
                      <span className="ml-1.5 text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">(You)</span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4">
                  <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded", ROLE_BADGE[user.role ?? ""] ?? "bg-amber-50 text-amber-700 border border-amber-200")}>
                    {user.role ?? "Unassigned"}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span className="text-[12px] font-mono text-slate-500">{user.external_id ?? "—"}</span>
                </td>
                <td className="py-3 px-4">
                  <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded", user.is_invited ? "bg-green-50 text-green-700 border border-green-200" : "bg-slate-50 text-slate-500 border border-slate-200")}>
                    {user.is_invited ? "Yes" : "No"}
                  </span>
                </td>
                <td className="py-3 px-4 text-[12px] text-slate-400">
                  {user.created_at ? formatDate(user.created_at) : "—"}
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {!user.role && (
                      <form action={approveAction} className="flex items-center gap-1.5">
                        <input type="hidden" name="userId" value={user.id} />
                        <select name="role" className="text-[11px] border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 bg-white">
                          <option value="Super Admin">Super Admin</option>
                          <option value="PM">PM</option>
                          <option value="Admin">Admin</option>
                          <option value="Developer">Developer</option>
                          <option value="Other">Other</option>
                        </select>
                        <button type="submit" className="text-[11px] font-semibold text-white bg-slate-800 hover:bg-slate-900 px-2.5 py-0.5 rounded">
                          Assign
                        </button>
                      </form>
                    )}
                    {user.role && !user.is_invited && (
                      <form method="POST" action={`/api/admin/hub-users/${user.id}/invite`}>
                        <button type="submit" className="text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-0.5 rounded">
                          Send Invite
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
