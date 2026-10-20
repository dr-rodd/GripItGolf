/**
 * Migration grants. Run with: npm run test:migration-grants
 *
 * From 30 October 2026 Supabase stops granting the Data API access to new
 * tables in `public` on its own. A table made after that answers every
 * request — the browser's and the server's alike — with "permission
 * denied" until it is granted explicitly, and the feature built on it
 * fails the first time anybody uses it. Every table before then got the
 * automatic grants, which is why no migration up to 056 has ever carried a
 * GRANT and why they are left alone here.
 *
 * So from migration 057 on, every table a migration creates must, in the
 * same file:
 *
 *   · be granted to `service_role` — even a table closed to the browser,
 *     because the server's role bypasses RLS but still needs the grant;
 *   · if it is granted to `anon` at all, have RLS switched on — a grant
 *     with RLS off is the whole table, read and write, to anybody with the
 *     site's public key.
 *
 * Green Dot has no logins, so `authenticated` is neither required nor
 * refused. The template in CLAUDE.md ("New tables need grants") is held
 * to the same check, so the rule and the example can never disagree.
 */

import fs from 'fs'
import path from 'path'

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

// ─── The rule ──────────────────────────────────────────────────

/** The first migration Supabase will not grant automatically. Earlier files are left as they are. */
const FIRST_CHECKED = '20260101000057'

/** Comments out, so a commented-out GRANT never counts as one. */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
}

/** `public."Foo"`, `"foo"`, `foo` → `foo`; another schema's table → null (not ours to grant). */
function tableName(raw: string): string | null {
  const parts = raw.trim().split('.').map(p => p.trim().replace(/^"|"$/g, '').toLowerCase())
  if (parts.length === 2 && parts[0] !== 'public') return null
  return parts[parts.length - 1] || null
}

