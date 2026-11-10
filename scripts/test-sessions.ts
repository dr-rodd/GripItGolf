/**
 * Sessions, Matches and the Dynamic Overall Leaderboard. Run with:
 * npm run test:sessions
 *
 * The rules (lib/sessions.ts), how the leaderboard model stores them
 * (lib/leaderboards.ts), and the guards that keep them apart from the
 * Knockout: no session board is a bracket, the Overall never governs a
 * round, and an event answering No is made exactly as before.
 */

import {
  type SessionDraft, type SessionFormat, MATCH_FORMATS, MATCHES_READY,
  resolvedFormats, usedFormats, sessionsIssue, inRunningOrder, sessionBoard, overallBoard,
  feedFor, defaultPositionPoints, DEFAULT_MATCH_FEED, matchPoints, formatPoints, targetLine,
  parseOverallRules, parseFeed, sessionBoardFor, overallOf, overallTabs, allOneFormat,
  describeFormat, sameFormat, isSessionBoard, matchSidesIssue, matchLine, nextSlot, defaultTeeIndex,
  withSessionFormat, withSessionName, withSessionFeed, withOverallOn, withOverallOff, formatOfBoard,
} from '../lib/sessions'
import { parseLeaderboards, hasMatchplay, boardTitle, boardFacts, type Leaderboard } from '../lib/leaderboards'
import { governingBoard, isPairs } from '../lib/partnerships'
import { buildRows, type RowContext, type ResolvedScore, type RowHole } from '../lib/boardRows'
import { overallRows } from '../lib/overallRows'
import { playSessionCard, sessionResult, type CardHole } from '../lib/matchCard'
import { foursomesStrokes } from '../lib/matchArrangements'
import { eventFourthTab, fourthTab } from '../lib/eventHub'
import { faceOff, tickFills, matchStatus, matchPool, sessionPool, MAX_TICKS } from '../lib/faceOff'
import { defaultMatchSlots, matchSlotsFor, withSessionSlots, MAX_MATCH_SLOTS, slotFloor, itinerarySessions, sessionSlotCount } from '../lib/sessions'
import { buildMatchSheets, clocksOf } from '../app/golf/[root]/[tripCode]/session/matchSheetPlan'
import fs from 'fs'

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

const stableford: SessionFormat = { kind: 'stroke', audience: 'individual', scoring: 'stableford' }
const fourballStroke: SessionFormat = { kind: 'stroke', audience: 'team', scoring: 'stableford', teamFormat: 'better_ball', handicapAllowance: 85 }
const singles: SessionFormat = { kind: 'matches', match: 'singles' }
const draft = (key: string, dayIndex: number, format: SessionDraft['format'], courseId = 'c1'): SessionDraft =>
  ({ key, dayIndex, courseId, format })

// ─── Formats ───────────────────────────────────────────────────

section('A session’s format')
{
  const sessions = [draft('a', 0, stableford), draft('b', 0, 'same'), draft('c', 1, fourballStroke), draft('d', 2, 'tbc')]
  eq(resolvedFormats(sessions), [stableford, stableford, fourballStroke, null],
    '"Same as Session 1" resolves to Session 1’s format; TBC is null')
  eq(usedFormats(sessions).length, 2, 'the used formats are each distinct format once — Change format’s one-tap picks')
  eq(sessionsIssue(sessions), null, 'a running order with a TBC session can be saved')
  eq(sessionsIssue([]), 'Add the first session.', 'none at all cannot')
  ok(/venue/.test(sessionsIssue([draft('a', 0, stableford, '')]) ?? ''), 'a session with no venue says so')
  ok(sameFormat(stableford, { ...stableford }), 'two equal formats are the same')
  ok(!sameFormat(stableford, fourballStroke), 'two different are not')
  eq(describeFormat(fourballStroke), 'Team better ball · Stableford · 85% handicap', 'a format reads as facts')
  eq(describeFormat(null), 'Format TBC', '  …and TBC says so')
  eq(allOneFormat([draft('a', 0, stableford), draft('b', 1, 'same')]), stableford, 'every session the same format is noticed (the hint)')
  eq(allOneFormat(sessions), null, '  …and not when they differ')
  eq(inRunningOrder([draft('x', 2, stableford), draft('y', 0, stableford), draft('z', 0, stableford)]).map(s => s.key),
    ['y', 'z', 'x'], 'the running order is by day, then as listed')
}

section('Matches, foursomes included, can be picked (stages 5 and 7)')
{
  ok(MATCHES_READY, 'Matches are pickable now the card scores them')
  ok(MATCH_FORMATS.every(m => m.available), '  …singles, fourball and foursomes alike (D43, built at stage 7)')
  eq(sessionsIssue([draft('a', 0, { kind: 'matches', match: 'foursomes' })]), null, 'a foursomes session can be saved')
  eq(sessionBoard({ kind: 'matches', match: 'foursomes' }, 'r', 'day:r').handicapAllowance, 50,
    '  …at the usual 50% unless the organiser says otherwise')
}

section('Foursomes: half the partners’ combined handicaps, rounded once')
{
  const tee = { slope: 113, course_rating: 72, par: 72 }
  const p = (playerId: string, index: number) => ({ playerId, index, tee })
  // A: 10.4 + 5.3 = 15.7 → 50% = 7.85 → 8. B: 20.6 + 3.3 = 23.9 → 11.95 → 12.
  eq(foursomesStrokes([{ key: 'A', players: [p('a1', 10.4), p('a2', 5.3)] }, { key: 'B', players: [p('b1', 20.6), p('b2', 3.3)] }], 50),
    [{ key: 'A', playing: 8, receives: 0 }, { key: 'B', playing: 12, receives: 4 }],
    'each side plays off half its combined handicap; the higher receives the difference')
  // 5.3 and 5.3: halves rounded apart are 3 + 3 = 6; the half of the sum is 5.3 → 5.
  eq(foursomesStrokes([{ key: 'A', players: [p('a1', 5.3), p('a2', 5.3)] }, { key: 'B', players: [p('b1', 0), p('b2', 0)] }], 50)?.[0].playing, 5,
    '  …the sum taken first and rounded once, never two halves rounded apart')
  eq(foursomesStrokes([{ key: 'A', players: [{ playerId: 'x', index: null, tee }] }, { key: 'B', players: [p('b', 1)] }], 50), null,
    '  …and nothing while a handicap is pending')
  const reader = read('app/golf/[root]/[tripCode]/session/sessionMatches.ts')
  ok(reader.includes("format === 'foursomes'") && reader.includes('foursomesStrokes(['),
    'a foursomes match is scored one ball a side, off the combined figure')
}

// ─── Boards ────────────────────────────────────────────────────

