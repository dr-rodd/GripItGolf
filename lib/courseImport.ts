// Adding platform courses in bulk, from researched data rather than a photo.
//
// The picker's 26 platform courses were each hand-written into a migration
// (`20260101000004/5_platform_courses_a|b.sql`, tees in `_008`). That does not
// scale to fifty. This module is the pure half of the replacement: what a
// `data/courses/<slug>.json` file must be before it is allowed to become SQL,
// and how a validated batch turns into a migration file.
//
// **Pure. No I/O.** `scripts/build-course-migration.ts` reads the directory
// and writes the migrations; `scripts/test-course-import.ts` runs the gate.
// Same division as `lib/weather.ts` against its route, and `lib/cardCheck.ts`
// against its own.
//
// Three rules this file exists to hold:
//
// - **It restates nothing.** Every rule a course must already satisfy lives
//   in `cardCheck.ts` or `courseDirectory.ts` and is imported, not copied —
//   a research file's holes ARE `NewHoleRow[]` and its tees ARE `NewTeeRow[]`,
//   DB column names and all, precisely so `validateNewHoleRows` and
//   `validNewTee` can be called on them with no adapter in between. An
//   adapter is the thing that drifts.
// - **What it adds is only what the app layer cannot know**: the constraints
//   Postgres has and TypeScript does not. Chiefly that **`holes.par` is
//   CHECKed 3 to 5 in the database while every app validator allows 3 to 6** —
//   a par-6 hole passes the card check and then kills the migration.
// - **Researched is not photographed.** Every generated course carries
//   `card_verified = false`. The holes make it playable (`hasCard` is
//   `holes.length > 0`); the badge says honestly that no photograph has
//   confirmed it. A later photo takes `diffCard`'s correction path, because
//   `handleCreate` refuses a course that already has holes.

import {
  validateNewHoleRows, diffCard, TEE_COLUMN_RANGE,
  type NewHoleRow, type NewTeeRow, type ExtractedCard,
  type StoredHole, type StoredTee,
} from './cardCheck'
import {
  courseNameError, countyError, countyOf, websiteError, normalizeWebsite,
  slugify, validNewTee, courseNameKey, IRISH_COUNTIES, MAX_LOCATION,
} from './courseDirectory'
import { truncCoord } from './weather'

// ─── The vocabulary ────────────────────────────────────────────

/**
 * How much a figure is trusted, in migration 008's words — it annotated every
 * course it seeded this way and the generated files continue the convention.
 */
export const CONFIDENCE = ['HIGH', 'MEDIUM', 'LOW', 'EST'] as const
export type Confidence = (typeof CONFIDENCE)[number]

/**
 * Holes below this are refused outright.
 *
 * A wrong slope costs a fraction of a shot and a scorecard photo corrects it.
 * A wrong stroke index mis-hands shots on every round of that course, for
 * every trip, forever — and nothing on any screen ever says so. The two are
 * not the same risk, so they do not get the same floor.
 */
export const HOLE_CONFIDENCE_FLOOR: readonly Confidence[] = ['HIGH', 'MEDIUM']

/**
 * What Postgres allows in `holes.par` — `check (par between 3 and 5)`, from
 * migration 000. **This is tighter than the application's 3 to 6**, which
 * `cardCheck.ts` applies in four places, so a par-6 hole passes every app
 * validator and is then rejected by the database. This is the only place in
 * the codebase that knows, and the only reason it is a constant rather than
 * a reused import is that there is nothing to reuse: no app rule agrees.
 *
 * `supabase/migrations/20260101000033_hole_par_six.sql` closes the gap by
 * widening the CHECK. Apply it and this becomes `[3, 6]`; until then a
 * generated migration must not carry a par 6.
 */
export const DB_HOLE_PAR: [number, number] = [3, 5]

