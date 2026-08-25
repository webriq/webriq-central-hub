// dev-only import endpoint — reads _from_zoho/desk-agents.json, upserts to the desk_agents
// table. Unlike Desk Contacts, agents don't match to a Hub customer at all — this is a plain
// lookup table used only to resolve tickets.source_meta.assigneeId into a display name (task
// 310). Field names confirmed against a live export (_from_zoho/desk-agents.json, 6 real
// agents): the email field is `emailId`, not `email` — Desk Agents uses a different key than
// Desk Contacts/Accounts do. `name` is always present and pre-composed by Zoho; firstName/
// lastName can be split unevenly (one real row has firstName: "" and the full name in
// lastName) but firstName-or-lastName-first still produces the right result since at least
// one of the two always holds the complete name.
import { NextResponse } from "next/server";
import { adminClient, ImportResult, readFromZoho } from "@/lib/migrate/zoho-import";
import { createClient } from "@/lib/supabase/server";

type DeskAgentRaw = {
  id?: string | number;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  emailId?: string | null;
  status?: string | null;
  roleId?: string | number | null;
  associatedDepartmentIds?: unknown;
  [key: string]: unknown;
};

type DeskAgentRow = {
  external_id: string;
  email: string | null;
  full_name: string | null;
  source_meta: Record<string, unknown>;
};

const CHUNK_SIZE = 50;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let deskAgents: DeskAgentRaw[];
  try {
    deskAgents = readFromZoho<DeskAgentRaw>("desk-agents.json");
  } catch {
    return NextResponse.json(
      { error: "Could not read _from_zoho/desk-agents.json — run the Desk Agents export first" },
      { status: 400 }
    );
  }

  if (deskAgents.length === 0) {
    return NextResponse.json({ error: "No agents found in desk-agents.json" }, { status: 400 });
  }

  console.log(`[import/desk-agents] ${deskAgents.length} agents`);

  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
  const rows: DeskAgentRow[] = [];

  for (const agent of deskAgents) {
    const externalId = agent.id != null ? String(agent.id) : "";
    if (!externalId) {
      result.skipped++;
      continue;
    }

    rows.push({
      external_id: externalId,
      email: agent.emailId ?? null,
      full_name: agent.firstName || agent.lastName
        ? [agent.firstName, agent.lastName].filter(Boolean).join(" ")
        : (agent.name ?? null),
      source_meta: {
        status: agent.status ?? null,
        roleId: agent.roleId ?? null,
        associatedDepartmentIds: agent.associatedDepartmentIds ?? null,
      },
    });
  }

  console.log(`[import/desk-agents] upserting ${rows.length} rows in chunks of ${CHUNK_SIZE} (${result.skipped} skipped)`);

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await adminClient.from("desk_agents").upsert(chunk, { onConflict: "external_id" });
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(rows.length / CHUNK_SIZE);
    if (error) {
      console.error(`[import/desk-agents] chunk ${chunkNum}/${totalChunks} failed:`, error.message);
      result.errors.push(`chunk ${chunkNum}: ${error.message}`);
    } else {
      result.imported += chunk.length;
    }
  }

  console.log(`[import/desk-agents] done: ${result.imported} imported, ${result.errors.length} error(s)`);
  return NextResponse.json(result);
}
