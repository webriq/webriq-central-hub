# Sprint 6 — Developer Dashboard + KB Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the developer dashboard to live Zoho data, add self-assign, AI queries, KB file storage, and a metrics panel — completing Sprint 6 (AC5).

**Architecture:** Six independent waves. Waves 1–3 deliver AC5 (dev dashboard + self-assign + AI queries). Waves 4–5 deliver KB storage and wiki lint. Wave 6 delivers the metrics panel. Each wave is independently testable. All Zoho functions are added to `src/lib/zoho/index.ts`; all new API routes follow the existing `createClient()` + session-check pattern.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL + Storage), Zoho Projects API (OAuth), Vercel AI SDK (`generateText`), Claude Haiku via `getModel('digest')` for AI queries and `getModel('wiki_lint')` for lint, Tailwind CSS v4, zod.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/zoho/index.ts` | Modify | Add 4 read/write functions + shared types |
| `src/app/api/dev/tasks/route.ts` | Create | Fetch my tasks + unassigned tasks + time logs from Zoho |
| `src/app/api/dev/assign/route.ts` | Create | Self-assign a task in Zoho + fire Cliq notification |
| `src/app/api/dev/ask/route.ts` | Create | AI prompt — answer questions about dev's Zoho data |
| `src/app/(hub)/dev/page.tsx` | Rewrite | Live data, overdue highlighting, self-assign UI, AI widget |
| `src/app/api/kb/[customerId]/route.ts` | Create | List files in Supabase Storage for a customer |
| `src/app/api/kb/upload/route.ts` | Create | Upload a file to the `kb` bucket |
| `src/app/api/kb/lint/route.ts` | Create | LLM wiki audit — called by pg_cron weekly |
| `src/app/(hub)/kb/page.tsx` | Rewrite | Two-panel KB browser with file upload |
| `src/app/api/metrics/route.ts` | Create | Query `vw_hub_metrics` view |
| `src/app/(hub)/pm/page.tsx` | Modify | Add metrics panel section |
| `supabase/migrations/016_kb_storage.sql` | Create | `kb` bucket + storage RLS policies |
| `supabase/migrations/017_kb_lint.sql` | Create | `kb_lint_logs` table + pg_cron weekly lint job |
| `supabase/migrations/018_metrics_view.sql` | Create | `vw_hub_metrics` view |

---

## Wave 1 — Zoho Read Layer + Live Dev Dashboard

---

### Task 1: Add Zoho shared types + `getMyZohoTasks`

**Files:**
- Modify: `src/lib/zoho/index.ts`

- [ ] **Step 1: Add shared Zoho types before the existing `SyncTaskInput` type**

Open `src/lib/zoho/index.ts`. After the closing `}` of `getZohoAccessToken`, add the following types (insert before `type SyncTaskInput`):

```ts
export type ZohoTask = {
  id: string;
  name: string;
  project: { id: string; name: string };
  priority: string;
  status: { name: string };
  due_date: string | null;
  completed: boolean;
  link?: { web?: { url: string } };
  details?: { owners?: Array<{ name: string; id: string }> };
};

