// Turning a place somebody typed into a link that opens their maps app.
//
// The fields these come from are names, not addresses — "The Shandon Hotel",
// "Carne" — because that is what the itinerary form asks for. That turns out
// to be the right input for this: a maps *search* takes a name perfectly
// well, and needs no address parsing, no phone-number matching and no
// detection that could fail and leave a dead link on the page.
//
// So there is nothing to detect. Any non-empty place gets a link, and an
// empty one gets none.
//
// Pure. No I/O.

/**
 * A maps search for this place, or null if there is nothing to search for.
 *
 * The scheme and host are fixed here and only the query is interpolated,
 * URL-encoded — so nothing a user types can change where the link goes. That
 * matters: an href is one of the few places a string becomes executable, and
 * `lib/donation.ts` carries the same rule for the same reason.
 *
 * `google.com/maps/search` rather than a `geo:` or `maps://` URI because it
 * is the one form that works everywhere — iOS hands it to Apple Maps if
 * that is what the phone prefers, Android opens Google Maps, and a laptop
 * gets a web page rather than a protocol error.
 */
export function mapsUrl(place: string | null | undefined): string | null {
  const query = String(place ?? '').trim()
  if (!query) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
