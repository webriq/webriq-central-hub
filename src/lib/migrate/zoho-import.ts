// dev-only migration helpers — reads from local _from_zoho/ files, upserts to Supabase
import fs from "fs";
import path from "path";
import { adminClient } from "@/lib/supabase/admin";

export function readFromZoho<T>(filename: string): T[] {
  const filePath = path.join(process.cwd(), "_from_zoho", filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed)
    ? parsed
    : (parsed?.projects ?? parsed?.tasks ?? parsed?.tasklists ?? []);
}

export function mapPriority(zoho: string): "critical" | "high" | "normal" | "low" {
  const p = (zoho ?? "").toLowerCase();
  if (p === "critical") return "critical";
  if (p === "high") return "high";
  if (p === "low") return "low";
  return "normal";
}

export function mapTaskStatus(
  zohoStatusName: string,
  isCompleted: boolean
): "open" | "in_progress" | "ready_for_qa" | "testing_completed" | "for_client_approval" | "ready_to_merge" | "post_live_qa" | "closed" {
  if (isCompleted) return "closed";
  const s = (zohoStatusName ?? "").toLowerCase();
  if (s.includes("progress")) return "in_progress";
  if (s.includes("qa") || s.includes("testing")) return "ready_for_qa";
  if (s.includes("client approval")) return "for_client_approval";
  if (s.includes("merge")) return "ready_to_merge";
  if (s.includes("post live") || s.includes("post_live")) return "post_live_qa";
  if (s.includes("closed") || s.includes("complete") || s.includes("done")) return "closed";
  return "open";
}

export function parseHours(s: string): number {
  if (!s) return 0;
  const [h = 0, m = 0] = s.split(":").map(Number);
  return Math.round((h + m / 60) * 100) / 100;
}

// Build a Map<email → auth user id> by listing all Hub users once per import run.
// Cached at module level for the duration of the request; cleared by clearUserCache().
let _userCache: Map<string, string> | null = null;

export async function buildUserCache(): Promise<Map<string, string>> {
  if (_userCache) return _userCache;
  const cache = new Map<string, string>();
  let page = 1;
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (u.email) cache.set(u.email.toLowerCase(), u.id);
    }
    if (data.users.length < 1000) break;
    page++;
  }
  _userCache = cache;
  return cache;
}

export function clearUserCache(): void {
  _userCache = null;
}

export async function resolveUserId(
  email: string | null | undefined,
  cache: Map<string, string>
): Promise<string | null> {
  if (!email) return null;
  return cache.get(email.toLowerCase()) ?? null;
}

// Projects still use the pre-existing zoho_project_id column as the bridge key
export async function resolveProjectId(zohoProjectId: string): Promise<string | null> {
  if (!zohoProjectId) return null;
  const { data } = await adminClient
    .from("projects")
    .select("id")
    .eq("zoho_project_id", zohoProjectId)
    .maybeSingle();
  return data?.id ?? null;
}

