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
  GENERATED_MARKER, TEE_REFRESH_MARKER, isGeneratedSql, NO_CARD,
  platformHolesInSql, validateTeeRefresh, validateTeeRefreshSet, teeRefreshSql, assignBatches,
  type CourseImport,
} from '../lib/courseImport'
import { validateNewHoleRows, type NewHoleRow } from '../lib/cardCheck'
import { courseNameKey } from '../lib/courseDirectory'

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
const warnText = (problems: ReturnType<typeof validateCourseImport>) =>
  problems.filter(p => !p.fatal).map(p => p.message)
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
  ok(withTees([{ ...white, slope: 300 }]).length > 0, 'a slope of 300 is refused')
  ok(withTees([{ ...white, course_rating: 12 }]).length > 0, 'a course rating of 12 is refused')

  const noLadiesTee = validateCourseImport('example-golf-links.json',
    { ...clone(), tees: GOOD.tees.filter(t => t.gender !== 'F') })
  eq(fatalText(noLadiesTee), [], 'no ladies tee is allowed')
  ok(noLadiesTee.some(p => !p.fatal), '  …but warned about')

  // The mirror, and it is a warning for the same reason: `teesForPlayer` hands
  // over every tee on the course when the player's own gender has none.
  const noMensTee = validateCourseImport('example-golf-links.json',
    { ...clone(), tees: GOOD.tees.filter(t => t.gender !== 'M') })
  eq(fatalText(noMensTee), [], 'no men\'s tee is allowed too')
  ok(saysAny(warnText(noMensTee), /plays off the ladies/), '  …and warned about the same way')
}

