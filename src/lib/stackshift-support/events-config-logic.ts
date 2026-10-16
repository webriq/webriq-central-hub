// Task 452 (H1/H2) — pure resolution + validation of the Hub -> StackShift events transport config. No env/DB
// imports (the caller passes the env in) so _docs/task/452-events-config.check.ts runs under plain tsx.
//
// The events secret and every event payload travel to STACKSHIFT_EVENTS_URL, so a mis-set URL must fail
// closed (events stay `pending`, nothing leaves the Hub) rather than send them in clear or to a URL that
// carries credentials. `STACKSHIFT_EVENTS_KEY_ID` + `STACKSHIFT_EVENTS_SECRET_NEXT` mirror the inbound
// rotation (contract §1): the receiver accepts both keys during the window, the Hub flips which one signs.

export type EventsKeyId = "current" | "next";

export type EventsConfig =
  | { ok: true; url: URL; secret: string; keyId: EventsKeyId }
  | { ok: false; reason: "not_configured" | "invalid_url" | "insecure_url" | "missing_next_secret" | "invalid_key_id"; detail?: string };

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function resolveEventsConfig(env: {
  url?: string;
  secret?: string;
  secretNext?: string;
  keyId?: string;
  production: boolean;
}): EventsConfig {
  if (!env.url || !env.secret) return { ok: false, reason: "not_configured" };

  let url: URL;
  try {
    url = new URL(env.url);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.username || url.password) return { ok: false, reason: "insecure_url", detail: "URL must not embed credentials" };
  if (url.search || url.hash) return { ok: false, reason: "insecure_url", detail: "URL must not contain a query string or fragment" };
  const loopbackDev = !env.production && url.protocol === "http:" && LOOPBACK.has(url.hostname);
  if (url.protocol !== "https:" && !loopbackDev) {
    return { ok: false, reason: "insecure_url", detail: "URL must be https (http only for localhost outside production)" };
  }

  const keyId = (env.keyId?.trim() || "current") as string;
  if (keyId !== "current" && keyId !== "next") return { ok: false, reason: "invalid_key_id", detail: keyId };
  if (keyId === "next") {
    if (!env.secretNext) return { ok: false, reason: "missing_next_secret" };
    return { ok: true, url, secret: env.secretNext, keyId };
  }
  return { ok: true, url, secret: env.secret, keyId };
}
