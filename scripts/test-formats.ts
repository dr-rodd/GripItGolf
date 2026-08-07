/**
 * Format model tests. Run with: npm run test:formats
 *
 * Settings are a decision tree and this is its model, so what is asserted
 * here is the tree's shape: who competes, what they play, which boards that
 * opens, and what a pairs draw does to teams.
 *
 * Three generations of stored settings exist in production and none of them
 * was migrated, so every one of them has to read back correctly. A trip whose
 * competition silently changes because the app was redeployed is the failure
 * this file exists to prevent.
 */

import {
  parseFormats, leaderboardTabs, enabledSummary, isEmpty,
  hasCompetitors, anyLeagueBoard, leagueOn, matchplayOn, isPairsMatchplay,
  matchplayFormatIsOpen, mainCompetition, DEFAULT_FORMATS, NO_FORMATS,
  type TripFormats,
} from '../lib/formats'

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

/**
 * A trip exactly as given.
 *
 * `parseFormats` used to refuse to return a trip with nothing switched on, so
 * states the settings screen can legitimately hold mid-edit — nobody
 * competing, a league with no board ticked — had to be built directly. It no
 * longer refuses, and this stays because building the shape by hand is still
 * the clearer way to say what a case is about.
 */
function raw(patch: {
  individual?: boolean
  teams?: boolean
  league?: Partial<TripFormats['league']>
  matchplay?: Partial<TripFormats['matchplay']>
} = {}): TripFormats {
  return {
    individual: patch.individual ?? false,
    teams: patch.teams ?? false,
    league: { on: false, stableford: false, strokes: false, custom: false,
              customPoints: [], discardWorst: 0, ...patch.league },
    matchplay: { on: false, format: 'singles', ...patch.matchplay },
  }
}

/** The same, read back through the parser — what a stored trip becomes. */
function trip(patch: {
  individual?: boolean
  teams?: boolean
  league?: Partial<TripFormats['league']>
  matchplay?: Partial<TripFormats['matchplay']>
} = {}): TripFormats {
  return parseFormats({
    individual: patch.individual ?? false,
    teams: patch.teams ?? false,
    league: { on: false, stableford: false, strokes: false, custom: false,
              customPoints: [], discardWorst: 0, ...patch.league },
    matchplay: { on: false, format: 'singles', ...patch.matchplay },
  })
}

const tabKeys = (f: TripFormats) => leaderboardTabs(f).map(t => t.key)

// ─── Question 1: who competes ──────────────────────────────────

section('Who competes')
{
  const ind   = trip({ individual: true, league: { on: true, stableford: true } })
  const teams = trip({ teams: true, league: { on: true, stableford: true } })
  const both  = trip({ individual: true, teams: true, league: { on: true, stableford: true } })

  ok(hasCompetitors(ind), 'individuals alone is somebody')
  ok(hasCompetitors(teams), 'so is teams alone')
  ok(hasCompetitors(both), 'and both')

  eq(mainCompetition(ind), 'individual', 'individuals lead when they are all there is')
  eq(mainCompetition(teams), 'teams', 'teams lead when they are all there is')
  eq(mainCompetition(both), 'teams', 'and teams lead when both are on — the team board is the main one')

  // "Allow both but default to the team leaderboard if both selected"
  eq(tabKeys(both)[0], 'teams', 'so the team tab is the first one')
  ok(tabKeys(both).includes('stableford'), 'with the individual board still there behind it')
  eq(tabKeys(ind), ['stableford'], 'individuals alone show only their boards')
  eq(tabKeys(teams), ['teams'], 'teams alone show only the team board')

  // Nobody competing means nothing runs, whatever else is ticked
  const nobody = raw({ league: { on: true, stableford: true } })
  ok(!hasCompetitors(nobody), 'nobody is competing')
  ok(!leagueOn(nobody), 'so the league is not actually running')
  eq(tabKeys(nobody), [], 'and there is nothing to show')
}

// ─── Question 2: league or matchplay ───────────────────────────

section('League or matchplay')
{
  const league = trip({ individual: true, league: { on: true, stableford: true } })
  const draw   = trip({ individual: true, matchplay: { on: true } })
  const both   = trip({ individual: true, league: { on: true, stableford: true }, matchplay: { on: true } })

  ok(leagueOn(league) && !matchplayOn(league), 'a league trip runs a league')
  ok(matchplayOn(draw) && !leagueOn(draw), 'a knockout trip runs a knockout')
  ok(leagueOn(both) && matchplayOn(both), 'and both can run side by side')

  // A knockout lives on its own page, so it never becomes a tab
  eq(tabKeys(draw), [], 'a knockout-only trip has no tabs')
  ok(!tabKeys(both).some(k => (k as string) === 'matchplay'), 'and matchplay is never a tab')

  // Ticking no board is the same as switching the league off
  const empty = raw({ individual: true, league: { on: true } })
  ok(!anyLeagueBoard(empty), 'a league with no board has no board')
  ok(!leagueOn(empty), 'so it is not running')
  ok(isEmpty(empty), 'and the trip has nothing to play for')
}

