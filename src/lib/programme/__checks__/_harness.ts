import assert from "node:assert/strict";

export type Check = [name: string, run: () => void];

// Minimal pure-logic harness (task 425) — `pnpm check:logic`. No test framework: each *.check.ts
// exports `checks: Check[]`, run.ts executes them all and exits non-zero on any failure.
export { assert };
