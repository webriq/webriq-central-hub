// Zoho API client — Sprint 2 (M2), Sprint 4 (M7)
// Zoho Projects API V3 (/api/v3/portal/)
import { adminClient } from "@/lib/supabase/admin";

const ZOHO_PROJECTSAPI_BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;

// Module-level token cache — Zoho tokens are valid for 1 hour.
// Deduplicated with a shared in-flight promise so concurrent callers
// (e.g. Promise.all in /api/dev/tasks) never trigger parallel refreshes.
let _tokenCache: { value: string; expiresAt: number } | null = null;
let _tokenRefreshPromise: Promise<string> | null = null;

export async function getZohoAccessToken(): Promise<string> {
  // Return cached token if still valid (60s buffer before expiry)
  if (_tokenCache && Date.now() < _tokenCache.expiresAt - 60_000) {
    return _tokenCache.value;
  }

  // Reuse an in-flight refresh instead of starting a second one
  if (_tokenRefreshPromise) return _tokenRefreshPromise;

  _tokenRefreshPromise = (async () => {
    try {
      const clientId = process.env.ZOHO_CLIENT_ID;
      const clientSecret = process.env.ZOHO_CLIENT_SECRET;
      const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

      if (!clientId || !clientSecret || !refreshToken) {
        console.warn("[zoho] OAuth env vars not configured (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN) — skipping");
        return "";
      }

      const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
        }),
      });

      if (!res.ok) {
        console.error("[zoho] token refresh failed:", res.status, await res.text());
        return "";
      }

      const json = await res.json();
      const token = (json.access_token as string) ?? "";
      const expiresIn = (json.expires_in as number) ?? 3600;

      if (token) {
        _tokenCache = { value: token, expiresAt: Date.now() + expiresIn * 1_000 };
      }

      return token;
    } finally {
      _tokenRefreshPromise = null;
    }
  })();

  return _tokenRefreshPromise;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type ZohoFetchResult = {
  res: Response;
  token: string;
  throttleExhausted: boolean;
};

/**
 * Fetches a Zoho API URL with built-in throttle/auth resilience:
 * - 429 → respects Retry-After header, retries once
 * - 400 URL_ROLLING_THROTTLES_LIMIT_EXCEEDED → bounded retry loop with backoff
 *   (default 3 attempts: 9min, 12min, 15min waits) before giving up
 * - 401 → refreshes the token via getZohoAccessToken() and retries once
 *
 * Returns the final Response, the (possibly refreshed) token to carry forward
 * into subsequent calls, and whether the rolling-throttle retries were exhausted
 * without success — callers must treat `throttleExhausted: true` as a real
 * failure (surface it), not a silent skip.
 */
export async function fetchZohoWithRetry(
  url: string,
  token: string,
  options?: { label?: string; maxRollingRetries?: number; headers?: Record<string, string> }
): Promise<ZohoFetchResult> {
  const label = options?.label ?? "zoho";
  const maxRollingRetries = options?.maxRollingRetries ?? 3;
  let currentToken = token;

  const doFetch = () =>
    fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${currentToken}`, ...options?.headers } });

  let res = await doFetch();

  // 429: respect Retry-After header, retry once
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") ?? "5", 10);
    console.log(`[${label}] 429 — waiting ${retryAfter}s`);
    await sleep(retryAfter * 1000);
    res = await doFetch();
  }

  // Zoho rolling throttle (400 URL_ROLLING_THROTTLES_LIMIT_EXCEEDED) — bounded retry with backoff
  let rollingAttempt = 0;
  let throttleExhausted = false;
  while (res.status === 400) {
    const body = (await res.clone().json().catch(() => ({}))) as { error?: { title?: string } };
    if (body?.error?.title !== "URL_ROLLING_THROTTLES_LIMIT_EXCEEDED") break;
    if (rollingAttempt >= maxRollingRetries) {
      throttleExhausted = true;
      break;
    }
    rollingAttempt++;
    const waitMinutes = 9 + (rollingAttempt - 1) * 3; // 9, 12, 15 min
    console.log(`[${label}] Rolling throttle hit (attempt ${rollingAttempt}/${maxRollingRetries}) — waiting ${waitMinutes}min`);
    await sleep(waitMinutes * 60 * 1000);
    res = await doFetch();
  }

  // Token expired mid-export — refresh and retry once
  if (res.status === 401) {
    console.log(`[${label}] Token expired — refreshing`);
    const fresh = await getZohoAccessToken();
    if (fresh) {
      currentToken = fresh;
      res = await doFetch();
    }
  }

  return { res, token: currentToken, throttleExhausted };
}

export async function createZohoProject(customerId: string, projectName: string): Promise<string> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) {
    console.warn("[zoho] ZOHO_PORTAL_ID not configured — skipping project creation for", customerId);
    return "";
  }

  const token = await getZohoAccessToken();
  if (!token) return "";

  const res = await fetch(`${ZOHO_PROJECTSAPI_BASE}/projects`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: projectName,
      description: `WebriQ Hub managed project for ${customerId}`,
    }),
  });

  if (!res.ok) {
    console.error("[zoho] project creation failed:", res.status, await res.text());
    return "";
  }

  const json = await res.json();
  // V3 API returns a flat object: { id: "...", name: "...", ... }
  const proj = json?.projects?.[0] ?? json?.project ?? json;
  return String(proj?.id_string ?? proj?.id ?? "") || "";
}

export async function updateZohoProject(projectId: string, projectName: string): Promise<boolean> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) {
    console.warn("[zoho] ZOHO_PORTAL_ID not configured — skipping project rename for", projectId);
    return false;
  }
  const token = await getZohoAccessToken();
  if (!token) return false;

  const res = await fetch(`${ZOHO_PROJECTSAPI_BASE}/projects/${projectId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: projectName }),
  });

  if (!res.ok) {
    console.error("[zoho] project rename failed:", res.status, await res.text());
    return false;
  }
  return true;
}