/**
 * The box `courses_coordinates_sane` allows — migration 026, Ireland and
 * Britain. The CHECK is the authority; this is its twin, held against it by
 * `test:course-import` the way `test:weather` holds the coordinates.
 */
export const COORD_BOX = { lat: [49, 61], lon: [-11, 2] } as const

/** A hole total outside this is legal but odd enough to mention. */
const USUAL_PAR_TOTAL: [number, number] = [68, 74]

// ─── The file ──────────────────────────────────────────────────

/**
 * One `data/courses/<slug>.json`.
 *
 * `holes` and `tees` are the card check's own row types — not a shape of this
 * module's invention. That is what lets the gate below be mostly a list of
 * other people's validators.
 */
export type CourseImport = {
  name: string
  /** Short and human — `lahinch-old`, not `slugify(name)`. */
  slug: string
  county: string
  location: string
  website: string
  latitude: number
  longitude: number
  holesConfidence: Confidence
  teesConfidence: Confidence
  /** One line, or null. Becomes a `-- Note:` comment in the migration. */
  note: string | null
  sources: {
    holes: string[]
    tees: string[]
    coordinates?: string
  }
  holes: NewHoleRow[]
  tees: NewTeeRow[]
}

/** One thing wrong with one file. `fatal` blocks the import; otherwise it prints. */
export type ImportProblem = {
  file: string
  fatal: boolean
  message: string
}

const fatal = (file: string, message: string): ImportProblem => ({ file, fatal: true, message })
const warn = (file: string, message: string): ImportProblem => ({ file, fatal: false, message })

/** Only the problems that stop the import. */
export const fatalsOf = (problems: readonly ImportProblem[]) => problems.filter(p => p.fatal)

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isConfidence = (v: unknown): v is Confidence =>
  typeof v === 'string' && (CONFIDENCE as readonly string[]).includes(v)

// ─── The tee par against the holes ─────────────────────────────

/**
 * Whether each tee's par agrees with what that gender's holes add up to.
 *
 * The rule already exists — it is the fallback branch inside `diffCard`,
 * which exists because the playing-handicap formula reads `tees.par`, so a
 * par corrected on the holes and left alone on the tee quietly keeps scoring
 * off the old total. Rather than add a second sum that can disagree with it,
 * this asks `diffCard` the question directly.
 *
 * The card is built from the file and diffed against the same file: the holes
 * are identical on both sides so `holeChanges` is empty by construction, and
 * the tees carry `par`, `courseRating` and `slope` as **null on purpose** — a
 * null course rating or slope challenges nothing, and a null tee par is
 * exactly what makes `diffCard` fall back to the gender's hole total. So the
 * only thing it can report is the disagreement being looked for.
 */
export function teeParProblems(course: CourseImport): string[] {
  const card: ExtractedCard = {
    courseName: course.name,
    holes: course.holes.map(h => ({
      number: h.hole_number,
      par: h.par,
      strokeIndex: h.stroke_index,
      parLadies: h.par_ladies,
      strokeIndexLadies: h.stroke_index_ladies,
      yardages: {},
    })),
    tees: course.tees.map(t => ({
      name: t.name, gender: t.gender, par: null, courseRating: null, slope: null,
    })),
  }
  const storedHoles: StoredHole[] = course.holes.map(h => ({ id: String(h.hole_number), ...h }))
  const storedTees: StoredTee[] = course.tees.map((t, i) => ({ id: String(i), ...t }))

  return diffCard(card, storedHoles, storedTees).teeChanges.map(c =>
    `The ${c.teeName} (${c.gender === 'F' ? 'ladies' : 'men'}) tee says par ${c.from}, ` +
    `but those holes add up to ${c.to}.`)
}

// ─── One file ──────────────────────────────────────────────────

/**
 * Every reason this parsed file cannot be imported, plus its warnings.
 *
 * Written for whoever is reading the failure — each message is a sentence
 * naming the course and what is wrong, the same voice `validateCard` uses.
 */
