/**
 * Tag tests. Run with: npm run test:tag-boards
 *
 * Two halves, like every suite here. The rules in lib/tagBoards.ts are
 * checked directly — what a tag is, who carries one, who does not, and the
 * card's summary line. Then the wiring: the portal writes through the one
 * membership writer so the coloured dots follow, the organiser dashboard
 * carries a door to it, and the field's own join face is gated on the
 * permission rather than left open.
 *
 * The load-bearing decision under all of it is that a tag is a team on the
 * MAIN sheet. That is what keeps `players.team_id` — and with it every dot
 * the platform already draws — true without a single query changing, so
 * the tests pin it as a decision rather than an implementation detail.
 */

import fs from 'fs'
import {
  TAG_SET, eventTags, tagOf, untaggedIds, describeTags,
  tagRoundScore, countingPlayers, tagOfTeam,
} from '../lib/tagBoards'
import {
  MAIN_SET, daySheetId, type Membership, type TeamRow,
} from '../lib/teamSets'
import {
  type Leaderboard, parseLeaderboards, boardTitle, boardRules, slotKey,
  isTagBoard, tagsInPlay, tagCountOf, unanswered, isComplete,
  offersTeamFormat, offersTagMode, offersTagCount, offersTeeTeams, offersCombine,
  offersAllowance, TAG_MODES, ALL_TAG_MODES,
} from '../lib/leaderboards'
import { buildRows } from '../lib/boardRows'
import { buildRowContext } from '../lib/rowContext'

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

// ─── Fixtures ──────────────────────────────────────────────────

const europe: TeamRow & { color: string } = { id: 'tag-eu', name: 'Europe', color: '#2563EB', team_set: MAIN_SET }
const usa: TeamRow & { color: string } = { id: 'tag-us', name: 'USA', color: '#DC2626', team_set: MAIN_SET }
// A pairing on another sheet — the thing a tag must never be confused with.
const pairing: TeamRow & { color: string } = { id: 'pair-1', name: 'Ross & Dave', color: '#16A34A', team_set: 'set-2' }

const teams = [europe, usa, pairing]

const memberships: Membership[] = [
  { team_id: 'tag-eu', team_set: MAIN_SET, player_id: 'ross' },
  { team_id: 'tag-eu', team_set: MAIN_SET, player_id: 'dave' },
  { team_id: 'tag-us', team_set: MAIN_SET, player_id: 'john' },
  // Ross is also in a pairing. One player, two sheets — the whole point.
  { team_id: 'pair-1', team_set: 'set-2', player_id: 'ross' },
  { team_id: 'pair-1', team_set: 'set-2', player_id: 'dave' },
]

// ─── The sheet a tag lives on ──────────────────────────────────

section('A tag is a team on the main sheet — the decision the dots rest on')
{
  eq(TAG_SET, MAIN_SET,
    'the tag sheet IS the main sheet, not a sheet beside it')

  // Said as code shape too: this is the property that keeps
  // players.team_id — and every coloured dot reading it — true.
  const writer = read('lib/teamMembers.ts')
  ok(writer.includes('if (teamSet === MAIN_SET)'),
    'the one membership writer mirrors to players.team_id on the main sheet')
  ok(/update\(\{ team_id: teamId \}\)/.test(writer),
    '  …so a tag assignment lands on the mirror by itself')

  const roster = read('app/trip/[tripCode]/scoring/[roundNumber]/page.tsx')
  ok(roster.includes('teams(name, color)'),
    'the live scoring roster still joins straight through that mirror')
  const panel = read('app/scoring/LiveLeaderboardPanel.tsx')
  ok(panel.includes('player.teams') && panel.includes('backgroundColor: player.teams.color'),
    'and the panel still draws the dot from it — nothing to rewire')
}

section('Tags are read off the rows, never a flag')
{
  eq(eventTags(teams).map(t => t.id), ['tag-eu', 'tag-us'],
    'a sheet away is not a tag, however team-like it looks')
  eq(eventTags(teams).map(t => t.color), ['#2563EB', '#DC2626'],
    'and the caller keeps its own richer row — colour included')
  eq(eventTags([]), [], 'an event with no tags simply has none')
  eq(eventTags([pairing]), [],
    'a trip running only a pairs draw has no tags either')
}

// ─── Who carries what ──────────────────────────────────────────

