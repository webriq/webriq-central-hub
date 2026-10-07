import { after } from "next/server";
import { createNotification } from "@/lib/notifications";
import { adminClient } from "@/lib/supabase/admin";
import { sendDriveShareEmail } from "@/lib/email/drive-share-notification";
import { resolveShareRecipients, type ShareGrantee } from "./resolve-recipients";
import { buildShareCopy, type ShareItemKind, type SharePermission } from "./share-copy";

export const DRIVE_SHARE_EVENT = "drive_share";
const EMAIL_CONCURRENCY = 5;

export type ShareNotice = {
  target: { kind: ShareItemKind; id: string };
  grantee: ShareGrantee;
  permission: SharePermission;
  isUpgrade: boolean;
};

const mailConfigured = () => !!(process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS);

// Task 437 — fans a share out to in-app (+ push, via createNotification) and email. In-app rows are
// written first; email is best-effort and one recipient's failure never stops the rest.
async function deliver(sharerId: string, sharerName: string, itemName: string, n: ShareNotice): Promise<void> {
  const recipients = await resolveShareRecipients(n.grantee, sharerId);
  if (recipients.length === 0) return;
  const copy = buildShareCopy({ sharerName, kind: n.target.kind, itemName, itemId: n.target.id, permission: n.permission, isUpgrade: n.isUpgrade });

  await Promise.all(recipients.map((r) =>
    createNotification(r.id, { type: DRIVE_SHARE_EVENT, title: copy.title, body: copy.body, url: copy.path, actorId: sharerId })));

  if (!mailConfigured()) {
    console.warn("[drive-share] MAIL_HOST/MAIL_USER/MAIL_PASS not set — skipped share emails (in-app notifications were sent)");
    return;
  }
  for (let i = 0; i < recipients.length; i += EMAIL_CONCURRENCY) {
    const batch = recipients.slice(i, i + EMAIL_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((r) =>
      sendDriveShareEmail({ to: r.email, recipientName: r.name, sharerName, itemName, copy })));
    results.forEach((res, idx) => {
      if (res.status === "rejected") console.error(`[drive-share] email to recipient ${batch[idx].id} failed:`, res.reason);
    });
  }
}

// Called from the share routes after a successful, already-authorised write. Runs post-response
// (`after()`, task 417 precedent) so it never delays or fails the share. The names are looked up with
// adminClient rather than the request's session: a post-response job can't rely on the request's
// cookie/session still being usable, and a lookup failure here would silently drop every
// notification. Only the two display names of an item the caller just shared are read. Everything
// is logged and swallowed.
export function scheduleDriveShareNotice(sharerId: string, notice: ShareNotice): void {
  after(async () => {
    try {
      const [{ data: me }, item] = await Promise.all([
        adminClient.from("profiles").select("full_name").eq("id", sharerId).maybeSingle(),
        notice.target.kind === "folder"
          ? adminClient.from("drive_folders").select("name").eq("id", notice.target.id).maybeSingle()
          : adminClient.from("drive_files").select("file_name").eq("id", notice.target.id).maybeSingle(),
      ]);
      const itemName = item.data ? ("name" in item.data ? item.data.name : item.data.file_name) : null;
      if (!itemName) return;
      await deliver(sharerId, me?.full_name?.trim() || "A teammate", itemName, notice);
    } catch (err) {
      console.error("[drive-share] notification failed:", err);
    }
  });
}
