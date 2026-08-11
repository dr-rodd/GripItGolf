/**
 * Turn researched course files into migrations.
 *
 *   npm run courses:migration -- --list      # what is already on the platform
 *   npm run courses:migration -- --dry-run   # says what it would write
 *   npm run courses:migration                # writes them
 *
 * Two inputs, two outputs:
 *
 *   data/courses/<slug>.json     → *_platform_courses_<letter>.sql   (new courses)
 *   data/course-tees/<slug>.json → *_course_tees_<letter>.sql        (corrections)
 *
 * Everything is validated by the same gate `npm test` runs. **One fatal
 * problem anywhere and nothing at all is written** — a half-applied batch is
 * the failure worth spending a whole run to avoid. Warnings print and it
 * carries on.
 *
 * It does not touch the database. Somebody applies the files by hand, in
 * numeric order — `docs/course-import.md` and `docs/testing-and-data.md`.
 *
 * The rules all live in `lib/courseImport.ts`. This file is the I/O half:
 * reading the directories, working out the numbering, writing the SQL.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateCourseImport, validateImportSet, validateTeeRefresh, validateTeeRefreshSet,
  platformCoursesInSql, platformHolesInSql, migrationSql, teeRefreshSql,
  fatalsOf, isGeneratedSql,
  type CourseImport, type CourseTeeRefresh, type ImportProblem,
} from '../lib/courseImport'

const ROOT = join(__dirname, '..')
const DATA_DIR = join(ROOT, 'data', 'courses')
const TEES_DIR = join(ROOT, 'data', 'course-tees')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

/**
 * One file is one paste. Twenty-five keeps a hundred courses to four of them,
 * and each is still a single transaction, so a failure leaves nothing behind.
 */
const COURSES_PER_MIGRATION = 25

const dryRun = process.argv.includes('--dry-run')
const listOnly = process.argv.includes('--list')

const say = (s = '') => console.log(s)
const bail = (s: string): never => { console.error(s); process.exit(1) }

const readJson = (dir: string, file: string): { ok: true; value: unknown } | { ok: false; why: string } => {
  try {
    return { ok: true, value: JSON.parse(readFileSync(join(dir, file), 'utf8')) }
  } catch (e) {
    return { ok: false, why: (e as Error).message }
  }
}

// ─── What has already shipped ──────────────────────────────────
//
// Parsed out of the migrations rather than kept as a list. Two different
// answers are needed and confusing them would be silent both ways:
//
//   `existing` — what a NEW course may not collide with. This run's own
//     previous output is excluded: it is only a projection of the same
//     data/courses/ being read now, so counting it would make every course
//     collide with itself on the second run.
//   `platform` — every platform course there is, generated output included.
//     A course this pipeline created is still on the platform and may still
//     need its tees corrected.

const migrationFiles = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
const sqlOf = new Map(migrationFiles.map(f => [f, readFileSync(join(MIGRATIONS, f), 'utf8')]))
const generated = migrationFiles.filter(f => isGeneratedSql(sqlOf.get(f)!))
const mineCourses = generated.filter(f => /_platform_courses_[a-z]\.sql$/.test(f))
const mineTees = generated.filter(f => /_course_tees_[a-z]\.sql$/.test(f))

const existing = migrationFiles
  .filter(f => !generated.includes(f))
  .flatMap(f => platformCoursesInSql(sqlOf.get(f)!))

const platform = migrationFiles.flatMap(f => platformCoursesInSql(sqlOf.get(f)!))
const storedHoles = new Map(
  migrationFiles.flatMap(f => platformHolesInSql(sqlOf.get(f)!)).map(x => [x.slug, x.holes]))

if (listOnly) {
  say(`${platform.length} platform courses:`)
  for (const c of [...platform].sort((a, b) => a.slug.localeCompare(b.slug))) {
    say(`  ${c.slug.padEnd(34)} ${c.name}${storedHoles.has(c.slug) ? '' : '  (no card)'}`)
  }
  say()
  say('Do not research these again. Better tee ratings go in data/course-tees/.')
  process.exit(0)
}

