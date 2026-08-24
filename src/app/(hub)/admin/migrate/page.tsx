"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import ZohoProjectsTab from "./_zoho-projects-tab";
import ZohoDeskTab from "./_zoho-desk-tab";

type Tab = "projects" | "desk";

export default function MigratePage() {
  const [tab, setTab] = useState<Tab>("desk");

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Zoho Decommission Migration</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          One-time data migration from Zoho Projects and Zoho Desk into the Hub&apos;s native Supabase schema.
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200">
        <button
          onClick={() => setTab("projects")}
          className={cn(
            "px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors",
            tab === "projects"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          Zoho Projects
        </button>
        <button
          onClick={() => setTab("desk")}
          className={cn(
            "px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors",
            tab === "desk"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          Zoho Desk
        </button>
      </div>

      {tab === "projects" ? <ZohoProjectsTab /> : <ZohoDeskTab />}
    </div>
  );
}
