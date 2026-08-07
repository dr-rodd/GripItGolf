// What a trip runs.
//
// Settings are a decision tree, asked in order, and this module is its model.
// Each answer narrows what comes next, so the shape mirrors the questions:
//
//   1. Who competes?        individual, teams, or both
//   2. What do they play?   a league, a matchplay draw, or both
//   3. League: which board? Stableford, Strokes, Custom points — and, for the
//                           two stroke-based boards, whether to drop a round
//   4. Matchplay: singles or pairs (pairs is only on the table with teams)
//   5. Teams: how a team's points are worked out — see lib/teamScoring.ts
//
// Both axes allow more than one answer. A trip can rank individuals and teams
// off the same cards, and can run a league and a knockout side by side. When
// both individuals and teams are ranked, the team board leads: it is the main
// competition, and the individual boards sit behind it.

export type LeagueBoardKey = 'stableford' | 'strokes' | 'custom'

/** Who a matchplay draw is between. Pairs needs teams of two. */
export type MatchplayFormat = 'singles' | 'pairs'

export type LeagueSettings = {
  on: boolean
  stableford: boolean
  strokes: boolean
  custom: boolean
  /**
   * Points by finishing position each round, index 0 being the winner.
   * Empty means "work it out from the player count" — see lib/customPoints.ts.
   */
  customPoints: number[]
  /** How many of a player's worst rounds to drop. 0 keeps every card. */
  discardWorst: number
}

export type MatchplaySettings = {
  on: boolean
  format: MatchplayFormat
}

export type TripFormats = {
  /** Individuals are ranked against each other. */
  individual: boolean
  /** Teams are ranked against each other. Leads when both are on. */
  teams: boolean
  league: LeagueSettings
  matchplay: MatchplaySettings
}

/** A board that appears as a tab on the leaderboard. */
export type BoardKey = LeagueBoardKey | 'teams'

export const LEAGUE_BOARDS: {
  key: LeagueBoardKey; label: string; tabLabel: string; hint: string
}[] = [
  { key: 'stableford', label: 'Stableford', tabLabel: 'Stableford',
    hint: 'Points per hole against your handicap' },
  { key: 'strokes', label: 'Strokeplay', tabLabel: 'Strokes',
    hint: 'Gross and nett totals, lowest wins' },
  { key: 'custom', label: 'Custom points', tabLabel: 'Custom',
    hint: 'Your own prize table by finishing position each round' },
]

export const MAX_CUSTOM_POINTS = 100
export const MAX_DISCARD = 2

export const DEFAULT_LEAGUE: LeagueSettings = {
  on: true,
  stableford: true,
  strokes: false,
  custom: false,
  customPoints: [],
  discardWorst: 0,
}

export const DEFAULT_MATCHPLAY: MatchplaySettings = {
  on: false,
  format: 'singles',
}

export const DEFAULT_FORMATS: TripFormats = {
  individual: true,
  teams: false,
  league: { ...DEFAULT_LEAGUE },
  matchplay: { ...DEFAULT_MATCHPLAY },
}

/**
 * What a brand-new trip plays for: nothing, yet.
 *
 * Deliberately not `DEFAULT_FORMATS`, which is what an *unreadable* row means
 * — a trip from before this column existed, about which nothing is known.
 * A new trip is the opposite: everything is known about it, and the answer is
 * that its lead player has not chosen a competition. Trip Setup is where that
 * happens, and until it does the leaderboard says so rather than showing a
 * board nobody picked.
 */
export const NO_FORMATS: TripFormats = {
  individual: false,
  teams: false,
  league: { ...DEFAULT_LEAGUE, on: false, stableford: false },
  matchplay: { ...DEFAULT_MATCHPLAY, on: false },
}

// ─── Parsing ───────────────────────────────────────────────────

const asBool = (v: unknown) => v === true
const asCount = (v: unknown, max: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n))) : 0
}

function cloneFormats(f: TripFormats): TripFormats {
  return {
    ...f,
    league: { ...f.league, customPoints: [...f.league.customPoints] },
    matchplay: { ...f.matchplay },
  }
}

