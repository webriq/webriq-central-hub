/**
 * One-off fix: manually import the Issue Attachments that the automated
 * `issue-attachments` importer correctly skipped as "ambiguous" — identical
 * name AND identical size, attached to more than one issue, so metadata alone
 * can't tell them apart (task 114). Each duplicate's real issue was resolved
 * by hand by cross-referencing the export data with the user in chat.
 *
 * Since the file content is byte-identical within each group, one local file
 * (any "(N)" copy — doesn't matter which) is read once per group and uploaded
 * once per issue that record actually belongs to.
 *
 * Usage: npx tsx scripts/import-ambiguous-issue-attachments.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, extname } from "path";
import { homedir } from "os";
import type { Database } from "../src/types/database";

// @supabase/supabase-js unconditionally constructs a RealtimeClient, which requires a
// WebSocket global on Node < 22. This script never opens a realtime channel — a stub
// is enough to pass the constructor's environment check without ever being invoked.
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = class {};
}

// ── env (mirrors scripts/test-connections.ts) ───────────────────────────────
for (const file of [".env.local", ".env"]) {
  const p = resolve(__dirname, "..", file);
  if (!existsSync(p)) continue;
  const content = readFileSync(p, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (.env.local or .env)");
  process.exit(1);
}
const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── the 6 known-ambiguous group names (task 114 live run, 2026-07-08) ───────
const TARGET_NAMES = [
  "2026 ADCC Catalogue Web.pdf",
  "IMG_6297.jpeg",
  "IMG_6530.jpeg",
  "IMG_6741.jpeg",
  "line-card-electrical-linked.pdf",
  "Trimexoutdoor.com Website Update 2026 -Drafting.docx",
];

const LOCAL_DIRS = [
  resolve(homedir(), "Downloads/zoho-issue-attachments-1"),
  resolve(homedir(), "Downloads/zoho-issue-attachments-2"),
];

const ZOHO_DIR = resolve(__dirname, "..", "_from_zoho");

type ZohoIssueAttachmentRaw = {
  third_party_file_id?: string;
  name?: string;
  size?: string;
  download_url?: string;
  _zoho_issue_id?: string;
};

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function stripDedupSuffix(filename: string): string {
  const idx = filename.lastIndexOf(".");
  const base = idx > 0 ? filename.slice(0, idx) : filename;
  const ext = idx > 0 ? filename.slice(idx) : "";
  return base.replace(/ \(\d+\)$/, "") + ext;
}

function findLocalFile(targetName: string): string | null {
  for (const dir of LOCAL_DIRS) {
    if (!existsSync(dir)) continue;
    const match = readdirSync(dir).find((f) => stripDedupSuffix(f) === targetName);
    if (match) return resolve(dir, match);
  }
  return null;
}

async function main() {
  // Load all issue-attachment-meta-*.json batches
  const attachments: ZohoIssueAttachmentRaw[] = [];
  const batchFiles = readdirSync(ZOHO_DIR).filter((f) => f.startsWith("issue-attachment-meta-") && f.endsWith(".json"));
  for (const f of batchFiles) {
    const parsed = JSON.parse(readFileSync(resolve(ZOHO_DIR, f), "utf-8"));
    if (Array.isArray(parsed)) attachments.push(...(parsed as ZohoIssueAttachmentRaw[]));
  }

  let imported = 0;
  let errored = 0;

  for (const targetName of TARGET_NAMES) {
    const localPath = findLocalFile(targetName);
    if (!localPath) {
      console.error(`✗ ${targetName}: no local file found in ${LOCAL_DIRS.join(" or ")}`);
      errored++;
      continue;
    }

    const fileBuffer = readFileSync(localPath);
    const ext = extname(targetName).toLowerCase();
    const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";

    const records = attachments.filter((a) => a.name === targetName);
    console.log(`\n${targetName} — ${records.length} record(s), reading bytes from ${localPath}`);

    for (const att of records) {
      const externalId = String(att.third_party_file_id ?? "");
      const zohoIssueId = String(att._zoho_issue_id ?? "");
      if (!externalId || !zohoIssueId) {
        console.error(`  ✗ record missing third_party_file_id or _zoho_issue_id: ${JSON.stringify(att)}`);
        errored++;
        continue;
      }

      const { data: issueRow, error: issueErr } = await supabase
        .from("issues")
        .select("id")
        .eq("external_id", zohoIssueId)
        .maybeSingle();
      if (issueErr || !issueRow) {
        console.error(`  ✗ ${externalId}: could not resolve issue ${zohoIssueId} (${issueErr?.message ?? "not found"})`);
        errored++;
        continue;
      }

      const safeName = `zoho/issues/${zohoIssueId}/${externalId}_${targetName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: uploadError } = await supabase.storage
        .from("project-assets")
        .upload(safeName, fileBuffer, { upsert: true, contentType });
      if (uploadError) {
        console.error(`  ✗ ${externalId}: storage upload failed: ${uploadError.message}`);
        errored++;
        continue;
      }

      const { error: upsertError } = await supabase.from("attachments").upsert(
        {
          external_id: externalId,
          entity_type: "issue",
          entity_id: issueRow.id,
          storage_path: safeName,
          filename: targetName,
          size: att.size ? parseInt(att.size, 10) : fileBuffer.length,
          source_url: att.download_url ?? null,
        },
        { onConflict: "external_id" }
      );
      if (upsertError) {
        console.error(`  ✗ ${externalId}: attachments upsert failed: ${upsertError.message}`);
        errored++;
        continue;
      }

      console.log(`  ✓ ${externalId} → issue ${zohoIssueId}`);
      imported++;
    }
  }

  console.log(`\nDone. Imported: ${imported}, Errors: ${errored}`);
  if (errored > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
