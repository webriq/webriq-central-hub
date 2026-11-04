// Task 466 — pure-logic checks for comment @mention notifications.
// Run: npx tsx _docs/task/466-comment-mentions.check.ts
import assert from "node:assert/strict";
import {
  MAX_MENTION_RECIPIENTS,
  buildMentionNotification,
  extractMentionIds,
  resolveMentionRecipients,
} from "../../src/lib/comments/mentions";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";
const mention = (id: string, label = "X") =>
  `<span data-type="mention" class="mention" data-id="${id}" data-label="${label}">@${label}</span>`;

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

check("two mentions → two ids in order", () => {
  assert.deepEqual(extractMentionIds(`<p>Hi ${mention(A)} and ${mention(B)}</p>`), [A, B]);
});

check("reordered attributes still parse", () => {
  const html = `<p><span data-label="Ann" data-id="${A}" class="mention" data-type="mention">@Ann</span></p>`;
  assert.deepEqual(extractMentionIds(html), [A]);
});

check("data-id on a non-mention span is ignored", () => {
  assert.deepEqual(extractMentionIds(`<p><span data-id="${A}">x</span></p>`), []);
});

check("non-UUID ids are ignored", () => {
  assert.deepEqual(extractMentionIds(mention("not-a-uuid") + mention("")), []);
});

check("no mention → []", () => {
  assert.deepEqual(extractMentionIds("<p>Hello @Mark, plain text only</p>"), []);
  assert.deepEqual(extractMentionIds(""), []);
});

check("duplicate mentions dedupe (case-insensitive)", () => {
  assert.deepEqual(extractMentionIds(mention(A) + mention(A.toUpperCase())), [A]);
});

check("actor dropped, ids outside the allow-list dropped", () => {
  const allowed = new Set([A, ACTOR]);
  assert.deepEqual(resolveMentionRecipients({ ids: [ACTOR, A, B], actorId: ACTOR, allowedIds: allowed }), [A]);
});

check(`more than ${MAX_MENTION_RECIPIENTS} ids are capped`, () => {
  const ids = Array.from({ length: 25 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const out = resolveMentionRecipients({ ids, actorId: ACTOR, allowedIds: new Set(ids) });
  assert.equal(out.length, MAX_MENTION_RECIPIENTS);
  assert.deepEqual(out, ids.slice(0, MAX_MENTION_RECIPIENTS));
});

check("task notification: body + url", () => {
  const n = buildMentionNotification({ kind: "task", actorName: "Mark", displayId: "T-42", title: "Fix nav", projectDisplayId: "P-7" });
  assert.equal(n.type, "task_comment_mention");
  assert.equal(n.title, "Mentioned in a comment");
  assert.equal(n.body, 'Mark mentioned you in a comment on T-42 "Fix nav"');
  assert.equal(n.url, "/projects/v2/P-7/tasks/T-42");
});

check("ticket notification: url uses /tickets/", () => {
  const n = buildMentionNotification({ kind: "ticket", actorName: "Mark", displayId: "TK-9", title: "Login", projectDisplayId: "P-7" });
  assert.equal(n.type, "ticket_comment_mention");
  assert.equal(n.url, "/projects/v2/P-7/tickets/TK-9");
});

check("null display_id → no url; missing actor → fallback name", () => {
  const n = buildMentionNotification({ kind: "task", actorName: null, displayId: null, title: "Fix nav", projectDisplayId: "P-7" });
  assert.equal(n.url, undefined);
  assert.equal(n.body, 'A teammate mentioned you in a comment on "Fix nav"');
  assert.equal(buildMentionNotification({ kind: "task", actorName: "M", displayId: "T-1", title: null, projectDisplayId: null }).url, undefined);
});

console.log(`\n${passed} checks passed`);
