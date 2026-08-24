import type { Metadata } from "next";

export const metadata: Metadata = { title: "AI Chat" };

export default function ChatPage() {
  return (
    <div className="py-6.5 px-8">
      <p className="text-sm text-muted-foreground">v2 · Ops Chat · Sprint 1C</p>
    </div>
  );
}
