"use client";

import { useState, useCallback, useEffect } from "react";
import V2HubSidebar from "./v2-hub-sidebar";
import V2HubHeader from "./v2-hub-header";
import OpsChat from "./ops-chat";

interface V2HubShellProps {
  userRole: string | null;
  displayName: string | null;
  children: React.ReactNode;
}

export default function V2HubShell({ userRole, displayName, children }: V2HubShellProps) {
  const [opsChatOpen, setOpsChatOpen] = useState(false);
  const [chatTrigger, setChatTrigger] = useState<{ message: string; ts: number } | null>(null);

  const openChat  = useCallback(() => setOpsChatOpen(true),  []);
  const closeChat = useCallback(() => setOpsChatOpen(false), []);

  const openChatWithMessage = useCallback((message: string) => {
    setChatTrigger({ message, ts: Date.now() });
    setOpsChatOpen(true);
  }, []);

  // ⌘K shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpsChatOpen(o => !o);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <V2HubSidebar userRole={userRole} displayName={displayName} />

      {/* Main content column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <V2HubHeader
          chatOpen={opsChatOpen}
          onOpenChat={openChat}
          onOpenWithMessage={openChatWithMessage}
        />
        {/* Row below header: scrollable page + OpsChat panel */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
          {/* OpsChat is below the header — shares the same row as main */}
          <OpsChat open={opsChatOpen} onClose={closeChat} trigger={chatTrigger} displayName={displayName} />
        </div>
      </div>
    </div>
  );
}