section('One tag per player, and the other sheets stay out of it')
{
  eq(tagOf(memberships, 'ross'), 'tag-eu', 'a tagged player answers their tag')
  eq(tagOf(memberships, 'john'), 'tag-us', 'and the other side answers theirs')
  eq(tagOf(memberships, 'nobody'), null, 'an untagged player answers null')
  ok(tagOf(memberships, 'ross') !== 'pair-1',
    'a pairing on another sheet is never mistaken for a tag')
}

section('Who still needs one')
{
  eq(untaggedIds(['ross', 'dave', 'john'], memberships), [],
    'a fully tagged field has nobody outstanding')
  eq(untaggedIds(['ross', 'mary', 'john', 'sean'], memberships), ['mary', 'sean'],
    'and an untagged one names them, in the order given')
  eq(untaggedIds([], memberships), [], 'an empty roster is not an outstanding list')
  eq(untaggedIds(['mary'], []), ['mary'],
    'with no memberships stored at all, everybody is untagged')
}

// ─── The card's line ───────────────────────────────────────────

section('The organiser card says where tagging stands')
{
  ok(describeTags(0, 0, 12).includes('No tags yet'),
    'nothing made yet reads as an invitation, not a count')
  ok(describeTags(2, 12, 12).includes('2 tags'), 'two tags say two')
  ok(describeTags(1, 3, 12).includes('1 tag ') || describeTags(1, 3, 12).includes('1 tag·')
    || /1 tag\b/.test(describeTags(1, 3, 12)), 'one tag is singular')
  ok(describeTags(2, 9, 12).includes('9 of 12'), 'and how far the tagging has got')
  ok(describeTags(2, 0, 0).includes('nobody on the roster'),
    'an event with tags but no field says so rather than dividing by nothing')
  ok(describeTags(2, 1, 1).includes('1 player'), 'a field of one is singular')
}

// ─── The board that ranks them ─────────────────────────────────

section('A tags board is a team board wearing a mode')
{
  const tagBoard: Leaderboard = {
    id: 'b-tag', audience: 'team', competition: 'league',
    scoring: 'stableford', combine: 'total', tagMode: 'best_cards',
  }
  const teamBoard: Leaderboard = {
    id: 'b-team', audience: 'team', competition: 'league',
    scoring: 'stableford', combine: 'total', teamFormat: 'better_ball',
  }
  ok(isTagBoard(tagBoard), 'a mode makes it a tags board')
  ok(!isTagBoard(teamBoard), 'an ordinary team board is not one')
  ok(!isTagBoard({ audience: 'individual', tagMode: 'best_cards' }),
    'and a mode on a solo board says nothing — the audience is half the answer')

  ok(tagsInPlay([teamBoard, tagBoard]), 'an event with one is playing for tags')
  ok(!tagsInPlay([teamBoard]), 'and one without is not')
  ok(!tagsInPlay([]), 'nor is an event with no boards at all')

  ok(slotKey(tagBoard) !== slotKey({ ...teamBoard, teamSet: 'main' }),
    'the two are different competitions, though both stand on the main sheet')
  ok(slotKey(tagBoard) !== slotKey({ ...tagBoard, tagMode: 'all_cards' }),
    'and two modes are two competitions')
}

section('The cascade asks a tags board only what it has to answer')
{
  const draft: Partial<Leaderboard> = {
    audience: 'team', competition: 'league', scoring: 'stableford',
    tagMode: 'best_cards', combine: 'total',
  }
  ok(!offersTeamFormat(draft),
    'a tag counting whole cards has no composite to build, so no format question')
  ok(offersTagMode(draft), 'it is asked how a tag scores a round')
  ok(offersTagCount(draft), 'and how many cards count')
  ok(!offersTagCount({ ...draft, tagMode: 'all_cards' }),
    'every card counting has no count to ask for')
  ok(!offersTeeTeams(draft),
    'a tag is not seated together — that is the tee sheet\'s question')
  ok(offersAllowance(draft),
    'but the allowance is asked: a tag reads individual cards like a solo board')

  eq(unanswered(draft), [], 'so the board is complete without a team format')
  ok(isComplete(draft), 'and can be saved')
  ok(offersTeamFormat({ ...draft, tagMode: 'day_teams' }),
    'the day-teams mode does have a real team card, and is asked')
  eq(unanswered({ ...draft, tagMode: 'day_teams' }), ['How a team\'s players combine'],
    '  …and cannot be saved without one')
}

