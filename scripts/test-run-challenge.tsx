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
 *
 * Stage 4 adds Strava: every decision in lib/strava.ts (the signed state,
 * which activities become runs, what a sync adds and removes, what a webhook
 * event asks), and the rules around the network half — tokens closed to
 * the browser, consent before connecting, a refused refresh never deleting
 * anyone, and only two doors to forgetting an athlete.
 *
 * Then Strava's API Policy, built in: a challenge's shape in time (live,
 * closing, final) and what a final one keeps (team standings, frozen); the
 * seven-day copy and the dead-connection clean-up; every closed door; the
 * consent saying all §2.1 asks; View on Strava and the Garmin credit; the
 * runner deleting everything themselves; the organiser extending; and the
 * privacy notice and terms saying what the policy requires.
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
import StravaCard from '../app/run/[tripCode]/StravaCard'
import HelpAndPrivacy from '../app/run/[tripCode]/settings/HelpAndPrivacy'
import RunDatesEditor from '../app/run/[tripCode]/organiser/RunDatesEditor'
import PrivacyPage from '../app/privacy/page'
import TermsPage from '../app/terms/page'
import LegalLinks from '../app/components/LegalLinks'
import PoweredByStrava from '../app/components/PoweredByStrava'
import { SITE } from '../config/site'
import { activityUrl, STRAVA_APPS_URL } from '../lib/stravaLinks'
import {
  stravaConfig, scopeGranted, authorizeUrl, signState, verifyState, runFromActivity,
  planSync, webhookAction, tokenNeedsRefresh, afterEpoch, outcomeMessage, isGarmin,
  cacheCutoff, deadCutoff, STRAVA_CACHE_DAYS, DEAD_CONNECTION_DAYS, disconnectedMessage,
} from '../lib/strava'
import {
  runnerTotals, placesFor, individualBoard, teamBoard, ordinal, inWindow, type BoardRun,
  freezeResults, parseFinalResults,
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
  FINAL_GRACE_DAYS, closesOn, challengePhase, dueForFinal, describeDay,
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
  eq(touching.sort(), ['app/api/run/finalise.ts', 'app/api/run/runs/route.ts', 'app/run/[tripCode]/runs.ts', 'lib/stravaApi.ts'],
    'only the runs route, the server reader, the Strava sync and the challenge close touch the table')
  ok(touching.every(f => !read(f).trimStart().startsWith("'use client'")), 'neither runs in the browser')
  ok(read('app/run/[tripCode]/runs.ts').includes('createAdminClient()'), 'the reader is on the service role')

  const route = stripComments(read('app/api/run/runs/route.ts'))
  ok(route.includes('if (!perms.log_runs)'), 'the route refuses typed runs when the organiser switched them off')
  const runner = stripComments(read('app/api/run/runner.ts'))
  ok(route.includes('cookieRunner(admin, loaded.trip)') && runner.includes('playerCookieName(trip.trip_code)') &&
     runner.includes(".eq('id', playerId).eq('trip_id', tripId)"),
    'a run belongs to the runner this phone joined as, on this challenge\'s roster (the shared runner.ts)')
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
  ok(read('app/run/[tripCode]/add/page.tsx').includes('<StravaCard'), 'Strava has its card on the Add tab')
}

// ─── Stage 4: Strava ───────────────────────────────────────────

section('Strava is set up by three keys, and asks only for shared activities')
{
  const cfg = stravaConfig({ STRAVA_CLIENT_ID: ' 12345 ', STRAVA_CLIENT_SECRET: 'sek', STRAVA_VERIFY_TOKEN: 'phrase' })
  eq(cfg, { clientId: '12345', clientSecret: 'sek', verifyToken: 'phrase' }, 'the three keys, trimmed')
  eq(stravaConfig({ STRAVA_CLIENT_ID: '1', STRAVA_CLIENT_SECRET: 'x' }), null, 'any one missing is no Strava at all')
  ok(scopeGranted('read,activity:read'), 'activities shared: granted')
  ok(scopeGranted('read,activity:read_all'), 'all activities also covers it')
  ok(!scopeGranted('read') && !scopeGranted(null), 'the activities box unticked: not granted')
  const url = new URL(authorizeUrl(cfg!, 'https://greendot.live/api/run/strava/callback', 'st'))
  eq(url.origin + url.pathname, 'https://www.strava.com/oauth/authorize', 'Strava\'s own authorise page')
  eq(url.searchParams.get('scope'), 'activity:read', 'asking for activities the runner shares — never "Only you" ones')
  eq(url.searchParams.get('redirect_uri'), 'https://greendot.live/api/run/strava/callback', 'back to our callback')
  eq([url.searchParams.get('client_id'), url.searchParams.get('response_type'), url.searchParams.get('state')],
    ['12345', 'code', 'st'], 'with our client, a code, and the state')
}

