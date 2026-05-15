/**
 * API Connection Test Script
 * Tests connectivity to Supabase, Anthropic (Claude), and OpenAI.
 *
 * Usage: npx tsx scripts/test-connections.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env from project root (no external deps needed)
const envPath = resolve(__dirname, "../.env");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const value = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

// ─── Colour helpers ───────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function check(label: string): void {
  process.stdout.write(`${c.dim}  ⏳ ${label}...${c.reset}`);
}

function pass(label: string, detail?: string): void {
  process.stdout.write(`\r${c.green}  ✅ ${label}${c.reset}${detail ? ` ${c.dim}${detail}${c.reset}` : ""}\n`);
}

function fail(label: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  process.stdout.write(`\r${c.red}  ❌ ${label}${c.reset}\n`);
  console.error(`${c.dim}     ${msg}${c.reset}`);
}

function warn(label: string, detail: string): void {
  process.stdout.write(`\r${c.yellow}  ⚠️  ${label}${c.reset}\n`);
  console.error(`${c.dim}     ${detail}${c.reset}`);
}

function skip(label: string, reason: string): void {
  console.log(`${c.dim}  ⏭️  ${label} — ${reason}${c.reset}`);
}
// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n\x1b[1m\x1b[36m  WebriQ Central Hub — API Connection Test\x1b[0m\n`);
  console.log(`\x1b[2m  ${new Date().toISOString()}\x1b[0m\n`);

  let passed = 0, failed = 0, skipped = 0;

  // ── Supabase ────────────────────────────────────────────────────────────────
  console.log(`\x1b[1m── Supabase\x1b[0m`);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    skip("Database connection", "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY not set");
    skipped++;
  } else {
    check("Database connection");
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    try {
      const { error } = await supabase
        .from("customers")
        .select("count", { count: "exact", head: true });

      if (error) throw error;
      pass("Database connection", "(customers table accessible)");
      passed++;

      check("Auth service");
      try {
        await supabase.auth.getSession();
        pass("Auth service");
        passed++;
      } catch (e) {
        fail("Auth service", e);
        failed++;
      }
    } catch (e) {
      fail("Database connection", e);
      failed++;
    }
  }

  // ── Anthropic (Claude) ──────────────────────────────────────────────────────
  console.log(`\n\x1b[1m── Anthropic (Claude)\x1b[0m`);
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!anthropicKey || anthropicKey.length < 30) {
    skip("Anthropic API", "ANTHROPIC_API_KEY not set or is placeholder");
    skipped++;
  } else {
    check("Claude API (haiku)");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 10,
          messages: [{ role: "user", content: "Say pong" }],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }

      const json = await res.json();
      const content = json?.content?.[0]?.text?.trim() ?? "(no text)";
      pass("Claude API (haiku)", `→ "${content.slice(0, 60)}"`);
      passed++;
    } catch (e) {
      fail("Claude API (haiku)", e);
      failed++;
    }
  }

  // ── OpenAI ──────────────────────────────────────────────────────────────────
  console.log(`\n\x1b[1m── OpenAI\x1b[0m`);
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey || openaiKey.length < 30) {
    skip("OpenAI API", "OPENAI_API_KEY not set or is placeholder");
    skipped++;
  } else {
    check("OpenAI API (gpt-4o-mini)");
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 10,
          messages: [{ role: "user", content: "Say pong" }],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }

      const json = await res.json();
      const content = json?.choices?.[0]?.message?.content?.trim() ?? "(no text)";
      pass("OpenAI API (gpt-4o-mini)", `→ "${content.slice(0, 60)}"`);
      passed++;
    } catch (e) {
      fail("OpenAI API (gpt-4o-mini)", e);
      failed++;
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n\x1b[1m\x1b[36m── Summary\x1b[0m`);
  console.log(`  \x1b[32mPassed:  ${passed}\x1b[0m`);
  console.log(`  \x1b[31mFailed:  ${failed}\x1b[0m`);
  console.log(`  \x1b[33mSkipped: ${skipped}\x1b[0m`);
  console.log();

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`\x1b[31mFatal error:\x1b[0m`, err);
  process.exit(1);
});
