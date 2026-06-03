"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  ListChecks,
  GitBranch,
  Bot,
  Clock,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ROUTES } from "@/config/constants";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { usePMSettings } from "@/hooks/use-pm-settings";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  exact?: boolean;
}

function getNavGroups(role: string | null): { section: string; items: NavItem[] }[] {
  const isDev   = role === "dev";
  const isAdmin = role === "admin";

  const pmItems: NavItem[] = [
    { href: ROUTES.DASHBOARD,           label: "Home",      icon: LayoutDashboard, exact: true },
    { href: ROUTES.DASHBOARD_CUSTOMERS, label: "Customers", icon: Users },
    { href: ROUTES.DASHBOARD_TASKS,     label: "Tasks",     icon: ListChecks },
    { href: ROUTES.DASHBOARD_PIPELINE,  label: "Pipeline",  icon: GitBranch },
    { href: ROUTES.DASHBOARD_CHAT,      label: "AI Chat",   icon: Bot },
  ];

  const devItems: NavItem[] = [
    { href: ROUTES.DASHBOARD,           label: "Home",      icon: LayoutDashboard, exact: true },
    { href: ROUTES.DASHBOARD_TASKS,     label: "Tasks",     icon: ListChecks },
    { href: ROUTES.DASHBOARD_TIMELOGS,  label: "Time Logs", icon: Clock },
  ];

  const adminExtras: NavItem[] = [
    { href: ROUTES.DASHBOARD_USERS, label: "Users", icon: ShieldCheck },
  ];

  const items = isDev ? devItems : [...pmItems, ...(isAdmin ? adminExtras : [])];

  return [{ section: "Main", items }];
}

interface HubSidebarProps {
  userEmail: string | null;
  userRole: string | null;
  userDisplayName: string | null;
  userZohoId: string | null;
}

export default function HubSidebar({ userEmail: _userEmail, userRole }: HubSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const navGroups = getNavGroups(userRole);
  const { settings } = usePMSettings();
  const isLight = settings.theme === "light";

  return (
    <aside
      className={cn(
        "min-h-screen flex flex-col shrink-0 overflow-hidden relative transition-[width] duration-200 ease-in-out border-r",
        isLight
          ? "bg-white border-slate-200"
          : "bg-sidebar-dark border-white/[0.07]",
        collapsed ? "w-14" : "w-55"
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex items-center gap-2.5 border-b",
          isLight ? "border-slate-200" : "border-white/6",
          collapsed ? "px-3.25 pt-4.5 pb-3.5 justify-center" : "px-3.5 pt-4.5 pb-3.5 justify-start"
        )}
      >
        <div className="flex items-center justify-center shrink-0">
          <Image src="/logo.png" alt="Logo" width={48} height={48} />
        </div>
        {!collapsed && (
          <div className="flex flex-col justify-center shrink-0">
            <span className={cn("text-[15px] font-bold tracking-[-0.01em] whitespace-nowrap", isLight ? "text-slate-900" : "text-white")}>
              WebriQ
            </span>
            <span className={cn("text-xs", isLight ? "text-slate-500" : "text-slate-400")}>Central Hub</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navGroups.map((group) => (
          <div key={group.section} className="mb-1">
            {!collapsed && (
              <div className={cn("text-[9px] font-bold tracking-widest uppercase px-3.5 pt-2.5 pb-1", isLight ? "text-slate-500" : "text-slate-700")}>
                {group.section}
              </div>
            )}
            {group.items.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-2.5 w-full border-l-2 cursor-pointer transition-colors duration-150",
                      collapsed
                        ? "py-2.25 px-0 justify-center rounded-none mr-0"
                        : "py-2 px-3.5 justify-start rounded-r-lg mr-2",
                      active
                        ? "border-brand-blue bg-brand-blue/15"
                        : "border-transparent bg-transparent"
                    )}
                  >
                    <Icon
                      size={16}
                      className={cn("shrink-0", active ? "text-[#4B6EFF]" : isLight ? "text-slate-400" : "text-slate-600")}
                    />
                    {!collapsed && (
                      <span
                        className={cn(
                          "text-[13px] whitespace-nowrap",
                          active
                            ? cn("font-semibold", isLight ? "text-slate-900" : "text-white")
                            : cn("font-normal", isLight ? "text-slate-500" : "text-slate-400")
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

      {/* Minimize toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className={cn(
          "flex items-center gap-2 border-t transition-colors cursor-pointer",
          isLight
            ? "border-slate-200 text-slate-400 hover:text-slate-700"
            : "border-white/6 text-slate-500 hover:text-white",
          collapsed ? "py-3 px-0 justify-center" : "py-3 px-3.5 justify-start"
        )}
        aria-label={collapsed ? "Expand sidebar" : "Minimize sidebar"}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        {!collapsed && <span className="text-[11px] font-medium">Minimize</span>}
      </button>
    </aside>
  );
}
