"use client";

import { ChipPicker, type PickerItem } from "./_chip-picker";

// Task 476 rev 4 — the three Settings fields. Row → chip mappers live here (module scope, stable)
// because functions can't cross from the server page.
type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

const userItem = (r: Row): PickerItem => ({ id: String(r.id), label: str(r.full_name) ?? str(r.email) ?? "Unnamed user", sub: str(r.email) });
const companyItem = (r: Row): PickerItem => ({ id: String(r.customer_id), label: String(r.company_name), sub: String(r.customer_id) });
const projectItem = (r: Row): PickerItem => ({
  id: String(r.id),
  label: String(r.name),
  sub: [str(r.project_id), str(r.company_name)].filter(Boolean).join(" · ") || null,
});

const USERS_PARAMS = {};
const COMPANY_PARAMS = { kind: "customers" };
const PROJECT_PARAMS = { kind: "projects" };

// Each box is keyed by its saved ids (prefixed so empty lists don't collide), so it remounts
// with fresh state after a save refreshes the page.
export function SettingsFields({ isAdmin, users, companies, projects }: {
  isAdmin: boolean; users: PickerItem[]; companies: PickerItem[]; projects: PickerItem[];
}) {
  return (
    <div className="space-y-6 rounded-xl border border-[#E2E7F2] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      {isAdmin && (
        <ChipPicker
          key={`users:${users.map((i) => i.id).join()}`}
          label="Test Users"
          description="These users can see and manage all test companies and test projects."
          placeholder="Search users by name, email, role or department…"
          endpoint="/api/v2/settings/test-users"
          params={USERS_PARAMS}
          toItem={userItem}
          initial={users}
        />
      )}
      <ChipPicker
        key={`companies:${companies.map((i) => i.id).join()}`}
        label="Test Companies"
        description="Hidden from everyone except Test Users, and left out of dashboards and metrics. Includes all of the company's projects."
        placeholder="Search companies by name, ID or contact…"
        endpoint="/api/v2/settings/test-data"
        params={COMPANY_PARAMS}
        kind="customer"
        toItem={companyItem}
        initial={companies}
        confirmText={(added, removed) =>
          [added && `${added} compan${added === 1 ? "y" : "ies"} and all their projects become test`,
           removed && `${removed} compan${removed === 1 ? "y" : "ies"} and all their projects stop being test`]
            .filter(Boolean).join("; ") + "."}
      />
      <ChipPicker
        key={`projects:${projects.map((i) => i.id).join()}`}
        label="Test Projects"
        description="Individual projects to treat as test, for example a test project under a real company."
        placeholder="Search projects by name, project ID or company…"
        endpoint="/api/v2/settings/test-data"
        params={PROJECT_PARAMS}
        kind="project"
        toItem={projectItem}
        initial={projects}
      />
    </div>
  );
}