export function validateCourseImport(file: string, parsed: unknown): ImportProblem[] {
  const problems: ImportProblem[] = []
  const F = (m: string) => problems.push(fatal(file, m))
  const W = (m: string) => problems.push(warn(file, m))

  if (!isObject(parsed)) {
    return [fatal(file, 'The file is not a JSON object.')]
  }
  const c = parsed as Partial<CourseImport>

  // ── Identity ──
  if (typeof c.name !== 'string') F('`name` is missing.')
  else {
    const err = courseNameError(c.name, [])
    if (err) F(err)
  }

  if (typeof c.slug !== 'string' || c.slug.length === 0) F('`slug` is missing.')
  else {
    if (slugify(c.slug) !== c.slug) {
      F(`The slug "${c.slug}" is not in slug form — lower case, digits and single hyphens.`)
    }
    if (file !== `${c.slug}.json`) {
      F(`The file is named ${file} but the slug is "${c.slug}" — they must match.`)
    }
  }

  if (typeof c.county !== 'string') F('`county` is missing.')
  else {
    const err = countyError(c.county)
    if (err) F(err)
    else {
      // Stored canonical, so `countyOf` on read is a no-op and the picker's
      // chips cannot split one county across two spellings.
      const canonical = countyOf({ county: c.county, location: null })
      if (canonical !== c.county) {
        F(`The county "${c.county}" is not canonical — write it as "${canonical}".`)
      } else if (!(IRISH_COUNTIES as readonly string[]).includes(c.county)) {
        W(`"${c.county}" is not one of the thirty-two — right for a course outside Ireland, worth a look otherwise.`)
      }
    }
  }

  if (typeof c.location !== 'string' || c.location.trim().length === 0) {
    F('`location` is missing.')
  } else if (c.location.length > MAX_LOCATION) {
    F(`That location is too long — ${MAX_LOCATION} characters at most.`)
  }

  if (typeof c.website !== 'string') F('`website` is missing.')
  else {
    const err = websiteError(c.website)
    if (err) F(err)
    else if (normalizeWebsite(c.website) !== c.website) {
      F(`Write the website as "${normalizeWebsite(c.website)}" — the form stores it normalised.`)
    }
  }

  // ── Coordinates ──
  // Required, not optional: without them the course has no weather, and the
  // other 26 all have it. Migration 026's CHECK is the authority.
  const { latitude: lat, longitude: lon } = c
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    F('`latitude` and `longitude` are both required — the course, not the town.')
  } else {
    if (lat < COORD_BOX.lat[0] || lat > COORD_BOX.lat[1] ||
        lon < COORD_BOX.lon[0] || lon > COORD_BOX.lon[1]) {
      F(`${lat}, ${lon} is outside Ireland and Britain — the courses_coordinates_sane ` +
        `CHECK allows ${COORD_BOX.lat[0]} to ${COORD_BOX.lat[1]} north and ` +
        `${COORD_BOX.lon[0]} to ${COORD_BOX.lon[1]} east, and would refuse the insert.`)
    }
    if (truncCoord(lat) !== lat || truncCoord(lon) !== lon) {
      F('Coordinates carry four decimal places at most — the column is numeric(7,4) ' +
        'and MET Norway refuses more.')
    }
  }

  // ── Provenance ──
  if (!isConfidence(c.holesConfidence)) {
    F(`\`holesConfidence\` must be one of ${CONFIDENCE.join(', ')}.`)
  } else if (!HOLE_CONFIDENCE_FLOOR.includes(c.holesConfidence)) {
    F(`The holes are ${c.holesConfidence} confidence. A wrong stroke index mis-hands ` +
      'shots on every round of this course, forever — omit the course rather than guess.')
  }
  if (!isConfidence(c.teesConfidence)) {
    F(`\`teesConfidence\` must be one of ${CONFIDENCE.join(', ')}.`)
  }
  if (c.note !== null && typeof c.note !== 'string') {
    F('`note` must be a line of text, or null.')
  }

  const sources = c.sources
  if (!isObject(sources)) {
    F('`sources` is missing — where the holes and the tees were read.')
  } else {
    const urls = (v: unknown): string[] => Array.isArray(v) ? v.filter(u => typeof u === 'string') : []
    const holeSources = urls(sources.holes)
    const teeSources = urls(sources.tees)
    if (holeSources.length === 0) F('`sources.holes` needs at least one address.')
    if (Array.isArray(c.tees) && c.tees.length > 0 && teeSources.length === 0) {
      F('`sources.tees` needs at least one address — the tees rarely come from the same page as the card.')
    }
    const all = [...holeSources, ...teeSources,
      ...(typeof sources.coordinates === 'string' ? [sources.coordinates] : [])]
    for (const u of all) {
      if (!normalizeWebsite(u)) F(`"${u}" is not a web address — a source is a link, not a description.`)
    }
  }

  // ── The card ──
  if (!Array.isArray(c.holes)) {
    F('`holes` is missing.')
  } else {
    // The card check's own gate: 18 rows numbered 1–18, a strict column
    // whitelist, par 3–6, stroke index a permutation of 1–18, the ladies
    // card all or nothing per column, yardages in range.
    for (const m of validateNewHoleRows(c.holes)) F(m)

    // And the one it cannot know.
    const holes = c.holes as NewHoleRow[]
    const outside = (p: unknown) =>
      typeof p === 'number' && (p < DB_HOLE_PAR[0] || p > DB_HOLE_PAR[1])
    const badPar = holes.filter(h => isObject(h) && outside(h.par))
    if (badPar.length > 0) {
      F(`Par ${badPar[0].par} on hole ${badPar.map(h => h.hole_number).join(', ')} — ` +
        `Postgres CHECKs holes.par between ${DB_HOLE_PAR[0]} and ${DB_HOLE_PAR[1]}, ` +
        'so the card check would allow this and the migration would fail on it.')
    }
    const badLadies = holes.filter(h => isObject(h) && outside(h.par_ladies))
    if (badLadies.length > 0) {
      F(`Ladies par on hole ${badLadies.map(h => h.hole_number).join(', ')} is outside ` +
        `${DB_HOLE_PAR[0]} to ${DB_HOLE_PAR[1]}, which Postgres would refuse.`)
    }

    if (holes.length === 18 && holes.every(h => isObject(h) && typeof h.par === 'number')) {
      const total = holes.reduce((s, h) => s + h.par, 0)
      const [floor, ceiling] = TEE_COLUMN_RANGE.par
      if (total < floor || total > ceiling) {
        F(`Those holes add up to par ${total}, outside the ${floor} to ${ceiling} a course plays to.`)
      } else if (total < USUAL_PAR_TOTAL[0] || total > USUAL_PAR_TOTAL[1]) {
        W(`Par ${total} is unusual — legal, but worth checking against the card.`)
      }
    }
  }

  // ── The tees ──
  if (!Array.isArray(c.tees)) {
    F('`tees` is missing.')
  } else {
    // Off the wire, so `unknown` — `validNewTee` is a type guard, and against
    // an already-typed array its negative branch would narrow to `never`.
    const tees = c.tees as unknown[]
    tees.forEach((t, i) => {
      if (!validNewTee(t)) {
        const named = isObject(t) && typeof t.name === 'string' ? `"${t.name}"` : `#${i + 1}`
        F(`Tee ${named} is not writable — a name, M or F, and par, course rating and slope all in range.`)
      }
    })
    const seen = new Set<string>()
    for (const t of tees) {
      if (!isObject(t) || typeof t.name !== 'string') continue
      const key = `${t.name.trim().toLowerCase()}:${t.gender}`
      if (seen.has(key)) {
        F(`The ${t.name} tee appears twice for the same gender — uq_tees_course_name_gender would refuse it.`)
      }
      seen.add(key)
    }
    if (!tees.some(t => isObject(t) && t.gender === 'M')) {
      F('There is no men\'s tee — a course needs at least one.')
    }
    if (!tees.some(t => isObject(t) && t.gender === 'F')) {
      // Not fatal: a club that publishes no ladies card is a real course, and
      // refusing it would drop it entirely. `teesForPlayer` carries a woman
      // onto the men's tees, and `effectivePar` onto the men's pars — which
      // is what happens on the day anyway. Worth saying out loud all the same.
      W('There is no ladies tee — a woman here plays off the men\'s.')
    }
  }

  // The cross-check, only once both halves are sound enough to compare.
  if (fatalsOf(problems).length === 0) {
    for (const m of teeParProblems(c as CourseImport)) F(m)
  }

  return problems
}