section('The boards a session plays, and the Overall')
{
  const s1 = sessionBoard(stableford, 'r1', 'day:r1')
  eq(s1, { id: 'lb-session-r1', audience: 'individual', competition: 'league', scoring: 'stableford', combine: 'total', roundIds: ['r1'], session: true },
    'a stroke session is an ordinary league board scoped to its round, marked a session')
  const s2 = sessionBoard(fourballStroke, 'r2', 'day:r2')
  eq([s2.teamSet, s2.teamFormat, s2.handicapAllowance], ['day:r2', 'better_ball', 85], 'a team session plays on its round’s own sheet, with its allowance')
  const m = sessionBoard({ kind: 'matches', match: 'fourball' }, 'r3', 'day:r3')
  eq([m.competition, m.audience, m.matchFormat, m.teamSet], ['matches', 'team', 'fourball', 'day:r3'], 'a fourball session is Matches between pairs')
  const overall = overallBoard({ ranks: 'tags', feeds: { r1: { kind: 'position', points: [2, 1] } } })
  eq([overall.competition, overall.audience, overall.teamSet], ['overall', 'team', 'main'], 'a tags Overall reads the tag sheet')

  const stored = parseLeaderboards(JSON.parse(JSON.stringify([overall, s1, s2, m])))
  eq(stored.length, 4, 'all four survive a round trip through storage')
  eq(stored.map(b => b.competition), ['overall', 'league', 'league', 'matches'], '  …each its own kind')
  ok(stored.every(b => b.competition === 'overall' || isSessionBoard(b)), '  …the sessions still marked sessions')
  eq(stored[0].overall, { ranks: 'tags', feeds: { r1: { kind: 'position', points: [2, 1] } } }, '  …the Overall’s rules intact')
  ok(!hasMatchplay(stored), 'no session board, and not the Overall, is a bracket (D34)')
  eq(sessionBoardFor(stored, 'r2')?.id, 'lb-session-r2', 'a session’s board is found by its round')
  eq(sessionBoardFor(stored, 'r9'), null, '  …and a TBC session has none')
  eq(overallOf(stored)?.id, 'lb-overall', 'the event’s Overall is found')
  eq(overallTabs([...stored, { id: 'x', audience: 'individual', competition: 'league', scoring: 'strokes', combine: 'total' }]).map(b => b.id),
    ['lb-overall', 'x'], 'the leaderboard’s tabs are the Overall, then secondary boards — never a session’s own')
  eq(boardTitle(stored[0]), 'Overall', 'the Overall is called Overall on screen (D37)')
  eq(boardTitle(stored[3]), 'Fourball matches', 'a Matches board names its format')
  eq(boardFacts(stored[3]), ['Fourball', 'Matches', '90% handicap'], '  …in facts, a fourball at its usual 90%')
  eq(buildRows(stored[0], { players: [], teams: [], memberships: [], holes: [], rounds: [], resolved: [], hcpFor: new Map(), liveRoundIds: new Set(), livePlayerIds: new Set(), legacyTeamScoring: null }),
    [], 'buildRows never reads the Overall as a table of cards')
  eq(parseLeaderboards([{ ...overall, overall: { ranks: 'nobody' } }]), [], 'an Overall with rules that do not read is dropped')
  eq(parseLeaderboards([{ ...m, roundIds: ['a', 'b'] }]), [], 'a Matches board must be one round’s')
  eq(parseLeaderboards([overall, { ...overall, id: 'second' }]).length, 1, 'one Overall an event')
}

section('The Overall ranks; it never governs a round')
{
  const overall = overallBoard({ ranks: 'individuals' })
  eq(governingBoard([overall], 'r1'), null, 'a TBC session takes no rules from the Overall')
  const m = sessionBoard({ kind: 'matches', match: 'fourball' }, 'r1', 'day:r1')
  eq(governingBoard([overall, m], 'r1')?.id, m.id, 'a Matches session governs its own round')
  ok(isPairs(m), '  …and a fourball session’s partnerships are pairs')
  const s = sessionBoard(stableford, 'r2', 'day:r2')
  eq(governingBoard([overall, m, s], 'r2')?.id, s.id, 'a stroke session governs its own round too')
}

// ─── Feeds ─────────────────────────────────────────────────────

section('How a session feeds the Overall')
{
  const rules = { ranks: 'tags' as const }
  const strokeBoard = sessionBoard(stableford, 'r1', 'day:r1')
  const matchBoard = sessionBoard(singles, 'r2', 'day:r2')
  eq(feedFor(rules, 'r1', strokeBoard, 2), { kind: 'position', points: [2, 1] }, 'a stroke session defaults to points by position')
  eq(feedFor(rules, 'r2', matchBoard, 2), DEFAULT_MATCH_FEED, 'a Matches session defaults to 1 / ½ / 0 (D38)')
  eq(feedFor(rules, 'r3', null, 2), { kind: 'none' }, 'a TBC session counts nothing')
  eq(feedFor({ ranks: 'tags', feeds: { r2: { kind: 'position', points: [5] } } }, 'r2', matchBoard, 2), DEFAULT_MATCH_FEED,
    'a stored feed that no longer fits the format reads as its default')
  eq(feedFor({ ranks: 'tags', feeds: { r1: { kind: 'none' } } }, 'r1', strokeBoard, 2), { kind: 'none' }, '"Doesn’t count" is kept')
  eq(defaultPositionPoints(6), [6, 5, 4, 3, 2, 1], 'the default table is the field down to one')
  eq([matchPoints(DEFAULT_MATCH_FEED, 'win'), matchPoints(DEFAULT_MATCH_FEED, 'half'), matchPoints(DEFAULT_MATCH_FEED, 'loss')], [1, 0.5, 0],
    'a match pays 1, ½ or 0')
  eq([formatPoints(14.5), formatPoints(0.5), formatPoints(3)], ['14½', '½', '3'], 'points are written as golf writes them')
  eq(targetLine([{ feed: DEFAULT_MATCH_FEED, matches: 4 }, { feed: DEFAULT_MATCH_FEED, matches: 4 },
    { feed: DEFAULT_MATCH_FEED, matches: 4 }, { feed: DEFAULT_MATCH_FEED, matches: 4 }, { feed: DEFAULT_MATCH_FEED, matches: 12 }], 2),
    '14½ to win', 'a Ryder Cup of 28 matches is 14½ to win')
  eq(targetLine([{ feed: DEFAULT_MATCH_FEED, matches: 4 }, { feed: { kind: 'position', points: [2, 1] }, matches: 0 }], 2), null,
    'no target line when a stroke session could move it')
  eq(parseFeed({ kind: 'match', win: 1, half: 0.5, loss: 0 }), DEFAULT_MATCH_FEED, 'a match feed reads back with its half')
  eq(parseOverallRules({ ranks: 'individuals', feeds: { r1: { kind: 'bogus' } }, names: { r1: '  Friday foursomes ' } }),
    { ranks: 'individuals', names: { r1: 'Friday foursomes' } }, 'a bad feed is dropped, never the rules; names are tidied')
}

// ─── The Overall's rows ────────────────────────────────────────

const holes: RowHole[] = Array.from({ length: 9 }, (_, i) => ({ id: `h${i + 1}`, hole_number: i + 1, par: 4, stroke_index: i + 1, course_id: 'c1' }))
const players = ['p1', 'p2', 'p3', 'p4'].map((id, i) => ({ id, name: ['Ann', 'Bea', 'Cal', 'Dan'][i], handicap: 0, gender: 'M' }))
/** A card at scratch: gross per hole. */
const card = (roundId: string, playerId: string, gross: number, live = false): ResolvedScore[] =>
  holes.map(h => ({ playerId, roundId, holeId: h.id, holeNumber: h.hole_number, gross,
    points: Math.max(0, h.par + 2 - gross), noReturn: false, live }))
const tagTeams = [
  { id: 'eu', name: 'Europe', color: '#1d4ed8', team_set: 'main' },
  { id: 'us', name: 'USA', color: '#b91c1c', team_set: 'main' },
]
const tagMembers = [
  { team_id: 'eu', team_set: 'main', player_id: 'p1' }, { team_id: 'eu', team_set: 'main', player_id: 'p2' },
  { team_id: 'us', team_set: 'main', player_id: 'p3' }, { team_id: 'us', team_set: 'main', player_id: 'p4' },
]
function ctxOf(resolved: ResolvedScore[], extra: Partial<RowContext> = {}): RowContext {
  const hcpFor = new Map<string, number>()
  for (const r of ['r1', 'r2']) for (const p of players) hcpFor.set(`${r}:${p.id}`, 0)
  return {
    players, teams: tagTeams, memberships: tagMembers, holes,
    rounds: [{ id: 'r1', round_number: 1 }, { id: 'r2', round_number: 2 }],
    resolved, hcpFor, liveRoundIds: new Set(), livePlayerIds: new Set(), legacyTeamScoring: null,
    ...extra,
  }
}

