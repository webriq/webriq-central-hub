# 011: Sidebar Cleanup, Inline Style Migration & Dynamic Greeting

**Created:** 2026-05-15
**Priority:** HIGH
**Type:** enhancement
**Recommended Model:** haiku
**Status:** TESTING
**Completed:** 2026-05-15

---

## Overview

Three focused improvements to the Hub shell and PM Home tab:

1. **Sidebar cleanup** — Remove the `Developer` and `Admin` nav sections from `HubSidebar`. These sections reference routes that are out of scope for the current PM dashboard and add noise for the primary PM role.

2. **Inline style → Tailwind migration** — `pm/page.tsx` wrapper divs and structural (non-color) inline styles in `home-tab.tsx` are converted to Tailwind classes. Color/theme-token-dependent styles (from `C.*` tokens) remain inline since they are dynamic.

3. **Dynamic, time-aware greeting** — Replace the hardcoded `"Good morning, Brandon ✦"` in `HomeTab` with a dynamic greeting that:
   - Pulls the authenticated user's `display_name` from `hub_users` via the Supabase browser client
   - Selects a time-of-day category (Morning / Noon / Afternoon / Evening / Night)
   - Picks a randomized greeting phrase from that category on each page load
   - Fades out automatically ~3 minutes after the greeting first appears
   - Can be dismissed early by clicking it

## Requirements

- [ ] `Developer` and `Admin` navGroup sections removed from `hub-sidebar.tsx`; only the `Main` group remains
- [ ] Wrapper `<div style={{...}}>` elements in `pm/page.tsx` converted to Tailwind classes
- [ ] Structural inline styles in `home-tab.tsx` greeting block converted to Tailwind where no dynamic token is used
- [ ] `pm/page.tsx` fetches `display_name` from `hub_users` client-side and passes it to `HomeTab`
- [ ] Greeting text is computed from current time-of-day on each render
- [ ] Greeting phrase is randomly selected from a pool per time-of-day bucket
- [ ] Greeting animates in on mount and fades out after ~3 minutes (tracked via `sessionStorage`)
- [ ] Clicking the greeting dismisses it immediately with the same fade animation
- [ ] Date line below the greeting remains dynamic (real current date, not hardcoded)
- [ ] No TypeScript errors, no lint errors

## Out of Scope / Must-Not-Change

- Do NOT touch any auth flow, signOut, or session logic
- Do NOT modify `hub-header.tsx` — it is unchanged in this task
- Do NOT convert theme-token-based colors (`C.text`, `C.sub`, `C.sky`, etc.) to Tailwind — these are runtime values
- Do NOT add new routes or modify `ROUTES` constants
- Do NOT touch `shared.tsx` component internals
- Do NOT change any DB schema or run migrations

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/components/hub/hub-sidebar.tsx` | Modify | Remove `Developer` and `Admin` navGroups |
| `src/app/(hub)/pm/page.tsx` | Modify | Fetch `display_name`, pass to `HomeTab`; convert wrapper inline styles to Tailwind |
| `src/components/hub/pm-tabs/home-tab.tsx` | Modify | Dynamic greeting with time-of-day + random variant + Framer Motion fade |

## Code Context

### hub-sidebar.tsx — current navGroups (post-task 012, with exact flag + sub-routes)

```tsx
interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  exact?: boolean;
}

const navGroups: { section: string; items: NavItem[] }[] = [
  {
    section: "Main",
    items: [
      { href: ROUTES.PM, label: "Home", icon: LayoutDashboard, exact: true },
      { href: `${ROUTES.PM}/customers`, label: "Clients", icon: Users },
      { href: `${ROUTES.PM}/tasks`, label: "Tasks", icon: ListChecks },
      { href: `${ROUTES.PM}/pipeline`, label: "Pipeline", icon: GitBranch },
      { href: ROUTES.ORCHESTRATION, label: "AI Chat", icon: MessageSquare },
    ],
  },
];
```

Sidebar also has `HubSidebarProps` with `userEmail`, `userRole`, `userDisplayName`, `userZohoId`, and a `collapsed` state for a minimize toggle. Active logic: `item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/")`.

