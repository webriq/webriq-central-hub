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

const navGroups = [
  {
    section: "Main",
    items: [
      { href: ROUTES.PM,             label: "Dashboard",    icon: LayoutDashboard },
      { href: "/projects",           label: "Projects",     icon: FolderOpen },
      { href: ROUTES.ONBOARDING,     label: "Onboarding",   icon: UserPlus },
      { href: ROUTES.CLASSIFICATION, label: "Classification", icon: ScanSearch },
      { href: ROUTES.ORCHESTRATION,  label: "Orchestration", icon: Bot },
    ],
  },
  {
    section: "Developer",
    items: [
      { href: ROUTES.DEV,   label: "My Dashboard",  icon: Layout },
      { href: "/timetrack", label: "Time Tracking",  icon: Clock },
    ],
  },
  {
    section: "Admin",
    items: [
      { href: ROUTES.KB,    label: "Knowledge Base", icon: BookOpen },
      { href: "/reports",   label: "Reports",        icon: BarChart2 },
      { href: "/settings",  label: "Settings",       icon: Settings },
    ],
  },
];

export default function HubSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      style={{
        width: collapsed ? 56 : 220,
        minHeight: "100vh",
        background: "#070E1F",
        borderRight: "1px solid rgba(255,255,255,0.07)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        transition: "width 200ms ease",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: collapsed ? "18px 13px 14px" : "18px 14px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #1a4ccc 0%, #3358F4 60%, #6B8FFF 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 0 0 2px rgba(51,88,244,0.3)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M3.5 14 L7 6 L10 12 L13 8 L16.5 14" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {!collapsed && (
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
            }}
          >
            WebriQ Hub
          </span>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {navGroups.map((group) => (
          <div key={group.section} style={{ marginBottom: 4 }}>
            {!collapsed && (
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#334155",
                  padding: "10px 14px 4px",
                }}
              >
                {group.section}
              </div>
            )}
            {group.items.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: collapsed ? "9px 0" : "8px 14px",
                      justifyContent: collapsed ? "center" : "flex-start",
                      background: active ? "rgba(51,88,244,0.15)" : "transparent",
                      borderLeft: active ? "2px solid #3358F4" : "2px solid transparent",
                      borderRadius: collapsed ? 0 : "0 8px 8px 0",
                      marginRight: collapsed ? 0 : 8,
                      cursor: "pointer",
                      transition: "background 150ms",
                    }}
                  >
                    <Icon
                      size={16}
                      style={{ color: active ? "#4B6EFF" : "#475569", flexShrink: 0 }}
                    />
                    {!collapsed && (
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: active ? 600 : 400,
                          color: active ? "#fff" : "#94A3B8",
                          whiteSpace: "nowrap",
                        }}
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
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: collapsed ? "12px 0" : "12px 14px",
          justifyContent: collapsed ? "center" : "flex-start",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "#3358F4",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          BD
        </div>
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", lineHeight: 1.3 }}>Brandon Dwite</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>Project Manager</div>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        style={{
          position: "absolute",
          top: 20,
          right: collapsed ? "50%" : -12,
          transform: collapsed ? "translateX(50%)" : "none",
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#1a2f5a",
          border: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: "#64748B",
          zIndex: 10,
          ...(collapsed ? {} : { right: -11 }),
        }}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  );
}
