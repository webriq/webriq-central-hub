"use client";

import PMDashboard from "./pm-dashboard";

interface Props {
  userId: string;
  displayName: string | null;
  role: string | null;
}

export default function AdminDashboard({ displayName, role }: Props) {
  return <PMDashboard displayName={displayName} role={role} />;
}
