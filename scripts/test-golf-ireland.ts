/**
 * Golf Ireland tests. Run with: npm run test:golf-ireland
 *
 * Golf Ireland's API is not in our hands yet, so everything here runs
 * against a fake that keeps the client's promises. Four halves: the
 * league's stored rules, what a card must be before anything trusts it,
 * which cards count and why the others do not, and what a sync adds and
 * removes — then the wiring that holds it together: the placeholder
 * client refuses rather than guesses, the state signing is one copy shared
 * with Strava, and migration 056 closes its tables to the browser.
 */

import fs from 'fs'
import {
  golfIrelandConfig, SCORE_SOURCES, scoresLive, readsGolfIreland,
  defaultRules, parseGolfIrelandRules, tidyWeekdays, describeWeekdays, describeRules,
  normaliseCard, leagueWindow, cardIssue, planImport, pickIssue,
  type GolfIrelandRules, type CardContext, type GolfIrelandCard,
} from '../lib/golfIreland'
import {
  golfIrelandClient, GolfIrelandNotReady,
  type GolfIrelandClient, type RawCard,
} from '../lib/golfIrelandClient'
import { parseLeagueSetup, describeLeagueSetup } from '../lib/leagueSetup'
import { parseBracketSetup } from '../lib/bracketSetup'
import { signState, verifyState } from '../lib/signedState'
import * as strava from '../lib/strava'
import { weekdayOf } from '../lib/weekdays'

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
// The async checks, awaited before the result is printed.
const pending: Promise<unknown>[] = []

// ─── A fake Golf Ireland ───────────────────────────────────────
//
// Holds members' cards and pages them, as the real one is assumed to.
// `brokenPage` makes the second page fail, which is how a list comes back
// incomplete.

function fakeGolfIreland(cards: Record<string, RawCard[]>, opts: { pageSize?: number; brokenPage?: boolean } = {}): GolfIrelandClient {
  const pageSize = opts.pageSize ?? 50
  return {
    authorizeUrl: (redirect, state) => `https://fake.golfireland.test/authorize?r=${encodeURIComponent(redirect)}&state=${state}`,
    exchangeCode: async code => ({
      tokens: { accessToken: `at-${code}`, refreshToken: `rt-${code}`, expiresAt: Date.now() + 3_600_000 },
      member: { memberId: code, name: 'Fake Member', handicapIndex: 12.4 },
    }),
    refresh: async rt => ({ accessToken: `at2-${rt}`, refreshToken: rt, expiresAt: Date.now() + 3_600_000 }),
    cards: async (token, from, to) => {
      const mine = (cards[token.replace(/^at-/, '')] ?? [])
        .filter(c => typeof c.playedOn === 'string' && c.playedOn >= from && c.playedOn <= to)
      const pages = Math.ceil(mine.length / pageSize)
      if (opts.brokenPage && pages > 1) return { cards: mine.slice(0, pageSize), complete: false }
      return { cards: mine, complete: true }
    },
    revoke: async () => {},
  }
}

const card = (over: Partial<Record<keyof RawCard, unknown>> = {}): RawCard => ({
  cardId: 'c-1',
  playedOn: '2026-11-07', // a Saturday
  holesPlayed: 18,
  courseId: 'gi-rosapenna',
  courseName: 'Rosapenna – Sandy Hills',
  grossTotal: 88,
  stablefordPoints: 34,
  handicapIndex: 14.2,
  courseHandicap: 16,
  ...over,
})

const winter: CardContext = {
  from: '2026-11-01', to: '2027-02-28',
  venueCourseIds: ['gi-rosapenna', 'gi-portsalon'],
  source: 'golf_ireland',
}
const saturdays18: GolfIrelandRules = { entry: 'automatic', holes: 18, weekdays: [6], courses: 'venues' }

// ─── Configuration ─────────────────────────────────────────────

section('Golf Ireland is set up by three keys, all of them, over https')
{
  const env = { GOLF_IRELAND_CLIENT_ID: 'id', GOLF_IRELAND_CLIENT_SECRET: 'sec', GOLF_IRELAND_API_BASE: 'https://api.example.ie/v1/' }
  eq(golfIrelandConfig(env), { clientId: 'id', clientSecret: 'sec', apiBase: 'https://api.example.ie/v1' },
    'all three: set up, trailing slash trimmed')
  eq(golfIrelandConfig({ ...env, GOLF_IRELAND_CLIENT_SECRET: ' ' }), null, 'a blank secret: not set up')
  eq(golfIrelandConfig({ ...env, GOLF_IRELAND_API_BASE: 'http://api.example.ie' }), null,
    'plain http: not set up — tokens never travel unencrypted')
  eq(golfIrelandConfig({}), null, 'nothing: not set up')
}

