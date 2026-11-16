import { adminClient } from "@/lib/supabase/admin";

// Task 476 — Test Users / Test Companies / Test Projects. Server-only (uses adminClient).
// RLS (migration 181) already hides test rows from non-test users. Dashboards and metrics exclude
// them for everyone, Test Users included, and adminClient reads bypass RLS, so those queries filter
// explicitly with loadTestScope().

export const MIGRATION_MISSING = "Migration 476 (181_test_users_and_test_data.sql) is not applied yet.";

export type SettingsViewer = { role: string | null; isAdmin: boolean; isTestUser: boolean; migrated: boolean };

// Probe once per server process; only a confirmed "applied" is cached, so applying the migration
// takes effect without a redeploy.
let applied = false;
export async function testFlagsApplied(): Promise<boolean> {
  if (applied) return true;
  const { error } = await adminClient.from("projects").select("is_test").limit(0);
  applied = !error;
  return applied;
}

export async function getSettingsViewer(userId: string): Promise<SettingsViewer> {
  const migrated = await testFlagsApplied();
  const { data } = await adminClient
    .from("profiles")
    .select(migrated ? "role, is_test_user" : "role")
    .eq("id", userId)
    .maybeSingle();
  const row = data as { role?: string; is_test_user?: boolean } | null;
  const role = row?.role ?? null;
  return {
    role,
    isAdmin: role === "admin" || role === "super_admin",
    isTestUser: row?.is_test_user === true,
    migrated,
  };
}

// A Test User acts as "pm" on a test project (decision D4); everywhere else the real role applies.
export function effectiveProjectRole(viewer: Pick<SettingsViewer, "role" | "isTestUser">, projectIsTest: boolean): string | null {
  return viewer.isTestUser && projectIsTest ? "pm" : viewer.role;
}

// What a role-gated route acts on. A project may be addressed by UUID or display id (`project_id`).
type TestTarget = { projectId: string } | { customerId: string } | { taskId: string } | { ticketId: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function projectIsTest(idOrDisplayId: string): Promise<boolean> {
  const { data } = await adminClient
    .from("projects").select("is_test").eq(UUID_RE.test(idOrDisplayId) ? "id" : "project_id", idOrDisplayId).maybeSingle();
  return (data as { is_test?: boolean } | null)?.is_test === true;
}

async function isTestTarget(target: TestTarget): Promise<boolean> {
  if ("projectId" in target) return projectIsTest(target.projectId);
  if ("customerId" in target) {
    const { data } = await adminClient.from("customers").select("is_test").eq("customer_id", target.customerId).maybeSingle();
    return (data as { is_test?: boolean } | null)?.is_test === true;
  }
  const { data } = "taskId" in target
    ? await adminClient.from("tasks").select("project_id").eq("id", target.taskId).maybeSingle()
    : await adminClient.from("tickets").select("project_id").eq("id", target.ticketId).maybeSingle();
  return data?.project_id ? projectIsTest(data.project_id) : false;
}

// For role-gated project routes: the caller's role, upgraded to "pm" when they are a Test User and
// the project is a test project.
export async function projectRoleFor(userId: string, projectId: string): Promise<string | null> {
  const viewer = await getSettingsViewer(userId);
  if (!viewer.isTestUser) return viewer.role;
  return effectiveProjectRole(viewer, await projectIsTest(projectId));
}

// Drop-in for routes that read `profile.role` and gate on it: returns the profile with role "pm"
// when the caller is a Test User and the target is test data (D4); otherwise the profile unchanged.
export async function asTestRole<T extends { role: string }>(profile: T | null, userId: string, target: TestTarget): Promise<T | null> {
  if (!profile || ["admin", "super_admin", "pm"].includes(profile.role)) return profile;
  if (!(await getSettingsViewer(userId)).isTestUser || !(await isTestTarget(target))) return profile;
  return { ...profile, role: "pm" as T["role"] };
}

type TestScope = { projectIds: string[]; customerIds: string[] };

// shortcut: loads every test id into memory, fine while test data is a handful of rows; switch to a
// SQL-side filter (view or RPC) if test projects ever number in the hundreds.
export async function loadTestScope(): Promise<TestScope> {
  if (!(await testFlagsApplied())) return { projectIds: [], customerIds: [] };
  const [p, c] = await Promise.all([
    adminClient.from("projects").select("id").eq("is_test", true),
    adminClient.from("customers").select("customer_id").eq("is_test", true),
  ]);
  return {
    projectIds: (p.data ?? []).map((r) => r.id),
    customerIds: (c.data ?? []).map((r) => r.customer_id),
  };
}

// `.not("id", "in", notInList(ids))` excludes the given ids; with none it excludes a dummy id, so the
// filter can always be chained (and works before migration 181, when the scope is empty).
export function notInList(ids: string[]): string {
  return inList(ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
}

// PostgREST `in` list for `.not(col, "in", inList(ids))`. Values are quoted so text ids are safe.
function inList(ids: string[]): string {
  return `(${ids.map((id) => `"${id.replace(/"/g, "")}"`).join(",")})`;
}
