"use client";

import PMDashboard from "./pm-dashboard";

interface Props {
  userId: string;
  displayName: string | null;
}

export default function AdminDashboard({ displayName }: Props) {
  return <PMDashboard displayName={displayName} />;
}
