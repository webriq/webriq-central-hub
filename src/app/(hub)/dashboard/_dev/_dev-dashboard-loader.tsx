import { loadDevDashboard } from "./_load-dev-dashboard";
import DevDashboard from "./_dev-dashboard";

// Task 360 — async server component holding the developer dashboard's data fetch, so `page.tsx`
// can wrap just this branch in a Suspense boundary and stream the hub shell immediately rather
// than blocking the whole page on the queries (`async-suspense-boundaries`).

export default async function DevDashboardLoader({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string | null;
}) {
  const data = await loadDevDashboard(userId, displayName);
  return <DevDashboard data={data} displayName={displayName} />;
}
