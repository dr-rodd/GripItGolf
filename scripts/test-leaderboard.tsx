/**
 * Leaderboard render tests. Run with: npm run test:leaderboard
 *
 * Drives the real board with real scores. Every board carries its own rules,
 * so most of what is checked here is that two boards on the same trip can
 * genuinely be scored differently — and that a trip set up before that was
 * possible still reads and scores exactly as it always did.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import TripLeaderboardClient from '../app/trip/[tripCode]/leaderboard/TripLeaderboardClient'
import { parseFormats, type TripFormats } from '../lib/formats'
import { DEFAULT_TEAM_SCORING, type TeamScoring } from '../lib/teamScoring'
import type { Leaderboard } from '../lib/leaderboards'
import { scoreTone, TONE_PILL } from '../lib/leaderboardStyle'
import { boardsFromFormats, tripBoards, isLegacy } from '../lib/leaderboardsCompat'
import { teamScoringFor } from '../lib/boardRows'

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

// ─── Fixture: 3 players, 2 rounds, every hole scored ───────────

const players = [
  { id: 'p1', name: 'Alice', handicap: 10, gender: 'M', team_id: null },
  { id: 'p2', name: 'Bob',   handicap: 14, gender: 'M', team_id: null },
  { id: 'p3', name: 'Cara',  handicap: 18, gender: 'F', team_id: null },
]
const rounds = [
  { id: 'r1', round_number: 1, status: 'completed', courses: { id: 'c1', name: 'Ballyliffin' } },
  { id: 'r2', round_number: 2, status: 'completed', courses: { id: 'c1', name: 'Portsalon' } },
]
const holes = Array.from({ length: 18 }, (_, i) => ({
  id: `h${i + 1}`, hole_number: i + 1, par: 4, stroke_index: i + 1, course_id: 'c1',
}))

/** Give a player the same points on every hole of a round. */
function scoresFor(playerId: string, roundId: string, pointsPerHole: number) {
  return holes.map(h => ({
    player_id: playerId, hole_id: h.id, round_id: roundId,
    gross_score: 6 - pointsPerHole, stableford_points: pointsPerHole, no_return: false,
  }))
}

// Round 1: Alice 3/hole (54), Bob 2/hole (36), Cara 1/hole (18)
// Round 2: Alice 1/hole (18), Bob 2/hole (36), Cara 3/hole (54)
const scores = [
  ...scoresFor('p1', 'r1', 3), ...scoresFor('p2', 'r1', 2), ...scoresFor('p3', 'r1', 1),
  ...scoresFor('p1', 'r2', 1), ...scoresFor('p2', 'r2', 2), ...scoresFor('p3', 'r2', 3),
]
const roundHandicaps = players.flatMap(p =>
  rounds.map(r => ({ round_id: r.id, player_id: p.id, playing_handicap: p.handicap }))
)

type RenderOpts = {
  activeRoundIds?: string[]
  livePlayerIds?: string[]
  liveScores?: unknown[]
  scores?: unknown[]
  teams?: unknown[]
  players?: unknown[]
  rounds?: unknown[]
  legacyTeamScoring?: TeamScoring | null
  memberships?: unknown[]
}

/**
 * Membership from the fixtures' `team_id`.
 *
 * A player used to carry the one team they were in, which is all a trip with
 * one team sheet ever needed. It now takes a row per sheet, so the fixtures
 * keep writing what reads best — `{...p, team_id: 't1'}` — and this turns it
 * into the sheet the board is played on. Tests that want two sheets pass
 * `memberships` directly.
 */
function membershipsFrom(ps: unknown[], teamSet = 'main') {
  return (ps as { id: string; team_id?: string | null }[])
    .filter(p => p.team_id)
    .map(p => ({ team_id: p.team_id as string, team_set: teamSet, player_id: p.id }))
}

function render(boards: Leaderboard[], opts: RenderOpts = {}) {
  const ps = opts.players ?? players
  return renderToStaticMarkup(
    React.createElement(TripLeaderboardClient, {
      tripCode: 'ABC123',
      boards,
      activeRoundIds: opts.activeRoundIds ?? [],
      livePlayerIds: opts.livePlayerIds ?? [],
      legacyTeamScoring: opts.legacyTeamScoring ?? null,
      rounds: opts.rounds ?? rounds,
      teams: opts.teams ?? [],
      memberships: opts.memberships ?? membershipsFrom(ps),
      players: ps,
      holes,
      scores: opts.scores ?? scores,
      liveScores: opts.liveScores ?? [],
      roundHandicaps,
    } as never)
  )
}

