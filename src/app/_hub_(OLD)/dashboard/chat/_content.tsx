"use client";

import { Bot } from "lucide-react";
import { usePMSettings } from "@/hooks/use-pm-settings";

export default function ChatContent() {
  const { settings } = usePMSettings();
  const isDark = settings.theme === "dark";

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-brand/8 flex items-center justify-center">
        <Bot className="w-8 h-8 text-brand" />
      </div>
      <div>
        <h2 className={`text-xl font-bold mb-2 ${isDark ? "text-white" : "text-slate-900"}`}>AI Chat</h2>
        <p className={`text-sm max-w-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          A Claude-powered conversational interface for querying your pipeline,
          customers, and tasks is under development.
        </p>
      </div>
      <div className="text-[11px] font-semibold text-brand bg-brand/8 px-3.5 py-1.5 rounded-full">
        Under Development
      </div>
    </div>
  );
}
