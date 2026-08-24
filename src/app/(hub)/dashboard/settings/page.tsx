import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="py-6.5 px-8">
      <p className="text-sm text-muted-foreground">v2 · Settings · Sprint 1A</p>
    </div>
  );
}