// ─── The set ───────────────────────────────────────────────────

/**
 * The problems that only exist between files, or against what has already
 * shipped. `existing` is every platform course the migrations already insert.
 */
export function validateImportSet(
  courses: readonly { file: string; course: CourseImport }[],
  existing: readonly { name: string; slug: string }[],
): ImportProblem[] {
  const problems: ImportProblem[] = []
  const takenSlugs = new Map<string, string>()
  for (const e of existing) takenSlugs.set(e.slug, 'already on the platform')

  // Names reduced to what identifies them, so punctuation and "The" cannot
  // smuggle a second row for a course that is already here. `courseNameError`
  // below still runs — it holds the blank and over-long rules, and its
  // fold-exact duplicate check is the one the add-course form shares.
  const takenKeys = new Map<string, string>()
  for (const e of existing) takenKeys.set(courseNameKey(e.name), `already on the platform as "${e.name}"`)

  const coords = new Map<string, string>()

  for (const { file, course } of courses) {
    const already = takenSlugs.get(course.slug)
    if (already) {
      // Not a harmless skip. `INSERT INTO courses … ON CONFLICT DO NOTHING`
      // drops the duplicate row, and then the holes insert's
      // `JOIN courses c ON c.slug = …` finds the OTHER course and hangs
      // these eighteen holes off it.
      problems.push(fatal(file,
        `The slug "${course.slug}" is ${already}. These holes would be joined onto ` +
        'that course instead of this one — a live card, silently replaced.'))
    } else {
      takenSlugs.set(course.slug, `used by ${file}`)
    }

    const siblings = courses.filter(o => o.file !== file).map(o => o.course.name)
    const nameErr = courseNameError(course.name, [...existing.map(e => e.name), ...siblings])
    if (nameErr) problems.push(fatal(file, nameErr))

    const key = courseNameKey(course.name)
    const clash = takenKeys.get(key)
    if (clash) {
      problems.push(fatal(file,
        `"${course.name}" reads as the same course as ${clash} — punctuation and ` +
        'the words The, Golf, Club, Links and Course aside, they are one club. Two rows ' +
        'for one club cannot be merged afterwards, and the second collects its own scores.'))
    } else {
      // A containment warning, not a second fatal: "Old Tom Morris" is a strict
      // subset of "Rosapenna Golf Resort -- Old Tom Morris Links" and really is
      // the same course, but plenty of genuinely different courses share a word.
      // The two-token floor keeps "Island" (The Island Golf Club) quiet against
      // "Fota Island". Silent on everything shipped today.
      const mine = new Set(key.split(' '))
      for (const [other, where] of takenKeys) {
        const theirs = new Set(other.split(' '))
        const [small, big] = mine.size < theirs.size ? [mine, theirs] : [theirs, mine]
        if (small.size >= 2 && small.size < big.size && [...small].every(w => big.has(w))) {
          problems.push(warn(file,
            `"${course.name}" and ${where} share every identifying word of the shorter ` +
            'name. Check they are two courses and not one written two ways.'))
        }
      }
      takenKeys.set(key, `"${course.name}" in ${file}`)
    }

    const here = `${course.latitude},${course.longitude}`
    const other = coords.get(here)
    if (other) {
      problems.push(warn(file, `Same coordinates as ${other} — one of them is a copy-paste slip.`))
    } else {
      coords.set(here, file)
    }
  }

  return problems
}

