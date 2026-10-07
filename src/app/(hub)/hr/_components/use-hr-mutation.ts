"use client";

import { useCallback, useState } from "react";

export interface MutationResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

/** Thin fetch wrapper for HR route handlers: JSON in/out, a `busy` flag, plain-language errors. */
export function useHrMutation() {
  const [busy, setBusy] = useState(false);

  const run = useCallback(async <T = Record<string, unknown>>(method: "POST" | "PATCH" | "PUT" | "DELETE", url: string, body?: unknown): Promise<MutationResult<T>> => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
      if (!res.ok) return { ok: false, status: res.status, data: null, error: json?.error ?? "Something went wrong. Try again." };
      return { ok: true, status: res.status, data: json, error: null };
    } catch {
      return { ok: false, status: 0, data: null, error: "Couldn't reach the server. Check your connection and try again." };
    } finally {
      setBusy(false);
    }
  }, []);

  return { run, busy };
}
