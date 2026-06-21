import PMDashboard from "./pm-dashboard";
import DevDashboard from "./dev-dashboard";
import AdminDashboard from "./admin-dashboard";

interface DashboardViewProps {
  role: string | null;
  displayName: string | null;
  userId: string;
}

/**
 * Role-gated dashboard. Each user sees exactly one dashboard, determined by their
 * session role (resolved server-side from `profiles.role` in page.tsx). There is no
 * tab switcher — users cannot view a dashboard their role does not own.
 *
 *   admin     → Admin dashboard
 *   developer → Dev dashboard
 *   pm        → PM dashboard
 *   hr/client → PM dashboard (fallback; HR dashboard ships in Sprint 6)
 */
export default function DashboardView({ role, displayName, userId }: DashboardViewProps) {
  if (role === "developer") {
    return <DevDashboard userId={userId} displayName={displayName} />;
  }
  if (role === "admin") {
    return <AdminDashboard userId={userId} displayName={displayName} />;
  }
  return <PMDashboard displayName={displayName} />;
}
