"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, XCircle, Clock, X, type LucideIcon } from "lucide-react";
import { formatRelativeTime, cn } from "@/lib/utils";

type Actor = { full_name: string | null; avatar_url: string | null };

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  read_at: string | null;
  created_at: string;
  actor: Actor | null;
};

const POLL_INTERVAL_MS = 30_000;
const TRANSITION_MS = 220;
const INITIAL_LIMIT = 10;
const PAGE_SIZE = 10;
const SCROLL_THRESHOLD_PX = 120;

function getNotificationVisual(type: string): { Icon: LucideIcon; iconBg: string; iconColor: string } {
  if (type === "plan_rejected") return { Icon: XCircle, iconBg: "bg-red-50", iconColor: "text-red-600" };
  if (type.startsWith("programme_reminder_")) return { Icon: Clock, iconBg: "bg-amber-50", iconColor: "text-amber-600" };
  if (
    type === "plan_approved" ||
    type === "programme_phase_complete" ||
    type === "programme_complete" ||
    type === "onboarding_complete" ||
    type === "deliverable_complete"
  ) {
    return { Icon: CheckCircle2, iconBg: "bg-emerald-50", iconColor: "text-emerald-600" };
  }
  return { Icon: Bell, iconBg: "bg-slate-100", iconColor: "text-slate-500" };
}

const AVATAR_BG_CLASSES = ["bg-violet-500", "bg-teal-600", "bg-red-500", "bg-blue-600", "bg-amber-600", "bg-pink-600"];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_BG_CLASSES[Math.abs(hash) % AVATAR_BG_CLASSES.length];
}

function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const initials = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return initials.toUpperCase() || "?";
}

function NotificationLeadingVisual({ notification }: { notification: Notification }) {
  const actorName = notification.actor?.full_name;
  if (actorName) {
    if (notification.actor?.avatar_url) {
      // eslint-disable-next-line @next/next/no-img-element -- external Supabase-auth-provider avatar URL, not a static/optimizable asset
      return <img src={notification.actor.avatar_url} alt={actorName} className="w-9 h-9 rounded-full object-cover shrink-0" />;
    }
    return (
      <span className={`flex items-center justify-center w-9 h-9 rounded-full shrink-0 text-white text-[12px] font-semibold ${colorForName(actorName)}`}>
        {initialsForName(actorName)}
      </span>
    );
  }
  const { Icon, iconBg, iconColor } = getNotificationVisual(notification.type);
  return (
    <span className={`flex items-center justify-center w-9 h-9 rounded-full shrink-0 ${iconBg}`}>
      <Icon size={16} className={iconColor} />
    </span>
  );
}