section('Stored tags boards read back, and nonsense does not')
{
  const [lb] = parseLeaderboards([{
    id: 'b-tag', audience: 'team', competition: 'league',
    scoring: 'stableford', combine: 'total', tagMode: 'best_cards', tagCount: 3,
  }])
  eq(lb?.tagMode, 'best_cards', 'the mode reads back')
  eq(lb?.tagCount, 3, 'and the count')
  eq(lb?.teamSet, TAG_SET,
    'pinned to the tag sheet — the one the dots read, never a sheet of its own')
  ok(!('teamFormat' in (lb ?? {})),
    'and carries no team format, which would only show up in its title saying nothing true')

  const [dflt] = parseLeaderboards([{
    id: 'b', audience: 'team', competition: 'league', scoring: 'stableford',
    combine: 'total', tagMode: 'best_cards', tagCount: 2,
  }])
  ok(!('tagCount' in (dflt ?? {})),
    'the default count is kept off the object, like every other no-op answer')
  eq(tagCountOf(dflt ?? {}), 2, '  …and reads back as itself')

  const [pinned] = parseLeaderboards([{
    id: 'b', audience: 'team', competition: 'league', scoring: 'stableford',
    combine: 'total', tagMode: 'all_cards', teamSet: 'set-4',
    teamPick: 'self', teamSize: 3, teeTeams: 'separate',
  }])
  eq(pinned?.teamSet, TAG_SET, 'a stored sheet cannot move a tags board off the tag sheet')
  ok(!pinned?.teamPick && !pinned?.teamSize && !pinned?.teeTeams,
    'and the playing-team answers are left behind rather than gating the wrong thing')

  eq(parseLeaderboards([{
    id: 'b', audience: 'team', competition: 'league', scoring: 'stableford',
    combine: 'total', tagMode: 'day_teams',
  }]), [], 'day teams with no team format has no maths, and is dropped rather than guessed')

  const [junk] = parseLeaderboards([{
    id: 'b', audience: 'team', competition: 'league', scoring: 'stableford',
    combine: 'total', tagMode: 'sideways', teamFormat: 'hero',
  }])
  ok(!junk?.tagMode, 'an unknown mode is ignored')
  eq(junk?.teamFormat, 'hero', '  …leaving an ordinary team board, which is what it is')

  const [solo] = parseLeaderboards([{
    id: 'b', audience: 'individual', competition: 'league',
    scoring: 'stableford', combine: 'total', tagMode: 'best_cards',
  }])
  ok(!solo?.tagMode, 'a mode scribbled on a solo board is ignored, never half-honoured')
}

section('Every board stored before tags existed reads back byte-for-byte')
{
  // The sacred property. Anything that changes here re-scores a live trip.
  const stored = [
    { id: 'a', audience: 'individual', competition: 'league', scoring: 'stableford', combine: 'total' },
    { id: 'b', audience: 'team', competition: 'league', scoring: 'stableford', combine: 'total', teamFormat: 'better_ball' },
    { id: 'c', audience: 'team', competition: 'league', scoring: 'strokes', combine: 'position', teamFormat: 'hero', customPoints: [10, 6, 4] },
    { id: 'd', audience: 'individual', competition: 'league', scoring: 'quota', combine: 'total' },
    { id: 'e', audience: 'team', competition: 'matchplay' },
  ]
  const parsed = parseLeaderboards(JSON.parse(JSON.stringify(stored)))
  eq(parsed.length, 5, 'all five still read')
  ok(parsed.every(b => !('tagMode' in b) && !('tagCount' in b)),
    'and not one of them grew a tag key')
  eq(parsed[1].teamSet, 'main',
    'an ordinary team board still lands on main when nothing else claims it')
  eq(parseLeaderboards(JSON.parse(JSON.stringify(stored))), parsed,
    'and parsing is stable — the same object twice')
}

section('A tags board is named for what it ranks')
{
  const lb: Leaderboard = {
    id: 'b', audience: 'team', competition: 'league',
    scoring: 'stableford', combine: 'total', tagMode: 'best_cards', tagCount: 3,
  }
  ok(boardTitle(lb).startsWith('Tags'),
    'named for what it ranks — not "Team better ball", which would read as the week\'s teams')
  ok(boardTitle(lb) !== boardTitle({ ...lb, tagMode: undefined, teamFormat: 'better_ball' }),
    'and never the same tab as an ordinary team board on the same cards')
  ok(boardRules(lb).includes('best 3 cards'),
    'and the line says how many cards count, which is the whole of what it is')
  ok(boardRules({ ...lb, tagCount: undefined }).includes('best 2 cards'),
    'the default says itself rather than staying silent')
  ok(boardRules({ ...lb, tagCount: 1 }).includes('best card counts'),
    'one card is singular')
  ok(boardRules({ ...lb, tagMode: 'all_cards', tagCount: undefined })
    .includes('Every player\'s round counts'), 'and every card says so')
  ok(!boardRules(lb).includes('composite card'),
    'never a better-ball sentence — a tag builds no composite')
}

