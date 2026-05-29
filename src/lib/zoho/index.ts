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
  return (json?.projects?.[0]?.id as string) ?? "";
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

type SyncTaskInput = {
  customerId: string;
  title: string;
  description: string;
};

export async function syncTaskToZoho(input: SyncTaskInput): Promise<string> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) {
    console.warn("[zoho] ZOHO_PORTAL_ID not configured — skipping task sync for", input.customerId);
    return "";
  }

  // adminClient used for reads — this function runs server-side only (no user session in API routes)
  const { data: product } = await adminClient
    .from("customer_products")
    .select("zoho_project_id")
    .eq("customer_id", input.customerId)
    .not("zoho_project_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!product?.zoho_project_id) {
    console.warn("[zoho] no zoho_project_id for customer", input.customerId);
    return "";
  }

  const token = await getZohoAccessToken();
  if (!token) return "";

  const res = await fetch(
    `${ZOHO_PROJECTSAPI_BASE}/projects/${product.zoho_project_id}/tasks`,
    {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: input.title,
        ...(input.description ? { description: input.description } : {}),
      }),
    }
  );

  if (!res.ok) {
    console.error("[zoho] task creation failed:", res.status, await res.text());
    return "";
  }

  const json = await res.json();
  return (json?.tasks?.[0]?.id as string) ?? "";
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
    .from("customer_products")
    .select("zoho_project_id")
    .not("zoho_project_id", "is", null);

  if (!products?.length) return [];

  const projectIds = [...new Set(products.map((p) => p.zoho_project_id as string))];

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

  // Collect all zoho_project_ids across all active customer products
  const { data: products } = await adminClient
    .from("customer_products")
    .select("zoho_project_id")
    .not("zoho_project_id", "is", null);

  if (!products?.length) return [];

  const projectIds = [...new Set(products.map((p) => p.zoho_project_id as string))];

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
    .from("customer_products")
    .select("zoho_project_id")
    .not("zoho_project_id", "is", null);

  if (!products?.length) return [];

  const projectIds = [...new Set(products.map((p) => p.zoho_project_id as string))];
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

// Returns all portal users with their zpuid, keyed by email (lowercase)
// Returns email → zpuid map for all active portal users (v3.1 endpoint)
export async function getZohoProjectUsers(
  projectId: string  // add this
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
  zpuid: string
): Promise<boolean> {
  if (!portalId) return false;

  const token = await getZohoAccessToken();
  if (!token) return false;

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
          owners: [{ add: [{ zpuid }] }],
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
