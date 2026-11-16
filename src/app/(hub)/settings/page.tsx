import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getSettingsViewer, MIGRATION_MISSING } from "@/lib/test-data";
import { SettingsFields } from "./_settings-fields";
import type { PickerItem } from "./_chip-picker";

export const metadata: Metadata = { title: "Settings" };

// Task 476 — mark existing users (admins) and companies/projects (admins + Test Users) as test.
// Test records are visible only to Test Users and never count in dashboards or metrics.
export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const viewer = user ? await getSettingsViewer(user.id) : null;

  if (!viewer || (!viewer.isAdmin && !viewer.isTestUser)) {
    return (
      <div className="px-4 py-6.5 sm:px-8">
        <div className="flex flex-col items-center gap-2 rounded-xl border border-[#E2E7F2] bg-white p-10 text-center">
          <Lock size={20} className="text-[#5F6A88]" aria-hidden />
          <p className="text-[13px] text-[#3A4565]">Settings is available to admins and test users.</p>
        </div>
      </div>
    );
  }

  // Saved selections. adminClient: RLS hides test rows from admins (see api/v2/settings/_gate.ts).
  const [users, companies, projects] = viewer.migrated ? await loadSelections(viewer.isAdmin) : [[], [], []];

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6.5 sm:px-8">
      <header>
        <h1 className="text-xl font-bold text-[#0B1533]">Settings</h1>
        <p className="mt-1 text-[13px] text-[#5F6A88]">
          Pick existing records to treat as test. Test records are visible only to Test Users and are left out of dashboards and metrics.
        </p>
      </header>
      {viewer.migrated ? (
        <SettingsFields isAdmin={viewer.isAdmin} users={users} companies={companies} projects={projects} />
      ) : (
        <p role="alert" className="rounded-lg border border-[#FFE3A3] bg-[#FFF3D6] px-4 py-3 text-[13px] text-[#8A5A00]">{MIGRATION_MISSING}</p>
      )}
    </div>
  );
}

async function loadSelections(isAdmin: boolean): Promise<[PickerItem[], PickerItem[], PickerItem[]]> {
  const [u, c, p] = await Promise.all([
    isAdmin
      ? adminClient.from("profiles").select("id, full_name").eq("is_test_user", true).order("full_name")
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    adminClient.from("customers").select("customer_id, company_name").eq("is_test", true).order("company_name"),
    adminClient.from("projects").select("id, name, project_id, customer_id").eq("is_test", true).neq("status", "deleted").order("name"),
  ]);
  const userIds = (u.data ?? []).map((r) => r.id);
  const projectCustomerIds = [...new Set((p.data ?? []).map((r) => r.customer_id))];
  const [emails, names] = await Promise.all([
    userIds.length ? adminClient.from("hub_users").select("id, email").in("id", userIds) : Promise.resolve({ data: [] as { id: string; email: string }[] }),
    projectCustomerIds.length
      ? adminClient.from("customers").select("customer_id, company_name").in("customer_id", projectCustomerIds)
      : Promise.resolve({ data: [] as { customer_id: string; company_name: string }[] }),
  ]);
  const emailById = new Map((emails.data ?? []).map((r) => [r.id, r.email]));
  const companyById = new Map((names.data ?? []).map((r) => [r.customer_id, r.company_name]));
  return [
    (u.data ?? []).map((r) => ({ id: r.id, label: r.full_name || emailById.get(r.id) || "Unnamed user", sub: emailById.get(r.id) ?? null })),
    (c.data ?? []).map((r) => ({ id: r.customer_id, label: r.company_name, sub: r.customer_id })),
    (p.data ?? []).map((r) => ({ id: r.id, label: r.name, sub: [r.project_id, companyById.get(r.customer_id)].filter(Boolean).join(" · ") || null })),
  ];
}