section('The cascade can never dead-end on a board it will not save')
{
  // The bug this pins: the combine question was gated on having a team
  // format, which a tags board deliberately has none of — so it never
  // appeared, while `unanswered` went on demanding the answer. Nothing
  // was on screen, the board could not be saved, and the form could not
  // say why.
  //
  // The invariant is not "everything outstanding is on screen" — a team
  // board rightly has the combine answer outstanding while it is still
  // being asked its format. It is that an UNFINISHED board always has
  // SOMETHING left to tap. A draft with questions owing and no question
  // showing is a dead end, whatever else is true of it.
  //
  // Asserting `isComplete` on a hand-built object cannot catch this,
  // because a hand-built object skips the form entirely — which is
  // exactly how this got shipped.
  const onScreen = (d: Partial<Leaderboard>) =>
    !d.audience                                   // who is ranked
    || !d.competition                             // league or matchplay
    || !d.scoring                                 // how a round is scored
    || offersTeamFormat(d) && !d.teamFormat
    || offersTagMode(d) && !d.tagMode
    || offersCombine(d)                           // how the rounds add up

  function walk(label: string, steps: Partial<Leaderboard>[]) {
    let draft: Partial<Leaderboard> = {}
    for (const step of steps) {
      draft = { ...draft, ...step }
      if (unanswered(draft).length > 0) {
        ok(onScreen(draft),
          `${label}: still unfinished after ${Object.keys(step)[0]}, so something must be on screen`)
      }
    }
    ok(isComplete(draft), `${label}: and the board can actually be saved`)
  }

  walk('a tags board', [
    { audience: 'team', tagMode: 'best_cards' },
    { competition: 'league' },
    { scoring: 'stableford' },
    { combine: 'total' },
  ])
  walk('a tags board on the day\'s teams', [
    { audience: 'team', tagMode: 'day_teams' },
    { competition: 'league' },
    { scoring: 'stableford' },
    { teamFormat: 'better_ball' },
    { combine: 'total' },
  ])
  walk('a solo board', [
    { audience: 'individual' },
    { competition: 'league' },
    { scoring: 'stableford' },
    { combine: 'total' },
  ])
  walk('an ordinary team board', [
    { audience: 'team' },
    { competition: 'league' },
    { scoring: 'stableford' },
    { teamFormat: 'hero' },
    { combine: 'total' },
  ])

  // And the gate itself, directly — the line that was wrong.
  const tag: Partial<Leaderboard> = {
    audience: 'team', competition: 'league', scoring: 'stableford',
    tagMode: 'best_cards',
  }
  ok(offersCombine(tag), 'a tags board is asked how its rounds add up')
  ok(!offersCombine({ ...tag, scoring: undefined }),
    'but not before it knows what a round is scored on')
  ok(!offersCombine({ audience: 'team', competition: 'league', scoring: 'stableford' }),
    'and an ordinary team board still waits for its format')

  // One predicate, not the condition written out beside each question —
  // which is how the second copy came not to know about tags.
  const form = read('app/components/LeaderboardSetup.tsx')
  ok(form.includes('{offersCombine(draft) && ('),
    'the form asks through the predicate rather than its own copy of it')
  ok(!/draft\.audience === 'individual' \|\| draft\.teamFormat/.test(form),
    'and no copy of it is left behind in the form')
}

// ─── The maths ─────────────────────────────────────────────────

