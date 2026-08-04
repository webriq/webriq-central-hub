# Recommended File Length Best Practices (Next.js / JavaScript)

There's no universal hard number mandated by any official standard, but there are widely-cited conventions and rules of thumb across the JS/TS/Next.js ecosystem.

## General Guidelines by File Type

| File type | Recommended lines | Notes |
|---|---|---|
| React component (.tsx/.jsx) | 100–250 | Beyond this, split into subcomponents |
| Utility/helper function file | 50–150 | One concern per file |
| Custom hook | 30–100 | If it's doing more, it's probably 2+ hooks |
| API route handler (Next.js) | 50–150 | Extract business logic to `/lib` or `/services` |
| Context/store file | 100–200 | Split state slices if larger |
| Config files | No real limit | Data, not logic |
| Test files | Often longer (200–400+) is fine | Readability matters more than line count here |

There's no enforced ceiling — these are soft signals, not rules. Linters like ESLint do have a `max-lines` rule (commonly configured around **300–400 lines per file**, and **50–75 lines per function**) that many teams enable as a guardrail rather than a target.

## Why These Ranges, Not Just "Keep It Short"

**Readability** — Once a file exceeds ~300 lines, most people lose the ability to hold its full context in working memory while scrolling. You start relying on search instead of understanding.

**Testability** — Files that do one thing are easier to unit test in isolation. If a file needs 15+ mocks to test, that's usually a sign it has too many responsibilities, not that testing is hard.

**Performance (Next.js-specific)** — This one's more nuanced. Line count itself doesn't hurt runtime performance, but bloated files often correlate with:
- Poor code-splitting (large client components that could be split with `dynamic()`)
- Bundling unrelated logic together, so a small change invalidates a large chunk
- Harder tree-shaking if a file mixes concerns (e.g., exporting both a server util and a client hook)

## More Useful Heuristics Than a Line Count

1. **Single Responsibility Principle** — if you can't summarize a file's purpose in one sentence, split it.
2. **The "scroll test"** — if you can't see the shape of the whole file without scrolling more than 2–3 times, consider splitting.
3. **Cyclomatic complexity over line count** — a 400-line file of simple JSX markup is often fine; a 150-line file with deeply nested conditionals is not.
4. **Colocation in Next.js (App Router)** — Next.js actively encourages splitting by route/feature (`page.tsx`, `layout.tsx`, `loading.tsx`, colocated `components/`, `actions.ts`) rather than one big file per route. This naturally keeps files small without enforcing a number.
5. **Barrel files** — many teams split large "kitchen sink" utility files into smaller domain-specific files re-exported through an `index.ts`.

## A Reasonable Rule of Thumb to Adopt

If you want something concrete for a linting rule or team convention:
- **Soft warning at 250–300 lines**
- **Hard limit at 400–500 lines** (enforced via ESLint `max-lines`)
- **Functions/components: warn at 50–75 lines**

These numbers are common in production codebases (Vercel's own examples, Airbnb style guide conventions adapted for JS, and most enterprise ESLint configs), but they're conventions born from experience, not a spec.

## The Real Test

Does splitting this file make it easier to understand, test, and change independently?
- If yes → split it, regardless of line count.
- If no → don't split it just to hit a number.
