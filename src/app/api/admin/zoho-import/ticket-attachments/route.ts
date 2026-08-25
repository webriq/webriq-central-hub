// dev-only import endpoint — downloads real Zoho Desk Thread/Comment attachment files
// (metadata already captured in ticket_messages.source_meta.attachments by the desk-threads/
// desk-ticket-comments imports) and stores them in the ticket-attachments Supabase Storage
// bucket + the native attachments table (entity_type: 'ticket_message', entity_id =
// ticket_messages.id — the specific message, not tickets.id). No export step needed — every
// attachment's href/name/size already lives in the live ticket_messages table.
//
// Confirmed server-side fetch works for Zoho Desk attachment content (unlike Zoho Projects/
// WorkDrive attachments, which are architecturally blocked, 401 INVALID_OAUTHSCOPE — see
// zoho-import/attachments/route.ts and task 106) via the verify-attachment diagnostic route
// (task 304 follow-up): a real href returned 200 OK with image/jpeg content.
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken, fetchZohoWithRetry } from "@/lib/zoho";
import { deskHeaders } from "@/lib/zoho/desk";

const BUCKET = "ticket-attachments";
const MAX_SIZE = 52428800; // 50MB — matches the bucket's file_size_limit (migration 117)

type AttachmentMeta = {
  id?: string | number;
  name?: string;
  size?: string | number;
  href?: string;
  [key: string]: unknown;
};

type FlatAttachment = {
  ticketMessageId: string;
  attachment: AttachmentMeta;
};

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  let token = await getZohoAccessToken();
  if (!token) return new Response(JSON.stringify({ error: "No Zoho token" }), { status: 502 });

  let headers: Record<string, string>;
  try {
    headers = deskHeaders();
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "ZOHO_DESK_ORG_ID not configured" }),
      { status: 500 }
    );
  }

  // Paginated scan of ticket_messages for any non-empty source_meta.attachments array.
  const flat: FlatAttachment[] = [];
  {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data: page, error } = await adminClient
        .from("ticket_messages")
        .select("id, source_meta")
        .range(from, from + PAGE - 1);
      if (error) {
        return new Response(
          JSON.stringify({ error: `Could not fetch ticket_messages: ${error.message}` }),
          { status: 500 }
        );
      }
      if (!page || page.length === 0) break;
      for (const row of page as Array<{ id: string; source_meta: Record<string, unknown> | null }>) {
        const attachments = (row.source_meta?.attachments as AttachmentMeta[] | undefined) ?? [];
        for (const att of attachments) {
          if (att?.href) flat.push({ ticketMessageId: row.id, attachment: att });
        }
      }
      if (page.length < PAGE) break;
      from += PAGE;
    }
  }

  if (flat.length === 0) {
    return new Response(
      JSON.stringify({ error: "No ticket_messages with attachments found — run Desk Threads/Ticket Comments import first" }),
      { status: 400 }
    );
  }

  // Pre-fetch already-imported external_ids so re-runs skip already-downloaded files.
  const existingExternalIds = new Set<string>();
  {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data: page } = await adminClient
        .from("attachments")
        .select("external_id")
        .eq("entity_type", "ticket_message")
        .not("external_id", "is", null)
        .range(from, from + PAGE - 1);
      if (!page || page.length === 0) break;
      for (const row of page as Array<{ external_id: string | null }>) {
        if (row.external_id) existingExternalIds.add(row.external_id);
      }
      if (page.length < PAGE) break;
      from += PAGE;
    }
  }

  const pending = flat.filter(({ attachment }) => {
    const externalId = String(attachment.id ?? "");
    return externalId && !existingExternalIds.has(externalId);
  });
  const skipped = flat.length - pending.length;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let imported = 0;
      const errors: string[] = [];
      const total = pending.length;

      for (let i = 0; i < pending.length; i++) {
        const { ticketMessageId, attachment } = pending[i];
        const externalId = String(attachment.id ?? "");
        const href = attachment.href ?? "";
        const filename = attachment.name ?? externalId;
        const declaredSize = attachment.size != null ? parseInt(String(attachment.size), 10) : null;

        try {
          const { res, token: nextToken, throttleExhausted } = await fetchZohoWithRetry(href, token, {
            label: "ticket-attachments",
            headers,
          });
          token = nextToken;

          if (throttleExhausted) {
            errors.push(`${filename}: Zoho rolling throttle exhausted`);
            send({ type: "progress", current: i + 1, total });
            continue;
          }
          if (!res.ok) {
            errors.push(`${filename}: Zoho returned HTTP ${res.status}`);
            send({ type: "progress", current: i + 1, total });
            continue;
          }

          const buffer = await res.arrayBuffer();
          if (buffer.byteLength > MAX_SIZE) {
            errors.push(`${filename}: file exceeds 50MB storage limit (${buffer.byteLength} bytes)`);
            send({ type: "progress", current: i + 1, total });
            continue;
          }

          const safeName = `${ticketMessageId}/${externalId}_${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          const { error: uploadError } = await adminClient.storage
            .from(BUCKET)
            .upload(safeName, buffer, {
              upsert: true,
              contentType: res.headers.get("content-type") ?? undefined,
            });

          if (uploadError) {
            errors.push(`${filename}: storage upload failed: ${uploadError.message}`);
            send({ type: "progress", current: i + 1, total });
            continue;
          }

          const { error: dbError } = await adminClient.from("attachments").upsert(
            {
              external_id: externalId,
              entity_type: "ticket_message",
              entity_id: ticketMessageId,
              storage_path: safeName,
              filename,
              size: declaredSize ?? buffer.byteLength,
              source_url: href,
            },
            { onConflict: "external_id" }
          );

          if (dbError) {
            errors.push(`${filename}: ${dbError.message}`);
          } else {
            imported++;
          }
        } catch (e) {
          errors.push(`${filename}: ${e instanceof Error ? e.message : String(e)}`);
        }

        send({ type: "progress", current: i + 1, total });
      }

      send({ type: "done", imported, skipped, errors });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