### pm/page.tsx — wrapper div (current)

```tsx
// AFTER — theme-conditional Tailwind, no CSS var wrapper style={}
<div
  className={`flex-1 overflow-y-auto py-6.5 px-8 ${settings.theme === "dark" ? "bg-[#090c18]" : "bg-[#f5f4f1]"}`}
>
```

No `style={{ background: C.bg }}` — background is expressed directly as a conditional Tailwind arbitrary value.

### pm/page.tsx — add displayName fetch

Add after existing state declarations:

```tsx
const [displayName, setDisplayName] = useState<string | null>(null);

useEffect(() => {
  const supabase = createClient();
  supabase.auth.getUser().then(({ data }) => {
    if (!data.user) return;
    supabase
      .from("hub_users")
      .select("display_name")
      .eq("id", data.user.id)
      .single()
      .then(({ data: profile }) => {
        if (profile?.display_name) setDisplayName(profile.display_name);
      });
  });
}, []);
```

Pass to HomeTab (pm/page.tsx renders HomeTab directly — no tab routing):
```tsx
<HomeTab customers={customers} settings={settings} displayName={displayName} ... />
```

### home-tab.tsx — current hardcoded greeting (lines 53–55)

```tsx
// BEFORE (hardcoded, static)
<div style={{ marginBottom:22 }}>
  <div style={{ fontSize:22, fontWeight:700, color:C.text, letterSpacing:"-0.02em" }}>Good morning, Brandon ✦</div>
  <div style={{ fontSize:12, color:C.sub, marginTop:3 }}>Thursday, May 15 · 2026</div>
</div>
```

### home-tab.tsx — greeting logic to implement

```tsx
import { motion, AnimatePresence } from "framer-motion";

const TIME_GREETINGS: Record<string, string[]> = {
  morning:   ["Good morning", "Morning!", "Rise and shine", "Hey, good morning"],
  noon:      ["Good noon", "Hey there", "Happy lunch hour"],
  afternoon: ["Good afternoon", "Afternoon!", "Hey, good afternoon"],
  evening:   ["Good evening", "Evening!", "Hey, good evening"],
  night:     ["Still at it?", "Burning the midnight oil", "Working late"],
};

function getTimeBucket(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 13) return "noon";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}

function pickGreeting(bucket: string): string {
  const pool = TIME_GREETINGS[bucket] ?? TIME_GREETINGS.morning;
  return pool[Math.floor(Math.random() * pool.length)];
}

const FADE_DELAY_MS = 3 * 60 * 1000; // 3 minutes
const SESSION_KEY = "hub_greeting_ts";
```

**Fade logic in component:**

```tsx
const [greetingVisible, setGreetingVisible] = useState(true);
// greetingPhrase is null on SSR/first render to prevent hydration mismatch
const [greetingPhrase, setGreetingPhrase] = useState<string | null>(null);

useEffect(() => {
  // Deferred via setTimeout to avoid direct-setState-in-effect lint rule
  const phraseTimer = setTimeout(() => setGreetingPhrase(pickGreeting(getTimeBucket())), 0);

  const now = Date.now();
  const stored = sessionStorage.getItem(SESSION_KEY);
  const shownAt = stored ? parseInt(stored, 10) : now;
  if (!stored) sessionStorage.setItem(SESSION_KEY, String(now));
  const remaining = FADE_DELAY_MS - (now - shownAt);
  const fadeTimer = setTimeout(() => setGreetingVisible(false), remaining <= 0 ? 0 : remaining);

  return () => { clearTimeout(phraseTimer); clearTimeout(fadeTimer); };
}, []);

// greetingText is only truthy after client mount — greeting never shown during SSR
const greetingText = greetingPhrase ? `${greetingPhrase}, ${firstName} ✦` : null;
```

**firstName** derived from `displayName` prop:
```tsx
const firstName = displayName?.split(" ")[0] ?? "there";
```

