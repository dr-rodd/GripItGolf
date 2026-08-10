// The course directory: searching it, filtering it, and what it takes to
// add a course to it.
//
// The platform course list stopped being twelve Irish links a person can
// scan in one screen. This module holds the rules the picker and the
// add-course flow share: how a search narrows the list, where the filter
// chips come from, and what a new course must look like before it is
// allowed in. The API route and the picker both read these — neither
// restates them.
//
// Pure. No I/O.

import { TEE_COLUMN_RANGE } from './cardCheck'

/** A course as the picker reads it off `courses`. */
export type DirectoryCourse = {
  id: string
  name: string
  location?: string | null
  /** The county it files under — the picker's only filter (migration 032). */
  county?: string | null
  website?: string | null
  /** False until a scorecard photo has confirmed the record. */
  card_verified?: boolean | null
}

export const MAX_COURSE_NAME = 80
export const MAX_LOCATION = 120
export const MAX_COUNTY = 40
export const MAX_WEBSITE = 200

/**
 * The thirty-two counties, for the form's suggestions. Derry, not
 * Londonderry — settled once, here, and `countyOf` folds the other
 * spelling onto it however a course arrives.
 *
 * Suggestions rather than the whole answer: the field stays free text,
 * because the platform has no rule that a course is in Ireland.
 */
export const IRISH_COUNTIES = [
  'Antrim', 'Armagh', 'Carlow', 'Cavan', 'Clare', 'Cork', 'Derry',
  'Donegal', 'Down', 'Dublin', 'Fermanagh', 'Galway', 'Kerry', 'Kildare',
  'Kilkenny', 'Laois', 'Leitrim', 'Limerick', 'Longford', 'Louth', 'Mayo',
  'Meath', 'Monaghan', 'Offaly', 'Roscommon', 'Sligo', 'Tipperary',
  'Tyrone', 'Waterford', 'Westmeath', 'Wexford', 'Wicklow',
] as const

// ─── Searching and filtering ───────────────────────────────────

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/**
 * The county parsed out of a location, for a course with no county of its
 * own — everything added before migration 032 gave the county a column.
 *
 * Locations are stored as "Town, County, Country" (sometimes with an extra
 * town in between), so the segment before the last one is the county. A
 * one-segment location is its own region rather than nothing, and a blank
 * location is null — those courses appear under All and under no chip.
 */
function countyFromLocation(location: string | null | undefined): string | null {
  const parts = String(location ?? '')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]
  return parts[parts.length - 2]
}

/**
 * The county a course files under — the picker's only filter.
 *
 * The stored column wins; the location parse is the fallback for rows from
 * before the column existed. Either way the answer is canonicalised: the
 * 'Co. ' and 'County ' prefixes come off, and Londonderry reads as Derry —
 * one chip per county, however a course arrived. Migration 032 makes the
 * same corrections to what is stored.
 */
export function countyOf(
  course: Pick<DirectoryCourse, 'county' | 'location'>,
): string | null {
  const raw = course.county?.trim() || countyFromLocation(course.location)
  if (!raw) return null
  const cleaned = raw.replace(/^Co\.?\s+/i, '').replace(/^County\s+/i, '')
  return /^londonderry$/i.test(cleaned) ? 'Derry' : cleaned || null
}

/** The filter chips: every county that has a course, alphabetical. */
export function countyList(courses: readonly DirectoryCourse[]): string[] {
  const seen = new Set<string>()
  for (const c of courses) {
    const county = countyOf(c)
    if (county) seen.add(county)
  }
  return [...seen].sort((a, b) => a.localeCompare(b))
}

/**
 * The list the picker shows: narrowed by the search box and the county
 * chip, in that order. Search matches name, location or county, case- and
 * accent-blind, so "sligo" finds "County Sligo Golf Club" and "murvagh"
 * finds Donegal. An empty search and no county is the whole directory.
 */
export function filterCourses(
  courses: readonly DirectoryCourse[],
  search: string,
  county: string | null,
): DirectoryCourse[] {
  const q = fold(search.trim())
  return courses.filter(c => {
    if (county !== null && countyOf(c) !== county) return false
    if (!q) return true
    return fold(c.name).includes(q)
      || fold(c.location ?? '').includes(q)
      || fold(countyOf(c) ?? '').includes(q)
  })
}

/** Why the county field cannot be saved, or null. Every course files somewhere. */
export function countyError(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return 'Give the county — it is how the course is found.'
  if (trimmed.length > MAX_COUNTY) {
    return `That county is too long — ${MAX_COUNTY} characters at most.`
  }
  return null
}

// ─── Adding a course ───────────────────────────────────────────

