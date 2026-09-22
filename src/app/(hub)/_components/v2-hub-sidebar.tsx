"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  LayoutDashboard, LayoutGrid, Inbox, Cpu, Users,
  Megaphone, BookOpen, Settings, ChevronLeft, ChevronDown,
  Circle, LogOut, Building2,
  Clock, ClipboardList, ListChecks,
} from "lucide-react";
import { V2_ROUTES } from "@/config/constants";
import { isPathAllowedForDepartment } from "@/lib/auth/department-map";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { signOut } from "@/app/(auth)/actions";
import { CLASSIFICATION_TABS, classificationTabHref, parseClassificationTab } from "@/app/(hub)/projects/_classification-tabs";

// A child href either has no query (plain path match, same as always) or carries a `?tab=`
// (the /projects/v2 classification links, task 361 follow-up) — in which case the current URL's
// tab must resolve, via the same parseClassificationTab() the page itself uses, to the value the
// href encodes. Without this, every classification child would share the /projects/v2 pathname
// and all seven would light up as "active" at once.
function isChildActive(pathname: string, searchParams: URLSearchParams, href: string): boolean {
  const queryIndex = href.indexOf("?");
  const hrefPath = queryIndex === -1 ? href : href.slice(0, queryIndex);
  if (pathname !== hrefPath && !pathname.startsWith(hrefPath + "/")) return false;
  if (queryIndex === -1) return true;
  const hrefTab = new URLSearchParams(href.slice(queryIndex + 1)).get("tab");
  return hrefTab === null || parseClassificationTab(searchParams.get("tab")) === hrefTab;
}

type NavItem = {
  label: string;
  icon: React.ReactNode;
  href: string;
  exact?: boolean;
  stub?: boolean;
  children?: { label: string; href: string }[];
};

type NavGroup = {
  group: string;
  items: NavItem[];
};