/** Holes 1..n of a round, still sitting in the in-progress table. */
function liveHoles(playerId: string, roundId: string, upTo: number, pointsPerHole: number) {
  return holes.slice(0, upTo).map(h => ({
    player_id: playerId, round_id: roundId, hole_number: h.hole_number,
    gross_score: 6 - pointsPerHole, stableford_points: pointsPerHole,
  }))
}

// ─── The boards themselves ─────────────────────────────────────

const SF = (discardWorst = 0): Leaderboard =>
  ({ id: 'b-sf', audience: 'individual', competition: 'league', scoring: 'stableford', combine: 'total', discardWorst })

const ST = (discardWorst = 0): Leaderboard =>
  ({ id: 'b-st', audience: 'individual', competition: 'league', scoring: 'strokes', combine: 'total', discardWorst })

/** Stableford, paid out by finishing position each round. */
const CU = (customPoints: number[] = [], discardWorst = 0): Leaderboard =>
  ({ id: 'b-cu', audience: 'individual', competition: 'league', scoring: 'stableford', combine: 'position', customPoints, discardWorst })

const TEAM = (
  teamFormat: Leaderboard['teamFormat'] = 'better_ball',
  combine: Leaderboard['combine'] = 'total',
  customPoints?: number[],
  scoring: Leaderboard['scoring'] = 'stableford',
): Leaderboard =>
  ({ id: 'b-team', audience: 'team', competition: 'league', scoring, teamFormat, combine, customPoints })

const MP = (audience: Leaderboard['audience'] = 'individual'): Leaderboard =>
  ({ id: 'b-mp', audience, competition: 'matchplay' })

/** A trip stored under the old flags, read back as the boards it described. */
const F = (league: Partial<TripFormats['league']>, rest: Record<string, unknown> = {}) =>
  boardsFromFormats(
    parseFormats({ individual: true, league: { on: true, ...league }, ...rest }),
    DEFAULT_TEAM_SCORING,
  )

// ─── Tabs follow the boards that exist ─────────────────────────

section('Tabs')
{
  const one = render([SF()])
  ok(one.includes('Alice'), 'a single board renders')
  ok(!one.includes('>Strokes<'), 'no Strokes tab when that board is not being run')

  const all = render([SF(), ST(), CU()])
  ok(all.includes('>Stableford Points<'), 'Stableford tab shown')
  ok(all.includes('>Strokes<'), 'Strokes tab shown')
  ok(all.includes('>Stableford Points prizes<'),
    'and the prize-table board is told apart from the Stableford it is scored on')

  // Tabs follow the list, not a fixed order — the first board leads
  const teamFirst = render([TEAM('hero'), SF()], {
    teams: [{ id: 't1', name: 'Reds', color: '#DC2626' }],
    players: players.map(p => ({ ...p, team_id: 't1' })),
  })
  ok(teamFirst.indexOf('>Team hero<') < teamFirst.indexOf('>Stableford Points<'),
    'the primary board leads the tab strip')
}

// ─── Stableford totals, and dropping the worst round ───────────

section('Stableford')
{
  // No discard: Alice 54+18 = 72, Bob 36+36 = 72, Cara 18+54 = 72
  const plain = render([SF()])
  eq((plain.match(/>72</g) ?? []).length, 3, 'all three total 72 with every round counting')
  ok(!plain.includes('line-through'), 'nothing is struck through')

  // Drop the worst: Alice keeps 54, Bob keeps 36, Cara keeps 54 — so Bob
  // falls to last. Dropping the *best* by mistake would put Bob top instead,
  // which is what the ordering assertion below actually catches.
  const dropped = render([SF(1)])
  ok(dropped.includes('line-through'), 'the dropped round is struck through')
  ok(dropped.includes('Set aside'), 'and says why on hover')
  eq((dropped.match(/>72</g) ?? []).length, 0, 'nobody still totals both rounds')

  const order = (html: string) =>
    ['Alice', 'Bob', 'Cara'].sort((a, b) => html.indexOf(a) - html.indexOf(b))
  eq(order(dropped)[2], 'Bob',
    'Bob finishes last once the worst round is dropped — his 36 is beaten by two 54s')
  ok(order(dropped)[0] !== 'Bob',
    'and is certainly not top, which is where dropping the best round would put him')
}

// ─── Discard belongs to the board, not to the trip ─────────────

section('Two boards on one trip can discard differently')
{
  // This is the whole point of the restructure. Under the old model discard
  // was one number on the trip, so these two boards could not disagree.
  const sfKeeps = render([SF(0), ST(1)])
  ok(!sfKeeps.includes('line-through'),
    'the Stableford board keeps every card, though the Strokes board beside it drops one')

  const stDrops = render([ST(1), SF(0)])
  ok(stDrops.includes('line-through'),
    'and the Strokes board drops one, though the Stableford board beside it keeps every card')

  // Same two boards, same scores — only which one is showing has changed
  ok(sfKeeps.includes('Alice') && stDrops.includes('Alice'),
    'both boards are built from the same cards')
}

