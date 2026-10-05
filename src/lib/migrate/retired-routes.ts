import { NextResponse } from "next/server";

// Task 426 — Zoho Projects is being decommissioned and task 427 renames/reshapes `milestones` and
// `tasklists`, so the routes that write Zoho-sourced rows into them (and into `tasks`, which carries
// their foreign keys) are frozen. The data is already imported; these paths must not write into
// tables the unified phase/deliverable migration (tasks 427–431) is about to change. The handler
// code is intentionally left in place until task 431 deletes it. Flip this constant only for a
// deliberate, reviewed re-enable.
const ZOHO_MILESTONE_TASKLIST_ROUTES_RETIRED: boolean = true;

/** Returns a 410 response while retired, else `null` (call after auth so nothing leaks to anonymous callers). */
export function retiredGuard(what: string): NextResponse | null {
  if (!ZOHO_MILESTONE_TASKLIST_ROUTES_RETIRED) return null;
  return NextResponse.json(
    { error: `The Zoho ${what} was retired in task 426 (Zoho decommission). Nothing was written.`, code: "retired" },
    { status: 410 }
  );
}