**AnimatePresence wrapper:**
```tsx
<AnimatePresence>
  {greetingVisible && greetingText && (
    <motion.div
      className="mb-5.5 cursor-pointer select-none"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.35 }}
      onClick={() => setGreetingVisible(false)}
      title="Click to dismiss"
    >
      <div className="text-[22px] font-bold text-(--c-text) tracking-[-0.02em]">{greetingText}</div>
      <div className="text-xs text-(--c-sub) mt-0.75">{formatCurrentDate()}</div>
    </motion.div>
  )}
</AnimatePresence>
```

Note: `greetingText` is guarded (only truthy after client mount), so the outer `greetingVisible && greetingText &&` replaces `greetingVisible &&`. Inner divs use Tailwind v4 CSS var shorthand — no `style={{}}` for colors.

**formatCurrentDate helper** (inline in file — replaces hardcoded "Thursday, May 15 · 2026"):
```tsx
function formatCurrentDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).replace(",", " ·").replace(/(\w+ \w+), (\d+) · (\d+)/, "$1 $2 · $3");
  // Result example: "Thursday, May 15 · 2026"
}
```

Actually simpler format:
```tsx
function formatCurrentDate(): string {
  const d = new Date();
  const day = d.toLocaleDateString("en-US", { weekday: "long" });
  const month = d.toLocaleDateString("en-US", { month: "long" });
  const date = d.getDate();
  const year = d.getFullYear();
  return `${day}, ${month} ${date} · ${year}`;
}
```

## Implementation Steps

1. **`hub-sidebar.tsx`** — Delete the `Developer` and `Admin` objects from `navGroups` array. Remove all lucide icon imports that are only used by those groups: `Layout`, `Clock`, `BookOpen`, `BarChart2`, `Settings`.

2. **`pm/page.tsx`** — Add `displayName` state + `useEffect` to fetch from `hub_users`. Convert the two wrapper `<div style={{...}}>` elements to Tailwind classes (keeping `C.bg` as inline style on the inner div). Pass `displayName` prop to `HomeTab`.

3. **`home-tab.tsx`** — Add `displayName?: string | null` to `HomeTabProps`. Add greeting logic: `TIME_GREETINGS`, `getTimeBucket()`, `pickGreeting()`, `formatCurrentDate()`. Add `greetingVisible` state + `useEffect` for 3-minute auto-fade using `sessionStorage`. Import `motion` and `AnimatePresence` from `framer-motion`. Replace hardcoded greeting block with `AnimatePresence` + `motion.div` that fades in on mount, fades out after timeout or on click.

## Acceptance Criteria

- [ ] Sidebar shows only the `Main` section (Home, Clients, Tasks, Pipeline, AI Chat) — no Developer or Admin groups
- [ ] `pm/page.tsx` wrapper divs use Tailwind classes (no layout-only `style` props on those two divs)
- [ ] Visiting `/pm?tab=home` shows a personalized greeting using the DB display name
- [ ] Greeting text varies with time of day (Morning before noon, Noon at 12, Afternoon 1-5pm, Evening 6-9pm, Night after 9pm)
- [ ] Greeting is randomized — refreshing the page within the same session shows the same greeting (sessionStorage); a new session can show a different one
- [ ] Greeting fades out ~3 minutes after it first appeared in the session
- [ ] Clicking the greeting immediately dismisses it with a fade animation
- [ ] Date line is real current date (not hardcoded "May 15")
- [ ] No TypeScript errors (`npx tsc --noEmit` passes)
- [ ] No lint errors (`pnpm lint` passes)

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual checks:
- Sign in → visit `/pm` → confirm greeting shows correct first name
- Change system clock or test manually at different hours to verify time bucket
- Wait 3 minutes (or reduce `FADE_DELAY_MS` to 10s for testing) to verify auto-fade
- Click greeting → confirm immediate fade dismiss
- Refresh → greeting resets (new session) or remains dismissed (same session)
- Sidebar: confirm no Developer or Admin nav groups

## Compatibility Touchpoints

- No new dependencies — `framer-motion` is already installed
- No DB schema changes — `hub_users.display_name` already exists
- No env var changes
- `hub-header.tsx` and `hub-layout.tsx` are unaffected