/** Every table this SQL creates in `public`, in order, once each. */
export function createdTables(sql: string): string[] {
  const out: string[] = []
  const re = /create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?((?:"?\w+"?\s*\.\s*)?"?\w+"?)/gi
  for (const m of stripComments(sql).matchAll(re)) {
    const t = tableName(m[1])
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

/** Which roles each table is granted to. `ALL TABLES IN SCHEMA` deliberately counts for nothing. */
function grants(sql: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const re = /grant\s+[\s\S]+?\s+on\s+(?!schema\b|all\s+tables\b|sequence\b|all\s+sequences\b|function\b|all\s+functions\b)(?:table\s+)?([\s\S]+?)\s+to\s+([\s\S]+?)(?:\s+with\s+grant\s+option)?\s*;/gi
  for (const m of stripComments(sql).matchAll(re)) {
    const roles = m[2].split(',').map(r => r.trim().toLowerCase())
    for (const raw of m[1].split(',')) {
      const t = tableName(raw)
      if (!t) continue
      const set = out.get(t) ?? new Set<string>()
      roles.forEach(r => set.add(r))
      out.set(t, set)
    }
  }
  return out
}

function rlsOn(sql: string, table: string): boolean {
  const re = new RegExp(
    `alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?(?:"?public"?\\s*\\.\\s*)?"?${table}"?\\s+enable\\s+row\\s+level\\s+security`, 'i')
  return re.test(stripComments(sql))
}

/** Everything wrong with one migration's grants, as sentences. Empty when it is right. */
export function grantIssues(sql: string): string[] {
  const given = grants(sql)
  const issues: string[] = []
  for (const t of createdTables(sql)) {
    const roles = given.get(t) ?? new Set<string>()
    if (!roles.has('service_role')) {
      issues.push(`${t}: no GRANT … TO service_role — the server will be refused, RLS or not`)
    }
    if (roles.has('anon') && !rlsOn(sql, t)) {
      issues.push(`${t}: granted to anon with RLS never enabled — the whole table, to anybody with the public key`)
    }
  }
  return issues
}

// ─── The checker, against migrations written to fail ───────────

section('A table closed to the browser needs the server\'s grant, and nothing for anon')
{
  const closed = `
    CREATE TABLE IF NOT EXISTS secrets (id uuid PRIMARY KEY);
    ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.secrets TO service_role;`
  eq(grantIssues(closed), [], 'granted to service_role, RLS on, no anon: right')
  eq(grantIssues(closed.replace(/GRANT[^;]+;/, '')).length, 1, 'no grant at all: refused')
  ok(grantIssues(closed.replace(/GRANT[^;]+;/, ''))[0].startsWith('secrets: no GRANT'), 'and the table is named')
}

section('A table the browser reaches needs RLS on before anon is granted anything')
{
  const browser = `
    create table notes (id uuid primary key);
    alter table public.notes enable row level security;
    create policy notes_read on notes for select using (true);
    grant select on table public.notes to anon;
    grant all on notes to service_role;`
  eq(grantIssues(browser), [], 'anon granted with RLS on, service_role granted: right')
  const open = browser.replace(/alter table[^;]+;/, '')
  eq(grantIssues(open).length, 1, 'anon granted with RLS off: refused')
  ok(grantIssues(open)[0].includes('anon'), 'and the reason says so')
}

section('Grants read the way Postgres reads them')
{
  eq(grantIssues(`
    CREATE TABLE a (id int); CREATE TABLE "public"."B" (id int);
    ALTER TABLE a ENABLE ROW LEVEL SECURITY; ALTER TABLE b ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON a, public."B" TO anon, service_role;`), [],
    'several tables and several roles in one statement, quoted and schema-qualified')
  eq(createdTables('CREATE TABLE auth.thing (id int); CREATE TABLE x (id int);'), ['x'],
    'a table in another schema is not ours to grant')
  eq(grantIssues(`
    CREATE TABLE c (id int);
    -- GRANT ALL ON c TO service_role;
    /* GRANT ALL ON c TO service_role; */`).length, 1,
    'a commented-out grant is no grant')
  eq(grantIssues(`
    CREATE TABLE d (id int);
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`).length, 1,
    'a schema-wide grant counts for nothing — each table is granted by name')
  eq(grantIssues(`
    CREATE TABLE e (id int);
    GRANT USAGE ON SEQUENCE e_id_seq TO service_role;`).length, 1,
    'a sequence grant is not the table\'s grant')
  eq(grantIssues('ALTER TABLE scores ADD COLUMN x int;'), [],
    'a migration that creates no table has nothing to grant')
}

// ─── CLAUDE.md's template passes its own rule ──────────────────

section('The template in CLAUDE.md is a migration this check accepts')
{
  const md = fs.readFileSync('CLAUDE.md', 'utf-8')
  const at = md.indexOf('## New tables need grants')
  ok(at >= 0, 'CLAUDE.md carries the rule')
  const block = md.slice(at).match(/```sql\n([\s\S]*?)```/)?.[1] ?? ''
  ok(createdTables(block).length === 2, 'its template creates two tables — one closed, one the browser reaches')
  eq(grantIssues(block), [], 'and both are granted the way the rule asks')
}

// ─── Every real migration from 057 on ──────────────────────────

section(`Every migration from ${FIRST_CHECKED.slice(-3)} on grants its tables`)
{
  const dir = 'supabase/migrations'
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  ok(files.every(f => /^\d{14}_/.test(f)), 'every migration is named by its fourteen-digit number')
  const checked = files.filter(f => f.slice(0, 14) >= FIRST_CHECKED)
  for (const f of checked) {
    const issues = grantIssues(fs.readFileSync(path.join(dir, f), 'utf-8'))
    ok(issues.length === 0, `${f}${issues.length ? `\n          ${issues.join('\n          ')}` : ''}`)
  }
  console.log(`  (${checked.length} checked; ${files.length - checked.length} earlier ones keep Supabase's automatic grants)`)
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
