/**
 * One-off fixes for the second Issue Attachments batch (task 114 live run,
 * ~/Downloads/zoho-issue-attachments-2/):
 *
 * 1. 14 duplicate-name groups (28 records) the automated importer correctly skipped as
 *    "ambiguous" — same class as scripts/import-ambiguous-issue-attachments.ts, resolved
 *    the same way: one local file's bytes uploaded once per underlying issue record.
 *    NOTE unlike that script, this one does NOT blindly trust "same name = same bytes" —
 *    it checks every record's size within a name group and only groups records whose
 *    sizes actually match before reusing one file's bytes (this is what corrupted
 *    line-card-electrical-linked.pdf's unique-size record last time).
 *
 * 2. "Obsolete items.xlsx" — a single, non-ambiguous record whose Zoho export metadata
 *    claims size 42544, but the real downloaded file is 4690 bytes (confirmed valid
 *    .xlsx via file signature — Zoho's own metadata size field is simply stale for this
 *    one record, same class of issue task 106 already flagged: "don't trust size/
 *    extension fields blindly"). The automated importer's (name, size) matching can
 *    never find this one because the real size doesn't match what metadata claims, so
 *    it's inserted directly here instead.
 *
 * Usage: npx tsx scripts/import-batch2-fixes.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, extname } from "path";
import { homedir } from "os";
import type { Database } from "../src/types/database";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = class {};
}

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

// The import route always loads BOTH issue-attachment-meta-*.json files regardless of
// which folder's files are being uploaded, so a name can have records satisfied by
// files in either destination folder (confirmed live: one "image002.png" record,
// Jamplast Distribution at 153392 bytes, was already correctly imported during the
// batch 1 run — its physical file lives in zoho-issue-attachments-1/, not -2/).
const LOCAL_DIRS = [
  resolve(homedir(), "Downloads/zoho-issue-attachments-2"),
  resolve(homedir(), "Downloads/zoho-issue-attachments-1"),
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
  ".png": "image/png",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function stripDedupSuffix(filename: string): string {
  const idx = filename.lastIndexOf(".");
  const base = idx > 0 ? filename.slice(0, idx) : filename;
  const ext = idx > 0 ? filename.slice(idx) : "";
  return base.replace(/ \(\d+\)$/, "") + ext;
}

function findLocalFilesForName(targetName: string): string[] {
  const found: string[] = [];
  for (const dir of LOCAL_DIRS) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (stripDedupSuffix(f) === targetName) found.push(resolve(dir, f));
    }
  }
  return found;
}

async function uploadAndUpsert(
  externalId: string,
  zohoIssueId: string,
  canonicalName: string,
  size: number,
  buffer: Buffer,
  downloadUrl: string | null
): Promise<{ ok: boolean; message?: string }> {
  const { data: issueRow, error: issueErr } = await supabase
    .from("issues")
    .select("id")
    .eq("external_id", zohoIssueId)
    .maybeSingle();
  if (issueErr || !issueRow) {
    return { ok: false, message: `could not resolve issue ${zohoIssueId} (${issueErr?.message ?? "not found"})` };
  }

  const ext = extname(canonicalName).toLowerCase();
  const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";
  const safeName = `zoho/issues/${zohoIssueId}/${externalId}_${canonicalName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const { error: uploadError } = await supabase.storage
    .from("project-assets")
    .upload(safeName, buffer, { upsert: true, contentType });
  if (uploadError) return { ok: false, message: `storage upload failed: ${uploadError.message}` };

  const { error: upsertError } = await supabase.from("attachments").upsert(
    {
      external_id: externalId,
      entity_type: "issue",
      entity_id: issueRow.id,
      storage_path: safeName,
      filename: canonicalName,
      size,
      source_url: downloadUrl,
    },
    { onConflict: "external_id" }
  );
  if (upsertError) return { ok: false, message: `attachments upsert failed: ${upsertError.message}` };

  return { ok: true };
}

async function main() {
  const attachments: ZohoIssueAttachmentRaw[] = [];
  const batchFiles = readdirSync(ZOHO_DIR).filter((f) => f.startsWith("issue-attachment-meta-") && f.endsWith(".json"));
  for (const f of batchFiles) {
    const parsed = JSON.parse(readFileSync(resolve(ZOHO_DIR, f), "utf-8"));
    if (Array.isArray(parsed)) attachments.push(...(parsed as ZohoIssueAttachmentRaw[]));
  }

  let imported = 0;
  let errored = 0;

  // ── Part 1: the 14 duplicate-name groups ──────────────────────────────────
  const TARGET_NAMES = [
    "Graident Ai Robot.png",
    "image002.png",
    "image003.png",
    "image004.png",
    "image005.png",
    "image006.jpg",
    "image007.jpg",
    "image008.jpg",
    "Title Menu_021725.docx",
    "Web Review Notes_KBC_3.30.26.pdf",
    "Web Review Notes_KEELER_5.5.2026.pdf",
    "Web_Brands_Belwith_01.jpg",
    "Web_Brands_Hickory_01.jpg",
    "Web_Brands_Keeler_01.jpg",
  ];

  for (const targetName of TARGET_NAMES) {
    const records = attachments.filter((a) => a.name === targetName);
    const localFiles = findLocalFilesForName(targetName);

    // Group records by size — do NOT assume every record sharing this name shares the
    // same bytes (this exact assumption corrupted line-card-electrical-linked.pdf last
    // time). Only reuse one file's bytes across records that also share that record's size.
    const sizes = new Set(records.map((r) => r.size));
    console.log(`\n${targetName} — ${records.length} record(s), sizes present: ${[...sizes].join(", ")}`);

    for (const size of sizes) {
      const sizeNum = parseInt(size ?? "0", 10);
      const localFile = localFiles.find((p) => {
        try {
          return readFileSync(p).length === sizeNum;
        } catch {
          return false;
        }
      });
      if (!localFile) {
        console.error(`  ✗ no local file matches size ${sizeNum} for ${targetName}`);
        errored++;
        continue;
      }
      const buffer = readFileSync(localFile);

      for (const att of records.filter((r) => r.size === size)) {
        const externalId = String(att.third_party_file_id ?? "");
        const zohoIssueId = String(att._zoho_issue_id ?? "");
        const result = await uploadAndUpsert(externalId, zohoIssueId, targetName, sizeNum, buffer, att.download_url ?? null);
        if (result.ok) {
          console.log(`  ✓ ${externalId} → issue ${zohoIssueId}`);
          imported++;
        } else {
          console.error(`  ✗ ${externalId}: ${result.message}`);
          errored++;
        }
      }
    }
  }

  // ── Part 2: "Obsolete items.xlsx" — metadata size is stale, real file is smaller ──
  console.log(`\nObsolete items.xlsx — metadata size mismatch, inserting directly`);
  const obsoleteRecord = attachments.find((a) => a.name === "Obsolete items.xlsx");
  const obsoleteLocalPath = findLocalFilesForName("Obsolete items.xlsx")[0];
  if (!obsoleteRecord) {
    console.error(`  ✗ metadata record not found`);
    errored++;
  } else if (!obsoleteLocalPath) {
    console.error(`  ✗ local file not found in ${LOCAL_DIRS.join(" or ")}`);
    errored++;
  } else {
    const buffer = readFileSync(obsoleteLocalPath);
    const externalId = String(obsoleteRecord.third_party_file_id ?? "");
    const zohoIssueId = String(obsoleteRecord._zoho_issue_id ?? "");
    const result = await uploadAndUpsert(
      externalId,
      zohoIssueId,
      "Obsolete items.xlsx",
      buffer.length, // real size (4690), not the stale metadata size (42544)
      buffer,
      obsoleteRecord.download_url ?? null
    );
    if (result.ok) {
      console.log(`  ✓ ${externalId} → issue ${zohoIssueId} (real size ${buffer.length}, metadata claimed ${obsoleteRecord.size})`);
      imported++;
    } else {
      console.error(`  ✗ ${externalId}: ${result.message}`);
      errored++;
    }
  }

  console.log(`\nDone. Imported: ${imported}, Errors: ${errored}`);
  if (errored > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
