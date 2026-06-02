import { requireRole } from "@/lib/auth/require-role";
import NewCustomerContent from "./_content";

export default async function NewCustomerPage() {
  await requireRole("/customers/onboard");
  return <NewCustomerContent />;
}