export type ZohoTask = {
  id: string;
  name: string;
  project: { id: string; name: string };
  priority: string;
  status: { name: string };
  due_date?: string | null;
  completed: boolean;
  link?: { web?: { url: string } };
  owners_and_work?: { owners?: Array<{ name: string; zuid: string | number; email?: string }> };
};

export type ZohoTimeLog = {
  id: string;
  project: { id: string; name: string };
  task: { id: string; name: string };
  log_hours: string;
  log_date: string;
};

export type ZohoPageInfo = {
  per_page: number;
  has_next_page: boolean;
  count: number;
  page: number;
};

export type ZohoPortalUser = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  zuid: string;
  status: string;
  user_type: string;
  is_confirmed: boolean;
  is_resend_invite: boolean;
  added_time: string;
  updated_time: string;
  last_accessed_on?: string | null;
  role: { id: string; name: string };
  portal_profile: { id: string; name: string; is_default: boolean };
  reporting_to?: { id: string; full_name: string; first_name: string; last_name: string; zuid: string } | null;
  business_hours?: { id: string; name: string } | null;
  budget?: { cost_per_hour: { currency_code: string; formatted_amount: string; currency_id: string; amount: number } } | null;
};

export type ZohoPortalUsersResponse = {
  users: ZohoPortalUser[];
  page_info: ZohoPageInfo | null;
};

export type ZohoPortalUsersParams = {
  type?: string;
  view_type?: string;
  page?: string | number;
  per_page?: string | number;
  filter?: Record<string, unknown>;
  sort_by?: string;
};

export type ZohoProject = {
  id: string;
  id_string: string;
  name: string;
  status: string;
  [key: string]: unknown;
};

type SyncTaskInput = {
  customerId: string;
  title: string;
  description: string;
  zohoProjectId?: string;
  tasklistId?: string;
  startDate?: string;
  dueDate?: string;
  ownerId?: string;
  billingType?: string;
};

// Zoho Projects API v3 requires ISO 8601: yyyy-MM-dd'T'HH:mm:ss'Z'
// datetime-local inputs give YYYY-MM-DDTHH:mm — append :00Z for UTC
function toZohoDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toISOString(); // produces yyyy-MM-ddTHH:mm:ss.sssZ
}

