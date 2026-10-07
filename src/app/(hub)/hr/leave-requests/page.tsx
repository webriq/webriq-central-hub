import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { V2_ROUTES } from "@/config/constants";
import { canReviewRequests, getHrViewer, isManager } from "@/lib/hr/access";
import { isYmd } from "@/lib/hr/dates";
import { loadEmployees, loadLeaveTypes } from "@/lib/hr/queries";
import { loadLeaveRequests } from "@/lib/hr/queries-requests";
import type { LeaveStatus } from "@/lib/hr/types";
import { PageShell, Panel } from "../_components/page-shell";
import { EmptyState } from "../_components/empty-state";
import { RequestFilters } from "./_request-filters";
import { RequestTable } from "./_request-table";

export const metadata: Metadata = { title: "Leave requests · HR" };
const STATUSES = ["pending", "approved", "rejected", "cancelled", "all"] as const;
const PAGE_SIZE = 20;

type Params = { status?: string; type?: string; employee?: string; from?: string; to?: string; page?: string };

export default async function LeaveRequestsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const viewer = await getHrViewer();
  if (!viewer || !canReviewRequests(viewer)) redirect(V2_ROUTES.HR);
  const manager = isManager(viewer);
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as LeaveStatus | "all") : "pending";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const [{ rows, total }, types, employees] = await Promise.all([
    loadLeaveRequests({
      status, page, pageSize: PAGE_SIZE,
      typeId: sp.type || undefined,
      employeeId: sp.employee || undefined,
      from: isYmd(sp.from) ? sp.from : undefined,
      to: isYmd(sp.to) ? sp.to : undefined,
      excludeEmployeeId: manager ? null : viewer.employeeId,
    }),
    loadLeaveTypes(),
    manager ? loadEmployees() : Promise.resolve([]),
  ]);

  return (
    <PageShell
      title={manager ? "Leave requests" : "Team requests"}
      description={manager ? "Approve, deny or cancel leave. Admin notes stay internal — only admins see them." : "Requests from the people who report to you."}
    >
      <Panel>
        <RequestFilters status={status} types={types.filter((t) => t.active)} employees={employees} manager={manager} />
        {rows.length ? (
          <RequestTable rows={rows} total={total} page={page} pageSize={PAGE_SIZE} canNote={manager} />
        ) : (
          <EmptyState
            icon={Inbox}
            title={status === "pending" ? "No leave requests waiting" : "No requests match these filters"}
            hint={status === "pending" ? "New requests appear here as staff submit them." : "Try another status or clear the filters."}
          />
        )}
      </Panel>
    </PageShell>
  );
}