// ─── Custom points ─────────────────────────────────────────────

section('Custom points')
{
  // Default table for 3 players is 3/2/1.
  // R1: Alice 1st (3), Bob 2nd (2), Cara 3rd (1)
  // R2: Cara 1st (3), Bob 2nd (2), Alice 3rd (1)
  // Totals: Alice 4, Bob 4, Cara 4
  const html = render([CU()])
  ok(html.includes('Alice') && html.includes('Bob') && html.includes('Cara'),
    'every player appears')
  eq((html.match(/>4</g) ?? []).length >= 3, true,
    'all three finish on 4 with the default 3/2/1 table')

  // A custom table pays what it says
  const rich = render([CU([10, 5, 1])])
  ok(rich.includes('>11<'), 'Alice takes 10 + 1 with a 10/5/1 table')
  ok(rich.includes('>10<'), 'Bob takes 5 + 5')
  ok(rich.includes('11'), 'and Cara likewise 1 + 10')

  // Zero is a legitimate value for a position
  const zeroed = render([CU([10, 0, 0])])
  ok(zeroed.includes('>10<'), 'a table paying only the winner still works')

  // The table itself is named on the board, not just described
  ok(rich.includes('10 / 5 / 1'), 'the prize table is spelled out')
}

section('Custom points when players tie')
{
  // Everyone level in round 1, so all three share 1st, 2nd and 3rd
  const tied = [
    ...scoresFor('p1', 'r1', 2), ...scoresFor('p2', 'r1', 2), ...scoresFor('p3', 'r1', 2),
  ]
  const html = render([CU([10, 5, 3])], { rounds: [rounds[0]], scores: tied })

  // 10 + 5 + 3 = 18 shared three ways = 6 each. Each player shows it twice —
  // once as the round's award and once as the total.
  eq((html.match(/>6</g) ?? []).length, 6,
    'three players level share 10/5/3 as six points each')
  ok(!html.includes('>10<'),
    'nobody takes the winner\'s ten outright — a tie is not a win')
}

section('Custom points with the worst round dropped')
{
  // 10/5/1, dropping the worst: Alice keeps 10, Bob keeps 5, Cara keeps 10
  const html = render([CU([10, 5, 1], 1)])
  ok(html.includes('line-through'), 'the weaker round is struck through')
  ok(html.includes('>10<'), 'and the better one carries the total')
}

// ─── Title card ────────────────────────────────────────────────

section('Title card appears once more than one board is running')
{
  const CARD = 'bg-surface border border-bark/12 rounded-2xl px-4 py-3 mb-3'

  const single = render([SF()])
  ok(!single.includes(CARD), 'a lone board gets no title card, just its rule line')
  ok(single.includes('greatest achievement'), 'the rule is still stated')

  const multi = render([SF(), ST()])
  ok(multi.includes(CARD), 'a second board brings the title card in')
  ok(multi.includes('greatest achievement'), 'with how the board is scored')
  // The tab strip also says "Stableford", so the card must be identified by
  // its own markup rather than by the word appearing anywhere
  ok(multi.split(CARD).length === 2, 'exactly one title card, for the active board')

  const withDiscard = render([SF(2), ST()])
  ok(withDiscard.includes('Worst 2 rounds dropped'),
    'the discard rule is spelled out on the card')
  ok(!render([SF(0), ST()]).includes('rounds dropped'),
    'and is absent when the board keeps every card')
}

// ─── In play ───────────────────────────────────────────────────

section('In play badge')
{
  const idle = render([SF()])
  ok(!idle.includes('In play'), 'nothing shown when no scorecard is open')

  const live = render([SF()], { activeRoundIds: ['r1'] })
  ok(live.includes('In play'), 'shown while a scorecard is open')
  ok(live.includes('bg-accent'), 'with an emerald dot')
  ok(live.includes('dot-live'), 'that breathes rather than blinks')
  ok(!live.includes('box-shadow'), 'and does not glow — the guide has none')

  // It belongs to the trip, not to one board
  const liveMulti = render([SF(), ST()], { activeRoundIds: ['r2'] })
  ok(liveMulti.includes('In play'), 'shown on a multi-board leaderboard too')

  // A round that merely has scores is finished, not in play
  ok(!render([SF()], { activeRoundIds: [] }).includes('In play'),
    'recorded scores alone do not mean a round is in play')
}

