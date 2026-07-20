"use client";

import { useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { HelpCircle, Sparkles } from "lucide-react";
import { V2_ROUTES } from "@/config/constants";
import NotificationBell from "./notification-bell";

// Breadcrumb map — path prefix → label hierarchy
const BREADCRUMB_MAP: Record<string, { section: string; page: string }> = {
  [V2_ROUTES.DASHBOARD]:           { section: "Work",      page: "Dashboard" },
  [V2_ROUTES.PROJECTS]:            { section: "Work",      page: "Projects" },
  [V2_ROUTES.CUSTOMERS]:           { section: "Work",      page: "Customers" },
  [V2_ROUTES.DASHBOARD_TASKS]:     { section: "Work",      page: "Desk" },
  [V2_ROUTES.DASHBOARD_PIPELINE]:  { section: "Work",      page: "Pipeline" },
  [V2_ROUTES.DASHBOARD_CHAT]:      { section: "Work",      page: "AI Chat" },
  [V2_ROUTES.ORCHESTRATION]:       { section: "Work",      page: "Orchestration" },
  [V2_ROUTES.DASHBOARD_TIMELOGS]:  { section: "Work",      page: "Time Logs" },
  [V2_ROUTES.PORTFOLIO_TRACKER]:   { section: "Work",      page: "Portfolio Tracker" },
  [V2_ROUTES.DASHBOARD_SETTINGS]:  { section: "Admin",     page: "Settings" },
  [V2_ROUTES.DASHBOARD_USERS]:     { section: "Admin",     page: "Users" },
  [V2_ROUTES.KB]:                  { section: "Knowledge", page: "Wiki" },
};

function getBreadcrumb(pathname: string): { section: string; page: string } {
  // Exact match first
  if (BREADCRUMB_MAP[pathname]) return BREADCRUMB_MAP[pathname];
  // Prefix match (longest first)
  const sorted = Object.entries(BREADCRUMB_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, crumb] of sorted) {
    if (pathname.startsWith(prefix + "/")) return crumb;
  }
  return { section: "WebriQ", page: "Hub" };
}

// Static presence avatars (visual only — real presence is a future feature)
const PRESENCE = [
  { initials: "RJ", bg: "#7C3AED" },
  { initials: "KL", bg: "#0D9488" },
  { initials: "TM", bg: "#DC2626" },
];

interface V2HubHeaderProps {
  chatOpen: boolean;
  onOpenChat: () => void;
  onOpenWithMessage: (message: string) => void;
}

export default function V2HubHeader({ chatOpen, onOpenChat, onOpenWithMessage }: V2HubHeaderProps) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const crumb = getBreadcrumb(pathname);
  const isActive = chatOpen || inputFocused;

  function handleQueryKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && query.trim()) {
      onOpenWithMessage(query.trim());
      setQuery("");
    }
  }

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 gap-4 shrink-0 relative z-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 flex-1">
        <span className="text-[14px] text-slate-400">{crumb.section}</span>
        <span className="text-[14px] text-slate-300">/</span>
        <span className="text-[14px] font-medium text-slate-900">{crumb.page}</span>
      </nav>

      {/* OpsChat input bar */}
      <div className="flex-shrink-0">
        <div
          onClick={() => inputRef.current?.focus()}
          className="flex items-center gap-2.5 px-5 py-3.5 rounded-full cursor-text transition-all duration-150"
          style={
            isActive
              ? {
                  background: "linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(90deg, #F59E0B, #F97316) border-box",
                  border: "1.5px solid transparent",
                  boxShadow: "0 0 0 3px rgba(245,158,11,0.15)",
                  width: 340,
                }
              : {
                  background: "#F8FAFC",
                  border: "1.5px solid #E2E8F0",
                  width: 340,
                }
          }
        >
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #F59E0B, #F97316)" }}
          >
            <Sparkles size={13} color="#FFFFFF" />
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleQueryKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="Ask anything — tasks, tickets, leaves…"
            className="text-[13px] text-slate-700 flex-1 bg-transparent outline-none placeholder:text-slate-400 min-w-0"
          />
          <kbd className="text-[11px] text-slate-300 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 font-mono shrink-0">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3 flex-1 justify-end">
        {/* Presence avatars */}
        {/* <div className="flex items-center">
          {PRESENCE.map((av, i) => (
            <div
              key={i}
              title={av.initials}
              className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-semibold text-white"
              style={{ background: av.bg, marginLeft: i > 0 ? -8 : 0 }}
            >
              {av.initials}
            </div>
          ))}
          <div
            className="w-7 h-7 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-semibold text-slate-500"
            style={{ marginLeft: -8 }}
          >
            +5
          </div>
        </div> */}

        {/* Notification bell */}
        <NotificationBell />

        {/* Help */}
        <button aria-label="Help" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer">
          <HelpCircle size={18} />
        </button>

        {/* Ops Chat icon — manual trigger */}
        <button
          onClick={onOpenChat}
          className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 shrink-0"
          style={{
            background: chatOpen
              ? "linear-gradient(135deg, #F59E0B, #F97316)"
              : "#F1F5F9",
            boxShadow: chatOpen ? "0 0 0 3px rgba(245,158,11,0.15)" : "none",
          }}
          aria-label="Open Ops Chat"
        >
          <Sparkles size={16} color={chatOpen ? "#FFFFFF" : "#94A3B8"} />
        </button>
      </div>
    </header>
  );
}