section('Which cards count, and what they add up to')
{
  const cards = [12, 40, 31, 8]
  eq(tagRoundScore(cards, 'stableford', 'best_cards', 2), 71, 'best two on Stableford is the two highest')
  eq(tagRoundScore(cards, 'strokes', 'best_cards', 2), 20, 'and on strokes the two lowest')
  eq(tagRoundScore(cards, 'stableford', 'all_cards', 2), 91,
    'every card counting ignores the count entirely')
  eq(tagRoundScore([30], 'stableford', 'best_cards', 3), 30,
    'a tag with one player out counts the one card — a blank is not a nought')
  eq(tagRoundScore([], 'stableford', 'best_cards', 2), 0, 'and nobody out is nothing')
  eq(tagRoundScore(cards, 'stableford', 'best_cards', 0), 40,
    'a count of nothing still counts one, or the board would score no round at all')

  eq(countingPlayers(
    [{ playerId: 'a', score: 12 }, { playerId: 'b', score: 40 }, { playerId: 'c', score: 31 }],
    'stableford', 'best_cards', 2), ['b', 'c'], 'and it says who counted, best first')
  eq(countingPlayers(
    [{ playerId: 'zed', score: 20 }, { playerId: 'amy', score: 20 }],
    'stableford', 'best_cards', 1), ['amy'],
    'a tie is broken by id, so the same round scored twice picks the same player')
}

// ─── End to end ────────────────────────────────────────────────