export async function syncTaskToZoho(input: SyncTaskInput): Promise<string> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) {
    console.warn("[zoho] ZOHO_PORTAL_ID not configured — skipping task sync for", input.customerId);
    return "";
  }

  let zohoProjectId = input.zohoProjectId;
  if (!zohoProjectId) {
    // adminClient used for reads — this function runs server-side only (no user session in API routes)
    const { data: product } = await adminClient
      .from("projects")
      .select("external_project_id")
      .eq("customer_id", input.customerId)
      .not("external_project_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (!product?.external_project_id) {
      console.warn("[zoho] no external_project_id for customer", input.customerId);
      return "";
    }
    zohoProjectId = product.external_project_id;
  }

  const token = await getZohoAccessToken();
  if (!token) return "";

  const startDateZoho = input.startDate ? toZohoDate(input.startDate) : null;
  const dueDateZoho = input.dueDate ? toZohoDate(input.dueDate) : null;

  const res = await fetch(
    `${ZOHO_PROJECTSAPI_BASE}/projects/${zohoProjectId}/tasks`,
    {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: input.title,
        ...(input.description ? { description: input.description } : {}),
        ...(input.tasklistId ? { tasklist: { id: input.tasklistId } } : {}),
        ...(startDateZoho ? { start_date: startDateZoho } : {}),
        ...(dueDateZoho ? { end_date: dueDateZoho } : {}),
        ...(input.ownerId ? { person_responsible_array: [{ id: input.ownerId }] } : {}),
        ...(input.billingType && input.billingType !== "None" ? { billing_type: input.billingType } : {}),
      }),
    }
  );

  if (!res.ok) {
    console.error("[zoho] task creation failed:", res.status, await res.text());
    return "";
  }

  const json = await res.json();
  // v3 create-task returns the task as a flat root object, not wrapped in tasks[]
  return String(json?.id_string ?? json?.id ?? "") || "";
}

export async function syncTaskAttachments(
  zohoProjectId: string,
  taskId: string,
  files: File[]
): Promise<void> {
  if (!files.length) return;
  const token = await getZohoAccessToken();
  if (!token) return;

  for (const file of files) {
    const form = new FormData();
    form.append("file", file);
    try {
      await fetch(
        `${ZOHO_PROJECTSAPI_BASE}/projects/${zohoProjectId}/tasks/${taskId}/attachments`,
        {
          method: "POST",
          headers: { Authorization: `Zoho-oauthtoken ${token}` },
          body: form,
        }
      );
    } catch {
      // Non-blocking — attachment failure does not fail the task
    }
  }
}

export async function getZohoProjectTasklists(
  projectId: string
): Promise<{ id: string; name: string }[]> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) return [];
  const token = await getZohoAccessToken();
  if (!token) return [];

  const res = await fetch(
    `${ZOHO_PROJECTSAPI_BASE}/projects/${projectId}/tasklists`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );
  if (!res.ok) {
    console.error("[zoho] getZohoProjectTasklists failed:", res.status, await res.text());
    return [];
  }
  const json = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (json?.tasklists ?? []).map((tl: any) => ({
    id: String(tl.id_string ?? tl.id),
    name: String(tl.name),
  }));
}

