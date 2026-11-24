"use client";

import { useCallback, useState } from "react";

interface UseArchiveProjectReturn {
  // Resolves to null on success, or the error message (also exposed as `error`).
  setArchived: (projectId: string, archived: boolean) => Promise<string | null>;
  saving: boolean;
  error: string | null;
}

// Task 501 — wraps PATCH /api/v2/projects/[projectId] for Archive / Restore. Restore always sets
// status = "active" (the pre-archive status isn't recorded). Mirrors useDeleteProject.
export function useArchiveProject(): UseArchiveProjectReturn {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setArchived = useCallback(async (projectId: string, archived: boolean): Promise<string | null> => {
    setSaving(true);
    setError(null);
    const fallback = archived ? "Failed to archive project" : "Failed to restore project";
    try {
      const res = await fetch(`/api/v2/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: archived ? "archived" : "active" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || fallback);
      }
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : fallback;
      setError(message);
      return message;
    } finally {
      setSaving(false);
    }
  }, []);

  return { setArchived, saving, error };
}