section('The Overall, from stroke sessions: points by position')
{
  const s1 = sessionBoard(stableford, 'r1', 'day:r1')
  const s2 = sessionBoard({ kind: 'stroke', audience: 'individual', scoring: 'strokes' }, 'r2', 'day:r2')
  // Session 1 (Stableford): Ann 27, Bea 18, Cal 18, Dan 9. Session 2 (strokes): Dan 27, Cal 36, Bea 45, Ann 45.
  const resolved = [
    ...card('r1', 'p1', 3), ...card('r1', 'p2', 4), ...card('r1', 'p3', 4), ...card('r1', 'p4', 5),
    ...card('r2', 'p4', 3), ...card('r2', 'p3', 4), ...card('r2', 'p2', 5), ...card('r2', 'p1', 5),
  ]
  const indiv = overallBoard({ ranks: 'individuals', feeds: { r1: { kind: 'position', points: [4, 3, 2, 1] }, r2: { kind: 'position', points: [4, 3, 2, 1] } } })
  const rows = overallRows(indiv, [indiv, s1, s2], ctxOf(resolved))
  const by = new Map(rows.map(r => [r.id, r]))
  eq(by.get('p1')?.perRound, { r1: 4, r2: 1.5 }, 'Ann won Session 1 (4) and shared last in Session 2 (2 and 1 split)')
  eq(by.get('p2')?.perRound, { r1: 2.5, r2: 1.5 }, 'Bea shared second in Session 1 (3 and 2 split)')
  eq(by.get('p4')?.perRound, { r1: 1, r2: 4 }, 'a strokes session is won by the fewest')
  eq(rows.map(r => [r.name, r.total, r.place]), [['Ann', 5.5, 1], ['Cal', 5.5, 1], ['Dan', 5, 3], ['Bea', 4, 4]],
    'the Overall is the sum, and level entrants share the place (ties shared)')

  const tags = overallBoard({ ranks: 'tags', feeds: { r1: { kind: 'position', points: [1, 0] }, r2: { kind: 'none' } } })
  const tagRowsOut = overallRows(tags, [tags, s1, s2], ctxOf(resolved))
  // Europe's best two cards in Session 1: 27 + 18 = 45; USA's: 18 + 9 = 27.
  eq(tagRowsOut.map(r => [r.name, r.total]), [['Europe', 1], ['USA', 0]], 'a tags Overall reads a stroke session as the tag’s best two cards')
  eq(tagRowsOut[0].perRound, { r1: 1 }, '  …and a session set not to count pays nothing')

  const tbc = overallBoard({ ranks: 'individuals' })
  const rowsTbc = overallRows(tbc, [tbc, s1], ctxOf(resolved))
  ok(rowsTbc.every(r => r.perRound.r2 === undefined), 'a TBC session (no board) counts nothing')
  eq(rowsTbc.find(r => r.id === 'p1')?.perRound.r1, 4, '  …while a set one pays its default table (the field down to one)')

  const casual = overallRows(indiv, [indiv, s1, s2], { ...ctxOf(resolved), rounds: [{ id: 'r1', round_number: 1, casual: true }, { id: 'r2', round_number: 2 }] })
  ok(casual.every(r => r.perRound.r1 === undefined), 'a round that does not count is in no board, the Overall included')
}

section('The Overall, from Matches: points per match to the tag')
{
  const m1 = sessionBoard({ kind: 'matches', match: 'singles' }, 'r1', 'day:r1')
  const tags = overallBoard({ ranks: 'tags' })
  const sessionMatches = [
    { id: 'm1', roundId: 'r1', slot: 0, sideA: ['p1'], sideB: ['p3'], result: 'a' as const },
    { id: 'm2', roundId: 'r1', slot: 1, sideA: ['p2'], sideB: ['p4'], result: 'halved' as const },
    { id: 'm3', roundId: 'r1', slot: 2, sideA: ['p2'], sideB: ['p3'], result: null, live: true },
  ]
  const rows = overallRows(tags, [tags, m1], ctxOf([], { sessionMatches }))
  eq(rows.map(r => [r.name, r.total]), [['Europe', 1.5], ['USA', 0.5]], 'a win is 1 to the tag, a half ½ to each (D38)')
  ok(rows.every(r => r.isLive && r.liveRounds?.includes('r1')), 'a match in play shows both tags live')
  const indiv = overallBoard({ ranks: 'individuals' })
  const rowsI = overallRows(indiv, [indiv, m1], ctxOf([], { sessionMatches }))
  eq(rowsI.find(r => r.id === 'p1')?.total, 1, 'an individual Overall pays each player on the side')
  const mixed = [{ id: 'mx', roundId: 'r1', slot: 0, sideA: ['p1', 'p3'], sideB: ['p2', 'p4'], result: 'a' as const }]
  eq(overallRows(tags, [tags, m1], ctxOf([], { sessionMatches: mixed })).map(r => r.total), [0, 0],
    'a side of mixed tags counts for nobody')
}

section('Session formats after creation — nothing deleted without asking, no score touched')
{
  const overall = overallBoard({ ranks: 'individuals' })
  const s1 = sessionBoard(stableford, 'r1', 'day:r1')
  const primary: Leaderboard = { id: 'p', audience: 'individual', competition: 'league', scoring: 'strokes', combine: 'total' }
  let boards: Leaderboard[] = [overall, s1, primary]
  boards = withSessionFormat(boards, 'r1', fourballStroke, 'day:r1')
  eq(formatOfBoard(sessionBoardFor(boards, 'r1')!), fourballStroke, 'a session’s format is changed in place')
  eq(boards.length, 3, '  …one board for it still')
  boards = withSessionFormat(boards, 'r1', null, 'day:r1')
  eq(sessionBoardFor(boards, 'r1'), null, 'Make it TBC takes the session’s board away')
  boards = withSessionName(boards, 'r2', ' Saturday singles ')
  eq(overallOf(boards)?.overall?.names, { r2: 'Saturday singles' }, 'a session is renamed on the Overall')
  boards = withSessionName(boards, 'r2', '')
  eq(overallOf(boards)?.overall?.names, undefined, '  …and a blank name goes back to "Session n"')
  boards = withSessionFeed(boards, 'r1', { kind: 'none' })
  eq(overallOf(boards)?.overall?.feeds, { r1: { kind: 'none' } }, 'a feed is set on the Overall')
  eq(overallOf(boards)?.id, 'lb-overall', '  …the Overall keeping its id')

  const on = withOverallOn([primary], ['r1', 'r2'], 'individuals', id => `day:${id}`)
  eq(on.map(b => b.id), ['lb-overall', 'p', 'lb-session-r1', 'lb-session-r2'],
    'turning it on makes every round a session in the event’s format, its boards kept beside the Overall')
  eq(formatOfBoard(sessionBoardFor(on, 'r2')!), { kind: 'stroke', audience: 'individual', scoring: 'strokes' }, '  …the primary board’s format')
  eq(withOverallOff(on).map(b => b.id), ['p', 'lb-session-r1', 'lb-session-r2'],
    'turning it off takes the Overall and nothing else')
  eq(withOverallOn(on, ['r1'], 'tags', id => id), on, 'turning on what is on changes nothing')
}

section('A session match: eighteen holes, and a half is a result (D44)')
{
  const holes18: CardHole[] = Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, par: 4, strokeIndex: i + 1 }))
  const A = { id: 'A', players: [{ id: 'pa', gender: 'M', receives: 0 }] }
  const B = { id: 'B', players: [{ id: 'pb', gender: 'M', receives: 0 }] }
  const card = (a: number[], b: number[]) => new Map([
    ['pa', new Map(a.map((g, i) => [i + 1, g]))], ['pb', new Map(b.map((g, i) => [i + 1, g]))],
  ])
  const level = playSessionCard(holes18, A, B, card(Array(18).fill(4), Array(18).fill(4)))
  ok(level.state.settled && level.state.halved, 'all square after 18 is settled, and halved')
  eq(level.holes.length, 18, '  …with no 19th hole')
  eq(sessionResult(level.state), { result: 'halved', margin: 'A/S' }, '  …and writes a half')
  const won = playSessionCard(holes18, A, B, card([3, 3, 3, ...Array(13).fill(4)], Array(16).fill(4)))
  eq(sessionResult(won.state), { result: 'a', margin: '3&2' }, 'a match won early writes its side and margin')
  const going = playSessionCard(holes18, A, B, card([3, 4], [4, 4]))
  ok(!going.state.settled && sessionResult(going.state) === null, 'a match still in play writes nothing')
}

