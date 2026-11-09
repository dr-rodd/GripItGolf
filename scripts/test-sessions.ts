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
} from '../lib/sessions'
import { parseLeaderboards, hasMatchplay, boardTitle, boardFacts, type Leaderboard } from '../lib/leaderboards'
import { governingBoard, isPairs } from '../lib/partnerships'
import { buildRows } from '../lib/boardRows'
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
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
