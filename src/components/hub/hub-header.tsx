"use client";

import { Bell, LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/(auth)/actions";

interface HubHeaderProps {
  title?: string;
  subtitle?: string;
}

const PATH_TITLES: Record<string, { title: string; subtitle?: string }> = {
  "/pm": { title: "Customers", subtitle: "Project Manager Dashboard" },
  "/dev": { title: "My Dashboard", subtitle: "Developer daily view" },
  "/classification": { title: "Classification", subtitle: "Task classification engine — Sprint 2 (M2)" },
  "/orchestration": { title: "AI Orchestration", subtitle: "Requirements assessment, plan generation, execution — Sprints 3–5" },
  "/kb": { title: "Knowledge Base", subtitle: "LLM Wiki — playbooks, internal KB, customer context — Sprint 6" },
  "/onboarding": { title: "Onboarding", subtitle: "Create a new customer" },
  "/customers": { title: "Customer Profile" },
};

function getTitleOverride(pathname: string): { title: string; subtitle?: string } | null {
  // Check exact match first
  if (PATH_TITLES[pathname]) return PATH_TITLES[pathname];

  // Check prefix match for dynamic routes like /customers/[customerId]
  for (const [prefix, info] of Object.entries(PATH_TITLES)) {
    if (pathname.startsWith(prefix + "/")) return info;
  }

  return null;
}

export default function HubHeader({ title, subtitle }: HubHeaderProps = {}) {
  const pathname = usePathname();
  const override = getTitleOverride(pathname);

  const displayTitle = title ?? override?.title ?? "";
  const displaySubtitle = subtitle ?? override?.subtitle;

  return (
    <header className="h-[60px] bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex flex-col gap-px">
        {displayTitle && <div className="text-base font-bold text-slate-900 leading-tight">{displayTitle}</div>}
        {displaySubtitle && <div className="text-xs text-slate-400">{displaySubtitle}</div>}
      </div>

      <div className="flex items-center gap-2.5">
        {/* Search */}
        <div className="relative flex items-center">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#64748B"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search projects, clients, tasks..."
            className="text-[13px] py-[7px] pr-3 pl-[30px] border border-slate-200 rounded-lg text-slate-900 bg-page-bg outline-none w-60 font-[inherit]"
          />
        </div>

        {/* Notification bell */}
        <div className="relative">
          <button className="w-[34px] h-[34px] rounded-lg bg-transparent border border-slate-200 flex items-center justify-center cursor-pointer relative">
            <Bell size={18} color="#64748B" />
            <span className="absolute top-1.5 right-1.5 w-[7px] h-[7px] rounded-full bg-orange-500 border-[1.5px] border-white" />
          </button>
        </div>

        {/* Sign Out */}
        <button
          onClick={() => signOut()}
          className="flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-red-600 transition-colors cursor-pointer ml-1"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-brand text-white text-[11px] font-bold flex items-center justify-center cursor-pointer">
          BD
        </div>
      </div>
    </header>
  );
}