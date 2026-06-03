import { requireRole } from "@/lib/auth/require-role";
import ChatContent from "./_content";

export default async function DashboardChatPage() {
  await requireRole("/dashboard/chat");
  return <ChatContent />;
}