/**
 * Read whatever is stored, in any shape this app has ever written.
 *
 * Three generations exist in the wild and none of them needs migrating:
 *
 *   flat     `{ individual_stableford: true, teams: true }`
 *   nested   `{ individual: { stableford: true }, matchplay: true }`
 *   current  `{ individual: true, league: { … }, matchplay: { … } }`
 *
 * Both older shapes describe individual boards, and neither could express a
 * pairs draw, so they always read back as individuals playing singles.
 *
 * **It never invents a competition.** A row that says nothing is switched on
 * reads back as nothing switched on. That used to substitute the defaults —
 * individual, league, Stableford — and the effect was that every trip created
 * on this platform arrived with a Stableford leaderboard nobody had chosen,
 * because creation writes a formats row and `trips.leaderboards` defaults to
 * an empty array, which the compat layer reads as "old trip, use the flags".
 *
 * A value that cannot be read at all is a different thing and still falls
 * back: null, a string, a number. That is a trip we know nothing about rather
 * than a trip that has chosen nothing, and the distinction is the only reason
 * the fallback still exists.
 */
export function parseFormats(raw: unknown): TripFormats {
  if (!raw || typeof raw !== 'object') return cloneFormats(DEFAULT_FORMATS)
  const r = raw as Record<string, unknown>

  // Recognise the current shape by what only it has: a league, or a matchplay
  // setting that is an object rather than a flag. Anything else is older.
  //
  // Detecting the old shapes instead would miss a row that only ever said
  // `{ teams: true, matchplay: true }` — no individual key to spot it by, and
  // the draw would be silently dropped on read.
  const isCurrent =
    'league' in r ||
    (r.matchplay !== null && typeof r.matchplay === 'object')

  if (!isCurrent) {
    // Generation 1 — flat keys
    if ('individual_stableford' in r || 'individual_strokes' in r || 'individual_matchplay' in r) {
      return fromLegacyBoards({
        stableford: asBool(r.individual_stableford),
        strokes: asBool(r.individual_strokes),
        custom: false,
        customPoints: [],
        discardWorst: 0,
      }, asBool(r.individual_matchplay), asBool(r.teams))
    }

    // Generation 2 — individual held the boards, so it was an object. A row
    // without one is a teams-only trip, which had no boards to record.
    const ind = (r.individual && typeof r.individual === 'object'
      ? r.individual
      : {}) as Record<string, unknown>
    return fromLegacyBoards({
      stableford: asBool(ind.stableford),
      strokes: asBool(ind.strokes),
      custom: asBool(ind.custom),
      customPoints: Array.isArray(ind.customPoints)
        ? ind.customPoints.map(v => asCount(v, MAX_CUSTOM_POINTS))
        : [],
      discardWorst: asCount(ind.discardWorst, MAX_DISCARD),
    }, asBool(r.matchplay), asBool(r.teams))
  }

  // Current shape
  const lg = (r.league ?? {}) as Record<string, unknown>
  // A bare `true` here is a half-migrated row — a league was written but the
  // draw flag was left as it was. Reading it costs a clause and can only ever
  // turn a draw back on that would otherwise have vanished.
  const mp = (r.matchplay && typeof r.matchplay === 'object'
    ? r.matchplay
    : {}) as Record<string, unknown>
  const mpOn = asBool(mp.on) || r.matchplay === true
  const league: LeagueSettings = {
    on: asBool(lg.on),
    stableford: asBool(lg.stableford),
    strokes: asBool(lg.strokes),
    custom: asBool(lg.custom),
    customPoints: Array.isArray(lg.customPoints)
      ? lg.customPoints.map(v => asCount(v, MAX_CUSTOM_POINTS))
      : [],
    discardWorst: asCount(lg.discardWorst, MAX_DISCARD),
  }
  const parsed: TripFormats = {
    individual: asBool(r.individual),
    teams: asBool(r.teams),
    league,
    matchplay: {
      on: mpOn,
      format: mp.format === 'pairs' ? 'pairs' : 'singles',
    },
  }

  // A trip with nothing switched on has no leaderboard at all — which is
  // what this now returns, rather than the sentence being written above a
  // line that did the opposite.
  return parsed
}