section('A tags board scored from real cards')
{
  // Two tags of two, two rounds, every hole played. Points per hole are
  // flat so the totals are obvious: 18 holes × n points.
  const players = [
    { id: 'p1', name: 'Alice', handicap: 10, gender: 'M', team_id: 'tag-eu' },
    { id: 'p2', name: 'Bob', handicap: 14, gender: 'M', team_id: 'tag-eu' },
    { id: 'p3', name: 'Cara', handicap: 18, gender: 'F', team_id: 'tag-us' },
    { id: 'p4', name: 'Dan', handicap: 12, gender: 'M', team_id: 'tag-us' },
  ]
  const rounds = [
    { id: 'r1', round_number: 1, status: 'completed', courses: { id: 'c1', name: 'Ballyliffin' } },
    { id: 'r2', round_number: 2, status: 'completed', courses: { id: 'c1', name: 'Portsalon' } },
  ]
  const holes = Array.from({ length: 18 }, (_, i) => ({
    id: `h${i + 1}`, hole_number: i + 1, par: 4, stroke_index: i + 1, course_id: 'c1',
  }))
  const cardOf = (playerId: string, roundId: string, perHole: number) =>
    holes.map(h => ({
      player_id: playerId, hole_id: h.id, round_id: roundId,
      gross_score: 6 - perHole, stableford_points: perHole, no_return: false,
    }))

  // Round 1 — Europe: Alice 54, Bob 36. USA: Cara 18, Dan 36.
  // Round 2 — Europe: Alice 18, Bob 36. USA: Cara 54, Dan 36.
  const scores = [
    ...cardOf('p1', 'r1', 3), ...cardOf('p2', 'r1', 2),
    ...cardOf('p3', 'r1', 1), ...cardOf('p4', 'r1', 2),
    ...cardOf('p1', 'r2', 1), ...cardOf('p2', 'r2', 2),
    ...cardOf('p3', 'r2', 3), ...cardOf('p4', 'r2', 2),
  ]
  const teams = [
    { id: 'tag-eu', name: 'Europe', color: '#2563EB', team_set: MAIN_SET },
    { id: 'tag-us', name: 'USA', color: '#DC2626', team_set: MAIN_SET },
  ]
  const memberships = players.map(p => ({
    team_id: p.team_id, team_set: MAIN_SET, player_id: p.id,
  }))

  const ctx = buildRowContext({
    players, teams, memberships, holes, rounds,
    courseByRound: new Map(rounds.map(r => [r.id, 'c1'])),
    scores,
    liveScores: [],
    roundHandicaps: players.flatMap(p =>
      rounds.map(r => ({ round_id: r.id, player_id: p.id, playing_handicap: p.handicap }))),
    tees: [],
    activeRoundIds: [],
    livePlayerIds: [],
    legacyTeamScoring: null,
  } as never)

  function board(over: Partial<Leaderboard> = {}): Leaderboard {
    return {
      id: 'b-tag', audience: 'team', competition: 'league',
      scoring: 'stableford', combine: 'total', tagMode: 'best_cards', ...over,
    }
  }

  {
    // Best 1: Europe 54 + 36 = 90, USA 36 + 54 = 90. Dead level.
    const rows = buildRows(board({ tagCount: 1 }), ctx)
    eq(rows.map(r => r.name), ['Europe', 'USA'], 'both tags have a row')
    eq(rows.map(r => r.total), [90, 90], 'best card each round, added up')
    eq(rows.map(r => r.place), [1, 1],
      'level tags share the place — golf\'s ordering, not the row\'s index')
  }

  {
    // Best 2 = every card here: Europe 90+54=144, USA 54+90=144.
    const rows = buildRows(board({ tagCount: 2 }), ctx)
    eq(rows.map(r => r.total), [144, 144], 'best two of two is both cards')
    eq(buildRows(board({ tagMode: 'all_cards' }), ctx).map(r => r.total), [144, 144],
      'and every card counting says the same thing about the same field')
  }

  {
    const rows = buildRows(board({ tagCount: 1 }), ctx)
    eq(rows[0].perRound, { r1: 54, r2: 36 }, 'the round columns are the counting cards')
    eq(rows[0].playerIds, ['p1', 'p2'], 'a row carries its tag\'s players')
    eq(rows[0].subLabel, '2 players', 'and says how many, rather than listing them again')
    eq(rows[0].color, '#2563EB', 'the tag\'s own colour rides on the row')
  }

  {
    // Dropping the worst round: Europe keeps 54, USA keeps 54.
    const rows = buildRows(board({ tagCount: 1, discardWorst: 1 }), ctx)
    eq(rows.map(r => r.total), [54, 54], 'discard works, inherited from the shared pipeline')
    eq(rows.map(r => r.totalAll), [90, 90], 'and the all-in total is kept for the switch')
  }

  {
    // Paid by position each round — the fourth "mode" that is not a mode.
    const rows = buildRows(board({
      tagCount: 1, combine: 'position', customPoints: [10, 6],
    }), ctx)
    eq(rows.map(r => r.total), [16, 16],
      'points by day position needs no mode of its own — combine does it')
  }

  {
    // A tag whose second player did not go out. Best 2 of the one card
    // that exists is that card, not that card plus a nought.
    const thin = buildRowContext({
      players, teams, memberships, holes, rounds,
      courseByRound: new Map(rounds.map(r => [r.id, 'c1'])),
      scores: [...cardOf('p1', 'r1', 3), ...cardOf('p3', 'r1', 1), ...cardOf('p4', 'r1', 2)],
      liveScores: [],
      roundHandicaps: players.flatMap(p =>
        rounds.map(r => ({ round_id: r.id, player_id: p.id, playing_handicap: p.handicap }))),
      tees: [], activeRoundIds: [], livePlayerIds: [], legacyTeamScoring: null,
    } as never)
    const rows = buildRows(board({ tagCount: 2 }), thin)
    const eu = rows.find(r => r.name === 'Europe')
    eq(eu?.total, 54, 'a missing card is missing, never a nought')
  }

  {
    // An untagged player belongs to no row, and is not silently binned
    // into somebody else's.
    const rows = buildRows(board({ tagCount: 2 }), ctx)
    const everyone = rows.flatMap(r => r.playerIds)
    eq(everyone.length, 4, 'every tagged player counts once')
    eq(new Set(everyone).size, 4, 'and only once')
  }

  // ── The day's team cards feeding the tag ──
  //
  // The same field, now going out as pairs on the day's own sheet: Alice
  // with Bob for Europe, Cara with Dan for the USA.
  section('The day\'s team cards count towards the tag that made them')
  {
    const dayTeams = [
      ...teams,
      { id: 'pair-eu-r1', name: 'Alice & Bob', color: '#2563EB', team_set: daySheetId('r1') },
      { id: 'pair-us-r1', name: 'Cara & Dan', color: '#DC2626', team_set: daySheetId('r1') },
    ]
    const dayMembers = [
      ...memberships,
      { team_id: 'pair-eu-r1', team_set: daySheetId('r1'), player_id: 'p1' },
      { team_id: 'pair-eu-r1', team_set: daySheetId('r1'), player_id: 'p2' },
      { team_id: 'pair-us-r1', team_set: daySheetId('r1'), player_id: 'p3' },
      { team_id: 'pair-us-r1', team_set: daySheetId('r1'), player_id: 'p4' },
    ]
    const dayCtx = buildRowContext({
      players, teams: dayTeams, memberships: dayMembers, holes, rounds,
      courseByRound: new Map(rounds.map(r => [r.id, 'c1'])),
      scores, liveScores: [],
      roundHandicaps: players.flatMap(p =>
        rounds.map(r => ({ round_id: r.id, player_id: p.id, playing_handicap: p.handicap }))),
      tees: [], activeRoundIds: [], livePlayerIds: [], legacyTeamScoring: null,
    } as never)

    // Better ball, best 1 on every hole. Round 1: Europe is Alice's 3 a
    // hole against Bob's 2, so 54; USA is Dan's 2 against Cara's 1, so 36.
    // Round 2 has no day teams at all, so it counts nothing.
    const dayBoard = board({
      tagMode: 'day_teams', tagCount: undefined,
      teamFormat: 'better_ball', countingScores: 1,
    })
    const rows = buildRows(dayBoard, dayCtx)
    eq(rows.map(r => [r.name, r.total]), [['Europe', 54], ['USA', 36]],
      'each pair\'s composite card lands on the tag its players share')
    eq(rows[0].perRound, { r1: 54, r2: 0 },
      'a day nobody made teams on counts nothing — a lone card is not a team card')
    eq(rows[0].playedRounds, ['r1'],
      'and is not a round the tag played, rather than a nought it scored')

    // Two counting scores is both cards: Europe 54+36, USA 18+36.
    eq(buildRows(board({
      tagMode: 'day_teams', tagCount: undefined,
      teamFormat: 'better_ball', countingScores: 2,
    }), dayCtx).map(r => r.total), [90, 54],
      'and the board\'s own team format decides what a team card is')
  }

  section('A team the tags cannot agree on is skipped, never half-credited')
  {
    const mixed = [
      ...teams,
      { id: 'mixed-r1', name: 'Alice & Cara', color: '#16A34A', team_set: daySheetId('r1') },
    ]
    const mixedMembers = [
      ...memberships,
      { team_id: 'mixed-r1', team_set: daySheetId('r1'), player_id: 'p1' },
      { team_id: 'mixed-r1', team_set: daySheetId('r1'), player_id: 'p3' },
    ]
    eq(tagOfTeam(['p1', 'p2'], mixedMembers), 'tag-eu', 'one tag between them is that tag\'s')
    eq(tagOfTeam(['p1', 'p3'], mixedMembers), null, 'two tags is nobody\'s')
    eq(tagOfTeam(['p1', 'nobody'], mixedMembers), null, 'and an untagged member is nobody\'s')
    eq(tagOfTeam([], mixedMembers), null, 'an empty team counts for no one')

    const mixedCtx = buildRowContext({
      players, teams: mixed, memberships: mixedMembers, holes, rounds,
      courseByRound: new Map(rounds.map(r => [r.id, 'c1'])),
      scores, liveScores: [],
      roundHandicaps: players.flatMap(p =>
        rounds.map(r => ({ round_id: r.id, player_id: p.id, playing_handicap: p.handicap }))),
      tees: [], activeRoundIds: [], livePlayerIds: [], legacyTeamScoring: null,
    } as never)
    const rows = buildRows(board({
      tagMode: 'day_teams', tagCount: undefined,
      teamFormat: 'better_ball', countingScores: 1,
    }), mixedCtx)
    eq(rows.map(r => r.total), [0, 0],
      'a mixed team credits neither side — half a score under the wrong tag is worse than none')
  }
}

