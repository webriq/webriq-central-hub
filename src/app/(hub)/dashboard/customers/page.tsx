import { requireRole } from "@/lib/auth/require-role";
import CustomersContent from "./_content";

export default async function DashboardCustomersPage() {
  await requireRole("/dashboard/customers");
  return <CustomersContent />;
}
