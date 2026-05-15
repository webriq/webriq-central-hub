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
  MessageSquare,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ROUTES } from "@/config/constants";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  exact?: boolean;
}

const navGroups: { section: string; items: NavItem[] }[] = [
  {
    section: "Main",
    items: [
      { href: ROUTES.PM, label: "Home", icon: LayoutDashboard, exact: true },
      { href: `${ROUTES.PM}/customers`, label: "Clients", icon: Users },
      { href: `${ROUTES.PM}/tasks`, label: "Tasks", icon: ListChecks },
      { href: `${ROUTES.PM}/pipeline`, label: "Pipeline", icon: GitBranch },
      { href: ROUTES.ORCHESTRATION, label: "AI Chat", icon: MessageSquare },
    ],
  },
];

interface HubSidebarProps {
  userEmail: string | null;
  userRole: string | null;
  userDisplayName: string | null;
  userZohoId: string | null;
}

export default function HubSidebar({ userEmail: _userEmail, userRole: _userRole }: HubSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

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

      {/* Minimize toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className={cn(
          "flex items-center gap-2 border-t border-white/[0.06] text-slate-500 hover:text-white transition-colors cursor-pointer",
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