section('Setting a match’s sides')
{
  const tagOf = (id: string) => ({ e1: 'eu', e2: 'eu', u1: 'us', u2: 'us', x: null } as Record<string, string | null>)[id] ?? null
  eq(matchSidesIssue('singles', ['e1'], ['u1'], [], tagOf, true), null, 'one each side, one tag each: a match')
  ok(/One player/.test(matchSidesIssue('singles', ['e1', 'e2'], [], [], tagOf) ?? ''), 'singles is one a side')
  ok(/same tag/.test(matchSidesIssue('singles', ['e1'], ['e2'], [], tagOf) ?? ''), 'two from the same tag are not a match')
  ok(/one tag/.test(matchSidesIssue('fourball', ['e1', 'u1'], [], [], tagOf) ?? ''), 'a side is one tag when tags are in play')
  ok(/tag first/.test(matchSidesIssue('singles', ['x'], [], [], tagOf) ?? ''), 'an untagged player cannot go on a side')
  ok(/already has a match/.test(matchSidesIssue('singles', ['e1'], [], [{ sideA: ['e1'], sideB: [] }], tagOf) ?? ''),
    'nobody plays twice in a session')
  eq(matchSidesIssue('fourball', ['e1', 'e2'], ['u1'], [], null), null, 'without tags anybody may pair, and a side may be part-filled')
  ok(/Both sides/.test(matchSidesIssue('fourball', ['e1', 'e2'], ['u1'], [], null, true) ?? ''), '  …but not a whole match')
  eq(nextSlot([{ slot: 0 }, { slot: 2 }]), 1, 'the next free row in the order of play')
  eq([defaultTeeIndex(3), defaultTeeIndex(1), defaultTeeIndex(0)], [1, 0, -1], 'the default tee is the middle of a player’s own')
  const m = { id: 'm', roundId: 'r', slot: 0, sideA: ['e1'], sideB: ['u1'] }
  eq(matchLine({ ...m, result: 'a', margin: '3&2' }, { a: 'Europe', b: 'USA' }), 'Europe won 3&2', 'a result reads "Europe won 3&2"')
  eq(matchLine({ ...m, result: 'halved', margin: 'A/S' }, { a: 'Europe', b: 'USA' }), 'Halved', '  …a half "Halved"')
  eq(matchLine({ ...m, result: null, live: true, leader: 'b', progress: '2 up thru 11' }, { a: 'Europe', b: 'USA' }), 'USA 2 up thru 11',
    '  …and a match in play its standing')
  eq(matchLine({ ...m, result: null }, { a: 'Europe', b: 'USA' }), 'Not started', '  …and one not begun says so')
}

section('Knockout and Matches never meet (D34)')
{
  const sessionFiles = [
    'lib/sessionMatchStore.ts', 'app/golf/[root]/[tripCode]/session/sessionMatches.ts',
    'app/golf/[root]/[tripCode]/session/MatchesSheet.tsx',
    'app/golf/[root]/[tripCode]/session/[roundId]/match/[slot]/card/page.tsx',
    'app/golf/[root]/[tripCode]/order/page.tsx', 'lib/overallRows.ts',
  ]
  for (const f of sessionFiles) ok(!read(f).includes('matchplay_matches'), `${f} never reads the bracket’s table`)
  const bracketFiles = [
    'lib/drawStore.ts', 'lib/matchplayStore.ts', 'app/golf/[root]/[tripCode]/knockout.ts',
    'app/golf/[root]/[tripCode]/matchplay/page.tsx', 'app/api/match/dueDraws.ts',
  ]
  for (const f of bracketFiles) ok(!read(f).includes('session_matches'), `${f} never reads a session’s matches`)
  const card = read('app/golf/[root]/[tripCode]/match/[matchId]/card/MatchCardClient.tsx')
  ok(card.includes("session ? 'session_match_scores' : 'match_scores'") && card.includes("from('session_matches')"),
    'the one match card serves both, a session’s writing its own tables')
  ok(card.includes('playSessionCard(baseHoles') && card.includes('stored.winner === null'),
    '  …a session’s card never going down the 19th, finalising a half like a win')
  ok(read('supabase/migrations/20260101000067_session_matches.sql').includes('REFERENCES rounds(id)'),
    'migration 067: a session match belongs to its round, never to a draw')
  ok(!hasMatchplay([sessionBoard({ kind: 'matches', match: 'singles' }, 'r', 'day:r')]), 'a Matches board is not a draw to any bracket reader')
}

section('Tee times as matches, and the order of play (D40–D42)')
{
  eq(eventFourthTab({ teeTimes: false, stats: true, orderOfPlay: true }), 'orderOfPlay',
    'without tee times a Matches session’s event has the Order of play as its fourth tab')
  eq(eventFourthTab({ teeTimes: true, stats: true, orderOfPlay: true }), 'teeTimes', '  …with tee times, the Tee times tab is where its matches are set')
  eq(eventFourthTab({ teeTimes: false, stats: true }), 'stats', '  …and every other event is as it was')
  const bar = read('app/components/TabBar.tsx')
  ok(bar.includes("label: 'Order of play'") && bar.includes("fourth === 'orderOfPlay' ? [ORDER_ITEM]"), 'the bar carries Order of play in that place')
  const page = read('app/golf/[root]/[tripCode]/teesheet/page.tsx')
  ok(page.includes("!!overall && sessionBoardFor(boards, roundId)?.competition === 'matches'") && page.includes('rounds={sheetRounds}'),
    'only a Matches session’s sheet is drawn as matches, and only with an Overall; every other round goes to the sheet as before')
  const client = read('app/golf/[root]/[tripCode]/teesheet/TeeSheetClient.tsx')
  ok(client.includes('matchSessions ? null : <p className="t-cap text-ink/65 text-center py-8">'),
    '  …the stroke sheet’s own words untouched when there are no matches')
  const sheet = read('app/golf/[root]/[tripCode]/session/MatchesSheet.tsx')
  ok(sheet.includes('const twoTags = tags.length === 2 ? tags : null') && sheet.includes('sticky top-[52px]'),
    'with exactly two tags, a header names them and stays put')
  ok(sheet.includes('>vs<'), 'each row reads left side, vs, right side')
  ok(sheet.includes('useTeeFreeze(') && sheet.includes('Locked by another user') && sheet.includes('Time to complete booking'),
    'a time being set is frozen on other phones, the booker counting down two minutes')
  ok(sheet.includes("timed(slot) ? clocks![slot] : `Match ${slot + 1}`"), 'a row reads its tee time where it has one, else its match number')
  ok(read('lib/sessionMatchStore.ts').includes("from('tee_assignments')"),
    'a tee-sheet match puts its players on their tee time, so “your time” reads as ever')
  ok(read('app/dashboard/create/CreateLeagueForm.tsx').includes('Tee times decide the matches.'),
    'creation says tee times (or the order of play) decide the matches')
}

section('Trips follow events, every existing trip unchanged (stage 8, D47)')
{
  eq(fourthTab(false, { teeTimes: false, stats: true }), 'stats', 'a trip keeps Stats in fourth place, as ever')
  eq(fourthTab(false, { teeTimes: true, stats: true }), 'teeTimes', '  …and Tee times in its place while it uses tee sheets')
  eq(fourthTab(false, { teeTimes: false, stats: true, orderOfPlay: true }), 'orderOfPlay',
    '  …and the Order of play once a session of its Overall plays Matches')
  const setup = read('app/golf/[root]/[tripCode]/setup/TripSetupClient.tsx')
  ok(setup.includes('boards={boards.filter(b => !isOverallBoard(b) && !isSessionBoard(b))}')
    && setup.includes('...boards.filter(b => isOverallBoard(b) || isSessionBoard(b)),'),
    'Trip Setup’s leaderboards never show the Overall or a session’s board, and never drop them on save')
  ok(setup.includes('`${tripHome}/setup/sessions`'), 'Trip Setup has the Session formats door')
  const page = read('app/golf/[root]/[tripCode]/organiser/sessions/page.tsx')
  ok(!page.includes('!isEvent(trip.kind)') && page.includes('isTrip={!event}'), 'one Session formats page serves a trip and an event')
  ok(read('app/golf/[root]/[tripCode]/setup/sessions/page.tsx').includes("export { default } from '../../organiser/sessions/page'"),
    '  …reached on a trip from Trip Setup')
  ok(read('app/golf/[root]/[tripCode]/scoring/page.tsx').includes('const overall = overallOf(sessionBoards)'),
    'the Scoring tab reads a trip’s sessions too')
  ok(!read('app/golf/[root]/[tripCode]/leaderboard/page.tsx').includes('event && overallOf(boards)'), '  …and the leaderboard')
}

