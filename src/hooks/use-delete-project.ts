"use client";

import { useCallback, useState } from "react";

interface UseDeleteProjectReturn {
  deleteProject: (projectId: string) => Promise<boolean>;
  deleting: boolean;
  error: string | null;
}

// Wraps DELETE /api/v2/projects/[projectId] — a soft delete (sets status = "deleted",
// never removes the row; see task 231). Shared by the Projects and Portfolio Tracker
// detail-page delete actions so the fetch/error-state logic isn't duplicated.
export function useDeleteProject(): UseDeleteProjectReturn {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteProject = useCallback(async (projectId: string): Promise<boolean> => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to delete project");
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project");
      return false;
    } finally {
      setDeleting(false);
    }
  }, []);

  return { deleteProject, deleting, error };
}
