/**
 * Green Dot Run tests. Run with: npm run test:run-challenge
 *
 * Two halves. The rules in lib/runChallenge.ts are checked directly — how
 * a run earns points (the minimum, the activities, the daily cap), the
 * stored setup read back whole and fail-soft, the permissions with their
 * own defaults, and the creation checks. Then the wiring: the sport chooser
 * offers running, the create route opens the run wizard, creation writes
 * in the platform's order through the shared team writer, every golf door
 * hands a run challenge to /run/, and the email says "challenge" without
 * ever changing a golf message.
 */

import fs from 'fs'
import {
  RUN_KIND, isRunChallenge, RUN_ACTIVITIES, activityFromStrava,
  defaultRules, parseRules, rulesIssue, runPoints, dayPoints,
  describeRules, exampleLine, formatPoints,
  defaultBoards, parseRunSetup, describeTeamScore,
  RUN_PERMISSIONS, defaultRunPermissions, parseRunPermissions, storedRunPermissions,
  challengeDatesIssue, teamNamesIssue, describeProgress,
  migrationMissing, MAX_POINTS, MAX_RUN_TEAMS,
  type RunRules,
} from '../lib/runChallenge'
import { parseEventPermissions, defaultPermissions } from '../lib/eventPermissions'
import { confirmationHtml, confirmationText, confirmationSubject } from '../lib/confirmationEmail'

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
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const rules = (patch: Partial<RunRules> = {}): RunRules => ({ ...defaultRules(), ...patch })

// ─── What a run challenge is ───────────────────────────────────

section('A run challenge is a kind of trip, told apart by one value')
{
  eq(RUN_KIND, 'run', 'the stored kind is "run"')
  ok(isRunChallenge('run'), 'run is a run challenge')
  ok(!isRunChallenge('trip') && !isRunChallenge('tournament'), 'golf kinds are not')
  ok(!isRunChallenge(null) && !isRunChallenge(undefined), 'an unknown kind is golf — fail soft')
}

// ─── Points ────────────────────────────────────────────────────

section('A new challenge starts at a point a km and two for turning up')
{
  const d = defaultRules()
  eq([d.pointsPerKm, d.pointsPerRun, d.minKm, d.dailyCap], [1, 2, 1, null],
    '1 per km, 2 per run, 1 km to count, no daily limit')
  eq(d.activities, ['run', 'trail_run', 'treadmill'], 'running in all three forms, walks and hikes off')
  eq(RUN_ACTIVITIES.filter(a => a.dflt).map(a => a.key), d.activities,
    'and the defaults are read off the registry, not restated')
}

section('What one run earns')
{
  const r = rules()
  eq(runPoints({ km: 5, activity: 'run' }, r), 7, '5 km: five for the distance, two for the run')
  eq(runPoints({ km: 1, activity: 'run' }, r), 3, 'the minimum is inclusive — 1 km counts at a 1 km minimum')
  eq(runPoints({ km: 0.99, activity: 'run' }, r), 0, 'just under it earns nothing at all, not even the run points')
  eq(runPoints({ km: 5, activity: 'walk' }, r), 0, 'an activity the challenge does not count earns nothing')
  eq(runPoints({ km: 5, activity: 'treadmill' }, r), 7, 'a treadmill run counts like any other by default')
  eq(runPoints({ km: 0, activity: 'run' }, rules({ minKm: 0 })), 0,
    'a zero-length run earns nothing even with no minimum')
  eq(runPoints({ km: 3.33, activity: 'run' }, rules({ pointsPerKm: 1.5, pointsPerRun: 0 })), 5,
    'points round to one decimal place (3.33 × 1.5 = 4.995 → 5)')
  eq(runPoints({ km: 10.25, activity: 'trail_run' }, rules({ pointsPerKm: 2, pointsPerRun: 0 })), 20.5,
    'and keep a half point when there is one')
}