section('Small things Ross found (9 Nov 2026)')
{
  const dateField = read('app/components/DateField.tsx')
  ok(dateField.includes('const from = openAt ?? min ?? null'), 'an empty date field opens on the date before it, else its earliest day — only when tapped')
  for (const [file, what] of [
    ['app/dashboard/create/CreateTripForm.tsx', 'a trip’s end date'],
    ['app/dashboard/create/CreateLeagueForm.tsx', 'a league’s last day'],
    ['app/golf/[root]/[tripCode]/setup/TripSetupClient.tsx', 'Trip Setup’s end date'],
    ['app/dashboard/create/CreateRunForm.tsx', 'a challenge’s finish'],
  ] as const) ok(/openAt=\{(startDate|from) \|\| null\}/.test(read(file)), `  …${what} opens on its start`)
  const focus = read('lib/focusNext.ts')
  ok(focus.includes("if (e.key !== 'Enter') return") && focus.includes('next.focus()'), 'Enter on a name goes on to the handicap')
  for (const file of ['app/dashboard/create/CreateLeagueForm.tsx', 'app/dashboard/create/CreateTripForm.tsx',
    'app/dashboard/create/MatchPlayField.tsx', 'app/golf/[root]/[tripCode]/AddToField.tsx',
    'app/golf/[root]/[tripCode]/players/PlayersClient.tsx', 'app/golf/[root]/[tripCode]/setup/TripSetupClient.tsx']) {
    ok(read(file).includes('onKeyDown={enterGoesTo('), `  …in ${file.split('/').pop()}`)
  }
  const sheet = read('app/golf/[root]/[tripCode]/session/MatchesSheet.tsx')
  ok(sheet.includes('setPending(prev => ({ ...prev, [slot]: {') && sheet.indexOf('setPending(prev => ({ ...prev, [slot]: {') < sheet.indexOf('await setMatchSide('),
    'a pick is in its seat before the save comes back, not after the next tap')
  ok(sheet.includes('Refused: the seat goes back'), '  …and taken back if the save is refused')
}

// ─── The wizard ────────────────────────────────────────────────

section('The creation wizard asks, and No is today’s flow')
{
  const form = read('app/dashboard/create/CreateLeagueForm.tsx')
  ok(form.includes("dynamic: 'Enable Dynamic Overall Leaderboard?'"), 'the question is Ross’s wording')
  ok(form.includes('If the format of the golf changes over the course of the event, add each round as individual sessions'),
    '  …with its explanation as the step’s one line')
  ok(/asksDynamic = schedule === 'standalone'/.test(form), 'only a standalone league is asked')
  ok(form.includes("['details', 'field', 'dynamic', ...(isDynamic ? ['sessions' as const, 'overall' as const] : ['venues' as const]), 'ready']"),
    'Yes runs the sessions then the Overall; No runs the venues as before')
  ok(form.includes("['details', 'venues', ...(askDeadlines ? ['deadlines' as const] : []), 'field', 'ready']"),
    'a series or continuous league’s steps are untouched')
  ok(form.includes('const storedBoards: Leaderboard[] = isDynamic ?') && form.includes(': boards'),
    'No stores exactly the boards picked, as before')
  ok(form.includes('...(isDynamic ? { id: roundIds[i] } : {})'), 'a session’s round carries the id its board names; No’s rounds as before')
  const picker = read('app/dashboard/create/SessionPicker.tsx')
  ok(picker.includes('Turn the Dynamic Overall Leaderboard off?'), 'Yes → No with sessions set asks first')
  ok(picker.includes('Same as Session 1') && picker.includes('Format TBC') && picker.includes('Or a new format'),
    'later sessions start "Same as Session 1", the formats used and TBC as tiles, a new format under them')
  ok(!picker.includes('Change format') && !read('app/golf/[root]/[tripCode]/organiser/sessions/SessionsClient.tsx').includes('Change format'),
    '  …never behind a Change format button, at creation or after (Ross, 9 Nov 2026)')
  ok(picker.includes("onChange={f => set(i, { format: sameFormat(f, formats[0]) ? 'same' : f })}"),
    '  …an answer that lands on Session 1’s format choosing that tile')
  ok(!/^export (const|function) [a-z]/m.test(picker), 'the picker exports components only (test:client-boundary)')
  const organiser = read('app/golf/[root]/[tripCode]/organiser/OrganiserClient.tsx')
  ok(organiser.includes('label="Session formats"'), 'the organiser area has a Session formats row')
  const sessionsPage = read('app/golf/[root]/[tripCode]/organiser/sessions/SessionsClient.tsx')
  ok(sessionsPage.includes('Turn the Overall off?') && sessionsPage.includes('withOverallOff(boards)'),
    '  …where turning it off asks first, and takes only the Overall')
  ok(sessionsPage.includes('This session counts nothing until its format is set.'), '  …and a TBC session says so')
  const hub = read('lib/hubStanding.ts')
  ok(hub.includes("if (lead.competition === 'overall')") && hub.includes('overallRows(lead, overall.boards'),
    'the hub’s standing takes the full path for an Overall')
  const round = read('app/golf/[root]/[tripCode]/round/[roundNumber]/page.tsx')
  ok(round.includes('overallOf(boards) ? sessionBoardFor(boards, round.id) : primary(boards)'),
    'a round summary on an event with an Overall is its session’s result')
}

// ─── Two tags facing off ──────────────────────────────────────

