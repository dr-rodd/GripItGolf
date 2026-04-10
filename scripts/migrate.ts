/**
 * Migration runner — executes SQL files directly against Supabase.
 *
 * Usage:
 *   npx tsx scripts/migrate.ts                    # runs all files in supabase/migrations/
 *   npx tsx scripts/migrate.ts schema.sql         # runs supabase/schema.sql
 *   npx tsx scripts/migrate.ts add_tees update_tees   # multiple files, in order
 *
 * Requires DATABASE_URL in .env.local:
 *   postgresql://postgres:[DB-PASSWORD]@db.ytidskkcfxqxgxtrnepq.supabase.co:5432/postgres
 *   (Supabase dashboard → Settings → Database → Connection string → URI)
 */

import { Client } from 'pg'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const SQL_DIR = path.resolve(process.cwd(), 'supabase')

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

async function run() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error(
      '\n✖  DATABASE_URL is not set in .env.local\n' +
      '   Find it in: Supabase → Settings → Database → Connection string (URI)\n' +
      '   Format: postgresql://postgres:[DB-PASSWORD]@db.ytidskkcfxqxgxtrnepq.supabase.co:5432/postgres\n'
    )
    process.exit(1)
  }

  const files = process.argv.slice(2).length > 0
    ? process.argv.slice(2).map(resolveFile)
    : listMigrations()

  if (!files.length) {
    console.error('No SQL files to run. Pass filenames as arguments.')
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