// ─── Where scores come from ────────────────────────────────────

section('Three answers to where the scores come from, live first')
{
  eq(SCORE_SOURCES.map(s => s.key), ['live', 'golf_ireland', 'both'], 'the three, in order')
  ok(scoresLive(undefined) && scoresLive('live') && scoresLive('both') && !scoresLive('golf_ireland'),
    'live scoring is on unless Golf Ireland is the only source — and absent is live')
  ok(!readsGolfIreland(undefined) && !readsGolfIreland('live') && readsGolfIreland('golf_ireland') && readsGolfIreland('both'),
    'Golf Ireland is read only when asked for')
}

// ─── The rules ─────────────────────────────────────────────────

section('The rules are read whole or not at all')
{
  eq(defaultRules(), { entry: 'automatic', holes: 18, courses: 'any' }, 'the form starts on every 18-hole card, anywhere')
  eq(parseGolfIrelandRules(saturdays18), saturdays18, 'complete rules round-trip')
  eq(parseGolfIrelandRules({ ...saturdays18, holes: 'either' })?.holes, 'either', '"either" survives')
  eq(parseGolfIrelandRules({ entry: 'automatic', courses: 'any' }), null, 'no hole rule: dropped, never repaired')
  eq(parseGolfIrelandRules({ ...saturdays18, holes: 12 }), null, 'a 12-hole rule is not one of the answers')
  eq(parseGolfIrelandRules({ ...saturdays18, entry: 'whenever' }), null, 'an unknown entry: dropped')
  eq(parseGolfIrelandRules([saturdays18]), null, 'an array is not rules')
  eq(parseGolfIrelandRules(null), null, 'nothing is not rules')
}

section('Weekdays are tidied, and none or all seven both mean any day')
{
  eq(tidyWeekdays([6, 0, 6, 9, -1, 2.5, '3']), [0, 6], 'out of range, fractional, strings and repeats go; the rest sort')
  eq(tidyWeekdays([]), null, 'none ticked: any day')
  eq(tidyWeekdays([0, 1, 2, 3, 4, 5, 6]), null, 'all seven: any day — stored as absent')
  eq(parseGolfIrelandRules({ ...saturdays18, weekdays: [0, 1, 2, 3, 4, 5, 6] })?.weekdays, undefined,
    'and a stored all-seven reads back as absent')
  eq(describeWeekdays([6]), 'Saturdays', 'one day')
  eq(describeWeekdays([0, 6]), 'Sundays and Saturdays', 'two days')
  eq(describeWeekdays([2, 4, 6]), 'Tuesdays, Thursdays and Saturdays', 'three days')
  eq(describeRules(saturdays18), '18 holes · Saturdays · league venues', 'the rules as facts')
  eq(describeRules({ entry: 'player_picks', holes: 'either', courses: 'any' }),
    '9 or 18 holes · any day · any course · players choose', 'and the other answers')
}

// ─── A league's setup carries the source and the rules ─────────

