"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { WikiCurrentUser, WikiPresenceMode, WikiPresenceState } from "@/types/wiki";

// Task 402 — live "who's here / who's editing" for /kb. One shared Supabase Realtime channel
// (`wiki-presence`) for every open /kb tab: Presence carries each tab's current page + mode,
// Broadcast carries `page-saved` pings so other viewers/editors learn about a newer revision
// before they hit Save. Nothing here touches the DB — Presence needs no migration.
//
// Public channel: the payload is limited to id/name/email/avatarUrl/page/mode (internal staff directory
// data). Private-channel authorization (realtime.messages RLS) is a documented follow-up.

const CHANNEL = "wiki-presence";
const SAVED_EVENT = "page-saved";

export type WikiPageSavedEvent = {
  pageId: string;
  revision: number;
  by: { id: string; name: string };
};

export function useWikiPresence({
  currentUser,
  pageId,
  mode,
  onPageSaved,
}: {
  currentUser: WikiCurrentUser;
  pageId: string | null;
  mode: WikiPresenceMode;
  onPageSaved: (event: WikiPageSavedEvent) => void;
}) {
  // Primitive deps only: `currentUser` is a fresh object whenever the server page re-renders
  // (every router.replace on page select), and depending on it would resubscribe the channel.
  const { id: userId, name: userName, email: userEmail, avatarUrl: userAvatarUrl } = currentUser;
  const [others, setOthers] = useState<WikiPresenceState[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const stateRef = useRef({ pageId, mode });
  const onPageSavedRef = useRef(onPageSaved);
  const sinceRef = useRef({ pageId, mode, since: new Date().toISOString() });
  const trackRef = useRef<() => void>(() => {});

  useEffect(() => {
    onPageSavedRef.current = onPageSaved;
  }, [onPageSaved]);

  const track = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || !subscribedRef.current) return;
    const { pageId: p, mode: m } = stateRef.current;
    // `since` resets only when the page or mode actually changes, so "editing for 6 min" is
    // measured from when editing started, not from the last re-track.
    if (sinceRef.current.pageId !== p || sinceRef.current.mode !== m) {
      sinceRef.current = { pageId: p, mode: m, since: new Date().toISOString() };
    }
    const payload: WikiPresenceState = {
      userId,
      name: userName,
      email: userEmail,
      avatarUrl: userAvatarUrl,
      pageId: p,
      mode: m,
      since: sinceRef.current.since,
    };
    void channel.track(payload);
  }, [userId, userName, userEmail, userAvatarUrl]);

  useEffect(() => {
    const supabase = createClient();
    // Per-tab presence key, so one user's two tabs don't overwrite each other's entry.
    const key = `${userId}:${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase.channel(CHANNEL, { config: { presence: { key } } });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const flat = Object.values(channel.presenceState<WikiPresenceState>()).flat();
        setOthers(flat.filter((entry) => entry.userId !== userId));
      })
      .on("broadcast", { event: SAVED_EVENT }, ({ payload }) => {
        onPageSavedRef.current(payload as WikiPageSavedEvent);
      })
      .subscribe((status) => {
        subscribedRef.current = status === "SUBSCRIBED";
        if (subscribedRef.current) trackRef.current();
      });

    return () => {
      subscribedRef.current = false;
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
    // Tracking goes through `trackRef` so a name/email change re-tracks via the effect below
    // instead of tearing the channel down.
  }, [userId]);

  useEffect(() => {
    stateRef.current = { pageId, mode };
    trackRef.current = track;
    track();
  }, [pageId, mode, track]);

  const broadcastSaved = useCallback(
    (event: Omit<WikiPageSavedEvent, "by">) => {
      void channelRef.current?.send({
        type: "broadcast",
        event: SAVED_EVENT,
        payload: { ...event, by: { id: userId, name: userName } },
      });
    },
    [userId, userName]
  );

  // One entry per user (a user with several tabs counts once; editing wins over viewing).
  const editorsByPage = useMemo(() => {
    const map = new Map<string, WikiPresenceState[]>();
    for (const entry of others) {
      if (entry.mode !== "editing" || !entry.pageId) continue;
      const list = map.get(entry.pageId) ?? [];
      if (!list.some((e) => e.userId === entry.userId)) list.push(entry);
      map.set(entry.pageId, list);
    }
    return map;
  }, [others]);

  const viewersOfPage = useMemo(() => {
    if (!pageId) return [];
    const editing = new Set((editorsByPage.get(pageId) ?? []).map((e) => e.userId));
    const seen = new Set<string>();
    return others.filter((entry) => {
      if (entry.pageId !== pageId || editing.has(entry.userId) || seen.has(entry.userId)) return false;
      seen.add(entry.userId);
      return true;
    });
  }, [others, pageId, editorsByPage]);

  return {
    editorsByPage,
    editorsOfPage: pageId ? editorsByPage.get(pageId) ?? [] : [],
    viewersOfPage,
    broadcastSaved,
  };
}