export type ZohoTimeLog = {
  id: string;
  project: { id: string; name: string };
  task: { id: string; name: string };
  hours: string;
  log_date: string;
};
```

- [ ] **Step 2: Add `getMyZohoTasks` at the end of the file**

```ts
export async function getMyZohoTasks(
  portalId: string,
  zohoUserId: string
): Promise<ZohoTask[]> {
  const token = await getZohoAccessToken();
  if (!token) return [];

  const res = await fetch(
    `https://projectsapi.zoho.com/restapi/portal/${portalId}/users/${zohoUserId}/tasks/?type=open`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );

  if (!res.ok) {
    console.error("[zoho] getMyZohoTasks failed:", res.status, await res.text());
    return [];
  }

  const json = await res.json();
  return (json?.tasks ?? []) as ZohoTask[];
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/zoho/index.ts
git commit -m "feat(zoho): add ZohoTask/ZohoTimeLog types and getMyZohoTasks"
```

---

### Task 2: Add `getUnassignedZohoTasks`

**Files:**
- Modify: `src/lib/zoho/index.ts`

The reliable approach: query `customer_products` for all `zoho_project_id` values, then fetch tasks per-project from Zoho, filter those with no owners. `adminClient` is used for the DB read (same pattern as `syncTaskToZoho`).

- [ ] **Step 1: Add `getUnassignedZohoTasks` at the end of `src/lib/zoho/index.ts`**

```ts
export async function getUnassignedZohoTasks(portalId: string): Promise<ZohoTask[]> {
  const token = await getZohoAccessToken();
  if (!token) return [];

  // Collect all zoho_project_ids across all active customer products
  const { data: products } = await adminClient
    .from("customer_products")
    .select("zoho_project_id")
    .not("zoho_project_id", "is", null);

  if (!products?.length) return [];

  const projectIds = [...new Set(products.map((p) => p.zoho_project_id as string))];

  const results = await Promise.all(
    projectIds.map(async (projectId) => {
      const res = await fetch(
        `https://projectsapi.zoho.com/restapi/portal/${portalId}/projects/${projectId}/tasks/?type=open`,
        { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
      );
      if (!res.ok) return [];
      const json = await res.json();
      return (json?.tasks ?? []) as ZohoTask[];
    })
  );

  // Keep only tasks with no owners assigned
  return results
    .flat()
    .filter((t) => !t.details?.owners?.length);
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/zoho/index.ts
git commit -m "feat(zoho): add getUnassignedZohoTasks (project-scoped with owner filter)"
```

---

### Task 3: Add `getMyZohoTimeLogs`

**Files:**
- Modify: `src/lib/zoho/index.ts`

- [ ] **Step 1: Add `getMyZohoTimeLogs` at the end of `src/lib/zoho/index.ts`**

`dateStr` is formatted as `MM-DD-YYYY` to match Zoho's expected format. Pass today's date for "Today" mode, or a week-start date for "This Week" mode (the route will handle computing the date).

```ts
export async function getMyZohoTimeLogs(
  portalId: string,
  zohoUserId: string,
  dateStr: string  // "MM-DD-YYYY" for day; or a date range start for the route to handle
): Promise<ZohoTimeLog[]> {
  const token = await getZohoAccessToken();
  if (!token) return [];

  const res = await fetch(
    `https://projectsapi.zoho.com/restapi/portal/${portalId}/timelogs/?users_list=${zohoUserId}&date=${dateStr}&view_type=day`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );

  if (!res.ok) {
    console.error("[zoho] getMyZohoTimeLogs failed:", res.status, await res.text());
    return [];
  }

  const json = await res.json();
  // Zoho returns: { timelogs: { tasklogs: [...] } }
  const tasklogs = json?.timelogs?.tasklogs ?? [];
  return tasklogs as ZohoTimeLog[];
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/zoho/index.ts
git commit -m "feat(zoho): add getMyZohoTimeLogs"
```

---

### Task 4: Create `/api/dev/tasks` route

**Files:**
- Create: `src/app/api/dev/tasks/route.ts`

This route fetches all three data sets in one request. The `range` query param controls time log window (`today` | `week`).

- [ ] **Step 1: Create the route file**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  getMyZohoTasks,
  getUnassignedZohoTasks,
  getMyZohoTimeLogs,
} from "@/lib/zoho";

function todayZohoFormat(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
}

function mondayZohoFormat(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await adminClient
    .from("hub_users")
    .select("zoho_user_id, display_name")
    .eq("id", user.id)
    .single();

  const portalId = process.env.ZOHO_PORTAL_ID ?? "";
  const zohoUserId = profile?.zoho_user_id ?? "";

  if (!zohoUserId) {
    return NextResponse.json(
      { myTasks: [], unassignedTasks: [], timeLogs: [], warning: "no_zoho_id" },
      { status: 200 }
    );
  }

  const range = new URL(req.url).searchParams.get("range") ?? "today";
  const dateStr = range === "week" ? mondayZohoFormat() : todayZohoFormat();

  const [myTasks, unassignedTasks, timeLogs] = await Promise.all([
    getMyZohoTasks(portalId, zohoUserId),
    getUnassignedZohoTasks(portalId),
    getMyZohoTimeLogs(portalId, zohoUserId, dateStr),
  ]);

  return NextResponse.json({ myTasks, unassignedTasks, timeLogs });
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke-test the route** (requires dev server running)

```bash
pnpm dev
# In another terminal, with a valid session cookie from the browser:
curl -s http://localhost:3000/api/dev/tasks \
  -H "Cookie: <paste session cookie from browser dev tools>" | jq '.myTasks | length'
```

Expected: a number (0 or more). No 500 errors in the terminal.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/dev/tasks/route.ts
git commit -m "feat(api): add GET /api/dev/tasks — live Zoho tasks + time logs"
```

---

### Task 5: Rewrite dev page with live data + overdue highlighting

**Files:**
- Rewrite: `src/app/(hub)/dev/page.tsx`

The page becomes a Client Component that fetches from `/api/dev/tasks` on mount. Overdue = `due_date` parses to before today and `completed === false`.

- [ ] **Step 1: Replace the entire content of `src/app/(hub)/dev/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ZohoTask, ZohoTimeLog } from "@/lib/zoho";

type DevData = {
  myTasks: ZohoTask[];
  unassignedTasks: ZohoTask[];
  timeLogs: ZohoTimeLog[];
  warning?: string;
};

function parseZohoDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  // Zoho format: "MM-DD-YYYY"
  const [mm, dd, yyyy] = dateStr.split("-");
  if (!mm || !dd || !yyyy) return null;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

function isOverdue(task: ZohoTask): boolean {
  if (task.completed) return false;
  const due = parseZohoDate(task.due_date);
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function priorityClass(p: string) {
  return ({
    high:   "bg-red-50 text-red-600",
    medium: "bg-orange-50 text-orange-700",
    low:    "bg-green-50 text-green-800",
    none:   "bg-slate-100 text-slate-400",
  } as Record<string, string>)[p.toLowerCase()] ?? "bg-slate-100 text-slate-400";
}

function buildZohoLink(task: ZohoTask): string | null {
  return task.link?.web?.url ?? null;
}

const cardCls = "bg-white border border-slate-200 rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.05)]";

function TaskSkeleton() {
  return (
    <div className="flex flex-col gap-2 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-10 bg-slate-100 rounded-lg" />
      ))}
    </div>
  );
}

export default function DevDashboardPage() {
  const [data, setData] = useState<DevData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<"today" | "week">("today");
  const [assigningIds, setAssigningIds] = useState<Set<string>>(new Set());
  const [assignError, setAssignError] = useState<string | null>(null);
  const [aiQuery, setAiQuery] = useState("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  async function load(r: "today" | "week") {
    setLoading(true);
    try {
      const res = await fetch(`/api/dev/tasks?range=${r}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(range); }, [range]);

  async function handleAssign(task: ZohoTask) {
    setAssignError(null);
    setAssigningIds((prev) => new Set(prev).add(task.id));

    // Optimistic update
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        unassignedTasks: prev.unassignedTasks.filter((t) => t.id !== task.id),
        myTasks: [{ ...task, details: undefined }, ...prev.myTasks],
      };
    });

    const res = await fetch("/api/dev/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: task.project.id, taskId: task.id }),
    });

    if (!res.ok) {
      // Roll back optimistic update
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          myTasks: prev.myTasks.filter((t) => t.id !== task.id),
          unassignedTasks: [task, ...prev.unassignedTasks],
        };
      });
      setAssignError("Failed to assign task — please try again.");
    }

    setAssigningIds((prev) => {
      const next = new Set(prev);
      next.delete(task.id);
      return next;
    });
  }

  async function handleAsk() {
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    setAiAnswer(null);
    const res = await fetch("/api/dev/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: aiQuery }),
    });
    if (res.ok) {
      const json = await res.json();
      setAiAnswer(json.answer ?? "No response.");
    } else {
      setAiAnswer("Failed to get an answer — please try again.");
    }
    setAiLoading(false);
  }

  const myTasks = data?.myTasks ?? [];
  const unassignedTasks = data?.unassignedTasks ?? [];
  const timeLogs = data?.timeLogs ?? [];

  const overdueCount = myTasks.filter(isOverdue).length;
  const totalLogged = timeLogs.reduce((sum, log) => {
    const [h, m] = log.hours.split(":").map(Number);
    return sum + (h || 0) * 60 + (m || 0);
  }, 0);
  const loggedDisplay = `${Math.floor(totalLogged / 60)}h ${totalLogged % 60}m`;

  return (
    <div className="p-6 flex flex-col gap-4 overflow-y-auto flex-1">
      {/* Summary strip */}
      <div className={cn(cardCls, "px-6 py-3.5 flex items-center")}>
        {[
          { val: loading ? "—" : String(myTasks.length),        label: "Open Tasks",   highlight: false },
          null,
          { val: loading ? "—" : String(overdueCount),          label: "Overdue",      highlight: overdueCount > 0 },
          null,
          { val: loading ? "—" : String(unassignedTasks.length), label: "Unassigned",  highlight: false },
          null,
          { val: loading ? "—" : loggedDisplay,                 label: range === "week" ? "Logged This Week" : "Logged Today", highlight: false },
        ].map((item, i) =>
          item === null ? (
            <div key={i} className="w-px h-9 bg-slate-100 shrink-0" />
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
        {/* My Tasks */}
        <div className={cn(cardCls, "p-[16px_18px] flex-1")}>
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-bold text-slate-900">My Tasks</span>
          </div>
          {loading ? <TaskSkeleton /> : myTasks.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No open tasks assigned to you.</p>
          ) : (
            <div className="flex flex-col">
              {myTasks.map((t, i) => {
                const overdue = isOverdue(t);
                const link = buildZohoLink(t);
                return (
                  <div
                    key={t.id}
                    className={cn(
                      "flex items-center gap-2.5 py-2.5",
                      i < myTasks.length - 1 && "border-b border-slate-100",
                      overdue && "border-l-2 border-l-red-400 pl-2"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-slate-900 leading-tight">
                        {link ? (
                          <a href={link} target="_blank" rel="noopener noreferrer"
                            className="hover:text-indigo-600 transition-colors">
                            {t.name}
                          </a>
                        ) : t.name}
                      </div>
                      <div className={cn("text-[11px] mt-0.5", overdue ? "text-red-500 font-semibold" : "text-slate-400")}>
                        {t.project.name}
                        {t.due_date ? ` · Due ${t.due_date}${overdue ? " · OVERDUE" : ""}` : ""}
                      </div>
                    </div>
                    <span className={cn("text-[10px] font-bold px-1.5 py-px rounded shrink-0", priorityClass(t.priority))}>
                      {t.priority.toUpperCase()}
                    </span>
                    <span className="text-[10px] font-semibold px-1.5 py-px rounded shrink-0 bg-slate-100 text-slate-500">
                      {t.status.name}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-3.5 min-w-60 max-w-72">
          {/* Unassigned tasks */}
          <div className={cn(cardCls, "p-[16px_18px]")}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-bold text-slate-900">Team Unassigned</span>
            </div>
            {assignError && (
              <p className="text-xs text-red-500 mb-2">{assignError}</p>
            )}
            {loading ? <TaskSkeleton /> : unassignedTasks.length === 0 ? (
              <p className="text-sm text-slate-400 py-2 text-center">No unassigned tasks.</p>
            ) : (
              unassignedTasks.map((t, i) => (
                <div key={t.id} className={cn("py-2", i < unassignedTasks.length - 1 && "border-b border-slate-100")}>
                  <div className="flex justify-between items-start gap-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-slate-900 leading-tight">{t.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{t.project.name}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn("text-[10px] font-bold px-1.5 py-px rounded", priorityClass(t.priority))}>
                        {t.priority.toUpperCase()}
                      </span>
                      <button
                        onClick={() => handleAssign(t)}
                        disabled={assigningIds.has(t.id)}
                        className="text-[10px] font-semibold px-2 py-px rounded bg-indigo-50 text-brand border-none cursor-pointer font-[inherit] hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {assigningIds.has(t.id) ? "…" : "Assign to me"}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Time logged */}
          <div className={cn(cardCls, "p-[16px_18px]")}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-bold text-slate-900">Time Logged</span>
              <div className="flex rounded overflow-hidden border border-slate-200 text-[10px] font-semibold">
                {(["today", "week"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => { setRange(r); }}
                    className={cn(
                      "px-2 py-0.5 border-none cursor-pointer font-[inherit] capitalize",
                      range === r ? "bg-brand text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    {r === "today" ? "Today" : "Week"}
                  </button>
                ))}
              </div>
            </div>
            {loading ? <TaskSkeleton /> : timeLogs.length === 0 ? (
              <p className="text-sm text-slate-400 py-2 text-center">No time logged.</p>
            ) : (
              timeLogs.map((e, i) => (
                <div key={e.id} className={cn("py-1.75", i < timeLogs.length - 1 && "border-b border-slate-100")}>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-xs font-medium text-slate-900">{e.task.name}</div>
                      <div className="text-[11px] text-slate-400">{e.project.name}</div>
                    </div>
                    <span className="text-[13px] font-bold text-brand">{e.hours}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* AI prompt widget */}
      <div className={cn(cardCls, "overflow-hidden")}>
        <button
          onClick={() => setAiOpen((v) => !v)}
          className="w-full px-4 py-3 flex justify-between items-center bg-white border-none cursor-pointer font-[inherit] text-left"
        >
          <span className="text-sm font-semibold text-slate-700">Ask about your work</span>
          <span className="text-xs text-slate-400">{aiOpen ? "▲" : "▼"}</span>
        </button>
        {aiOpen && (
          <div className="px-4 pb-4 border-t border-slate-100">
            {/* Suggestion chips */}
            <div className="flex flex-wrap gap-1.5 pt-3 mb-3">
              {[
                "What open tasks do I have?",
                "Show my pending tickets",
                "How many hours did I log today?",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => { setAiQuery(q); setAiAnswer(null); }}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-indigo-50 text-brand border-none cursor-pointer font-[inherit] hover:bg-indigo-100 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAsk(); }}
                placeholder="Ask a question about your tasks…"
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-brand font-[inherit]"
              />
              <button
                onClick={handleAsk}
                disabled={aiLoading || !aiQuery.trim()}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold rounded-lg border-none cursor-pointer font-[inherit] disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {aiLoading ? "…" : "Ask"}
              </button>
            </div>
            {aiAnswer && (
              <p className="mt-3 text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2.5 leading-relaxed">
                {aiAnswer}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Start dev server and visually verify**

```bash
pnpm dev
```

Open http://localhost:3000/dev in a browser. Verify:
- Summary strip shows numbers (not hardcoded values)
- My Tasks section renders (may be empty if no Zoho tasks assigned)
- Team Unassigned section renders
- Time Logged card has Today/Week toggle
- AI prompt widget collapses and expands

- [ ] **Step 4: Commit**

```bash
git add src/app/(hub)/dev/page.tsx
git commit -m "feat(dev): wire dev dashboard to live Zoho data with overdue highlighting and AI widget"
```

---

## Wave 2 — Self-Assign Flow

---

### Task 6: Add `assignZohoTask` to zoho lib

**Files:**
- Modify: `src/lib/zoho/index.ts`

- [ ] **Step 1: Add `assignZohoTask` at the end of `src/lib/zoho/index.ts`**

```ts
export async function assignZohoTask(
  portalId: string,
  projectId: string,
  taskId: string,
  zohoUserId: string
): Promise<boolean> {
  const token = await getZohoAccessToken();
  if (!token) return false;

  const body = new URLSearchParams({ person_responsible: zohoUserId });

  const res = await fetch(
    `https://projectsapi.zoho.com/restapi/portal/${portalId}/projects/${projectId}/tasks/${taskId}/`,
    {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }
  );

  if (!res.ok) {
    console.error("[zoho] assignZohoTask failed:", res.status, await res.text());
    return false;
  }

  return true;
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/zoho/index.ts
git commit -m "feat(zoho): add assignZohoTask"
```

---

### Task 7: Create `/api/dev/assign` route

**Files:**
- Create: `src/app/api/dev/assign/route.ts`

On success, fires a Cliq notification to the PM channel.

- [ ] **Step 1: Create the route file**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { assignZohoTask, sendCliqNotification } from "@/lib/zoho";

const BodySchema = z.object({
  projectId: z.string().min(1),
  taskId: z.string().min(1),
  taskName: z.string().optional(),
  projectName: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await adminClient
    .from("hub_users")
    .select("zoho_user_id, display_name")
    .eq("id", user.id)
    .single();

  if (!profile?.zoho_user_id) {
    return NextResponse.json({ error: "no_zoho_id" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  const { projectId, taskId, taskName, projectName } = parsed.data;
  const portalId = process.env.ZOHO_PORTAL_ID ?? "";

  const ok = await assignZohoTask(portalId, projectId, taskId, profile.zoho_user_id);
  if (!ok) {
    return NextResponse.json({ error: "Zoho assignment failed" }, { status: 502 });
  }

  const name = profile.display_name ?? user.email ?? "A developer";
  const task = taskName ?? `task ${taskId}`;
  const project = projectName ? ` (${projectName})` : "";
  await sendCliqNotification(
    `🙋 ${name} self-assigned: ${task}${project}`,
    "pm"
  );

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Update the `handleAssign` call in `dev/page.tsx` to pass task name and project name**

Open `src/app/(hub)/dev/page.tsx`. Find the `body: JSON.stringify({ projectId: task.project.id, taskId: task.id })` line inside `handleAssign` and replace it:

```ts
body: JSON.stringify({
  projectId: task.project.id,
  taskId: task.id,
  taskName: task.name,
  projectName: task.project.name,
}),
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/dev/assign/route.ts src/app/(hub)/dev/page.tsx
git commit -m "feat(api): add POST /api/dev/assign with Cliq PM notification"
```

---

## Wave 3 — AI Prompt Widget Backend

---

### Task 8: Create `/api/dev/ask` route

**Files:**
- Create: `src/app/api/dev/ask/route.ts`

Uses `generateText` from the Vercel AI SDK with `getModel('digest')` (Haiku). Fetches the dev's current Zoho data to build context.

- [ ] **Step 1: Create the route file**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getMyZohoTasks, getMyZohoTimeLogs } from "@/lib/zoho";
import { getModel, getModelConfig } from "@/lib/ai/model-config";
import { logLLMInvocation } from "@/lib/ai/logger";

const BodySchema = z.object({
  query: z.string().min(1).max(500),
});

function todayZohoFormat(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}-${d.getFullYear()}`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { data: profile } = await adminClient
    .from("hub_users")
    .select("zoho_user_id")
    .eq("id", user.id)
    .single();

  const portalId = process.env.ZOHO_PORTAL_ID ?? "";
  const zohoUserId = profile?.zoho_user_id ?? "";

  const [myTasks, timeLogs] = zohoUserId
    ? await Promise.all([
        getMyZohoTasks(portalId, zohoUserId),
        getMyZohoTimeLogs(portalId, zohoUserId, todayZohoFormat()),
      ])
    : [[], []];

  const context = [
    `Open tasks assigned to me (${myTasks.length}):`,
    ...myTasks.map((t) =>
      `- [${t.priority.toUpperCase()}] ${t.name} | Project: ${t.project.name} | Status: ${t.status.name} | Due: ${t.due_date ?? "none"}`
    ),
    "",
    `Time logged today (${timeLogs.length} entries):`,
    ...timeLogs.map((l) =>
      `- ${l.task.name} | ${l.project.name} | ${l.hours}h`
    ),
  ].join("\n");

  const model = await getModel("digest");
  const config = await getModelConfig("digest");
  const started = Date.now();

  let answer = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let status: "success" | "error" = "success";

  try {
    const result = await generateText({
      model,
      system:
        "You are a developer assistant. Answer questions about the developer's Zoho tasks and time logs based only on the data provided. Be concise — 1–3 sentences max.",
      messages: [
        { role: "user", content: `Data:\n${context}\n\nQuestion: ${parsed.data.query}` },
      ],
      maxTokens: config.max_tokens,
      temperature: Number(config.temperature),
    });
    answer = result.text;
    inputTokens = result.usage?.promptTokens ?? 0;
    outputTokens = result.usage?.completionTokens ?? 0;
  } catch (err) {
    status = "error";
    answer = "Failed to generate an answer.";
    console.error("[dev/ask] LLM error:", err);
  }

  await logLLMInvocation({
    layer: "digest",
    modelUsed: config.model_id,
    inputTokens,
    outputTokens,
    durationMs: Date.now() - started,
    status,
  });

  return NextResponse.json({ answer });
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Test the AI endpoint manually**

With the dev server running:

```bash
curl -s -X POST http://localhost:3000/api/dev/ask \
  -H "Content-Type: application/json" \
  -H "Cookie: <session cookie>" \
  -d '{"query":"What open tasks do I have?"}' | jq .
```

Expected: `{ "answer": "You have N open tasks: ..." }`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/dev/ask/route.ts
git commit -m "feat(api): add POST /api/dev/ask — AI answers dev queries about Zoho data"
```

---

### Task 9: AC5 Acceptance Test

**Files:** (read-only — browser testing)

- [ ] **Step 1: Log in as a developer user and navigate to `/dev`**

Verify: summary strip shows live numbers, My Tasks and Team Unassigned sections render.

- [ ] **Step 2: Confirm overdue tasks are highlighted**

If a task is past due: verify red left border and red due-date label. If no tasks are overdue, temporarily check the `isOverdue` logic by inspecting the parsed date in browser console.

- [ ] **Step 3: Self-assign a task**

Click "Assign to me" on any unassigned task. Verify:
- Task disappears from Unassigned list immediately (optimistic)
- Task appears in My Tasks
- Check Zoho Projects in the browser — the task should now show your user as assignee
- Check the Cliq PM channel for the notification

- [ ] **Step 4: Test AI widget**

Click "Ask about your work". Click the chip "What open tasks do I have?" — verify it auto-fills and submits. Verify the answer reflects your real task count.

- [ ] **Step 5: Test time log toggle**

Click "Week" — verify the logged time updates.

- [ ] **Step 6: AC5 confirmed ✓**

---

## Wave 4 — KB + Storage

---

### Task 10: Migration 016 — KB Storage bucket + policies

**Files:**
- Create: `supabase/migrations/016_kb_storage.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- WebriQ Central Hub — Migration 016: KB Storage bucket + policies (Sprint 6, M10)

-- Create the kb bucket (private — no public URLs; files served via signed URLs)
insert into storage.buckets (id, name, public)
values ('kb', 'kb', false)
on conflict (id) do nothing;

-- hub_users with role 'pm' or 'developer' can upload to kb/global/
create policy "kb_global_upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kb'
    and (storage.foldername(name))[1] = 'global'
    and exists (
      select 1 from public.hub_users
      where id = auth.uid()
        and role in ('pm', 'developer', 'admin')
    )
  );

-- PM can upload to kb/customers/{customerId}/
create policy "kb_customer_upload_pm"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kb'
    and (storage.foldername(name))[1] = 'customers'
    and exists (
      select 1 from public.hub_users
      where id = auth.uid()
        and role in ('pm', 'admin')
    )
  );

-- Developer can upload to kb/customers/{customerId}/
create policy "kb_customer_upload_dev"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kb'
    and (storage.foldername(name))[1] = 'customers'
    and exists (
      select 1 from public.hub_users
      where id = auth.uid()
        and role in ('developer', 'admin')
    )
  );

-- All hub_users can read all kb files
create policy "kb_read_all"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'kb'
    and exists (
      select 1 from public.hub_users where id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply the migration in the Supabase Dashboard**

Go to Supabase Dashboard → SQL Editor → paste the migration → Run. Verify the `kb` bucket appears in Storage.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/016_kb_storage.sql
git commit -m "feat(db): add KB storage bucket with upload/read policies (migration 016)"
```

---

### Task 11: Seed playbooks — Content Update + Settings Change

**Files:**
- Create: `supabase/migrations/016b_kb_playbook_seed.sql`

These are global playbooks (no `customer_id`) seeded into the existing `playbooks` table.

- [ ] **Step 1: Create the seed file**

```sql
-- WebriQ Central Hub — Sprint 6 KB Seed: Content Update + Settings Change playbooks
-- Global playbooks (customer_id = null) — manual source, active

insert into playbooks (customer_id, task_type, title, content, version, is_active, source)
values
(
  null,
  'CONTENT_UPDATE',
  'Content Update Playbook',
  E'# Content Update Playbook\n\n'
  '## When to use\nUse for any request that modifies copy, images, or structured content in Sanity CMS without changing site structure or code.\n\n'
  '## Steps\n'
  '1. Confirm the exact pages or content blocks to be updated with the PM.\n'
  '2. Pull the latest content from Sanity for the target dataset.\n'
  '3. Apply changes in the Sanity Studio or via the Content Lake API.\n'
  '4. Preview changes in the Sanity Preview URL if available.\n'
  '5. Publish the document in Sanity Studio.\n'
  '6. Verify on the live site within 5 minutes (CDN propagation).\n'
  '7. Close the Zoho task and add a comment with the Sanity document ID and the change summary.\n\n'
  '## Common errors\n'
  '- **Publish blocked:** Another draft is locked — discard or merge the conflicting draft first.\n'
  '- **Image not appearing:** Check the asset pipeline is not filtered by locale or device type.\n\n'
  '## Acceptance criteria\n'
  '- Content visible on production URL within 10 minutes of publish.\n'
  '- No console errors on the updated page.',
  1,
  true,
  'manual'
),
(
  null,
  'SETTINGS_CHANGE',
  'Settings Change Playbook',
  E'# Settings Change Playbook\n\n'
  '## When to use\nUse for any request that modifies environment variables, feature flags, third-party integration credentials, or CMS global settings without deploying new code.\n\n'
  '## Steps\n'
  '1. Identify the setting key and target environment (staging vs production).\n'
  '2. Record the current value in the Zoho task notes as a rollback reference.\n'
  '3. Apply the change:\n'
  '   - For Vercel env vars: update via Vercel Dashboard → Project Settings → Environment Variables.\n'
  '   - For Sanity global config: update via the Settings singleton document in Sanity Studio.\n'
  '   - For Zoho settings: update via Zoho portal configuration.\n'
  '4. Trigger a redeployment if the env var is build-time (not runtime).\n'
  '5. Smoke-test the affected feature on the target environment.\n'
  '6. Close the Zoho task with before/after values documented in the comment.\n\n'
  '## Rollback\n'
  'Revert to the recorded value from step 2. Redeploy if necessary.\n\n'
  '## Acceptance criteria\n'
  '- The affected feature behaves as expected with the new setting.\n'
  '- No regression in related features.',
  1,
  true,
  'manual'
)
on conflict do nothing;
```

- [ ] **Step 2: Apply the seed in the Supabase Dashboard**

SQL Editor → paste → Run. Verify two rows appear in the `playbooks` table.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/016b_kb_playbook_seed.sql
git commit -m "feat(db): seed Content Update and Settings Change global playbooks"
```

---

### Task 12: Create `/api/kb/[customerId]` — list KB files

**Files:**
- Create: `src/app/api/kb/[customerId]/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { customerId } = await params;

  const { data, error } = await adminClient.storage
    .from("kb")
    .list(`customers/${customerId}`, {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });

  if (error) {
    console.error("[kb] list error:", error.message);
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 });
  }

  const files = (data ?? []).map((f) => ({
    name: f.name,
    size: f.metadata?.size ?? 0,
    mimeType: f.metadata?.mimetype ?? "",
    createdAt: f.created_at,
    path: `customers/${customerId}/${f.name}`,
  }));

  return NextResponse.json({ files });
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/kb/[customerId]/route.ts
git commit -m "feat(api): add GET /api/kb/[customerId] — list KB files from Supabase Storage"
```

---

### Task 13: Create `/api/kb/upload` route

**Files:**
- Create: `src/app/api/kb/upload/route.ts`

Separate from `/api/upload` (brand assets). Accepts `customerId` and `file` via FormData; uploads to `kb` bucket.

- [ ] **Step 1: Create the route file**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "text/markdown",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const customerId = formData.get("customerId") as string | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 25MB limit" }, { status: 400 });
  }

  const timestamp = Date.now();
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const folder = customerId ? `customers/${customerId}` : "global";
  const storagePath = `${folder}/${timestamp}_${safeFilename}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await adminClient.storage
    .from("kb")
    .upload(storagePath, Buffer.from(arrayBuffer), {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("[kb/upload] error:", uploadError.message);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  return NextResponse.json({ path: storagePath, filename: file.name }, { status: 201 });
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/kb/upload/route.ts
git commit -m "feat(api): add POST /api/kb/upload — upload files to KB bucket"
```

---

### Task 14: Rewrite KB page as two-panel browser

**Files:**
- Rewrite: `src/app/(hub)/kb/page.tsx`

- [ ] **Step 1: Replace the entire content of `src/app/(hub)/kb/page.tsx`**

```tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

type KbFile = {
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
  path: string;
};

type Customer = {
  id: string;
  customer_id: string;
  company_name: string;
};

const cardCls = "bg-white border border-slate-200 rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.05)]";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function KnowledgeBasePage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [files, setFiles] = useState<KbFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // GET /api/customers returns a plain array (not wrapped in { customers: [] })
    fetch("/api/customers")
      .then((r) => r.json())
      .then((json) => setCustomers(Array.isArray(json) ? json : []));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingFiles(true);
    fetch(`/api/kb/${selectedId}`)
      .then((r) => r.json())
      .then((json) => setFiles(json.files ?? []))
      .finally(() => setLoadingFiles(false));
  }, [selectedId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    setUploadError(null);
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("customerId", selectedId);
    const res = await fetch("/api/kb/upload", { method: "POST", body: form });
    if (res.ok) {
      // Refresh file list
      const listRes = await fetch(`/api/kb/${selectedId}`);
      const json = await listRes.json();
      setFiles(json.files ?? []);
    } else {
      const json = await res.json().catch(() => ({}));
      setUploadError(json.error ?? "Upload failed.");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="p-6 flex gap-4 flex-1 overflow-hidden">
      {/* Left panel: customer selector */}
      <div className={cn(cardCls, "w-56 shrink-0 flex flex-col overflow-hidden")}>
        <div className="px-4 py-3 border-b border-slate-100">
          <span className="text-sm font-bold text-slate-900">Customers</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {customers.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">Loading…</p>
          ) : (
            customers.map((c) => (
              <button
                key={c.customer_id}
                onClick={() => setSelectedId(c.customer_id)}
                className={cn(
                  "w-full text-left px-4 py-2.5 text-sm border-none cursor-pointer font-[inherit] border-b border-slate-50 transition-colors",
                  selectedId === c.customer_id
                    ? "bg-indigo-50 text-brand font-semibold"
                    : "bg-white text-slate-700 hover:bg-slate-50"
                )}
              >
                {c.company_name}
                <div className="text-[11px] text-slate-400 font-normal">{c.customer_id}</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel: file list */}
      <div className={cn(cardCls, "flex-1 flex flex-col overflow-hidden")}>
        <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center">
          <span className="text-sm font-bold text-slate-900">
            {selectedId ? `KB Files — ${selectedId}` : "Select a customer"}
          </span>
          {selectedId && (
            <div className="flex items-center gap-2">
              {uploadError && (
                <span className="text-xs text-red-500">{uploadError}</span>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.md,.txt,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp"
                onChange={handleUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-xs font-semibold px-3 py-1.5 bg-brand text-white rounded-lg border-none cursor-pointer font-[inherit] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {uploading ? "Uploading…" : "+ Upload File"}
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {!selectedId ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-slate-400">Select a customer to view their KB files.</p>
            </div>
          ) : loadingFiles ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-slate-400">Loading files…</p>
            </div>
          ) : files.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-slate-400">No files uploaded yet.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">File</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Type</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Size</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f, i) => (
                  <tr key={f.path} className={cn("border-b border-slate-50", i % 2 === 1 && "bg-slate-50/50")}>
                    <td className="px-5 py-2.5 font-medium text-slate-900">{f.name}</td>
                    <td className="px-5 py-2.5 text-slate-500 text-xs">{f.mimeType || "—"}</td>
                    <td className="px-5 py-2.5 text-slate-500 text-xs">{formatBytes(f.size)}</td>
                    <td className="px-5 py-2.5 text-slate-400 text-xs">
                      {f.createdAt ? new Date(f.createdAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Start dev server and visually verify**

Open http://localhost:3000/kb. Verify: customer list renders on the left, selecting one loads the file list. Upload a test PDF and verify it appears in the list.

- [ ] **Step 4: Commit**

```bash
git add src/app/(hub)/kb/page.tsx
git commit -m "feat(kb): two-panel KB browser with customer selector and file upload"
```

---

## Wave 5 — Wiki Lint Cron

---

### Task 15: Migration 017 — `kb_lint_logs` table + weekly pg_cron job

**Files:**
- Create: `supabase/migrations/017_kb_lint.sql`

`wiki_lint` is already seeded in `llm_config` (migration 002) and `OrchestrationLayer` already includes it — no changes needed to those.

- [ ] **Step 1: Create the migration file**

```sql
-- WebriQ Central Hub — Migration 017: KB lint logs + weekly cron (Sprint 6, M10)

create table if not exists kb_lint_logs (
  id            uuid primary key default gen_random_uuid(),
  report        jsonb not null default '{}',
  files_audited integer not null default 0,
  model_used    text,
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz not null default now()
);

create index if not exists idx_kb_lint_logs_created_at on kb_lint_logs (created_at desc);

-- Enable RLS (admin-only read via service role; no user-facing policy needed at Phase 1)
alter table public.kb_lint_logs enable row level security;

-- Weekly wiki lint: Monday 06:00 UTC
-- pg_cron and pg_net must already be enabled (migration 012 enables them).
-- Update the URL via cron.alter_job() after deployment (same pattern as migration 012).
select cron.schedule(
  'weekly-wiki-lint',
  '0 6 * * 1',
  $job$
  select net.http_post(
    url     := 'https://REPLACE_WITH_APP_URL/api/kb/lint',
    body    := '{}'::jsonb,
    headers := '{"x-digest-secret":"REPLACE_WITH_DIGEST_SECRET","content-type":"application/json"}'::jsonb
  )
  $job$
);
```

- [ ] **Step 2: Apply in Supabase Dashboard SQL Editor**

Verify `kb_lint_logs` table appears. Verify the cron job `weekly-wiki-lint` appears in `cron.job`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/017_kb_lint.sql
git commit -m "feat(db): add kb_lint_logs table + weekly wiki lint cron job (migration 017)"
```

---

### Task 16: Create `/api/kb/lint` route

**Files:**
- Create: `src/app/api/kb/lint/route.ts`

Auth: same `x-digest-secret` pattern as `/api/digest`. Reads all `global/` playbooks from Supabase Storage, sends to `wiki_lint` layer (Haiku), stores the report.

- [ ] **Step 1: Create the route file**

```ts
import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getModel, getModelConfig } from "@/lib/ai/model-config";
import { logLLMInvocation } from "@/lib/ai/logger";

export async function POST(req: NextRequest) {
  // Accept cron calls via x-digest-secret or authenticated session
  const digestSecret = process.env.DIGEST_SECRET;
  const incomingSecret = req.headers.get("x-digest-secret");
  const isCronCall = digestSecret && incomingSecret === digestSecret;

  if (!isCronCall) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // List all files in the global KB folder
  const { data: fileList, error: listError } = await adminClient.storage
    .from("kb")
    .list("global", { limit: 100 });

  if (listError) {
    console.error("[kb/lint] list error:", listError.message);
    return NextResponse.json({ error: "Failed to list KB files" }, { status: 500 });
  }

  if (!fileList?.length) {
    return NextResponse.json({ message: "No global KB files to lint." });
  }

  // Download and read each file's text content
  const fileContents: string[] = [];
  for (const f of fileList) {
    const { data } = await adminClient.storage
      .from("kb")
      .download(`global/${f.name}`);
    if (data) {
      const text = await data.text();
      fileContents.push(`=== ${f.name} ===\n${text}`);
    }
  }

  const combinedContent = fileContents.join("\n\n");

  const model = await getModel("wiki_lint");
  const config = await getModelConfig("wiki_lint");
  const started = Date.now();

  let report: Record<string, unknown> = {};
  let inputTokens = 0;
  let outputTokens = 0;
  let lintStatus: "success" | "error" = "success";

  try {
    const result = await generateText({
      model,
      system:
        "You are a technical documentation auditor. Analyze the provided KB documents and identify: (1) contradictions between documents, (2) orphaned references (mentioned but not defined), (3) stale or outdated information markers. Return ONLY a JSON object with keys: contradictions (array of strings), orphans (array of strings), stale (array of strings), summary (string).",
      messages: [{ role: "user", content: combinedContent }],
      maxTokens: config.max_tokens,
      temperature: Number(config.temperature),
    });

    try {
      report = JSON.parse(result.text);
    } catch {
      report = { raw: result.text };
    }

    inputTokens = result.usage?.promptTokens ?? 0;
    outputTokens = result.usage?.completionTokens ?? 0;
  } catch (err) {
    lintStatus = "error";
    report = { error: String(err) };
    console.error("[kb/lint] LLM error:", err);
  }

  // Store the lint report
  const { error: insertError } = await adminClient
    .from("kb_lint_logs")
    .insert({
      report,
      files_audited: fileList.length,
      model_used: config.model_id,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    });

  if (insertError) {
    console.error("[kb/lint] insert error:", insertError.message);
  }

  await logLLMInvocation({
    layer: "wiki_lint",
    modelUsed: config.model_id,
    inputTokens,
    outputTokens,
    durationMs: Date.now() - started,
    status: lintStatus,
  });

  return NextResponse.json({ ok: true, filesAudited: fileList.length, report });
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Trigger the lint endpoint manually to verify**

With the dev server running:

```bash
curl -s -X POST http://localhost:3000/api/kb/lint \
  -H "x-digest-secret: $(grep DIGEST_SECRET .env.local | cut -d= -f2)" \
  -H "content-type: application/json" \
  -d '{}' | jq .
```

Expected: `{ "ok": true, "filesAudited": N, "report": { ... } }` (N may be 0 if no files uploaded yet to `global/`).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/kb/lint/route.ts
git commit -m "feat(api): add POST /api/kb/lint — weekly LLM wiki audit with report storage"
```

---

## Wave 6 — Logging Audit + Metrics Dashboard

---

### Task 17: LLM invocation logging audit

**Files:** (read-only audit — no code changes expected, but fix any gaps found)

- [ ] **Step 1: Find every LLM call site**

```bash
grep -rn "generateText\|generateObject\|streamText" src/ --include="*.ts" --include="*.tsx"
```

Expected output lists all AI call sites.

- [ ] **Step 2: Verify each call site logs**

For each file in Step 1 output, confirm there is a `logLLMInvocation(...)` call after the `generateText`/`generateObject` call with `layer`, `modelUsed`, `inputTokens`, `outputTokens`, `durationMs`. The new `/api/dev/ask` and `/api/kb/lint` routes already include logging. Flag any existing routes that are missing it.

- [ ] **Step 3: Add missing `logLLMInvocation` calls**

For each gap found in Step 2, add the logging call following the pattern in `src/app/api/dev/ask/route.ts` (wrap in try/catch, record `started = Date.now()` before the LLM call, log after).

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit any fixes**

```bash
git add src/
git commit -m "feat(logging): ensure all LLM call sites log to llm_invocation_logs"
```

---

### Task 18: Migration 018 — `vw_hub_metrics` view

**Files:**
- Create: `supabase/migrations/018_metrics_view.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- WebriQ Central Hub — Migration 018: Hub metrics view (Sprint 6, M10)

create or replace view vw_hub_metrics as
select
  -- 1. Total customers onboarded
  (select count(*) from customers where status != 'inactive') as customers_total,

  -- 2. Total tasks classified
  (select count(*) from classification_records) as classifications_total,

  -- 3. LLM-eligible task rate (%)
  (
    select round(
      100.0 * count(*) filter (where llm_eligible = true) / nullif(count(*), 0),
      1
    )
    from classification_records
  ) as llm_eligible_rate_pct,

  -- 4. Average classification confidence score
  (
    select round(avg(confidence_score)::numeric, 2)
    from classification_records
    where confidence_score is not null
  ) as avg_classification_confidence,

  -- 5. Total assessments run
  (select count(*) from requirements_assessments) as assessments_total,

  -- 6. Plan approval rate (%)
  (
    select round(
      100.0 * count(*) filter (where status in ('APPROVED', 'EXECUTING', 'COMPLETE'))
             / nullif(count(*) filter (where status != 'draft'), 0),
      1
    )
    from implementation_plans
  ) as plan_approval_rate_pct,

  -- 7. Plan rejection rate (%)
  (
    select round(
      100.0 * count(*) filter (where status = 'REJECTED')
             / nullif(count(*) filter (where status != 'draft'), 0),
      1
    )
    from implementation_plans
  ) as plan_rejection_rate_pct,

  -- 8. Total executions completed
  (select count(*) from execution_records where status in ('COMPLETED', 'PARTIAL_EXECUTION')) as executions_completed,

  -- 9. Execution success rate (%)
  (
    select round(
      100.0 * count(*) filter (where status = 'COMPLETED')
             / nullif(count(*) filter (where status != 'PENDING'), 0),
      1
    )
    from execution_records
  ) as execution_success_rate_pct,

  -- 10. Total LLM cost USD (all time)
  (select round(sum(cost_usd)::numeric, 4) from llm_invocation_logs where status = 'success') as llm_cost_total_usd,

  -- 11. Total LLM cost USD (this month)
  (
    select round(sum(cost_usd)::numeric, 4)
    from llm_invocation_logs
    where status = 'success'
      and created_at >= date_trunc('month', now())
  ) as llm_cost_month_usd;
```

- [ ] **Step 2: Apply in Supabase Dashboard SQL Editor**

Run a quick test query:
```sql
select * from vw_hub_metrics;
```
Expected: one row with 11 columns. Values may be 0 or null if the DB is empty — that is correct.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/018_metrics_view.sql
git commit -m "feat(db): add vw_hub_metrics view with 11 Phase 1 KPIs (migration 018)"
```

---

### Task 19: Create `/api/metrics` route

**Files:**
- Create: `src/app/api/metrics/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await adminClient
    .from("vw_hub_metrics")
    .select("*")
    .single();

  if (error) {
    console.error("[metrics] query error:", error.message);
    return NextResponse.json({ error: "Failed to load metrics" }, { status: 500 });
  }

  return NextResponse.json({ metrics: data });
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors. (The `vw_hub_metrics` view may not be in the generated Database types — if tsc errors on `.from("vw_hub_metrics")`, cast it: `adminClient.from("vw_hub_metrics" as "vw_hub_metrics")` and return `data as Record<string, number | null>`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/metrics/route.ts
git commit -m "feat(api): add GET /api/metrics — query vw_hub_metrics view"
```

---

### Task 20: Add metrics panel to PM home page

**Files:**
- Modify: `src/app/(hub)/pm/page.tsx`

- [ ] **Step 1: Read the current PM home page**

```bash
head -60 src/app/(hub)/pm/page.tsx
```

- [ ] **Step 2: Add a `MetricsPanel` component inline at the bottom of the PM home page**

Find the closing `</div>` of the page and insert above it:

```tsx
{/* Metrics panel (PM-visible, read-only) */}
<MetricsPanel />
```

Add this component above the `export default` function in `src/app/(hub)/pm/page.tsx`:

```tsx
"use client"; // add this directive at top if not already present

// ── Phase 1 target baselines ────────────────────────────────────────────────
const TARGETS: Record<string, { label: string; target: number; unit: string }> = {
  llm_eligible_rate_pct:        { label: "LLM-Eligible Rate",       target: 70,   unit: "%" },
  avg_classification_confidence: { label: "Avg Classification Conf", target: 80,   unit: "%" },
  plan_approval_rate_pct:       { label: "Plan Approval Rate",       target: 70,   unit: "%" },
  execution_success_rate_pct:   { label: "Execution Success Rate",   target: 85,   unit: "%" },
};

const DISPLAY_METRICS: Array<{ key: string; label: string; unit?: string; isCurrency?: boolean }> = [
  { key: "customers_total",            label: "Customers Onboarded" },
  { key: "classifications_total",      label: "Tasks Classified" },
  { key: "llm_eligible_rate_pct",      label: "LLM-Eligible Rate",       unit: "%" },
  { key: "avg_classification_confidence", label: "Avg Confidence",        unit: "%" },
  { key: "assessments_total",          label: "Assessments Run" },
  { key: "plan_approval_rate_pct",     label: "Plan Approval Rate",       unit: "%" },
  { key: "plan_rejection_rate_pct",    label: "Plan Rejection Rate",      unit: "%" },
  { key: "executions_completed",       label: "Executions Completed" },
  { key: "execution_success_rate_pct", label: "Execution Success Rate",   unit: "%" },
  { key: "llm_cost_total_usd",         label: "LLM Cost (All Time)",      isCurrency: true },
  { key: "llm_cost_month_usd",         label: "LLM Cost (This Month)",    isCurrency: true },
];

function MetricsPanel() {
  const [metrics, setMetrics] = useState<Record<string, number | null> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => r.json())
      .then((json) => setMetrics(json.metrics ?? null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mt-6">
      <h2 className="text-sm font-bold text-slate-700 mb-3">Phase 1 Metrics</h2>
      <div className="grid grid-cols-4 gap-3">
        {DISPLAY_METRICS.map(({ key, label, unit, isCurrency }) => {
          const raw = metrics?.[key] ?? null;
          const val = raw === null ? "—" : isCurrency ? `$${Number(raw).toFixed(4)}` : `${raw}${unit ?? ""}`;
          const target = TARGETS[key];
          const atTarget = target && raw !== null ? Number(raw) >= target.target : null;

          return (
            <div key={key} className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <div className={cn("text-xl font-extrabold tracking-tight", loading ? "text-slate-300" : "text-slate-900")}>
                {loading ? "…" : val}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">{label}</div>
              {target && !loading && raw !== null && (
                <div className={cn("text-[10px] font-semibold mt-1", atTarget ? "text-green-600" : "text-red-500")}>
                  Target: {target.target}{target.unit} {atTarget ? "✓" : "↓"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Also add `import { useState, useEffect } from "react"` and `import { cn } from "@/lib/utils"` at the top if not already present.

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Start dev server and verify**

Open http://localhost:3000/pm. Verify: 11 metric cards render in a 4-col grid at the bottom. Metrics with targets show green ✓ or red ↓. Values may be 0 or "—" if the DB is empty — that is correct.

- [ ] **Step 5: Commit**

```bash
git add src/app/(hub)/pm/page.tsx
git commit -m "feat(metrics): add Phase 1 metrics panel to PM home with target indicators"
```

---

## Done

All 22 Sprint 6 tasks are covered. AC5 is complete after Task 9. KB is complete after Task 14. Metrics are complete after Task 20.