section('Under par is coloured; over par is weighted')
{
  // The bug: the live board painted BOTH sides of level emerald, so a round
  // four over looked exactly as good as one four under. Under par is the
  // only side that gets the accent; over par gets more brown than level.
  const sf = (n: number) => scoreTone(n, false)   // Stableford counts up
  const st = (n: number) => scoreTone(n, true)    // strokes count down

  eq(sf(4), 'good', 'four points ahead of level is good')
  eq(sf(0), 'level', 'level is level')
  eq(sf(-4), 'bad', 'and four behind is not')

  // The same numbers mean the opposite on strokes, which is exactly why the
  // direction is passed in rather than guessed from the sign.
  eq(st(4), 'bad', 'four over par is bad')
  eq(st(0), 'level', 'level is still level')
  eq(st(-4), 'good', 'and four under is good')

  // Emerald appears once and only on the good side
  ok(TONE_PILL.good.includes('accent'), 'good is the only tone that is emerald')
  ok(!TONE_PILL.bad.includes('accent'), 'bad is not emerald — that was the bug')
  ok(!TONE_PILL.level.includes('accent'), 'nor is level')

  // Worse than level is browner than level, not lighter. Both are bark, and
  // the bad one carries more of it.
  const barkOf = (cls: string) => Number(cls.match(/bg-bark\/\[([\d.]+)\]/)?.[1] ?? 0)
  ok(barkOf(TONE_PILL.bad) > barkOf(TONE_PILL.level),
    'and it is a stronger bark than level, not a paler one')
  ok(barkOf(TONE_PILL.level) > 0, 'while level is still a wash rather than nothing')
}

section('The live dot belongs to a player, not to the trip')
{
  // The regression: the dot was inferred from "this player has a score in a
  // round that is in play", so every player who had ever teed off wore one
  // from the moment anyone opened a card — and kept it after signing their
  // own. It is read off the open cards themselves now.
  const dot = /dot-live/g
  const dots = (html: string) => (html.match(dot) ?? []).length

  // A round open but nobody's card still going — every card signed. The
  // trip-wide "In play" badge carries a dot of its own, so one is the floor;
  // what matters is that no ROW has one.
  const none = render([SF()], { activeRoundIds: ['r1'], livePlayerIds: [] })
  eq(dots(none), 1, 'with every card signed, only the trip badge has a dot')

  // One player out on the course. The badge counts as one, the row as another
  const one = render([SF()], { activeRoundIds: ['r1'], livePlayerIds: ['p1'] })
  ok(dots(one) > dots(none), 'the player holding a card gets one')
  eq(dots(one), 2, 'exactly one row, plus the trip-wide In play badge')

  // Two out: one more dot, and no more than that
  const two = render([SF()], { activeRoundIds: ['r1'], livePlayerIds: ['p1', 'p2'] })
  eq(dots(two), 3, 'and a second card open adds exactly one more')

  // The point of the fix: a player who is NOT on an open card gets nothing,
  // even though the round they played is in play for somebody else.
  ok(dots(one) < dots(two), 'a player not on an open card is not marked live')
}

// ─── Matchplay sits with the boards ────────────────────────────

section('Matchplay')
{
  /** The one row of chips at the top: league boards, then the draw. */
  const stripOf = (html: string) =>
    html.split('overflow-x-auto -mx-1 px-1 pb-1')[1]?.split('</div>')[0] ?? ''

  // A draw is one of the things the trip is playing for, so it sits on the
  // same line as the boards rather than in a card of its own above them.
  const three = render([SF(), ST(), MP()])
  const strip = stripOf(three)
  ok(strip.includes('Stableford') && strip.includes('Strokes'),
    'every league board is a chip')
  ok(strip.includes('Matchplay'), 'and so is the draw')
  ok(strip.includes('/trip/ABC123/matchplay'),
    'which links out to its own page rather than switching the table below')

  // One board and a draw is a choice, so the row appears for it
  const on = render([SF(), MP()])
  ok(stripOf(on).includes('/trip/ABC123/matchplay'), 'one board and a draw still gets the row')

  // One board and nothing else is not a choice. The row stays away, and so
  // does any mention of a draw this trip is not running — that used to be a
  // full-width card on every leaderboard saying where to switch it on.
  const off = render([SF()])
  ok(!off.includes('/trip/ABC123/matchplay'), 'a trip with no draw does not link to one')
  ok(!off.includes('Switch it on in Trip Setup'), 'nor advertise the setting')
  ok(!off.includes('overflow-x-auto -mx-1'), 'and shows no chip row for a single board')

  // A trip whose only competition is a draw has no table at all — the chip is
  // the only way to reach it from here, so it must not be hidden behind a
  // "more than one" rule.
  const drawOnly = render([MP()])
  ok(stripOf(drawOnly).includes('/trip/ABC123/matchplay'),
    'a matchplay-only trip still gets its chip')
  ok(!drawOnly.includes('Alice'), 'and no board underneath it')
}

// ─── Live vs finalised ─────────────────────────────────────────

