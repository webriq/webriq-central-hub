// Escapes a value for use as an EXACT, case-insensitive match in PostgREST's `ilike`. Without it, `_` and `%` in
// the value act as SQL wildcards — "john_doe@x.com" would also match "johnXdoe@x.com" and attach the wrong
// customer to a ticket (task 445 review). Pure: no env/DB imports.
// (PostgREST also treats a literal `*` as `%`; a `*` in an email address is vanishingly rare and not escapable here.)
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
