// Task 464 — assertions for the Zoho Documents import's pure logic (no test runner in this repo).
// Run: npx tsx _docs/task/464-zoho-documents-import.check.ts
import assert from "node:assert/strict";
import {
  assignLocalPaths, buildProjectTrees, classifyFile, matchHubProject, mimeForExt, resolveFolderName,
  type DocItem, type HubProjectRow,
} from "../../src/lib/migrate/zoho-documents-tree";

// ── tree ──────────────────────────────────────────────────────────────────────
const item = (o: Partial<DocItem> & Pick<DocItem, "id" | "name" | "parentId">): DocItem => ({
  extn: "", isFolder: false, rootName: "", projectId: "P1", declaredBytes: 0, createdMs: null, ...o,
});
const items: DocItem[] = [
  // file listed BEFORE its folders on purpose: order in the export must not matter
  item({ id: "f3", name: "deep.png", extn: "png", parentId: "F2", rootName: "Acme-Documents" }),
  item({ id: "F2", name: "Deep", isFolder: true, parentId: "F1", rootName: "Acme-Documents" }),
  item({ id: "F1", name: "Sub & Co", isFolder: true, parentId: "R1", rootName: "Acme-Documents" }),
  item({ id: "f1", name: "top.pdf", extn: "pdf", parentId: "R1", rootName: "Acme-Documents" }),
  item({ id: "f2", name: "mid.pdf", extn: "pdf", parentId: "F1", rootName: "Acme-Documents" }),
  item({ id: "f4", name: "att.jpg", extn: "jpg", parentId: "R2", rootName: "Acme-Attachments" }),
  // a cycle no root reaches
  item({ id: "X", name: "X", isFolder: true, parentId: "Y", rootName: "Acme-Documents" }),
  item({ id: "Y", name: "Y", isFolder: true, parentId: "X", rootName: "Acme-Documents" }),
  item({ id: "o1", name: "other-project.pdf", extn: "pdf", parentId: "R9", rootName: "Other-Documents", projectId: "P2" }),
];
const trees = buildProjectTrees(items);
assert.deepEqual([...trees.keys()].sort(), ["P1", "P2"]);
const t = trees.get("P1")!;
assert.deepEqual(t.folders.filter((f) => f.parentId === null).map((f) => [f.id, f.name]), [["R1", "Acme-Documents"], ["R2", "Acme-Attachments"]]);
const order = t.folders.map((f) => f.id);
assert.ok(order.indexOf("R1") < order.indexOf("F1") && order.indexOf("F1") < order.indexOf("F2"), "parent before child");
assert.deepEqual(t.folders.find((f) => f.id === "F2")!.path, ["Acme-Documents", "Sub & Co", "Deep"], "exact names, root to leaf");
assert.deepEqual(t.files.map((f) => f.id).sort(), ["f1", "f2", "f3", "f4"]);
assert.deepEqual(t.files.find((f) => f.id === "f3")!.path, ["Acme-Documents", "Sub & Co", "Deep"]);
assert.deepEqual(t.unreachable.sort(), ["X", "Y"]);
assert.equal(trees.get("P2")!.files.length, 1);

// ── folder name conflicts ─────────────────────────────────────────────────────
const taken = (...n: string[]) => new Set(n.map((x) => x.toLowerCase()));
assert.equal(resolveFolderName(taken("Other", "Business Files"), "Acme-Documents"), "Acme-Documents");
assert.equal(resolveFolderName(taken("Acme-Documents"), "Acme-Documents"), "Acme-Documents (From Zoho)");
assert.equal(resolveFolderName(taken("acme-documents"), "Acme-Documents"), "Acme-Documents (From Zoho)", "case-insensitive");
assert.equal(resolveFolderName(taken("Branding", "Branding (From Zoho)"), "Branding"), "Branding (From Zoho 2)");
assert.equal(resolveFolderName(taken("A", "A (From Zoho)", "A (From Zoho 2)"), "A"), "A (From Zoho 3)");