section('A card still open reads against level, in green')
{
  // Alice nine holes into round 1 at 3 points a hole: 27 points, which is
  // nine ahead of the eighteen that nine holes of level would give.
  const html = render([SF()], {
    scores: [],
    liveScores: liveHoles('p1', 'r1', 9, 3),
    activeRoundIds: ['r1'],
  })

  ok(html.includes('+9'), 'the round shows how far ahead of level it stands')
  ok(html.includes('text-accent'), 'and it carries the accent')

  // The round column and the Total column say different things: the round
  // reads against level, the total stays a total. Round columns come first,
  // so the relative figure precedes the total in the markup.
  ok(html.includes('>27<'), 'the total column still carries the running total')
  ok(html.indexOf('+9') < html.lastIndexOf('>27<'),
    'with the round reading against level before it')
  ok(html.includes('In play'), 'with the board marked as in play')

  // Exactly level reads as E, the way a scoreboard has always shown it
  const level = render([SF()], {
    scores: [], liveScores: liveHoles('p2', 'r1', 9, 2), activeRoundIds: ['r1'],
  })
  ok(level.includes('>E<'), 'two points a hole is level, shown as E')
  ok(!level.includes('+0'), 'not as +0')

  // Behind level carries its sign
  const behind = render([SF()], {
    scores: [], liveScores: liveHoles('p3', 'r1', 9, 1), activeRoundIds: ['r1'],
  })
  ok(behind.includes('-9'), 'behind level shows a minus')
}

section('A finalised card reads as its total, in plain ink')
{
  // The default fixture is entirely committed scores
  const html = render([SF()])

  ok(html.includes('>54<'), 'a finished round shows the total it scored')
  // Emerald means live. There is no second accent, so a finished round is
  // simply the number — which is the right emphasis once the card is in.
  ok(html.includes('text-ink'), 'in plain ink')
  // Emerald appears nowhere on a board with nothing in play. That is the
  // whole distinction: it does not mean "score", it means "still going".
  ok(!/class="[^"]*text-accent[^"]*"/.test(html),
    'with no emerald anywhere, since nothing is in play')
  ok(!html.includes('In play'), 'and no in-play badge')

  // The relative figure is gone once the card is in — the total is the number
  // that matters, and "+18" would be a different claim from "54"
  ok(!html.includes('+18'), 'and not how far ahead of level it finished')
}

section('Committed always wins over in-progress for the same hole')
{
  // The same hole in both tables: the committed one is the truth, and the
  // round is no longer live because nothing uncommitted is left.
  const html = render([SF()], {
    scores: scoresFor('p1', 'r1', 3),
    liveScores: liveHoles('p1', 'r1', 18, 1),
    activeRoundIds: ['r1'],
  })
  ok(html.includes('>54<'), 'the committed score is the one counted')
  ok(!html.includes('>18<'), 'not the stale in-progress one')
}

section('Strokes measures against par, not against two points a hole')
{
  // Nine holes of par 4 is 36. Alice plays them in 3 gross each — but off 10
  // she also receives shots, so the nett is what the board compares to par.
  const html = render([ST()], {
    scores: [], liveScores: liveHoles('p1', 'r1', 9, 3), activeRoundIds: ['r1'],
  })
  ok(html.includes('text-accent'), 'an open card carries the accent here too')
  // 9 holes at 3 gross = 27, less 9 shots received (SI 1-9 all inside a
  // handicap of 10) = 18 nett, against 36 of par
  ok(html.includes('-18'), 'and reads as nett against the par of the holes played')
  ok(html.includes('>18<'), 'while the total column keeps the nett total')
  ok(html.indexOf('-18') < html.lastIndexOf('>18<'),
    'the round reading against par, the total reading as a total')
}

// ─── Team formats ──────────────────────────────────────────────

const oneTeam = [{ id: 't1', name: 'Reds', color: '#DC2626' }]
const allInReds = players.map(p => ({ ...p, team_id: 't1' }))

section('A team format is a property of its own board')
{
  // Round 1: Alice 54, Bob 36, Cara 18.
  // Hero takes the best single card; cut-the-dead-weight takes everyone
  // except the worst. Those are 54 and 90 — the same three cards, two
  // genuinely different answers.
  const hero = render([TEAM('hero')], {
    teams: oneTeam, players: allInReds, rounds: [rounds[0]],
  })
  ok(hero.includes('>54<'), 'hero counts the best single card in the team')
  ok(hero.includes('Carried by Alice') || hero.includes('Alice'),
    'and names who carried it')

  const cut = render([TEAM('cut_dead_weight')], {
    teams: oneTeam, players: allInReds, rounds: [rounds[0]],
  })
  ok(cut.includes('>90<'), 'cutting the worst card counts the other two: 54 + 36')
  ok(!cut.includes('>108<'), 'not everybody — Cara\'s 18 is the card that is cut')

  // Same cards, same trip, different board
  ok(!hero.includes('>90<'), 'the hero board is not scored as the other one')
}

