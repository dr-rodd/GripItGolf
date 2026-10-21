/**
 * Golf Ireland tests. Run with: npm run test:golf-ireland
 *
 * Golf Ireland's API is not in our hands yet, so everything here runs
 * against a fake that keeps the client's promises — club by club, the
 * access model docs/golf-ireland.md assumes. In order: the league's stored
 * rules, a club's access, finding yourself in the membership without
 * browsing it, when a link may be asked for and read, what a card must be
 * before anything trusts it, which cards count and why the others do not,
 * and what a sync adds and removes — then the wiring that holds it
 * together: the placeholder client refuses rather than guesses, signing is
 * one copy shared with Strava, and migration 056 closes its tables to the
 * browser.
 */

import fs from 'fs'
import {
  golfIrelandConfig, SCORE_SOURCES, scoresLive, readsGolfIreland,
  defaultRules, parseGolfIrelandRules, tidyWeekdays, describeWeekdays, describeRules,
  normaliseCard, leagueWindow, cardIssue, planImport, pickIssue, tidyClubs,
  roundForCard, cardsOnRounds, type RoundVenue, type HeldCard,
  clubIssue, parseMemberQuery, foldName, normaliseMember, maskMembershipNumber, memberMatches,
  packPick, unpackPick, linkIssue, linkReadable, describeLink,
  MAX_MEMBER_MATCHES, MEMBER_PICK_TTL_MS,
  type GolfIrelandRules, type CardContext, type GolfIrelandCard, type ClubAccess,
  type GolfIrelandMember, type MemberLink, type MemberQuery,
} from '../lib/golfIreland'
import {
  golfIrelandClient, GolfIrelandNotReady,
  type GolfIrelandClient, type RawCard, type RawMember, type ClubCredential,
} from '../lib/golfIrelandClient'
import { parseLeagueSetup, describeLeagueSetup } from '../lib/leagueSetup'
import { syncCards, describeSync, type SyncStore, type SyncResult } from '../lib/golfIrelandSync'
import { parseBracketSetup } from '../lib/bracketSetup'
import { signState, verifyState, sealJson, openJson } from '../lib/signedState'
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
// Club by club: each club has a credential, a membership and its members'
// cards, and pages the cards as the real one is assumed to. `brokenPage`
// makes the second page fail, which is how a list comes back incomplete.
// A credential only reaches its own club — the same wall the real one is
// assumed to keep.

type FakeClub = { name: string; active: boolean; members: RawMember[]; cards: Record<string, RawCard[]> }

function fakeGolfIreland(clubs: Record<string, FakeClub>, opts: { pageSize?: number; brokenPage?: boolean } = {}): GolfIrelandClient {
  const pageSize = opts.pageSize ?? 50
  const reach = (cred: ClubCredential) => {
    const club = clubs[cred.clubId]
    if (!club || cred.accessToken !== `key-${cred.clubId}`) throw new Error('401')
    return club
  }
  return {
    club: async cred => { const c = reach(cred); return { clubId: cred.clubId, name: c.name, active: c.active } },
    refresh: async cred => ({ ...cred, expiresAt: Date.now() + 3_600_000 }),
    searchMembers: async (cred, q) => {
      // Deliberately generous, like a real search box: a prefix on the
      // surname. What may be *shown* is memberMatches' call, not the API's.
      const c = reach(cred)
      return 'number' in q
        ? c.members.filter(m => String(m.memberId) === q.number)
        : c.members.filter(m => String(m.surname).toLowerCase().startsWith(q.surname.slice(0, 2).toLowerCase()))
    },
    member: async (cred, id) => reach(cred).members.find(m => m.memberId === id) ?? null,
    cards: async (cred, memberId, from, to) => {
      const mine = (reach(cred).cards[memberId] ?? [])
        .filter(c => typeof c.playedOn === 'string' && c.playedOn >= from && c.playedOn <= to)
      const pages = Math.ceil(mine.length / pageSize)
      if (opts.brokenPage && pages > 1) return { cards: mine.slice(0, pageSize), complete: false }
      return { cards: mine, complete: true }
    },
  }
}