section('A league stores where its scores come from, and the rules with them')
{
  const base = { format: 'league', entry: 'self_join' }
  eq(parseLeagueSetup(base), { format: 'league', entry: 'self_join' },
    'a league stored before the question reads back byte-for-byte — scored live')
  eq(parseLeagueSetup({ ...base, scoreSource: 'golf_ireland', golfIreland: saturdays18 }),
    { format: 'league', entry: 'self_join', scoreSource: 'golf_ireland', golfIreland: saturdays18 },
    'Golf Ireland with its rules round-trips')
  eq(parseLeagueSetup({ ...base, scoreSource: 'both', golfIreland: saturdays18 })?.scoreSource, 'both',
    'both round-trips')
  eq(parseLeagueSetup({ ...base, scoreSource: 'live', golfIreland: saturdays18 }),
    { format: 'league', entry: 'self_join' },
    'live is the absent default — never stored, and rules beside it are dropped')
  eq(parseLeagueSetup({ ...base, scoreSource: 'golf_ireland', golfIreland: { entry: 'automatic' } }),
    { format: 'league', entry: 'self_join' },
    'rules that do not parse take the source with them — the league itself survives')
  ok(parseLeagueSetup({ ...base, scoreSource: 'golf_ireland' }) !== null,
    'a league is never refused over its Golf Ireland answer, or its organiser page would offer the knockout form')
  eq(parseBracketSetup({ ...base, scoreSource: 'golf_ireland', golfIreland: saturdays18 }), null,
    'and the knockout parser still refuses a league')

  const gi = parseLeagueSetup({ ...base, scoreSource: 'golf_ireland', golfIreland: saturdays18 })!
  ok(describeLeagueSetup(gi, 1).endsWith('scores from Golf Ireland'), 'the organiser card says where the scores come from')
  ok(describeLeagueSetup({ ...gi, scoreSource: 'both' }, 1).endsWith('scored here and from Golf Ireland'), 'both, said')
  ok(!describeLeagueSetup(parseLeagueSetup(base)!, 1).includes('Golf Ireland'), 'a live league says nothing about it')
}

// ─── A card ────────────────────────────────────────────────────

section('A card is trusted only once it has been checked')
{
  const c = normaliseCard(card())!
  eq(c.cardId, 'c-1', 'a sound card comes through')
  eq(c.holeScores, null, 'no hole scores is fine — nothing needs them')
  eq(normaliseCard(card({ playedOn: '2026-11-07T10:42:00Z' }))?.playedOn, '2026-11-07', 'a timestamp is read as its day')

  eq(normaliseCard(card({ cardId: '' })), null, 'no id: refused')
  eq(normaliseCard(card({ playedOn: '2026-02-30' })), null, 'a date that is not one: refused')
  eq(normaliseCard(card({ holesPlayed: 12 })), null, 'neither 9 nor 18 holes: refused')
  eq(normaliseCard(card({ grossTotal: null, stablefordPoints: null })), null, 'nothing to score: refused')
  eq(normaliseCard(card({ grossTotal: 400, stablefordPoints: null })), null,
    'an absurd gross with no points: nothing left to score, refused')
  eq(normaliseCard(card({ grossTotal: 400 }))?.grossTotal, null, 'an absurd gross beside real points costs the gross, not the card')
  eq(normaliseCard(card({ stablefordPoints: 120 }))?.stablefordPoints, null, 'more points than six a hole: dropped')
  eq(normaliseCard(card({ holesPlayed: 9, grossTotal: 44, stablefordPoints: 18 }))?.holesPlayed, 9, 'a nine-hole card comes through')
  eq(normaliseCard(card({ handicapIndex: 61 }))?.handicapIndex, null, 'a handicap index past 54 is not one')
  eq(normaliseCard(card({ handicapIndex: -2.1 }))?.handicapIndex, -2.1, 'a plus handicap is negative and kept')
  eq(normaliseCard(card({ courseId: '  ' }))?.courseId, null, 'a blank course id is no course id')
  eq(normaliseCard('a card'), null, 'not an object: refused')
}

section('Hole scores are kept only when they agree with the card')
{
  const holes = [5, 4, 6, 5, 4, 5, 6, 3, 5, 5, 4, 5, 6, 4, 5, 5, 3, 8] // 88
  eq(normaliseCard(card({ holeScores: holes }))?.holeScores, holes, 'eighteen that add to the gross: kept')
  eq(normaliseCard(card({ holeScores: holes.slice(0, 17) }))?.holeScores, null, 'seventeen on an eighteen-hole card: dropped')
  eq(normaliseCard(card({ holeScores: [...holes.slice(0, 17), 9] }))?.holeScores, null,
    'a sum one off the gross: dropped in favour of Golf Ireland\'s own total')
  eq(normaliseCard(card({ holeScores: [...holes.slice(0, 17), null] }))?.holeScores?.[17], null,
    'a pick-up has no gross to agree with, and is taken as read')
  eq(normaliseCard(card({ holeScores: [...holes.slice(0, 17), 0] }))?.holeScores, null, 'a zero on a hole is a misread')
  eq(normaliseCard(card({ holeScores: [...holes.slice(0, 17), '8'] }))?.holeScores, null, 'a string on a hole is a misread')
}

