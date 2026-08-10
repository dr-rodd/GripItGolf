/**
 * The course directory. Run with: npm run test:course-directory
 *
 * `lib/courseDirectory.ts` decides what the course picker shows and what a
 * new course must look like before it is allowed in. The bugs that matter:
 *
 *   1. Filtering. A search must find a course by name or by town, and the
 *      region chips must come from the stored locations, not a hand list.
 *   2. Admission. A duplicate name, a nonsense website, a slope of 300 —
 *      all refused in words, and the server-side check refuses the same
 *      things the form does.
 *   3. The tee ranges are the card check's own — the two must not drift.
 */

import {
  regionOf, regionList, filterCourses, slugify,
  courseNameError, normalizeWebsite, websiteError,
  emptyTeeDraft, teeDraftBlank, teeDraftError, parseTeeDraft, validNewTee,
  type DirectoryCourse, type TeeDraft,
} from '../lib/courseDirectory'
import { TEE_COLUMN_RANGE } from '../lib/cardCheck'

let passed = 0, failed = 0
const failures: string[] = []
function ok(cond: boolean, label: string) {
  if (cond) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
function eq(got: unknown, want: unknown, label: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}\n        got  ${g}\n        want ${w}`) }
}
const section = (n: string) => console.log(`\n${n}`)

// ─── Fixtures — real shapes off the seed data ──────────────────

const COURSES: DirectoryCourse[] = [
  { id: '1', name: 'Ballybunion Golf Club -- Old Course', location: 'Ballybunion, Kerry, Ireland' },
  { id: '2', name: 'Donegal Golf Club', location: 'Murvagh, Laghey, Donegal, Ireland' },
  { id: '3', name: 'County Sligo Golf Club -- Colt Championship', location: 'Rosses Point, Sligo, Ireland' },
  { id: '4', name: 'Narin & Portnoo Links', location: 'Portnoo, Donegal, Ireland' },
  { id: '5', name: 'Royal County Down -- Championship', location: 'Newcastle, County Down, Northern Ireland' },
  { id: '6', name: 'Somewhere New', location: null },
]

// ─── Regions ───────────────────────────────────────────────────

section('regionOf')
{
  eq(regionOf('Ballybunion, Kerry, Ireland'), 'Kerry', 'county is the second-to-last segment')
  eq(regionOf('Murvagh, Laghey, Donegal, Ireland'), 'Donegal', 'four segments still land on the county')
  eq(regionOf('Newcastle, County Down, Northern Ireland'), 'County Down', 'Northern Ireland is the country, not the county')
  eq(regionOf('Lahinch'), 'Lahinch', 'one segment is its own region')
  eq(regionOf(''), null, 'blank location has no region')
  eq(regionOf(null), null, 'null location has no region')
  eq(regionOf(' , , '), null, 'commas alone have no region')
}

section('regionList')
{
  eq(regionList(COURSES), ['County Down', 'Donegal', 'Kerry', 'Sligo'],
    'every region with a course, alphabetical, no duplicates')
  eq(regionList([]), [], 'no courses, no chips')
}

// ─── Filtering ─────────────────────────────────────────────────

section('filterCourses')
{
  eq(filterCourses(COURSES, '', null).length, 6, 'no search, no region — everything')
  eq(filterCourses(COURSES, 'sligo', null).map(c => c.id), ['3'], 'search matches the name')
  eq(filterCourses(COURSES, 'murvagh', null).map(c => c.id), ['2'], 'search matches the town')
  eq(filterCourses(COURSES, 'SLIGO', null).map(c => c.id), ['3'], 'search is case-blind')
  eq(filterCourses(COURSES, '', 'Donegal').map(c => c.id), ['2', '4'], 'region chip narrows to the county')
  eq(filterCourses(COURSES, 'portnoo', 'Donegal').map(c => c.id), ['4'], 'search and region compose')
  eq(filterCourses(COURSES, 'portnoo', 'Kerry').length, 0, 'a wrong region beats a right search')
  eq(filterCourses(COURSES, '', 'Kerry').map(c => c.id), ['1'], 'a course with no location sits under no chip')
  eq(filterCourses(COURSES, '  ', null).length, 6, 'whitespace search is no search')
}

// ─── Slugs ─────────────────────────────────────────────────────

section('slugify')
{
  eq(slugify('Carne Golf Links -- Wild Atlantic Dunes'), 'carne-golf-links-wild-atlantic-dunes', 'punctuation collapses to hyphens')
  eq(slugify('  Narin & Portnoo Links  '), 'narin-portnoo-links', 'ampersands and edges vanish')
  eq(slugify('Ähtäri Golf'), 'ahtari-golf', 'accents fold away')
}

// ─── The name ──────────────────────────────────────────────────

section('courseNameError')
{
  const names = COURSES.map(c => c.name)
  eq(courseNameError('Lahinch Golf Club', names), null, 'a new name passes')
  ok(courseNameError('', names) !== null, 'blank is refused')
  ok(courseNameError('   ', names) !== null, 'whitespace is refused')
  ok(courseNameError('donegal golf club', names) !== null, 'a duplicate is caught case-blind')
  ok((courseNameError('Donegal Golf Club', names) ?? '').includes('already on the list'),
    'the duplicate answer points back at the picker')
  ok(courseNameError('x'.repeat(81), names) !== null, 'an 81-character name is refused')
  eq(courseNameError('x'.repeat(80), names), null, 'an 80-character name passes')
}

// ─── The website ───────────────────────────────────────────────

section('normalizeWebsite / websiteError')
{
  eq(normalizeWebsite('carnegolflinks.com'), 'https://carnegolflinks.com/', 'a bare domain gains https')
  eq(normalizeWebsite('http://example.com/course'), 'http://example.com/course', 'an explicit scheme is kept')
  eq(normalizeWebsite(''), null, 'blank is nothing, not an error')
  eq(normalizeWebsite('not a website'), null, 'prose is not an address')
  eq(normalizeWebsite('golfclub'), null, 'a hostname needs a dot')
  eq(normalizeWebsite('javascript:alert(1)'), null, 'only http and https survive')
  eq(normalizeWebsite('ftp://example.com'), null, 'ftp is refused')
  eq(websiteError(''), null, 'the field is optional')
  eq(websiteError('carnegolflinks.com'), null, 'a plausible address passes')
  ok(websiteError('not a website') !== null, 'a bad address is refused in words')
  ok(websiteError('a.b/' + 'x'.repeat(200)) !== null, 'an over-long address is refused')
}

// ─── Tees ──────────────────────────────────────────────────────

section('tee drafts')
{
  const good: TeeDraft = { name: 'White', gender: 'M', par: '72', courseRating: '71.4', slope: '125' }
  eq(teeDraftError(good), null, 'a full tee passes')
  eq(parseTeeDraft(good), { name: 'White', gender: 'M', par: 72, course_rating: 71.4, slope: 125 },
    'parsing keeps the decimal course rating')

  ok(teeDraftBlank(emptyTeeDraft()), 'an untouched row is blank')
  ok(!teeDraftBlank({ ...emptyTeeDraft(), par: '72' }), 'a touched row is not blank')

  ok(teeDraftError({ ...good, name: ' ' }) !== null, 'a tee needs its colour')
  ok(teeDraftError({ ...good, par: '59' }) !== null, 'par below range is refused')
  ok(teeDraftError({ ...good, par: '72.5' }) !== null, 'a fractional par is refused')
  ok(teeDraftError({ ...good, courseRating: '90' }) !== null, 'course rating above range is refused')
  ok(teeDraftError({ ...good, slope: '156' }) !== null, 'slope 156 is refused')
  eq(teeDraftError({ ...good, slope: '155' }), null, 'slope 155 — the top of the range — passes')
  ok(teeDraftError({ ...good, slope: 'abc' }) !== null, 'a non-number slope is refused')
}

section('validNewTee — the wire check refuses what the form refuses')
{
  const good = { name: 'White', gender: 'M', par: 72, course_rating: 71.4, slope: 125 }
  ok(validNewTee(good), 'a good row passes')
  ok(!validNewTee(null), 'null is refused')
  ok(!validNewTee({ ...good, gender: 'X' }), 'an unknown gender is refused')
  ok(!validNewTee({ ...good, par: 59 }), 'par outside the card-check range is refused')
  ok(!validNewTee({ ...good, course_rating: '71.4' }), 'a string course rating is refused')
  ok(!validNewTee({ ...good, slope: 155.5 }), 'a fractional slope is refused')
  ok(!validNewTee({ ...good, name: '' }), 'a nameless tee is refused')
  ok(!validNewTee({ ...good, name: 'x'.repeat(41) }), 'an over-long tee name is refused')
  // The ranges really are the card check's — not a copy that can drift.
  ok(!validNewTee({ ...good, slope: TEE_COLUMN_RANGE.slope[1] + 1 }),
    'one past the shared slope ceiling is refused')
  ok(validNewTee({ ...good, slope: TEE_COLUMN_RANGE.slope[1] }),
    'the shared slope ceiling itself passes')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(failures.map(f => `  - ${f}`).join('\n'))
  process.exit(1)
}
