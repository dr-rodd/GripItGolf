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
 *
 * Stage 2 adds joining: the name and team rules, what the join screen may
 * offer (drawn, not just asserted), the order a join writes in, and the
 * organiser's team editor — every write scoped to its challenge, and no
 * team removable while somebody still runs for it.
 *
 * Stage 3 adds runs and the leaderboard: what a typed-in run must be, how
 * runs become totals and places (lib/runBoards.ts), the five-tab bar, the
 * rules editor shared by setup and the organiser, and the Strava-shaped
 * rule that only totals about other people ever leave the server.
 */

import fs from 'fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import RunJoinClient from '../app/run/[tripCode]/join/RunJoinClient'
import RunTeamsEditor from '../app/run/[tripCode]/organiser/RunTeamsEditor'
import RunBoardClient from '../app/run/[tripCode]/leaderboard/RunBoardClient'
import RunAddClient from '../app/run/[tripCode]/add/RunAddClient'
import { RUN_TABS, runActiveKey } from '../app/components/runTabs'
import {
  runnerTotals, placesFor, individualBoard, teamBoard, ordinal, inWindow, type BoardRun,
} from '../lib/runBoards'
import { PRESET_COLORS } from '../lib/teamColors'
import {
  RUN_KIND, isRunChallenge, RUN_ACTIVITIES, activityFromStrava,
  defaultRules, parseRules, rulesIssue, runPoints, dayPoints,
  describeRules, exampleLine, formatPoints,
  defaultBoards, parseRunSetup, describeTeamScore,
  RUN_PERMISSIONS, defaultRunPermissions, parseRunPermissions, storedRunPermissions,
  challengeDatesIssue, teamNamesIssue, describeProgress,
  migrationMissing, MAX_POINTS, MAX_RUN_TEAMS,
  runnerNameIssue, teamNameIssue, nextTeamColor, canRemoveTeam,
  challengeFinished, joinChoices, MAX_RUNNER_NAME, MAX_TEAM_NAME,
  parseRunEntry, runEntryIssue, addDays, describePace, describeDuration, roundKm, MAX_RUN_KM,
  draftFromSetup, rulesFromDraft, draftIssue, setupWithDraft,
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
  eq(parseRunPermissions({ add_players: true, edit_scores: true, assign_tag: true }), defaultRunPermissions(),
    'golf keys switched on leave every run permission at its default')
  eq(parseRunPermissions({ create_teams: 'yes', join_self: false }).create_teams, false,
    'a non-boolean never switches a run permission on')
  eq(parseRunPermissions({ join_self: false }).join_self, false, 'and a real false switches one off')
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
  ok(form.includes('run_setup: { rules, boards: defaultBoards(draft.teamScore) }'),
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

// ─── Stage 2: joining and teams ────────────────────────────────

/** A client screen that asks for the router, drawn on the server. */
const stubRouter = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
const draw = (el: React.ReactElement) =>
  renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: stubRouter as never }, el))

section('A runner\'s name is checked the way the database checks it')
{
  const roster = [{ id: 'a', name: 'Ross O\'Grady' }, { id: 'b', name: 'Dave' }]
  eq(runnerNameIssue('Aoife', roster), null, 'a new name is fine')
  ok(runnerNameIssue('  dave ', roster)?.includes('already in this challenge') === true,
    'a taken name is refused, case and outer spaces aside')
  eq(runnerNameIssue('Dave', roster, 'b'), null, 'keeping your own name is not a clash')
  ok(runnerNameIssue('   ', roster) !== null, 'a blank name is refused')
  ok(runnerNameIssue('x'.repeat(MAX_RUNNER_NAME + 1), roster) !== null, 'and an over-long one')
}