section('The state carries challenge and runner through Strava, untampered')
{
  const secret = 'client-secret'
  const now = 1_800_000_000_000
  const st = signState({ tripCode: 'GX7K2P', playerId: 'p-1', expires: now + 60_000 }, secret)
  eq(verifyState(st, secret, now), { tripCode: 'GX7K2P', playerId: 'p-1', expires: now + 60_000 }, 'ours, in time: read back')
  eq(verifyState(st, 'other-secret', now), null, 'signed with another secret: refused')
  eq(verifyState(st, secret, now + 120_000), null, 'expired: refused')
  const [body, sig] = st.split('.')
  const forged = Buffer.from(JSON.stringify({ t: 'GX7K2P', p: 'someone-else', e: now + 60_000 })).toString('base64url')
  eq(verifyState(`${forged}.${sig}`, secret, now), null, 'a body swapped for another runner: refused')
  eq(verifyState(`${body}.${sig.slice(0, -2)}xx`, secret, now), null, 'an altered signature: refused')
  eq(verifyState('junk', secret, now), null, 'junk: refused')
  eq(verifyState(null, secret, now), null, 'nothing: refused')
}

section('Strava activities become runs — the ones we keep, as we keep them')
{
  const base = { id: 9001, sport_type: 'Run', start_date_local: '2026-11-03T07:15:00Z', distance: 5012.4, moving_time: 1601 }
  eq(runFromActivity(base), {
    strava_activity_id: 9001, activity: 'run', run_date: '2026-11-03', distance_m: 5012, moving_s: 1601, device_name: null,
  }, 'a run: its local day, metres, seconds')
  eq(runFromActivity({ ...base, sport_type: 'VirtualRun' })?.activity, 'treadmill', 'a virtual run is a treadmill run')
  eq(runFromActivity({ ...base, sport_type: 'Walk' })?.activity, 'walk', 'walks are kept — the boards decide if they count')
  eq(runFromActivity({ ...base, sport_type: 'Ride' }), null, 'a ride is not kept')
  eq(runFromActivity({ ...base, sport_type: undefined, type: 'TrailRun' })?.activity, 'trail_run', 'the older type field is read when the newer is missing')
  eq(runFromActivity({ ...base, distance: 0 }), null, 'no distance, no run')
  eq(runFromActivity({ ...base, start_date_local: 'soon' }), null, 'no date, no run')
  eq(runFromActivity({ ...base, moving_time: 0 })?.moving_s, null, 'no time is no time, not zero')
  eq(runFromActivity({ ...base, device_name: ' Garmin Forerunner 265 ' })?.device_name, 'Garmin Forerunner 265', 'the device, trimmed')
  eq(runFromActivity({ ...base, external_id: 'garmin_ping_123.fit' })?.device_name, 'Garmin', 'a Garmin upload is known by its file')
  ok(isGarmin('Garmin Forerunner 265') && !isGarmin('Apple Watch') && !isGarmin(null), 'Garmin credit only for Garmin')
  eq(afterEpoch('2026-11-01'), Date.UTC(2026, 9, 31) / 1000, 'asking Strava from the day before the start, for timezones ahead')
}

section('A sync writes what is in the challenge and removes what Strava no longer has')
{
  const window = { start: '2026-11-01', end: '2026-11-30' }
  const act = (id: number, date: string, sport = 'Run') =>
    ({ id, sport_type: sport, start_date_local: `${date}T08:00:00Z`, distance: 5000, moving_time: 1500 })
  const plan = planSync(
    [act(1, '2026-11-02'), act(2, '2026-10-30'), act(3, '2026-11-05', 'Ride'), act(4, '2026-11-30')],
    [1, 5, 3],
    window,
  )
  eq(plan.upserts.map(r => r.strava_activity_id), [1, 4], 'only mappable activities inside the challenge are written')
  eq(plan.deleteIds, [5, 3], 'a run Strava no longer lists goes, and one re-typed as a ride goes too')
  eq(planSync([], [], window), { upserts: [], deleteIds: [] }, 'nothing in, nothing out')
}

section('Webhook events mean exactly what they say')
{
  eq(webhookAction({ object_type: 'activity', aspect_type: 'create', object_id: 7, owner_id: 42 }),
    { kind: 'refresh-activity', athleteId: 42, activityId: 7 }, 'a new activity is read')
  eq(webhookAction({ object_type: 'activity', aspect_type: 'update', object_id: 7, owner_id: 42, updates: { title: 'x' } }).kind,
    'refresh-activity', 'an edit is re-read — it may have changed type, distance or privacy')
  eq(webhookAction({ object_type: 'activity', aspect_type: 'delete', object_id: 7, owner_id: 42 }),
    { kind: 'delete-activity', athleteId: 42, activityId: 7 }, 'a deleted one is removed')
  eq(webhookAction({ object_type: 'athlete', aspect_type: 'update', object_id: 42, owner_id: 42, updates: { authorized: 'false' } }),
    { kind: 'deauthorize', athleteId: 42 }, 'revoking access on Strava forgets the athlete')
  eq(webhookAction({ object_type: 'athlete', aspect_type: 'update', owner_id: 42, updates: { weight: '70' } }).kind,
    'ignore', 'any other athlete change is ignored')
  eq(webhookAction({ object_type: 'activity', aspect_type: 'create', object_id: 7 }).kind, 'ignore', 'no owner, nothing to do')
  eq(webhookAction('junk').kind, 'ignore', 'junk is ignored')
  const now = Date.parse('2026-11-01T12:00:00Z')
  ok(!tokenNeedsRefresh('2026-11-01T12:10:00Z', now), 'ten minutes left: the token is used')
  ok(tokenNeedsRefresh('2026-11-01T12:02:00Z', now), 'two minutes left: refreshed first')
  ok(tokenNeedsRefresh(Math.floor(now / 1000) - 60, now), 'Strava\'s epoch seconds, expired: refreshed')
  ok(outcomeMessage('connected')?.ok === true && outcomeMessage('taken')?.ok === false && outcomeMessage('nope') === null,
    'every way back from Strava has its sentence, and an unknown word has none')
}