// ─── Which cards count ─────────────────────────────────────────

section('A league\'s window is its dates, or from the day it was made')
{
  eq(leagueWindow({ start_date: '2026-11-01', end_date: '2027-02-28', created_at: '2026-10-20T09:00:00Z' }),
    { from: '2026-11-01', to: '2027-02-28' }, 'a dated league: its dates')
  eq(leagueWindow({ start_date: '2026-11-07', end_date: null, created_at: '2026-10-20T09:00:00Z' }),
    { from: '2026-11-07', to: '2026-11-07' }, 'a start with no finish is a single day')
  eq(leagueWindow({ start_date: null, end_date: null, created_at: '2026-10-20T09:00:00Z' }),
    { from: '2026-10-20', to: null }, 'a series: from the day it was made, no finish')
}

section('Each rule refuses in a sentence a player can read')
{
  const c = (over: Partial<Record<keyof RawCard, unknown>> = {}) => normaliseCard(card(over))!
  eq(cardIssue(c(), saturdays18, winter), null, 'an 18-hole Saturday card at a venue, in the window: counts')
  eq(cardIssue(c({ playedOn: '2026-10-31' }), saturdays18, winter), 'Played before the league started.', 'too early')
  eq(cardIssue(c({ playedOn: '2027-03-06' }), saturdays18, winter), 'Played after the league finished.', 'too late')
  eq(cardIssue(c({ playedOn: '2026-11-01' }), { ...saturdays18, weekdays: undefined }, winter), null,
    'the first day itself counts — the window is inclusive')
  eq(cardIssue(c({ holesPlayed: 9, grossTotal: 44 }), saturdays18, winter),
    'A 9-hole round. This league counts 18-hole rounds.', 'nine holes in an eighteen-hole league')
  eq(cardIssue(c({ holesPlayed: 9, grossTotal: 44 }), { ...saturdays18, holes: 'either' }, winter), null, 'either takes nine')
  eq(cardIssue(c({ playedOn: '2026-11-10' }), saturdays18, winter),
    'Played on a Tuesday. This league counts Saturdays.', 'the wrong day, named')
  eq(cardIssue(c({ playedOn: '2026-11-10' }), { ...saturdays18, weekdays: undefined }, winter), null, 'any day takes a Tuesday')
  eq(cardIssue(c({ courseId: 'gi-ballyliffin' }), saturdays18, winter),
    'Not played at one of the league\'s venues.', 'another course, in a venues-only league')
  eq(cardIssue(c({ courseId: null }), saturdays18, winter),
    'Not played at one of the league\'s venues.', 'no course id cannot be shown to be a venue')
  eq(cardIssue(c({ courseId: 'gi-ballyliffin' }), { ...saturdays18, courses: 'any' }, winter), null, 'any course takes it')
  eq(cardIssue(c(), saturdays18, { ...winter, from: null, to: null }), null, 'no window: no date refusal')
  eq(cardIssue(c(), saturdays18, { ...winter, source: 'live' }),
    'This league does not read Golf Ireland cards.', 'a live league reads none')
  eq(cardIssue(c({ playedOn: '2026-10-31', holesPlayed: 9 }), saturdays18, winter),
    'Played before the league started.', 'several reasons: the first one a player would think of is given')
}

section('Scored both ways, the same day never counts twice')
{
  const c = normaliseCard(card())!
  const both: CardContext = { ...winter, source: 'both', liveDates: ['2026-11-07'] }
  eq(cardIssue(c, saturdays18, both), 'Already scored on Green Dot that day.',
    'a live card that day is the league day\'s own, and is the one kept')
  eq(cardIssue(c, saturdays18, { ...both, liveDates: ['2026-11-14'] }), null, 'a different day: counts')
  eq(cardIssue(c, saturdays18, { ...winter, liveDates: ['2026-11-07'] }), null,
    'a Golf Ireland-only league has no live cards to clash with')
}

// ─── What a sync does ──────────────────────────────────────────