section('A day is held to the daily limit')
{
  const day = [{ km: 10, activity: 'run' as const }, { km: 5, activity: 'run' as const }]
  eq(dayPoints(day, rules()), 19, 'no limit: the day is every run added up (12 + 7)')
  eq(dayPoints(day, rules({ dailyCap: 15 })), 15, 'a limit caps the day, not each run')
  eq(dayPoints([{ km: 5, activity: 'run' }], rules({ dailyCap: 15 })), 7, 'a day under the limit is untouched')
  eq(dayPoints([{ km: 5, activity: 'walk' }, { km: 5, activity: 'run' }], rules()), 7,
    'an uncounted activity adds nothing to the day')
}

section('Stored rules read back whole, clamped and fail-soft')
{
  eq(parseRules(null), defaultRules(), 'nothing stored is the defaults')
  eq(parseRules('junk'), defaultRules(), 'junk is the defaults')
  const p = parseRules({ pointsPerKm: '2.55', pointsPerRun: -4, minKm: 999, dailyCap: '30', activities: ['walk', 'run', 'skiing'] })
  eq(p.pointsPerKm, 2.6, 'a typed number is read and rounded to one place')
  eq(p.pointsPerRun, 0, 'a negative is clamped to nothing')
  eq(p.minKm, 50, 'an absurd minimum is clamped to the ceiling')
  eq(p.dailyCap, 30, 'a typed cap is read')
  eq(p.activities, ['run', 'walk'], 'activities keep the registry order and drop what is unknown')
  eq(parseRules({ activities: [] }).activities, defaultRules().activities,
    'a challenge that counts nothing is read as the defaults, not believed')
  eq(parseRules({ pointsPerKm: 5000 }).pointsPerKm, MAX_POINTS, 'points top out at the ceiling')
  eq(parseRules({ dailyCap: null }).dailyCap, null, 'a null cap is no limit')
  eq(parseRules({ dailyCap: 'lots' }).dailyCap, null, 'and a junk cap is no limit, not zero')
}

section('Rules that cannot be saved say why')
{
  eq(rulesIssue(rules()), null, 'the defaults are fine')
  ok(rulesIssue(rules({ pointsPerKm: 0, pointsPerRun: 0 }))?.includes('earn something') === true,
    'a run that can earn nothing is refused')
  eq(rulesIssue(rules({ pointsPerKm: 0 })), null, 'points per run alone is a real challenge')
  eq(rulesIssue(rules({ pointsPerRun: 0 })), null, 'and so is points per km alone')
  ok(rulesIssue(rules({ activities: [] })) !== null, 'counting no activity is refused')
}

section('The rules said in words')
{
  eq(describeRules(rules()), [
    '1 point per km.',
    '2 points for every run of 1 km or more.',
    'Counts: Run, Trail run, Treadmill.',
  ], 'the defaults, as three sentences')
  eq(describeRules(rules({ pointsPerRun: 0, dailyCap: 20, activities: ['walk'] })), [
    '1 point per km.',
    "Runs under 1 km don't count.",
    'Up to 20 points a day.',
    'Counts: Walk.',
  ], 'no run points still says the minimum; a cap is named')
  eq(describeRules(rules({ minKm: 0 }))[1], '2 points for every run.', 'no minimum, no "or more"')
  eq(exampleLine(rules()), 'A 5 km run earns 7 points.', 'the worked example')
  eq(exampleLine(rules({ dailyCap: 5 })), 'A 5 km run earns 5 points.', 'held to the cap, as a day would be')
  eq(formatPoints(7), '7', 'whole numbers print bare')
  eq(formatPoints(7.25), '7.3', 'and the rest to one place')
}

// ─── Boards ────────────────────────────────────────────────────

