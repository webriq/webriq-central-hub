import { NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { handleInbound, fail } from "@/lib/stackshift-support/inbound";
import { signUploadsSchema } from "@/lib/stackshift-support/schema";
import { validateManifest } from "@/lib/stackshift-support/attachments-logic";
import { mintUploads } from "@/lib/stackshift-support/attachments";

// Task 447 — POST .../v1/uploads/sign (contract v1 §4). Exchanges a file manifest for signed Storage upload
// URLs; StackShift PUTs the bytes straight to Storage (no Hub handler carries file bytes) and then lists the
// returned paths in the `attachments` array of create/comment. Mints nothing but URLs, so no idempotency key.
export async function POST(req: NextRequest) {
  return handleInbound({
    req,
    route: "POST /uploads/sign",
    schema: signUploadsSchema,
    run: async ({ data }) => {
      const { ticketRef, actor, files } = data;

      const manifest = validateManifest(files);
      if (!manifest.ok) return fail(manifest.status, manifest.error, manifest.message, undefined, ticketRef);

      // For an EXISTING ticket the site must match (contract §1 rule 7). A not-yet-created ticketRef (files for a
      // new ticket) has no row to check; ownership is enforced at register time by the site/ticketRef path prefix.
      const { data: ticket } = await adminClient.from("inbox").select("stackshift_site").eq("external_ref", ticketRef).maybeSingle();
      if (ticket && ticket.stackshift_site !== actor.site) {
        return fail(403, "site_forbidden", "Ticket belongs to another site", undefined, ticketRef);
      }

      const uploads = await mintUploads(actor.site, ticketRef, files);
      return { status: 200, outcome: "uploads_signed", ticketRef, body: { uploads } };
    },
  });
}
