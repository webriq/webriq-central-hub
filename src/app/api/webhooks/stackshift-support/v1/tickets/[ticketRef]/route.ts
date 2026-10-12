import { NextRequest } from "next/server";
import { handleSignedGet } from "@/lib/stackshift-support/signed-get";
import { getTicket } from "@/lib/stackshift-support/read-queries";

// Task 448 — GET .../v1/tickets/{ticketRef}?site= (contract v1 §5): one direct ticket with its public
// messages (+ fresh attachment URLs) and activity. A ref that does not exist for this site is a 404 whether
// or not another site owns it.
export async function GET(req: NextRequest, { params }: { params: Promise<{ ticketRef: string }> }) {
  const { ticketRef } = await params;
  return handleSignedGet({
    req,
    route: "GET /tickets/{ticketRef}",
    run: ({ site }) => getTicket(site, ticketRef),
  });
}