export async function createZohoTasklist(
  projectId: string,
  name: string
): Promise<{ id: string; name: string } | null> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) return null;
  const token = await getZohoAccessToken();
  if (!token) return null;

  const res = await fetch(
    `${ZOHO_PROJECTSAPI_BASE}/projects/${projectId}/tasklists`,
    {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    }
  );
  if (!res.ok) {
    console.error("[zoho] createZohoTasklist failed:", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tl: any = json?.tasklists?.[0] ?? json?.tasklist ?? json;
  if (!tl?.id_string && !tl?.id) return null;
  return { id: String(tl.id_string ?? tl.id), name: String(tl.name) };
}

// Close (completed=true) or reopen (completed=false) a Zoho task
export async function updateZohoTaskStatus(
  zohoProjectId: string,
  zohoTaskId: string,
  completed: boolean
): Promise<boolean> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) return false;

  const token = await getZohoAccessToken();
  if (!token) return false;

  const res = await fetch(
    `${ZOHO_PROJECTSAPI_BASE}/projects/${zohoProjectId}/tasks/${zohoTaskId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        completion_percentage: completed ? "100" : "0",
      }),
    }
  );

  if (!res.ok) {
    console.error("[zoho] task status update failed:", res.status, await res.text());
    return false;
  }

  return true;
}

export async function sendCliqNotification(
  message: string,
  channel: "pm" | "dev" = "pm"
): Promise<void> {
  const webhookUrl =
    channel === "dev"
      ? process.env.ZOHO_CLIQ_DEV_WEBHOOK_URL
      : process.env.ZOHO_CLIQ_WEBHOOK_URL;
  const token = process.env.ZOHO_CLIQ_WEBHOOK_TOKEN;
  if (!webhookUrl || !token) return;

  const url = `${webhookUrl}?zapikey=${token}`;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
  } catch (err) {
    console.error("[cliq] notification failed:", err instanceof Error ? err.message : err);
  }
}

export async function getMyZohoTasks(
  portalId: string,
  zohoUserId: string
): Promise<ZohoTask[]> {
  if (!portalId) return [];
  const token = await getZohoAccessToken();
  if (!token) return [];

  const { data: products } = await adminClient
    .from("projects")
    .select("external_project_id")
    .not("external_project_id", "is", null);

  if (!products?.length) return [];

  const projectIds = [...new Set(products.map((p) => p.external_project_id as string))];

  const results = await Promise.all(
    projectIds.map(async (projectId) => {
      const res = await fetch(
        `${ZOHO_PROJECTSAPI_BASE}/projects/${projectId}/tasks`,
        { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
      );
      if (!res.ok) {
        console.error("[zoho] getMyZohoTasks failed for project", projectId, ":", res.status, await res.text());
        return [];
      }
      const json = await res.json();
      return (json?.tasks ?? []) as ZohoTask[];
    })
  );

  return results.flat().filter((t) =>
    t.owners_and_work?.owners?.some((o) => {
      return o.zuid === parseInt(zohoUserId) || o.zuid === zohoUserId;
    })
  );
}

export async function getUnassignedZohoTasks(portalId: string): Promise<ZohoTask[]> {
  if (!portalId) return [];
  const token = await getZohoAccessToken();
  if (!token) return [];

  // Collect all external_project_ids across all customer projects
  const { data: products } = await adminClient
    .from("projects")
    .select("external_project_id")
    .not("external_project_id", "is", null);

  if (!products?.length) return [];

  const projectIds = [...new Set(products.map((p) => p.external_project_id as string))];

  const results = await Promise.all(
    projectIds.map(async (projectId) => {
      const res = await fetch(
        `${ZOHO_PROJECTSAPI_BASE}/projects/${projectId}/tasks`,
        { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
      );
      if (!res.ok) {
        console.error("[zoho] getUnassignedZohoTasks failed for project", projectId, ":", res.status, await res.text());
        return [];
      }
      const json = await res.json();
      return (json?.tasks ?? []) as ZohoTask[];
    })
  );

  // Keep only tasks with no owners assigned
  return results
    .flat()
    .filter((t) => {
      const owners = t.owners_and_work?.owners ?? [];
      return owners.length === 0 || owners.every((o) => o.name === "Unassigned User");
    });
}

export async function getMyZohoTimeLogs(
  portalId: string,
  zohoUserId: string,
  dateStr: string  // "YYYY-MM-DD"
): Promise<ZohoTimeLog[]> {
  if (!portalId) return [];
  const token = await getZohoAccessToken();
  if (!token) return [];

  const { data: products } = await adminClient
    .from("projects")
    .select("external_project_id")
    .not("external_project_id", "is", null);

  if (!products?.length) return [];

  const projectIds = [...new Set(products.map((p) => p.external_project_id as string))];
  const results = await Promise.all(
    projectIds.map(async (projectId) => {
      const params = new URLSearchParams({
        view_type: "day",
        start_date: dateStr,
        end_date: dateStr,
        module: JSON.stringify({ type: "task" }),
        users_list: JSON.stringify({ users: [{ id: zohoUserId }] }),
      });
      const res = await fetch(
        `${ZOHO_PROJECTSAPI_BASE}/projects/${projectId}/timelogs?${params}`,
        { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
      );
      if (!res.ok) {
        console.error("[zoho] getMyZohoTimeLogs failed for project", projectId, ":", res.status, await res.text());
        return [];
      }
      const json = await res.json();
      // V3 returns: { time_logs: [{ date, log_details: [...], log_hours }] }
      return (json?.time_logs ?? []).flatMap(
        (day: { log_details?: ZohoTimeLog[] }) => day.log_details ?? []
      );
    })
  );

  return results.flat();
}

export async function getZohoProjectUsers(
  projectId: string
): Promise<Record<string, string>> {
  const token = await getZohoAccessToken();
  if (!token) return {};

  const res = await fetch(`${ZOHO_PROJECTSAPI_BASE}/projects/${projectId}/users`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });

  if (!res.ok) {
    console.error("[zoho] getZohoProjectUsers failed:", res.status, await res.text());
    return {};
  }

  const json = await res.json();

  const raw: Array<Record<string, unknown>> = json?.users ?? [];
  return Object.fromEntries(
    raw
      .filter((u) => u.email && u.id)
      .map((u) => [(u.email as string).toLowerCase(), u.id as string])
  );
}

export async function assignZohoTask(
  portalId: string,
  projectId: string,
  taskId: string,
  zpuids: string | string[]
): Promise<boolean> {
  if (!portalId) return false;

  const token = await getZohoAccessToken();
  if (!token) return false;

  const zpuidList = Array.isArray(zpuids) ? zpuids : [zpuids];

  const res = await fetch(
    `${ZOHO_PROJECTSAPI_BASE}/projects/${projectId}/tasks/${taskId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        owners_and_work: {
          owners: [{ add: zpuidList.map(zpuid => ({ zpuid })) }],
        },
      }),
    }
  );

  if (!res.ok) {
    console.error("[zoho] assignZohoTask failed:", res.status, await res.text());
    return false;
  }

  return true;
}

