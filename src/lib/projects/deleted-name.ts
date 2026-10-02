// Task 415 — soft delete (task 247) renames a project to `<name>_deleted_<YYYY-MM-DD>`. Split it
// back so surfaces can show the original name and the deletion date separately.
const DELETED_SUFFIX = /^([\s\S]*)_deleted_(\d{4}-\d{2}-\d{2})$/;

export function splitDeletedName(name: string): { baseName: string; deletedOn: string | null } {
  const match = DELETED_SUFFIX.exec(name);
  return match ? { baseName: match[1], deletedOn: match[2] } : { baseName: name, deletedOn: null };
}
