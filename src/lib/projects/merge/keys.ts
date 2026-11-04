// Task 468 — normalizers + dedup keys (pure). Keep in sync with the table in the task doc.

/** NFKC, strip tags/entities, lowercase, collapse whitespace + punctuation. */
export function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKC")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export const taskKey = (title: string, tasklistName: string | null) => `${norm(title)}|${norm(tasklistName)}`;
export const logKey = (l: { employee_id: string | null; date_logged: string; hours: number | string; note: string | null }) =>
  `${l.employee_id ?? ""}|${l.date_logged}|${Number(l.hours)}|${norm(l.note)}`;

type FolderRow = { id: string; name: string; parent_folder_id: string | null; phase_number: number | null };

/** Root-to-leaf normalized path for every folder id (cycle-safe). */
export function folderPaths(folders: FolderRow[]): Map<string, string> {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out = new Map<string, string>();
  for (const f of folders) {
    const parts: string[] = [];
    let cur: FolderRow | undefined = f;
    for (let i = 0; cur && i < 20; i++) {
      parts.unshift(norm(cur.name));
      cur = cur.parent_folder_id ? byId.get(cur.parent_folder_id) : undefined;
    }
    out.set(f.id, `${f.phase_number ?? ""}:${parts.join("/")}`);
  }
  return out;
}

export const fileKey = (folderPath: string, label: string, size: number | null) => `${folderPath}|${norm(label)}|${size ?? ""}`;
