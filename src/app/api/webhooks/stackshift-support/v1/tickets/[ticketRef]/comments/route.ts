import { NextRequest } from "next/server";
import { handleInbound } from "@/lib/stackshift-support/inbound";
import { addCustomerComment } from "@/lib/stackshift-support/comment-status";
import { createCommentSchema } from "@/lib/stackshift-support/schema";

// Task 445 — POST .../v1/tickets/{ticketRef}/comments (contract v1 §3). Customer comments only.
export async function POST(req: NextRequest, { params }: { params: Promise<{ ticketRef: string }> }) {
  const { ticketRef } = await params;
  return handleInbound({
    req,
    route: "POST /tickets/{ticketRef}/comments",
    schema: createCommentSchema,
    pathTicketRef: ticketRef,
    run: ({ data }) => addCustomerComment(ticketRef, data),
  });
}