section('Automatic: every card that counts is written, and one that stops counting goes')
{
  const cards = [
    normaliseCard(card({ cardId: 'sat-1' }))!,
    normaliseCard(card({ cardId: 'tue-1', playedOn: '2026-11-10' }))!,
    normaliseCard(card({ cardId: 'sat-2', playedOn: '2026-11-14' }))!,
  ]
  const plan = planImport({ stored: [], fetched: cards, rules: saturdays18, ctx: winter, complete: true })
  eq(plan.upsert.map(c => c.cardId), ['sat-1', 'sat-2'], 'the two Saturdays in, the Tuesday not')
  eq(plan.remove, [], 'nothing held, nothing to remove')

  const again = planImport({ stored: [{ cardId: 'sat-1' }, { cardId: 'sat-2' }], fetched: cards, rules: saturdays18, ctx: winter, complete: true })
  eq(again.upsert.map(c => c.cardId), ['sat-1', 'sat-2'], 'a second sync refreshes what is held')
  eq(again.remove, [], 'and removes nothing — a re-sync is a no-op in effect')

  const corrected = [cards[0], cards[1], normaliseCard(card({ cardId: 'sat-2', playedOn: '2026-11-14', holesPlayed: 9, grossTotal: 44 }))!]
  const fix = planImport({ stored: [{ cardId: 'sat-1' }, { cardId: 'sat-2' }], fetched: corrected, rules: saturdays18, ctx: winter, complete: true })
  eq(fix.remove, ['sat-2'], 'Golf Ireland corrected a card to nine holes: it leaves the league')

  const rulesChanged = planImport({ stored: [{ cardId: 'sat-1' }], fetched: cards, rules: { ...saturdays18, weekdays: [2] }, ctx: winter, complete: true })
  eq(rulesChanged.upsert.map(c => c.cardId), ['tue-1'], 'the rules moved to Tuesdays: the Tuesday comes in')
  eq(rulesChanged.remove, ['sat-1'], 'and the Saturday goes')
}

section('A card missing from the list goes only when the list was complete')
{
  const held = [{ cardId: 'sat-1' }, { cardId: 'withdrawn' }]
  const fetched = [normaliseCard(card({ cardId: 'sat-1' }))!]
  eq(planImport({ stored: held, fetched, rules: saturdays18, ctx: winter, complete: true }).remove, ['withdrawn'],
    'complete: a card Golf Ireland no longer lists was withdrawn, and goes')
  eq(planImport({ stored: held, fetched, rules: saturdays18, ctx: winter, complete: false }).remove, [],
    'cut short: it may be on the page not read, so nothing is removed')
}

section('Players choose: a sync refreshes what was put forward, and never puts anything forward itself')
{
  const picks: GolfIrelandRules = { ...saturdays18, entry: 'player_picks' }
  const cards = [normaliseCard(card({ cardId: 'sat-1' }))!, normaliseCard(card({ cardId: 'sat-2', playedOn: '2026-11-14' }))!]
  const plan = planImport({ stored: [{ cardId: 'sat-2' }], fetched: cards, rules: picks, ctx: winter, complete: true })
  eq(plan.upsert.map(c => c.cardId), ['sat-2'], 'only the card put forward is refreshed')
  eq(plan.remove, [], 'the other is simply not in the league')
  eq(planImport({ stored: [], fetched: cards, rules: picks, ctx: winter, complete: true }).upsert, [],
    'nothing put forward: nothing written')

  eq(pickIssue(cards[0], picks, winter, [{ cardId: 'sat-2' }]), null, 'a qualifying card can be put forward')
  eq(pickIssue(cards[1], picks, winter, [{ cardId: 'sat-2' }]), 'This round is already in the league.', 'not twice')
  eq(pickIssue(normaliseCard(card({ cardId: 'tue', playedOn: '2026-11-10' }))!, picks, winter, []),
    'Played on a Tuesday. This league counts Saturdays.', 'a card that does not qualify says why')
  eq(pickIssue(cards[0], saturdays18, winter, []), 'Every qualifying round counts in this league already.',
    'an automatic league has nothing to pick')
}

// ─── The whole path, against the fake ──────────────────────────

