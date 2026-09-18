"use client";

import { useCallback, useRef, useState } from "react";
import type { HubUser } from "./page";
import type { DeactivationImpact } from "@/lib/users/deactivate";

// Task 378 — drives the deactivate flow: open → pre-flight impact → confirm → apply.
// Lives outside page.tsx so that page gains wiring, not logic (see the task doc's
// file-length plan). Reactivation is included here too since it's the same concern,
// but it's a one-shot call with no dialog.

// /simplify pass, round 3: this used to redeclare the same 4-field shape lib/users/deactivate.ts
// already exports, with no compiler check keeping the two in sync. `import type` is erased at
// compile time, so re-exporting the server module's type here carries zero runtime/bundling
// cost in this "use client" file — no server code ships to the browser, only the type shape.
// Re-exported (not just imported) since _deactivate-dialog.tsx and page.tsx both already
// import DeactivationImpact from this file rather than from lib/users/deactivate directly.
export type { DeactivationImpact };

interface Options {
  onDeactivated: (userId: string, impact: DeactivationImpact, sessionsCleared: boolean) => void;
  onReactivated: (userId: string) => void;
  onError: (message: string) => void;
}

export function useDeactivateUser({ onDeactivated, onReactivated, onError }: Options) {
  const [pending, setPending] = useState<HubUser | null>(null);
  const [impact, setImpact] = useState<DeactivationImpact | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Opening the dialog for user B while A's preview is still in flight must not let A's
  // numbers land in B's dialog. Each request claims a token; stale responses are dropped.
  const requestToken = useRef(0);

  const request = useCallback((user: HubUser) => {
    const token = ++requestToken.current;
    setPending(user);
    setImpact(null);
    setLoadingImpact(true);

    fetch(`/api/v2/users/${user.id}/deactivate`)
      .then(async (res) => {
        const data = await res.json() as { impact?: DeactivationImpact; error?: string };
        if (token !== requestToken.current) return;
        if (!res.ok) {
          onError(data.error ?? "Failed to check what this will affect.");
          setPending(null);
          return;
        }
        setImpact(data.impact ?? null);
      })
      .catch(() => {
        if (token !== requestToken.current) return;
        onError("Failed to check what this will affect.");
        setPending(null);
      })
      .finally(() => {
        if (token === requestToken.current) setLoadingImpact(false);
      });
  }, [onError]);

  const cancel = useCallback(() => {
    requestToken.current++;
    setPending(null);
    setImpact(null);
    setLoadingImpact(false);
  }, []);

  // /simplify pass: dropped a `pendingRef` mirror of `pending` that existed only so this
  // callback could avoid depending on `pending`. That was solving a problem this call site
  // doesn't have — confirm/cancel are only ever invoked from a fresh inline closure created at
  // render time (page.tsx: `onConfirm={() => void deact.confirm()}`), and DeactivateUserDialog/
  // ConfirmDialog are plain unmemoized components, so neither callback needs a stable identity.
  // Reading `pending` directly is simpler and behaves identically.
  const confirm = useCallback(async () => {
    if (!pending) return;
    const userId = pending.id;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/v2/users/${userId}/deactivate`, { method: "POST" });
      const data = await res.json() as { impact?: DeactivationImpact; sessionsCleared?: boolean; error?: string };
      if (!res.ok) {
        onError(data.error ?? "Failed to deactivate user.");
        return;
      }
      onDeactivated(
        userId,
        data.impact ?? { projectMemberships: 0, phaseMemberships: 0, ownedProjects: 0, ownedPhases: 0 },
        data.sessionsCleared ?? true
      );
      requestToken.current++;
      setPending(null);
      setImpact(null);
    } catch {
      onError("Failed to deactivate user.");
    } finally {
      setSubmitting(false);
    }
  }, [pending, onDeactivated, onError]);

  const reactivate = useCallback(async (userId: string) => {
    setBusyId(userId);
    try {
      const res = await fetch(`/api/v2/users/${userId}/reactivate`, { method: "POST" });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        onError(data.error ?? "Failed to reactivate user.");
        return;
      }
      onReactivated(userId);
    } catch {
      onError("Failed to reactivate user.");
    } finally {
      setBusyId(null);
    }
  }, [onReactivated, onError]);

  return { pending, impact, loadingImpact, submitting, busyId, request, cancel, confirm, reactivate };
}
