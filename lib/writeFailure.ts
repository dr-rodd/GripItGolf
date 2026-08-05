// Saying what actually went wrong.
//
// A write that fails and reports "could not save" names the one thing the
// organiser already knows. It cost two rounds of this to find out that a
// migration had never been run against the live database: the screen said
// "Could not add teams", which is true of a missing column, a row-level
// security policy, a broken foreign key and a network drop alike.
//
// So a failed write carries the error rather than collapsing to `false`, and
// the toast prints what Postgres said. The code matters as much as the
// message — `PGRST204` is a schema cache, `23503` is a foreign key, `42501`
// is a permission — so both go on screen, and the whole error to the console
// where `details` and `hint` are often the real answer.
//
// Pure apart from the console write.

/** A write that did not happen, and where it was going. */
export type WriteFailure = { where: string; error: unknown }

/**
 * A failure, or null when there was nothing wrong.
 *
 * Shaped so a caller can `return failed('x', error)` straight from a Supabase
 * result and have success come back as null.
 */
export function failed(where: string, error: unknown): WriteFailure | null {
  return error ? { where, error } : null
}

/**
 * What to append to a message on screen: " — the reason (CODE)".
 *
 * Empty for a success, so `Could not save${why(f)}` reads correctly either
 * way and no call site needs a conditional.
 */
export function why(failure: WriteFailure | null): string {
  if (!failure) return ''
  console.error(`${failure.where} failed:`, failure.error)
  const e = failure.error as { message?: string; code?: string }
  const code = e?.code ? ` (${e.code})` : ''
  return e?.message ? ` — ${e.message}${code}` : code || ' — no reason given'
}