// ─── Reading what has already shipped ──────────────────────────

/**
 * Every platform course a migration file inserts.
 *
 * The 26 that exist live in `supabase/migrations/`, which makes the
 * migrations the source — the same reasoning `test:weather` applies to
 * migration 026's coordinates and `test:handicap` to 024's function. A
 * checked-in list here would be a second copy of a fact that already has a
 * home, and would go stale the moment a 27th course landed.
 *
 * Generated migrations are written in this same shape, so re-running the
 * generator sees its own previous output and a second batch cannot collide
 * with the first. That property is free with a parse and impossible with a
 * hardcoded list.
 *
 * Pure — the caller reads the files.
 */
export function platformCoursesInSql(sql: string): { name: string; slug: string }[] {
  const rows: { name: string; slug: string }[] = []
  const re = /^\s*\(NULL,\s*'((?:[^']|'')*)',\s*'([a-z0-9-]+)'/gm
  for (const m of sql.matchAll(re)) {
    rows.push({ name: m[1].replace(/''/g, "'"), slug: m[2] })
  }
  return rows
}

// ─── The migration ─────────────────────────────────────────────

const q = (s: string) => `'${s.replace(/'/g, "''")}'`
/** Quoted values line up on the left, as the hand-written seeds do. */
const pad = (s: string, width: number) => s + ' '.repeat(Math.max(0, width - s.length))
/** Numbers line up on the right — `( 1::int, 4::int,  5::int, …)`, as in 004. */
const padNum = (s: string, width: number) => ' '.repeat(Math.max(0, width - s.length)) + s
const widest = (values: readonly string[]) => values.reduce((w, v) => Math.max(w, v.length), 0)

