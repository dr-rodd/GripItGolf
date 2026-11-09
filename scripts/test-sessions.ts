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
  describeFormat, sameFormat, isSessionBoard,
  withSessionFormat, withSessionName, withSessionFeed, withOverallOn, withOverallOff, formatOfBoard,
} from '../lib/sessions'
import { parseLeaderboards, hasMatchplay, boardTitle, boardFacts, type Leaderboard } from '../lib/leaderboards'
import { governingBoard, isPairs } from '../lib/partnerships'
import { buildRows, type RowContext, type ResolvedScore, type RowHole } from '../lib/boardRows'
import { overallRows } from '../lib/overallRows'
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

section('Foursomes and, until stage 5, Matches are offered but not pickable')
{
  const four = MATCH_FORMATS.find(m => m.key === 'foursomes')
  ok(!!four && !four.available, 'foursomes is in the list, not available (D43)')
  if (!MATCHES_READY) {
    ok(/coming soon/.test(sessionsIssue([draft('a', 0, singles)]) ?? ''), 'a Matches session cannot be saved before the card can score one')
  }
  ok(/coming soon/.test(sessionsIssue([draft('a', 0, { kind: 'matches', match: 'foursomes' })]) ?? ''), 'nor can foursomes')
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
  eq(boardFacts(stored[3]), ['Fourball', 'Matches'], '  …in facts')
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
  ok(picker.includes('Same as Session 1') && picker.includes('Format TBC') && picker.includes('Change format'),
    'later sessions start "Same as Session 1", with Change format and TBC')
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

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