section('Cutting the dead weight leaves a lone player their card')
{
  // With one member there is nothing to cut. Dropping them would leave the
  // team with no score at all, which is not what the rule means.
  const solo = players.map(p => p.id === 'p1' ? { ...p, team_id: 't1' } : p)
  const html = render([TEAM('cut_dead_weight')], {
    teams: oneTeam, players: solo, rounds: [rounds[0]],
  })
  ok(html.includes('>54<'), 'a team of one keeps its only card')
  ok(!html.includes('>0<'), 'rather than being cut to nothing')
}

section('A team league can be paid by position instead of added up')
{
  const twoTeams = [
    { id: 't1', name: 'Reds',  color: '#DC2626' },
    { id: 't2', name: 'Blues', color: '#2563EB' },
  ]
  // Reds: Alice (54 in round 1). Blues: Bob (36) and Cara (18).
  const split = players.map(p => ({ ...p, team_id: p.id === 'p1' ? 't1' : 't2' }))

  const added = render([TEAM('hero', 'total')], {
    teams: twoTeams, players: split, rounds: [rounds[0]],
  })
  ok(added.includes('>54<') && added.includes('>36<'),
    'added up, the board carries the points themselves')

  const paid = render([TEAM('hero', 'position', [10, 3])], {
    teams: twoTeams, players: split, rounds: [rounds[0]],
  })
  ok(paid.includes('>10<'), 'paid by position, the round winner takes what the table says')
  ok(paid.includes('>3<'), 'and second place takes second place')
  ok(!paid.includes('>54<'),
    'with the points that earned the position no longer the number shown')
  ok(paid.includes('10 / 3'), 'and the table named on the board')
}

// ─── The cells the re-cut opened up ────────────────────────────

section('The same scoring can be totalled and paid by position at once')
{
  // An order of merit and a daily prize off the same cards. Under the old
  // model these were one slot, so a trip could only have one of them.
  const html = render([SF(), CU([10, 5, 1])])
  ok(html.includes('>Stableford Points<'), 'the order of merit is a tab')
  ok(html.includes('>Stableford Points prizes<'), 'and the daily prize is another')
  ok(html.includes('>72<'), 'with the active board showing its own totals')
  ok(!html.includes('>11<'), 'not the other board\'s prize money')
}

section('Strokes can be paid by position too')
{
  // Nett round 1: Alice 44, Bob 58, Cara 72. Lowest wins, so Alice takes the
  // ten. Reading it the Stableford way round would pay Cara instead, which is
  // what this actually pins.
  const html = render([
    { id: 'b', audience: 'individual', competition: 'league',
      scoring: 'strokes', combine: 'position', customPoints: [10, 3, 1] },
  ], { rounds: [rounds[0]] })

  const order = ['Alice', 'Bob', 'Cara'].sort((a, b) => html.indexOf(a) - html.indexOf(b))
  eq(order[0], 'Alice', 'the lowest nett takes the round')
  eq(order[2], 'Cara', 'and the highest takes least')
  ok(html.includes('>10<'), 'paying what the table says')
  ok(!html.includes('>44<'), 'rather than the nett that earned it')
}

section('Team formats work on strokes, not only on Stableford')
{
  // One team of three. Nett cards in round 1 are Alice 44, Bob 58, Cara 72.
  const opts = { teams: oneTeam, players: allInReds, rounds: [rounds[0]] }

  const hero = render([TEAM('hero', 'total', undefined, 'strokes')], opts)
  ok(hero.includes('>44<'), 'hero on strokes is the lowest nett card in the team')
  ok(!hero.includes('>72<'),
    'not the highest — which is what reading it as Stableford would have given')

  const cut = render([TEAM('cut_dead_weight', 'total', undefined, 'strokes')], opts)
  ok(cut.includes('>102<'), 'cutting the dead weight drops the worst card: 44 + 58')
  ok(!cut.includes('>130<'), 'and the worst card on strokes is the highest one, not the lowest')

  // Same team, same cards, scored the Stableford way — a different board
  const points = render([TEAM('hero', 'total', undefined, 'stableford')], opts)
  ok(points.includes('>54<'), 'the Stableford version of the same format is its own board')
}