// ─── Question 3: league boards ─────────────────────────────────

section('League boards')
{
  const all = trip({
    individual: true,
    league: { on: true, stableford: true, strokes: true, custom: true, customPoints: [10, 5], discardWorst: 1 },
  })
  eq(tabKeys(all), ['stableford', 'strokes', 'custom'], 'each ticked board becomes a tab, in order')
  eq(all.league.customPoints, [10, 5], 'a stored prize table is read back')
  eq(all.league.discardWorst, 1, 'so is the discard setting')

  const withTeams = trip({
    individual: true, teams: true,
    league: { on: true, stableford: true, strokes: true },
  })
  eq(tabKeys(withTeams), ['teams', 'stableford', 'strokes'], 'the team board leads the individual ones')

  // Teams do not multiply the individual boards — one team board, however
  // many ways the individuals are being ranked
  eq(tabKeys(withTeams).filter(k => k === 'teams').length, 1, 'there is exactly one team tab')
}

// ─── Question 4: singles or pairs ──────────────────────────────

section('Singles or pairs')
{
  const singles = trip({ individual: true, matchplay: { on: true, format: 'singles' } })
  const pairs   = trip({ teams: true, matchplay: { on: true, format: 'pairs' } })

  ok(!isPairsMatchplay(singles), 'a singles draw is between players')
  ok(isPairsMatchplay(pairs), 'a pairs draw is between pairings')

  // Pairs needs teams: a pairing IS a team of two, so without teams the
  // stored value cannot be honoured and must not be pretended into existence.
  const orphan = trip({ individual: true, matchplay: { on: true, format: 'pairs' } })
  eq(orphan.matchplay.format, 'pairs', 'the stored answer is kept')
  ok(!isPairsMatchplay(orphan), 'but it does not count as a pairs draw without teams')

  ok(!matchplayFormatIsOpen(singles), 'the choice is not offered without teams')
  ok(matchplayFormatIsOpen(pairs), 'and is offered once teams are on')

  // Switching the draw off closes the question, whatever the format says
  const off = trip({ teams: true, matchplay: { on: false, format: 'pairs' } })
  ok(!isPairsMatchplay(off), 'a switched-off draw is not a pairs draw')
  ok(!matchplayFormatIsOpen(off), 'and the question is not asked')
}

// ─── The summary line ──────────────────────────────────────────

section('What the trip hub says it is running')
{
  eq(enabledSummary(trip({ individual: true, league: { on: true, stableford: true } })),
    ['Stableford'], 'an individual stableford trip')
  eq(enabledSummary(trip({ teams: true, league: { on: true, stableford: true } })),
    ['Team Stableford'], 'a team stableford trip says so')
  eq(enabledSummary(trip({ individual: true, league: { on: true, stableford: true, strokes: true } })),
    ['Stableford & Strokes'], 'two boards read as one competition')
  eq(enabledSummary(trip({ teams: true, matchplay: { on: true, format: 'pairs' } })),
    ['Pairs Matchplay'], 'a pairs draw is named as one')
  eq(enabledSummary(trip({ individual: true, matchplay: { on: true } })),
    ['Matchplay'], 'a singles draw is just matchplay')
  eq(enabledSummary(trip({
    individual: true, teams: true,
    league: { on: true, stableford: true }, matchplay: { on: true },
  })), ['Team Stableford', 'Matchplay'], 'and both are listed when both run')

  eq(enabledSummary(raw()), [], 'a trip with nobody competing claims nothing')
}

// ─── Reading what is already stored ────────────────────────────

section('Generation 1 — flat keys')
{
  const legacy = parseFormats({
    individual_stableford: true, individual_strokes: true,
    individual_matchplay: true, teams: true,
  })
  ok(legacy.league.stableford, 'the old stableford flag maps to the board')
  ok(legacy.league.strokes, 'so does the old strokes flag')
  ok(!legacy.league.custom, 'custom is off, since it did not exist')
  eq(legacy.league.discardWorst, 0, 'and nothing is discarded')

  ok(legacy.individual, 'boards meant individuals, so individuals are competing')
  ok(legacy.teams, 'and teams carry across')
  ok(matchplayOn(legacy), 'the old matchplay flag is still a draw')
  eq(legacy.matchplay.format, 'singles',
    'and it is singles — the old shape could not express anything else')

  eq(tabKeys(parseFormats({ individual_stableford: true })), ['stableford'],
    'a plain old trip still shows its one board')
}

