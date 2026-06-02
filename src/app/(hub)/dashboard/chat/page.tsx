import { requireRole } from "@/lib/auth/require-role";
import { Bot } from "lucide-react";

export default async function DashboardChatPage() {
  await requireRole("/dashboard/chat");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-brand/8 flex items-center justify-center">
        <Bot className="w-8 h-8 text-brand" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">AI Chat</h2>
        <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
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
