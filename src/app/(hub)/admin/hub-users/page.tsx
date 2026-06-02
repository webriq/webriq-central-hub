import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { cn } from "@/lib/utils";

const ROLE_BADGE: Record<string, string> = {
  admin:   "bg-red-50 text-red-700 border border-red-200",
  pm:      "bg-blue-50 text-blue-700 border border-blue-200",
  dev:     "bg-green-50 text-green-700 border border-green-200",
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
};

async function approveHubUser(formData: FormData) {
  "use server";
  const { createClient: createServerClient } = await import("@/lib/supabase/server");
  const supabase = await createServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return;

  const { data: caller } = await supabase
    .from("hub_users")
    .select("role")
    .eq("id", claims.claims.sub)
    .single();
  if (caller?.role !== "admin") return;

  const userId = formData.get("userId") as string;
  const role = formData.get("role") as string;
  if (!userId || !["admin", "pm", "dev"].includes(role)) return;

  const { adminClient } = await import("@/lib/supabase/admin");
  await adminClient.from("hub_users").update({ role }).eq("id", userId);
  revalidatePath("/admin/hub-users");
}

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
    .select("id, email, display_name, role, zoho_user_id, created_at")
    .order("created_at", { ascending: false });

  const rows = users ?? [];
  const pendingCount = rows.filter((u) => u.role === "pending").length;

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
              <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">User</th>
              <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Role</th>
              <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Zoho ID</th>
              <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Joined</th>
              <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-[13px] text-slate-400">
                  No users found.
                </td>
              </tr>
            ) : rows.map((user, i) => (
              <tr key={user.id} className={cn("border-b border-slate-100 last:border-0", i % 2 === 0 ? "bg-white" : "bg-slate-50/40")}>
                <td className="py-3 px-4">
                  <div className="font-semibold text-slate-900 text-[13px]">{user.display_name ?? "—"}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {user.email}
                    {user.id === currentUserId && (
                      <span className="ml-1.5 text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">(You)</span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4">
                  <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded", user.role === 'pm' ? "uppercase" : "capitalize", ROLE_BADGE[user.role] ?? "bg-slate-50 text-slate-600 border border-slate-200")}>
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
                    <form action={approveHubUser} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={user.id} />
                      <select
                        name="role"
                        className="text-[11px] border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 bg-white"
                      >
                        <option value="dev">Dev</option>
                        <option value="pm">PM</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        type="submit"
                        className="text-[11px] font-semibold text-white bg-slate-800 hover:bg-slate-900 px-2.5 py-0.5 rounded"
                      >
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
