// Task 504 — pure checks for the FlowForge rename helpers. Run: npx tsx _docs/task/504-flowforge-classification.check.ts
import assert from "node:assert/strict";
import {
  CLASSIFICATIONS,
  findClassification,
  legacyClassificationValues,
  normalizeClassification,
  normalizeClassifications,
  deriveProjectSuffixMulti,
  deriveProjectTypeMulti,
} from "../../src/config/customer-phases";
import {
  parseClassificationTab,
  tabIdForClassification,
  classificationForTab,
  CLASSIFICATION_TABS,
} from "../../src/app/(hub)/projects/_classification-tabs";
import { isClassificationCheckViolation, withClassificationFallback } from "../../src/lib/projects/classification-write";
import { mapServicesToClassifications } from "../../src/lib/stackshift-orders/service-map";

async function main() {
  // Catalog
  assert.equal(CLASSIFICATIONS[CLASSIFICATIONS.length - 1], "FlowForge", "FlowForge replaces Discrete Development in place (last)");
  assert.ok(!(CLASSIFICATIONS as readonly string[]).includes("Discrete Development"));
  assert.equal(deriveProjectSuffixMulti(["FlowForge"]), "App");
  assert.equal(deriveProjectTypeMulti(["FlowForge"]), "Custom App");

  // Normalize
  assert.equal(normalizeClassification("Discrete Development"), "FlowForge");
  assert.equal(normalizeClassification("StackShift I"), "StackShift I");
  assert.equal(normalizeClassification(null), null);
  assert.equal(normalizeClassification(undefined), null);
  assert.deepEqual(normalizeClassifications(["StackShift I", "Discrete Development", "FlowForge"]), ["StackShift I", "FlowForge"]);
  assert.deepEqual(normalizeClassifications(null), []);
  assert.deepEqual(legacyClassificationValues("FlowForge"), ["Discrete Development"]);
  assert.deepEqual(legacyClassificationValues("StackShift I"), []);

  // CSV import lookup
  assert.equal(findClassification("flowforge"), "FlowForge");
  assert.equal(findClassification(" Discrete Development "), "FlowForge");
  assert.equal(findClassification("discrete development"), "FlowForge");
  assert.equal(findClassification("stackshift ii"), "StackShift II");
  assert.equal(findClassification("Discrete"), null);

  // Tabs
  assert.equal(CLASSIFICATION_TABS[CLASSIFICATION_TABS.length - 1].id, "flowforge");
  assert.equal(classificationForTab("flowforge"), "FlowForge");
  assert.equal(parseClassificationTab("discrete-development"), "flowforge", "stale ?tab= resolves");
  assert.equal(parseClassificationTab("nope"), "stackshift-i");
  assert.equal(tabIdForClassification("Discrete Development"), "flowforge", "legacy stored value resolves");
  assert.equal(tabIdForClassification("FlowForge"), "flowforge");
  assert.equal(tabIdForClassification("Unknown"), null);

  // Order service map
  assert.deepEqual(mapServicesToClassifications(["FlowForge"]).classifications, ["FlowForge"]);

  // Fallback trigger
  const pgMsg = 'new row for relation "customer_products" violates check constraint "customer_products_classification_check"';
  assert.ok(isClassificationCheckViolation({ code: "23514", message: pgMsg }));
  assert.ok(!isClassificationCheckViolation({ code: "23514", message: 'violates check constraint "customer_products_product_name_check"' }));
  assert.ok(!isClassificationCheckViolation({ code: "23505", message: pgMsg }));
  assert.ok(!isClassificationCheckViolation(null));

  // Fallback behaviour
  const calls: string[] = [];
  const preMigration = (v: string) => {
    calls.push(v);
    return Promise.resolve(v === "FlowForge" ? { error: { code: "23514", message: pgMsg } } : { error: null, data: v });
  };
  const r1 = await withClassificationFallback("FlowForge", preMigration);
  assert.deepEqual(calls, ["FlowForge", "Discrete Development"], "retries once with the legacy value");
  assert.equal(r1.error, null);

  calls.length = 0;
  await withClassificationFallback("StackShift I", preMigration);
  assert.deepEqual(calls, ["StackShift I"], "no retry when the first write succeeds");

  calls.length = 0;
  const otherError = (v: string) => { calls.push(v); return Promise.resolve({ error: { code: "23505", message: "dup" } }); };
  const r3 = await withClassificationFallback("FlowForge", otherError);
  assert.deepEqual(calls, ["FlowForge"], "no retry on an unrelated error");
  assert.equal(r3.error?.code, "23505");

  calls.length = 0;
  const alwaysCheck = (v: string) => { calls.push(v); return Promise.resolve({ error: { code: "23514", message: pgMsg } }); };
  await withClassificationFallback("PipelineForge", alwaysCheck);
  assert.deepEqual(calls, ["PipelineForge"], "no retry for a value with no legacy alias");

  console.log("504 classification checks: PASS");
}

main().catch((err) => { console.error(err); process.exit(1); });