section('Every challenge starts with two boards, and reads them back fail-soft')
{
  eq(defaultBoards(), [
    { id: 'individual', audience: 'individual' },
    { id: 'teams', audience: 'team', teamScore: 'average' },
  ], 'runners and teams, teams on their average')
  eq(defaultBoards('total')[1].teamScore, 'total', 'the team comparison is the creator\'s choice')

  eq(parseRunSetup(null), { rules: defaultRules(), boards: defaultBoards() }, 'nothing stored is the defaults')
  const s = parseRunSetup({
    rules: { pointsPerKm: 3 },
    boards: [
      { id: 'teams', audience: 'team', teamScore: 'total' },
      { id: 'teams', audience: 'individual' },
      { id: 'week2', audience: 'darts' },
      { audience: 'individual' },
    ],
  })
  eq(s.rules.pointsPerKm, 3, 'stored rules come through')
  eq(s.boards, [{ id: 'teams', audience: 'team', teamScore: 'total' }],
    'a repeated id, an unknown audience and a missing id are each dropped')
  eq(parseRunSetup({ boards: [{ id: 't', audience: 'team', teamScore: 'odd' }] }).boards[0].teamScore, 'average',
    'an unknown team comparison reads as average')
  eq(parseRunSetup({ boards: [] }).boards, defaultBoards(), 'no boards at all is the defaults')
  ok(describeTeamScore(undefined).includes('average') && describeTeamScore('total').includes('total'),
    'the comparison said in words, absent reading as average')
}

// ─── Permissions ───────────────────────────────────────────────

section('A run challenge\'s field joins itself by default')
{
  eq(RUN_PERMISSIONS.map(p => p.key), ['join_self', 'create_teams', 'log_runs'], 'three permissions')
  eq(defaultRunPermissions(), { join_self: true, create_teams: false, log_runs: true },
    'joining and logging on, starting a team off')
  ok(RUN_PERMISSIONS.every(p => p.label.startsWith('Participants can') && p.hint.length > 0),
    'said from the field\'s side, each explained')
  eq(parseRunPermissions({ create_teams: true, add_courses: true, log_runs: 'yes' }),
    { join_self: true, create_teams: true, log_runs: true },
    'a run key is honoured; a golf key and a non-boolean are not')
  eq(parseEventPermissions({ join_self: false, create_teams: true }), defaultPermissions(),
    'and golf\'s parser never reads a run key — the two share a column, not a meaning')
  eq(storedRunPermissions(defaultRunPermissions()), null, 'nothing changed writes nothing')
  eq(storedRunPermissions({ ...defaultRunPermissions(), create_teams: true })?.create_teams, true,
    'one change writes the whole map')
  const lib = read('lib/runChallenge.ts')
  ok(lib.includes('RUN_PERMISSIONS.map(p => [p.key, p.dflt])') && lib.includes('for (const p of RUN_PERMISSIONS)'),
    'defaults and parser both walk the registry — a new permission is one line')
}

// ─── Strava, ahead of time ─────────────────────────────────────

section('Strava sport types map through the one activity list')
{
  eq(activityFromStrava('Run'), 'run', 'Run')
  eq(activityFromStrava('TrailRun'), 'trail_run', 'TrailRun')
  eq(activityFromStrava('VirtualRun'), 'treadmill', 'VirtualRun is a treadmill')
  eq(activityFromStrava('Ride'), null, 'a ride is not a run')
}

// ─── Creating one ──────────────────────────────────────────────

section('Creation checks the dates and the teams')
{
  eq(challengeDatesIssue('2026-11-01', '2026-11-30'), null, 'a month is fine')
  eq(challengeDatesIssue('2026-11-01', '2026-11-01'), null, 'a single day is fine')
  ok(challengeDatesIssue('2026-11-30', '2026-11-01')?.includes('before') === true, 'backwards is refused')
  ok(challengeDatesIssue('', '2026-11-01') !== null, 'both dates are required')
  eq(challengeDatesIssue('2026-01-01', '2026-12-31'), null, 'a whole year is fine (2026 has 365 days)')
  ok(challengeDatesIssue('2026-01-01', '2027-01-02') !== null, 'past a year is refused')

  eq(teamNamesIssue(['Sales', 'Ops', '']), null, 'a spare blank row is ignored')
  ok(teamNamesIssue(['', '  ']) !== null, 'at least one team is needed')
  ok(teamNamesIssue(['Sales', ' sales  '])?.includes('two teams called') === true,
    'two teams with one name are refused, case and spacing aside')
  ok(teamNamesIssue(Array.from({ length: MAX_RUN_TEAMS + 1 }, (_, i) => `T${i}`)) !== null,
    'more teams than the ceiling is refused')
}