/**
 * Older shapes said which boards were on but never who was being ranked.
 * Boards meant individuals; `teams` was a separate competition on the same
 * cards. Both survive the move because both can now be true at once.
 */
function fromLegacyBoards(
  boards: Omit<LeagueSettings, 'on'>,
  matchplayOn: boolean,
  teamsOn: boolean,
): TripFormats {
  const anyBoard = boards.stableford || boards.strokes || boards.custom
  const parsed: TripFormats = {
    individual: anyBoard,
    teams: teamsOn,
    // Teams were always scored as a league, so a teams-only trip keeps its
    // board rather than arriving with no competition at all.
    league: { on: anyBoard || teamsOn, ...boards },
    matchplay: { on: matchplayOn, format: 'singles' },
  }
  if (teamsOn && !anyBoard) parsed.league.stableford = true
  // Same rule as the current shape: an old row that said nothing was on was
  // describing a trip with nothing on, and guessing Stableford for it only
  // ever put a board on a leaderboard that scored nobody's competition.
  return parsed
}

// ─── Questions ─────────────────────────────────────────────────

/** Anyone at all being ranked. Nothing below matters without this. */
export function hasCompetitors(f: TripFormats): boolean {
  return f?.individual === true || f?.teams === true
}

/** At least one league board ticked. Ticking none is the same as League off. */
export function anyLeagueBoard(f: TripFormats): boolean {
  const l = f?.league
  if (!l) return false
  return l.stableford || l.strokes || l.custom
}

/** The league is actually running: switched on, with a board and someone to rank. */
export function leagueOn(f: TripFormats): boolean {
  return f?.league?.on === true && anyLeagueBoard(f) && hasCompetitors(f)
}

/** The draw is actually running. */
export function matchplayOn(f: TripFormats): boolean {
  return f?.matchplay?.on === true && hasCompetitors(f)
}

/**
 * The draw is between pairings rather than players.
 *
 * Pairs needs teams — a pairing IS a team of two — so selecting individuals
 * only forces singles however the stored value reads.
 */
export function isPairsMatchplay(f: TripFormats): boolean {
  return matchplayOn(f) && f.matchplay.format === 'pairs' && f.teams === true
}

/** Singles and pairs are only a real choice once teams are in play. */
export function matchplayFormatIsOpen(f: TripFormats): boolean {
  return f?.matchplay?.on === true && f?.teams === true
}

/**
 * Which leaderboard leads. Teams is the main competition whenever it is on,
 * so with both selected the team board is the one that opens.
 */
export function mainCompetition(f: TripFormats): 'teams' | 'individual' | null {
  if (!hasCompetitors(f)) return null
  return f.teams ? 'teams' : 'individual'
}

/** Teams need picking — and, in a pairs draw, need to be exactly two apiece. */
export function teamsNeeded(f: TripFormats): boolean {
  return f?.teams === true
}

/** Boards that render as a tab, in display order. Matchplay has its own page. */
export function leaderboardTabs(f: TripFormats): { key: BoardKey; tabLabel: string }[] {
  if (!leagueOn(f)) return []
  const tabs: { key: BoardKey; tabLabel: string }[] = []
  // The main competition leads
  if (f.teams) tabs.push({ key: 'teams', tabLabel: 'Teams' })
  if (f.individual) {
    for (const b of LEAGUE_BOARDS) {
      if (f.league[b.key]) tabs.push({ key: b.key, tabLabel: b.tabLabel })
    }
  }
  return tabs
}

/** Everything switched on, for the one-line summary on the trip hub. */
export function enabledSummary(f: TripFormats): string[] {
  const parts: string[] = []
  if (!hasCompetitors(f)) return parts

  if (leagueOn(f)) {
    const boards = LEAGUE_BOARDS.filter(b => f.league[b.key]).map(b => b.tabLabel)
    parts.push(f.teams ? `Team ${boards.join(' & ')}` : boards.join(' & '))
  }
  if (matchplayOn(f)) {
    parts.push(isPairsMatchplay(f) ? 'Pairs Matchplay' : 'Matchplay')
  }
  return parts
}

/** Nothing at all is running — the setup screen refuses to save this. */
export function isEmpty(f: TripFormats): boolean {
  return !leagueOn(f) && !matchplayOn(f)
}
