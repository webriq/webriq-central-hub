import { NextRequest } from "next/server";
import { setMessageDeleted } from "../_soft-delete";

// POST /api/desk/tickets/[ticketId]/messages/[messageId]/restore — task 497: undo a message soft delete
// (admin/super_admin/pm). Idempotent.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ ticketId: string; messageId: string }> }
) {
  const { ticketId, messageId } = await params;
  return setMessageDeleted(ticketId, messageId, false);
}
