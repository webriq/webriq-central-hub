"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  FolderOpen,
  UserPlus,
  Layout,
  Clock,
  BarChart2,
  Settings,
  ChevronLeft,
  ChevronRight,
  ScanSearch,
  Bot,
  BookOpen,
} from "lucide-react";
import { ROUTES } from "@/config/constants";
import { cn } from "@/lib/utils";
import Image from "next/image";

const navGroups = [
  {
    section: "Main",
    items: [
      { href: ROUTES.PM, label: "Dashboard", icon: LayoutDashboard },
      { href: "/projects", label: "Projects", icon: FolderOpen },
      { href: ROUTES.ONBOARDING, label: "Onboarding", icon: UserPlus },
      { href: ROUTES.CLASSIFICATION, label: "Classification", icon: ScanSearch },
      { href: ROUTES.ORCHESTRATION, label: "Orchestration", icon: Bot },
    ],
  },
  {
    section: "Developer",
    items: [
      { href: ROUTES.DEV, label: "My Dashboard", icon: Layout },
      { href: "/timetrack", label: "Time Tracking", icon: Clock },
    ],
  },
  {
    section: "Admin",
    items: [
      { href: ROUTES.KB, label: "Knowledge Base", icon: BookOpen },
      { href: "/reports", label: "Reports", icon: BarChart2 },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  pm: "Project Manager",
  developer: "Developer",
  client: "Client",
};

function getInitials(email: string | null): string {
  if (!email) return "??";
  const [local] = email.split("@");
  if (!local) return "??";
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

interface HubSidebarProps {
  userEmail: string | null;
  userRole: string | null;
}

export default function HubSidebar({ userEmail, userRole }: HubSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const initials = getInitials(userEmail);
  const displayEmail = userEmail ?? "Unknown";
  const roleLabel = ROLE_LABELS[userRole ?? ""] ?? "User";

  return (
    <aside
      className={cn(
        "min-h-screen bg-sidebar-dark border-r border-white/[0.07] flex flex-col flex-shrink-0 overflow-hidden relative transition-[width] duration-200 ease-in-out",
        collapsed ? "w-14" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex items-center gap-2.5 border-b border-white/[0.06]",
          collapsed ? "px-[13px] pt-[18px] pb-3.5 justify-center" : "px-3.5 pt-[18px] pb-3.5 justify-start"
        )}
      >
        <div className="flex items-center justify-center flex-shrink-0">
          <Image src="/logo.png" alt="Logo" width={48} height={48} />
        </div>
        {!collapsed && (
          <div className="flex flex-col justify-center flex-shrink-0">
            <span className="text-[15px] font-bold text-white tracking-[-0.01em] whitespace-nowrap">
              WebriQ
            </span>
            <span className="text-xs">Central Hub</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navGroups.map((group) => (
          <div key={group.section} className="mb-1">
            {!collapsed && (
              <div className="text-[9px] font-bold tracking-[0.1em] uppercase text-slate-700 px-3.5 pt-2.5 pb-1">
                {group.section}
              </div>
            )}
            {group.items.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-2.5 w-full border-l-2 cursor-pointer transition-colors duration-150",
                      collapsed
                        ? "py-[9px] px-0 justify-center rounded-none mr-0"
                        : "py-2 px-3.5 justify-start rounded-r-lg mr-2",
                      active
                        ? "border-brand-blue bg-brand-blue/15"
                        : "border-transparent bg-transparent"
                    )}
                  >
                    <Icon
                      size={16}
                      className={cn("flex-shrink-0", active ? "text-[#4B6EFF]" : "text-slate-600")}
                    />
                    {!collapsed && (
                      <span
                        className={cn(
                          "text-[13px] whitespace-nowrap",
                          active ? "font-semibold text-white" : "font-normal text-slate-400"
                        )}
                      >
                        {item.label}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User area */}
      <div
        className={cn(
          "flex items-center gap-2.5 border-t border-white/[0.06]",
          collapsed ? "py-3 px-0 justify-center" : "py-3 px-3.5 justify-start"
        )}
      >
        <div className="w-[30px] h-[30px] rounded-full bg-brand text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
          {initials}
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-white leading-[1.3]" title={displayEmail}>
              {displayEmail}
            </div>
            <div className="text-[11px] text-slate-500">{roleLabel}</div>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className={cn(
          "absolute top-5 w-[22px] h-[22px] rounded-full bg-toggle-bg border border-white/10 flex items-center justify-center cursor-pointer text-slate-500 z-10",
          collapsed ? "right-1/2 translate-x-1/2" : "-right-[11px]"
        )}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  );
}
