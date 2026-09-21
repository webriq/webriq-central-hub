// Task 379 — public ticket view, password-gated. adminClient is intentional: this route has
// no Supabase session (same documented (public)-route exception as /onboard/[customerId]).
// The existence check below is UUID-shape only + a row lookup — it does NOT leak subject,
// status, or any other ticket data pre-password; see client.tsx for the reveal.
import { Metadata } from "next";
import { adminClient } from "@/lib/supabase/admin";
import TicketViewClient from "./client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TicketViewPageProps {
  params: Promise<{ ticketId: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: "View Ticket — WebriQ Central Hub" };
}

export default async function TicketViewPage({ params }: TicketViewPageProps) {
  const { ticketId } = await params;

  let exists = false;
  if (UUID_RE.test(ticketId)) {
    const { data } = await adminClient.from("inbox").select("id").eq("id", ticketId).maybeSingle();
    exists = data !== null;
  }

  if (!exists) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20 bg-[#F4F6FB]">
        <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#0B1533] mb-3">
          Ticket Not Found
        </h1>
        <p className="text-[13px] text-[#5F6A88] text-center max-w-sm">
          The ticket link you used is invalid, or the ticket no longer exists.
        </p>
      </div>
    );
  }

  return <TicketViewClient ticketId={ticketId} />;
}