section('A team name is checked on its own, for adding or renaming')
{
  const teams = [{ id: 't1', name: 'Sales' }, { id: 't2', name: 'Ops' }]
  eq(teamNameIssue('Engineering', teams), null, 'a new team is fine')
  ok(teamNameIssue(' sales ', teams)?.includes('already a team') === true, 'a taken name is refused')
  eq(teamNameIssue('Sales', teams, 't1'), null, 'renaming a team to its own name is fine')
  ok(teamNameIssue('Ops', teams, 't1') !== null, 'renaming onto another team\'s name is not')
  ok(teamNameIssue('', teams) !== null, 'a blank name is refused')
  ok(teamNameIssue('x'.repeat(MAX_TEAM_NAME + 1), teams) !== null, 'an over-long one too')
  const full = Array.from({ length: MAX_RUN_TEAMS }, (_, i) => ({ id: `t${i}`, name: `T${i}` }))
  ok(teamNameIssue('One more', full) !== null, 'adding past the ceiling is refused')
  eq(teamNameIssue('T0 renamed', full, 't0'), null, 'but renaming at the ceiling is fine')
}

section('New teams take the next colour, and only empty teams can go')
{
  eq(nextTeamColor(0), PRESET_COLORS[0], 'the first team takes the first colour')
  eq(nextTeamColor(2), PRESET_COLORS[2], 'the third the third')
  eq(nextTeamColor(PRESET_COLORS.length), PRESET_COLORS[0], 'and the palette wraps round')
  ok(canRemoveTeam(0), 'an empty team can be removed')
  ok(!canRemoveTeam(1), 'a team with a runner cannot — everyone runs for a team')
}

section('Joining closes when the challenge finishes, and only then')
{
  ok(!challengeFinished('2026-11-30', '2026-11-30'), 'the finish day itself is still open')
  ok(challengeFinished('2026-11-30', '2026-12-01'), 'the day after, it is finished')
  ok(!challengeFinished(null, '2026-12-01'), 'no finish date is never finished')
}

section('What the join screen may offer')
{
  const perms = defaultRunPermissions()
  const someone = [{ claimed: false }]
  eq(joinChoices(perms, someone, false),
    { closed: false, claim: true, addSelf: true, startTeam: false, nothing: false },
    'by default: claim a name or add your own; starting a team is off')
  eq(joinChoices({ ...perms, create_teams: true }, someone, false).startTeam, true,
    'starting a team only when the organiser allows it')
  eq(joinChoices({ ...perms, join_self: false }, someone, false).addSelf, false,
    'join_self off: no adding yourself')
  eq(joinChoices({ ...perms, join_self: false }, [], false).nothing, true,
    'join_self off and nobody added: there is no way in, and the screen says who to ask')
  eq(joinChoices(perms, someone, true),
    { closed: true, claim: false, addSelf: false, startTeam: false, nothing: false },
    'a finished challenge offers nothing at all')
}

section('The join screen draws exactly what it was offered')
{
  const teams = [{ id: 't1', name: 'Sales', color: '#DC2626', count: 1 }]
  const roster = [
    { id: 'p1', name: 'Ross', claimed: true, isLead: true, teamId: 't1' },
    { id: 'p2', name: 'Aoife', claimed: false, isLead: false, teamId: null },
  ]
  const props = { tripId: 'trip', code: 'GX7K2P', name: 'Autumn Run', roster, teams, viewerId: null }
  const open = draw(<RunJoinClient {...props} choices={joinChoices(defaultRunPermissions(), roster, false)} />)
  ok(open.includes('Find your name') && open.includes('Aoife') && open.includes('Ross'),
    'the roster is listed to claim')
  ok(open.includes('Joined') && open.includes('No team yet'), 'with who has joined and who has no team')
  ok(open.includes('New here?') && open.includes('placeholder="Your name"'), 'and the add-yourself form')

  const shut = draw(<RunJoinClient {...props}
    choices={joinChoices({ ...defaultRunPermissions(), join_self: false }, roster, false)} />)
  ok(!shut.includes('placeholder="Your name"'), 'join_self off: no add-yourself form at all')
  ok(shut.includes('Ask the organiser to add it'), 'and it says who to ask')

  const none = draw(<RunJoinClient {...props} roster={[]}
    choices={joinChoices({ ...defaultRunPermissions(), join_self: false }, [], false)} />)
  ok(none.includes('Joining by yourself is switched off'), 'no way in is said, not left blank')

  const done = draw(<RunJoinClient {...props} choices={joinChoices(defaultRunPermissions(), roster, true)} />)
  ok(done.includes('joining is closed') && !done.includes('Find your name'), 'a finished challenge is closed')

  const me = draw(<RunJoinClient {...props} viewerId="p1"
    choices={joinChoices(defaultRunPermissions(), roster, false)} />)
  ok(me.includes('This phone is Ross') && me.includes('Ross (this phone)'),
    'a phone already joined is told so, and can switch')
}

