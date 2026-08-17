"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

// Stub data — real data from hr.timesheets in a future task (HR schema integration)
const STUB_DATA = [
  { day: "Mon", billable: 6, internal: 1 },
  { day: "Tue", billable: 7, internal: 0.5 },
  { day: "Wed", billable: 5, internal: 2 },
  { day: "Thu", billable: 8, internal: 0 },
  { day: "Fri", billable: 4, internal: 1.5 },
  { day: "Sat", billable: 0, internal: 0 },
  { day: "Sun", billable: 0, internal: 0 },
];

export default function WeeklyHoursChart({ isDark }: { isDark: boolean }) {
  const tickFill = isDark ? "rgba(255,255,255,0.4)" : "rgba(10,12,30,0.40)";
  const blueColor  = isDark ? "#5b7fff" : "#3358F4";
  const orangeColor = isDark ? "#f97316" : "#d45e09";

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={STUB_DATA} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <XAxis dataKey="day" tick={{ fontSize: 9, fill: tickFill }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: tickFill }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            background: isDark ? "#121726" : "#ffffff",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
            borderRadius: 8,
            fontSize: 11,
          }}
          cursor={{ fill: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}
        />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
        <Bar dataKey="billable" name="Billable" fill={blueColor} radius={[3, 3, 0, 0]} stackId="hours" />
        <Bar dataKey="internal" name="Internal" fill={orangeColor} radius={[3, 3, 0, 0]} stackId="hours" />
      </BarChart>
    </ResponsiveContainer>
  );
}