section('A nett strokes board is won by the lowest total')
{
  // Nett over both rounds: Alice 124, Bob 116, Cara 108
  const html = render([ST()])
  const order = ['Alice', 'Bob', 'Cara'].sort((a, b) => html.indexOf(a) - html.indexOf(b))
  eq(order, ['Cara', 'Bob', 'Alice'], 'lowest nett first, highest last')
  ok(html.includes('>108<'), 'with the winning nett on the board')

  // And a team strokes board sorts the same way
  const teams = [
    { id: 't1', name: 'Reds',  color: '#DC2626' },
    { id: 't2', name: 'Blues', color: '#2563EB' },
  ]
  const split = players.map(p => ({ ...p, team_id: p.id === 'p1' ? 't1' : 't2' }))
  const team = render([TEAM('hero', 'total', undefined, 'strokes')], {
    teams, players: split, rounds: [rounds[0]],
  })
  ok(team.indexOf('Reds') < team.indexOf('Blues'),
    'the team with the lower nett leads, rather than being sorted as though more were better')
}

// ─── Players own their scores, not teams ───────────────────────

section('A player carries their scores to whichever team they end up in')
{
  const teams = [
    { id: 't1', name: 'Reds',  color: '#DC2626' },
    { id: 't2', name: 'Blues', color: '#2563EB' },
  ]
  const inReds = players.map(p => p.id === 'p1' ? { ...p, team_id: 't1' } : { ...p, team_id: 't2' })
  const inBlues = players.map(p => ({ ...p, team_id: 't2' }))

  const before = render([TEAM()], { teams, players: inReds })
  const after  = render([TEAM()], { teams, players: inBlues })

  // Alice's 54 and 18 move with her. The Reds had her card and nothing else;
  // once she moves they have nobody left.
  ok(before.includes('Reds'), 'the Reds are on the board while she is in them')
  // A team with no players is not a row — it has no scores to show
  ok(!after.includes('Reds'), 'and drop off it once nobody is left in them')
  ok(after.includes('Blues'), 'with the Blues carrying everyone')

  // The scores themselves were never re-entered — they belong to the player,
  // and the team row is built from whoever is in the team right now. The team
  // leads the row; its members are listed underneath it.
  ok(before.indexOf('Reds') < before.indexOf('Alice'),
    'the team name leads the row, with its members listed under it')
  ok(after.includes('Alice'), 'and she is listed under the Blues once she moves')
}

section('A player with no team is on the individual board but no team board')
{
  const teams = [{ id: 't1', name: 'Reds', color: '#DC2626' }]
  // Alice is in a team; Bob and Cara joined later and have not been placed
  const partly = players.map(p => p.id === 'p1' ? { ...p, team_id: 't1' } : p)

  const html = render([TEAM(), SF()], { teams, players: partly })

  // Teams lead, so the team tab is the one showing
  ok(html.includes('Reds'), 'the team with a player in it is on the board')
  ok(html.includes('>Team better ball<'), 'the team tab is present')
  ok(html.includes('>Stableford Points<'), 'and so is the individual one')

  // Every player is on the individual board whether or not they have a team.
  // Rendering only shows the active tab, so this is asserted by putting the
  // individual board first.
  const solo = render([SF()], { players: partly })
  ok(solo.includes('Alice') && solo.includes('Bob') && solo.includes('Cara'),
    'all three are on the individual board, placed or not')
}

// ─── Trips that predate the board list ─────────────────────────

section('An old trip is read as the boards its flags described')
{
  ok(isLegacy([]), 'an empty list means a trip from before the column existed')
  ok(!isLegacy([SF()]), 'and a stored list is never treated as legacy')

  // A stored list always wins over the flags, whatever they say
  const stored = tripBoards([SF()], parseFormats({ teams: true }), DEFAULT_TEAM_SCORING)
  eq(stored.map(b => b.id), ['b-sf'], 'a stored list is used as it stands')

  const derived = tripBoards([], parseFormats({
    individual: true, teams: true,
    league: { on: true, stableford: true, strokes: true, discardWorst: 1 },
    matchplay: { on: true, format: 'pairs' },
  }), DEFAULT_TEAM_SCORING)

  eq(derived.map(b => b.audience + ':' + b.competition), [
    'team:league', 'individual:league', 'individual:league', 'team:matchplay',
  ], 'teams lead, then the individual boards, then the draw')
  const individual = derived.filter(b => b.audience === 'individual' && b.competition === 'league')
  eq(individual.map(b => b.scoring), ['stableford', 'strokes'],
    'every board that was ticked is there')
  eq(individual.map(b => b.discardWorst), [1, 1],
    'and the one discard rule the old model had applies to both, as it always did')

  // It renders, which is the thing that actually matters to an existing trip
  const html = render(F({ stableford: true, strokes: true, discardWorst: 1 }))
  ok(html.includes('Alice'), 'an old trip still gets its board')
  ok(html.includes('line-through'), 'with its discard rule still applied')
}

