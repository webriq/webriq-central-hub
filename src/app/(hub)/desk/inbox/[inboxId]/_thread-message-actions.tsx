"use client";

import { useState } from "react";
import { TicketPlus } from "lucide-react";
import type { MessageItem } from "./_conversation-thread";
import { ThreadToProjectModal } from "./_thread-to-project-modal";

// Task 333 — "File a Ticket" action on customer-authored Inbox thread messages. Opens the
// project-picker gate (ThreadToProjectModal), which hands off to the Projects New Ticket modal
// with the ticket subject + this message pre-filled. Rendered only for authorType === "client"
// messages (see _conversation-thread.tsx).
//
// Task 364 — dropped "Create Task" entirely and replaced the kebab (⋮) menu this used to sit
// behind with a single, always-visible button for easy access — a one-option menu was no longer
// pulling its weight once there was nothing else to choose between.

export function ThreadMessageActions({
  subject,
  message,
  ticketDbId,
}: {
  subject: string;
  message: MessageItem;
  ticketDbId: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#E2E7F2] bg-white text-[12px] font-medium text-[#3A4565] hover:border-[#A8C6F5] hover:text-[#0B1533] transition-colors cursor-pointer"
      >
        <TicketPlus size={13} className="text-[#5F6A88]" /> File a ticket
      </button>

      {modalOpen && (
        <ThreadToProjectModal
          subject={subject}
          message={message}
          ticketDbId={ticketDbId}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
