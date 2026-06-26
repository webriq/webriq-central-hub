# Task 082 — Projects Grid Card: Rotating Conic Gradient Border on Hover

> **Type:** patch
> **Priority:** NORMAL
> **Recommended Model:** haiku
> **Automation:** manual
> **Status:** TESTING
> **Completed:** 2026-06-26
> **Implementation Notes:** Import is `framer-motion` (not `motion/react` — that package isn't installed; project uses framer-motion ^12.38.0). GridCardWrapper defined at module level per rerender-no-inline-components. useTransform callback has explicit `number` type annotation to satisfy strict TS.

## Goal

Add a playful rotating conic-gradient border effect to each project card in Grid View. On hover, a rainbow-ish spinning gradient replaces the default slate-200 border. Off hover, the card reverts to its normal appearance. List View is unchanged.

`framer-motion` (`^12.38.0`) is already installed — import from `"motion/react"`. No new dependency needed.

## Implementation Steps

1. **Add imports** to `_projects-index.tsx`:
   ```ts
   import { motion, useMotionValue, useTransform, animate } from "motion/react";
   import { useState, useEffect } from "react";  // useEffect already in scope, add if not
   ```

2. **Add `GridCardWrapper` component** (inline in `_projects-index.tsx`, below `GridView`):
   - Accepts `children: React.ReactNode`
   - Uses `useState(false)` for `hovered`
   - Uses `useMotionValue(0)` for `angle`
   - On `hovered` → `animate(angle, 360, { duration: 3, ease: "linear", repeat: Infinity })`; on unhover → stop + reset angle to 0
   - Uses `useTransform(angle, (a) => hovered ? \`conic-gradient(from ${a}deg, #6366f1, #8b5cf6, #ec4899, #f43f5e, #fb923c, #fbbf24, #6366f1)\` : "#e2e8f0")` for the border background
   - Structure:
     ```
     <div relative rounded-xl p-[2px] onMouseEnter/Leave shadow transition-shadow>
       <motion.div absolute inset-0 rounded-xl style={{ background: borderGradient }} />
       <div relative z-10 rounded-[10px] bg-white block>
         {children}
       </div>
     </div>
     ```
   - Outer wrapper carries the shadow (`shadow-[0_1px_3px_rgba(0,0,0,0.05)]`) and `hover:shadow-md transition-shadow`

3. **Modify `GridView`**: wrap each `<Link>` in `<GridCardWrapper>`. Update the `<Link>` className:
   - Remove: `border border-slate-200`, `shadow-[0_1px_3px_rgba(0,0,0,0.05)]`, `hover:border-slate-300`, `hover:shadow-md`
   - Remove `rounded-xl` → the wrapper owns the outer radius; the Link's container div inside wrapper is `rounded-[10px]`
   - Keep: `p-5 flex flex-col gap-3 group transition-colors block w-full h-full`
   - The inner `<div relative z-10 rounded-[10px] bg-white>` wraps the Link and provides the white card face

## File Changes

| File | Change |
|------|--------|
| `src/app/v2/(hub)/projects/_projects-index.tsx` | Add `GridCardWrapper` component; modify `GridView` to use it; update Link className |

## Code Context

### Current grid card Link (lines 319–389)

```tsx
<Link
  key={p.id}
  href={`${V2_ROUTES.PROJECTS}/${p.id}`}
  className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-5 hover:border-slate-300 hover:shadow-md transition-all flex flex-col gap-3 group"
>
  {/* ... card content ... */}
</Link>
```

### New GridCardWrapper structure

```tsx
function GridCardWrapper({ children }: { children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  const angle = useMotionValue(0);

  useEffect(() => {
    if (!hovered) {
      angle.set(0);
      return;
    }
    const controls = animate(angle, 360, {
      duration: 3,
      ease: "linear",
      repeat: Infinity,
    });
    return controls.stop;
  }, [hovered, angle]);

  const borderBg = useTransform(
    angle,
    (a) =>
      hovered
        ? `conic-gradient(from ${a}deg, #6366f1, #8b5cf6, #ec4899, #f43f5e, #fb923c, #fbbf24, #6366f1)`
        : "#e2e8f0"
  );

  return (
    <div
      className="relative rounded-xl p-[2px] shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md transition-shadow"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.div className="absolute inset-0 rounded-xl" style={{ background: borderBg }} />
      <div className="relative z-10 rounded-[10px] bg-white">
        {children}
      </div>
    </div>
  );
}
```

### Updated Link inside GridView

```tsx
<GridCardWrapper key={p.id}>
  <Link
    href={`${V2_ROUTES.PROJECTS}/${p.id}`}
    className="block p-5 flex flex-col gap-3 group transition-colors rounded-[10px] bg-white"
  >
    {/* card content unchanged */}
  </Link>
</GridCardWrapper>
```

> Note: `key` moves from `<Link>` to `<GridCardWrapper>` since it becomes the outermost element in the map.

## Notes for Implementation Agent

- `framer-motion@^12.38.0` ships `"motion/react"` as the primary React import path. Use `import { motion, useMotionValue, useTransform, animate } from "motion/react"` — do not use `"framer-motion"` directly.
- `useEffect` is already imported in this file (`_projects-index.tsx:3`). No new import needed.
- The conic gradient angle animates from 0→360 in a loop; `hovered ? gradient : "#e2e8f0"` produces the flat border when idle. The `useTransform` callback re-evaluates on every `angle` tick, so closing over `hovered` is fine since it only changes on mouse events.
- Do NOT add `overflow-hidden` to the outer wrapper — it would clip the box shadow. The inner `div` with `rounded-[10px]` clips the card face against the 2px gradient border naturally.
- List View (`ListView`) is **not touched** — this change is Grid View only.
- The `title` text hover-color (`group-hover:text-blue-600`) on the card title stays; `group` class on the Link still works since `group` scopes to the nearest parent with the class.
