// Zoho API client — Sprint 2 (M2), Sprint 4 (M7)
import { adminClient } from "@/lib/supabase/admin";

export async function getZohoAccessToken(): Promise<string> {
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
  return (json.access_token as string) ?? "";
}

export async function createZohoProject(customerId: string, projectName: string): Promise<string> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) {
    console.warn("[zoho] ZOHO_PORTAL_ID not configured — skipping project creation for", customerId);
    return "";
  }

  const token = await getZohoAccessToken();
  if (!token) return "";

  // Zoho Projects API requires form-encoded body (not JSON).
  // owner defaults to the authenticated OAuth user — no need to pass it explicitly.
  const body = new URLSearchParams({
    name: projectName,
    description: `WebriQ Hub managed project for ${customerId}`,
  });

  const res = await fetch(`https://projectsapi.zoho.com/restapi/portal/${portalId}/projects/`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    console.error("[zoho] project creation failed:", res.status, await res.text());
    return "";
  }

  const json = await res.json();
  return (json?.projects?.[0]?.id_string as string) ?? "";
}

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

  const body = new URLSearchParams({ name: input.title });
  if (input.description) body.set("description", input.description);

  const res = await fetch(
    `https://projectsapi.zoho.com/restapi/portal/${portalId}/projects/${product.zoho_project_id}/tasks/`,
    {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }
  );

  if (!res.ok) {
    console.error("[zoho] task creation failed:", res.status, await res.text());
    return "";
  }

  const json = await res.json();
  return (json?.tasks?.[0]?.id_string as string) ?? "";
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

  const body = new URLSearchParams({ completed: completed ? "true" : "false" });

  const res = await fetch(
    `https://projectsapi.zoho.com/restapi/portal/${portalId}/projects/${zohoProjectId}/tasks/${zohoTaskId}/`,
    {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
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