section('Fake Golf Ireland → checked cards → a plan, end to end')
{
  const raw = {
    m1: [
      card({ cardId: 'a', playedOn: '2026-11-07' }),
      card({ cardId: 'b', playedOn: '2026-11-14', courseId: 'gi-portsalon' }),
      card({ cardId: 'c', playedOn: '2026-11-21', holesPlayed: 12 }), // a misread
      card({ cardId: 'd', playedOn: '2026-10-24' }),                 // before the league
    ],
  }
  const run = async (gi: GolfIrelandClient, stored: { cardId: string }[]) => {
    const { tokens } = await gi.exchangeCode('m1', 'https://greendot.live/cb')
    const list = await gi.cards(tokens.accessToken, winter.from!, winter.to!)
    const fetched = list.cards.map(normaliseCard).filter((c): c is GolfIrelandCard => c !== null)
    return planImport({ stored, fetched, rules: saturdays18, ctx: winter, complete: list.complete })
  }
  pending.push(run(fakeGolfIreland(raw), [{ cardId: 'gone' }]).then(plan => {
    eq(plan.upsert.map(c => c.cardId), ['a', 'b'],
      'the two Saturday venue cards in the window; the misread and the October card never reach the plan')
    eq(plan.remove, ['gone'], 'and a card no longer listed goes')
  }))
  pending.push(run(fakeGolfIreland(raw, { pageSize: 1, brokenPage: true }), [{ cardId: 'gone' }]).then(plan => {
    eq(plan.remove, [], 'a page that failed: nothing removed')
  }))
}

// ─── Wiring ────────────────────────────────────────────────────

section('Until Golf Ireland\'s documentation arrives, the client refuses rather than guesses')
{
  const gi = golfIrelandClient({ clientId: 'id', clientSecret: 's', apiBase: 'https://api.example.ie' })
  let threw = false
  try { gi.authorizeUrl('https://greendot.live/cb', 'st') } catch (e) { threw = e instanceof GolfIrelandNotReady }
  ok(threw, 'the sign-in link refuses with GolfIrelandNotReady')
  pending.push(gi.cards('t', '2026-11-01', '2026-11-30').then(
    () => ok(false, 'cards should refuse'),
    e => ok(e instanceof GolfIrelandNotReady, 'reading cards refuses with GolfIrelandNotReady'),
  ))
  ok(!read('lib/golfIrelandClient.ts').includes('fetch('), 'and no request has been guessed at')
  ok(!/from ['"]\.\/golfIrelandClient['"]/.test(read('lib/golfIreland.ts')), 'the rules never import the client — they stay pure')
}

section('The signed state is one copy, shared with Strava')
{
  const now = Date.now()
  const st = signState({ tripCode: 'GX7K2P', playerId: 'p-1', expires: now + 60_000 }, 'gi-secret')
  eq(verifyState(st, 'gi-secret', now)?.playerId, 'p-1', 'signed and read back')
  eq(verifyState(st, 'strava-secret', now), null, 'a state signed for one provider is refused by the other')
  ok(strava.signState === signState && strava.verifyState === verifyState, 'Strava\'s are the same functions, not a copy')
  ok(!read('lib/strava.ts').includes('createHmac'), 'and lib/strava.ts no longer signs anything itself')
}

section('Weekdays are one copy')
{
  eq(weekdayOf('2026-11-07'), 6, '7 November 2026 is a Saturday')
  eq(weekdayOf('2026-02-29'), null, '2026 is no leap year')
  const league = read('lib/leagueSetup.ts')
  ok(!league.includes("'Sunday', 'Monday'"), 'the league setup no longer spells the days out')
}

section('Migration 056 closes its tables to the browser')
{
  const sql = read('supabase/migrations/20260101000056_golf_ireland.sql')
  for (const t of ['golf_ireland_members', 'golf_ireland_links', 'golf_ireland_cards']) {
    ok(sql.includes(`ALTER TABLE ${t}`) && new RegExp(`ALTER TABLE ${t}\\s+ENABLE ROW LEVEL SECURITY`).test(sql), `${t}: RLS on`)
  }
  ok(!/CREATE POLICY/i.test(sql), 'and no policy lets anybody in')
  ok(/CREATE TABLE IF NOT EXISTS/.test(sql) && /ADD COLUMN IF NOT EXISTS golf_ireland_id/.test(sql),
    'every statement is safe to re-paste')
  ok(sql.includes('CHECK (holes_played IN (9, 18))'), 'the database holds the 9-or-18 rule too')
  ok(sql.includes('gross_total IS NOT NULL OR stableford_points IS NOT NULL'), 'and the nothing-to-score rule')
}

// ─── Result ────────────────────────────────────────────────────

Promise.all(pending).then(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
})
