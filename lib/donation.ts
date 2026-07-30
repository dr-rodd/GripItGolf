// The optional "support the app" link.
//
// The address lives in NEXT_PUBLIC_DONATION_URL so it can be swapped without
// a code change. Nothing depends on it: with the variable unset there is no
// link, no gap and no placeholder — the app is exactly as it was before.
//
// The value is checked before it is rendered. It is our own environment
// variable rather than user input, but an href is one of the few places where
// a bad string becomes executable (`javascript:...` runs on click), and a
// mistyped variable should produce no link rather than a broken or dangerous
// one. Costs three lines.

/** Schemes an href may use. Anything else is not a payment page. */
const ALLOWED = ['https:', 'http:']

/**
 * The address to link to, or null.
 *
 * Null for: unset, blank, not a URL at all, or a scheme we will not put in
 * an href. In every one of those cases the caller renders nothing.
 */
export function sanitiseDonationUrl(raw: string | null | undefined): string | null {
  // Not load-bearing: new URL() throws on undefined, null and '' alike, so the
  // catch below would return null anyway. This is here so the ordinary case —
  // the variable simply not being set — costs a comparison rather than a
  // thrown exception on every render.
  if (!raw?.trim()) return null
  const v = raw.trim()
  try {
    const url = new URL(v)
    if (!ALLOWED.includes(url.protocol)) return null
    return url.toString()
  } catch {
    // Not a URL. Nothing to link to.
    return null
  }
}

/**
 * The configured address, or null when there is none.
 *
 * Written as a literal `process.env.NEXT_PUBLIC_DONATION_URL` on purpose:
 * Next replaces that exact expression with the value at build time, and a
 * computed lookup would come back undefined in the browser.
 */
export function donationUrl(): string | null {
  return sanitiseDonationUrl(process.env.NEXT_PUBLIC_DONATION_URL)
}