section('A join writes in order, and never finishes without a team')
{
  const src = stripComments(read('app/run/[tripCode]/join/RunJoinClient.tsx'))
  const join = src.slice(src.indexOf('async function join()'), src.indexOf('// ── Render ──'))
  const iTeam = join.indexOf(".from('teams')")
  const iPlayer = join.indexOf(".from('players')")
  const iMember = join.indexOf('setTeam(tripId, playerId, MAIN_SET, teamId)')
  ok(iTeam > -1 && iTeam < iPlayer && iPlayer < iMember, 'a new team, then the runner, then the membership')
  ok(join.includes('finish(playerId)') && join.indexOf('finish(playerId)') > iMember,
    'the phone is linked only after the team is set')
  ok(join.includes("from('teams').delete().eq('id', createdTeam).eq('trip_id', tripId)"),
    'a team started for a join that failed is taken away again')
  ok(join.includes("setWho({ kind: 'claim'"),
    'a membership that failed keeps the runner and retries the team only — nobody is created twice')

  const finish = src.slice(src.indexOf('function finish('), src.indexOf('// ── Step 1 · who ──'))
  const iRemember = finish.indexOf('rememberPlayer(code, playerId)')
  const iRefresh = finish.indexOf('router.refresh()')
  const iPush = finish.indexOf('router.push(`/run/${code}`)')
  ok(iRemember > -1 && iRemember < iRefresh && iRefresh < iPush,
    'linking the phone refreshes before it navigates, so the home page is not stale')

  const tap = src.slice(src.indexOf('async function tapName('), src.indexOf('const newNameIssue'))
  ok(tap.includes('if (!entry.teamId)') && tap.includes("setStep('team')"),
    'claiming a name with no team goes to the team step first')

  const page = read('app/run/[tripCode]/join/page.tsx')
  ok(page.includes('joinChoices(') && page.includes('challengeFinished('),
    'the page decides what is offered through the one rule')
}