section('A course whose club publishes no rating and slope')
{
  const FILE = 'example-golf-links.json'
  // Irish cards print SSS, not slope. This is the shape that used to be
  // refused outright, and it is most of the top-100 tail.
  const UNRATED: CourseImport = {
    ...clone(), tees: [], teesConfidence: NO_CARD,
    sources: { ...clone().sources, tees: [] },
  }

  eq(fatalText(validateCourseImport(FILE, UNRATED)), [],
    'a full card with no tees at all is a complete course, when the file says so')
  ok(saysAny(warnText(validateCourseImport(FILE, UNRATED)), /cannot be started/),
    '  …and is warned about — nobody can be given a tee, so no round starts')

  // Both directions, because tees deleted in an edit look exactly like a club
  // that publishes no ratings — the same trap the holes have.
  ok(saysAny(fatalText(validateCourseImport(FILE, { ...UNRATED, teesConfidence: 'HIGH' })),
    /went missing in an edit/),
    'tees that vanished in an edit are refused')
  ok(saysAny(fatalText(validateCourseImport(FILE, { ...clone(), teesConfidence: NO_CARD })),
    /delete one or the other/),
    'and NONE alongside real tees is refused the other way')

  // The two absences are independent: a course can be missing either, or both.
  const NEITHER: CourseImport = {
    ...UNRATED, holes: [], holesConfidence: NO_CARD,
    note: 'Club site publishes neither a scorecard nor a course rating.',
    sources: { holes: [], tees: [] },
  }
  eq(fatalText(validateCourseImport(FILE, NEITHER)), [],
    'a course with neither a card nor a rating still lands — findable, and gated')

  // NO_CARD_TEE_FLOOR is about tees that exist. With none there is nothing for
  // a floor to be a floor over, and applying it would refuse the whole tail —
  // but it must still bite where there are tees to grade.
  ok(saysAny(fatalText(validateCourseImport(FILE, {
    ...NEITHER, tees: GOOD.tees, teesConfidence: 'EST',
    sources: { holes: [], tees: ['https://example.com/'] },
  })), /source has to be better/),
    '  …but the cardless tee floor still bites when there are tees to grade')
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

section('A course whose club publishes no card')
{
  const FILE = 'example-golf-links.json'
  const CARDLESS: CourseImport = {
    ...clone(), holes: [], holesConfidence: NO_CARD,
    note: 'No per-hole card published; the club\'s site has no scorecard and the PDF is not online.',
    sources: { ...clone().sources, holes: [] },
  }

  eq(fatalText(validateCourseImport(FILE, CARDLESS)), [],
    'no holes is a complete course, when the file says so')
  ok(validateCourseImport(FILE, CARDLESS).some(p => !p.fatal && /cannot be checked/.test(p.message)),
    '  …and is warned about — the tee par has nothing to be checked against')

  // The biconditional, both ways. A card that vanished in an edit looks
  // exactly like a club that publishes none, so emptiness must be declared.
  ok(saysAny(fatalText(validateCourseImport(FILE, { ...CARDLESS, holesConfidence: 'MEDIUM' })),
    /went missing in an edit/),
    'holes that vanished in an edit are refused')
  ok(saysAny(fatalText(validateCourseImport(FILE, { ...clone(), holesConfidence: NO_CARD })),
    /delete one or the other/),
    'and NONE with eighteen holes is refused the other way')

  ok(fatalText(validateCourseImport(FILE,
    { ...CARDLESS, sources: { ...CARDLESS.sources, holes: ['https://example.com/'] } })).length > 0,
    'a source for holes that do not exist is refused')
  ok(fatalText(validateCourseImport(FILE, { ...CARDLESS, note: null })).length > 0,
    'the note is required — it is the only record of why there is no card')
  ok(saysAny(fatalText(validateCourseImport(FILE, { ...CARDLESS, teesConfidence: NO_CARD })),
    /delete one or the other/),
    'NONE on tees that exist is refused — the absence is declared, never assumed')
  ok(fatalText(validateCourseImport(FILE, { ...CARDLESS, teesConfidence: 'EST' })).length > 0,
    'and estimated tees are refused when there is no card to correct them')

  // The one that would have failed silently and plausibly.
  eq(teeParProblems(CARDLESS), [],
    'the tee/hole cross-check is skipped, not run against a total of zero')

  const twoPars = { ...CARDLESS, tees: [
    { name: 'Blue', gender: 'M' as const, par: 70, course_rating: 71.5, slope: 128 },
    { name: 'White', gender: 'M' as const, par: 69, course_rating: 70.1, slope: 124 },
  ] }
  ok(saysAny(fatalText(validateCourseImport(FILE, twoPars)), /as the par of the same course/),
    'two different men\'s pars on one cardless course is refused — the only structural check left')

  const sql = migrationSql([CARDLESS], { number: '999', letter: 'z' })
  ok(/now\(\), false, false,/.test(sql),
    'ladies_data_verified is FALSE with no holes — [].every(…) is true and would have said otherwise')
  ok(sql.includes('No scorecard published'),
    '  …with a note saying there is no card, not that the ladies card is missing')
  ok(!sql.includes('INSERT INTO holes'), 'no holes block is emitted')
  ok(sql.includes(`HOLES ${NO_CARD}`), '  …but the reason survives into the migration')
  ok(sql.includes('INSERT INTO tees'), 'the tees still land — they are the half that was found')
  ok(sql.includes('with no card yet'), 'and the header counts them')
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
const storedHoles = new Map(migrationFiles
  .flatMap(f => platformHolesInSql(migrationSqlOf.get(f)!))
  .map(x => [x.slug, x.holes]))
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

section('Near-duplicate names — the same club written two ways')
{
  eq(courseNameKey('Portstewart Golf Club -- The Strand Course'),
    courseNameKey('Portstewart Golf Club — Strand Course'),
    'an em dash and a dropped "The" do not make a second club')
  eq(courseNameKey('Laytown & Bettystown Golf Club'),
    courseNameKey('Laytown and Bettystown'),
    'and neither does an ampersand written out')

  // The neighbours that must stay apart — two courses on one property is the
  // common case in this dataset, not the exception.
  const distinct = [
    'Ballyliffin Golf Club -- Old Links', 'Ballyliffin Golf Club -- Glashedy Links',
    'Rosapenna Golf Resort -- Sandy Hills Links', 'Rosapenna Golf Resort -- St Patricks Links',
    'Royal Portrush Golf Club -- Dunluce Links', 'Royal Portrush Golf Club -- Valley Links',
    'Castlerock Golf Club -- Mussenden', 'Castlerock Golf Club -- Bann',
  ]
  eq(new Set(distinct.map(courseNameKey)).size, distinct.length,
    'two courses on one property stay apart')

  eq(courseNameKey('The Golf Club'), 'the golf club',
    'a name that is nothing but noise keeps its words rather than folding to blank')

  // The claim that matters, against what has actually shipped.
  const keys = shipped.map(c => courseNameKey(c.name))
  eq(new Set(keys).size, shipped.length,
    `no two shipped names collide under the key (${shipped.length} names)`)

  const asFile = (name: string, slug: string) => ({ file: `${slug}.json`, course: { ...clone(), slug, name } })
  ok(fatalsOf(validateImportSet([asFile('Portstewart Golf Club — Strand Course', 'portstewart-strand-course')], shipped))
    .some(p => /one club/.test(p.message)),
    'a file that reads as a shipped course is refused, under a slug that would not have clashed')
  eq(fatalsOf(validateImportSet([asFile('Ardglass Golf Club', 'ardglass')], shipped)).length, 0,
    'and a genuinely new course is not')

  // "Old Tom Morris Links" keys to exactly "old tom morris" — Links is noise —
  // so it is caught by the exact rule, not this one.
  ok(fatalsOf(validateImportSet([asFile('Old Tom Morris Links', 'otm-links')], shipped)).length > 0,
    'a trailing "Links" does not make a second Old Tom Morris')

  // Containment: warned about, never refused. This is the real case — the
  // platform row was renamed to the resort form by migration 032, which is an
  // UPDATE the migration parser does not read, so `shipped` still holds the
  // short name it was inserted under.
  const contained = validateImportSet(
    [asFile('Rosapenna Golf Resort -- Old Tom Morris', 'rosapenna-otm')], shipped)
  eq(fatalsOf(contained).length, 0, 'a shorter shipped name inside a longer new one is not fatal')
  ok(contained.some(p => !p.fatal && /two courses and not one/.test(p.message)),
    '  …but it is warned about')
  eq(validateImportSet([asFile('Fota Island Resort', 'fota-island')], shipped).filter(p => !p.fatal).length, 0,
    'and one shared word does not warn — "Island" alone is under the floor')
}

section('The holes already in the migrations')
{
  ok(storedHoles.size >= 28,
    `every platform course's card parses (found ${storedHoles.size} of ${shipped.length} shipped)`)
  eq(shipped.filter(c => !storedHoles.has(c.slug)).map(c => c.slug), [],
    'no shipped course is missing its holes — one the parse cannot find is one a tee refresh cannot check')
  ok([...storedHoles.values()].every(h => h.length === 18), 'each is eighteen rows')
  ok([...storedHoles.values()].every(h => new Set(h.map(x => x.stroke_index)).size === 18),
    '  …with a full stroke index')

  // Named totals, so a silent parse drift fails by name rather than quietly
  // permitting a wrong tee par through the refresh gate.
  eq(storedHoles.get('adare-manor')!.reduce((s, h) => s + h.par, 0), 72,
    'Adare Manor\'s men\'s holes add up to 72')
  eq(storedHoles.get('castlerock-mussenden')!.every(h => h.par_ladies != null), false,
    'a men\'s-only card comes back with null ladies pars, not zeroes')

  // The generated shape and the hand-written shape really are one shape.
  eq(platformHolesInSql(migrationSql([GOOD], { number: '999', letter: 'z' })),
    [{ slug: 'example-golf-links', holes: GOOD.holes }],
    'and the generator\'s own output is read by the same parser that reads 004')
}

section('Every shipped tee par against its stored holes')
{
  // Not a pass/fail of the data — a record of it. Migration 035 corrects
  // these, so the expected list shrinking is a deliberate edit here rather
  // than a silent drop.
  const teeRow = /\(\s*'([a-z0-9-]+)',\s*'([^']+)',\s*'([MF])',\s*(\d+),\s*[\d.]+,\s*\d+\)/g
  const off: string[] = []
  for (const f of migrationFiles) {
    for (const m of migrationSqlOf.get(f)!.matchAll(teeRow)) {
      const holes = storedHoles.get(m[1])
      if (!holes) continue
      const ladies = holes.every(h => h.par_ladies != null)
        ? holes.reduce((s, h) => s + h.par_ladies!, 0) : null
      const want = m[3] === 'F' ? (ladies ?? holes.reduce((s, h) => s + h.par, 0))
        : holes.reduce((s, h) => s + h.par, 0)
      if (Number(m[4]) !== want) off.push(`${m[1]} ${m[2]} ${m[3]} ${m[4]} vs ${want}`)
    }
  }
  eq(off.length, 15,
    'fifteen shipped tee rows still disagree with their own holes — migration 035 is what corrects them')
  ok(off.some(o => o.startsWith('county-louth Red F 72 vs 75')),
    '  …including County Louth\'s ladies tee, three shots out')
}

// ─── Correcting a course that has shipped ──────────────────────

const REFRESH = {
  slug: 'adare-manor',
  name: 'Adare Manor Golf Course',
  teesConfidence: 'HIGH' as const,
  note: null,
  sources: { tees: ['https://ncrdb.usga.org/courseTeeInfo?CourseID=1'] },
  tees: [{ name: 'Black', gender: 'M' as const, par: 72, course_rating: 74.9, slope: 141 }],
}

section('A tee refresh file, on its own terms')
{
  eq(fatalsOf(validateTeeRefresh('adare-manor.json', REFRESH)).map(p => p.message), [],
    'a well-formed refresh has no fatal problems')
  ok(fatalsOf(validateTeeRefresh('wrong.json', REFRESH)).length > 0,
    'the filename must be the slug')
  ok(fatalsOf(validateTeeRefresh('adare-manor.json', { ...REFRESH, holes: GOOD.holes }))
    .some(p => /silently lose its card/.test(p.message)),
    'a course file dropped in this directory is refused, and told why')
  ok(fatalsOf(validateTeeRefresh('adare-manor.json', { ...REFRESH, tees: [] })).length > 0,
    'a refresh with no tees is refused — there is nothing to write')
  eq(fatalsOf(validateTeeRefresh('adare-manor.json',
    { ...REFRESH, tees: [{ name: 'Red', gender: 'F' as const, par: 72, course_rating: 70.5, slope: 117 }] }))
    .map(p => p.message), [],
    'a ladies-only refresh is fine — correcting one gender is the commonest case')
}

section('A refresh against what has shipped')
{
  const holes = new Map([['adare-manor', storedHoles.get('adare-manor')!]])
  const one = (r: unknown, arriving: string[] = []) =>
    fatalsOf(validateTeeRefreshSet(
      [{ file: 'adare-manor.json', refresh: r as never }], shipped, holes, arriving))
      .map(p => p.message)

  eq(one(REFRESH), [], 'a refresh of a shipped course is allowed')
  ok(saysAny(one({ ...REFRESH, slug: 'brand-new' }), /not a platform course/),
    'a slug that has never shipped is refused — the mirror image of the new-course rule')
  ok(one(REFRESH, ['adare-manor']).length > 0,
    'a course being created in this same run cannot also be refreshed')
  ok(saysAny(one({ ...REFRESH, name: 'Ballybunion Golf Club -- Old Course' }), /wrong course/),
    'a name that is a different club is refused — these ratings would land on it')
  eq(one({ ...REFRESH, name: 'Adare Manor' }), [],
    '  …but "Adare Manor" against "Adare Manor Golf Course" is the same club')
  ok(saysAny(one({ ...REFRESH, tees: [{ ...REFRESH.tees[0], par: 71 }] }), /add up to 72/),
    'a tee par that disagrees with the STORED holes is named, with both numbers')

  const noCard = validateTeeRefreshSet(
    [{ file: 'adare-manor.json', refresh: REFRESH as never }], shipped, new Map(), [])
  eq(fatalsOf(noCard).length, 0, 'a course with no stored card is not refused')
  ok(noCard.some(p => !p.fatal && /no stored card/.test(p.message)),
    '  …it is warned about — a cardless course has none by design')
}

section('The tee-refresh migration')
{
  const sql = teeRefreshSql([REFRESH], { letter: 'a' })
  ok(sql.includes('ON CONFLICT ON CONSTRAINT uq_tees_course_name_gender'),
    'the conflict target is the unique constraint')
  ok(/DO UPDATE SET/.test(sql), '  …and it updates, which is the whole point')
  ok(!/DO NOTHING/.test(sql), 'a refresh that skipped on conflict would be a no-op')
  ok(!/DELETE FROM/i.test(sql), 'nothing is deleted — round_handicaps.tee_id is ON DELETE RESTRICT')
  ok(/sum\(h\.par_ladies\)[\s\S]*sum\(h\.par\)[\s\S]*EXCLUDED\.par/.test(sql),
    'par follows the stored holes — ladies, then men, then the file — diffCard\'s own order')
  ok(/BEGIN;/.test(sql) && /COMMIT;/.test(sql), 'the file is one explicit transaction')
  ok(sql.split('\n')[1] === TEE_REFRESH_MARKER && isGeneratedSql(sql),
    'it is recognised as this pipeline\'s own output')
  eq(platformCoursesInSql(sql), [],
    'and it inserts no courses, so the new-course collision check never sees it')
  eq(platformHolesInSql(sql), [], 'nor any holes')
  eq(sql, teeRefreshSql([REFRESH], { letter: 'a' }), 'the same input gives the same bytes')
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

section('Every generated file says how to check it landed')
{
  // Writing a migration changes nothing until somebody pastes it, and the repo
  // has no way of knowing whether that happened. Each file carries the query
  // that answers it for itself.
  const courseSql = migrationSql([GOOD], { number: '999', letter: 'z' })
  const teeSql = teeRefreshSql([REFRESH], { letter: 'a' })

  for (const [what, sql, slug] of [
    ['a course migration', courseSql, GOOD.slug],
    ['a tee refresh', teeSql, REFRESH.slug],
  ] as const) {
    ok(sql.includes('Did it land?'), `${what} ends with a verify block`)
    ok(sql.includes(`'${slug}'`) && /^\s+and c\.slug in \(/m.test(sql),
      `  …naming its own courses, so it is right without anyone maintaining it`)
    ok(sql.indexOf('Did it land?') > sql.indexOf('COMMIT;'),
      '  …after the COMMIT, not inside the transaction')

    const block = sql.slice(sql.indexOf('-- ── Did it land?'))
    // Live SQL, not a comment. A file of nothing but inserts ends with
    // "Success. No rows returned." — indistinguishable from a migration that
    // did nothing, and that is how it was read the first time it mattered.
    // Telling somebody to uncomment a block before running it does not survive
    // contact with the moment they want the answer.
    ok(/^select c\.slug,/m.test(block),
      '  …and the SELECT runs itself rather than waiting to be uncommented')
    ok(block.trimEnd().endsWith(';'),
      '  …terminated, so it is the last thing the paste does')
    // One only: the Supabase editor shows the last result grid, so a second
    // SELECT here would hide this one.
    eq((block.match(/^select /gm) ?? []).length, 1,
      '  …and there is exactly one of them')
  }
}

section('Which file each course lands in')
{
  const many = (n: number, prefix = 'c') =>
    Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(3, '0')}`)

  // A hundred courses from nothing: four full files and one of the remainder.
  const fresh = assignBatches(many(100), new Map(), 25)
  eq(fresh.map(b => b.slugs.length), [25, 25, 25, 25], 'a hundred courses make four files of 25')
  ok(fresh.every(b => b.file === null), 'and every one of them is a new file')
  eq(fresh.flatMap(b => b.slugs).length, 100, 'nobody is dropped')
  eq(new Set(fresh.flatMap(b => b.slugs)).size, 100, 'and nobody is in two files')

  const odd = assignBatches(many(30), new Map(), 25)
  eq(odd.map(b => b.slugs.length), [25, 5], 'a remainder gets its own file rather than being lost')

  // The property that would go wrong silently. `aaa` sorts before everything,
  // so a positional batcher would shift all 100 courses down one slot and
  // rewrite every file — leaving nobody able to say which had been pasted.
  const homes = new Map<string, string>()
  fresh.forEach((b, i) => b.slugs.forEach(s => homes.set(s, `file-${i}.sql`)))
  const after = assignBatches(['aaa', ...many(100)], homes, 25)

  eq(after.slice(0, 4).map(b => b.file), ['file-0.sql', 'file-1.sql', 'file-2.sql', 'file-3.sql'],
    'the four existing files keep their names')
  eq(after.slice(0, 4).map(b => b.slugs.length), [25, 25, 25, 25],
    '  …and every course stays exactly where it was')
  eq(after[4], { file: null, slugs: ['aaa'] },
    'the new course goes into a new file on its own, touching nothing else')

  // Determinism, so a re-run is a no-op rather than a diff.
  eq(assignBatches(['aaa', ...many(100)], homes, 25), after, 'the same input gives the same answer')

  // A course removed from data/courses leaves its file smaller and renumbers
  // nothing — the caller warns, because an applied migration cannot be unwritten.
  const gone = assignBatches(many(100).filter(s => s !== 'c000'), homes, 25)
  eq(gone[0].slugs.length, 24, 'a removed course leaves its file one shorter')
  eq(gone.map(b => b.file), ['file-0.sql', 'file-1.sql', 'file-2.sql', 'file-3.sql'],
    '  …and the others are untouched')

  // An existing file is never topped up: it may already have been pasted, and
  // a file that quietly grows a course is a file nobody can reason about.
  const short = new Map([['x', 'file-0.sql']])
  const topped = assignBatches(['x', 'y'], short, 25)
  eq(topped, [{ file: 'file-0.sql', slugs: ['x'] }, { file: null, slugs: ['y'] }],
    'a file with room does not gain a new course')
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
