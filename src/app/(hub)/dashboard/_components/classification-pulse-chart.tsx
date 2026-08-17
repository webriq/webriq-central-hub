"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const STATUS_LABELS: Record<string, string> = {
  open: "Open", pending: "Pending", planning: "Planning",
  approved: "Approved", active: "Active", review: "Review",
  closed: "Closed", on_hold: "On Hold",
};

// Static color maps — hex values since recharts can't read CSS vars
const STATUS_COLORS_LIGHT: Record<string, string> = {
  open: "#3358F4", pending: "#4f46e5", planning: "#1565c0",
  approved: "#15803d", active: "#16a34a", review: "#a16207",
  closed: "#9ca3af", on_hold: "#9ca3af",
};
const STATUS_COLORS_DARK: Record<string, string> = {
  open: "#5b7fff", pending: "#818cf8", planning: "#60a5fa",
  approved: "#4ade80", active: "#34d399", review: "#fbbf24",
  closed: "#6b7280", on_hold: "#6b7280",
};

interface Props {
  statusCounts: Record<string, number>;
  isDark: boolean;
}

export default function ClassificationPulseChart({ statusCounts, isDark }: Props) {
  const colors = isDark ? STATUS_COLORS_DARK : STATUS_COLORS_LIGHT;
  const tickFill = isDark ? "rgba(255,255,255,0.4)" : "rgba(10,12,30,0.40)";

  const data = Object.entries(statusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({ name: STATUS_LABELS[status] ?? status, value: count, status }));

  if (data.length === 0) {
    return <p className="text-[12px] text-(--c-muted) py-6 text-center">No classification data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 9, fill: tickFill }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: tickFill }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: isDark ? "#121726" : "#ffffff",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
            borderRadius: 8,
            fontSize: 12,
          }}
          cursor={{ fill: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.status} fill={colors[entry.status] ?? colors.open} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