/** "Carne Golf Links -- Wild Atlantic Dunes" → "carne-golf-links-wild-atlantic-dunes" */
export function slugify(name: string): string {
  return fold(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Why this name cannot be a new course, or null if it can.
 *
 * The duplicate check is against what is already on the list, case-blind —
 * a second "Lahinch Golf Club" is somebody who did not find the first, and
 * the calm answer is to point them back at the picker.
 */
export function courseNameError(
  name: string,
  existingNames: readonly string[],
): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Give the course its name.'
  if (trimmed.length > MAX_COURSE_NAME) {
    return `That name is too long — ${MAX_COURSE_NAME} characters at most.`
  }
  const folded = fold(trimmed)
  if (existingNames.some(n => fold(n.trim()) === folded)) {
    return `${trimmed} is already on the list — pick it from the course list instead.`
  }
  return null
}

/**
 * A typed address turned into one worth storing, or null if there is
 * nothing usable in it. "carnegolflinks.com" becomes
 * "https://carnegolflinks.com/" — nobody types the scheme on a phone.
 */
export function normalizeWebsite(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  // A hostname needs at least one dot — "golfclub" is not an address.
  if (!url.hostname.includes('.')) return null
  return url.toString()
}

/** Why the website field cannot be saved, or null. Blank is fine — it is optional. */
export function websiteError(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (trimmed.length > MAX_WEBSITE) {
    return `That address is too long — ${MAX_WEBSITE} characters at most.`
  }
  if (!normalizeWebsite(trimmed)) {
    return 'That does not look like a web address — try something like carnegolflinks.com.'
  }
  return null
}

// ─── The tees a new course arrives with ────────────────────────

/** A tee as the form holds it: everything a string until it is checked. */
export type TeeDraft = {
  name: string
  gender: 'M' | 'F'
  par: string
  courseRating: string
  slope: string
}

/** A tee ready for the `tees` table. */
export type NewTee = {
  name: string
  gender: 'M' | 'F'
  par: number
  course_rating: number
  slope: number
}

export const emptyTeeDraft = (gender: 'M' | 'F' = 'M'): TeeDraft => ({
  name: '',
  gender,
  par: '',
  courseRating: '',
  slope: '',
})

/** A row nobody touched — skipped rather than failed. */
export const teeDraftBlank = (t: TeeDraft): boolean =>
  !t.name.trim() && !t.par.trim() && !t.courseRating.trim() && !t.slope.trim()

const inRange = (n: number, [lo, hi]: [number, number]) => n >= lo && n <= hi

/**
 * Why this tee cannot be saved, or null if it can. The ranges are the card
 * check's own — `TEE_COLUMN_RANGE` in lib/cardCheck.ts — so the form
 * cannot accept a number the check would later refuse.
 */
export function teeDraftError(t: TeeDraft): string | null {
  if (!t.name.trim()) return 'Give the tee its colour — White, Red, Blue…'
  const par = Number(t.par)
  if (!Number.isInteger(par) || !inRange(par, TEE_COLUMN_RANGE.par)) {
    return `${t.name.trim()}: par is the course total — ${TEE_COLUMN_RANGE.par[0]} to ${TEE_COLUMN_RANGE.par[1]}.`
  }
  const cr = Number(t.courseRating)
  if (!Number.isFinite(cr) || !inRange(cr, TEE_COLUMN_RANGE.course_rating)) {
    return `${t.name.trim()}: course rating runs ${TEE_COLUMN_RANGE.course_rating[0]} to ${TEE_COLUMN_RANGE.course_rating[1]} — it is printed with one decimal, like 71.4.`
  }
  const slope = Number(t.slope)
  if (!Number.isInteger(slope) || !inRange(slope, TEE_COLUMN_RANGE.slope)) {
    return `${t.name.trim()}: slope runs ${TEE_COLUMN_RANGE.slope[0]} to ${TEE_COLUMN_RANGE.slope[1]}.`
  }
  return null
}

/** The draft as a row, after `teeDraftError` said null. */
export function parseTeeDraft(t: TeeDraft): NewTee {
  return {
    name: t.name.trim(),
    gender: t.gender,
    par: Number(t.par),
    course_rating: Number(t.courseRating),
    slope: Number(t.slope),
  }
}

/**
 * Server-side check of a tee that arrived off the wire — the API route
 * trusts nothing the form said it validated. Same ranges, same rules.
 */
export function validNewTee(t: unknown): t is NewTee {
  if (typeof t !== 'object' || t === null) return false
  const { name, gender, par, course_rating, slope } = t as NewTee
  return (
    typeof name === 'string' && name.trim().length > 0 && name.length <= 40 &&
    (gender === 'M' || gender === 'F') &&
    Number.isInteger(par) && inRange(par, TEE_COLUMN_RANGE.par) &&
    typeof course_rating === 'number' && Number.isFinite(course_rating) &&
    inRange(course_rating, TEE_COLUMN_RANGE.course_rating) &&
    Number.isInteger(slope) && inRange(slope, TEE_COLUMN_RANGE.slope)
  )
}
