import { requireRole } from "@/lib/auth/require-role";
import TimelogsContent from "./_content";

export default async function DashboardTimelogsPage() {
  await requireRole("/dashboard/timelogs");
  return <TimelogsContent />;
}