// ─── Read ──────────────────────────────────────────────────────

if (!existsSync(DATA_DIR)) {
  bail(`No ${DATA_DIR}. Course files live there, one per course — see docs/course-import.md.`)
}

const problems: ImportProblem[] = []

const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort()
const loaded: { file: string; course: CourseImport }[] = []

for (const file of files) {
  const read = readJson(DATA_DIR, file)
  if (!read.ok) {
    problems.push({ file, fatal: true, message: `Not valid JSON — ${read.why}` })
    continue
  }
  const found = validateCourseImport(file, read.value)
  problems.push(...found)
  if (fatalsOf(found).length === 0) loaded.push({ file, course: read.value as CourseImport })
}

const teeFiles = existsSync(TEES_DIR)
  ? readdirSync(TEES_DIR).filter(f => f.endsWith('.json')).sort()
  : []
const refreshes: { file: string; refresh: CourseTeeRefresh }[] = []

for (const file of teeFiles) {
  const read = readJson(TEES_DIR, file)
  if (!read.ok) {
    problems.push({ file, fatal: true, message: `Not valid JSON — ${read.why}` })
    continue
  }
  const found = validateTeeRefresh(file, read.value)
  problems.push(...found)
  if (fatalsOf(found).length === 0) refreshes.push({ file, refresh: read.value as CourseTeeRefresh })
}

if (files.length === 0 && teeFiles.length === 0) {
  say('Nothing in data/courses/ or data/course-tees/ — nothing to write.')
  say('Research lands there as one <slug>.json per course; docs/course-import.md has the contract.')
  process.exit(0)
}

problems.push(...validateImportSet(loaded, existing))
problems.push(...validateTeeRefreshSet(
  refreshes, platform, storedHoles, loaded.map(l => l.course.slug)))

// ─── Report ────────────────────────────────────────────────────

for (const w of problems.filter(p => !p.fatal)) say(`  warn  ${w.file}: ${w.message}`)

const fatals = fatalsOf(problems)
if (fatals.length > 0) {
  say()
  for (const f of fatals) console.error(`  REFUSED  ${f.file}: ${f.message}`)
  say()
  bail(`${fatals.length} problem${fatals.length === 1 ? '' : 's'} — nothing written. ` +
    'Fix the files and run again; docs/course-import.md says what each rule is for.')
}

const cardless = loaded.filter(l => l.course.holes.length === 0).length
say(`${loaded.length} course${loaded.length === 1 ? '' : 's'} ready` +
  (cardless > 0 ? ` (${cardless} with no card yet)` : '') +
  `, ${refreshes.length} tee refresh${refreshes.length === 1 ? '' : 'es'}, ` +
  `${platform.length} already on the platform.`)

// ─── Numbering ─────────────────────────────────────────────────
//
// Two rules, and the second is the one that matters at a hundred courses.
//
// Re-running must rewrite the same filenames rather than adding new ones
// beside them, or a second run imports every course twice. Files this script
// wrote say so on their second line.
//
// And **a course stays in the file it first landed in**. The generator reads
// the slugs back out of its own output to work out where each one already
// lives, so adding a course early in the alphabet touches one file instead of
// rewriting all ten — which is also what makes "paste the files you have not
// pasted" an answerable question.

const numberOf = (f: string) => f.slice(0, 14)
const highest = migrationFiles.reduce((n, f) => Math.max(n, Number(f.slice(8, 14)) || 0), 0)
let fresh = 0
const nextNumber = () => `20260101${String(highest + 1 + fresh++).padStart(6, '0')}`
const letterFor = (i: number) => String.fromCharCode('a'.charCodeAt(0) + i)

