"use client";

import { useEffect } from "react";

// Task 416 — fire-and-forget beacon that records "the current user opened this project" for the
// Projects listing's "Recently accessed" sort. Mounted once in the [projectId] layout, which
// persists across tab navigation, so one project entry = one record (not one per tab click).
// Throttled per browser session so a reload / back-forward doesn't inflate access_count; every
// failure (network, storage blocked, migration not applied) is swallowed — it must never surface.
const THROTTLE_MS = 5 * 60 * 1000;

export default function RecordProjectView({ projectId }: { projectId: string }) {
  useEffect(() => {
    const key = `project-view:${projectId}`;
    try {
      const last = Number(sessionStorage.getItem(key) ?? 0);
      if (last && Date.now() - last < THROTTLE_MS) return;
      sessionStorage.setItem(key, String(Date.now()));
    } catch {
      // sessionStorage unavailable — record anyway.
    }
    fetch(`/api/v2/projects/${encodeURIComponent(projectId)}/view`, { method: "POST", keepalive: true }).catch(() => {});
  }, [projectId]);

  return null;
}
