"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { UnreadCount } from "@/lib/desk/inbox-unread";

// Task 490 — live count of Desk Inbox threads with new customer messages. Fetches on mount and on every navigation,
// and refetches (debounced) on any `inbox` INSERT/UPDATE broadcast by Supabase Realtime (migration 186 adds `inbox` to
// the publication; the Desk poll's upserts arrive in bursts, hence the debounce). Used by the sidebar badge and the
// Inbox page header — each caller gets its own channel (useId), since the browser client is a shared singleton.
// `enabled: false` (roles without Inbox access) skips both the fetch and the subscription.
const REFETCH_DEBOUNCE_MS = 1500;
const UNSUPPORTED: UnreadCount = { count: 0, supported: false };

export function useInboxUnreadCount(enabled: boolean): UnreadCount {
  const pathname = usePathname();
  const channelSuffix = useId();
  const [state, setState] = useState<UnreadCount>(UNSUPPORTED);
  const mountedRef = useRef(true);

  const load = useCallback(() => {
    fetch("/api/desk/inbox/unread")
      .then((res) => (res.ok ? (res.json() as Promise<UnreadCount>) : null))
      .then((data) => {
        if (mountedRef.current && data) setState({ count: data.count, supported: data.supported });
      })
      .catch(() => {
        // Transient network failure — keep the last known count; the next event or navigation retries.
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Navigation refetch (also covers "I just opened a thread and it was marked read").
  useEffect(() => {
    if (enabled) load();
  }, [enabled, pathname, load]);

  // Live updates.
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleLoad = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, REFETCH_DEBOUNCE_MS);
    };
    const supabase = createClient();
    const channel = supabase
      .channel(`desk_inbox_unread_${channelSuffix}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "inbox" }, scheduleLoad)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "inbox" }, scheduleLoad)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, channelSuffix, load]);

  return enabled ? state : UNSUPPORTED;
}