// Tasks, tasklists, comments, timelogs, and attachments all use external_id
export async function resolveTaskId(externalId: string): Promise<string | null> {
  if (!externalId) return null;
  const { data } = await adminClient
    .from("tasks")
    .select("id")
    .eq("external_id", externalId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function resolveIssueId(externalId: string): Promise<string | null> {
  if (!externalId) return null;
  const { data } = await adminClient
    .from("issues")
    .select("id")
    .eq("external_id", externalId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function resolveTasklistId(externalId: string): Promise<string | null> {
  if (!externalId) return null;
  const { data } = await adminClient
    .from("tasklists")
    .select("id")
    .eq("external_id", externalId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function resolveMilestoneId(externalId: string): Promise<string | null> {
  if (!externalId) return null;
  const { data } = await adminClient
    .from("milestones")
    .select("id")
    .eq("external_id", externalId)
    .maybeSingle();
  return data?.id ?? null;
}

export type ImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
};

export type ZohoTag = { name?: string };

export type ProjectTypeInference = {
  value: "Content Site" | "Ecommerce (B2C)" | "Ecommerce (B2B)" | "Custom App";
  source: "name" | "tag" | "layout" | "default";
};

export async function buildCustomerNameMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data } = await adminClient.from("customers").select("customer_id, company_name");
  for (const c of (data ?? [])) {
    map.set(c.company_name.toLowerCase().trim(), c.customer_id);
  }
  return map;
}

export function inferProjectType(
  tags: ZohoTag[],
  layoutName: string | undefined,
  projectName: string | undefined
): ProjectTypeInference {
  const tagNames = tags.map((t) => (t.name ?? "").toLowerCase());
  const layout   = (layoutName  ?? "").toLowerCase();
  const name     = (projectName ?? "");

  // ── Ecommerce (project name takes precedence) ────────────────────
  if (/\bB2B\b/i.test(name))   return { value: "Ecommerce (B2B)", source: "name" };
  if (/\bB2C\b/i.test(name))   return { value: "Ecommerce (B2C)", source: "name" };
  if (tagNames.some((t) => ["e-commerce", "dream ecommerce", "bigcommerce"].includes(t)))
    return { value: "Ecommerce (B2C)", source: "tag" };

  // ── Custom App ───────────────────────────────────────────────────
  if (/\bBooking App\b/i.test(name))  return { value: "Custom App", source: "name" };
  if (/\bApplication\b/i.test(name))  return { value: "Custom App", source: "name" };
  if (/\bAPP\b/.test(name))           return { value: "Custom App", source: "name" };
  if (/\bApp\b/i.test(name))          return { value: "Custom App", source: "name" };
  if (tagNames.some((t) => ["discrete app", "dream app", "custom app"].includes(t)))
    return { value: "Custom App", source: "tag" };

  // ── Content Site ─────────────────────────────────────────────────
  if (/\bContent Site\b/i.test(name)) return { value: "Content Site", source: "name" };
  if (/\bWebsite\b/i.test(name))      return { value: "Content Site", source: "name" };
  if (tagNames.some((t) => ["stackshift", "content site", "standard", "dxp studio", "dream website"].includes(t)))
    return { value: "Content Site", source: "tag" };
  if (layout.includes("stackshift") || layout.includes("completed webriq"))
    return { value: "Content Site", source: "layout" };

  return { value: "Content Site", source: "default" };
}

// Returns true for internal WebriQ projects that should map to the "WebriQ" customer.
export function isInternalProject(name: string): boolean {
  return (
    name.startsWith("[DEV]") ||
    /webriq/i.test(name) ||
    name.startsWith("StackShift - ") ||
    name.startsWith("2024 April StackShift") ||
    name === "TEST" ||
    name.startsWith("Test ") ||
    name === "Site LIVE Preview"
  );
}

// Extracts the Hub customer name from a Zoho project name by stripping
// product-type indicators and applying known corrections.
export function extractZohoCustomerName(projectName: string): string {
  if (isInternalProject(projectName)) return "WebriQ";

  // Special-case corrections (full project name → canonical customer name)
  const lc = projectName.toLowerCase();
  if (lc.startsWith("belmont studio")) return "Studio Belmont";
  if (lc === "last line solutions") return "Last Line Solutions Inc";

  let name = projectName;
  name = name
    .replace(/\s*[-–]\s*Content Site\b/gi, "").replace(/\s+Content Site\b/gi, "")
    .replace(/\s*[-–]\s*Website\b/gi,      "").replace(/\s+Website\b/gi,      "")
    .replace(/\s*[-–]\s*Ecommerce\b/gi,    "").replace(/\s+Ecommerce\b/gi,    "")
    .replace(/\s*[-–]\s*B2B\b/gi,          "").replace(/\s+B2B\b/gi,          "")
    .replace(/\s*[-–]\s*B2C\b/gi,          "").replace(/\s+B2C\b/gi,          "")
    .replace(/\s*[-–]\s*Booking App\b/gi,  "").replace(/\s+Booking App\b/gi,  "")
    .replace(/\s*[-–]\s*Application\b/gi,  "").replace(/\s+Application\b/gi,  "")
    .replace(/\s*[-–]\s*APP\b/g,           "").replace(/\s+APP\b/g,           "")
    .replace(/\s*[-–]\s*App\b/gi,          "").replace(/\s+App\b/gi,          "")
    // Remove any trailing punctuation left by stripping
    .replace(/[\s\-–&,]+$/, "")
    .trim();

  return name;
}

export function mapProjectStatus(
  statusName: string | undefined,
  isClosedType: boolean | undefined,
  isCompleted: boolean | undefined
): "active" | "on_hold" | "completed" | "archived" {
  const s = (statusName ?? "").toLowerCase();
  // Explicit completion signals
  if (isCompleted || s === "completed") return "completed";
  // is_closed_type in Zoho just means a "closed category" — only treat as archived
  // if the name is explicitly cancelled/archived, otherwise fall through to active
  if (isClosedType && (s.includes("cancel") || s.includes("archiv"))) return "archived";
  if (s.includes("hold")) return "on_hold";
  return "active";
}

export { adminClient };