// ─── Wiring: the portal ────────────────────────────────────────

section('The portal writes through the one membership writer')
{
  const client = read('app/trip/[tripCode]/organiser/tags/TagPortalClient.tsx')
  ok(client.includes("setTeam(tripId, playerId, TAG_SET, tagId)"),
    'assignment goes through setTeam on the tag sheet — never a raw insert')
  ok(!/from\('team_members'\)/.test(client),
    'the portal never touches team_members itself')
  ok(client.includes('clearMirror('),
    'and removing a tag clears the mirror, as deleting teams always has')
  ok(client.includes('window.confirm('),
    'removing a tag is deliberate, never one tap')
  ok(client.includes('setMemberships(prev)') && client.includes('setTeams(prev)'),
    'every write is optimistic and reverts when refused')
  ok(client.includes('PRESET_COLORS'), 'tags colour from the one palette')

  const page = read('app/trip/[tripCode]/organiser/tags/page.tsx')
  ok(page.includes('isEvent(trip.kind)'), 'events only — a trip is pointed at Trip Setup')
  ok(page.includes('PasscodeGate'), 'behind the same organiser PIN as the rest of the area')
  ok(page.includes("select('event_permissions')"),
    'the permission rides in its own query — the fail-soft rule')
}

section('The palette is one copy, wherever a team comes from')
{
  const lib = read('lib/teamColors.ts')
  ok(lib.includes('#DC2626'), 'the twelve live in lib/teamColors.ts')
  const editor = read('app/trip/[tripCode]/teams/TripTeamsClient.tsx')
  ok(editor.includes("from '@/lib/teamColors'"),
    'the drag editor imports them rather than holding its own')
  ok(!/const PRESET_COLORS = \[/.test(editor),
    '  …and no longer declares a second copy')
}

// ─── Wiring: the doors ─────────────────────────────────────────

section('The organiser dashboard carries the door')
{
  const client = read('app/trip/[tripCode]/organiser/OrganiserClient.tsx')
  ok(client.includes('/organiser/tags'), 'a card links to the portal')
  ok(client.includes('Teams &amp; tags'), 'under the amalgamated heading')
  ok(client.includes('{tagsSummary}'), 'showing where tagging stands')

  const page = read('app/trip/[tripCode]/organiser/page.tsx')
  ok(page.includes('describeTags('), 'summarised on the server, through the one copy')
  ok(page.includes("{ count: 'exact', head: true }") && page.includes("eq('team_set', TAG_SET)"),
    'counted in headers, scoped to the tag sheet')
}

section('The field only picks its own tag when the organiser says so')
{
  const page = read('app/trip/[tripCode]/teams/page.tsx')
  ok(page.includes('assign_tag'), 'the teams screen reads the permission')
  ok(page.includes('tags.length > 0'),
    'and offers nothing until there are tags to pick from')
  ok(page.includes('selfPick || mayPickTag'),
    'either standing grant opens the join face — neither speaks for the other')

  const join = read('app/trip/[tripCode]/teams/TagJoinClient.tsx')
  ok(join.includes('setTeam(tripId, viewer.id, TAG_SET, tagId)'),
    'the field writes through the same one writer')
  ok(!/from\('teams'\)/.test(join),
    'and can never make, rename or remove a tag — only join one')
  ok(join.includes('viewerPlayerId'),
    'identity is the claim cookie, personalising and never authorising')
}

section('The board is offered where boards are made, and only on events')
{
  const form = read('app/components/LeaderboardSetup.tsx')
  ok(form.includes('askTags'), 'the cascade takes the events-only flag')
  ok(/askTags && \(/.test(form),
    '  …and a trip is never offered the Tags choice')
  ok(form.includes('tagMode: TAG_MODES[0].key'),
    'picking Tags writes a mode straight away — the draft is never a tags board without one')
  ok(form.includes('isTagBoard(lb)) return { ...lb, teamSet: TAG_SET }'),
    'saving pins it to the tag sheet rather than allocating a fresh one')
  ok(form.includes('squatters'),
    'and an ordinary team board sitting on the tag sheet is moved off, never left sharing')

  const setupPage = read('app/trip/[tripCode]/setup/page.tsx')
  ok(setupPage.includes('askTags={isEvent(trip.kind)}'),
    'Trip Setup asks only for an event')
  const league = read('app/dashboard/create/CreateLeagueForm.tsx')
  ok(league.includes('askTags'), 'and so does league creation')

  const portal = read('app/trip/[tripCode]/organiser/tags/TagPortalClient.tsx')
  ok(portal.includes('<LeaderboardSetup'),
    'the portal offers the same cascade, never a second smaller copy')
  ok(portal.includes('tagsInPlay(boards)'),
    'and says whether the tags are ranked yet through the one predicate')

  // A tags board is a league board, so the leaderboard page tabs it like
  // any other without knowing tags exist.
  const client = read('app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx')
  ok(client.includes("b.competition === 'league'"),
    'the leaderboard tabs every league board — a tags board rides in unchanged')
  ok(client.includes('the sides are set in the organiser area'),
    'and an empty one points at where tags come from, not at Trip Setup')
  ok(client.includes('picked on the tee sheet'),
    'while an empty day board points at where its fourballs come from')
}

// ─── Trips are untouched ───────────────────────────────────────

section('Nothing here reaches a trip')
{
  const lib = read('lib/tagBoards.ts')
  ok(lib.includes('Pure.') && !/from '@\/lib\/supabase'/.test(lib),
    'the rules are pure — no I/O to leak into a trip screen')

  for (const f of [
    'app/trip/[tripCode]/teams/TripTeamsClient.tsx',
    'app/trip/[tripCode]/teams/TeamJoinClient.tsx',
  ]) {
    ok(!read(f).includes('tagBoards'),
      `${f.split('/').pop()} is untouched by tags`)
  }
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