/** Where each already-generated course lives. */
const homeOf = new Map<string, string>()
for (const f of mineCourses) {
  for (const c of platformCoursesInSql(sqlOf.get(f)!)) homeOf.set(c.slug, f)
}

const handWrittenCourseFiles = migrationFiles.filter(f =>
  /_platform_courses_[a-z]\.sql$/.test(f) && !mineCourses.includes(f)).length

type Plan = { name: string; number: string; letter: string; reused: boolean; courses: CourseImport[] }
const plan: Plan[] = []

// Existing files keep their courses, in their existing order.
mineCourses.forEach((name, i) => {
  const mine = loaded.filter(l => homeOf.get(l.course.slug) === name).map(l => l.course)
  const was = platformCoursesInSql(sqlOf.get(name)!).length
  if (mine.length < was) {
    say(`  note  ${name} had ${was} courses and now has ${mine.length}. A migration that has ` +
      'been applied cannot be unwritten — remove the course from the database by hand if ' +
      'that is what you meant.')
  }
  plan.push({
    name, number: numberOf(name),
    letter: letterFor(handWrittenCourseFiles + i), reused: true, courses: mine,
  })
})

// Everything not already placed goes into new files.
const unplaced = loaded.filter(l => !homeOf.has(l.course.slug)).map(l => l.course)
for (let i = 0; i < unplaced.length; i += COURSES_PER_MIGRATION) {
  const letter = letterFor(handWrittenCourseFiles + plan.length)
  plan.push({
    name: `${nextNumber()}_platform_courses_${letter}.sql`,
    number: '', letter, reused: false,
    courses: unplaced.slice(i, i + COURSES_PER_MIGRATION),
  })
}
for (const p of plan) if (!p.number) p.number = numberOf(p.name)

// Tee refreshes: their own files, their own letters, same reuse rule.
type TeePlan = { name: string; letter: string; reused: boolean; batch: CourseTeeRefresh[] }
const teePlan: TeePlan[] = []
if (refreshes.length > 0) {
  const all = refreshes.map(r => r.refresh)
  for (let i = 0; i < all.length; i += COURSES_PER_MIGRATION) {
    const letter = letterFor(teePlan.length)
    const reused = mineTees[teePlan.length]
    teePlan.push({
      name: reused ?? `${nextNumber()}_course_tees_${letter}.sql`,
      letter, reused: Boolean(reused),
      batch: all.slice(i, i + COURSES_PER_MIGRATION),
    })
  }
}

// ─── Write ─────────────────────────────────────────────────────

say()
const writes: { name: string; sql: string; reused: boolean; what: string }[] = [
  ...plan.filter(p => p.courses.length > 0).map(p => ({
    name: p.name, reused: p.reused, what: `${p.courses.length} courses`,
    sql: migrationSql(p.courses, { number: p.number, letter: p.letter }),
  })),
  ...teePlan.map(t => ({
    name: t.name, reused: t.reused, what: `${t.batch.length} tee refreshes`,
    sql: teeRefreshSql(t.batch, { letter: t.letter }),
  })),
]

for (const w of writes) {
  if (dryRun) {
    say(`  would ${w.reused ? 'rewrite' : 'write'}  ${w.name}  (${w.what})`)
    continue
  }
  const before = existsSync(join(MIGRATIONS, w.name))
    ? readFileSync(join(MIGRATIONS, w.name), 'utf8') : null
  if (before === w.sql) {
    say(`  unchanged  ${w.name}  (${w.what})`)
    continue
  }
  writeFileSync(join(MIGRATIONS, w.name), w.sql, 'utf8')
  say(`  ${w.reused ? 'rewrote' : 'wrote'}  ${w.name}  (${w.what})`)
}

say()
if (dryRun) {
  say('Nothing written — that was a dry run.')
} else {
  say('Apply anything new or rewritten in the Supabase SQL editor, in numeric order,')
  say('one file at a time. Each file is a single transaction, so a failure leaves')
  say('nothing behind.')
}