const credFor = (clubId: string): ClubCredential => ({ clubId, accessToken: `key-${clubId}`, refreshToken: null, expiresAt: null })

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
const saturdays18: GolfIrelandRules = { clubs: ['gi-club-rosapenna'], entry: 'automatic', holes: 18, weekdays: [6], courses: 'venues' }

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
  eq(defaultRules(['gi-b', 'gi-a', 'gi-b']), { clubs: ['gi-a', 'gi-b'], entry: 'automatic', holes: 18, courses: 'any' },
    'the form starts on every 18-hole card, anywhere, for the clubs given')
  eq(parseGolfIrelandRules(defaultRules()), null, 'with no club the rules are not rules — nobody could ever be found')
  eq(parseGolfIrelandRules({ ...saturdays18, clubs: ['  ', 7] }), null, 'blank and non-string club ids are no clubs')
  eq(tidyClubs([' gi-b ', 'gi-a', 'gi-a']), ['gi-a', 'gi-b'], 'club ids: trimmed, once each, in order')
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
  eq(describeRules({ clubs: ['gi-a'], entry: 'player_picks', holes: 'either', courses: 'any' }),
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

// ─── A club's access ───────────────────────────────────────────

const rosapenna: ClubAccess = { clubId: 'gi-club-rosapenna', name: 'Rosapenna Golf Club', grantedAt: '2026-10-21T10:00:00Z', withdrawnAt: null }

section('A club is the unit of access, and its access stands until it withdraws')
{
  eq(clubIssue(rosapenna), null, 'a club that said yes: readable')
  eq(clubIssue(null), 'That club has not given Green Dot access to its members.', 'a club that never said yes: not')
  eq(clubIssue({ ...rosapenna, withdrawnAt: '2027-01-05T09:00:00Z' }),
    'Rosapenna Golf Club has withdrawn Green Dot\'s access to its members.', 'a club that withdrew, named')
}

// ─── Finding yourself ──────────────────────────────────────────

section('A search is a surname or a membership number, nothing looser')
{
  eq(parseMemberQuery("O'Grady"), { kind: 'surname', surname: "O'Grady" }, 'a surname')
  eq(parseMemberQuery('  1234567 '), { kind: 'number', number: '1234567' }, 'a membership number')
  eq(parseMemberQuery('ie-1234567'), { kind: 'number', number: 'IE1234567' }, 'a prefixed number, compacted')
  ok('issue' in parseMemberQuery('O'), 'one letter is a browse, not a search')
  ok('issue' in parseMemberQuery("O'"), 'nor is one letter and an apostrophe')
  ok('issue' in parseMemberQuery(''), 'nothing is not a search')
  ok('issue' in parseMemberQuery('123'), 'three digits is not a membership number')
  ok('issue' in parseMemberQuery('Grady 12'), 'a name with digits is neither')
}

section('Names meet however they were typed')
{
  eq(foldName("O'Grady"), foldName('OGrady'), "O'Grady and OGrady")
  eq(foldName('O Grady'), foldName('o’grady'), 'a space and a curly apostrophe')
  eq(foldName('Ó Gráda'), 'ograda', 'accents')
  ok(foldName('Mac Giolla') === foldName('MacGiolla'), 'and spaces inside a surname')
}

const members: RawMember[] = [
  { memberId: '1000001', clubId: 'gi-club-rosapenna', firstName: 'Ross', surname: "O'Grady", handicapIndex: 14.2 },
  { memberId: '1000002', clubId: 'gi-club-rosapenna', firstName: 'Dave', surname: 'OGrady', handicapIndex: 9.8 },
  { memberId: '1000003', clubId: 'gi-club-rosapenna', firstName: 'Mary', surname: 'Grant', handicapIndex: 22 },
  { memberId: '1000004', clubId: 'gi-club-portsalon', firstName: 'Seán', surname: "O'Grady", handicapIndex: 3 },
]
const checked = members.map(normaliseMember).filter((m): m is GolfIrelandMember => m !== null)

section('A member is trusted only once checked')
{
  eq(checked.length, 4, 'four sound members')
  eq(normaliseMember({ memberId: '1', clubId: 'c', surname: '' }), null, 'no surname: refused')
  eq(normaliseMember({ memberId: '', clubId: 'c', surname: 'X' }), null, 'no id: refused')
  eq(normaliseMember({ memberId: '1', surname: 'X' }), null, 'no club: refused')
  eq(normaliseMember({ memberId: '1', clubId: 'c', surname: 'X', handicapIndex: 99 })?.handicapIndex, null,
    'an absurd index costs the index, not the member')
}

section('A search shows only exact matches in the league\'s clubs, and only enough to recognise yourself')
{
  const q = (t: string) => parseMemberQuery(t) as MemberQuery
  const found = memberMatches(checked, q("o'grady"), ['gi-club-rosapenna'])
  eq(found.matches.map(m => m.name), ['Dave OGrady', "Ross O'Grady"],
    "both spellings of O'Grady at the league's club, sorted")
  ok(!found.matches.some(m => m.name.includes('Seán')), 'the Portsalon O\'Grady is not at the league\'s club, so not shown')
  eq(memberMatches(checked, q('Gr'), ['gi-club-rosapenna']).matches, [],
    'a partial surname never matches — "Gr" finds nobody, not Grant')
  eq(found.matches.map(m => m.masked), ['••••002', '••••001'], 'the number shows its last three, no more')
  eq(memberMatches(checked, q('1000003'), ['gi-club-rosapenna']).matches.map(m => m.name), ['Mary Grant'],
    'a membership number finds its member')
  eq(memberMatches(checked, q('1000004'), ['gi-club-rosapenna']).matches, [],
    'a number at another club finds nobody')
  ok(!JSON.stringify(found.matches).includes('14.2'), 'no handicap in a search result')

  const crowd = Array.from({ length: MAX_MEMBER_MATCHES + 1 }, (_, i) =>
    normaliseMember({ memberId: `20000${i}`, clubId: 'gi-club-rosapenna', firstName: `M${i}`, surname: 'Murphy' })!)
  eq(memberMatches(crowd, q('Murphy'), ['gi-club-rosapenna']), { matches: [], tooMany: true },
    'more than a handful: none shown, and the player is asked for their number instead')
  eq(memberMatches(crowd.slice(0, MAX_MEMBER_MATCHES), q('Murphy'), ['gi-club-rosapenna']).matches.length, MAX_MEMBER_MATCHES,
    'exactly the handful: all shown')

  eq(maskMembershipNumber('12'), '••', 'a short id hides everything')
}

section('A pick is sealed by the server, and only ever the member the search showed')
{
  const secret = 'gi-secret', now = Date.now()
  const pick = { tripCode: 'GX7K2P', playerId: 'p-1', clubId: 'gi-club-rosapenna', memberId: '1000001', expires: now + MEMBER_PICK_TTL_MS }
  const sealed = sealJson(packPick(pick), secret)
  eq(unpackPick(openJson(sealed, secret), now), pick, 'sealed, sent, opened: the same pick')
  eq(openJson(sealed, 'another-secret'), null, 'sealed with another secret: refused')
  const [body, sig] = sealed.split('.')
  const forged = Buffer.from(JSON.stringify({ ...packPick(pick), m: '1000002' })).toString('base64url')
  eq(openJson(`${forged}.${sig}`, secret), null, 'a different member under the same signature: refused')
  eq(openJson(`${body}.${sig}.x`, secret), null, 'anything appended: refused')
  eq(unpackPick(openJson(sealed, secret), now + MEMBER_PICK_TTL_MS + 1), null, 'ten minutes on: expired')
  eq(unpackPick({ t: 'GX7K2P', p: 'p-1', c: 'c', e: now + 1000 }, now), null, 'no member: not a pick')
}

// ─── Links ─────────────────────────────────────────────────────

section('A link is asked for once, for one member, by one player, with consent')
{
  const pick = { clubId: 'gi-club-rosapenna', memberId: '1000001' }
  const base = { playerId: 'p-1', pick, rules: saturdays18, club: rosapenna, links: [] as MemberLink[], consented: true }
  eq(linkIssue(base), null, 'consent ticked, the league\'s club, nobody linked: may ask')
  eq(linkIssue({ ...base, consented: false }), 'Tick the box to agree before linking.', 'no consent: no link')
  eq(linkIssue({ ...base, pick: { ...pick, clubId: 'gi-club-portsalon' } }),
    'That member is not at one of this league\'s clubs.', 'another club\'s member')
  eq(linkIssue({ ...base, club: { ...rosapenna, withdrawnAt: '2027-01-01T00:00:00Z' } }),
    'Rosapenna Golf Club has withdrawn Green Dot\'s access to its members.', 'a withdrawn club')
  const mine: MemberLink = { playerId: 'p-1', memberId: '1000001', clubId: 'gi-club-rosapenna', consentedAt: 'x', confirmedAt: null }
  eq(linkIssue({ ...base, links: [mine] }), 'You have already asked to link this member.', 'the same ask twice')
  eq(linkIssue({ ...base, pick: { ...pick, memberId: '1000002' }, links: [mine] }),
    'You are linked to another member. Unlink first.', 'one player, one member')
  eq(linkIssue({ ...base, playerId: 'p-2', links: [mine] }),
    'That member is already linked to somebody in this league.', 'one member, one player — nobody\'s cards count twice')
}

section('A link reads nothing until the organiser confirms it, and nothing once its club withdraws')
{
  const asked: MemberLink = { playerId: 'p-1', memberId: '1000001', clubId: 'gi-club-rosapenna', consentedAt: 'x', confirmedAt: null }
  const confirmed = { ...asked, confirmedAt: '2026-10-22T08:00:00Z' }
  ok(!linkReadable(asked, rosapenna), 'requested only: no card is read')
  ok(linkReadable(confirmed, rosapenna), 'confirmed: read')
  ok(!linkReadable(confirmed, { ...rosapenna, withdrawnAt: '2027-01-01T00:00:00Z' }), 'confirmed, club withdrawn: not read')
  ok(!linkReadable(confirmed, null), 'no club access at all: not read')
  eq(describeLink(asked, rosapenna), 'Waiting for the organiser to confirm it is you.', 'what the player sees while waiting')
  eq(describeLink(confirmed, rosapenna), 'Linked. Your Golf Ireland cards are read into the league.', 'and once confirmed')
  eq(describeLink(null, rosapenna), 'Not linked to Golf Ireland.', 'and with no link')
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

section('In a league of rounds, a card is the round played on its date at its venue')
{
  const rounds: RoundVenue[] = [
    { roundId: 'r1', date: '2026-11-07', venueId: 'gi-rosapenna' },
    { roundId: 'r2', date: '2026-11-14', venueId: 'gi-portsalon' },
    { roundId: 'r3', date: '2026-11-21', venueId: null }, // its venue not matched yet
  ]
  const c = (over: Partial<Record<keyof RawCard, unknown>> = {}) => normaliseCard(card(over))!
  eq(roundForCard(c(), rounds), 'r1', 'the right day at the right venue: round one')
  eq(roundForCard(c({ playedOn: '2026-11-14', courseId: 'gi-portsalon' }), rounds), 'r2', 'and round two the week after')
  eq(roundForCard(c({ playedOn: '2026-11-14' }), rounds), null, 'the right day, the wrong venue: no round')
  eq(roundForCard(c({ courseId: null }), rounds), null, 'no course id: no round')
  eq(roundForCard(c({ playedOn: '2026-11-21', courseId: 'gi-rosapenna' }), rounds), null,
    'a round whose venue is not matched takes no card')

  const series: CardContext = { ...winter, rounds }
  const anyDay = { ...saturdays18, courses: 'any' as const }
  eq(cardIssue(c(), anyDay, series), null, 'played as round one: counts')
  eq(cardIssue(c({ playedOn: '2026-11-28' }), anyDay, series), 'Not played on the day of a league round.',
    'a Saturday with no round on it does not count, whatever the weekday rule says')
  eq(cardIssue(c({ playedOn: '2026-11-14' }), anyDay, series), 'Not played at that round\'s venue.',
    'the round\'s day at another course')
  eq(cardIssue(c({ playedOn: '2026-11-21' }), anyDay, series), 'That round\'s venue is not matched to Golf Ireland yet.',
    'and a round nobody has matched says so — that one is ours to fix, not the player\'s')
  eq(cardIssue(c({ playedOn: '2026-11-28' }), anyDay, winter), null, 'without rounds, the window alone decides, as before')

  const held = (over: Partial<HeldCard>): HeldCard => ({
    playerId: 'p1', cardId: 'a', playedOn: '2026-11-07', courseId: 'gi-rosapenna',
    holesPlayed: 18, stablefordPoints: 34, grossTotal: 88, courseHandicap: 15, ...over,
  })
  eq(cardsOnRounds([held({}), held({ cardId: 'b', playedOn: '2026-11-28' })], rounds),
    [{ roundId: 'r1', playerId: 'p1', cardId: 'a', holes: 18, points: 34, gross: 88, courseHandicap: 15 }],
    'stored cards are placed on their rounds; one on no round is left off')
  eq(cardsOnRounds([held({ cardId: 'z', stablefordPoints: 40 }), held({ cardId: 'm', stablefordPoints: 20 })], rounds)
    .map(r => r.cardId), ['m'], 'two the same round: one kept, the same one on every screen — never the better')
  eq(cardsOnRounds([held({}), held({ playerId: 'p2' })], rounds).length, 2, 'one a player, not one a round')
  eq(cardsOnRounds([held({})], rounds.map(r => r.roundId === 'r1' ? { ...r, date: '2026-11-08' } : r)), [],
    'worked out on every read: re-date the round and the card follows the date')

  const plan = planImport({
    stored: [], complete: true, rules: anyDay, ctx: series,
    fetched: [c(), c({ cardId: 'c-2', playedOn: '2026-11-28' })],
  })
  eq(plan.upsert.map(x => x.cardId), ['c-1'], 'a sync in a league of rounds writes only the cards that are rounds')
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

section('Fake Golf Ireland, club by club → search → link → checked cards → a plan')
{
  const fake: Record<string, FakeClub> = {
    'gi-club-rosapenna': {
      name: 'Rosapenna Golf Club', active: true, members,
      cards: {
        '1000001': [
          card({ cardId: 'a', playedOn: '2026-11-07' }),
          card({ cardId: 'b', playedOn: '2026-11-14', courseId: 'gi-portsalon' }),
          card({ cardId: 'c', playedOn: '2026-11-21', holesPlayed: 12 }), // a misread
          card({ cardId: 'd', playedOn: '2026-10-24' }),                 // before the league
        ],
      },
    },
    'gi-club-portsalon': { name: 'Portsalon Golf Club', active: false, members: [], cards: {} },
  }
  const leagueClubs = saturdays18.clubs

  const run = async (gi: GolfIrelandClient, stored: { cardId: string }[]) => {
    // The player searches; the API answers generously; memberMatches decides.
    const raw = await gi.searchMembers(credFor('gi-club-rosapenna'), { surname: "O'Grady" })
    const shown = memberMatches(raw.map(normaliseMember).filter((m): m is GolfIrelandMember => m !== null),
      parseMemberQuery("O'Grady") as MemberQuery, leagueClubs)
    const me = shown.matches.find(m => m.name === "Ross O'Grady")!
    const link: MemberLink = { playerId: 'p-1', memberId: me.memberId, clubId: me.clubId, consentedAt: 'x', confirmedAt: 'y' }
    const status = await gi.club(credFor(link.clubId))
    const club: ClubAccess = { ...rosapenna, withdrawnAt: status.active ? null : 'now' }
    if (!linkReadable(link, club)) return null
    const list = await gi.cards(credFor(link.clubId), link.memberId, winter.from!, winter.to!)
    const fetched = list.cards.map(normaliseCard).filter((c): c is GolfIrelandCard => c !== null)
    return planImport({ stored, fetched, rules: saturdays18, ctx: winter, complete: list.complete })
  }
  pending.push(run(fakeGolfIreland(fake), [{ cardId: 'gone' }]).then(plan => {
    eq(plan?.upsert.map(c => c.cardId), ['a', 'b'],
      'the two Saturday venue cards in the window; the misread and the October card never reach the plan')
    eq(plan?.remove, ['gone'], 'and a card no longer listed goes')
  }))
  pending.push(run(fakeGolfIreland(fake, { pageSize: 1, brokenPage: true }), [{ cardId: 'gone' }]).then(plan => {
    eq(plan?.remove, [], 'a page that failed: nothing removed')
  }))
  pending.push(fakeGolfIreland(fake).club(credFor('gi-club-portsalon'))
    .then(st => ok(!st.active, 'a club that withdrew says so — the one answer that ends its access')))
  pending.push(fakeGolfIreland(fake).cards({ ...credFor('gi-club-portsalon'), accessToken: 'key-gi-club-rosapenna' }, '1000001', '2026-11-01', '2026-11-30')
    .then(() => ok(false, 'one club\'s key should not reach another club'), () => ok(true, 'one club\'s key never reaches another club\'s members')))
}

section('A pass over the league: each confirmed member\'s cards read, checked and written')
{
  const fake: Record<string, FakeClub> = {
    'gi-club-rosapenna': {
      name: 'Rosapenna Golf Club', active: true, members: [],
      cards: {
        m1: [card({ cardId: 'a', playedOn: '2026-11-07' }), card({ cardId: 'b', playedOn: '2026-11-14' })],
        m2: [card({ cardId: 'x', playedOn: '2026-11-07' }), card({ cardId: 'bad', playedOn: '2026-11-14', holesPlayed: 12 })],
      },
    },
  }
  // A table in memory, with a log of what was asked of it.
  const fakeStore = (held: Record<string, string[]>, opts: { noCred?: boolean; expires?: number } = {}) => {
    const db = new Map(Object.entries(held).map(([p, ids]) => [p, new Set(ids)]))
    const log: string[] = []
    const store: SyncStore = {
      credential: async clubId => opts.noCred ? null
        : { ...credFor(clubId), refreshToken: 'r', expiresAt: opts.expires ?? null },
      saveCredential: async c => { log.push(`saved ${c.clubId}`) },
      held: async p => [...(db.get(p) ?? [])].map(cardId => ({ cardId })),
      write: async (p, cards) => {
        if (!db.has(p)) db.set(p, new Set())
        for (const c of cards) db.get(p)!.add(c.cardId)
        log.push(`write ${p} ${cards.map(c => c.cardId).join(',')}`)
      },
      remove: async (p, ids) => { for (const id of ids) db.get(p)?.delete(id); log.push(`remove ${p} ${ids.join(',')}`) },
      synced: async p => { log.push(`synced ${p}`) },
    }
    return { store, db, log }
  }
  const pass = (client: GolfIrelandClient, store: SyncStore, now = Date.parse('2026-11-20T12:00:00Z')) => syncCards({
    client, store, now, rules: saturdays18, ctxFor: () => winter,
    targets: [
      { playerId: 'p1', memberId: 'm1', clubId: 'gi-club-rosapenna' },
      { playerId: 'p2', memberId: 'm2', clubId: 'gi-club-rosapenna' },
    ],
    window: { from: '2026-11-01', to: '2026-11-20' },
  })

  const one = fakeStore({ p1: ['gone'], p2: ['old'] })
  pending.push(pass(fakeGolfIreland(fake), one.store).then(r => {
    eq(r, { state: 'done', read: 2, added: 3, refreshed: 0, removed: 1, failed: [] },
      'two members read: three new cards, one gone')
    eq([...one.db.get('p1')!].sort(), ['a', 'b'], 'the first member\'s cards are the two Saturdays, and the withdrawn one is gone')
    eq([...one.db.get('p2')!].sort(), ['old', 'x'],
      'a list with a card that will not check removes nothing — that card may be the one held, unreadable this time')
    ok(one.log.includes('synced p1') && one.log.includes('synced p2'), 'each link is stamped as read')
  }))

  const again = fakeStore({ p1: ['a', 'b'] })
  pending.push(pass(fakeGolfIreland(fake), again.store).then(r => {
    ok(r.state === 'done' && r.added === 1 && r.refreshed === 2, 'read again: what is held is refreshed, never added twice')
  }))

  const cut = fakeStore({ p1: ['gone'] })
  pending.push(pass(fakeGolfIreland(fake, { pageSize: 1, brokenPage: true }), cut.store).then(() => {
    ok(cut.db.get('p1')!.has('gone'), 'a list cut short removes nothing')
  }))

  const soon = fakeStore({}, { expires: Date.parse('2026-11-20T12:00:30Z') })
  pending.push(pass(fakeGolfIreland(fake), soon.store).then(() => {
    eq(soon.log.filter(l => l.startsWith('saved')), ['saved gi-club-rosapenna'],
      'a credential about to run out is refreshed once for the club, and kept')
  }))

  const failing: GolfIrelandClient = { ...fakeGolfIreland(fake),
    cards: async (cred, memberId, from, to) => {
      if (memberId === 'm1') throw new Error('503')
      return fakeGolfIreland(fake).cards(cred, memberId, from, to)
    } }
  const flaky = fakeStore({ p1: ['a'] })
  pending.push(pass(failing, flaky.store).then(r => {
    ok(r.state === 'done' && r.failed.join() === 'p1' && r.read === 1, 'one member refused: counted, and the pass goes on')
    ok(flaky.db.get('p1')!.has('a'), '  …a refusal is a retry, never a deletion')
  }))

  const noKey = fakeStore({}, { noCred: true })
  pending.push(pass(fakeGolfIreland(fake), noKey.store).then(r => {
    ok(r.state === 'done' && r.failed.length === 2 && noKey.log.length === 0, 'a club with no credential reads nothing')
  }))

  const placeholder = fakeStore({ p1: ['a'] })
  pending.push(pass(golfIrelandClient({ clientId: 'i', clientSecret: 's', apiBase: 'https://x.ie' }), placeholder.store).then(r => {
    eq(r, { state: 'not_ready' }, 'the placeholder client: the pass stops at the first call and says so')
    eq(placeholder.log, [], '  …having written nothing')
  }))

  const said = (r: SyncResult, scope: 'mine' | 'all') => describeSync(r, scope)
  eq(said({ state: 'done', read: 1, added: 3, refreshed: 0, removed: 0, failed: [] }, 'mine'), '3 new rounds read in.', 'the button says what came in')
  eq(said({ state: 'done', read: 1, added: 0, refreshed: 2, removed: 1, failed: [] }, 'mine'),
    'No new rounds. One round no longer counts.', '  …and what went')
  eq(said({ state: 'done', read: 0, added: 0, refreshed: 0, removed: 0, failed: ['p1'] }, 'mine'),
    'Could not read your rounds just now — try again later.', '  …and a refusal calmly')
  ok(/not connected yet/.test(said({ state: 'not_ready' }, 'all')), '  …and that Golf Ireland is not connected yet')

  const route = read('app/api/golf-ireland/fetch/route.ts')
  ok(route.includes('cookiePlayer(admin, league.trip)') && route.includes("scope === 'mine'"),
    'Fetch my scores reads the player this phone claimed, and nobody else')
  const sync = read('app/api/golf-ireland/sync.ts')
  ok(sync.includes('linkReadable(l, clubOf.get(l.clubId))'), 'only confirmed links whose club stands are read')
  ok(sync.includes("league.setup.schedule === 'series' ? { rounds: venues }"),
    'a league of rounds checks every card against its rounds')
  ok(read('app/trip/[tripCode]/players/GolfIrelandLinkCard.tsx').includes("post('fetch', { scope: 'mine' })")
    && read('app/trip/[tripCode]/organiser/GolfIrelandRequests.tsx').includes("scope: 'all'"),
    'the player\'s button and the organiser\'s both go through it')
}

// ─── Wiring ────────────────────────────────────────────────────

section('Until Golf Ireland\'s documentation arrives, the client refuses rather than guesses')
{
  const gi = golfIrelandClient({ clientId: 'id', clientSecret: 's', apiBase: 'https://api.example.ie' })
  const cred = credFor('gi-club-rosapenna')
  const calls: [string, () => Promise<unknown>][] = [
    ['club', () => gi.club(cred)],
    ['refresh', () => gi.refresh(cred)],
    ['searchMembers', () => gi.searchMembers(cred, { surname: 'Grady' })],
    ['member', () => gi.member(cred, '1')],
    ['cards', () => gi.cards(cred, '1', '2026-11-01', '2026-11-30')],
  ]
  for (const [name, call] of calls) {
    pending.push(call().then(
      () => ok(false, `${name} should refuse`),
      e => ok(e instanceof GolfIrelandNotReady, `${name} refuses with GolfIrelandNotReady`),
    ))
  }
  const client = read('lib/golfIrelandClient.ts')
  ok(!client.includes('fetch('), 'and no request has been guessed at')
  ok(!/authorizeUrl|exchangeCode/.test(client), 'no player sign-in: access is the club\'s, not each player\'s')
  ok(!/from ['"]\.\/golfIrelandClient['"]/.test(read('lib/golfIreland.ts')), 'the rules never import the client — they stay pure')
}

section('Signing is one copy, shared with Strava')
{
  const now = Date.now()
  ok(signState({ tripCode: 'A', playerId: 'B', expires: 1 }, 's') === sealJson({ t: 'A', p: 'B', e: 1 }, 's'),
    'Strava\'s state is a seal like any other — the same bytes it always was')
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
  for (const t of ['golf_ireland_clubs', 'golf_ireland_members', 'golf_ireland_links', 'golf_ireland_cards']) {
    ok(sql.includes(`ALTER TABLE ${t}`) && new RegExp(`ALTER TABLE ${t}\\s+ENABLE ROW LEVEL SECURITY`).test(sql), `${t}: RLS on`)
  }
  ok(!/CREATE POLICY/i.test(sql), 'and no policy lets anybody in')
  ok(/CREATE TABLE IF NOT EXISTS/.test(sql) && /ADD COLUMN IF NOT EXISTS golf_ireland_id/.test(sql),
    'every statement is safe to re-paste')
  ok(sql.includes('CHECK (holes_played IN (9, 18))'), 'the database holds the 9-or-18 rule too')
  ok(sql.includes('gross_total IS NOT NULL OR stableford_points IS NOT NULL'), 'and the nothing-to-score rule')
  const memberTable = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS golf_ireland_members'), sql.indexOf('CREATE TABLE IF NOT EXISTS golf_ireland_links'))
  ok(!/token/.test(memberTable), 'a member carries no token — nobody signs in')
  ok(/club_id\s+text\s+NOT NULL REFERENCES golf_ireland_clubs/.test(memberTable), 'and belongs to a club')
  ok(/confirmed_at\s+timestamptz,/.test(sql), 'a link records the organiser\'s confirmation, empty while only requested')
  ok(sql.includes('DROP COLUMN IF EXISTS access_token'), 'an earlier per-player paste is brought into line')
}

section('No Golf Ireland branding: a plain link stands in for their logo')
{
  // Agreed October 2026: their logo waits for their written permission,
  // and every push is live. So nothing of theirs is in the repository, and
  // the Golf Ireland screens draw our own link (app/components/LinkMark.tsx).
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`])
  const named = walk('public').filter(f => /golf[-_ ]?ireland|\bgui\b/i.test(f))
  eq(named, [], 'no Golf Ireland file in public/')
  const mark = read('app/components/LinkMark.tsx')
  ok(!/<img|src=|data:image|url\((?!#)/.test(mark), 'the mark is drawn, never an image')
  ok(!/#[0-9a-f]{3,8}\b/i.test(mark.replace(/\/\*[\s\S]*?\*\//g, '')), 'and in our own colours, never a hex of theirs')
  const screens = [
    'app/components/GolfIrelandRulesForm.tsx',
    'app/trip/[tripCode]/players/GolfIrelandLinkCard.tsx',
    'app/trip/[tripCode]/organiser/GolfIrelandRequests.tsx',
    'app/components/GolfIrelandTour.tsx',
    'app/demo/golf-ireland/DemoClient.tsx',
  ]
  for (const f of screens) {
    const src = read(f)
    ok(src.includes("from '@/app/components/LinkMark'") || src.includes("from './LinkMark'"), `${f} carries the link`)
    ok(!/<img|<Image\b|\.png|\.svg|\.jpe?g|\.webp/.test(src), `${f} shows no image`)
  }
  const referencing = walk('app').filter(f => /\.(tsx?|css)$/.test(f))
    .filter(f => /golf[-_ ]?ireland[^'"]*\.(png|svg|jpe?g|webp)/i.test(read(f)))
  eq(referencing, [], 'nothing in app/ points at a Golf Ireland image')
}

section('The screens read the links only on the server')
{
  // The four tables are closed to the browser (migration 056); a client
  // component naming one would fail on every phone.
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`])
  const clientNaming = walk('app').filter(f => /\.tsx?$/.test(f))
    .filter(f => { const src = read(f); return /^'use client'/.test(src) && /from\('golf_ireland_/.test(src) })
  eq(clientNaming, [], 'no client component queries a Golf Ireland table')
}

section('A linked player carries the mark wherever the league names them')
{
  // The join screen, the hub's Players list and the leaderboard — each
  // fed from the server's one read of confirmed links, none asking unless
  // the league reads Golf Ireland.
  for (const f of [
    'app/trip/[tripCode]/players/PlayersClient.tsx',
    'app/trip/[tripCode]/page.tsx',
    'app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx',
  ]) ok(/<LinkedBadge\b/.test(read(f)), `${f} shows the mark`)
  for (const f of ['app/trip/[tripCode]/page.tsx', 'app/trip/[tripCode]/leaderboard/page.tsx']) {
    ok(read(f).includes('golfIrelandLinkedIds('), `${f} reads the links through the one helper`)
  }
  const helper = read('app/trip/[tripCode]/golfIreland.ts')
  const body = helper.slice(helper.indexOf('export async function golfIrelandLinkedIds'))
  ok(body.indexOf('readsGolfIreland') >= 0 && body.indexOf('readsGolfIreland') < body.indexOf('createAdminClient'),
    'and that helper asks nothing before it knows the league reads Golf Ireland')
}

section('The preview plays out linking by membership number, and reads and writes nothing')
{
  const tour = read('app/components/GolfIrelandTour.tsx')
  ok(/membership number/i.test(tour), 'the number is the way in')
  ok(/stage === 'board'/.test(tour) && /<LinkedBadge\b/.test(tour), 'and it ends on the mark beside a name on the board')
  ok(/stage === 'organiser'/.test(tour), 'with the organiser\'s confirmation on the way')
  ok(tour.includes('maskMembershipNumber('), 'a typed number is only ever shown back masked')
  ok(!/supabase|fetch\(/.test(tour), 'it reads and writes nothing')
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
