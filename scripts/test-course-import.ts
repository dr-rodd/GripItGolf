/**
 * The bulk-course import contract. Run with: npm run test:course-import
 *
 * `lib/courseImport.ts` decides what a `data/courses/*.json` file must be
 * before it can become a migration. The bugs that matter:
 *
 *   1. The rules Postgres has and the application does not. Chiefly par:
 *      the card check allows 3 to 6, the `holes` CHECK allows 3 to 5, so a
 *      par-6 hole passes every app validator and then kills the migration.
 *   2. Cross-file collisions. A repeated slug is not a skipped row — the
 *      holes insert joins on the slug and would hang eighteen holes off a
 *      live course.
 *   3. The generator losing or transposing a number. Swapped par and stroke
 *      index columns produce entirely plausible SQL, so the emitted rows are
 *      read back out and compared.
 *   4. The documented contract drifting from the enforced one — the worked
 *      example in `docs/course-import.md` is validated here.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateCourseImport, validateImportSet, platformCoursesInSql, teeParProblems,
  migrationSql, fatalsOf, CONFIDENCE, HOLE_CONFIDENCE_FLOOR, DB_HOLE_PAR, COORD_BOX,
  GENERATED_MARKER, isGeneratedSql, type CourseImport,
} from '../lib/courseImport'
import { validateNewHoleRows, type NewHoleRow } from '../lib/cardCheck'

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

const MIGRATIONS = join(__dirname, '..', 'supabase', 'migrations')
const DATA_DIR = join(__dirname, '..', 'data', 'courses')
const DOC = join(__dirname, '..', 'docs', 'course-import.md')

const fatalText = (problems: ReturnType<typeof validateCourseImport>) =>
  fatalsOf(problems).map(p => p.message)
const saysAny = (messages: string[], re: RegExp) => messages.some(m => re.test(m))

// ─── Fixtures ──────────────────────────────────────────────────
//
// Built from the documented example, so the fixture and the contract cannot
// disagree. Mutations below are deliberate breakages of one rule each.

function docExample(): unknown {
  const md = readFileSync(DOC, 'utf8')
  const fence = md.match(/```json\n([\s\S]*?)\n```/)
  if (!fence) throw new Error('docs/course-import.md has no json example')
  return JSON.parse(fence[1])
}

const GOOD = docExample() as CourseImport
const clone = (): CourseImport => JSON.parse(JSON.stringify(GOOD))
const withHoles = (holes: NewHoleRow[]): CourseImport => ({ ...clone(), holes })

// ─── The documented example is the enforced contract ───────────

section('The worked example in docs/course-import.md')
{
  const problems = validateCourseImport('example-golf-links.json', GOOD)
  eq(fatalText(problems), [], 'the documented example has no fatal problems')
  eq(problems.filter(p => !p.fatal).map(p => p.message), [], 'and no warnings either')
  eq(GOOD.holes.length, 18, 'it is a full card')
  ok(GOOD.holes.every(h => h.par_ladies != null), 'with the ladies card on every hole')
}

// ─── The rules the application layer does not know ─────────────

section('Par 3 to 5 — the rule with no app-layer twin')
{
  const withPar6 = clone().holes.map(h => h.hole_number === 6 ? { ...h, par: 6 } : h)

  // The headline pair. If either half of this ever stops being true, the
  // divergence has been fixed or reopened and this test should be revisited.
  ok(validateNewHoleRows(withPar6).length === 0,
    'the card check lets a par 6 through — it allows 3 to 6')
  ok(saysAny(fatalText(validateCourseImport('x.json', withHoles(withPar6))), /Postgres/),
    '  …and this gate does not, naming Postgres as the reason')

  eq(DB_HOLE_PAR, [3, 5], 'the DB range is 3 to 5, as migration 000 CHECKs it')

  const withLadies6 = clone().holes.map(h => h.hole_number === 6 ? { ...h, par_ladies: 6 } : h)
  ok(validateNewHoleRows(withLadies6).length === 0, 'the card check allows a ladies par 6 too')
  ok(saysAny(fatalText(validateCourseImport('x.json', withHoles(withLadies6))), /Ladies par/),
    '  …and the ladies column is checked against the same range')

  const par5 = clone().holes.map(h => h.hole_number === 3 ? { ...h, par: 5 } : h)
  ok(!saysAny(fatalText(validateCourseImport('x.json', withHoles(par5))), /Postgres/),
    'a par 5 raises nothing — the ceiling itself is allowed')
}

section('Coordinates — migration 026\'s CHECK, and MET\'s four places')
{
  const at = (latitude: number, longitude: number) => ({ ...clone(), latitude, longitude })
  ok(saysAny(fatalText(validateCourseImport('x.json', at(40.7, -74.0))), /outside Ireland/),
    'New York is refused — the CHECK would refuse the insert')
  ok(saysAny(fatalText(validateCourseImport('x.json', at(-5.6072, 54.2603))), /outside Ireland/),
    'a transposed pair is refused')
  ok(saysAny(fatalText(validateCourseImport('x.json', at(54.26031, -5.6072))), /decimal places/),
    'a fifth decimal place is refused — the column is numeric(7,4)')
  eq(COORD_BOX.lat, [49, 61], 'the latitude box matches the CHECK')
  eq(COORD_BOX.lon, [-11, 2], 'the longitude box matches the CHECK')

  const half = { ...clone(), longitude: null as unknown as number }
  ok(saysAny(fatalText(validateCourseImport('x.json', half)), /both required/),
    'one coordinate without the other is refused')
}

section('The tee par against the holes')
{
  // The filename must be the real one: the cross-check only runs once the
  // rest of the file is sound, so a mismatched name would mask it.
  const FILE = 'example-golf-links.json'

  const wrong = clone()
  wrong.tees = wrong.tees.map(t => t.name === 'White' ? { ...t, par: 71 } : t)
  const said = fatalText(validateCourseImport(FILE, wrong))
  ok(saysAny(said, /White \(men\) tee says par 71, but those holes add up to 70/),
    'a men\'s tee par that disagrees with the holes is named, with both numbers')

  const ladiesWrong = clone()
  ladiesWrong.tees = ladiesWrong.tees.map(t => t.gender === 'F' ? { ...t, par: 72 } : t)
  ok(saysAny(fatalText(validateCourseImport(FILE, ladiesWrong)), /ladies\) tee says par 72/),
    'and so is a ladies tee, against the ladies holes')

  eq(teeParProblems(GOOD), [], 'the good fixture raises nothing')

  // The check is diffCard's own rule, not a second sum — a course with no
  // ladies card measures its ladies tee against the men's total, which is
  // exactly what diffCard does.
  const noLadies = withHoles(clone().holes.map(h =>
    ({ ...h, par_ladies: null, stroke_index_ladies: null })))
  noLadies.tees = noLadies.tees.map(t => t.gender === 'F' ? { ...t, par: 70 } : t)
  eq(teeParProblems(noLadies), [],
    'with no ladies card, a ladies tee off the men\'s total is accepted')
}

section('Identity — name, slug, county, website')
{
  const bad = (patch: Partial<CourseImport>, file = 'example-golf-links.json') =>
    fatalText(validateCourseImport(file, { ...clone(), ...patch }))

  ok(bad({ slug: 'Example_Links' }).length > 0, 'a slug that is not in slug form is refused')
  ok(saysAny(bad({}, 'wrong-name.json'), /must match/),
    'a filename that disagrees with the slug is refused')
  ok(saysAny(bad({ county: 'Co. Down' }), /canonical/),
    'a "Co." prefix is refused, and the canonical spelling is offered')
  ok(saysAny(bad({ county: 'Londonderry' }), /Derry/),
    'Londonderry is refused in favour of Derry')
  ok(bad({ county: '' }).length > 0, 'a missing county is refused')
  ok(bad({ name: '' }).length > 0, 'a blank name is refused')
  ok(bad({ name: 'x'.repeat(81) }).length > 0, 'an over-long name is refused')
  ok(bad({ location: 'x'.repeat(121) }).length > 0, 'an over-long location is refused')
  ok(bad({ website: 'not a website' }).length > 0, 'a nonsense website is refused')
  ok(saysAny(bad({ website: 'https://example.com' }), /normalised/),
    'a website that is not already normalised is refused, with the form to use')

  const scottish = validateCourseImport('example-golf-links.json',
    { ...clone(), county: 'Fife' })
  eq(fatalText(scottish), [], 'a county outside the thirty-two is allowed')
  ok(scottish.some(p => !p.fatal), '  …but warned about')
}

section('Provenance')
{
  const bad = (patch: Partial<CourseImport>) =>
    fatalText(validateCourseImport('example-golf-links.json', { ...clone(), ...patch }))

  ok(saysAny(bad({ holesConfidence: 'LOW' }), /mis-hands shots/),
    'LOW confidence holes are refused, and the message says why')
  ok(bad({ holesConfidence: 'EST' }).length > 0, 'so are estimated holes')
  eq(HOLE_CONFIDENCE_FLOOR, ['HIGH', 'MEDIUM'], 'the floor is HIGH or MEDIUM')

  const lowTees = validateCourseImport('example-golf-links.json',
    { ...clone(), teesConfidence: 'EST' })
  eq(fatalText(lowTees), [], 'estimated tees are allowed — a photo corrects a slope')

  ok(bad({ holesConfidence: 'PROBABLY' as never }).length > 0, 'an invented confidence is refused')
  eq([...CONFIDENCE], ['HIGH', 'MEDIUM', 'LOW', 'EST'], 'the vocabulary is migration 008\'s')

  ok(bad({ sources: { holes: [], tees: ['https://example.com/'] } }).length > 0,
    'holes with no source are refused')
  ok(bad({ sources: { holes: ['https://example.com/'], tees: [] } }).length > 0,
    'tees with no source are refused')
  ok(saysAny(bad({ sources: { holes: ['see the club'], tees: ['https://example.com/'] } }),
    /not a web address/), 'a source that is a description rather than a link is refused')
}

section('The tees themselves')
{
  const withTees = (tees: CourseImport['tees']) =>
    fatalText(validateCourseImport('example-golf-links.json', { ...clone(), tees }))

  const white = GOOD.tees.find(t => t.name === 'White')!
  ok(withTees([...GOOD.tees, { ...white }]).length > 0,
    'the same tee name twice for one gender is refused')
  ok(saysAny(withTees([...GOOD.tees, { ...white, name: 'white' }]), /appears twice/),
    '  …and case does not get around it — the constraint folds too')
  ok(saysAny(withTees(GOOD.tees.filter(t => t.gender !== 'M')), /no men's tee/),
    'a course with no men\'s tee is refused')
  ok(withTees([{ ...white, slope: 300 }]).length > 0, 'a slope of 300 is refused')
  ok(withTees([{ ...white, course_rating: 12 }]).length > 0, 'a course rating of 12 is refused')

  const noLadiesTee = validateCourseImport('example-golf-links.json',
    { ...clone(), tees: GOOD.tees.filter(t => t.gender !== 'F') })
  eq(fatalText(noLadiesTee), [], 'no ladies tee is allowed')
  ok(noLadiesTee.some(p => !p.fatal), '  …but warned about')
}

section('The card itself — the card check\'s own gate, reached through this one')
{
  ok(validateCourseImport('x.json', withHoles(GOOD.holes.slice(0, 17))).length > 0,
    'seventeen holes are refused')

  const dupIndex = clone().holes.map(h => h.hole_number === 2 ? { ...h, stroke_index: 5 } : h)
  ok(saysAny(fatalText(validateCourseImport('x.json', withHoles(dupIndex))), /full set of 1 to 18/),
    'a stroke index that is not a permutation is refused')

  const halfLadies = clone().holes.map(h => h.hole_number > 12 ? { ...h, par_ladies: null } : h)
  ok(saysAny(fatalText(validateCourseImport('x.json', withHoles(halfLadies))), /all or nothing/),
    'a half-read ladies card is refused')

  const extraColumn = clone().holes.map(h => ({ ...h, source: 'the club' })) as NewHoleRow[]
  ok(fatalText(validateCourseImport('x.json', withHoles(extraColumn))).length > 0,
    'a hole carrying a column this does not write is refused — provenance is per course')

  const allMensOnly = withHoles(clone().holes.map(h =>
    ({ ...h, par_ladies: null, stroke_index_ladies: null })))
  allMensOnly.tees = allMensOnly.tees.filter(t => t.gender !== 'F')
  eq(fatalText(validateCourseImport('example-golf-links.json', allMensOnly)), [],
    'a men\'s-only card is a complete course')
}

// ─── Across the set ────────────────────────────────────────────

section('Across the set')
{
  const a = { file: 'a.json', course: { ...clone(), slug: 'a', name: 'Alpha Golf Club' } }
  const b = { file: 'b.json', course: { ...clone(), slug: 'b', name: 'Beta Golf Club' } }
  eq(fatalsOf(validateImportSet([a, b], [])).length, 0, 'two distinct courses are fine')

  const clash = { file: 'b.json', course: { ...b.course, slug: 'a' } }
  const said = fatalsOf(validateImportSet([a, clash], [])).map(p => p.message)
  ok(saysAny(said, /silently replaced/),
    'a repeated slug is refused, and the message says a live card would be replaced')

  const shipped = fatalsOf(validateImportSet([a], [{ name: 'Lahinch', slug: 'a' }])).map(p => p.message)
  ok(saysAny(shipped, /already on the platform/), 'a slug that has already shipped is refused')

  const sameName = { file: 'b.json', course: { ...b.course, name: 'alpha golf club' } }
  ok(fatalsOf(validateImportSet([a, sameName], [])).length > 0,
    'two courses with the same name, folded, are refused')
  ok(fatalsOf(validateImportSet([a], [{ name: 'Alpha Golf Club', slug: 'z' }])).length > 0,
    'and so is one that duplicates a shipped name')

  const warnings = validateImportSet([a, { ...b, course: { ...b.course } }], [])
    .filter(p => !p.fatal)
  ok(warnings.some(p => /coordinates/.test(p.message)),
    'two courses at identical coordinates are warned about, not refused')
}

// ─── What has already shipped ──────────────────────────────────

section('The platform courses already in the migrations')

const migrationFiles = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
const migrationSqlOf = new Map(migrationFiles.map(f => [f, readFileSync(join(MIGRATIONS, f), 'utf8')]))
// Generated migrations are skipped: they are a projection of data/courses,
// so counting them would make every course collide with itself.
const shipped = migrationFiles
  .filter(f => !isGeneratedSql(migrationSqlOf.get(f)!))
  .flatMap(f => platformCoursesInSql(migrationSqlOf.get(f)!))
{
  // A floor, not an exact count — courses will be added. If the parse ever
  // silently stops matching, this fails by name instead of the import
  // quietly permitting a collision.
  ok(shipped.length >= 26, `the parse finds the seeded platform courses (found ${shipped.length})`)
  ok(shipped.some(c => c.slug === 'lahinch-old'), 'including lahinch-old, from migration 004')
  ok(shipped.some(c => c.slug === 'waterville'), 'and waterville, from migration 005')
  ok(shipped.some(c => c.name === 'Narin & Portnoo Links'), 'names come back whole')
  eq(new Set(shipped.map(c => c.slug)).size, shipped.length, 'no platform slug has shipped twice')
}

// ─── The generator ─────────────────────────────────────────────

section('The generator')
{
  const sql = migrationSql([GOOD], { number: '999', letter: 'z' })

  eq(platformCoursesInSql(sql).map(c => c.slug), ['example-golf-links'],
    'the output is read by the same parser that reads 004 and 005')
  eq(platformCoursesInSql(sql).map(c => c.name), ['Example Golf Links'], 'name and all')

  // The failure this exists for: a par/stroke-index transposition produces
  // entirely plausible SQL, so the numbers are read back out and compared.
  const tuples = [...sql.matchAll(/^ {2}\(\s*(\d+)(?:::int)?,\s*(\d+)(?:::int)?,\s*(\d+)(?:::int)?,\s*(\d+|NULL)(?:::int)?,\s*(\d+|NULL)(?:::int)?\)/gm)]
  eq(tuples.length, 18, 'eighteen hole rows come back out')
  eq(
    tuples.map(m => ({
      hole_number: Number(m[1]), par: Number(m[2]), stroke_index: Number(m[3]),
      par_ladies: m[4] === 'NULL' ? null : Number(m[4]),
      stroke_index_ladies: m[5] === 'NULL' ? null : Number(m[5]),
    })),
    GOOD.holes,
    'and every number survives the round trip, in the right column',
  )

  ok(sql.includes("('example-golf-links', 'Blue',  'M', 70, 71.5, 128)"),
    'a tee row is written whole, padded after the comma as migration 008 does')
  ok(sql.includes("('example-golf-links', 'Red',   'F', 73, 72.6, 128)"),
    'and the ladies tee carries the ladies par')
  ok(sql.includes('ON CONFLICT ON CONSTRAINT uq_tees_course_name_gender DO NOTHING'),
    'tees are replay-safe by conflict, not by delete')
  ok(!/DELETE FROM/i.test(sql),
    'nothing is deleted — round_handicaps.tee_id is ON DELETE RESTRICT')
  ok(/BEGIN;/.test(sql) && /COMMIT;/.test(sql), 'the file is one explicit transaction')
  ok(sql.includes('card_verified'), 'card_verified is written')
  ok(/now\(\), false,/.test(sql), '  …and it is false — researched is not photographed')
  ok(sql.split('\n')[1] === GENERATED_MARKER, 'the marker is the second line, for renumbering')
  ok(isGeneratedSql(sql), '  …and the output is recognised as generated')

  // Without this, the second run of the generator reads its own output back
  // as "already on the platform" and every course collides with itself.
  ok(!isGeneratedSql(readFileSync(join(MIGRATIONS, '20260101000004_platform_courses_a.sql'), 'utf8')),
    'a hand-written migration is not mistaken for generated output')
  ok(migrationFiles.filter(f => isGeneratedSql(migrationSqlOf.get(f)!))
    .every(f => !shipped.some(c => platformCoursesInSql(migrationSqlOf.get(f)!)
      .some(g => g.slug === c.slug))),
    'no generated course is counted among the shipped ones')
  ok(sql.includes('HOLES HIGH:'), 'the hole confidence and its source are in the file')
  ok(sql.includes('-- Note: Ladies play the 4th'), 'the note survives into the migration')
  eq(sql, migrationSql([GOOD], { number: '999', letter: 'z' }), 'the same input gives the same bytes')

  // A men's-only course must still emit a typed NULL column.
  const mensOnly = withHoles(GOOD.holes.map(h =>
    ({ ...h, par_ladies: null, stroke_index_ladies: null })))
  const mensSql = migrationSql([mensOnly], { number: '999', letter: 'z' })
  ok(mensSql.includes('NULL::int'), 'an all-null ladies column is cast on the first row')
  ok(/ladies_data_verified|false, 'Ladies card not published/.test(mensSql) &&
     mensSql.includes('Ladies card not published'),
    'and the course is marked as having no ladies card, with the note the seeds use')
}

// ─── The real files ────────────────────────────────────────────

section('Every file in data/courses/')
{
  const files = existsSync(DATA_DIR)
    ? readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort()
    : []

  if (files.length === 0) {
    console.log('  (none yet — the gate is live and passes trivially)')
    passed++
  }

  const loaded: { file: string; course: CourseImport }[] = []
  for (const file of files) {
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'))
    } catch (e) {
      ok(false, `${file} is not valid JSON — ${(e as Error).message}`)
      continue
    }
    const problems = validateCourseImport(file, parsed)
    const fatals = fatalsOf(problems)
    for (const p of fatals) ok(false, `${file}: ${p.message}`)
    for (const p of problems.filter(x => !x.fatal)) console.log(`  warn  ${file}: ${p.message}`)
    if (fatals.length === 0) {
      const c = parsed as CourseImport
      loaded.push({ file, course: c })
      console.log(`  ✓ ${c.slug} — holes ${c.holesConfidence}, tees ${c.teesConfidence}, ` +
        `${c.holes.length} holes, ${c.tees.length} tees`)
      passed++
    }
  }

  for (const p of validateImportSet(loaded, shipped)) {
    if (p.fatal) ok(false, `${p.file}: ${p.message}`)
    else console.log(`  warn  ${p.file}: ${p.message}`)
  }
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(failures.map(f => `  - ${f}`).join('\n'))
  process.exit(1)
}
