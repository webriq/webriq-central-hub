"use client";

import { useCallback, useEffect, useState } from "react";
import type { ShareSelection } from "@/components/share-picker";
import type { DrivePermission, DriveShare } from "@/lib/drive/types";

export type ShareTarget = { kind: "folder" | "file"; id: string; name: string };

const CONCURRENCY = 4;

async function message(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return (body as { error?: string }).error ?? fallback;
}

// Task 436/438 — loads and mutates the shares of one item (owner-only; the API and RLS both enforce it).
export function useDriveShares(target: ShareTarget, onCountChange: (count: number) => void) {
  const [shares, setShares] = useState<DriveShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const param = `${target.kind === "folder" ? "folderId" : "fileId"}=${target.id}`;

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/drive/shares?${param}`, { signal: controller.signal });
        if (!res.ok) { setError(await message(res, "Couldn't load who has access.")); setLoading(false); return; }
        setShares((await res.json()) as DriveShare[]);
        setLoading(false);
      } catch {
        if (!controller.signal.aborted) { setError("Couldn't load who has access — check your connection."); setLoading(false); }
      }
    })();
    return () => controller.abort();
  }, [param]);

  const commit = useCallback((next: DriveShare[]) => { setShares(next); onCountChange(next.length); }, [onCountChange]);

  const postShare = useCallback(async (grantee: { userId: string } | { role: string }, permission: DrivePermission): Promise<DriveShare | null> => {
    const body = { [target.kind === "folder" ? "folderId" : "fileId"]: target.id, permission, ...grantee };
    try {
      const res = await fetch("/api/drive/shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return res.ok ? ((await res.json()) as DriveShare) : null;
    } catch {
      return null;
    }
  }, [target]);

  // Task 438 — share one batch (any mix of roles and people) at a single permission. One POST per
  // target (the existing endpoint), CONCURRENCY at a time. Resolves to the selection that FAILED so
  // the dialog can keep just those chips selected for a retry.
  const addMany = useCallback(async (selection: ShareSelection, permission: DrivePermission): Promise<ShareSelection> => {
    const jobs = [
      ...selection.roles.map((role) => ({ kind: "role" as const, key: role, grantee: { role } })),
      ...selection.userIds.map((userId) => ({ kind: "user" as const, key: userId, grantee: { userId } })),
    ];
    setBusy(true); setError(null);
    const created: DriveShare[] = [];
    const failed: ShareSelection = { roles: [], userIds: [] };
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      const batch = jobs.slice(i, i + CONCURRENCY);
      const rows = await Promise.all(batch.map((j) => postShare(j.grantee, permission)));
      rows.forEach((row, idx) => {
        if (row) created.push(row);
        else if (batch[idx].kind === "role") failed.roles.push(batch[idx].key);
        else failed.userIds.push(batch[idx].key);
      });
    }
    const merged = [...shares.filter((s) => !created.some((c) => c.id === s.id)), ...created];
    if (created.length > 0) commit(merged);
    const failedCount = failed.roles.length + failed.userIds.length;
    if (failedCount > 0) setError(`${failedCount} of ${jobs.length} couldn't be shared — try again.`);
    setBusy(false);
    return failed;
  }, [commit, postShare, shares]);

  const setPermission = useCallback(async (id: string, permission: DrivePermission) => {
    setError(null);
    const res = await fetch(`/api/drive/shares/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permission }) });
    if (!res.ok) { setError(await message(res, "Couldn't update access — try again.")); return; }
    commit(shares.map((s) => (s.id === id ? { ...s, permission } : s)));
  }, [commit, shares]);

  const remove = useCallback(async (id: string) => {
    setError(null);
    const res = await fetch(`/api/drive/shares/${id}`, { method: "DELETE" });
    if (!res.ok) { setError(await message(res, "Couldn't remove access — try again.")); return; }
    commit(shares.filter((s) => s.id !== id));
  }, [commit, shares]);

  return { shares, loading, busy, error, addMany, setPermission, remove };
}
