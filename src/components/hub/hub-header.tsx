"use client";

import { Bell } from "lucide-react";

interface HubHeaderProps {
  title: string;
  subtitle?: string;
}

export default function HubHeader({ title, subtitle }: HubHeaderProps) {
  return (
    <header className="h-[60px] bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex flex-col gap-px">
        <div className="text-base font-bold text-slate-900 leading-tight">{title}</div>
        {subtitle && <div className="text-xs text-slate-400">{subtitle}</div>}
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

        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-brand text-white text-[11px] font-bold flex items-center justify-center cursor-pointer">
          BD
        </div>
      </div>
    </header>
  );
}