function getNavGroups(role: string | null, departmentName: string | null): NavGroup[] {
  const isAdmin = role === "admin" || role === "super_admin";
  const isDev   = role === "developer";

  const workItems: NavItem[] = [
    { label: "Dashboard",     icon: <LayoutDashboard size={18} />, href: V2_ROUTES.DASHBOARD, exact: true },
    ...(!isDev ? [
      { label: "Customers",   icon: <Building2 size={18} />,       href: V2_ROUTES.CUSTOMERS },
    ] : []),
    {
      label: "Projects",
      icon: <LayoutGrid size={18} />,
      href: V2_ROUTES.PROJECTS,
      // Task 361 follow-up — one sidebar link per classification (linking into the same
      // /projects/v2?tab=<slug> routes the listing page itself uses) plus Legacy, replacing the
      // old flat "V2 Projects" / "Legacy Projects" pair. classificationTabHref() and
      // CLASSIFICATION_TABS are the single source of truth for the tab catalog and its order —
      // see _classification-tabs.ts.
      children: [
        ...CLASSIFICATION_TABS.map((tab) => ({ label: tab.classification, href: classificationTabHref(tab.id) })),
        { label: "Legacy", href: V2_ROUTES.PROJECTS_LEGACY },
      ],
    },
    ...(!isDev ? [
      {
        label: "Desk",
        icon: <Inbox size={18} />,
        href: V2_ROUTES.DESK_INBOX,
        // Task 363 split the old single "Tickets" tab in two: "Inbox" (the raw helpdesk-email
        // inbox, what "Tickets" used to be — renamed from "Mailbox" per user preference) and
        // "Tickets" (a new cross-project listing of issues filed from an Inbox thread message —
        // assignable to developers).
        children: [
          { label: "Inbox",    href: V2_ROUTES.DESK_INBOX },
          { label: "Tickets",  href: V2_ROUTES.DESK_TICKETS },
          { label: "Contacts", href: V2_ROUTES.DESK_CONTACTS },
        ],
      },
    ] : []),
    // StackShift Orders review queue (task 347) — matches the page + API guards: admin /
    // super_admin only (task 375 removed pm).
    ...(isAdmin ? [
      { label: "Orders", icon: <ClipboardList size={18} />,          href: V2_ROUTES.STACKSHIFT_ORDERS },
    ] : []),
    // Orchestration (task 343) — matches the `/api/assessment|plan|execution|reply|zoho`
    // route guards and the page's own guard: admin / super_admin / pm only.
    ...((isAdmin || role === "pm") ? [
      { label: "Orchestration", icon: <Cpu size={18} />,             href: V2_ROUTES.ORCHESTRATION },
    ] : []),
    // Time Logs moved to the "Quick Links" group (task 385) — see quickLinksItems below.
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

  // Task 385 — a dedicated bottom-of-sidebar "Quick Links" group (Tasks / Tickets / Time Logs),
  // per user request, instead of scattering these into Work. Tasks (a cross-project table, task
  // 385) and Tickets (a flat duplicate of the existing nested Desk > Tickets entry — genuinely
  // useful here since Desk is a collapsible group, unlike Time Logs which was already flat) share
  // the same admin/super_admin/pm gate as their target pages. Time Logs moved out of workItems
  // above (was already flat there, so the move is a pure relocation, not a duplicate).
  const isAdminOrPm = isAdmin || role === "pm";
  const quickLinksItems: NavItem[] = [
    ...(isAdminOrPm ? [
      { label: "Tasks",    icon: <ListChecks size={18} />, href: V2_ROUTES.DASHBOARD_TASKS },
      { label: "Tickets",  icon: <Inbox size={18} />,       href: V2_ROUTES.DESK_TICKETS },
    ] : []),
    // Task 226 — time_logs RLS grants no role but client/marketing any access
    // (time_logs_manager_read / time_logs_developer_own / time_logs_developer_read_all).
    ...(role !== "client" && role !== "marketing" ? [
      { label: "Time Logs", icon: <Clock size={18} />,      href: V2_ROUTES.DASHBOARD_TIMELOGS },
    ] : []),
  ];

  // Task 366 — department can further narrow the nav beyond role (e.g. HR/Finance
  // departments), on top of everything already filtered above by role.
  const filterByDept = (items: NavItem[]) =>
    items.filter((item) => isPathAllowedForDepartment(item.href, departmentName));

  const groupDefs: { group: string; items: NavItem[] }[] = [
    { group: "Work",        items: filterByDept(workItems) },
    { group: "People",      items: filterByDept(peopleItems) },
    { group: "Knowledge",   items: filterByDept(knowledgeItems) },
    { group: "Admin",       items: filterByDept(adminItems) },
    { group: "Quick Links", items: filterByDept(quickLinksItems) },
  ];

  return groupDefs.filter((g) => g.items.length > 0);
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
  departmentName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export default function V2HubSidebar({ userRole, departmentName, displayName, avatarUrl }: V2HubSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  // Collapsible nav items ("Projects" — task 279; "Desk" — task 335), keyed by label.
  // Absent = not yet manually toggled this session, so expand state follows the current route.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const shouldReduceMotion = useReducedMotion();
  const navGroups = getNavGroups(userRole, departmentName);
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
          paddingRight: collapsed ? 0 : 8,
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
            <Image src="/webriq_logo.webp" alt="WebriQ" width={32} height={32} />
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <Image src="/webriq_logo.webp" alt="WebriQ" width={36} height={36} />
              <span className="font-heading text-base font-bold tracking-tight whitespace-nowrap">
                <span className="text-white">WebriQ</span>{" "}
                <span className="text-brand-orange">Central Hub</span>
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
              const hasChildren = !!item.children?.length;
              const childActive = hasChildren && item.children!.some(c => isChildActive(pathname, searchParams, c.href));
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + "/") || childActive;

              if (hasChildren) {
                // Default (never manually toggled) expansion must follow ANY child's active
                // route, not just the group's own `href` — a group whose children live under
                // different path prefixes (Desk: Inbox/Tickets/Contacts; Projects: Legacy)
                // would otherwise collapse the moment the active route was a child other than
                // the one `item.href` itself points at (e.g. landing on Desk > Tickets collapsed
                // the group, since `/desk/tickets` doesn't start with `item.href`'s `/desk/mailbox`).
                const isExpanded = collapsed
                  ? false
                  : (expanded[item.label] ?? (pathname.startsWith(item.href) || childActive));
                return (
                  <div key={item.label}>
                    <button
                      onClick={() => {
                        if (collapsed) { router.push(item.href); return; }
                        setExpanded((e) => ({ ...e, [item.label]: !isExpanded }));
                      }}
                      title={collapsed ? item.label : undefined}
                      aria-expanded={collapsed ? undefined : isExpanded}
                      className={cn(
                        "w-full flex items-center gap-2.5 border-l-[3px] text-[14px] transition-all duration-150 cursor-pointer",
                        collapsed ? "justify-center py-2.5 px-0" : "px-6 py-2.25",
                        active
                          ? "border-l-[#2563EB] font-medium"
                          : "border-l-transparent font-normal"
                      )}
                      style={{
                        background: active ? "#1E293B" : "transparent",
                        color: active ? "#F1F5F9" : "#94A3B8",
                      }}
                      onMouseEnter={e => {
                        if (!active) {
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
                        <>
                          <span className="flex-1 text-left">{item.label}</span>
                          <ChevronDown
                            size={14}
                            className={cn("shrink-0 transition-transform duration-150", isExpanded ? "rotate-180" : "")}
                          />
                        </>
                      )}
                    </button>
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          {item.children!.map(child => {
                            const childIsActive = isChildActive(pathname, searchParams, child.href);
                            return (
                              <button
                                key={child.label}
                                onClick={() => router.push(child.href)}
                                className="w-full flex items-center gap-2.5 border-l-[3px] text-[13px] pl-11.5 pr-6 py-2 transition-all duration-150 cursor-pointer"
                                style={{
                                  borderColor: childIsActive ? "#2563EB" : "transparent",
                                  background: childIsActive ? "#1E293B" : "transparent",
                                  color: childIsActive ? "#F1F5F9" : "#94A3B8",
                                  fontWeight: childIsActive ? 500 : 400,
                                }}
                                onMouseEnter={e => {
                                  if (!childIsActive) {
                                    e.currentTarget.style.background = "#1E293B";
                                    e.currentTarget.style.color = "#F1F5F9";
                                  }
                                }}
                                onMouseLeave={e => {
                                  if (!childIsActive) {
                                    e.currentTarget.style.background = "transparent";
                                    e.currentTarget.style.color = "#94A3B8";
                                  }
                                }}
                              >
                                <span className="flex-1 text-left">{child.label}</span>
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              }

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
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Supabase-auth-provider avatar URL, not a static/optimizable asset
            <img src={avatarUrl} alt={displayName ?? "User"} className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)" }}
            >
              {initials}
            </div>
          )}
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