section('Generation 2 — individual held the boards')
{
  const g2 = parseFormats({
    individual: { stableford: true, custom: true, customPoints: [10, 6, 3], discardWorst: 2 },
    matchplay: true,
    teams: true,
  })
  ok(g2.individual, 'ticked boards mean individuals were competing')
  ok(g2.teams, 'teams carry across')
  ok(g2.league.on && g2.league.stableford && g2.league.custom, 'the boards become the league')
  eq(g2.league.customPoints, [10, 6, 3], 'the prize table survives')
  eq(g2.league.discardWorst, 2, 'so does the discard count')
  ok(matchplayOn(g2), 'and the draw is still on')
  eq(g2.matchplay.format, 'singles', 'as singles')
  eq(tabKeys(g2), ['teams', 'stableford', 'custom'], 'reading back to the right tabs')

  // A teams-only trip never had an individual key to be recognised by. It
  // still ran a league, so it must not come back with nothing to play for.
  const teamsOnly = parseFormats({ teams: true, matchplay: true })
  ok(teamsOnly.teams, 'a teams-only trip keeps its teams')
  ok(!teamsOnly.individual, 'and was not ranking individuals')
  ok(leagueOn(teamsOnly), 'it still runs a league')
  ok(teamsOnly.league.stableford, 'scored on stableford, which is what it was')
  ok(matchplayOn(teamsOnly), 'and its draw is not lost')
  eq(tabKeys(teamsOnly), ['teams'], 'leaving exactly the team board')

  // Boards all off with teams on is the same trip written differently
  const noBoards = parseFormats({ individual: { stableford: false }, teams: true })
  ok(!noBoards.individual, 'no ticked board means individuals were not ranked')
  eq(tabKeys(noBoards), ['teams'], 'leaving only the team tab')
}

section('Generation 3 — the current shape')
{
  const stored = {
    individual: true, teams: true,
    league: { on: true, stableford: true, strokes: false, custom: false, customPoints: [], discardWorst: 1 },
    matchplay: { on: true, format: 'pairs' },
  }
  const f = parseFormats(stored)
  eq(f.matchplay.format, 'pairs', 'a pairs draw reads back as pairs')
  ok(isPairsMatchplay(f), 'and counts as one')
  eq(f.league.discardWorst, 1, 'the discard setting survives')
  eq(JSON.parse(JSON.stringify(parseFormats(f))), JSON.parse(JSON.stringify(f)),
    'and parsing an already-parsed value changes nothing')

  // Half-migrated rows: a league written while the draw flag stayed a boolean
  const half = parseFormats({
    individual: true,
    league: { on: true, stableford: true },
    matchplay: true,
  })
  ok(matchplayOn(half), 'a bare true is still read as a draw rather than dropped')

  // Junk in the stored values is clamped rather than trusted
  const junk = parseFormats({
    individual: true,
    league: { on: true, stableford: true, customPoints: [999, -5, 'x'], discardWorst: 99 },
    matchplay: { on: true, format: 'nonsense' },
  })
  eq(junk.league.customPoints, [100, 0, 0], 'points are clamped to the allowed range')
  eq(junk.league.discardWorst, 2, 'so is the discard count')
  eq(junk.matchplay.format, 'singles', 'and an unknown format falls back to singles')
}

section('Nothing switched on stays nothing switched on')
{
  // The rule that changed, and why it is worth a section of its own.
  //
  // A row saying nothing is on used to be answered with the defaults —
  // individual, league, Stableford. The effect reached much further than
  // reading an old trip: creation writes a formats row and
  // `trips.leaderboards` defaults to an empty array, which the compat layer
  // reads as "old trip, use the flags". So every trip made on this platform
  // arrived with a Stableford leaderboard nobody had chosen, and the only
  // way to be rid of it was to choose something else.
  const off = { individual: false, teams: false, league: { on: false }, matchplay: { on: false } }
  ok(isEmpty(parseFormats(off)), 'a trip with everything off has nothing to play for')
  ok(!leagueOn(parseFormats(off)), '  …no league')
  ok(!hasCompetitors(parseFormats(off)), '  …and nobody competing')

  // Same for a row that carries the shape but ticks nothing inside it.
  ok(isEmpty(parseFormats({ individual: true, league: { on: true } })),
    'a league with no board ticked is not a competition either')

  // NO_FORMATS is what creation writes, and it has to survive the round trip
  // — if it came back as anything else the phantom board would be straight
  // back, and only on real trips rather than in this file.
  ok(isEmpty(parseFormats(NO_FORMATS)), 'what a new trip is created with reads back as nothing')
  ok(!leagueOn(NO_FORMATS) && !matchplayOn(NO_FORMATS), '  …and says so directly too')

  // A value that cannot be read at all is a different question: that is a
  // trip we know nothing about rather than a trip that has chosen nothing,
  // and it is the only case the fallback still exists for.
  eq(parseFormats(null), DEFAULT_FORMATS, 'an unreadable row still falls back')
  eq(parseFormats('nonsense'), DEFAULT_FORMATS, 'whatever shape it is not in')
  ok(leagueOn(DEFAULT_FORMATS), 'and that fallback does name a competition')

  // An empty object is readable and says nothing, so it is the first case
  // rather than the second. This is the one that flipped.
  ok(isEmpty(parseFormats({})), 'but an empty object says nothing, and is taken at its word')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
