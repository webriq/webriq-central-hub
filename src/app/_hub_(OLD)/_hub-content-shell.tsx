"use client";

import { usePMSettings } from "@/hooks/use-pm-settings";

export default function HubContentShell({ children }: { children: React.ReactNode }) {
  const { settings } = usePMSettings();
  return (
    <div className={`flex-1 flex flex-col min-w-0 ${settings.theme === "dark" ? "bg-[#090c18]" : "bg-page-bg"}`}>
      {children}
    </div>
  );
}