section('Where the challenge stands')
{
  eq(describeProgress('2026-11-01', '2026-11-30', '2026-10-27'), 'Starts in 5 days', 'before it starts')
  eq(describeProgress('2026-11-01', '2026-11-30', '2026-10-31'), 'Starts tomorrow', 'the day before')
  eq(describeProgress('2026-11-01', '2026-11-30', '2026-11-01'), 'Day 1 of 30', 'the first day')
  eq(describeProgress('2026-11-01', '2026-11-30', '2026-11-30'), 'Day 30 of 30', 'the last day is still on')
  eq(describeProgress('2026-11-01', '2026-11-30', '2026-12-01'), 'Finished', 'and then it is over')
  eq(describeProgress(null, null, '2026-11-01'), '', 'no dates, nothing said')
}

section('A missing migration is told plainly')
{
  ok(migrationMissing({ message: 'new row for relation "trips" violates check constraint "trips_kind_check"' }),
    'the kind check refusing "run" means 052 has not run')
  ok(migrationMissing({ message: "Could not find the 'run_setup' column of 'trips' in the schema cache" }),
    'so does the missing column')
  ok(!migrationMissing({ message: 'duplicate key value' }) && !migrationMissing(null),
    'anything else is not that')
}

// ─── Wiring ────────────────────────────────────────────────────

section('Running is a door beside golf, not a change to it')
{
  const chooser = read('app/create/page.tsx')
  ok(chooser.includes('href="/golf"') && chooser.includes('href="/dashboard/create?type=run"'),
    'the sport chooser offers golf\'s doorway and running\'s door')
  ok(!chooser.includes('supabase') && !chooser.includes('force-dynamic'), 'and is static')
  ok(read('app/Landing.tsx').includes('href="/create"'), 'Create an Event goes to the chooser')

  const flow = read('app/dashboard/create/CreateFlow.tsx')
  ok(flow.includes("if (type === 'run') return <CreateRunForm />"), 'the create route opens the run wizard')
  ok(flow.includes("if (type !== 'tournament') return <CreateTripForm />"),
    'and anything else is still the trip wizard, as ever')
}

section('Creation writes in the platform\'s order, through the shared writers')
{
  const form = stripComments(read('app/dashboard/create/CreateRunForm.tsx'))
  ok(form.includes('kind: RUN_KIND'), 'the trip row is a run challenge')
  ok(form.includes('run_setup: { rules, boards: defaultBoards(teamScore) }'),
    'carrying the rules and the two starting boards')
  ok(form.includes('settings_passcode_hash: passcodeHash'), 'and the organiser PIN, always')
  ok(form.includes('storedRunPermissions(perms)'), 'permissions only when one was changed')
  const iTrip = form.indexOf(".from('trips')")
  const iTeams = form.indexOf(".from('teams')")
  const iPlayers = form.indexOf(".from('players')")
  ok(iTrip > -1 && iTrip < iTeams && iTeams < iPlayers, 'trips, then teams, then players')
  ok(form.includes('setTeam(trip.id, lead.id, MAIN_SET, team.id)'),
    'the organiser joins their team through the one membership writer')
  ok(form.includes('is_lead: true') && form.includes('claimed: true') && form.includes('rememberPlayer(code, lead.id)'),
    'a running organiser is the lead, claimed, and this phone\'s player')
  ok(form.includes('if (organiserRunning && pickedTeam)'), 'and no player row exists when they are not running')
  ok(form.includes('rememberUnlock(code)'), 'the device that set the PIN is not locked out of its own challenge')
  ok(form.includes("fetch('/api/trip-confirmation'"), 'the confirmation email is asked for')
  ok(form.includes('migrationMissing(tripErr)'), 'a missing migration gets its own plain message')
  ok(!/handicap|HandicapField|CourseSelect|from\('(courses|rounds|round_handicaps|itinerary_items)'\)/i.test(form),
    'no golf anywhere in the run wizard — no handicaps, courses, rounds or itinerary')
}

