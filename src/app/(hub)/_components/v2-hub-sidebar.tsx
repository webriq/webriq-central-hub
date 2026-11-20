"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  LayoutDashboard, LayoutGrid, Inbox, Cpu, Users,
  Megaphone, BookOpen, HardDrive, Settings, ChevronLeft, ChevronDown,
  Circle, LogOut, Building2,
  Clock, ClipboardList, ListChecks,
} from "lucide-react";
import { DRIVE_LABEL, V2_ROUTES } from "@/config/constants";
import { isPathAllowedForDepartment } from "@/lib/auth/department-map";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { CLASSIFICATION_TABS, classificationTabHref } from "@/app/(hub)/projects/_classification-tabs";
import { hrNavChildren } from "./hr-nav";
import { useInboxUnreadCount } from "@/components/desk/use-inbox-unread";

// A child is active when the pathname is its href or below it. Since task 474 every project page
// lives under /projects/<slug>/…, so a classification link stays lit on its listing, status report
// and project pages (task 414's project-context workaround is gone).
function isChildActive(pathname: string, href: string): boolean {
  // "/hr" is the HR overview — it must not light up for every /hr/* sibling (task 435).
  if (href === V2_ROUTES.HR) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
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

function getNavGroups(role: string | null, departmentName: string | null, hasDirectReports: boolean, isTestUser: boolean): NavGroup[] {
  const isAdmin = role === "admin" || role === "super_admin";
  const isDev   = role === "developer";

  const workItems: NavItem[] = [
    { label: "Dashboard",     icon: <LayoutDashboard size={18} />, href: V2_ROUTES.DASHBOARD, exact: true },
    // Task 476 — a developer Test User needs Customers to reach test companies.
    ...(!isDev || isTestUser ? [
      { label: "Customers",   icon: <Building2 size={18} />,       href: V2_ROUTES.CUSTOMERS },
    ] : []),
    {
      label: "Projects",
      icon: <LayoutGrid size={18} />,
      href: V2_ROUTES.PROJECTS,
      // Task 361 follow-up — one sidebar link per classification (linking into the same
      // /projects/<slug> routes, task 473) plus Legacy, replacing the
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
          // Task 446 — StackShift event delivery + replay; admin / super_admin only (matches the page + replay API).
          ...(isAdmin ? [{ label: "StackShift outbox", href: V2_ROUTES.DESK_STACKSHIFT_OUTBOX }] : []),
          // Task 449 — parity gate evidence + sign-off for the Desk step-down; admin / super_admin only.
          ...(isAdmin ? [{ label: "StackShift parity", href: V2_ROUTES.DESK_STACKSHIFT_PARITY }] : []),
          // Task 450 — Desk step-down status + reconcile misses (inert until a site is signed off); admin only.
          ...(isAdmin ? [{ label: "StackShift step-down", href: V2_ROUTES.DESK_STACKSHIFT_STEPDOWN }] : []),
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
    // Task 435 — HR is a collapsible group (Overview, Leave requests, Calendar, Holidays, …, Users),
    // role-filtered by hrNavChildren(); clients get no HR entry at all.
    ...(role !== "client" ? [
      { label: "HR", icon: <Users size={18} />, href: V2_ROUTES.HR, children: hrNavChildren(role, hasDirectReports) },
    ] : []),
    { label: "Announcements", icon: <Megaphone size={18} />,       href: V2_ROUTES.DASHBOARD, stub: true },
  ];

  const knowledgeItems: NavItem[] = [
    { label: "Wiki",          icon: <BookOpen size={18} />,        href: V2_ROUTES.WIKI },
    // Task 436 — personal Drive (My Files + Shared with me live inside the page). Staff only:
    // the page, every /api/drive route and RLS all exclude `client`.
    ...(role !== "client" ? [
      { label: DRIVE_LABEL,    icon: <HardDrive size={18} />,       href: V2_ROUTES.DRIVE },
    ] : []),
  ];

  // Task 476 — Test Users get Settings for its Test Data section.
  const adminItems: NavItem[] = isAdmin || isTestUser ? [
    { label: "Settings",      icon: <Settings size={18} />,        href: V2_ROUTES.SETTINGS },
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
  hasDirectReports?: boolean;
  isTestUser?: boolean;
}

export default function V2HubSidebar({ userRole, departmentName, displayName, avatarUrl, hasDirectReports = false, isTestUser = false }: V2HubSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  // Collapsible nav items ("Projects" — task 279; "Desk" — task 335), keyed by label.
  // Absent = not yet manually toggled this session, so expand state follows the current route.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const shouldReduceMotion = useReducedMotion();
  const navGroups = getNavGroups(userRole, departmentName, hasDirectReports, isTestUser);
  const initials = getInitials(displayName);
  // Task 490 — live count of Desk Inbox threads with new customer messages, for the roles that can open the Inbox.
  const inboxUnread = useInboxUnreadCount(["admin", "super_admin", "pm"].includes(userRole ?? ""));
  const badgeFor = (href: string) => (href === V2_ROUTES.DESK_INBOX ? inboxUnread.count : 0);
  const formatBadge = (n: number) => (n > 99 ? "99+" : String(n));

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
              const childActive = hasChildren && item.children!.some(c => isChildActive(pathname, c.href));
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
                // Task 490 — a child's badge is hidden while its group is folded, so flag the parent with a dot.
                const hiddenBadges = isExpanded ? 0 : item.children!.reduce((sum, c) => sum + badgeFor(c.href), 0);
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
                        if (collapsed) router.prefetch(item.href);
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
                      <span className="relative shrink-0">
                        {item.icon}
                        {hiddenBadges > 0 && (
                          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-slate-900">
                            <span className="sr-only">{hiddenBadges} new in {item.label}</span>
                          </span>
                        )}
                      </span>
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
                            const childIsActive = isChildActive(pathname, child.href);
                            return (
                              // Task 484 — <Link> so the target route's loading shell is prefetched.
                              <Link
                                key={child.label}
                                href={child.href}
                                aria-current={childIsActive ? "page" : undefined}
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
                                {badgeFor(child.href) > 0 && (
                                  <span
                                    aria-label={`${badgeFor(child.href)} threads with new messages`}
                                    className="min-w-5 rounded-full bg-blue-600 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-white tabular-nums"
                                  >
                                    {formatBadge(badgeFor(child.href))}
                                  </span>
                                )}
                              </Link>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              }

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  prefetch={item.stub ? false : undefined}
                  onClick={(e) => { if (item.stub) e.preventDefault(); }}
                  aria-disabled={item.stub || undefined}
                  aria-current={active && !item.stub ? "page" : undefined}
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
                </Link>
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