section('Two tags facing off: the ticker (Ross, 9 Nov 2026)')
{
  // How many matches a session holds.
  eq(defaultMatchSlots(24, 'singles'), 12, 'twenty-four players are twelve singles')
  eq(defaultMatchSlots(24, 'fourball'), 6, '  …or six fourballs')
  eq(defaultMatchSlots(0, 'foursomes'), 1, '  …and never fewer than one')
  eq(defaultMatchSlots(500, 'singles'), MAX_MATCH_SLOTS, '  …nor more than the most a session holds')
  eq(parseOverallRules({ ranks: 'tags', slots: { r1: 4, r2: 0, r3: 'x', r4: 99 } })?.slots, { r1: 4, r4: MAX_MATCH_SLOTS },
    'a stored count reads fail-soft, a bad one dropped')
  const ms = (roundId: string, slot: number) => ({ roundId, slot })
  eq(matchSlotsFor({ ranks: 'tags', slots: { r1: 4 } }, 'r1', [ms('r1', 0)]), 4, 'the count set is the session’s slots')
  eq(matchSlotsFor({ ranks: 'tags', slots: { r1: 2 } }, 'r1', [ms('r1', 0), ms('r1', 4)]), 5, '  …never fewer than the matches set')
  eq(matchSlotsFor({ ranks: 'tags' }, 'r1', []), 0, '  …and none set is none')
  const withSlots = withSessionSlots([overallBoard({ ranks: 'tags' })], 'r1', 6)
  eq(overallOf(withSlots)?.overall?.slots, { r1: 6 }, 'the organiser area sets a session’s count')

  // The points up for grabs.
  eq(matchPool(DEFAULT_MATCH_FEED), 1, 'a match is one point between the sides')
  eq(sessionPool(DEFAULT_MATCH_FEED, 12), 12, '  …twelve singles twelve')
  eq(sessionPool({ kind: 'position', points: [2, 1] }, 0), 3, 'a stroke session is its top two places')
  eq(sessionPool({ kind: 'none' }, 4), 0, 'a session that does not count adds nothing')

  // A Ryder Cup in miniature: four fourballs, four singles; one fourball each, a half, two in play.
  const L = 'tag-eu', R = 'tag-us'
  const tags = [{ id: L, name: 'Europe' }, { id: R, name: 'USA' }]
  const rules = { ranks: 'tags' as const, slots: { s1: 4, s2: 4 } }
  const boards: Leaderboard[] = [
    overallBoard(rules),
    sessionBoard({ kind: 'matches', match: 'fourball' }, 's1', 'day:s1'),
    sessionBoard({ kind: 'matches', match: 'singles' }, 's2', 'day:s2'),
  ]
  const side = (t: string) => [t + '-p']
  const match = (slot: number, result: 'a' | 'b' | 'halved' | null, extra: Partial<{ live: boolean; leader: 'a' | 'b' | null; up: number }> = {}) => ({
    id: `m${slot}`, roundId: 's1', slot, sideA: side(L), sideB: side(R), result, ...extra,
  })
  const matches = [
    match(0, 'a'), match(1, 'b'), match(2, 'halved'),
    match(3, null, { live: true, leader: 'b', up: 2 }),
    { ...match(0, null, { live: true, leader: null, up: 0 }), id: 'x', roundId: 's2', sideA: side(R), sideB: side(L) },
  ]
  const tagOf = (ids: readonly string[]) => (ids[0]?.startsWith(L) ? L : ids[0]?.startsWith(R) ? R : null)
  const face = faceOff({
    rules, tags, rows: [{ id: L, total: 1.5 }, { id: R, total: 1.5 }],
    rounds: [{ id: 's1' }, { id: 's2' }], boards, sessionBoardFor, matches, tagOf,
  })!
  eq(face.total, 8, 'every slot in order of play is a point up for grabs')
  eq(face.toWin, 4.5, '  …and more than half wins it')
  eq([face.left.points, face.right.points], [1.5, 1.5], 'the banked points are the Overall’s own')
  eq([face.left.projected, face.right.projected], [2, 3], 'a match in play counts as it stands: USA 2 up a point, all square a half each')
  eq(face.live, 2, '  …two matches in play')
  eq(face.winner, null, 'nobody has won yet')
  eq(face.ticks.length, 8, 'a mark a point')
  eq(face.ticks[0], { leftWon: 1, leftLive: 0, rightLive: 0, rightWon: 0 }, 'the left tag fills in from the left edge')
  eq(face.ticks[1], { leftWon: 0.5, leftLive: 0.5, rightLive: 0, rightWon: 0 }, '  …a half shares a mark, the softened part in play')
  eq(face.ticks[7], { leftWon: 0, leftLive: 0, rightLive: 0, rightWon: 1 }, 'the right tag fills in from the right edge')
  eq(face.ticks[5], { leftWon: 0, leftLive: 0, rightLive: 1, rightWon: 0 }, '  …its match in play softened, inside its banked points')
  eq(face.ticks[2], { leftWon: 0, leftLive: 0, rightLive: 0, rightWon: 0 }, 'what nobody holds yet stays empty in the middle')
  eq(faceOff({ rules: { ranks: 'individuals' }, tags, rows: [], rounds: [], boards, sessionBoardFor, matches, tagOf }), null,
    'only an Overall of tags is a face-off')
  eq(faceOff({ rules, tags: tags.slice(0, 1), rows: [], rounds: [], boards, sessionBoardFor, matches, tagOf }), null,
    '  …and only with two of them')
  const won = faceOff({ rules, tags, rows: [{ id: L, total: 5 }, { id: R, total: 1 }], rounds: [{ id: 's1' }, { id: 's2' }], boards, sessionBoardFor, matches: [], tagOf })!
  eq(won.winner, 'left', 'past halfway the left tag has won it')
  eq(tickFills(200, { points: 0, projected: 0 }, { points: 0, projected: 0 }).length <= MAX_TICKS, true, 'a big event shares the marks out, a mark more than a point')

  // A match's pill.
  eq(matchStatus({ id: 'a', roundId: 's', slot: 0, sideA: [], sideB: [], result: 'a', margin: '3&2' }),
    { main: '3&2', sub: 'Final', tone: 'a', final: true }, 'a finished match: its margin, solid in the winner’s colour')
  eq(matchStatus({ id: 'a', roundId: 's', slot: 0, sideA: [], sideB: [], result: 'b', margin: '1 up' }).main, '1 UP', '  …"1 UP" a match that went the distance')
  eq(matchStatus({ id: 'a', roundId: 's', slot: 0, sideA: [], sideB: [], result: 'halved' }).tone, 'half', 'a half is the brown')
  eq(matchStatus({ id: 'a', roundId: 's', slot: 0, sideA: [], sideB: [], result: null, live: true, leader: 'b', up: 2, thru: 11 }),
    { main: '2 UP', sub: 'Thru 11', tone: 'b', final: false }, 'in play: softened in the leader’s colour, and how far through')
  eq(matchStatus({ id: 'a', roundId: 's', slot: 0, sideA: [], sideB: [], result: null }).tone, 'none', 'not started has no colour')

  // The screens.
  const client = read('app/golf/[root]/[tripCode]/leaderboard/TripLeaderboardClient.tsx')
  ok(client.includes('{faceOffView || sessionContent ||'), 'two tags facing off draw the ticker in the table’s place')
  ok(client.includes('id="faceoff-session"') && client.includes('sessionRounds.map(r => <option'), '  …with a dropdown of the sessions')
  ok(client.includes("const sessionStrip = overallActive && !face &&"), '  …in place of the session switch')
  const list = read('app/golf/[root]/[tripCode]/leaderboard/SessionMatchList.tsx')
  ok(list.includes('/session/${m.roundId}/match/${m.slot}/card'), 'each match row opens its card')
  ok(list.includes("To be set"), '  …and a slot with no match yet says so')
  const ticker = read('app/golf/[root]/[tripCode]/leaderboard/FaceOffTicker.tsx')
  ok(ticker.includes('points up for grabs') && ticker.includes('to win'), 'the ticker says the points up for grabs and what wins')
  ok(!/^export (const|function) [a-z]/m.test(ticker) && !/^export (const|function) [a-z]/m.test(list), 'the ticker and list export components only')
  const picker = read('app/dashboard/create/SessionPicker.tsx')
  ok(picker.includes('label="How many matches?"'), 'creation asks how many matches a Matches session holds')
  ok(read('app/dashboard/create/CreateLeagueForm.tsx').includes('rules.slots = slots'), '  …and stores it on the Overall')
  ok(read('app/golf/[root]/[tripCode]/organiser/sessions/SessionsClient.tsx').includes('withSessionSlots(boards, r.id, n)'),
    '  …changed in the organiser area')
  ok(read('app/golf/[root]/[tripCode]/session/matchSheetPlan.ts').includes('slots: slotsOf(round.id)'),
    'the order of play has a row for every match')
}

