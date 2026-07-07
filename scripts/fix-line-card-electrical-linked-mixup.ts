/**
 * One-off correction: scripts/import-ambiguous-issue-attachments.ts assumed every
 * metadata record sharing a name also shared identical byte content, and reused one
 * physical file's bytes for all of them. That assumption was wrong for
 * "line-card-electrical-linked.pdf" — it has 3 metadata records, and only 2 of them
 * (1044712 bytes) are actually identical; the 3rd (722932 bytes, external_id
 * 506250000003225006, issue 1512955000018872110 / OS1-I59 "homepage banner
 * adjustment") is a genuinely different file that the automated importer had already
 * correctly uploaded before the ambiguous-fix script ran and overwrote it with the
 * wrong (1044712-byte) content.
 *
 * This re-uploads the correct local file over that one storage object only. The
 * attachments row itself doesn't need changing — its `size` column already correctly
 * says 722932 (from metadata), only the actual stored bytes were wrong.
 *
 * Usage: npx tsx scripts/fix-line-card-electrical-linked-mixup.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
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

const EXTERNAL_ID = "506250000003225006";
const ZOHO_ISSUE_ID = "1512955000018872110";
const CORRECT_LOCAL_FILE = resolve(homedir(), "Downloads/zoho-issue-attachments-1/line-card-electrical-linked (2).pdf");
const STORAGE_PATH = `zoho/issues/${ZOHO_ISSUE_ID}/${EXTERNAL_ID}_line-card-electrical-linked.pdf`;

async function main() {
  if (!existsSync(CORRECT_LOCAL_FILE)) {
    console.error(`File not found: ${CORRECT_LOCAL_FILE}`);
    process.exit(1);
  }
  const buffer = readFileSync(CORRECT_LOCAL_FILE);
  console.log(`Read ${buffer.length} bytes from ${CORRECT_LOCAL_FILE} (expect 722932)`);

  const { error: uploadError } = await supabase.storage
    .from("project-assets")
    .upload(STORAGE_PATH, buffer, { upsert: true, contentType: "application/pdf" });
  if (uploadError) {
    console.error(`Upload failed: ${uploadError.message}`);
    process.exit(1);
  }

  const { data: row, error: selectError } = await supabase
    .from("attachments")
    .select("external_id, storage_path, size")
    .eq("external_id", EXTERNAL_ID)
    .maybeSingle();
  if (selectError || !row) {
    console.error(`Could not verify row: ${selectError?.message ?? "not found"}`);
    process.exit(1);
  }

  console.log(`✓ Fixed. Row: ${JSON.stringify(row)}`);
  console.log(`  Uploaded ${buffer.length} bytes to ${STORAGE_PATH} — should now match row.size (${row.size}).`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
