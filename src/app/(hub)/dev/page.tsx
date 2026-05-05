import HubHeader from "@/components/hub/hub-header";

const tasks = [
  { id: "T-401", title: "Set up staging environment for Acme",     project: "WRQ-001", priority: "HIGH",   due: "Today",     status: "In Progress" },
  { id: "T-402", title: "Migrate content to headless CMS",         project: "WRQ-003", priority: "HIGH",   due: "Tomorrow",  status: "To Do" },
  { id: "T-403", title: "Fix navigation bug on mobile breakpoint",  project: "WRQ-001", priority: "NORMAL", due: "May 8",     status: "To Do" },
  { id: "T-404", title: "Configure Zoho webhook for ticket sync",   project: "WRQ-004", priority: "LOW",    due: "May 10",    status: "To Do" },
  { id: "T-405", title: "Review PR: Add contact form validation",   project: "WRQ-002", priority: "NORMAL", due: "May 9",     status: "Review" },
];

const tickets = [
  { id: "#204", title: "Staging URL returning 404",       project: "WRQ-001", priority: "High",   opened: "2h ago" },
  { id: "#206", title: "CMS login not working for client", project: "WRQ-003", priority: "Medium", opened: "5h ago" },
  { id: "#207", title: "Blog images not loading on prod",  project: "WRQ-004", priority: "Low",    opened: "1d ago" },
];

const timeToday = [
  { project: "WRQ-001", task: "Set up staging environment", logged: "2h 15m" },
  { project: "WRQ-003", task: "CMS content migration",       logged: "1h 30m" },
];

function priorityStyle(p: string) {
  return ({
    HIGH:   { bg: "#FEF2F2", color: "#DC2626" },
    NORMAL: { bg: "#FFF7ED", color: "#C2410C" },
    LOW:    { bg: "#F0FDF4", color: "#166534" },
    High:   { bg: "#FEF2F2", color: "#DC2626" },
    Medium: { bg: "#FFF7ED", color: "#C2410C" },
  } as Record<string, { bg: string; color: string }>)[p] ?? { bg: "#F1F5F9", color: "#64748B" };
}

function statusStyle(s: string) {
  return ({
    "In Progress": { bg: "#EEF2FF", color: "#3358F4" },
    "To Do":       { bg: "#F1F5F9", color: "#64748B" },
    Review:        { bg: "#FFF7ED", color: "#C2410C" },
    Done:          { bg: "#F0FDF4", color: "#166534" },
  } as Record<string, { bg: string; color: string }>)[s] ?? { bg: "#F1F5F9", color: "#64748B" };
}

export default function DevDashboardPage() {
  return (
    <>
      <HubHeader title="My Dashboard" subtitle="Developer daily view" />

      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", flex: 1 }}>
        {/* Summary strip */}
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "14px 24px", display: "flex", alignItems: "center", gap: 0, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          {[
            { val: "5",     label: "Open Tasks",   color: "#0F172A" },
            null,
            { val: "2",     label: "Overdue",      color: "#EF4444" },
            null,
            { val: "3",     label: "Open Tickets", color: "#0F172A" },
            null,
            { val: "3h 45m", label: "Logged Today", color: "#0F172A" },
          ].map((item, i) =>
            item === null ? (
              <div key={i} style={{ width: 1, height: 36, background: "#F1F5F9", flexShrink: 0 }} />
            ) : (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: 1 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: item.color, letterSpacing: "-0.02em" }}>{item.val}</span>
                <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>{item.label}</span>
              </div>
            )
          )}
        </div>

        {/* Two-col */}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {/* Tasks */}
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>My Tasks</span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 9999, background: "#F1F5F9", color: "#64748B" }}>Sprint 12</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {tasks.map((t, i) => {
                const pc = priorityStyle(t.priority);
                const sc = statusStyle(t.status);
                return (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < tasks.length - 1 ? "1px solid #F1F5F9" : "none" }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: "2px solid #E2E8F0", flexShrink: 0, background: t.status === "Done" ? "#3358F4" : "#fff" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#0F172A", lineHeight: 1.3 }}>{t.title}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{t.project} · Due {t.due}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: pc.bg, color: pc.color, flexShrink: 0 }}>{t.priority}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: sc.bg, color: sc.color, flexShrink: 0 }}>{t.status}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 240, maxWidth: 280 }}>
            {/* Tickets */}
            <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>My Tickets</span>
              </div>
              {tickets.map((t, i) => {
                const pc = priorityStyle(t.priority);
                return (
                  <div key={t.id} style={{ padding: "8px 0", borderBottom: i < tickets.length - 1 ? "1px solid #F1F5F9" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                      <div>
                        <span style={{ fontSize: 11, fontFamily: "monospace", color: "#94A3B8" }}>{t.id}</span>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "#0F172A", marginTop: 1 }}>{t.title}</div>
                        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{t.project} · {t.opened}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: pc.bg, color: pc.color, flexShrink: 0 }}>{t.priority}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time logged today */}
            <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>Time Logged Today</span>
              </div>
              {timeToday.map((e, i) => (
                <div key={i} style={{ padding: "7px 0", borderBottom: i < timeToday.length - 1 ? "1px solid #F1F5F9" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "#0F172A" }}>{e.task}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{e.project}</div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#3358F4" }}>{e.logged}</span>
                  </div>
                </div>
              ))}
              <button style={{ marginTop: 10, width: "100%", padding: 8, background: "#EEF2FF", color: "#3358F4", fontSize: 12, fontWeight: 600, border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                + Log Time
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