section('The order of play: − and +, one session open at a time (Ross, 9 Nov 2026)')
{
  const m = (slot: number, a: string[] = [], b: string[] = []) => ({ slot, sideA: a, sideB: b })
  eq(slotFloor([]), 1, 'a session holds at least one match')
  eq(slotFloor([m(0, ['x']), m(3, [], ['y'])]), 4, '− never takes away a match with anybody in it')
  eq(slotFloor([m(0, ['x']), m(5)]), 1, '  …an empty one goes')
  // Vacant matches are points up for grabs.
  const rules = { ranks: 'tags' as const, slots: { s1: 6 } }
  const boards: Leaderboard[] = [overallBoard(rules), sessionBoard({ kind: 'matches', match: 'singles' }, 's1', 'day:s1')]
  const face = faceOff({
    rules, tags: [{ id: 'l', name: 'L' }, { id: 'r', name: 'R' }], rows: [], rounds: [{ id: 's1' }],
    boards, sessionBoardFor, matches: [], tagOf: () => null,
  })!
  eq(face.total, 6, 'a vacant match counts in the ticker’s total')
  const sheet = read('app/golf/[root]/[tripCode]/session/MatchesSheet.tsx')
  ok(sheet.includes('aria-label="One match fewer"') && sheet.includes('aria-label="One match more"'), 'the order of play has − and + for its matches')
  ok(sheet.includes('disabled={rowCount <= floor}'), '  …− stopping at the last match with players in it')
  ok(sheet.includes("{/* How many matches: − takes the last empty one away, + adds one. */}\n      {organiser && ("), '  …the organiser’s, on the order of play and the tee sheet alike')
  ok(!sheet.includes('+ Add a match'), '  …in place of Add a match')
  ok(sheet.includes('setSessionSlots(supabase, tripId, roundId, n)'), '  …saved as the session’s count')
  const store = read('lib/sessionMatchStore.ts')
  ok(store.includes("select('leaderboards').eq('id', tripId)") && store.includes('change(parseLeaderboards(')
    && store.includes('changeBoards(client, tripId, boards => withSessionSlots(boards, roundId, count))'),
    '  …read fresh and merged, nothing else on the leaderboards put back')
  const list = read('app/golf/[root]/[tripCode]/order/OrderOfPlayList.tsx')
  ok(list.includes('open={openId === sheet.roundId}') && list.includes('setOpenId(id => (id === sheet.roundId ? null : sheet.roundId))'),
    'one session open at a time, its heading opening and closing it')
  ok(!/^export (const|function) [a-z]/m.test(list), '  …the list exports components only')
  const plan = read('app/golf/[root]/[tripCode]/session/matchSheetPlan.ts')
  ok(plan.includes('sessions.find(s => s.round.id === input.onlyRound)'), '  …opening on the session asked for, else the one in play')
}

section('Tee times add times to the matches already set (Ross, 10 Nov 2026)')
{
  const s1 = 's1', s2 = 's2', s3 = 's3'
  const rules = { ranks: 'tags' as const, slots: { s1: 3, s2: 2, s3: 2 } }
  const boards: Leaderboard[] = [
    overallBoard(rules),
    sessionBoard({ kind: 'matches', match: 'singles' }, s1, 'day:s1'),
    sessionBoard({ kind: 'matches', match: 'fourball' }, s2, 'day:s2'),
    sessionBoard({ kind: 'matches', match: 'singles' }, s3, 'day:s3'),
  ]
  const results = [
    { id: 'a', roundId: s1, slot: 0, sideA: ['p1'], sideB: ['p2'], result: null },
    { id: 'b', roundId: s1, slot: 2, sideA: ['p3'], sideB: ['p4'], result: null },
    { id: 'c', roundId: s2, slot: 0, sideA: ['p1', 'p3'], sideB: ['p2', 'p4'], result: null },
  ]
  const times = new Map([
    [s1, { clocks: ['8:00 am', '8:10 am'] }],
    [s2, { setupHref: '/x/teesheet/s2/setup' }],
  ])
  const common = {
    tripId: 't', tripCode: 'ABCDEF', players: [], tags: [], tagOfPlayer: {}, myId: null,
    passcodeHash: null, playersPick: true, isTrip: false,
  }
  const { sheets, initialOpen } = buildMatchSheets({
    boards, rounds: [{ id: s3, round_number: 3 }, { id: s1, round_number: 1 }, { id: s2, round_number: 2 }, { id: 'stroke', round_number: 4 }],
    results, times, common,
  })
  eq(sheets.map(x => x.roundId), [s1, s2, s3], 'every Matches session is drawn, in running order — timed, waiting on its sheet, or neither')
  eq(sheets[0].matches.map(m => m.slot), [0, 2], 'a session’s matches set before its tee times are all still there')
  eq(sheets[0].clocks, ['8:00 am', '8:10 am'], '  …the open sheet’s times on its rows')
  eq(sheets[0].slots, 3, '  …and its three matches kept though the sheet has two times')
  eq(sheets[1].setupHref, '/x/teesheet/s2/setup', 'a session whose sheet is not open shows its matches, the organiser offered the tee sheet')
  eq(sheets[1].clocks, undefined, '  …with no times yet')
  eq(sheets[2].clocks === undefined && sheets[2].setupHref === undefined, true, 'a session without tee times is its order of play, as before')
  eq(initialOpen, s1, 'it opens on the next session to finish')
  eq(buildMatchSheets({ boards, rounds: [{ id: s1, round_number: 1 }, { id: s2, round_number: 2 }], results, times, common, onlyRound: s2 }).initialOpen,
    s2, '  …or the one asked for')
  eq(buildMatchSheets({ boards: boards.slice(1), rounds: [{ id: s1, round_number: 1 }], results, times, common }).sheets, [],
    'no Overall, no Matches sessions')
  eq(clocksOf({ state: 'vacant' } as never, 3), undefined, 'a sheet not open yet puts no times on the matches')

  const sheet = read('app/golf/[root]/[tripCode]/session/MatchesSheet.tsx')
  ok(sheet.includes('Math.max(count > 0 ? count : clocks?.length ?? 0, floor, ...matches.map(m => m.slot + 1))'),
    'a sheet’s rows are its matches, never cut to its tee times')
  ok(sheet.includes('no tee time yet — add tee times on the tee sheet'), '  …a match past the last time says it has none yet')
  ok(sheet.includes('Open the tee sheet →'), '  …and a session waiting on its sheet offers the organiser the way')
  const tee = read('app/golf/[root]/[tripCode]/teesheet/page.tsx')
  ok(tee.includes('<OrderOfPlayList sheets={matchSheets} initialOpen={matchOpen} />') && tee.includes('rounds: allRounds'),
    'the Tee times tab draws every Matches session, tee times or not, one open at a time')
  const order = read('app/golf/[root]/[tripCode]/order/page.tsx')
  ok(order.includes('readSessionTimes(') && order.includes('buildMatchSheets('), 'the Order of play draws the same sheets, with their times')
  const setup = read('app/golf/[root]/[tripCode]/teesheet/[roundId]/setup/page.tsx')
  ok(setup.includes('const asked = matchSession ? null : playTogetherQuestion('), 'a Matches session’s sheet asks nothing about teams')
  ok(setup.includes('const partnership = matchSession ? null :'), '  …and carries no partnerships over from another round')
  ok(setup.includes("count: matchCount > 0 ? matchCount : defaultMatchSlots(fieldSize, matchSession)") && setup.includes('groupSize: 2 * sideSize(matchSession)'),
    '  …starting with a time for each match, two sides a time')
  ok(setup.includes('...matchRows.map(m => m.slot))'), '  …and warns before a shorter sheet leaves a match without a time')
  ok(read('app/golf/[root]/[tripCode]/teesheet/[roundId]/setup/TeeSheetWizard.tsx').includes('if (matchSession) await mirrorTeeTimes(supabase, tripId, roundId)'),
    'opening the sheet gives the players already in a match their time')
}

section('The home screen: sessions on the schedule, Matches through Scoring (Ross, 10 Nov 2026)')
{
  const boards: Leaderboard[] = [
    overallBoard({ ranks: 'tags', names: { r1: 'Friday fourballs' } }),
    sessionBoard({ kind: 'matches', match: 'fourball' }, 'r1', 'day:r1'),
    sessionBoard({ kind: 'stroke', audience: 'individual', scoring: 'stableford' }, 'r2', 'day:r2'),
  ]
  const rounds = [
    { id: 'r1', round_number: 1, itinerary_item_id: 'i1' },
    { id: 'r2', round_number: 2, itinerary_item_id: 'i2' },
    { id: 'r3', round_number: 3, itinerary_item_id: null },
  ]
  eq(itinerarySessions(boards, rounds), {
    i1: { name: 'Friday fourballs', matches: true },
    i2: { name: 'Session 2', matches: false },
  }, 'each golf item knows its session’s name, and whether it plays matches')
  eq(itinerarySessions(boards.slice(1), rounds), {}, '  …and without an Overall, nothing: every tile as it was')

  const it = read('app/golf/[root]/[tripCode]/Itinerary.tsx')
  ok(it.includes('{session ? session.name : <CourseName name={title} />}'), 'the schedule names the session where the venue was')
  ok(it.includes('const venueLine = session ? courseLabel(title) : null') && it.includes('{venueLine || detailLine}'),
    '  …the venue small underneath, where "Tee sheet" was')
  ok(it.includes('<Link href={`${tripHome}/round/${roundNumber}`}') && !it.includes('session?.matches ?'),
    'every golf tile opens its round summary, the card and the weather — a session’s too (Ross, 10 Nov 2026)')
  ok(read('app/golf/[root]/[tripCode]/StatusBlock.tsx').includes('href={`${tripHome}/round/${nextRoundNumber}`}'),
    '  …and so does up-next')
  const hub = read('app/golf/[root]/[tripCode]/page.tsx')
  ok(hub.includes('const scheduleSessions = itinerarySessions(hubBoards, rounds)') && hub.includes('sessions={scheduleSessions}'),
    'the hub hands the schedule its sessions')
  const round = read('app/golf/[root]/[tripCode]/round/[roundNumber]/page.tsx')
  ok(round.includes('<Link href={`${tripHome}/scoring`} className={buttonClass(\'primary\')}>') && !round.includes('/scoring/${round.round_number}'),
    'the round summary goes into scoring through the Scoring tab, never straight into a card')
  ok(round.includes("{matchesSession ? 'See the matches' : 'Go to scoring'}"), '  …a Matches session’s button saying it is its matches')
  const card = read('app/golf/[root]/[tripCode]/scoring/[roundNumber]/page.tsx')
  ok(card.includes("sessionBoardFor(boards, thisRound.id)?.competition === 'matches'") && card.includes('redirect(`${tripHome}/scoring`)'),
    '  …and any door still landing on its stroke card is sent to the Scoring tab')
}

