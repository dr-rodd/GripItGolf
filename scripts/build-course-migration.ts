/**
 * Turn researched course files into migrations.
 *
 *   npm run courses:migration -- --dry-run   # says what it would write
 *   npm run courses:migration                # writes them
 *
 * Reads every `data/courses/<slug>.json`, puts each through the same gate
 * `npm test` runs, and writes `supabase/migrations/*_platform_courses_*.sql`
 * for what survives. **One fatal problem anywhere and it writes nothing** —
 * a half-applied batch is the failure mode worth spending a whole run to
 * avoid. Warnings print and it carries on.
 *
 * It does not touch the database. Somebody applies the files by hand, in
 * numeric order — `docs/course-import.md` and `docs/testing-and-data.md`.
 *
 * The rules all live in `lib/courseImport.ts`. This file is the I/O half:
 * reading the directory, working out the numbering, writing the SQL.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateCourseImport, validateImportSet, platformCoursesInSql, migrationSql,
  fatalsOf, isGeneratedSql, type CourseImport, type ImportProblem,
} from '../lib/courseImport'

const ROOT = join(__dirname, '..')
const DATA_DIR = join(ROOT, 'data', 'courses')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

/** Matching migration 004 (12) and 005 (14) — a batch is one screen of courses. */
const COURSES_PER_MIGRATION = 12

const dryRun = process.argv.includes('--dry-run')

const say = (s = '') => console.log(s)
const bail = (s: string): never => { console.error(s); process.exit(1) }

// ─── Read ──────────────────────────────────────────────────────

if (!existsSync(DATA_DIR)) {
  bail(`No ${DATA_DIR}. Course files live there, one per course — see docs/course-import.md.`)
}

const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort()

if (files.length === 0) {
  say('0 courses in data/courses/ — nothing to write.')
  say('Research lands there as one <slug>.json per course; docs/course-import.md has the contract.')
  process.exit(0)
}

const problems: ImportProblem[] = []
const loaded: { file: string; course: CourseImport }[] = []

for (const file of files) {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'))
  } catch (e) {
    problems.push({ file, fatal: true, message: `Not valid JSON — ${(e as Error).message}` })
    continue
  }
  const found = validateCourseImport(file, parsed)
  problems.push(...found)
  if (fatalsOf(found).length === 0) loaded.push({ file, course: parsed as CourseImport })
}

// What has already shipped — parsed out of the migrations rather than kept as
// a list here. This run's own previous output is skipped: it is only a
// projection of the same `data/courses/` being read now, so counting it would
// make every course collide with itself on the second run.
const migrationFiles = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
const sqlOf = new Map(migrationFiles.map(f => [f, readFileSync(join(MIGRATIONS, f), 'utf8')]))
const mine = migrationFiles.filter(f => isGeneratedSql(sqlOf.get(f)!))
const existing = migrationFiles
  .filter(f => !mine.includes(f))
  .flatMap(f => platformCoursesInSql(sqlOf.get(f)!))

problems.push(...validateImportSet(loaded, existing))

// ─── Report ────────────────────────────────────────────────────

const fatals = fatalsOf(problems)
const warnings = problems.filter(p => !p.fatal)

for (const w of warnings) say(`  warn  ${w.file}: ${w.message}`)

if (fatals.length > 0) {
  say()
  for (const f of fatals) console.error(`  REFUSED  ${f.file}: ${f.message}`)
  say()
  bail(`${fatals.length} problem${fatals.length === 1 ? '' : 's'} — nothing written. ` +
    'Fix the files and run again; docs/course-import.md says what each rule is for.')
}

say(`${loaded.length} course${loaded.length === 1 ? '' : 's'} ready, ` +
  `${existing.length} already on the platform.`)

// ─── Numbering ─────────────────────────────────────────────────
//
// Re-running must rewrite the same filenames, not add new ones beside them —
// otherwise a second run imports every course twice. Files this script wrote
// say so on their second line, so their numbers and letters are reused from
// the lowest up, and only a genuinely new batch takes a fresh number.

const numberOf = (f: string) => f.slice(0, 14)
const highest = migrationFiles.reduce((n, f) => Math.max(n, Number(f.slice(8, 14)) || 0), 0)
const nextNumber = (i: number) => `20260101${String(highest + 1 + i).padStart(6, '0')}`

/** a, b, c … continuing past the hand-written batches. */
const letterFor = (i: number) => String.fromCharCode('a'.charCodeAt(0) + i)
const handWritten = migrationFiles.filter(f =>
  /_platform_courses_[a-z]\.sql$/.test(f) && !mine.includes(f)).length

const batches: CourseImport[][] = []
for (let i = 0; i < loaded.length; i += COURSES_PER_MIGRATION) {
  batches.push(loaded.slice(i, i + COURSES_PER_MIGRATION).map(x => x.course))
}

let fresh = 0
const plan = batches.map((batch, i) => {
  const letter = letterFor(handWritten + i)
  const reused = mine[i]
  const name = reused ?? `${nextNumber(fresh++)}_platform_courses_${letter}.sql`
  return { batch, letter, name, number: numberOf(name), reused: Boolean(reused) }
})

if (mine.length > plan.length) {
  say()
  say(`  note  ${mine.length - plan.length} generated migration(s) no longer have courses ` +
    'behind them. They are left alone — a migration that has been applied cannot be ' +
    'unwritten, so remove the courses from the database by hand if that is what you meant.')
}

// ─── Write ─────────────────────────────────────────────────────

say()
for (const p of plan) {
  const sql = migrationSql(p.batch, { number: p.number, letter: p.letter })
  const where = join(MIGRATIONS, p.name)

  if (dryRun) {
    say(`  would ${p.reused ? 'rewrite' : 'write'}  ${p.name}  (${p.batch.length} courses)`)
    for (const c of p.batch) say(`      ${c.slug} — ${c.name}`)
    continue
  }

  writeFileSync(where, sql, 'utf8')
  say(`  ${p.reused ? 'rewrote' : 'wrote'}  ${p.name}  (${p.batch.length} courses)`)
}

say()
if (dryRun) {
  say('Nothing written — that was a dry run.')
} else {
  say('Apply them in the Supabase SQL editor, in numeric order, one file at a time.')
  say('Each file is a single transaction, so a failure leaves nothing behind.')
}
