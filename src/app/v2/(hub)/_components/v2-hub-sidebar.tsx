"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, FolderKanban, Inbox, Cpu, Users,
  Megaphone, BookOpen, Settings, ChevronLeft,
  Circle, LogOut, Building2,
  ChartGantt,
} from "lucide-react";
import { V2_ROUTES } from "@/config/constants";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { signOut } from "@/app/(auth)/actions";

type NavItem = {
  label: string;
  icon: React.ReactNode;
  href: string;
  exact?: boolean;
  stub?: boolean;
};

type NavGroup = {
  group: string;
  items: NavItem[];
};

function getNavGroups(role: string | null): NavGroup[] {
  const isAdmin = role === "admin" || role === "super_admin";
  const isDev   = role === "developer";

  const workItems: NavItem[] = [
    { label: "Dashboard",     icon: <LayoutDashboard size={18} />, href: V2_ROUTES.DASHBOARD, exact: true },
    ...(!isDev ? [
      { label: "Customers",   icon: <Building2 size={18} />,       href: V2_ROUTES.CUSTOMERS },
    ] : []),
    ...(role !== "client" ? [
      { label: "Tracker",     icon: <ChartGantt size={18} />,          href: V2_ROUTES.PORTFOLIO_TRACKER },
    ] : []),
    { label: "Projects",      icon: <FolderKanban size={18} />,   href: V2_ROUTES.PROJECTS },
    { label: "Desk",          icon: <Inbox size={18} />,           href: V2_ROUTES.DASHBOARD_TASKS },
    { label: "Orchestration", icon: <Cpu size={18} />,             href: V2_ROUTES.ORCHESTRATION },
  ];

  const peopleItems: NavItem[] = [
    { label: "HR",            icon: <Users size={18} />,           href: V2_ROUTES.DASHBOARD_USERS, stub: !isAdmin },
    { label: "Announcements", icon: <Megaphone size={18} />,       href: V2_ROUTES.DASHBOARD, stub: true },
  ];

  const knowledgeItems: NavItem[] = [
    { label: "Wiki",          icon: <BookOpen size={18} />,        href: V2_ROUTES.KB },
  ];

  const adminItems: NavItem[] = isAdmin ? [
    { label: "Settings",      icon: <Settings size={18} />,        href: V2_ROUTES.DASHBOARD_SETTINGS },
  ] : [];

  const groups: NavGroup[] = [
    { group: "Work",      items: workItems },
    { group: "People",    items: peopleItems },
    { group: "Knowledge", items: knowledgeItems },
  ];

  if (adminItems.length > 0) {
    groups.push({ group: "Admin", items: adminItems });
  }

  return groups;
}

function getInitials(name: string | null): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin", pm: "PM", developer: "Developer",
  hr: "HR", client: "Client", super_admin: "Super Admin",
  marketing: "Marketing",
};

interface V2HubSidebarProps {
  userRole: string | null;
  displayName: string | null;
}

export default function V2HubSidebar({ userRole, displayName }: V2HubSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const navGroups = getNavGroups(userRole);
  const initials = getInitials(displayName);

  return (
    <aside
      className="flex flex-col h-screen shrink-0 overflow-hidden transition-[width] duration-150 ease-out"
      style={{ width: collapsed ? 72 : 264, background: "#0F172A" }}
    >
      {/* Wordmark + collapse toggle */}
      <div
        className="flex items-center shrink-0 border-b"
        style={{
          height: 64,
          borderColor: "#1E293B",
          paddingLeft: collapsed ? 0 : 24,
          paddingRight: collapsed ? 0 : 16,
          justifyContent: collapsed ? "center" : "space-between",
        }}
      >
        {collapsed ? (
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center justify-center cursor-pointer"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <Image src="/logo.png" alt="W" width={32} height={32} />
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <Image src="/logo.png" alt="Logo" width={36} height={36} />
              <span className="text-[18px] font-bold text-white tracking-[-0.02em]">
                WebriQ<span style={{ color: "#2563EB" }}>.</span>
              </span>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              className="p-1 rounded-md cursor-pointer transition-colors"
              style={{ color: "#64748B" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#94A3B8")}
              onMouseLeave={e => (e.currentTarget.style.color = "#64748B")}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft size={16} />
            </button>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4">
        {navGroups.map(group => (
          <div key={group.group} className="mb-2">
            {!collapsed && (
              <div
                className="text-[11px] font-semibold uppercase tracking-[0.06em] px-6 py-2"
                style={{ color: "#475569" }}
              >
                {group.group}
              </div>
            )}
            {group.items.map(item => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <button
                  key={item.label}
                  onClick={() => !item.stub && router.push(item.href)}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "w-full flex items-center gap-2.5 border-l-[3px] text-[14px] transition-all duration-150 cursor-pointer",
                    collapsed ? "justify-center py-2.5 px-0" : "px-6 py-2.25",
                    active
                      ? "border-l-[#2563EB] font-medium"
                      : "border-l-transparent font-normal",
                    item.stub ? "opacity-50 cursor-not-allowed" : ""
                  )}
                  style={{
                    background: active ? "#1E293B" : "transparent",
                    color: active ? "#F1F5F9" : "#94A3B8",
                  }}
                  onMouseEnter={e => {
                    if (!active && !item.stub) {
                      e.currentTarget.style.background = "#1E293B";
                      e.currentTarget.style.color = "#F1F5F9";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "#94A3B8";
                    }
                  }}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && (
                    <span className="flex-1 text-left flex items-center gap-2">
                      {item.label}
                      {item.stub && (
                        <span className="text-[9px] font-medium uppercase tracking-wide px-1 py-0.5 rounded" style={{ background: "#1E293B", color: "#475569" }}>
                          soon
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User card */}
      <div
        className="border-t shrink-0 flex items-center gap-2.5"
        style={{
          borderColor: "#1E293B",
          padding: collapsed ? "16px 0" : "16px",
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <div className="relative shrink-0">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)" }}
          >
            {initials}
          </div>
          <span
            className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
            style={{ background: "#22C55E", borderColor: "#0F172A" }}
          />
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-[#F1F5F9] truncate">
              {displayName ?? "Unknown"}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {userRole && (
                <span
                  className="text-[11px] font-medium rounded px-1.5 py-px"
                  style={{ color: "#64748B", background: "#1E293B" }}
                >
                  {ROLE_LABEL[userRole] ?? userRole}
                </span>
              )}
              <span className="flex items-center gap-1 text-[10px] font-mono" style={{ color: "#22C55E" }}>
                <Circle size={6} fill="#22C55E" stroke="none" />
                Online
              </span>
            </div>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => signOut()}
            className="p-1.5 rounded-md cursor-pointer transition-colors shrink-0"
            style={{ color: "#64748B" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#94A3B8")}
            onMouseLeave={e => (e.currentTarget.style.color = "#64748B")}
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={14} />
          </button>
        )}
      </div>
    </aside>
  );
}
