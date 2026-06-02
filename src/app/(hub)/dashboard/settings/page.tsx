import { requireRole } from "@/lib/auth/require-role";
import SettingsContent from "./_content";

export default async function DashboardSettingsPage() {
  await requireRole("/dashboard/settings");
  return <SettingsContent />;
}