/** Migration 008's rule, restated in the file it generates rather than in code. */
const CONFIDENCE_KEY = `--   HIGH   = confirmed from 3+ independent sources
--   MEDIUM = confirmed from 1-2 sources, internally consistent
--   LOW    = single source or conflicting; treat as provisional
--   EST    = estimated; verify against Golf Ireland before use`

/** The line that says a migration is this pipeline's own output. */
export const GENERATED_MARKER =
  '-- GENERATED by scripts/build-course-migration.ts from data/courses/*.json — do not hand-edit.'

/**
 * Whether a migration is one this pipeline wrote.
 *
 * It matters twice, and both times for the same reason: a generated
 * migration is nothing but a projection of `data/courses/`, so reading it
 * back as "already on the platform" would make every course collide with
 * itself the moment the generator ran a second time. The collision check and
 * the renumbering both skip these files; only hand-written migrations count
 * as shipped.
 */
export const isGeneratedSql = (sql: string): boolean =>
  sql.split('\n', 2)[1] === GENERATED_MARKER

const holesBlock = (c: CourseImport): string => {
  const cell = (n: number | null) => n === null ? 'NULL' : String(n)
  const cols = [
    c.holes.map(h => String(h.hole_number)),
    c.holes.map(h => String(h.par)),
    c.holes.map(h => String(h.stroke_index)),
    c.holes.map(h => cell(h.par_ladies)),
    c.holes.map(h => cell(h.stroke_index_ladies)),
  ]
  // The first row carries the casts, exactly as 004/005 do — and it is what
  // gives an all-NULL ladies column a type. Every later row pads to the same
  // width so the columns line up underneath it.
  const w = cols.map((col, j) => Math.max(widest(col), j === 0 ? 2 : 1))
  const CAST = '::int'
  const rows = c.holes.map((_, i) => {
    const cells = cols.map((col, j) => {
      const value = padNum(col[i], w[j]) + (i === 0 ? CAST : '')
      const last = j === cols.length - 1
      return last ? value : pad(value + ',', w[j] + CAST.length + 1)
    })
    return `  (${cells.join(' ').trimEnd()})`
  })

  const menPar = c.holes.reduce((s, h) => s + h.par, 0)
  const hasLadies = c.holes.every(h => h.par_ladies != null)
  const ladiesPar = hasLadies ? c.holes.reduce((s, h) => s + h.par_ladies!, 0) : null
  const parLine = ladiesPar === null
    ? `par ${menPar} men`
    : `par ${menPar} men / ${ladiesPar} ladies`

  return [
    `-- ── ${c.name} (${parLine}) ──`,
    `-- HOLES ${c.holesConfidence}: ${c.sources.holes.join(', ')}`,
    ...(c.note ? [`-- Note: ${c.note}`] : []),
    'INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)',
    'SELECT c.id, v.n, v.p, v.s, v.pl, v.sl',
    'FROM (VALUES',
    rows.join(',\n'),
    ') AS v(n, p, s, pl, sl)',
    `JOIN courses c ON c.slug = ${q(c.slug)} AND c.trip_id IS NULL`,
    'ON CONFLICT DO NOTHING;',
  ].join('\n')
}