section('Tokens never leave the server, and only two doors forget anybody')
{
  const sql = read('supabase/migrations/20260101000054_strava.sql')
  ok(sql.includes('ALTER TABLE strava_athletes ENABLE ROW LEVEL SECURITY') &&
     sql.includes('ALTER TABLE strava_links ENABLE ROW LEVEL SECURITY'), 'both Strava tables have RLS on')
  ok(!/CREATE POLICY/i.test(sql), 'and no policy — the browser cannot read a token, not even its own')
  ok(sql.includes('UNIQUE (trip_id, athlete_id)'), 'one Strava account feeds one runner per challenge')
  ok(sql.includes('ADD COLUMN IF NOT EXISTS device_name'), 'runs learn what recorded them, for the Garmin credit')

  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : [])
  const all = [...walk('app'), ...walk('lib')]
  eq(all.filter(f => read(f).includes(".from('strava_athletes')")), ['lib/stravaApi.ts'],
    'the token table is read and written in one file')
  const clients = all.filter(f => read(f).trimStart().startsWith("'use client'"))
  eq(clients.filter(f => /strava_(athletes|links)|access_token|refresh_token|lib\/strava'/.test(read(f))), [],
    'no browser component touches a Strava table, a token, or the signing code')

  const api = stripComments(read('lib/stravaApi.ts'))
  eq((api.match(/forgetAthlete\(admin/g) ?? []).length, 4,
    'an athlete is forgotten from exactly four places: their revoke on Strava, their own Disconnect, a connection dead for 25 days, and their challenge closing')
  ok(api.includes("if (action.kind === 'deauthorize') {") && api.includes('await forgetAthlete(admin, cfg, action.athleteId, { revoke: false })'),
    '  …the first is the deauthorisation webhook')
  ok(api.includes('if (await revocationConfirmed(admin, cfg, action.athleteId)) {'),
    '  …acted on only once Strava confirms it — the webhook is unsigned, so an event is a claim')
  ok(api.includes('if (count) return { tokensKept: true }\n  await forgetAthlete(admin, cfg, Number(link.athlete_id), { revoke: true })'),
    '  …the second is Disconnect, once the account feeds nothing else')
  const dead = api.slice(api.indexOf('export async function purgeDeadConnections'), api.indexOf('export async function endChallengeLinks'))
  ok(dead.includes(".lt('last_ok_at', deadCutoff(now))") && dead.includes('forgetAthlete(admin, cfg, Number(a.athlete_id), { revoke: false })'),
    '  …the third acts on a connection silent for DEAD_CONNECTION_DAYS, and on nothing sooner')
  const end = api.slice(api.indexOf('export async function endChallengeLinks'), api.indexOf('export async function ensureSubscription'))
  ok(end.includes('if (!count) await forgetAthlete(admin, cfg, athleteId, { revoke: true })'),
    '  …the fourth is the challenge closing, for an account that then feeds nothing')
  const refresh = api.slice(api.indexOf('async function refreshTokens'), api.indexOf('export async function saveTokens'))
  ok(!/revoked|forget|delete/i.test(refresh), 'a refused refresh is a retry, never a reason to delete — a wrong key must not wipe the boards')
}

section('The routes keep their promises')
{
  const connect = stripComments(read('app/api/run/strava/connect/route.ts'))
  ok(connect.includes("searchParams.get('consent') !== '1'"), 'no connecting without the consent box ticked')
  ok(connect.includes('cookieRunner(admin, loaded.trip)'), 'and only for a runner this phone joined as')

  const cb = stripComments(read('app/api/run/strava/callback/route.ts'))
  const iVerify = cb.indexOf('verifyState(')
  ok(iVerify > -1 && iVerify < cb.indexOf('exchangeCode('), 'the callback trusts nothing before the state checks out')
  ok(cb.includes("if (!scopeGranted(params.get('scope'))) return back('scope')"), 'an unticked activities box is said, not ignored')
  ok(cb.includes("if (taken) return back('taken')"), 'a Strava account already feeding another name is refused')
  ok(cb.includes('consented_at: new Date().toISOString()'), 'the consent is stored with the link')
  ok(cb.includes('ensureSubscription(cfg, `${origin}/api/run/strava/webhook`)'),
    'the first connect sets up Strava\'s webhook — nobody has to by hand')

  const hook = stripComments(read('app/api/run/strava/webhook/route.ts'))
  ok(hook.includes("p.get('hub.verify_token') !== cfg.verifyToken"), 'the webhook confirms only with our verify token')
  ok(hook.includes('after(async () => {'), 'and answers Strava at once, doing the work after')

  const sync = stripComments(read('app/api/run/strava/sync/route.ts'))
  ok(sync.includes("req.headers.get('authorization') !== `Bearer ${secret}`"), 'the nightly sync runs only for the cron')
  const limit = Number(sync.match(/NIGHTLY_LIMIT = (\d+)/)?.[1] ?? 999)
  ok(limit > 0 && limit < 100, `and reads at most ${limit} connections a night, inside Strava's 100 per 15 minutes`)
  ok(!sync.includes('ensureSubscription'), 'it never sets up the webhook — the cron calls the vercel.app address')
  ok(JSON.parse(read('vercel.json')).crons.some((c: { path: string }) => c.path === '/api/run/strava/sync'),
    'and it is scheduled')
}

section('The Strava card, in each of its states')
{
  const off = draw(<StravaCard code="GX7K2P" status={{ state: 'off' }} joined={true} end="2026-11-30" />)
  ok(off.includes('not set up for this site yet'), 'not set up: said, with typed runs still working')
  const fresh = draw(<StravaCard code="GX7K2P" status={{ state: 'disconnected' }} joined={true} end="2026-11-30" />)
  ok(fresh.includes('type="checkbox"') && fresh.includes('show my totals on its leaderboard'),
    'not connected: the consent box, saying what is shared')
  ok(fresh.includes('Connect with Strava') && fresh.includes('aria-disabled="true"') && !fresh.includes('href="/api/run/strava/connect'),
    'and Connect is dead until it is ticked')
  const stranger = draw(<StravaCard code="GX7K2P" status={{ state: 'disconnected' }} joined={false} end="2026-11-30" />)
  ok(stranger.includes('Join the challenge first') && !stranger.includes('type="checkbox"'), 'a phone not joined is told to join first')
  const on = draw(<StravaCard code="GX7K2P" status={{ state: 'connected', lastSyncedAt: null }} joined={true} end="2026-11-30" />)
  ok(on.includes('Strava connected') && on.includes('Check for new runs') && on.includes('Disconnect'),
    'connected: check now, or disconnect')
  ok(read('app/run/[tripCode]/add/page.tsx').includes('garmin: isGarmin(r.deviceName) ? r.deviceName : null'),
    'a Garmin run carries its device to the runner\'s own list')
}

// ─── Strava's API Policy, built in ─────────────────────────────

section('A challenge has a shape in time, and closes three days after its finish')
{
  eq(FINAL_GRACE_DAYS, 3, 'three days for late uploads — the number every screen\'s wording says')
  eq(closesOn('2026-11-30'), '2026-12-03', 'a November challenge closes on 3 December')
  eq(closesOn('2026-02-27'), '2026-03-02', 'across a month end')
  eq(challengePhase('2026-11-01', '2026-11-30', '2026-10-31', false), 'upcoming', 'before the start: upcoming')
  eq(challengePhase('2026-11-01', '2026-11-30', '2026-11-01', false), 'live', 'the first day is live')
  eq(challengePhase('2026-11-01', '2026-11-30', '2026-11-30', false), 'live', 'and so is the last')
  eq(challengePhase('2026-11-01', '2026-11-30', '2026-12-01', false), 'closing', 'the day after: closing')
  eq(challengePhase('2026-11-01', '2026-11-30', '2026-12-09', false), 'closing', 'still closing until it is frozen')
  eq(challengePhase('2026-11-01', '2026-11-30', '2026-11-15', true), 'final', 'frozen is final, whatever the date')
  eq(challengePhase(null, null, '2026-11-15', true), 'final', '  …and whatever the dates')
  ok(!dueForFinal('2026-11-30', '2026-12-03', false), 'not frozen on the closing day itself — late runs still count')
  ok(dueForFinal('2026-11-30', '2026-12-04', false), 'frozen the day after')
  ok(!dueForFinal('2026-11-30', '2026-12-04', true), 'never twice')
  ok(!dueForFinal(null, '2027-01-01', false), 'no finish, nothing to freeze')
  eq(describeDay('2026-12-03'), 'Thu 3 Dec', 'a day reads as a runner reads it')
  const fin = stripComments(read('app/api/run/finalise.ts'))
  ok(fin.includes(".lt('end_date', addDays(today, -FINAL_GRACE_DAYS))") && fin.includes(".is('run_results', null)"),
    'the nightly close asks the database the same question dueForFinal answers')
}

section('A final challenge keeps its team standings, and nobody\'s runs')
{
  const teams = teamBoard(
    [{ id: 't1', name: 'Hares', color: '#0a9d56', memberIds: ['a', 'b'] },
     { id: 't2', name: 'Tortoises', color: '#b5533c', memberIds: ['c'] }],
    runnerTotals([
      { playerId: 'a', activity: 'run', date: '2026-11-02', distanceM: 10000 },
      { playerId: 'c', activity: 'run', date: '2026-11-03', distanceM: 5000 },
    ], rules(), { start: '2026-11-01', end: '2026-11-30' }),
    'average',
  )
  const frozen = freezeResults(teams, 'average', '2026-12-04', true, true)
  eq(frozen.teams.map(t => [t.name, t.place, t.score]), [['Tortoises', 1, 7], ['Hares', 2, 6]],
    'the team standings exactly as the board had them')
  ok(!JSON.stringify(frozen).includes('teamId') && !JSON.stringify(frozen).includes('memberIds') &&
     !/"a"|"b"|"c"/.test(JSON.stringify(frozen)), 'and no runner in them — not even an id')
  eq(parseFinalResults(JSON.parse(JSON.stringify(frozen))), frozen, 'it reads back whole from the column')
  eq(parseFinalResults(null), null, 'no column, or nothing in it: not final')
  eq(parseFinalResults({ teams: [] }), null, 'junk is not final either')
  eq(parseFinalResults({ frozenOn: '2026-12-04', teams: [{ name: 'X' }] })?.teams[0],
    { name: 'X', color: '#4A3728', members: 0, total: 0, average: 0, score: 0, km: 0, place: 1 },
    'a damaged team reads fail-soft')
  const fin = stripComments(read('app/api/run/finalise.ts'))
  const iWrite = fin.indexOf('.update({ run_results: results })')
  ok(iWrite > -1 && iWrite < fin.indexOf('endChallengeLinks(admin, cfg'), 'the standings are frozen before anything is deleted')
  ok(fin.includes("if (writeErr) { console.error('finalise: could not freeze', code, writeErr); failed.push(code); continue }"),
    'and a freeze that failed deletes nothing')
  ok(fin.includes(".from('runs').delete().eq('trip_id', trip.id).eq('source', 'strava')"),
    'with Strava switched off since, its runs still go — nothing of Strava\'s outlives the challenge')
  ok(/const FREEZE_INCLUDES_STRAVA = (true|false)/.test(fin), 'whether Strava runs count in the frozen total is one switch')
  const sql = read('supabase/migrations/20260101000055_strava_retention.sql')
  ok(sql.includes('ADD COLUMN IF NOT EXISTS run_results jsonb') && sql.includes('ADD COLUMN IF NOT EXISTS refreshed_at') &&
     sql.includes('ADD COLUMN IF NOT EXISTS last_ok_at'), 'migration 055 adds the three columns, re-pastable')
  ok(read('app/run/[tripCode]/data.ts').includes(".select('run_results')"), 'and the challenge reads its result in its own query, fail-soft')
}

section('Strava\'s copy is short-lived')
{
  eq(STRAVA_CACHE_DAYS, 7, 'a stored copy is at most seven days old (§6.2)')
  ok(DEAD_CONNECTION_DAYS < 30 && DEAD_CONNECTION_DAYS >= 14, 'a silent connection goes inside §7.4\'s thirty days, and not in a hurry')
  const now = Date.parse('2026-11-20T03:30:00Z')
  eq(cacheCutoff(now), '2026-11-13T03:30:00.000Z', 'the cache cutoff is seven days back to the minute')
  eq(deadCutoff(now), '2026-10-26T03:30:00.000Z', 'the dead cutoff twenty-five')
  const act = (id: number, date: string) =>
    ({ id, sport_type: 'Run', start_date_local: `${date}T08:00:00Z`, distance: 5000, moving_time: 1500 })
  const window = { start: '2026-11-01', end: '2026-11-30' }
  eq(planSync([act(1, '2026-11-02')], [1, 2], window, false).deleteIds, [],
    'a list cut short at the page cap removes nothing — the missing run may be on the page not read')
  eq(planSync([act(1, '2026-11-02')], [1, 2], window, false).upserts.length, 1, '  …but still writes what it read')
  const api = stripComments(read('lib/stravaApi.ts'))
  ok(api.includes('page <= SYNC_PAGES') && api.includes('if (body.length < PAGE_SIZE) return { activities, complete: true }'),
    'a sync pages through the activities, and knows when it reached the end')
  ok((api.match(/refreshed_at: (now|new Date\(\)\.toISOString\(\))/g) ?? []).length === 2,
    'both Strava writes — the sync and the webhook — stamp when Strava last confirmed the run')
  const syncAll = stripComments(read('app/api/run/strava/sync/route.ts'))
  const sync = syncAll.slice(syncAll.indexOf('export async function GET'))
  const iFinal = sync.indexOf('finaliseDueChallenges(admin'), iPurge = sync.indexOf('purgeExpiredRuns(admin'),
    iCfg = sync.indexOf('if (!cfg)'), iDead = sync.indexOf('purgeDeadConnections(admin')
  ok(iFinal > -1 && iFinal < iPurge && iPurge < iCfg && iCfg < iDead,
    'the nightly job closes challenges and clears expired copies first — even with Strava switched off — then the dead connections')
}

section('A closed challenge takes no new runs and no new connections')
{
  const route = stripComments(read('app/api/run/runs/route.ts'))
  const post = route.slice(route.indexOf('export async function POST'), route.indexOf('export async function DELETE'))
  ok(/today(String\(new Date\(\)\))? > closesOn\(/.test(post), 'the runs route refuses a run once the challenge has closed')
  const connect = stripComments(read('app/api/run/strava/connect/route.ts'))
  ok(connect.includes("> closesOn(loaded.trip.end_date)) return back('closed')"), 'and the connect route a connection')
  ok(outcomeMessage('closed')?.text.includes('closed') === true, '  …saying why')
  const add = draw(<RunAddClient code="GX7K2P" rules={defaultRules()} start="2026-11-01" end="2026-11-30"
    logRuns={true} closed={true} myRuns={[]} />)
  ok(add.includes('runs can no longer be added') && !add.includes('Save run'), 'the Add tab offers no form once closed')
  const finalAdd = draw(<RunAddClient code="GX7K2P" rules={defaultRules()} start="2026-11-01" end="2026-11-30"
    logRuns={true} closed={true} final={{ stravaRemoved: true }} myRuns={[]} />)
  ok(finalAdd.includes('is final') && finalAdd.includes('Strava runs have been deleted'), 'and once final says what happened to Strava\'s runs')
}

section('The consent says everything Strava asks before anybody agrees (§2.1)')
{
  const card = draw(<StravaCard code="GX7K2P" status={{ state: 'disconnected' }} joined={true} end="2026-11-30" />)
  const text = card.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  ok(text.includes('type, date, distance and moving time') && text.includes('device'), '(i) what is kept')
  ok(text.includes('read from Strava automatically') && text.includes('Only You'), '(ii) how it is collected, and what never is')
  ok(text.includes('totals only') && text.includes('shown only to you'), 'who sees what')
  ok(text.includes('For this challenge only') && text.includes('Thu 3 Dec') && text.includes('extends it'),
    'the connection lasts for the challenge — the close date said, with room to extend')
  ok(text.includes('team’s final total stays') || text.includes("team's final total stays") || text.includes('team&#x27;s final total stays'),
    'and what stays when it ends')
  ok(text.includes('Disconnect here') && card.includes(`href="${STRAVA_APPS_URL}"`), '(iii) how to withdraw — here, or on Strava')
  ok(text.includes('Leave and delete my data') && card.includes(`mailto:${SITE.supportEmail}`), '(iv) how to have it deleted')
  ok(text.includes('We confirm when it is done'), '(v) that the deletion is confirmed')
  ok(card.includes('href="/privacy"'), 'and the privacy notice is a tap away')
  const iList = card.indexOf('What is kept'), iBox = card.indexOf('type="checkbox"')
  ok(iList > -1 && iList < iBox, 'all of it before the box, not after')

  const on = draw(<StravaCard code="GX7K2P" status={{ state: 'connected', lastSyncedAt: null }} joined={true} end="2026-11-30" />)
  ok(on.includes('Manage on Strava') && on.includes(`href="${STRAVA_APPS_URL}"`), 'connected: managed on Strava too (§2.4)')
  ok(on.includes('The connection ends on') && on.includes('Thu 3 Dec'), '  …and says when it ends')
  const closedOn = draw(<StravaCard code="GX7K2P" status={{ state: 'connected', lastSyncedAt: null }} joined={true} end="2026-11-30" closed={true} />)
  ok(!closedOn.includes('Check for new runs') && closedOn.includes('Disconnect') && closedOn.includes('has closed'),
    'closed: nothing to check, but Disconnect is always there')
  const closedOff = draw(<StravaCard code="GX7K2P" status={{ state: 'disconnected' }} joined={true} end="2026-11-30" closed={true} />)
  ok(!closedOff.includes('type="checkbox"') && closedOff.includes('can no longer be connected'), 'and nothing new connects')

  ok(disconnectedMessage(false).includes('permanently deleted from Green Dot'), 'Disconnect answers in writing with what went')
  ok(disconnectedMessage(true).includes('still feeds another Green Dot challenge'),
    '  …and never claims the tokens went when another challenge still uses them')
  const disc = stripComments(read('app/api/run/strava/disconnect/route.ts'))
  ok(disc.includes('message: disconnectedMessage(tokensKept)'), '  …the route sends that sentence')
}

section('A runner\'s own runs link to Strava, and Garmin is credited')
{
  const add = draw(<RunAddClient code="GX7K2P" rules={defaultRules()} start="2026-11-01" end="2026-11-30"
    logRuns={true} myRuns={[
      { id: 'r1', date: '2026-11-02', activity: 'run', km: 5, minutes: 30, source: 'manual', points: 7, stravaId: null },
      { id: 'r2', date: '2026-11-03', activity: 'run', km: 8, minutes: null, source: 'strava', points: 10,
        stravaId: 98765, garmin: 'Garmin Forerunner 265' },
    ]} />)
  eq(activityUrl(98765), 'https://www.strava.com/activities/98765', 'the link is Strava\'s own activity page')
  ok(add.includes(`href="${activityUrl(98765)}"`) && add.includes('View on Strava'), 'a Strava run says View on Strava')
  eq((add.match(/View on Strava/g) ?? []).length, 1, '  …and a typed-in run does not')
  ok(add.includes('Recorded on Garmin Forerunner 265'), 'a Garmin run names its device')

  const board = draw(<RunBoardClient anyRuns={true} garmin={true} boards={[
    { id: 'i', kind: 'individual', title: 'Runners', rule: '', rows: [] }]} />)
  ok(board.includes('Includes activities recorded on Garmin devices'), 'a board built partly from Garmin runs says so (§4.4)')
  const plain = draw(<RunBoardClient anyRuns={true} boards={[
    { id: 'i', kind: 'individual', title: 'Runners', rule: '', rows: [] }]} />)
  ok(!plain.includes('Garmin'), '  …and one without says nothing')
  const page = stripComments(read('app/run/[tripCode]/leaderboard/page.tsx'))
  ok(page.includes("read.runs.some(r => r.source === 'strava' && isGarmin(r.deviceName))") && page.includes('? final.garmin'),
    'the credit is decided from the runs counted — or, once final, kept with the frozen result')
  ok(read('app/api/run/finalise.ts').includes('freezeResults(s.teams, s.teamScore, today, hadStrava, garmin)'),
    '  …which the close records')
}

section('The leaderboard, once final, is the frozen result')
{
  const page = stripComments(read('app/run/[tripCode]/leaderboard/page.tsx'))
  ok(page.includes('rows: final.teams.map('), 'the team board is the frozen one')
  ok(page.includes("...(final.stravaRemoved ? [] : live.filter(b => b.kind === 'individual'))"),
    'and the runners board stays only if no Strava run was ever part of it')
  const hub = stripComments(read('app/run/[tripCode]/page.tsx'))
  ok(hub.includes('Final standings') && hub.includes('{!final && standings && anyRuns && ('),
    'the home page shows the final standings in place of the live ones')
  ok(hub.includes('me && !final?.stravaRemoved'), '  …and no personal total re-told without its Strava runs')
}

section('A runner can delete everything themselves, and is told when it is done (§2.5)')
{
  const route = stripComments(read('app/api/run/me/delete/route.ts'))
  ok(route.includes('cookieRunner(admin, loaded.trip)'), 'only the runner this phone joined as')
  const iStrava = route.indexOf('disconnectRunner(admin, cfg, playerId, loaded.trip.id)')
  const iPlayer = route.indexOf(".from('players').delete().eq('id', playerId).eq('trip_id', loaded.trip.id)")
  ok(iStrava > -1 && iStrava < iPlayer, 'Strava first — tokens revoked while the link still names them — then the runner, in this challenge only')
  ok(route.includes('permanently deleted'), 'and the answer is the written confirmation')
  const sql053 = read('supabase/migrations/20260101000053_runs.sql')
  const sql054 = read('supabase/migrations/20260101000054_strava.sql')
  ok(sql053.includes('REFERENCES players(id) ON DELETE CASCADE') && /player_id\s+uuid[^,]*REFERENCES players\(id\)\s+ON DELETE CASCADE/.test(sql054),
    'deleting the runner takes their runs and their Strava link with them')

  const help = draw(<HelpAndPrivacy code="GX7K2P" joinedAs="Aoife" />)
  ok(help.includes('Leave and delete my data') && help.includes(`mailto:${SITE.supportEmail}`) &&
     help.includes('href="/privacy"') && help.includes('href="/terms"'),
    'Settings carries the support address, the notice, the terms and the button')
  ok(!draw(<HelpAndPrivacy code="GX7K2P" joinedAs={null} />).includes('Leave and delete'), 'a phone not joined has nothing to delete')
  const client = stripComments(read('app/run/[tripCode]/settings/HelpAndPrivacy.tsx'))
  const iForget = client.indexOf('forgetPlayer(code)'), iRefresh = client.indexOf('router.refresh()')
  ok(iForget > -1 && iForget < iRefresh, 'then the cookie goes before the page re-reads (lib/currentPlayer.ts)')
  eq(SITE.supportEmail, 'support@greendot.live', 'the one support address')
}

section('The organiser can extend the challenge until it is final')
{
  const ed = draw(<RunDatesEditor tripId="T1" start="2026-11-01" end="2026-11-30" />)
  ok(ed.includes('value="2026-11-01"') && ed.includes('value="2026-11-30"') && ed.includes('Save dates'), 'the dates, ready to move')
  const src = stripComments(read('app/run/[tripCode]/organiser/RunDatesEditor.tsx'))
  ok(src.includes('challengeDatesIssue(from, to)'), 'checked the way creation checks them')
  ok(src.includes(".update({ start_date: from, end_date: to })\n      .eq('id', tripId)"), 'one write, filtered on the challenge')
  ok(src.includes('dueForFinal(to, todayString(new Date()), false) && !window.confirm('),
    'a finish that has already closed is asked about first — it freezes the standings overnight')
  const org = stripComments(read('app/run/[tripCode]/organiser/RunOrganiserClient.tsx'))
  ok(org.includes('{challenge.final ? (') && org.indexOf('{challenge.final ? (') < org.indexOf('<RunDatesEditor'),
    'and once final the dates are said, not offered')
}

section('The privacy notice and the terms — one for the whole site — say what Strava\'s policy requires')
{
  const privacy = draw(<PrivacyPage />).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&#x27;|’/g, "'")
  ok(privacy.includes(SITE.supportEmail), 'a contact (§2.4)')
  ok(['Vercel', 'Supabase', 'Resend', 'Anthropic', 'ImprovMX', 'Gmail'].every(n => privacy.includes(n)),
    'who else handles the data (§7.7) — the support mailbox\'s services included')
  ok(privacy.includes('Strava may monitor and collect usage data'), 'the usage-data statement Strava asks for (§6.5)')
  ok(privacy.includes("Strava's governs"), 'Strava\'s own policy governs Strava data (§7.3)')
  ok(privacy.includes(`${STRAVA_CACHE_DAYS} days`) && privacy.includes(`${DEAD_CONNECTION_DAYS} days`) &&
     privacy.includes(`${FINAL_GRACE_DAYS} days after its finish`), 'retention, from the constants the code runs on')
  ok(privacy.includes('artificial-intelligence'), 'no Strava data into AI (§5.3)')
  ok(privacy.includes('dataprotection.ie'), 'where to complain')
  ok(!!SITE.controller && privacy.includes(`run by ${(SITE.controller ?? '').replace(/’/g, "'")}`), 'who runs Green Dot is named (Art. 13)')
  ok(!/\d/.test(SITE.controller ?? ''), '  …by name alone — no address, by decision')
  const src = stripComments(read('app/privacy/page.tsx'))
  ok(!/\b(7|25|seven|twenty-five) days\b/.test(src), 'no retention figure typed by hand, to drift from the code')

  const terms = draw(<TermsPage />).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  ok(['merchantability', 'fitness for a particular purpose', 'non-infringement'].every(w => terms.includes(w)) &&
     terms.includes('On behalf of every third-party service provider, all warranties are disclaimed'),
    'the terms disclaim every warranty on behalf of third parties (§9.2)')
  ok(terms.includes('consequential, special, punitive or indirect damages'), '  …and exclude them from those damages')
  ok(terms.includes('more sports to come') && terms.includes('Golf courses'), 'the terms are the whole site\'s, golf included')
  ok(terms.includes(`Green Dot is run by ${SITE.controller}`), '  …and say who runs it')

  // Site-wide: golf in full, and room for what comes next.
  ok(privacy.includes("An event's code is its key"), 'the notice says plainly that the code is the only lock')
  ok(['Handicaps', "ladies' card", 'Scores', 'Putts and fairways', 'Scorecard photos', 'Norwegian Meteorological Institute']
    .every(w => privacy.includes(w)), 'golf is covered in full: handicaps, the card, scores, stats, the card check, weather')
  ok(privacy.includes("organiser's email address") && privacy.includes('itinerary'), 'and what every event holds, whatever its sport')
  ok(privacy.includes('What is kept on your phone') && privacy.includes('not yet sent'),
    'every cookie and stored setting is named — the score outbox included')
  ok(privacy.includes('Each new kind of event is added to this notice before it opens'), 'a new sport is a new section, written first')
  ok(privacy.includes('Trip Setup') && privacy.includes('Leave and delete my data'), 'each sport says how its people correct or delete')

  // Linked from every front door, through the one component.
  const links = draw(<LegalLinks />)
  ok(links.includes('href="/privacy"') && links.includes('href="/terms"'), 'the links line points at both')
  for (const door of ['app/Landing.tsx', 'app/join/JoinForm.tsx', 'app/golf/page.tsx', 'app/create/page.tsx',
    'app/trip/[tripCode]/page.tsx', 'app/run/[tripCode]/page.tsx']) {
    const src = stripComments(read(door))
    ok(src.includes("import LegalLinks from '@/app/components/LegalLinks'") && src.includes('<LegalLinks'),
      `  …carried by ${door}`)
  }
}

section('Strava\'s own logo, unaltered, wherever Strava data is shown')
{
  for (const f of ['public/strava/powered-by-strava.svg', 'public/strava/powered-by-strava-white.svg']) {
    ok(fs.existsSync(f), `${f} is Strava's file`)
    const svg = fs.existsSync(f) ? read(f) : ''
    ok(!/<script|\son[a-z]+=|href=|<foreignObject/i.test(svg), '  …and carries nothing but drawing')
  }
  ok(read('public/strava/powered-by-strava.svg').includes('fill="#FC5200"'), 'the orange is Strava\'s, as supplied')
  const logo = draw(<PoweredByStrava />)
  ok(logo.includes('/strava/powered-by-strava.svg') && logo.includes('class="only-light"') &&
     logo.includes('/strava/powered-by-strava-white.svg') && logo.includes('class="only-dark"'),
    'one file per theme — the orange version\'s black words vanish on the dark palette')
  ok((logo.match(/alt="Powered by Strava"/g) ?? []).length === 2, 'each with its alt')

  const states = [
    draw(<StravaCard code="GX7K2P" status={{ state: 'disconnected' }} joined={true} end="2026-11-30" />),
    draw(<StravaCard code="GX7K2P" status={{ state: 'connected', lastSyncedAt: null }} joined={true} end="2026-11-30" />),
    draw(<StravaCard code="GX7K2P" status={{ state: 'disconnected' }} joined={true} end="2026-11-30" closed={true} />),
  ]
  ok(states.every(h => h.includes('Powered by Strava')), 'every Strava card carries it')
  ok(!draw(<StravaCard code="GX7K2P" status={{ state: 'off' }} joined={true} end="2026-11-30" />).includes('Powered by Strava'),
    '  …but not the card that says Strava is not set up')
  const board = (strava: boolean) => draw(<RunBoardClient anyRuns={true} strava={strava} boards={[
    { id: 'i', kind: 'individual', title: 'Runners', rule: '', rows: [] }]} />)
  ok(board(true).includes('Powered by Strava') && !board(false).includes('Powered by Strava'),
    'a board carries it when it counts Strava runs, and only then')
  ok(stripComments(read('app/run/[tripCode]/leaderboard/page.tsx'))
    .includes("const strava = final ? final.stravaRemoved : read.runs.some(r => r.source === 'strava')"),
    '  …a frozen result built from Strava runs included')
}

// ─── Done ──────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
