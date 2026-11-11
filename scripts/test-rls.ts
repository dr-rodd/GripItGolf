/**
 * Row-level security, stage 3: the first lock. Run with: npm run test:rls
 *
 * Migration 070 lets a phone read and write an event's setup tables only as
 * a member of it. Nothing a phone does today may be refused by it, and the
 * test suite cannot reach a database, so this holds the three things that
 * make that true:
 *
 *   · creation — the one write a member cannot make — goes through
 *     /api/trip/create, which makes the row and the creator's membership
 *     together (run here on a stand-in), and takes every column the four
 *     create forms send;
 *   · every other browser write on those tables happens where the phone is
 *     already a member — inside an event's own pages, or a create form after
 *     the row exists — and no browser file reads another event by its code;
 *   · the migration itself: the ten tables and no others, members only,
 *     no `USING (true)`, the scoring tables untouched, an undo.
 */

import fs from 'fs'
import { runCreate, CREATE_COLUMNS, type CreateStore } from '../app/api/trip/create/create'

process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-key'
import { FIELD_WRITE_DAYS_AFTER_END, ORGANISER_MS, type Membership } from '../lib/membership'

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
const read = (p: string) => fs.readFileSync(p, 'utf-8')
function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? files(`${dir}/${d.name}`) : /\.tsx?$/.test(d.name) ? [`${dir}/${d.name}`] : [])
}
const isClient = (src: string) => /^(?:\s*\/\/[^\n]*\n|\s*\/\*[\s\S]*?\*\/)*\s*['"]use client['"]/.test(src)

const LOCKED = ['trips', 'players', 'teams', 'team_members', 'rounds', 'itinerary_items',
  'event_messages', 'matchplay_matches', 'tee_assignments', 'tee_times'] as const
const SCORING = ['scores', 'live_scores', 'live_rounds', 'live_player_locks', 'round_handicaps', 'composite_holes',
  'match_scores', 'match_concessions', 'session_matches', 'session_match_scores'] as const
const FORMS = ['CreateTripForm', 'CreateLeagueForm', 'CreateKnockoutForm', 'CreateRunForm'].map(f => `app/dashboard/create/${f}.tsx`)

// ─── /api/trip/create ──────────────────────────────────────────

const NOW = new Date('2026-11-11T09:00:00Z')

function standIn(opts: { taken?: boolean; membershipFails?: boolean } = {}) {
  const trips = new Map<string, Record<string, unknown>>()
  const members = new Map<string, Membership>()
  const emails = new Map<string, string>()
  const store: CreateStore = {
    async userFromToken(t) { return t.startsWith('tok-') ? t.slice(4) : null },
    async insertTrip(row) {
      if (opts.taken) return { error: { message: 'duplicate key value', code: '23505' } }
      const id = `trip-${trips.size + 1}`
      trips.set(id, row)
      return { id }
    },
    async writeMembership(u, t, m) {
      if (opts.membershipFails) throw new Error('down')
      members.set(`${u}:${t}`, m)
    },
    async writeLeadEmail(t, e) { emails.set(t, e) },
    async deleteTrip(id) { trips.delete(id) },
  }
  return { store, trips, members, emails }
}
const ROW = { name: 'Winter League', trip_code: 'GX7K2P', slug: 'gx7k2p', status: 'upcoming' }

async function createTests() {
  section('/api/trip/create: makes the row and the creator\'s membership together')
  {
    const { store, trips, members } = standIn()
    eq((await runCreate({ token: null, row: ROW }, store, NOW)).status, 401, 'no sign-in: refused')
    eq((await runCreate({ token: 'forged', row: ROW }, store, NOW)).status, 401, 'a token that is nobody: refused')
    const odd = await runCreate({ token: 'tok-u1', row: { ...ROW, id: 'x', run_results: {} } }, store, NOW)
    eq(odd.status, 400, 'a column no create form sets: refused')
    ok(!odd.body.data && /id, run_results/.test(odd.body.error?.message ?? ''), '  …naming it, never dropping it quietly')
    eq((await runCreate({ token: 'tok-u1', row: { ...ROW, name: ' ' } }, store, NOW)).status, 400, 'no name: refused')
    eq((await runCreate({ token: 'tok-u1', row: { ...ROW, trip_code: 'abc' } }, store, NOW)).status, 400, 'no proper code: refused')
    eq(trips.size, 0, '  …and none of those made a row')

    const made = await runCreate({ token: 'tok-u1', row: ROW }, store, NOW)
    eq(made.status, 200, 'a proper row is made')
    eq(made.body, { data: { id: 'trip-1' }, organiserUntil: null, error: null }, '  …answered in supabase-js\'s own shape, so the form reads it as its insert')
    eq(members.get('u1:trip-1'), { role: 'guest', playerId: null, organiserUntil: null },
      '  …and the phone that made it is a member from the first moment')

    eq((await runCreate({ token: 'tok-u2', row: { ...ROW, trip_code: 'ABC123', settings_passcode_hash: 'h' } }, store, NOW)).status, 400,
      'a hash in the row is refused — no phone makes one now (stage 4, D64)')
    const pinned = await runCreate({ token: 'tok-u2', row: { ...ROW, trip_code: 'ABC123' }, adminPin: '4321', publicPin: '5678' }, store, NOW)
    eq(members.get('u2:trip-2')?.organiserUntil, new Date(NOW.getTime() + ORGANISER_MS).toISOString(),
      'the phone that set the PIN is the organiser for twelve hours')
    eq(pinned.status === 200 && pinned.body.organiserUntil, new Date(NOW.getTime() + ORGANISER_MS).toISOString(), '  …and is told until when')
    const stored = trips.get('trip-2') as Record<string, string>
    ok(stored.settings_passcode_hash.startsWith('s1$') && stored.public_passcode_hash.startsWith('s1$'),
      '  …both PINs stored by the server, salted and slow')
    ok(pinned.status === 200 && !!pinned.doorCookie && pinned.doorCookie !== stored.public_passcode_hash,
      '  …and the maker let through the public PIN\'s door with a token, not the hash')
    eq((await runCreate({ token: 'tok-u3', row: { ...ROW, trip_code: 'ABC124' }, adminPin: '4321', publicPin: '4321' }, store, NOW)).status, 400,
      'a public PIN the same as the admin PIN is refused')
    eq((await runCreate({ token: 'tok-u3', row: { ...ROW, trip_code: 'ABC125' }, adminPin: '12' }, store, NOW)).status, 400,
      '  …and a PIN too short')
  }
  {
    const { store, trips, emails } = standIn()
    const out = await runCreate({ token: 'tok-u9', row: { ...ROW, lead_email: ' lead@example.com ' } }, store, NOW)
    eq(out.status, 200, 'an event made with an address is made')
    ok(!('lead_email' in (trips.get('trip-1') ?? {})), '  …the address never on the trips row every member reads (stage 5, D62)')
    eq(emails.get('trip-1'), 'lead@example.com', '  …kept apart instead')
  }
  {
    const { store } = standIn({ taken: true })
    const out = await runCreate({ token: 'tok-u1', row: ROW }, store, NOW)
    eq([out.status, out.body.error?.code], [409, '23505'], 'a code already taken says so, as the insert did')
  }
  {
    const { store, trips } = standIn({ membershipFails: true })
    const out = await runCreate({ token: 'tok-u1', row: ROW }, store, NOW)
    eq(out.status, 503, 'the membership not written: refused')
    eq(trips.size, 0, '  …and the row taken back, never an event its maker cannot touch')
  }

  section('Stage 5: the address is read only on the server, from the closed table')
  {
    const helper = read('lib/leadEmail.ts')
    ok(/from\('trip_private'\)/.test(helper), 'lib/leadEmail.ts reads and writes trip_private')
    for (const f of ['app/api/trip-confirmation/route.ts', 'app/api/event/resetStore.ts', 'app/admin/trips/page.tsx']) {
      const src = read(f)
      ok(/LeadEmail/.test(src) && !/select\('[^']*lead_email/.test(src), `${f} reads the address through lib/leadEmail.ts`)
    }
    const m = read('supabase/migrations/20260101000078_hide_lead_email.sql')
    ok(/REVOKE SELECT \(lead_email\), UPDATE \(lead_email\) ON public\.trips FROM authenticated/.test(m), 'migration 078 closes the old column to phones')
    ok(/UPDATE public\.trips SET lead_email = NULL/.test(m), '  …and empties it once copied')
  }

  section('Every column a create form sends is one the route takes')
  for (const f of FORMS) {
    const src = read(f)
    const start = src.indexOf('const tripRow: Record<string, unknown> = {')
    const end = src.indexOf('createTripRow(tripRow, pins)', start)
    ok(start >= 0 && end > start, `${f}: builds its row, then hands it to createTripRow`)
    const block = src.slice(start, end)
    const keys = new Set<string>()
    for (const m of block.matchAll(/tripRow\.(\w+)\s*=/g)) keys.add(m[1])
    for (const m of block.matchAll(/\?\s*\{\s*(\w+):/g)) keys.add(m[1])
    let depth = 0
    for (const line of block.slice(block.indexOf('{') + 1).split('\n')) {
      if (depth === 0) { const k = /^\s*(\w+)\s*[:,]/.exec(line)?.[1]; if (k) keys.add(k) }
      depth += (line.match(/[{[(]/g) ?? []).length - (line.match(/[}\])]/g) ?? []).length
      if (depth < 0) break
    }
    const missing = [...keys].filter(k => !(CREATE_COLUMNS as readonly string[]).includes(k))
    eq(missing, [], `${f}: sends ${[...keys].length} columns, every one taken`)
    ok(!/from\('trips'\)\s*\.insert/.test(src.replace(/\s+/g, ' ').replace(/\. /g, '.')) && !/\.from\('trips'\)\s*\n\s*\.insert/.test(src),
      `${f}: never inserts into trips itself`)
  }
}

// ─── Nothing a phone does today is refused ─────────────────────

const BROWSER_STORES = new Set([
  'lib/teamMembers.ts', 'lib/matchplayStore.ts', 'lib/leagueRoundStore.ts', 'lib/roundHandicaps.ts',
  'lib/itineraryStore.ts', 'lib/drawStore.ts', 'lib/sessionMatchStore.ts', 'lib/matchCardVoid.ts',
  'lib/scorecardVoid.ts', 'app/golf/[root]/[tripCode]/teams/teamWrites.ts', 'app/dashboard/create/fieldTagsWrite.ts',
])
/** Where a phone is already a member: an event's own pages (EnsureMember in their layouts), a create form after its row. */
const MEMBER_PLACES = [/^app\/golf\/\[root\]\/\[tripCode\]\//, /^app\/run\/\[tripCode\]\//, /^app\/dashboard\/create\//, /^app\/scoring\//, /^app\/components\//]

function wiringTests() {
  const all = [...files('app'), ...files('lib')]

  section('Every browser write on a locked table happens where the phone is a member')
  for (const f of all) {
    const src = read(f)
    if (!isClient(src) && !BROWSER_STORES.has(f)) continue
    for (const t of LOCKED) {
      const writes = new RegExp(`from\\(['"]${t}['"]\\)[\\s\\S]{0,200}?\\.(insert|update|upsert|delete)\\(`).test(src)
      if (!writes) continue
      ok(BROWSER_STORES.has(f) || MEMBER_PLACES.some(re => re.test(f)), `${f} writes ${t} from a place the phone is a member`)
    }
  }
  const layouts = ['app/golf/[root]/[tripCode]/layout.tsx', 'app/run/[tripCode]/layout.tsx']
  for (const l of layouts) ok(read(l).includes('<EnsureMember tripCode={tripCode} />'), `${l}: every page under it makes the phone a member`)
  const ensure = read('app/components/EnsureMember.tsx')
  ok(/useEffect\(\(\) => \{[\s\S]*?void ensureMember\(tripCode\)[\s\S]*?\}, \[tripCode\]\)/.test(ensure) && !/requestIdleCallback|setTimeout/.test(ensure),
    '  …straight after the first paint, not left until the phone is idle')

  section('No browser file reads another event by its code')
  for (const f of all) {
    const src = read(f)
    if (!isClient(src)) continue
    ok(!/eq\(['"]trip_code['"]/.test(src), `${f} asks the server about a code (/api/event/find, /api/event/seed), never the table`)
  }

  section('Migration 070: the ten setup tables, members only')
  const sql = read('supabase/migrations/20260101000070_lock_setup_tables.sql')
  const code = sql.replace(/--[^\n]*/g, '')
  const locked = [...code.matchAll(/ALTER TABLE (\w+) ENABLE ROW LEVEL SECURITY/g)].map(m => m[1]).sort()
  eq(locked, [...LOCKED].sort(), 'row-level security goes on exactly the ten')
  for (const t of SCORING) ok(!new RegExp(`\\b${t}\\b`).test(code), `${t}: untouched — scoring stays open`)
  ok(!/USING \(true\)|WITH CHECK \(true\)/i.test(code), 'no policy that lets everybody in')
  ok((code.match(/TO authenticated/g) ?? []).length >= 2 + 9 * 4 && !/ON \w+ FOR \w+ TO anon/.test(code), 'every policy is for signed-in phones; none for anon')
  for (const t of LOCKED.filter(t => t !== 'trips')) {
    ok(new RegExp(`CREATE POLICY ${t}_member_read\\s+ON ${t} FOR SELECT TO authenticated USING \\(trip_id IN \\(SELECT public\\.readable_trips\\(\\)\\)\\)`).test(code), `${t}: members read`)
    for (const op of ['insert', 'update', 'delete']) {
      ok(new RegExp(`CREATE POLICY ${t}_member_${op}\\s+ON ${t} FOR ${op.toUpperCase()} TO authenticated[^;]*writable_trips`).test(code), `  …and ${op}`)
    }
  }
  ok(/CREATE POLICY trips_member_read ON trips FOR SELECT/.test(code) && /CREATE POLICY trips_member_update ON trips FOR UPDATE/.test(code)
    && !/ON trips FOR (INSERT|DELETE)/.test(code), 'trips: read and change your own; never make or delete one from a phone')
  ok(/writable_trips\(\)[\s\S]*?m\.role IN \('player', 'guest'\) OR m\.organiser_until > now\(\)/.test(code),
    'a spectator reads and does not write; the organiser writes while the twelve hours run')
  for (const fn of ['readable_trips', 'writable_trips']) {
    ok(new RegExp(`FUNCTION public\\.${fn}\\(\\)[\\s\\S]*?SECURITY DEFINER[\\s\\S]*?SET search_path = ''`).test(code), `${fn}: runs as its owner, empty search path`)
    ok(code.includes(`REVOKE ALL ON FUNCTION public.${fn}() FROM PUBLIC, anon`), `  …closed to anon`)
  }
  ok(/REVOKE ALL ON public\.leaderboard_summary\s+FROM anon, authenticated/.test(code)
    && /REVOKE ALL ON public\.leaderboard_by_round FROM anon, authenticated/.test(code), 'the two old views, a way round every policy, are closed to phones')
  ok(/PASTE THIS AFTER THE STAGE 3 DEPLOY/.test(sql), 'it says to paste it after the deploy')
  const undo = sql.slice(sql.indexOf('Undo'))
  for (const t of LOCKED) ok(new RegExp(`ALTER TABLE ${t}\\s+DISABLE ROW LEVEL SECURITY`).test(undo), `undo switches ${t} back`)
}

function stageFourSql() {
  section('Migration 071: roles told apart (stage 4)')
  const sql = read('supabase/migrations/20260101000071_roles_told_apart.sql')
  const code = sql.replace(/--[^\n]*/g, '')
  ok(/PASTE THIS AFTER THE STAGE 4 DEPLOY/.test(sql), 'it says to paste it after the deploy')
  for (const t of SCORING) ok(!new RegExp(`\\b${t}\\b`).test(code), `${t}: untouched — scoring stays open`)

  // D59: the cap, the same instant as lib/membership.ts fieldReadOnlyFrom.
  ok(code.includes(`(t.end_date + ${FIELD_WRITE_DAYS_AFTER_END + 1})::timestamp AT TIME ZONE 'Europe/Dublin'`),
    `the field writes until midnight, Irish time, after day ${FIELD_WRITE_DAYS_AFTER_END} — the same instant as fieldReadOnlyFrom`)
  ok(/m\.organiser_until > now\(\)\s*OR \(m\.role IN \('player', 'guest'\) AND \(\s*t\.end_date IS NULL/.test(code),
    '  …the organiser with the PIN never capped, an event with no end never capped, a spectator never writing')
  ok(code.includes(`t.bracket_setup -> 'schedule' = '"series"'::jsonb`) && code.includes(`COALESCE(t.bracket_setup -> 'repeat', 'null'::jsonb) = 'null'::jsonb`)
    && code.includes(`t.event_permissions -> 'add_rounds' = 'true'::jsonb`),
    '  …nor an ad hoc series whose field adds rounds — read off the raw columns as fieldOpenEnded reads them')

  // D65, D66: the organiser alone changes the event.
  ok(/FUNCTION public\.organiser_trips\(\)[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''[\s\S]*?m\.organiser_until > now\(\)[\s\S]*?COALESCE\(t\.settings_passcode_hash, ''\) = ''[\s\S]*?writable_trips\(\)/.test(code),
    'organiser_trips: the PIN\'s twelve hours, or any member who may write on an event with no PIN')
  ok(code.includes('REVOKE ALL ON FUNCTION public.organiser_trips() FROM PUBLIC, anon'), '  …closed to anon')
  ok(/DROP POLICY IF EXISTS trips_member_update ON trips;\s*CREATE POLICY trips_organiser_update ON trips FOR UPDATE TO authenticated\s*USING \(id IN \(SELECT public\.organiser_trips\(\)\)\)\s*WITH CHECK \(id IN \(SELECT public\.organiser_trips\(\)\)\)/.test(code),
    'only the organiser updates the trips row')
  for (const t of ['players', 'rounds', 'event_messages']) {
    ok(new RegExp(`DROP POLICY IF EXISTS ${t}_member_delete ON ${t};\\s*CREATE POLICY ${t}_organiser_delete ON ${t} FOR DELETE TO authenticated\\s*USING \\(trip_id IN \\(SELECT public\\.organiser_trips\\(\\)\\)\\)`).test(code),
      `only the organiser deletes from ${t}`)
  }
  ok(/CREATE POLICY teams_delete ON teams FOR DELETE[\s\S]*?organiser_trips\(\)[\s\S]*?writable_trips\(\)[\s\S]*?kind IS DISTINCT FROM 'tournament'[\s\S]*?count\(\*\) FROM public\.team_members tm WHERE tm\.team_id = teams\.id\) <= 1[\s\S]*?NOT \(teams\.team_set = 'main'/.test(code),
    'a team: the organiser; a golf trip\'s group; elsewhere the field only once it is down to one, and never an event\'s tag')
  for (const t of LOCKED.filter(t => !['trips', 'players', 'rounds', 'event_messages', 'teams'].includes(t))) {
    ok(!new RegExp(`\\b${t}_\\w+ ON ${t}\\b`).test(code), `${t}: as stage 3 left it`)
  }

  // D64: the two hashes closed to phones, every other column open.
  ok(/REVOKE SELECT, UPDATE ON public\.trips FROM anon, authenticated;/.test(code), 'the trips row is closed to phones column by column')
  ok(/column_name NOT IN \('settings_passcode_hash', 'public_passcode_hash'\)[\s\S]*?GRANT SELECT \(%s\) ON public\.trips TO authenticated/.test(code),
    '  …then every column but the two hashes opened to read')
  ok(/column_name NOT IN \('settings_passcode_hash', 'public_passcode_hash', 'id', 'trip_code', 'created_at'\)[\s\S]*?GRANT UPDATE \(%s\) ON public\.trips TO authenticated/.test(code),
    '  …and to change, bar the hashes, the id, the code and when it was made')
  ok(!/GRANT[^;]*passcode_hash[^;]*TO authenticated/.test(code), '  …and nothing grants a hash back')

  const undo = sql.slice(sql.indexOf('─── Undo'))
  ok(/GRANT SELECT, UPDATE ON public\.trips TO anon, authenticated;/.test(undo), 'undo opens the columns again')
  ok(/m\.role IN \('player', 'guest'\) OR m\.organiser_until > now\(\)/.test(undo), '  …puts back stage 3\'s writable_trips')
  for (const p of ['trips_member_update', 'players_member_delete', 'rounds_member_delete', 'event_messages_member_delete', 'teams_member_delete']) {
    ok(undo.includes(`CREATE POLICY ${p}`), `  …and ${p}`)
  }
  ok(undo.includes('DROP FUNCTION IF EXISTS public.organiser_trips()'), '  …and drops organiser_trips')

  const check = read('scripts/rls-check.sql')
  ok(/Stage 4: roles told apart/.test(check) && /guest_changed_event/.test(check) && /organiser_changed_event/.test(check)
    && /SELECT settings_passcode_hash FROM trips/.test(check), 'scripts/rls-check.sql pretends to be a guest and an organiser, and tries to read a hash')

  section('No PIN check or PIN write left to a phone')
  const browser = [...files('app'), ...files('lib')].filter(f => isClient(read(f)) || BROWSER_STORES.has(f))
  for (const f of browser) {
    const src = read(f)
    ok(!/\.update\(\{[^}]*passcode_hash/.test(src), `${f}: writes no PIN`)
  }
  const store = read('lib/leagueRoundStore.ts')
  ok(store.includes('await extendEventEnd(args.tripCode, args.date)') && !/from\('trips'\)\s*\.update\(\{ end_date/.test(store),
    'Add round moves an ad hoc series\' end through the server')
  const wizard = read('app/golf/[root]/[tripCode]/teesheet/[roundId]/setup/TeeSheetWizard.tsx')
  ok(wizard.includes('await answerPlayTogether(tripCode, playTogether.boardId, together)') && !/from\('trips'\)/.test(wizard),
    'the tee sheet wizard\'s answer goes through the server')
}

async function main() {
  await createTests()
  wiringTests()
  stageFourSql()
  console.log(`\n${'─'.repeat(56)}`)
  if (failed > 0) {
    console.log(`✗ ${failed} failed, ${passed} passed`)
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  console.log(`✓ all ${passed} checks passed`)
}
void main()
