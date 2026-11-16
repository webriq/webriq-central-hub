"use client";

import PMDashboard from "./pm-dashboard";

interface Props {
  userId: string;
  displayName: string | null;
  role: string | null;
  excludeTest: boolean;
}

export default function AdminDashboard({ displayName, role, excludeTest }: Props) {
  return <PMDashboard displayName={displayName} role={role} excludeTest={excludeTest} />;
}
