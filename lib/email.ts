// Reading an optional email address.
//
// The field is optional and must never block trip creation. So this is not a
// validator that rejects — it is a reader that either recognises an address
// or returns null, and the caller stores whichever it gets. Blank, malformed,
// half-typed: all null, all fine, trip created either way.
//
// No attempt is made to decide whether an address is *valid*. Nothing short
// of sending a mail to it can, and the shapes people actually type wrong
// (missing @, a trailing comma, a stray space) are all caught by the shape
// check anyway.
//
// Pure — no I/O.

/** Longest an address may be, per RFC 5321. The column agrees. */
export const MAX_EMAIL = 254

/**
 * Does this look like an address?
 *
 * One @, something either side of it, a dot in the domain with at least two
 * characters after it, and no whitespace anywhere. Deliberately loose: the
 * job is to catch "not an email", not to police the ones that are.
 */
export function looksLikeEmail(value: string): boolean {
  const v = value.trim()
  if (v.length < 6 || v.length > MAX_EMAIL) return false
  if (/\s/.test(v)) return false
  // Exactly one @, with a local part before it
  const at = v.indexOf('@')
  if (at < 1 || at !== v.lastIndexOf('@')) return false
  const domain = v.slice(at + 1)
  // A dot inside the domain, not at either end, with a 2+ char tail
  const dot = domain.lastIndexOf('.')
  if (dot < 1 || domain.length - dot < 3) return false
  // No consecutive dots, and no dot against the @
  if (v.includes('..') || domain.startsWith('.') || v[at - 1] === '.') return false
  return true
}

/**
 * The address to store, or null.
 *
 * Trimmed, and lowercased — addresses are treated case-insensitively in
 * practice, and storing them one way means the same person reads as the same
 * person. Anything that is not an address at all comes back as null rather
 * than as an error: this field is never worth failing a trip over.
 */
export function normaliseEmail(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase()
  if (!v) return null
  return looksLikeEmail(v) ? v : null
}

/**
 * Whether to warn the organiser as they type.
 *
 * Only once they have typed something that is clearly meant to be an address
 * and is not one — an empty field is not a mistake, and neither is a field
 * they are still halfway through.
 */
export function emailWarning(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (normaliseEmail(v)) return null
  // Still typing: no @ yet, or nothing after it
  if (!v.includes('@') || v.endsWith('@')) return null
  return 'That does not look like an email address — it will not be saved'
}
