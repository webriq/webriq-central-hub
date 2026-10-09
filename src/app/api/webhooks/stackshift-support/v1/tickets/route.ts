import { NextRequest } from "next/server";
import { handleInbound } from "@/lib/stackshift-support/inbound";
import { handleSignedGet } from "@/lib/stackshift-support/signed-get";
import { listTickets } from "@/lib/stackshift-support/read-queries";
import { createStackShiftTicket } from "@/lib/stackshift-support/create-ticket";
import { createTicketSchema } from "@/lib/stackshift-support/schema";

// Task 448 — GET /api/webhooks/stackshift-support/v1/tickets?site=&status=&userRef=&cursor=&limit= (contract
// v1 §5): the Support Center's ticket list for one site, newest first, keyset-paginated.
export async function GET(req: NextRequest) {
  return handleSignedGet({
    req,
    route: "GET /tickets",
    run: ({ site, params }) => listTickets(site, params),
  });
}

// Task 445 — POST /api/webhooks/stackshift-support/v1/tickets (contract v1 §3). Signed server-to-server.
export async function POST(req: NextRequest) {
  return handleInbound({
    req,
    route: "POST /tickets",
    schema: createTicketSchema,
    run: ({ data }) => createStackShiftTicket(data),
  });
}
