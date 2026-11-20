import { NextRequest } from "next/server";
import { setThreadDeleted } from "./_soft-delete";

// DELETE /api/desk/tickets/[ticketId] — task 489 soft delete of a Desk Inbox thread (admin/super_admin/pm).
// 409 for StackShift-direct threads; 503 until migration 185 is applied. Restore: POST ./restore.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  return setThreadDeleted(ticketId, true);
}
