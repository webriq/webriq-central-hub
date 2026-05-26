"use client";

import { Bell, LogOut, Settings } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { signOut } from "@/app/(auth)/actions";

interface HubHeaderProps {
  title?: string;
  subtitle?: string;
  displayName: string | null;
  email: string | null;
  zohoUserId: string | null;
}

const PATH_TITLES: Record<string, { title: string; subtitle?: string }> = {
  "/pm": { title: "Home", subtitle: "Project Manager Dashboard" },
  "/dev": { title: "My Dashboard", subtitle: "Developer daily view" },
  "/orchestration": { title: "AI Chat", subtitle: "Claude-powered assistant — Sprint 5" },
  "/kb": { title: "Knowledge Base", subtitle: "LLM Wiki — playbooks, internal KB, customer context — Sprint 6" },
  "/onboarding": { title: "Onboarding", subtitle: "Create a new customer" },
  "/customers": { title: "Customer Profile" },
};

function getTitleOverride(pathname: string): { title: string; subtitle?: string } | null {
  if (PATH_TITLES[pathname]) return PATH_TITLES[pathname];
  for (const [prefix, info] of Object.entries(PATH_TITLES)) {
    if (pathname.startsWith(prefix + "/")) return info;
  }
  return null;
}

function getInitials(name: string | null, email: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  if (email) {
    const [local] = email.split("@");
    if (local) {
      const parts = local.split(/[._-]/);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return local.slice(0, 2).toUpperCase();
    }
  }
  return "??";
}

export default function HubHeader({ title, subtitle, displayName, email, zohoUserId }: HubHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const override = getTitleOverride(pathname);
  const displayTitle = title ?? override?.title ?? "";
  const displaySubtitle = subtitle ?? override?.subtitle;
  const initials = getInitials(displayName, email);
  const shownName = displayName ?? email ?? "Unknown";
  const shownEmail = email ?? "\u2014";
  const shownZoho = zohoUserId ?? null;

  return (
    <header className="h-15 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
      <div className="flex flex-col gap-px">
        {displayTitle && <div className="text-base font-bold text-slate-900 leading-tight">{displayTitle}</div>}
        {displaySubtitle && <div className="text-xs text-slate-400">{displaySubtitle}</div>}
      </div>

      <div className="flex items-center gap-2.5">
        {/* Search */}
        <div className="relative flex items-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input type="text" placeholder="Search projects, clients, tasks..." className="text-[13px] py-1.75 pr-3 pl-7.5 border border-slate-200 rounded-lg text-slate-900 bg-page-bg outline-none w-60 font-[inherit]" />
        </div>

        {/* Notification bell */}
        <div className="relative">
          <button className="w-8.5 h-8.5 rounded-lg bg-transparent border border-slate-200 flex items-center justify-center cursor-pointer relative">
            <Bell size={18} color="#64748B" />
            <span className="absolute top-1.5 right-1.5 w-1.75 h-1.75 rounded-full bg-orange-500 border-[1.5px] border-white" />
          </button>
        </div>

        {/* User Avatar + Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="w-8 h-8 rounded-full bg-brand text-white text-[11px] font-bold flex items-center justify-center cursor-pointer border-2 border-transparent hover:border-brand-blue/30 transition-all"
          >
            {initials}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] z-50 overflow-hidden">
              <div className="px-4 pt-4 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-brand text-white text-[13px] font-bold flex items-center justify-center shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-slate-900 truncate">{shownName}</div>
                    <div className="text-[11px] text-slate-500 truncate">{shownEmail}</div>
                  </div>
                </div>
                {shownZoho && (
                  <div className="text-[10px] text-slate-400 bg-slate-50 rounded-md px-2.5 py-1.5 font-mono">
                    Zoho ID: {shownZoho}
                  </div>
                )}
              </div>
              <div className="py-1">
                <button
                  onClick={() => { setMenuOpen(false); router.push("/pm/settings"); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer font-[inherit] text-left"
                >
                  <Settings size={15} className="text-slate-400" />
                  Settings
                </button>
                <button
                  onClick={() => { setMenuOpen(false); signOut(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-red-600 hover:bg-red-50 transition-colors cursor-pointer font-[inherit] text-left"
                >
                  <LogOut size={15} />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}