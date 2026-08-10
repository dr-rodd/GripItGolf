// Reading a course's ratings off its own website, for the add-course form.
//
// The person adding a course has its website open anyway; this saves them
// retyping the ratings box. The route fetches the site and asks Claude to
// read it — this module is the pure half: turning HTML into readable text,
// choosing which of the site's own pages are worth a look (the scorecard
// page, usually), the extraction prompt and schema, and refusing any number
// the card check would refuse.
//
// **Everything here is a suggestion.** Whatever comes back pre-fills the
// form; the person confirms or corrects every figure before anything is
// written. A lookup that finds nothing is a shrug, not a failure.
//
// Pure. No I/O — `app/api/course-lookup/route.ts` fetches and asks.

import { TEE_COLUMN_RANGE } from './cardCheck'

/** Keeps the Claude request comfortably inside its window. */
export const MAX_LOOKUP_TEXT = 40_000
/** How many of the site's own pages are worth following beyond the first. */
export const MAX_EXTRA_PAGES = 2

// ─── HTML → text ───────────────────────────────────────────────

/**
 * The page as words. Scripts and styles go first — a tag-stripper that
 * leaves them turns a page into minified JavaScript — then tags become
 * spaces and entities become their characters. Tables survive as runs of
 * numbers, which is exactly what a ratings box is.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The links on a page that smell like ratings: the scorecard page, the
 * course page, visitor green-fee pages that print the ratings box. Same
 * origin only — following a link off the club's own site is how a lookup
 * ends up reading a hotel brochure. Returned resolved, deduplicated, and
 * in the order found.
 */
export function ratingsLinks(html: string, pageUrl: string): string[] {
  const base = new URL(pageUrl)
  const found: string[] = []
  const seen = new Set<string>()
  const anchor = /<a\b[^>]*href\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi
  const worthIt = /score\s*card|course\s*(info|guide|details)?|tees?|ratings?|slope|the\s*links/i
  let m: RegExpExecArray | null
  while ((m = anchor.exec(html)) !== null) {
    const href = (m[2] ?? m[3] ?? '').trim()
    const label = htmlToText(m[4] ?? '')
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue
    if (!worthIt.test(href) && !worthIt.test(label)) continue
    let resolved: URL
    try {
      resolved = new URL(href, base)
    } catch {
      continue
    }
    if (resolved.origin !== base.origin) continue
    if (!/^https?:$/.test(resolved.protocol)) continue
    resolved.hash = ''
    const key = resolved.toString()
    if (seen.has(key) || key === base.toString()) continue
    seen.add(key)
    found.push(key)
  }
  return found
}

// ─── What Claude is asked ──────────────────────────────────────

export const LOOKUP_PROMPT = `The text below was extracted from a golf course's own website. Find the course's tee data — the ratings box, usually printed on the scorecard or course page.

For each tee (usually named by colour — Blue, White, Red…): whether it is a men's or ladies tee, its total par, its course rating (a number like 71.4) and its slope rating (a whole number like 125).

Also the course's location as "Town, County, Country" if the site states it.

Rules — accuracy over completeness:
- Only report figures the text actually states. Never estimate, never fill in a typical value. A tee with no printed rating gets null, and a site that prints nothing gets an empty list.
- Course rating and slope are specific WHS figures. Do not mistake a yardage, a par or a price for either.
- Ladies tees are usually Red or Claret, or marked Ladies/Women; when the site does not say, judge from context and the rating (ladies course ratings are rated against ladies scratch).
- location is null if the site does not state one.`

export const LOOKUP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['location', 'tees'],
  properties: {
    location: { type: ['string', 'null'] },
    tees: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'gender', 'par', 'courseRating', 'slope'],
        properties: {
          name: { type: 'string' },
          gender: { type: 'string', enum: ['M', 'F'] },
          par: { type: ['integer', 'null'] },
          courseRating: { type: ['number', 'null'] },
          slope: { type: ['integer', 'null'] },
        },
      },
    },
  },
} as const

// ─── What comes back ───────────────────────────────────────────

/** A tee as the lookup suggests it — any figure may be missing. */
export type SuggestedTee = {
  name: string
  gender: 'M' | 'F'
  par: number | null
  courseRating: number | null
  slope: number | null
}

export type LookupSuggestion = {
  location: string | null
  tees: SuggestedTee[]
}

const within = (n: number, [lo, hi]: [number, number]) => n >= lo && n <= hi

/**
 * The extraction folded into a suggestion the form can pre-fill.
 *
 * A figure outside the card check's ranges becomes null rather than an
 * error — a misread 1250 slope should cost that one field, not the whole
 * lookup. Nameless tees are dropped, duplicates (same name and gender)
 * keep their first reading, and never more than six tees — a page that
 * yields ten has been misread.
 */
export function normalizeLookup(raw: unknown): LookupSuggestion {
  const r = (raw ?? {}) as { location?: unknown; tees?: unknown }
  const location =
    typeof r.location === 'string' && r.location.trim() ? r.location.trim().slice(0, 120) : null

  const tees: SuggestedTee[] = []
  const seen = new Set<string>()
  for (const t of Array.isArray(r.tees) ? r.tees : []) {
    const tee = (t ?? {}) as Record<string, unknown>
    const name = typeof tee.name === 'string' ? tee.name.trim().slice(0, 40) : ''
    if (!name) continue
    const gender = tee.gender === 'F' ? 'F' : 'M'
    const key = `${name.toLowerCase()}:${gender}`
    if (seen.has(key)) continue
    seen.add(key)

    const par =
      Number.isInteger(tee.par) && within(tee.par as number, TEE_COLUMN_RANGE.par)
        ? (tee.par as number)
        : null
    const courseRating =
      typeof tee.courseRating === 'number' &&
      Number.isFinite(tee.courseRating) &&
      within(tee.courseRating, TEE_COLUMN_RANGE.course_rating)
        ? Math.round(tee.courseRating * 10) / 10
        : null
    const slope =
      Number.isInteger(tee.slope) && within(tee.slope as number, TEE_COLUMN_RANGE.slope)
        ? (tee.slope as number)
        : null

    tees.push({ name, gender, par, courseRating, slope })
    if (tees.length >= 6) break
  }
  return { location, tees }
}

/** True when the suggestion carries nothing worth pre-filling. */
export const lookupIsEmpty = (s: LookupSuggestion): boolean =>
  s.location === null && s.tees.length === 0

// ─── Keeping the fetch on the public internet ──────────────────

/**
 * Hosts the lookup must never fetch: the machine it runs on and the
 * private ranges around it. The URL came from a text box, and a server
 * happily fetching http://169.254.169.254/ on request is a hole, not a
 * feature. Checked by name — a hostname that *resolves* privately is
 * beyond a pure check, so the route treats a failed fetch as a shrug.
 */
export function privateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (h === '0.0.0.0' || h === '::' || h === '::1' || h.startsWith('[')) return true
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
  }
  return false
}
