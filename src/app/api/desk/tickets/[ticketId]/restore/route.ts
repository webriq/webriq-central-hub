import { NextRequest } from "next/server";
import { setThreadDeleted } from "../_soft-delete";

// POST /api/desk/tickets/[ticketId]/restore — task 489: undo a soft delete (admin/super_admin/pm). Idempotent.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  return setThreadDeleted(ticketId, false);
}