function NotificationSkeletonRow() {
  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <span className="w-9 h-9 rounded-full bg-[#EDF0F7] shrink-0 animate-pulse" />
      <span className="min-w-0 flex-1 space-y-2 pt-0.5">
        <span className="block h-3 w-3/5 rounded bg-[#EDF0F7] animate-pulse" />
        <span className="block h-3 w-full rounded bg-[#EDF0F7] animate-pulse" />
        <span className="block h-2.5 w-1/4 rounded bg-[#EDF0F7] animate-pulse" />
      </span>
    </div>
  );
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007BFF] focus-visible:ring-offset-2 focus-visible:ring-offset-white";
const HOVER_TRANSITION = "transition-colors duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)]";

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_LIMIT);
  const [hasMore, setHasMore] = useState(false);

  const visibleLimitRef = useRef(visibleLimit);
  useEffect(() => {
    visibleLimitRef.current = visibleLimit;
  }, [visibleLimit]);

  const fetchNotifications = useCallback(async (limit: number) => {
    try {
      const res = await fetch(`/api/notifications?limit=${limit}`);
      if (!res.ok) return;
      const data = await res.json();
      const list: Notification[] = data.notifications ?? [];
      setNotifications(list);
      setUnreadCount(data.unreadCount ?? 0);
      setHasMore(list.length >= limit);
    } catch {
      // Transient fetch failure — keep last known state, next poll retries.
    }
  }, []);

  useEffect(() => {
    fetchNotifications(visibleLimitRef.current).finally(() => setLoading(false));
    const interval = setInterval(() => fetchNotifications(visibleLimitRef.current), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const openDrawer = useCallback(() => {
    setMounted(true);
    requestAnimationFrame(() => setOpen(true));
  }, []);

  const closeDrawer = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => setMounted(false), TRANSITION_MS);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeDrawer();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mounted, closeDrawer]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextLimit = visibleLimit + PAGE_SIZE;
    try {
      const res = await fetch(`/api/notifications?limit=${nextLimit}`);
      if (res.ok) {
        const data = await res.json();
        const list: Notification[] = data.notifications ?? [];
        setNotifications(list);
        setUnreadCount(data.unreadCount ?? 0);
        setHasMore(list.length >= nextLimit);
        setVisibleLimit(nextLimit);
      }
    } catch {
      // Best-effort — user can scroll again to retry.
    } finally {
      setLoadingMore(false);
    }
  }

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_THRESHOLD_PX) {
      loadMore();
    }
  }

  async function markRead(id: string) {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    setUnreadCount(prev => Math.max(0, prev - 1));
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    } catch {
      // Best-effort — next poll reconciles state.
    }
  }

  async function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await fetch("/api/notifications/mark-all-read", { method: "POST" });
    } catch {
      // Best-effort — next poll reconciles state.
    }
  }

  function handleItemClick(n: Notification) {
    if (!n.read_at) markRead(n.id);
    closeDrawer();
    if (n.url) router.push(n.url);
  }

  const showBottomFade = !loading && notifications.length > 0 && (hasMore || loadingMore);

  return (
    <>
      <button
        aria-label="Notifications"
        onClick={openDrawer}
        className={`relative p-1.5 rounded-lg text-[#5F6A88] hover:bg-[#F4F6FB] hover:text-[#3A4565] ${HOVER_TRANSITION} cursor-pointer ${FOCUS_RING}`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[#FB914E] border-2 border-white flex items-center justify-center text-[10px] font-semibold text-[#471F02] leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {mounted && (
        <>
          <div
            aria-hidden="true"
            onClick={closeDrawer}
            className={`fixed inset-0 bg-slate-900/20 z-[99999] transition-opacity motion-reduce:transition-none duration-200 ${open ? "opacity-100" : "opacity-0"}`}
          />
          <div
            role="dialog"
            aria-label="Notifications"
            className={`fixed right-0 top-0 h-full w-full max-w-100 bg-white z-[99999] shadow-[0_8px_24px_rgba(7,17,51,0.10)] flex flex-col transition-transform ease-out motion-reduce:transition-none duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E7F2] shrink-0">
              <span className="text-[14px] font-semibold text-[#0B1533]">Notifications</span>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className={`text-[12px] font-medium text-[#B85512] hover:text-[#E2762F] ${HOVER_TRANSITION} cursor-pointer rounded px-1 -mx-1 ${FOCUS_RING}`}
                  >
                    Mark all read
                  </button>
                )}
                <button
                  aria-label="Close notifications"
                  onClick={closeDrawer}
                  className={`p-1 rounded-[10px] text-[#5F6A88] hover:text-[#3A4565] hover:bg-[#F4F6FB] ${HOVER_TRANSITION} cursor-pointer ${FOCUS_RING}`}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="relative flex-1 min-h-0">
              <div className="h-full overflow-y-auto" onScroll={handleScroll}>
                {loading ? (
                  <div>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <NotificationSkeletonRow key={i} />
                    ))}
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
                    <span className="w-12 h-12 rounded-2xl bg-[#F0F7FF] flex items-center justify-center text-[#007BFF]">
                      <Bell size={20} />
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold text-[#0B1533]">You&apos;re all caught up</p>
                      <p className="text-[12px] text-[#5F6A88] mt-1 max-w-60">New activity — approvals, deliverables, reminders — will show up here.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {notifications.map(n => {
                      const unread = !n.read_at;
                      return (
                        <button
                          key={n.id}
                          onClick={() => handleItemClick(n)}
                          className={cn(
                            "flex items-start gap-3 w-full text-left px-5 py-4 border-b border-[#EDF0F7] last:border-b-0 cursor-pointer",
                            HOVER_TRANSITION,
                            unread ? "bg-[#FB914E0D] hover:bg-[#FB914E1A]" : "hover:bg-[#F0F7FF]",
                            FOCUS_RING
                          )}
                        >
                          <NotificationLeadingVisual notification={n} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className={cn("text-[13px]", unread ? "font-semibold text-[#0B1533]" : "font-medium text-[#5F6A88]")}>
                                {n.title}
                              </span>
                              {unread && <span className="w-1.5 h-1.5 rounded-full bg-[#FB914E] shrink-0" />}
                            </span>
                            <span className={cn("block text-[12px] mt-0.5 line-clamp-2", unread ? "text-[#3A4565]" : "text-[#5F6A88]")}>
                              {n.body}
                            </span>
                            <span className="block text-[10px] text-[#5F6A88]/70 mt-1">{formatRelativeTime(n.created_at)}</span>
                          </span>
                        </button>
                      );
                    })}
                    {loadingMore &&
                      Array.from({ length: 2 }).map((_, i) => <NotificationSkeletonRow key={`more-${i}`} />)}
                  </>
                )}
              </div>
              {showBottomFade && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white to-transparent" />
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