section('The organiser\'s team editor')
{
  const team = (id: string, name: string, members: { id: string; name: string; claimed: boolean }[]) =>
    ({ id, name, color: '#2563EB', members: members.map(m => ({ ...m, isLead: false })) })
  const html = draw(<RunTeamsEditor tripId="trip" unassigned={[]} teams={[
    team('t1', 'Sales', [{ id: 'p1', name: 'Ross', claimed: true }, { id: 'p2', name: 'Aoife', claimed: false }]),
    team('t2', 'Ops', []),
  ]} />)
  ok(html.includes('Joined') && html.includes('Not joined yet'), 'it shows who has joined and who has not')
  ok(html.includes('+ Add a runner') && html.includes('+ Add a team'), 'runners and teams can be added')

  const orphan = draw(<RunTeamsEditor tripId="trip" teams={[team('t1', 'Sales', [])]}
    unassigned={[{ id: 'p9', name: 'Lost', claimed: true, isLead: false }]} />)
  ok(orphan.includes('No team yet') && orphan.includes('Lost'), 'a runner on no team is shown, not lost')

  const src = stripComments(read('app/run/[tripCode]/organiser/RunTeamsEditor.tsx'))
  const writes = src.split('await supabase').slice(1).map(w => w.slice(0, 260))
  const scopedWrites = writes.filter(w => /\.(update|delete)\(/.test(w))
  ok(scopedWrites.length >= 4 && scopedWrites.every(w => w.includes(".eq('trip_id', tripId)")),
    `every update and delete is filtered on the challenge as well as the row (${scopedWrites.length})`)
  ok(writes.filter(w => w.includes('.insert(')).every(w => w.includes('trip_id: tripId')),
    'and every insert carries it')
  ok(src.includes('if (!canRemoveTeam(team.members.length))'), 'a team with runners is refused removal')
  ok((src.match(/setTeam\(tripId, /g) ?? []).length === 2,
    'moving and adding runners both go through the one membership writer')
  ok(src.includes('startTransition(() => router.refresh())'), 'and the screen re-reads what was saved')
  const body = src.slice(src.indexOf('export default function RunTeamsEditor(') + 40)
  ok(!/function [A-Z]\w*\(\{/.test(body),
    'no component is declared inside the editor (a rename box would lose focus every keystroke)')
}

section('The home page offers the way in, then says where you stand')
{
  const hub = read('app/run/[tripCode]/page.tsx')
  ok(hub.includes('currentPlayer(challenge.code, roster)'), 'it reads who this phone is from the roster')
  ok(hub.includes('Join the challenge') && hub.includes('!finished ?'), 'a stranger is offered Join, until it finishes')
  ok(hub.includes('Running for {viewerTeam.name}') && hub.includes('Not you?'),
    'a runner sees their team, with a way to switch')
}

// ─── Stage 3: runs and the leaderboard ─────────────────────────

section('A typed-in run is read for its shape, then checked against the challenge')
{
  eq(parseRunEntry({ activity: 'run', date: '2026-11-03', km: '5.257', minutes: '' }),
    { activity: 'run', date: '2026-11-03', km: 5.26, minutes: null },
    'strings are read, the distance kept to 10 metres, a blank time is no time')
  eq(parseRunEntry({ activity: 'swim', date: '2026-11-03', km: 5 }), null, 'an unknown activity is no run')
  eq(parseRunEntry({ activity: 'run', date: '3/11/2026', km: 5 }), null, 'a date not as YYYY-MM-DD is no run')
  eq(parseRunEntry({ activity: 'run', date: '2026-11-03', km: 'far' }), null, 'nor is a distance that is not a number')
  eq(parseRunEntry('junk'), null, 'nor junk')
  eq(roundKm(5.005), 5.01, 'distances round to two places')

  const ctx = { start: '2026-11-01', end: '2026-11-30', latest: '2026-11-10', activities: defaultRules().activities }
  const run = { activity: 'run' as const, date: '2026-11-05', km: 5, minutes: 30 }
  eq(runEntryIssue(run, ctx), null, 'a 5 km run inside the challenge is fine')
  ok(runEntryIssue({ ...run, activity: 'walk' }, ctx)?.includes('does not count') === true, 'an uncounted activity is refused')
  ok(runEntryIssue({ ...run, date: '2026-10-31' }, ctx)?.includes('before') === true, 'the day before the start is refused')
  ok(runEntryIssue({ ...run, date: '2026-12-01' }, { ...ctx, latest: '2026-12-05' })?.includes('after') === true,
    'the day after the finish is refused')
  ok(runEntryIssue({ ...run, date: '2026-11-11' }, ctx)?.includes('not happened') === true, 'a day after today is refused')
  eq(runEntryIssue({ ...run, date: '2026-11-10' }, ctx), null, 'today itself is fine')
  ok(runEntryIssue({ ...run, km: 0 }, ctx) !== null, 'no distance is refused')
  eq(runEntryIssue({ ...run, km: MAX_RUN_KM }, ctx), null, `${MAX_RUN_KM} km is the most, and allowed`)
  ok(runEntryIssue({ ...run, km: MAX_RUN_KM + 0.01 }, ctx) !== null, 'a step past it is refused')
  ok(runEntryIssue({ ...run, minutes: 0 }, ctx) !== null, 'a time of nothing is refused')
  eq(runEntryIssue({ ...run, minutes: null }, ctx), null, 'no time at all is fine — it is optional')
  eq(addDays('2026-12-31', 1), '2027-01-01', 'the server\'s day of grace crosses a year cleanly')
  eq(describePace(5, 27.5 as unknown as number), '5:30 /km', 'pace from distance and time')
  eq(describePace(5, null), null, 'and none without a time')
  eq(describeDuration(65), '1h 05m', 'an hour and five minutes')
  eq(describeDuration(42), '42m', 'forty-two minutes')
}

section('Runs become totals: the challenge\'s days only, the limit on the day')
{
  const rules = defaultRules()   // 1/km, 2/run, 1 km to count
  const run = (playerId: string, date: string, km: number, activity: BoardRun['activity'] = 'run'): BoardRun =>
    ({ playerId, date, distanceM: Math.round(km * 1000), activity })
  const window = { start: '2026-11-01', end: '2026-11-30' }
  const t = runnerTotals([
    run('a', '2026-11-02', 5),            // 7
    run('a', '2026-11-02', 10),           // 12 — same day
    run('a', '2026-10-31', 20),           // before the start: out
    run('a', '2026-11-03', 0.5),          // under the minimum: 0, not counted
    run('a', '2026-11-04', 3, 'walk'),    // walks do not count by default
    run('b', '2026-11-30', 4),            // the last day counts: 6
  ], rules, window)
  eq(t.get('a'), { points: 19, km: 15, runs: 2 },
    'a: two counting runs, the out-of-window, too-short and uncounted ones left out')
  eq(t.get('b'), { points: 6, km: 4, runs: 1 }, 'b: the finish day still counts')
  eq(t.has('c'), false, 'nobody without runs has a total — the boards put them at 0')

  const capped = runnerTotals([run('a', '2026-11-02', 5), run('a', '2026-11-02', 10), run('a', '2026-11-03', 5)],
    { ...rules, dailyCap: 15 }, window)
  eq(capped.get('a')?.points, 22, 'a 15-point limit holds the first day to 15 and leaves the second day\'s 7')
  eq(capped.get('a')?.km, 20, 'the limit is on points; the distance still counts in full')
  ok(inWindow('2026-11-01', '2026-11-01', null) && !inWindow('2026-10-31', '2026-11-01', null),
    'the start day is in, the day before is out')
}

section('Places are golf\'s, and the boards rank everybody')
{
  eq(placesFor([10, 10, 8, 8, 5]), [1, 1, 3, 3, 5], 'two level share a place, and the next takes its position')
  eq(placesFor([]), [], 'an empty board has no places')

  const totals = new Map([
    ['a', { points: 20, km: 15, runs: 2 }],
    ['b', { points: 20, km: 12, runs: 3 }],
    ['c', { points: 6, km: 4, runs: 1 }],
  ])
  const roster = [
    { id: 'c', name: 'Cara', teamId: 't2' },
    { id: 'b', name: 'Brian', teamId: 't1' },
    { id: 'a', name: 'Aoife', teamId: 't1' },
    { id: 'd', name: 'Dan', teamId: 't2' },
  ]
  const board = individualBoard(roster, totals)
  eq(board.map(l => [l.name, l.place, l.points]), [
    ['Aoife', 1, 20], ['Brian', 1, 20], ['Cara', 3, 6], ['Dan', 4, 0],
  ], 'level on points share 1st, ordered by name; a runner with no runs is on the board at 0')

  const teams = [
    { id: 't1', name: 'Sales', color: '#f00', memberIds: ['a', 'b'] },          // 40, avg 20
    { id: 't2', name: 'Ops', color: '#00f', memberIds: ['c', 'd'] },            // 6, avg 3
    { id: 't3', name: 'Legal', color: '#0f0', memberIds: [] },                  // nobody
  ]
  const byAvg = teamBoard(teams, totals, 'average')
  eq(byAvg.map(l => [l.name, l.place, l.score]), [['Sales', 1, 20], ['Ops', 2, 3], ['Legal', 3, 0]],
    'on average: Dan\'s empty week pulls Ops to 3 per runner; a team of nobody scores 0, not nothing')
  eq(byAvg.find(l => l.name === 'Legal')?.average, 0, 'and never divides by zero')
  const big = teamBoard([
    { id: 'x', name: 'Big', color: '#000', memberIds: ['a', 'b', 'c', 'd'] },   // 46 total, 11.5 avg
    { id: 'y', name: 'Small', color: '#000', memberIds: ['a'] },                // 20 total, 20 avg
  ], totals, 'total')
  eq(big.map(l => l.name), ['Big', 'Small'], 'on total, the bigger team\'s 46 beats 20')
  eq(teamBoard([
    { id: 'x', name: 'Big', color: '#000', memberIds: ['a', 'b', 'c', 'd'] },
    { id: 'y', name: 'Small', color: '#000', memberIds: ['a'] },
  ], totals, 'average').map(l => l.name), ['Small', 'Big'], 'on average, the small team\'s 20 a head wins')
  eq([1, 2, 3, 4, 11, 12, 13, 21, 22, 111].map(ordinal),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '111th'], 'ordinals')
}

section('The rules editor reads back what it was given, and keeps every board')
{
  const setup = parseRunSetup({
    rules: { pointsPerKm: 1.5, pointsPerRun: 0, minKm: 2, dailyCap: 30, activities: ['run', 'walk'] },
    boards: [
      { id: 'individual', audience: 'individual' },
      { id: 'teams', audience: 'team', teamScore: 'total' },
      { id: 'week2', audience: 'individual' },
    ],
  })
  const draft = draftFromSetup(setup)
  eq(rulesFromDraft(draft), setup.rules, 'a draft of the stored rules says exactly the stored rules')
  eq(draft.teamScore, 'total', 'and carries the team comparison')
  eq(setupWithDraft(setup, draft), setup, 'saving it unchanged changes nothing')
  const edited = setupWithDraft(setup, { ...draft, perKm: '2', teamScore: 'average' })
  eq(edited.boards.map(b => b.id), ['individual', 'teams', 'week2'], 'every board survives a rules edit')
  eq(edited.boards[1].teamScore, 'average', 'only team boards take the comparison')
  eq(edited.rules.pointsPerKm, 2, 'and the new rule is the one saved')
  ok(draftIssue({ ...draft, capOn: true, cap: '' }) !== null, 'a limit switched on with no number is refused')
  ok(draftIssue({ ...draft, perKm: '0', perRun: '0' }) !== null, 'and a run worth nothing')
  const create = stripComments(read('app/dashboard/create/CreateRunForm.tsx'))
  const organiser = stripComments(read('app/run/[tripCode]/organiser/RunRulesEditor.tsx'))
  ok(create.includes('<RunRulesFields') && organiser.includes('<RunRulesFields'),
    'setup and the organiser area render the one rules form')
  ok(organiser.includes('.update({ run_setup: setupWithDraft(setup, draft) })') && organiser.includes(".eq('id', tripId)"),
    'the organiser saves the whole setup through setupWithDraft, on this challenge')
  ok(!create.includes('function NumberRow'), 'and setup no longer carries its own copy')
}

section('Runs live on the server: closed table, one writer, totals out')
{
  const sql = read('supabase/migrations/20260101000053_runs.sql')
  ok(sql.includes('ALTER TABLE runs ENABLE ROW LEVEL SECURITY'), 'migration 053 switches RLS on')
  ok(!/CREATE POLICY/i.test(sql), 'with no policy at all — the browser can neither read nor write')
  ok(sql.includes('REFERENCES trips(id)   ON DELETE CASCADE') && sql.includes('REFERENCES players(id) ON DELETE CASCADE'),
    'a deleted challenge or runner takes their runs with them')
  ok(sql.includes('UNIQUE (trip_id, strava_activity_id)'), 'and a Strava run is stored once per challenge')
  ok(!/\bpoints\b\s+(integer|numeric|smallint)/i.test(sql), 'points are never a column')

  // Every reader and writer of the runs table runs on the server.
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : [])
  const touching = [...walk('app'), ...walk('lib')].filter(f => read(f).includes(".from('runs')"))
  eq(touching.sort(), ['app/api/run/runs/route.ts', 'app/run/[tripCode]/runs.ts'],
    'only the runs route and the server reader touch the table')
  ok(touching.every(f => !read(f).trimStart().startsWith("'use client'")), 'neither runs in the browser')
  ok(read('app/run/[tripCode]/runs.ts').includes('createAdminClient()'), 'the reader is on the service role')

  const route = stripComments(read('app/api/run/runs/route.ts'))
  ok(route.includes('if (!perms.log_runs)'), 'the route refuses typed runs when the organiser switched them off')
  ok(route.includes('playerCookieName(trip.trip_code)') && route.includes(".eq('trip_id', trip.id)"),
    'a run belongs to the runner this phone joined as, on this challenge\'s roster')
  ok(route.includes('runEntryIssue(entry,') && route.includes('latest: addDays(todayString(new Date()), 1)'),
    'and passes the same check as the form, with a day\'s grace for timezones ahead')
  const del = route.slice(route.indexOf('export async function DELETE'))
  ok(del.includes(".eq('trip_id', trip.id)") && del.includes(".eq('player_id', playerId)") && del.includes(".eq('source', 'manual')"),
    'a runner deletes only their own typed-in runs, in this challenge')

  // What reaches a phone about other people is totals.
  const board = read('app/run/[tripCode]/leaderboard/RunBoardClient.tsx')
  ok(!/distanceM|run_date|\.date\b/.test(stripComments(board)), 'the leaderboard component is handed no runs')
  ok(read('app/run/[tripCode]/add/page.tsx').includes('read.runs.filter(r => r.playerId === viewer.id)'),
    'the Add tab sends a runner their own runs and nobody else\'s')
}

section('The five tabs, golf\'s bar with running\'s destinations')
{
  eq(RUN_TABS.map(t => t.label), ['Home', 'Add', 'Leaderboard', 'Stats', 'Settings'],
    'Home, Add, Leaderboard, Stats, Settings — the leaderboard in the centre')
  eq(runActiveKey('/run/GX7K2P', 'GX7K2P'), 'home', 'home only on the hub itself')
  eq(runActiveKey('/run/GX7K2P/add', 'GX7K2P'), 'add', 'add')
  eq(runActiveKey('/run/GX7K2P/organiser', 'GX7K2P'), 'settings', 'the organiser area lights Settings, its door')
  eq(runActiveKey('/run/GX7K2P/join', 'GX7K2P'), null, 'joining lights nothing rather than something wrong')
  const bar = read('app/components/TabBar.tsx')
  ok(bar.includes("sport === 'run' ? RUN_TABS") && bar.includes('runActiveKey(pathname, tripCode)'),
    'the one tab bar draws them — one look, two sports')
  ok(read('app/run/[tripCode]/layout.tsx').includes('<TabBar tripCode={tripCode} sport="run" />'),
    'drawn once by the run layout, never by a page')
  const pages = ['page.tsx', 'add/page.tsx', 'leaderboard/page.tsx', 'stats/page.tsx', 'settings/page.tsx',
    'join/page.tsx', 'organiser/RunOrganiserClient.tsx']
  for (const p of pages) {
    const src = read(`app/run/[tripCode]/${p}`)
    ok(src.includes('has-tabbar') && !src.includes('<TabBar'), `${p} leaves room for the bar and draws none`)
  }
}

section('The boards draw what they were handed')
{
  const html = draw(<RunBoardClient anyRuns={true} boards={[
    { id: 'individual', kind: 'individual', title: 'Runners', rule: '1 point per km.', rows: [
      { id: 'a', place: 1, name: 'Aoife', color: '#f00', points: 20, km: 15, runs: 2, isViewer: false },
      { id: 'b', place: 1, name: 'Brian', color: '#f00', points: 20, km: 12, runs: 3, isViewer: true },
      { id: 'd', place: 3, name: 'Dan', color: null, points: 0, km: 0, runs: 0, isViewer: false },
    ] },
    { id: 'teams', kind: 'team', title: 'Teams', rule: 'Teams are ranked on their average per member.', byAverage: true,
      rows: [] },
  ]} />)
  ok(html.includes('Runners') && html.includes('Teams'), 'a tab per board')
  ok(html.includes('Brian (you)'), 'the runner holding the phone is marked')
  ok(html.includes('15 km · 2 runs') && html.includes('No runs yet'), 'totals beneath each name, or no runs yet')
  ok((html.match(/>1</g) ?? []).length >= 2 && html.includes('>3<'), 'two share 1st and the next is 3rd')

  const add = draw(<RunAddClient code="GX7K2P" rules={defaultRules()} start="2026-11-01" end="2026-11-30"
    logRuns={false} myRuns={[
      { id: 'r1', date: '2026-11-02', activity: 'run', km: 5, minutes: 30, source: 'manual', points: 7 },
      { id: 'r2', date: '2026-11-03', activity: 'run', km: 8, minutes: null, source: 'strava', points: 10 },
    ]} />)
  ok(add.includes('typing them in is switched off') && !add.includes('Save run'),
    'log_runs off: no form, and it says why')
  ok(add.includes('5 km run') && add.includes('· Strava'), 'the runner\'s own runs are listed, Strava ones marked')
  ok((add.match(/aria-label="Delete/g) ?? []).length === 1, 'only a typed-in run can be deleted from here')
  ok(add.includes('Connect Strava'), 'Strava has its place on the Add tab, ahead of time')
}

// ─── Done ──────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
