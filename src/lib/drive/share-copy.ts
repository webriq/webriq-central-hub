// Task 437 — the words for a Drive share notification, written once and used by both the in-app
// notification and the email so the two can never drift apart. Pure: no I/O.

export type ShareItemKind = "folder" | "file";
export type SharePermission = "view" | "edit";

export type ShareCopyInput = {
  sharerName: string;
  kind: ShareItemKind;
  itemName: string;
  itemId: string;
  permission: SharePermission;
  isUpgrade: boolean;
};

export type ShareCopy = {
  title: string; // in-app title
  body: string; // in-app body
  subject: string; // email subject
  headline: string; // email heading
  accessLine: string; // what the recipient can do, in plain words
  path: string; // app-relative deep link into Shared with me
};

export function buildShareCopy(i: ShareCopyInput): ShareCopy {
  const access = i.permission === "edit" ? "view and edit" : "view";
  const inside = i.kind === "folder" ? " It includes everything inside it, including files added later." : "";
  const param = i.kind === "folder" ? "folder" : "file";
  return {
    title: i.isUpgrade ? `${i.sharerName} gave you edit access to ${i.itemName}` : `${i.sharerName} shared a ${i.kind} with you`,
    body: `“${i.itemName}” — you can ${access} it.`,
    subject: i.isUpgrade ? `${i.sharerName} gave you edit access to “${i.itemName}”` : `${i.sharerName} shared “${i.itemName}” with you on Drive`,
    headline: i.isUpgrade ? `${i.sharerName} gave you edit access` : `${i.sharerName} shared a ${i.kind} with you`,
    accessLine: `You can ${access} this ${i.kind}.${inside}`,
    path: `/drive?view=shared&${param}=${i.itemId}`,
  };
}
