"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, XCircle, Clock, Loader2, X, type LucideIcon } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

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

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-1 focus-visible:ring-offset-white";

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // Transient fetch failure — keep last known state, next poll retries.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount + poll — setState happens after the async fetch resolves, not
    // synchronously in the effect body; the rule can't see past the await boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS);
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

  return (
    <>
      <button
        aria-label="Notifications"
        onClick={openDrawer}
        className={`relative p-1.5 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors cursor-pointer ${FOCUS_RING}`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 border-2 border-white flex items-center justify-center text-[10px] font-semibold text-white leading-none">
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
            className={`fixed right-0 top-0 h-full w-full max-w-100 bg-white z-[99999] shadow-[0_8px_32px_rgba(15,23,42,0.18)] flex flex-col transition-transform ease-out motion-reduce:transition-none duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <span className="text-[14px] font-semibold text-slate-900">Notifications</span>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className={`text-[12px] font-medium text-amber-600 hover:text-amber-700 transition-colors cursor-pointer rounded px-1 -mx-1 ${FOCUS_RING}`}
                  >
                    Mark all read
                  </button>
                )}
                <button
                  aria-label="Close notifications"
                  onClick={closeDrawer}
                  className={`p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer ${FOCUS_RING}`}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={20} className="animate-spin text-slate-300" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 px-4 text-center">
                  <Bell size={24} className="text-slate-300" />
                  <p className="text-[12px] text-slate-400">You&apos;re all caught up — no notifications yet.</p>
                </div>
              ) : (
                notifications.map(n => {
                  const unread = !n.read_at;
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleItemClick(n)}
                      className={`flex items-start gap-3 w-full text-left px-5 py-4 border-b border-slate-50 last:border-b-0 hover:bg-slate-50 transition-colors cursor-pointer ${FOCUS_RING}`}
                    >
                      <NotificationLeadingVisual notification={n} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-semibold text-slate-900">{n.title}</span>
                          {unread && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
                        </span>
                        <span className="block text-[12px] text-slate-600 mt-0.5 line-clamp-2">{n.body}</span>
                        <span className="block text-[10px] text-slate-400 mt-1">{formatRelativeTime(n.created_at)}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