/**
 * One batch as a whole migration file. Deterministic — the same courses in
 * the same order produce the same bytes, so re-running the generator after
 * editing one course shows only that course in the diff.
 */
export function migrationSql(
  batch: readonly CourseImport[],
  opts: { number: string; letter: string },
): string {
  const out: string[] = []

  out.push('-- ============================================================')
  out.push(GENERATED_MARKER)
  out.push('--')
  out.push(`-- Platform courses batch ${opts.letter.toUpperCase()}: ${batch.length} course${batch.length === 1 ? '' : 's'}.`)
  out.push('--')
  out.push('-- Confidence is noted per course, in migration 008\'s words:')
  out.push(CONFIDENCE_KEY)
  out.push('--')
  out.push('-- Holes are HIGH or MEDIUM only. A wrong stroke index mis-hands shots on')
  out.push('-- every round of this course, forever, and no screen ever says so. Tee')
  out.push('-- ratings may be lower: a wrong slope is a fraction of a shot, and a')
  out.push('-- scorecard photo corrects it.')
  out.push('--')
  out.push('-- card_verified stays false on every row. The holes make the course')
  out.push('-- playable (`hasCard` is holes.length > 0); the badge says, honestly, that')
  out.push('-- no photograph has confirmed it yet. A later photo takes the diff path,')
  out.push('-- because handleCreate refuses a course that already has holes.')
  out.push('--')
  out.push('-- Replay-safe: every insert is ON CONFLICT DO NOTHING and nothing here')
  out.push('-- deletes. Migration 008 cleared its tees first; that is no longer safe,')
  out.push('-- because round_handicaps.tee_id is ON DELETE RESTRICT and a tee somebody')
  out.push('-- has played off cannot be removed.')
  out.push('-- ============================================================')
  out.push('')
  // Redundant — both the SQL editor and scripts/migrate.ts run a script as one
  // implicit transaction — but the person pasting it does not know that, and
  // the file should say what it guarantees.
  out.push('BEGIN;')
  out.push('')

  // ── Courses ──
  const cells = batch.map(c => ({
    name: q(c.name),
    slug: q(c.slug),
    location: q(c.location),
    county: q(c.county),
    website: q(c.website),
    lat: String(c.latitude),
    lon: String(c.longitude),
    ladiesVerified: c.holes.every(h => h.par_ladies != null) ? 'true' : 'false',
    ladiesNote: c.holes.every(h => h.par_ladies != null)
      ? 'NULL'
      : q('Ladies card not published — the men\'s numbers are used for everyone'),
  }))
  const w = {
    name: widest(cells.map(x => x.name)),
    slug: widest(cells.map(x => x.slug)),
    location: widest(cells.map(x => x.location)),
    county: widest(cells.map(x => x.county)),
    website: widest(cells.map(x => x.website)),
    lat: widest(cells.map(x => x.lat)),
    lon: widest(cells.map(x => x.lon)),
    ladiesVerified: widest(cells.map(x => x.ladiesVerified)),
  }

  out.push('INSERT INTO courses')
  out.push('  (trip_id, name, slug, location, county, website, latitude, longitude,')
  out.push('   geocoded_at, card_verified, ladies_data_verified, ladies_data_note)')
  out.push('VALUES')
  out.push(batch.map((c, i) => {
    const x = cells[i]
    const map = c.sources.coordinates ? `  -- ${c.sources.coordinates}\n` : ''
    return map +
      `  (NULL, ${pad(x.name + ',', w.name + 1)} ${pad(x.slug + ',', w.slug + 1)} ` +
      `${pad(x.location + ',', w.location + 1)} ${pad(x.county + ',', w.county + 1)} ` +
      `${pad(x.website + ',', w.website + 1)} ` +
      `${padNum(x.lat, w.lat)}, ${padNum(x.lon, w.lon)}, now(), false, ` +
      `${pad(x.ladiesVerified + ',', w.ladiesVerified + 1)} ${x.ladiesNote})`
  }).join(',\n'))
  out.push('ON CONFLICT DO NOTHING;')
  out.push('')

  // ── Holes ──
  for (const c of batch) {
    out.push(holesBlock(c))
    out.push('')
  }

  // ── Tees ──
  const withTees = batch.filter(c => c.tees.length > 0)
  if (withTees.length > 0) {
    const teeCells = withTees.flatMap(c => c.tees.map(t => ({
      slug: q(c.slug),
      name: q(t.name),
      gender: q(t.gender),
      par: String(t.par),
      cr: t.course_rating.toFixed(1),
      slope: String(t.slope),
    })))
    const tw = {
      slug: widest(teeCells.map(x => x.slug)),
      name: widest(teeCells.map(x => x.name)),
      par: widest(teeCells.map(x => x.par)),
      cr: widest(teeCells.map(x => x.cr)),
    }

    out.push('INSERT INTO tees (course_id, name, gender, par, course_rating, slope)')
    out.push('SELECT c.id, spec.tee_name, spec.gender, spec.par::integer,')
    out.push('       spec.course_rating::numeric, spec.slope::integer')
    out.push('FROM (VALUES')

    const blocks: string[] = []
    let n = 0
    for (const c of withTees) {
      const rows = c.tees.map(() => {
        const x = teeCells[n++]
        // The padding goes after the comma, as it does in migration 008 —
        // `'Black',  'M',` rather than `'Black' , 'M',`.
        return `  (${pad(x.slug + ',', tw.slug + 1)} ${pad(x.name + ',', tw.name + 1)} ${x.gender}, ` +
          `${padNum(x.par, tw.par)}, ${padNum(x.cr, tw.cr)}, ${x.slope})`
      })
      blocks.push([
        `  -- ── ${c.name} ──`,
        `  -- TEES ${c.teesConfidence}: ${c.sources.tees.join(', ')}`,
        // Rows within one course are comma-separated like any other; the
        // blank line between courses is cosmetic, matching migration 008.
        rows.join(',\n'),
      ].join('\n'))
    }
    out.push(blocks.join(',\n\n'))

    out.push(') AS spec(slug, tee_name, gender, par, course_rating, slope)')
    out.push('JOIN courses c ON c.slug = spec.slug AND c.trip_id IS NULL')
    out.push('ON CONFLICT ON CONSTRAINT uq_tees_course_name_gender DO NOTHING;')
    out.push('')
  }

  out.push('COMMIT;')
  out.push('')

  return out.join('\n')
}
