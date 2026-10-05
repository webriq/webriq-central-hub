import type { Check } from "./_harness";
import { checks as calendar } from "./calendar.check";
import { checks as layout } from "./layout.check";
import { checks as health } from "./health.check";
import { checks as genericTimeline } from "./generic-timeline.check";
import { checks as backfill } from "./backfill.check";
import { checks as programme } from "./programme.check";
import { checks as viewModel } from "./view-model.check";

// `pnpm check:logic` — pure-logic checks for the Timeline/programme math (task 425). Exits non-zero on any failure.
const suites: [string, Check[]][] = [
  ["calendar", calendar], ["layout", layout], ["health", health], ["generic-timeline", genericTimeline], ["backfill", backfill], ["programme", programme], ["view-model", viewModel],
];

let failed = 0;
let total = 0;
for (const [suite, checks] of suites) {
  for (const [name, run] of checks) {
    total++;
    try {
      run();
      console.log(`  ok   ${suite}: ${name}`);
    } catch (err) {
      failed++;
      console.log(`  FAIL ${suite}: ${name}\n       ${(err as Error).message.split("\n").join("\n       ")}`);
    }
  }
}
console.log(failed ? `\n${failed} of ${total} checks failed` : `\nall ${total} checks passed`);
process.exit(failed ? 1 : 0);
