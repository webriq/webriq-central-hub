import { NextRequest } from "next/server";
import { handleInbound } from "@/lib/stackshift-support/inbound";
import { setCustomerStatus } from "@/lib/stackshift-support/comment-status";
import { updateStatusSchema } from "@/lib/stackshift-support/schema";

// Task 445 — POST .../v1/tickets/{ticketRef}/status (contract v1 §3). Customer open <-> closed only.
export async function POST(req: NextRequest, { params }: { params: Promise<{ ticketRef: string }> }) {
  const { ticketRef } = await params;
  return handleInbound({
    req,
    route: "POST /tickets/{ticketRef}/status",
    schema: updateStatusSchema,
    pathTicketRef: ticketRef,
    run: ({ data }) => setCustomerStatus(ticketRef, data),
  });
}