export async function getZohoPortalUsers(
  params: ZohoPortalUsersParams = {}
): Promise<ZohoPortalUsersResponse> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) return { users: [], page_info: null };

  const token = await getZohoAccessToken();
  if (!token) return { users: [], page_info: null };

  const query = new URLSearchParams();
  query.set("type", params.type ?? "portal_user");
  query.set("view_type", params.view_type ?? "active");
  query.set("page", String(params.page ?? "1"));
  query.set("per_page", String(params.per_page ?? "50"));
  if (params.filter) query.set("filter", JSON.stringify(params.filter));
  if (params.sort_by) query.set("sort_by", params.sort_by);

  const res = await fetch(
    `https://projectsapi.zoho.com/api/v3.1/portal/${portalId}/users?${query}`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );

  if (!res.ok) {
    console.error("[zoho] getZohoPortalUsers failed:", res.status, await res.text());
    return { users: [], page_info: null };
  }

  const json = await res.json();
  return {
    users: (json?.users ?? []) as ZohoPortalUser[],
    page_info: (json?.page_info ?? null) as ZohoPageInfo | null,
  };
}

export async function getZohoProjects(): Promise<{ projects: ZohoProject[]; total: number }> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  console.log("[zoho] getZohoProjects: portalId =", portalId ?? "(not set)");
  if (!portalId) return { projects: [], total: 0 };

  const token = await getZohoAccessToken();
  console.log("[zoho] getZohoProjects: token present =", !!token);
  if (!token) return { projects: [], total: 0 };

  const all: ZohoProject[] = [];
  let page = 1;

  while (true) {
    const query = new URLSearchParams({ page: String(page), per_page: "100" });
    const url = `${ZOHO_PROJECTSAPI_BASE}/projects?${query}`;
    console.log("[zoho] getZohoProjects: fetching", url);

    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    console.log("[zoho] getZohoProjects: response status =", res.status);

    if (!res.ok) {
      const body = await res.text();
      console.error("[zoho] getZohoProjects failed:", res.status, body);
      break;
    }

    const json = await res.json();
    // Zoho v3 GET /projects returns a top-level array, not { projects: [] }
    const batch: ZohoProject[] = (Array.isArray(json) ? json : (json?.projects ?? [])) as ZohoProject[];
    console.log("[zoho] getZohoProjects: batch size =", batch.length);
    all.push(...batch);

    // No page_info in this endpoint — stop when batch is smaller than per_page
    if (batch.length < 100) break;
    page++;
  }

  console.log("[zoho] getZohoProjects: total collected =", all.length);
  return { projects: all, total: all.length };
}

// Adds one or more users to a Zoho project by email.
// Returns email (lowercase) → project-level zpuid for all successfully added users.
// Params are sent as URL query params per Zoho Projects v3 API spec.
export async function addZohoProjectUsers(
  portalId: string,
  projectId: string,
  emails: string[]
): Promise<Record<string, string>> {
  if (!portalId || !emails.length) return {};

  const token = await getZohoAccessToken();
  if (!token) return {};

  const url = new URL(`${ZOHO_PROJECTSAPI_BASE}/projects/${projectId}/projectusers`);
  url.searchParams.append("userdetails", JSON.stringify(emails.map(e => ({ email_id: e }))));
  url.searchParams.append("notify", "false");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });

  if (!res.ok) {
    console.error("[zoho] addZohoProjectUsers failed:", res.status, await res.text());
    return {};
  }

  const json = await res.json() as { emailvszpuid?: Record<string, string> };
  // Normalise keys to lowercase to match getZohoProjectUsers behaviour
  const raw = json.emailvszpuid ?? {};
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]));
}

export async function getZohoPortalUser(
  zpuidOrEmail: string
): Promise<ZohoPortalUser | null> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) return null;

  const token = await getZohoAccessToken();
  if (!token) return null;

  const res = await fetch(
    `https://projectsapi.zoho.com/api/v3.1/portal/${portalId}/users/${encodeURIComponent(zpuidOrEmail).replace('%40', '@')}`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );

  if (!res.ok) {
    console.error("[zoho] getZohoPortalUser failed:", res.status, await res.text());
    return null;
  }

  const json = await res.json();
  return (json ?? null) as ZohoPortalUser | null;
}
