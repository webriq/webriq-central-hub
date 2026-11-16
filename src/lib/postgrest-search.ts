// Task 476 — literal "contains" search across several columns for PostgREST `.or()`. Pure: no imports.
// Two layers of escaping: LIKE wildcards (`%`, `_`, `\`) are backslash-escaped so they match literally,
// then the value is double-quoted for PostgREST so `,` `(` `)` `.` can't break the filter syntax
// (inside quotes PostgREST treats `\` as an escape, so every backslash is doubled again).
// `*` is PostgREST's alias for `%` and can't be escaped, so it is dropped.
export function orIlike(columns: string[], term: string): string | null {
  const t = term.trim().replace(/\*/g, "");
  if (!t) return null;
  const like = t.replace(/[\\%_]/g, (c) => `\\${c}`);
  const quoted = like.replace(/[\\"]/g, (c) => `\\${c}`);
  return columns.map((c) => `${c}.ilike."%${quoted}%"`).join(",");
}