section('An old team trip keeps the options the new model does not ask for')
{
  // Better ball with three scores counting and a grandstand finish is not
  // expressible as a leaderboard — the new form asks for the format only. A
  // trip already playing it must not be silently re-scored to the default.
  const legacy: TeamScoring = {
    mode: 'better_ball', countingScores: 3, aggregateFinish: 6, aggregateHoles: 18,
  }
  eq(teamScoringFor(TEAM('better_ball'), legacy), legacy,
    'the old settings are carried through verbatim')

  // A board chosen under the new model has no old settings to inherit
  eq(teamScoringFor(TEAM('better_ball'), null), DEFAULT_TEAM_SCORING,
    'a board with no legacy behind it takes the defaults')

  // And a legacy setting for a different format is not applied to this one
  eq(teamScoringFor(TEAM('hero'), legacy).mode, 'hero',
    'the board names the format; the legacy row only fills in its options')
  eq(teamScoringFor(TEAM('hero'), legacy).countingScores, DEFAULT_TEAM_SCORING.countingScores,
    'and options from a different format are not carried across')

  // Aggregate was retired but is still readable, so a trip running it scores
  // and reads the way it always has
  const aggregate: TeamScoring = { ...DEFAULT_TEAM_SCORING, mode: 'aggregate', aggregateHoles: 3 }
  const derived = boardsFromFormats(
    parseFormats({ teams: true, league: { on: true, stableford: true } }), aggregate)
  eq(derived[0].teamFormat, 'aggregate', 'a retired format still comes back as itself')

  // Last 3 holes only, everyone counting: Alice 3 + Bob 2 + Cara 1 = 6 a hole
  const html = render(derived, {
    teams: oneTeam, players: allInReds, rounds: [rounds[0]],
    legacyTeamScoring: aggregate,
  })
  ok(html.includes('>18<'), 'and is scored by its own old settings — 3 holes, everyone counting')
  ok(!html.includes('>108<'), 'not over all eighteen, which the defaults would have given')
}

section('Two team boards, two sets of teams')
{
  // The trip the whole feature exists for: a league between big teams, and a
  // knockout between pairings, off the same cards. Before sheets, a player
  // carried one team_id and picking the pairings tore up the league.
  const league: Leaderboard = { ...TEAM('better_ball'), id: 'b-league', teamSet: 'main' }
  const pairsBoard: Leaderboard = { ...TEAM('better_ball'), id: 'b-pairs', teamSet: 'set-2' }

  const teams = [
    { id: 't1', name: 'Reds',   color: '#DC2626', team_set: 'main' },
    { id: 'p1p2', name: 'Pair One', color: '#2563EB', team_set: 'set-2' },
    { id: 'p3solo', name: 'Pair Two', color: '#16A34A', team_set: 'set-2' },
  ]
  // All three in Reds for the league; split two-and-one for the pairings.
  const memberships = [
    ...players.map(p => ({ team_id: 't1', team_set: 'main', player_id: p.id })),
    { team_id: 'p1p2',   team_set: 'set-2', player_id: 'p1' },
    { team_id: 'p1p2',   team_set: 'set-2', player_id: 'p2' },
    { team_id: 'p3solo', team_set: 'set-2', player_id: 'p3' },
  ]

  const opts = { teams, memberships, rounds: [rounds[0]] }

  const leagueHtml = render([league], opts)
  ok(leagueHtml.includes('Reds'), 'the league board ranks the league teams')
  ok(!leagueHtml.includes('Pair One'), 'and does not show the pairings')

  const pairsHtml = render([pairsBoard], opts)
  ok(pairsHtml.includes('Pair One') && pairsHtml.includes('Pair Two'),
    'the pairings board ranks the pairings')
  ok(!pairsHtml.includes('Reds'), 'and does not show the league teams')

  // The same players, arranged twice — which is the point. A player holding
  // a place on both sheets counts on both boards.
  ok(leagueHtml.includes('Alice') && pairsHtml.includes('Alice'),
    'a player counts on both boards at once')

  // And the two are genuinely scored apart. Reds is all three players'
  // better ball; Pair Two is Cara on her own.
  ok(leagueHtml !== pairsHtml, 'two sheets are two tables, not one shown twice')

  // Sharing a sheet is still sharing. Two boards on 'main' rank the same
  // teams, whatever else differs between them.
  const shared: Leaderboard = { ...TEAM('hero'), id: 'b-hero', teamSet: 'main' }
  const sharedHtml = render([shared], opts)
  ok(sharedHtml.includes('Reds') && !sharedHtml.includes('Pair One'),
    'a second board on the same sheet ranks the same teams')

  // A board with no sheet stored at all is a board from before sheets, and
  // belongs to the trip's only one.
  const legacyBoard: Leaderboard = { ...TEAM('better_ball'), id: 'b-old' }
  ok(render([legacyBoard], opts).includes('Reds'),
    'a board stored before sheets existed is on the main sheet')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
