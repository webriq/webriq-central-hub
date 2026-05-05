import HubHeader from "@/components/hub/hub-header";

const stats = [
  { label: "Active Projects", value: "24", delta: "+3 this week",   color: "#3358F4" },
  { label: "Open Tickets",    value: "18", delta: "5 overdue",       color: "#F97316" },
  { label: "Clients Onboarded", value: "142", delta: "+12 this month", color: "#22C55E" },
  { label: "Tasks Completed", value: "87%", delta: "This sprint",    color: "#7C3AED" },
];

const recentProjects = [
  { id: "WRQ-001", name: "Acme Corp Website Rebuild",    status: "In Progress", manager: "JM", progress: 65, due: "May 15" },
  { id: "WRQ-002", name: "Trident Roof — Onboarding",    status: "Onboarding",  manager: "AS", progress: 20, due: "May 20" },
  { id: "WRQ-003", name: "Hickory Hardware Store",        status: "Review",      manager: "JM", progress: 88, due: "May 10" },
  { id: "WRQ-004", name: "Gordon Water Systems",          status: "In Progress", manager: "KR", progress: 42, due: "Jun 1" },
  { id: "WRQ-005", name: "Veteran Roofing Portal",        status: "Planning",    manager: "AS", progress: 10, due: "Jun 15" },
];

const recentActivity = [
  { text: 'Task "Setup DNS" assigned to @kris',            time: "2m ago",  type: "assign" },
  { text: "Ticket #204 resolved by @james",                time: "14m ago", type: "resolve" },
  { text: 'Client "Belwith Keeler" onboarding completed',  time: "1h ago",  type: "onboard" },
  { text: "Project WRQ-003 moved to Review",               time: "2h ago",  type: "update" },
  { text: 'New ticket #205 opened: "Staging URL broken"',  time: "3h ago",  type: "ticket" },
];

function statusStyle(s: string) {
  return ({
    "In Progress": { bg: "#EEF2FF", color: "#3358F4" },
    Onboarding:   { bg: "#FFF4EC", color: "#F97316" },
    Review:       { bg: "#F0FDF4", color: "#16A34A" },
    Planning:     { bg: "#F1F5F9", color: "#64748B" },
  } as Record<string, { bg: string; color: string }>)[s] ?? { bg: "#F1F5F9", color: "#64748B" };
}

function activityIcon(type: string) {
  const icons: Record<string, string> = { assign: "→", resolve: "✓", onboard: "★", update: "↑", ticket: "!" };
  const colors: Record<string, string> = { assign: "#3358F4", resolve: "#22C55E", onboard: "#F97316", update: "#7C3AED", ticket: "#EF4444" };
  return { char: icons[type] ?? "•", color: colors[type] ?? "#94A3B8" };
}

const avatarColors: Record<string, string> = { JM: "#3358F4", KR: "#7C3AED", AS: "#F97316", TN: "#22C55E" };

export default function PMDashboardPage() {
  return (
    <>
      <HubHeader title="Dashboard" subtitle="Welcome back, Brandon" />

      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, overflowY: "auto", flex: 1 }}>
        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
          {stats.map((s) => (
            <div
              key={s.label}
              style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: s.color, letterSpacing: "-0.02em", lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>{s.delta}</div>
            </div>
          ))}
        </div>

        {/* Two-col: table + activity */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {/* Projects table */}
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>Recent Projects</span>
              <span style={{ fontSize: 12, color: "#3358F4", cursor: "pointer", fontWeight: 500 }}>View all →</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["ID", "Project", "Status", "PM", "Progress", "Due"].map((h) => (
                    <th key={h} style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.06em", textTransform: "uppercase", padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #F1F5F9" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentProjects.map((p) => {
                  const sc = statusStyle(p.status);
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                      <td style={{ padding: "10px 8px", fontSize: 13, color: "#475569", verticalAlign: "middle" }}>
                        <span style={{ fontSize: 11, color: "#94A3B8", fontFamily: "monospace" }}>{p.id}</span>
                      </td>
                      <td style={{ padding: "10px 8px", fontSize: 13, color: "#475569", verticalAlign: "middle", fontWeight: 500 }}>
                        <span style={{ color: "#0F172A", fontWeight: 500 }}>{p.name}</span>
                      </td>
                      <td style={{ padding: "10px 8px", fontSize: 13, color: "#475569", verticalAlign: "middle" }}>
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.color }}>{p.status}</span>
                      </td>
                      <td style={{ padding: "10px 8px", fontSize: 13, color: "#475569", verticalAlign: "middle" }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: avatarColors[p.manager] ?? "#3358F4", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{p.manager}</div>
                      </td>
                      <td style={{ padding: "10px 8px", fontSize: 13, color: "#475569", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, height: 5, background: "#F1F5F9", borderRadius: 9999, overflow: "hidden", minWidth: 48 }}>
                            <div style={{ width: `${p.progress}%`, height: "100%", background: "#3358F4", borderRadius: 9999 }} />
                          </div>
                          <span style={{ fontSize: 11, color: "#94A3B8", minWidth: 28 }}>{p.progress}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 8px", fontSize: 12, color: "#64748B", verticalAlign: "middle" }}>{p.due}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Activity feed */}
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", minWidth: 220, maxWidth: 280 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>Activity</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {recentActivity.map((a, i) => {
                const ic = activityIcon(a.type);
                return (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: i < recentActivity.length - 1 ? "1px solid #F1F5F9" : "none", alignItems: "flex-start" }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${ic.color}18`, color: ic.color, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{ic.char}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.4 }}>{a.text}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{a.time}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
