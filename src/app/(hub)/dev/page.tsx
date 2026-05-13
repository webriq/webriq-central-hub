import { cn } from "@/lib/utils";

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

function priorityClass(p: string) {
  return ({
    HIGH:   "bg-red-50 text-red-600",
    NORMAL: "bg-orange-50 text-orange-700",
    LOW:    "bg-green-50 text-green-800",
    High:   "bg-red-50 text-red-600",
    Medium: "bg-orange-50 text-orange-700",
  } as Record<string, string>)[p] ?? "bg-slate-100 text-slate-500";
}

function statusClass(s: string) {
  return ({
    "In Progress": "bg-indigo-50 text-brand",
    "To Do":       "bg-slate-100 text-slate-500",
    Review:        "bg-orange-50 text-orange-700",
    Done:          "bg-green-50 text-green-800",
  } as Record<string, string>)[s] ?? "bg-slate-100 text-slate-500";
}

const cardCls = "bg-white border border-slate-200 rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.05)]";

export default function DevDashboardPage() {
  return (
    <div className="p-6 flex flex-col gap-4 overflow-y-auto flex-1">
        {/* Summary strip */}
        <div className={cn(cardCls, "px-6 py-3.5 flex items-center")}>
          {[
            { val: "5",      label: "Open Tasks",   highlight: false },
            null,
            { val: "2",      label: "Overdue",      highlight: true },
            null,
            { val: "3",      label: "Open Tickets", highlight: false },
            null,
            { val: "3h 45m", label: "Logged Today", highlight: false },
          ].map((item, i) =>
            item === null ? (
              <div key={i} className="w-px h-9 bg-slate-100 flex-shrink-0" />
            ) : (
              <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
                <span className={cn("text-[22px] font-extrabold tracking-[-0.02em]", item.highlight ? "text-red-500" : "text-slate-900")}>
                  {item.val}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">{item.label}</span>
              </div>
            )
          )}
        </div>

        {/* Two-col */}
        <div className="flex gap-3.5 items-start">
          {/* Tasks */}
          <div className={cn(cardCls, "p-[16px_18px] flex-1")}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-bold text-slate-900">My Tasks</span>
              <span className="text-[11px] font-semibold px-2.5 py-px rounded-full bg-slate-100 text-slate-500">Sprint 12</span>
            </div>
            <div className="flex flex-col">
              {tasks.map((t, i) => (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-center gap-2.5 py-2.5",
                    i < tasks.length - 1 && "border-b border-slate-100"
                  )}
                >
                  <div
                    className={cn(
                      "w-[18px] h-[18px] rounded flex-shrink-0 border-2 border-slate-200",
                      t.status === "Done" ? "bg-brand" : "bg-white"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-slate-900 leading-tight">{t.title}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{t.project} · Due {t.due}</div>
                  </div>
                  <span className={cn("text-[10px] font-bold px-[7px] py-px rounded flex-shrink-0", priorityClass(t.priority))}>
                    {t.priority}
                  </span>
                  <span className={cn("text-[10px] font-semibold px-[7px] py-px rounded flex-shrink-0", statusClass(t.status))}>
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-3.5 min-w-[240px] max-w-[280px]">
            {/* Tickets */}
            <div className={cn(cardCls, "p-[16px_18px]")}>
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-bold text-slate-900">My Tickets</span>
              </div>
              {tickets.map((t, i) => (
                <div key={t.id} className={cn("py-2", i < tickets.length - 1 && "border-b border-slate-100")}>
                  <div className="flex justify-between items-start gap-1.5">
                    <div>
                      <span className="text-[11px] font-mono text-slate-400">{t.id}</span>
                      <div className="text-[13px] font-medium text-slate-900 mt-px">{t.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{t.project} · {t.opened}</div>
                    </div>
                    <span className={cn("text-[10px] font-bold px-[7px] py-px rounded flex-shrink-0", priorityClass(t.priority))}>
                      {t.priority}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Time logged */}
            <div className={cn(cardCls, "p-[16px_18px]")}>
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-bold text-slate-900">Time Logged Today</span>
              </div>
              {timeToday.map((e, i) => (
                <div key={i} className={cn("py-[7px]", i < timeToday.length - 1 && "border-b border-slate-100")}>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-xs font-medium text-slate-900">{e.task}</div>
                      <div className="text-[11px] text-slate-400">{e.project}</div>
                    </div>
                    <span className="text-[13px] font-bold text-brand">{e.logged}</span>
                  </div>
                </div>
              ))}
              <button className="mt-2.5 w-full p-2 bg-indigo-50 text-brand text-xs font-semibold border-none rounded-lg cursor-pointer font-[inherit]">
                + Log Time
              </button>
            </div>
          </div>
        </div>
    </div>
  );
}
