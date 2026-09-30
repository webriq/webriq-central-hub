"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { WikiCurrentUser, WikiPageDetail } from "@/types/wiki";
import { useWikiPresence, type WikiPageSavedEvent } from "./_use-wiki-presence";
import type { WikiStaleNotice } from "./_wiki-presence-bar";
import type { EditingPages } from "./_wiki-tree-panel-rows";

// Task 402 — everything /kb derives from the live presence channel, kept out of
// `_wiki-shell.tsx`: the "X updated this page" notice (from `page-saved` broadcasts), draft-
// holder refreshes when editors come and go, and the tree's pageId → editor-names map.

export function useWikiLive({
  currentUser,
  selectedPageId,
  detail,
  setDetail,
  editMode,
  refreshPages,
}: {
  currentUser: WikiCurrentUser;
  selectedPageId: string | null;
  detail: WikiPageDetail | null;
  setDetail: Dispatch<SetStateAction<WikiPageDetail | null>>;
  editMode: boolean;
  refreshPages: () => Promise<void>;
}) {
  const [staleNotice, setStaleNotice] = useState<(WikiStaleNotice & { pageId: string }) | null>(null);

  // Refreshes only the draft-holder/own-draft metadata — no loading skeleton, content
  // untouched — so it's safe while the user is mid-edit.
  const refreshDraftMeta = useCallback(
    async (pageId: string) => {
      const res = await fetch(`/api/wiki/pages/${pageId}`);
      if (!res.ok) return;
      const fresh = (await res.json()) as WikiPageDetail;
      setDetail((prev) => (prev?.id === pageId ? { ...prev, draftHolders: fresh.draftHolders, myDraft: fresh.myDraft } : prev));
    },
    [setDetail]
  );

  const selectedPageIdRef = useRef(selectedPageId);
  const detailRevisionRef = useRef(detail?.revision ?? 0);
  useEffect(() => {
    selectedPageIdRef.current = selectedPageId;
    detailRevisionRef.current = detail?.revision ?? 0;
  }, [selectedPageId, detail?.revision]);

  const onPageSaved = useCallback(
    (event: WikiPageSavedEvent) => {
      void refreshPages();
      if (event.pageId !== selectedPageIdRef.current || event.revision <= detailRevisionRef.current) return;
      setStaleNotice({ pageId: event.pageId, byName: event.by.name, revision: event.revision });
      void refreshDraftMeta(event.pageId);
    },
    [refreshPages, refreshDraftMeta]
  );

  const presence = useWikiPresence({
    currentUser,
    pageId: selectedPageId,
    mode: editMode ? "editing" : "viewing",
    onPageSaved,
  });

  // Someone started/stopped editing the open page — their draft may have appeared or cleared.
  const editorsKey = presence.editorsOfPage.map((e) => e.userId).sort().join(",");
  useEffect(() => {
    if (!selectedPageId) return;
    Promise.resolve().then(() => refreshDraftMeta(selectedPageId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorsKey]);

  const editingPages: EditingPages = useMemo(() => {
    const map: EditingPages = new Map();
    for (const [pageId, editors] of presence.editorsByPage) map.set(pageId, editors.map((e) => e.name));
    return map;
  }, [presence.editorsByPage]);

  // Derived rather than cleared imperatively: once the loaded page has caught up to the
  // announced revision (reload, or the user's own save), the notice disappears.
  const visibleNotice: WikiStaleNotice | null =
    staleNotice && detail && staleNotice.pageId === detail.id && staleNotice.revision > detail.revision ? staleNotice : null;

  return {
    presence,
    staleNotice: visibleNotice,
    refreshDraftMeta,
    editingPages,
  };
}
