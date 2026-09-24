"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Task 402 — per-user server draft autosave for the wiki editor. While editing, every change is
// PUT to /api/wiki/pages/[pageId]/draft after a 2 s pause (same cadence as
// `src/hooks/use-auto-save.ts`, whose onboarding-PATCH contract this can't reuse). The draft
// survives a tab close / crash / page switch and lets other users see "X has unsaved changes".
// A successful Save deletes the draft server-side (inside the `wiki_save_page` RPC).

const DEBOUNCE_MS = 2000;

export type WikiDraftStatus = "idle" | "pending" | "saving" | "saved" | "error";

export type WikiDraftValues = { title: string; contentHtml: string; tags: string[] };

function sameValues(a: WikiDraftValues, b: WikiDraftValues): boolean {
  return a.title === b.title && a.contentHtml === b.contentHtml && a.tags.join("\u0000") === b.tags.join("\u0000");
}

export function useWikiDraft({
  pageId,
  enabled,
  values,
  baseline,
  baseRevision,
}: {
  pageId: string | null;
  enabled: boolean;
  values: WikiDraftValues;
  // What the editor opened with — a draft is only written once the values diverge from it.
  baseline: WikiDraftValues | null;
  baseRevision: number | null;
}) {
  const [status, setStatus] = useState<WikiDraftStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const latestRef = useRef({ pageId, values, baseRevision });

  useEffect(() => {
    latestRef.current = { pageId, values, baseRevision };
  }, [pageId, values, baseRevision]);

  const persist = useCallback(() => {
    timerRef.current = null;
    const { pageId: id, values: v, baseRevision: base } = latestRef.current;
    if (!id || base === null) return Promise.resolve();
    setStatus("saving");
    const run = (async () => {
      try {
        const res = await fetch(`/api/wiki/pages/${id}/draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...v, baseRevision: base }),
        });
        if (!res.ok) throw new Error(`draft save failed: ${res.status}`);
        const body = (await res.json()) as { updatedAt: string };
        setSavedAt(body.updatedAt);
        setStatus("saved");
      } catch (err) {
        console.error("[wiki] draft autosave failed", err);
        setStatus("error");
      }
    })();
    inflightRef.current = run;
    return run;
  }, []);

  const dirty = enabled && baseline !== null && !sameValues(values, baseline);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    // Reverted back to what the editor opened with — nothing new to keep.
    if (!dirty) return;
    timerRef.current = setTimeout(() => void persist(), DEBOUNCE_MS);
    // Deferred, matching this codebase's react-hooks/set-state-in-effect convention.
    Promise.resolve().then(() => setStatus("pending"));
  }, [dirty, values, persist]);

  // Leaving edit mode (Save / Cancel / page switch) — cancel any queued write. Callers that
  // want the pending change kept call flush() first.
  useEffect(() => {
    if (enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    Promise.resolve().then(() => {
      setStatus("idle");
      setSavedAt(null);
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (timerRef.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [enabled]);

  const flush = useCallback(async () => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    await persist();
  }, [persist]);

  const discard = useCallback(async (id: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    await inflightRef.current;
    await fetch(`/api/wiki/pages/${id}/draft`, { method: "DELETE" }).catch(() => undefined);
  }, []);

  // Drop any queued write and wait out an in-flight one — called right before Save, so a late
  // draft PUT can't land after the save RPC has already deleted the server-side draft.
  const settle = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    await inflightRef.current;
  }, []);

  // Write the current values now, regardless of the debounce — used when a save conflict is
  // resolved with "Reload theirs", so the user's version survives as their draft.
  const persistNow = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await inflightRef.current;
    await persist();
  }, [persist]);

  return { status, savedAt, dirty, flush, discard, settle, persistNow };
}
