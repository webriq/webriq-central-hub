import { NextRequest } from "next/server";
import { setMessageDeleted } from "./_soft-delete";

// DELETE /api/desk/tickets/[ticketId]/messages/[messageId] — task 497 soft delete of one Desk Inbox message
// (admin/super_admin/pm). 409 on StackShift-direct threads; 503 until migration 190 is applied. Restore: POST ./restore.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ ticketId: string; messageId: string }> }
) {
  const { ticketId, messageId } = await params;
  return setMessageDeleted(ticketId, messageId, true);
}