// ── classification ────────────────────────────────────────────────────────────
const AI = mimeForExt("ai")!;
assert.ok(AI, "design types resolve through the shared extension resolver");
const allowed = [mimeForExt("png")!, mimeForExt("pdf")!, mimeForExt("docx")!, mimeForExt("pptx")!, AI];
const cls = (name: string, extn: string, declaredBytes = 10) => classifyFile({ name, extn, declaredBytes }, allowed, 200);
assert.deepEqual(cls("a.png", "png"), { kind: "import", mime: "image/png" });
assert.deepEqual(cls("a.PNG", "PNG"), { kind: "import", mime: "image/png" }, "extension case");
assert.deepEqual(cls("deck.pptx", "pptx"), { kind: "import", mime: mimeForExt("pptx")! });
assert.deepEqual(cls("logo.ai", "ai"), { kind: "import", mime: AI });
assert.deepEqual(cls("clip.webm", "webm"), { kind: "unsupported-type" });
assert.deepEqual(cls("photo.heic", "heic"), { kind: "unsupported-type" });
assert.deepEqual(cls("sheet.xlsx", "xlsx"), { kind: "unsupported-type" }, "known MIME but not in the allowlist passed in");
assert.deepEqual(cls("big.png", "png", 201), { kind: "too-large" });
assert.deepEqual(cls("Doc", "zwriter", 0), { kind: "native", exportExt: "docx" });
assert.deepEqual(cls("Sheet", "zsheet", 0), { kind: "native", exportExt: "xlsx" });
assert.deepEqual(cls("Slides", "zslides", 0), { kind: "native", exportExt: "pptx" });
assert.deepEqual(cls("noext", ""), { kind: "unsupported-type" });
assert.deepEqual(cls("constructor", "constructor"), { kind: "unsupported-type" }, "own-property lookups only");
assert.deepEqual(cls("zero.png", "png", 0), { kind: "import", mime: "image/png" }, "declared 0 bytes is not a reason to skip");

// ── local paths ───────────────────────────────────────────────────────────────
const file = (id: string, name: string, extn: string, path: string[]) => ({ id, name, extn, folderId: "x", path, declaredBytes: 0, createdMs: null });
const lp = assignLocalPaths("Acme (123)", [
  file("aaaaaa111111", "Photo.png", "png", ["Acme-Documents", "Sub"]),
  file("bbbbbb222222", "photo.PNG", "png", ["Acme-Documents", "Sub"]), // same name, case-insensitive
  file("cccccc333333", "QA/QC - Plan", "zslides", ["Acme-Documents"]), // slash + native
  file("dddddd444444", "README", "", ["Acme-Documents"]),
  file("eeeeee555555", "README", "", ["Acme-Documents"]),
]);
assert.equal(lp.get("aaaaaa111111"), "Acme (123)/Acme-Documents/Sub/Photo.png");
assert.equal(lp.get("bbbbbb222222"), "Acme (123)/Acme-Documents/Sub/photo (222222).PNG");
assert.equal(lp.get("cccccc333333"), "Acme (123)/Acme-Documents/QA_QC - Plan.pptx");
assert.equal(lp.get("eeeeee555555"), "Acme (123)/Acme-Documents/README (555555)", "no extension → suffix at the end");
assert.deepEqual([...assignLocalPaths("p", [file("a1", "x.png", "png", [".."])]).values()], ["p/_/x.png"], "'..' can't escape");
assert.deepEqual([...assignLocalPaths("Acme (123)", [file("aaaaaa111111", "Photo.png", "png", ["Acme-Documents", "Sub"])]).values()], ["Acme (123)/Acme-Documents/Sub/Photo.png"], "deterministic");

// ── Zoho project → Hub project ────────────────────────────────────────────────
const hub = (id: string, customer_id: string, name: string, ext: string | null): HubProjectRow => ({ id, customer_id, name, external_project_id: ext });
const projects = [
  hub("L", "C1", "Acme Site", "Z1"),
  hub("V", "C1", "Acme Shop", null),
  hub("V2a", "C2", "Twin", null), hub("V2b", "C2", "twin ", null),
  hub("D1", "C3", "Dup", "Z9"), hub("D2", "C3", "Dup", "Z9"),
];
const m = (zid: string, zname: string, cust: string | null) => matchHubProject(zid, zname, cust, projects);
let r = m("Z1", "whatever", "C1");
assert.ok(r.ok && r.project.id === "L" && r.matchedBy === "external_project_id", "Legacy by external_project_id");
r = m("Zx", "acme shop", "C1");
assert.ok(r.ok && r.project.id === "V" && r.matchedBy === "customer+name", "falls back to v2 by customer + name");
r = m("Z1", "Acme Shop", "C1");
assert.ok(r.ok && r.project.id === "L", "Legacy wins over a v2 name match");
assert.ok(!m("Zx", "Twin", "C2").ok, "two v2 candidates → no match");
assert.ok(!m("Zx", "Nope", "C1").ok, "no candidate → no match");
assert.ok(!m("Zx", "Acme Shop", null).ok, "no customer → no match");
assert.ok(!m("Z9", "Dup", "C3").ok, "two Legacy rows share the id → no match");
assert.ok(!m("Zx", "Acme Site", "C1").ok, "a Legacy project (external id set) is never a v2 candidate");

console.log("464 checks passed");
