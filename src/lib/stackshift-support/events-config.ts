import { resolveEventsConfig, type EventsConfig } from "./events-config-logic";

// Task 452 (H1/H2) — env wrapper around the pure events-transport validation.
export function eventsConfigFromEnv(): EventsConfig {
  return resolveEventsConfig({
    url: process.env.STACKSHIFT_EVENTS_URL,
    secret: process.env.STACKSHIFT_EVENTS_SECRET,
    secretNext: process.env.STACKSHIFT_EVENTS_SECRET_NEXT,
    keyId: process.env.STACKSHIFT_EVENTS_KEY_ID,
    production: process.env.NODE_ENV === "production",
  });
}