section('Every golf door hands a run challenge to /run/')
{
  const layout = read('app/trip/[tripCode]/layout.tsx')
  ok(layout.includes('if (isRunChallenge(kind)) redirect(`/run/${tripCode}`)'),
    'the trip layout — which every join path reaches — sends it on')
  const hub = read('app/run/[tripCode]/page.tsx')
  ok(hub.includes('if (!isRunChallenge(challenge.kind)) redirect(`/trip/${challenge.code}`)'),
    'and the run hub sends a golf trip back, so either address lands right')
  ok(read('app/run/[tripCode]/organiser/page.tsx').includes('<PasscodeGate'),
    'the organiser area stands behind the same PIN gate as golf\'s')
}

section('The email says challenge, and golf\'s never changes')
{
  const base = {
    tripName: 'Autumn Office Run', dates: '1–30 November', tripCode: 'GX7K2P',
    tripUrl: 'https://greendot.live/run/GX7K2P', adminUrl: 'https://greendot.live/run/GX7K2P/organiser',
  }
  const run = { ...base, sport: 'run' as const }
  const html = confirmationHtml(run)
  const text = confirmationText(run)
  ok(html.includes('Challenge code:') && text.includes('Challenge code: GX7K2P'), 'a challenge code')
  ok(html.includes(run.adminUrl) && text.includes(run.adminUrl), 'the admin link to the run organiser area')
  ok(html.includes('Open the challenge'), 'opening the challenge')
  ok(!/\btrip\b|🏌|golf/i.test(html.replace(/trip-qr/g, '')) && !/\btrip\b|🏌|golf/i.test(text),
    'and no trip, no golf, no golfer in it')
  eq(confirmationSubject('Autumn Office Run', 'run'), 'Autumn Office Run is set up on Green Dot', 'its own subject')

  const golf = confirmationText({ ...base, tripUrl: 'https://greendot.live/trip/GX7K2P', adminUrl: undefined })
  ok(golf.includes("Nice one — that's a serious trip!") && golf.includes('Trip code: GX7K2P') &&
     golf.includes("launch 'em 🏌️"), 'a golf trip\'s message is word for word what it was')
  eq(confirmationSubject('North West 26'), 'North West 26 is booked on Green Dot', 'and keeps its subject')

  const route = read('app/api/trip-confirmation/route.ts')
  ok(route.includes("const tripUrl = `${origin}/${run ? 'run' : 'trip'}/${trip.trip_code}`"),
    'the route links a run challenge to /run/')
  ok(route.includes('const event = isEvent(kindResult.data?.kind) || run'),
    'and gives it the organiser block, like any organiser-run event')
}

section('Migration 052 is the two changes the model promised')
{
  const sql = read('supabase/migrations/20260101000052_run_challenges.sql')
  ok(sql.includes("CHECK (kind IN ('trip', 'tournament', 'run'))"), 'the kind check allows run')
  ok(sql.includes('ADD COLUMN IF NOT EXISTS run_setup jsonb'), 'run_setup is one nullable jsonb column')
  ok(sql.includes('BEGIN;') && sql.includes('COMMIT;'), 'in one transaction')
  ok(!/DROP TABLE|DELETE FROM|UPDATE trips/i.test(sql), 'touching no existing row')
}

// ─── Done ──────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
