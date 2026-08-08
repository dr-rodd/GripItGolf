/**
 * Migration runner — executes SQL files directly against Supabase.
 *
 * Usage:
 *   npx tsx scripts/migrate.ts migrations/20260101000028_hole_stats.sql
 *   npx tsx scripts/migrate.ts schema.sql
 *   npx tsx scripts/migrate.ts add_tees update_tees   # multiple, in order
 *
 * Paths resolve against `supabase/`, so a migration needs its `migrations/`
 * prefix. Names may be given with or without `.sql`.
 *
 * **One file at a time, by name. Running the whole folder is opt-in.**
 *
 * There is no ledger — nothing records which migrations have already been
 * applied — so "run them all" means "run them all *again*", and the house
 * style of `ADD COLUMN IF NOT EXISTS` / `ON CONFLICT DO NOTHING` is what
 * usually makes that harmless. Usually is not always:
 *
 *   supabase/migrations/20260101000010_trip_lifecycle.sql ends with
 *     UPDATE trips SET setup_status = 'live', finalised_at = COALESCE(...)
 *      WHERE setup_status = 'draft';
 *
 * which is a one-time backfill for trips that predated the draft/live
 * switch. Replay it and **every trip currently being set up is flipped to
 * live and stamped finalised** — silently, with nothing on screen to say so.
 *
 * CLAUDE.md has warned "never replay it" since that migration landed. The
 * warning lived in a document and the danger lived in the default, so the
 * default moved: a bare run now lists what it would do and stops. Anyone
 * loosening this again should know that is what it is protecting.
 *
 * Requires DATABASE_URL in .env.local. Supabase dashboard → Settings →
 * Database → Connection string → **Session pooler**:
 *
 *   postgresql://postgres.bnnnnuxoczzuipefhvms:[DB-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
 *
 * The pooler, not "Direct connection": direct is IPv6-only, so on ordinary
 * home broadband it does not fail, it hangs.
 *
 * For a single migration the Supabase dashboard's SQL editor is easier than
 * any of this — paste the file, press Run. This script earns its keep on a
 * batch, or from a machine already set up.
 */

import { Client } from 'pg'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const SQL_DIR = path.resolve(process.cwd(), 'supabase')

/** The migration a full replay would damage, named where it is enforced. */
const DESTRUCTIVE_ON_REPLAY = '20260101000010_trip_lifecycle.sql'

function resolveFile(arg: string): string {
  // Accept: full path, filename with or without .sql extension
  const candidates = [
    arg,
    path.join(SQL_DIR, arg),
    path.join(SQL_DIR, arg.endsWith('.sql') ? arg : `${arg}.sql`),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  throw new Error(`SQL file not found: ${arg}`)
}

function listMigrations(): string[] {
  const dir = path.join(SQL_DIR, 'migrations')
  if (!fs.existsSync(dir)) {
    console.log('No supabase/migrations/ directory found — specify files explicitly.')
    process.exit(0)
  }
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => path.join(dir, f))
}

/**
 * What to run, or a refusal.
 *
 * Returns without connecting when the answer is "not like that" — the point
 * is to stop before a connection exists, not to open one and then think
 * better of it.
 */
function filesToRun(args: string[]): string[] {
  const wantsAll = args.includes('--all')
  const named = args.filter(a => a !== '--all')

  if (named.length > 0) {
    if (wantsAll) {
      console.error('\n✖  Pass filenames or --all, not both.\n')
      process.exit(1)
    }
    // Said plainly rather than thrown. A stack trace over a mistyped
    // filename tells a reader nothing they can act on.
    try {
      return named.map(resolveFile)
    } catch (err: any) {
      console.error(
        `\n✖  ${err.message}\n\n` +
        '   Paths resolve against supabase/, so a migration needs its prefix:\n\n' +
        '     npx tsx scripts/migrate.ts migrations/20260101000028_hole_stats.sql\n'
      )
      process.exit(1)
    }
  }

  const all = listMigrations()

  if (!wantsAll) {
    console.log(
      `\n${all.length} migrations in supabase/migrations/. This would run every one of\n` +
      'them again — there is no record of which have already been applied.\n\n' +
      'Usually you want one, by name:\n\n' +
      `  npx tsx scripts/migrate.ts migrations/${path.basename(all[all.length - 1] ?? 'FILE.sql')}\n\n` +
      'To run the whole folder anyway: --all (and read what it says).\n'
    )
    process.exit(1)
  }

  // --all, deliberately typed. One more gate, because this is the one that
  // changes data rather than schema.
  if (process.env.ALLOW_REPLAY !== '1') {
    console.error(
      '\n✖  Refusing to replay every migration.\n\n' +
      `   supabase/migrations/${DESTRUCTIVE_ON_REPLAY} carries a one-time\n` +
      '   backfill. Running it again flips every trip currently in draft to\n' +
      "   'live' and stamps it finalised, silently.\n\n" +
      '   If that is genuinely what you want — a fresh database, say — then:\n\n' +
      '     ALLOW_REPLAY=1 npx tsx scripts/migrate.ts --all\n\n' +
      '   On a database with real trips on it, run the one file you meant instead.\n'
    )
    process.exit(1)
  }

  console.log(
    `\n⚠  Replaying all ${all.length} migrations, including ${DESTRUCTIVE_ON_REPLAY}.\n`
  )
  return all
}

async function run() {
  // What to run is settled before the connection string is even looked for.
  // Told "set DATABASE_URL" when the real problem is "you just asked to
  // replay twenty-eight migrations", somebody goes and finds the password.
  const files = filesToRun(process.argv.slice(2))

  if (!files.length) {
    console.error('No SQL files to run. Pass filenames as arguments.')
    process.exit(1)
  }

  const url = process.env.DATABASE_URL
  if (!url) {
    console.error(
      '\n✖  DATABASE_URL is not set in .env.local\n' +
      '   Supabase → Settings → Database → Connection string → Session pooler\n' +
      '   (the pooler, not Direct — direct is IPv6-only and will just hang)\n' +
      '   Format: postgresql://postgres.bnnnnuxoczzuipefhvms:[DB-PASSWORD]' +
      '@aws-0-[REGION].pooler.supabase.com:5432/postgres\n'
    )
    process.exit(1)
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log('Connected to Supabase.\n')

  for (const file of files) {
    const name = path.relative(process.cwd(), file)
    const sql  = fs.readFileSync(file, 'utf-8').trim()

    if (!sql) {
      console.log(`  ⚠  ${name} — empty, skipping`)
      continue
    }

    process.stdout.write(`  ▶  ${name} … `)
    try {
      await client.query(sql)
      console.log('✓')
    } catch (err: any) {
      console.log('✖')
      console.error(`\n     Error: ${err.message}\n`)
      await client.end()
      process.exit(1)
    }
  }

  await client.end()
  console.log('\nDone.')
}

run()
