import { requireRole } from "@/lib/auth/require-role";
import NewCustomerContent from "../../../customers/onboard/_content";

export default async function NewCustomerPage() {
  await requireRole("/dashboard/customers/onboard");
  return <NewCustomerContent />;
}
