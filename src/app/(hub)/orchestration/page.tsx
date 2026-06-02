import { requireRole } from "@/lib/auth/require-role";
import OrchestrationContent from "./_content";

export default async function OrchestrationPage() {
  await requireRole("/orchestration");
  return <OrchestrationContent />;
}
