import { requireRole } from "@/lib/auth/require-role";
import PipelineContent from "./_content";

export default async function DashboardPipelinePage() {
  await requireRole("/dashboard/pipeline");
  return <PipelineContent />;
}