section('The organiser’s lock, and a round’s own settings (Ross, 10 Nov 2026)')
{
  const pass = read('lib/passcode.ts')
  ok(pass.includes("export const UNLOCK_EVENT = 'gd-organiser-unlock'") && /export function rememberUnlock[\s\S]*?announce\(\)/.test(pass),
    'unlocking says so on the window, so every control on the page hears it')
  ok(/export function forgetUnlock[\s\S]*?removeItem\(key\(tripCode\)\)[\s\S]*?announce\(\)/.test(pass), '  …and the lock can be shut again')
  const hook = read('app/components/useUnlocked.ts')
  ok(hook.includes('window.addEventListener(UNLOCK_EVENT, read)'), 'useUnlocked follows the unlock as it changes')
  const lock = read('app/components/OrganiserLock.tsx')
  ok(lock.includes('if (!isLocked(passcodeHash)) return null'), 'the lock is drawn only where there is a PIN to open')
  ok(lock.includes('forgetUnlock(tripCode)') && lock.includes('rememberUnlock(tripCode)'), '  …a tap shuts it, the right PIN opens it')
  ok(lock.includes("className={`inline-flex ${wobble ? 'lock-wobble' : ''}`}") && lock.includes('key={wobble}'), '  …wobbling on every tap')
  ok(lock.includes('absolute right-0 top-full'), '  …the PIN in a small box under it')
  const css = read('app/globals.css')
  ok(/\.lock-wobble \{ animation: gdLockWobble 3\d\dms ease-out;/.test(css), 'the wobble is a one-shot inside the 400ms ceiling, switched off under Reduce Motion with the rest')
  const base = 'app/golf/[root]/[tripCode]/'
  for (const page of ['round/[roundNumber]/page.tsx', 'teesheet/TeeSheetClient.tsx', 'order/page.tsx', 'teams/page.tsx', 'teams/pick/page.tsx',
    'page.tsx', 'scoring/page.tsx', 'match/[matchId]/page.tsx', 'match/[matchId]/card/page.tsx', 'matchplay/page.tsx',
    'session/[roundId]/match/[slot]/card/page.tsx']) {
    ok(read(base + page).includes('<OrganiserLock tripCode={tripCode}'), `  …in the header of ${page}`)
  }
  for (const f of ['teesheet/TeeSheetClient.tsx', 'teams/TeamsClient.tsx', 'session/MatchesSheet.tsx', 'AddToField.tsx', 'LeagueRounds.tsx',
    'match/[matchId]/MatchActions.tsx', 'match/[matchId]/card/MatchCardClient.tsx', 'matchplay/MatchplayBracket.tsx', 'teams/pick/TeamPickerWizard.tsx']) {
    ok(read(base + f).includes('useUnlocked('), `  …and ${f.split('/').pop()} follows it`)
  }
  ok(!read(base + 'teesheet/TeeSheetClient.tsx').includes('<InlineUnlock') && !read(base + 'session/MatchesSheet.tsx').includes('<InlineUnlock'),
    'the page-wide PIN rows it replaces are gone')

  const ro = read(base + 'round/[roundNumber]/RoundOrganiser.tsx')
  ok(ro.includes('if (!unlocked && isLocked(passcodeHash)) return null'), 'a round’s settings show once the lock is open')
  ok(ro.includes(".update({ start_format: on ? 'tee_sheet' : null })"), '  …tee times on or off for the round, nothing else touched')
  ok(ro.includes('setSessionName(supabase, tripId, roundId, name)') && ro.includes('setSessionSlots(supabase, tripId, roundId, n)'),
    '  …a session’s name and how many matches it holds')
  ok(ro.includes('Change the format →') && ro.includes('Set the matches →'), '  …and the way to its format and its matches')
  const rp = read(base + 'round/[roundNumber]/page.tsx')
  ok(rp.includes('<RoundOrganiser') && rp.includes('session={sessionInfo ? { ...sessionInfo, slots: sessionSlots } : null}'), 'the round summary draws them')
}

section('Every Matches session alike: its matches in order of play, vacant until set (Ross, 10 Nov 2026)')
{
  const fourball = sessionBoard({ kind: 'matches', match: 'fourball' }, 'r1', 'day:r1')
  const foursomes = sessionBoard({ kind: 'matches', match: 'foursomes' }, 'r2', 'day:r2')
  const singles = sessionBoard({ kind: 'matches', match: 'singles' }, 'r3', 'day:r3')
  const stroke = sessionBoard({ kind: 'stroke', audience: 'individual', scoring: 'stableford' }, 'r4', 'day:r4')
  const rules = { ranks: 'tags' as const }
  eq(sessionSlotCount(rules, foursomes, 'r2', [], 16), 4, 'a session never given a count holds the field’s usual number — sixteen are four foursomes')
  eq(sessionSlotCount(rules, singles, 'r3', [], 16), 8, '  …or eight singles')
  eq(sessionSlotCount({ ranks: 'tags', slots: { r1: 3 } }, fourball, 'r1', [], 16), 3, 'a count set is the count')
  eq(sessionSlotCount(rules, fourball, 'r1', [{ roundId: 'r1', slot: 5 }], 16), 6, '  …never fewer than the matches set')
  eq(sessionSlotCount(rules, stroke, 'r4', [], 16), 0, 'a stroke session holds no matches')
  eq(sessionSlotCount(rules, null, 'r5', [], 16), 0, '  …nor does a TBC one')
  const face = faceOff({
    rules, tags: [{ id: 'l', name: 'L' }, { id: 'r', name: 'R' }], rows: [], rounds: [{ id: 'r2' }],
    boards: [overallBoard(rules), foursomes], sessionBoardFor, matches: [], tagOf: () => null, fieldSize: 16,
  })!
  eq(face.total, 4, 'the ticker counts those vacant matches as points up for grabs')
  const scoring = read('app/golf/[root]/[tripCode]/scoring/page.tsx')
  ok(scoring.includes('slots={sessionSlotCount(overall.overall, session, round.id,'),
    'the Scoring tab draws every Matches session’s rows, set or vacant — never "No matches yet"')
  ok(scoring.includes('tags={sessionTags.length === 2 ? sessionTags : []}'), '  …the two tags left and right, as on the leaderboard')
  for (const f of ['leaderboard/TripLeaderboardClient.tsx', 'session/matchSheetPlan.ts', 'teesheet/page.tsx', 'order/page.tsx',
    'teesheet/[roundId]/setup/page.tsx', 'round/[roundNumber]/page.tsx']) {
    ok(read('app/golf/[root]/[tripCode]/' + f).includes('sessionSlotCount('), `  …and ${f} reads the same count`)
  }
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
