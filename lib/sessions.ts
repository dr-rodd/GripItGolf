/**
 * Sessions, Matches and the Dynamic Overall Leaderboard — the only copy of
 * their rules (Ross, 9 Nov 2026; docs/sessions-plan.md, D34–D49).
 *
 * A **session** is one round of golf in the running order of an event with a
 * Dynamic Overall Leaderboard, played in a format of its own. Its format is a
 * board scoped to that round alone (`roundIds: [roundId]`, `session: true`) —
 * the same mechanism a day's own format has always used — and **Format TBC is
 * the absence of one**: a session with no board counts nothing until it is set.
 *
 * A **Matches** session (`competition: 'matches'`) is match play counted on a
 * leaderboard: each match won, halved or lost and worth points. It is never a
 * bracket, never `'matchplay'`, and never in `matchplay_matches` — every
 * bracket reader is blind to it by construction (D34).
 *
 * The **Overall** (`competition: 'overall'`) ranks tags, individuals or teams
 * on points: a stroke session pays by finishing position (the existing
 * `customPoints` table, ties through `placeRound`), a Matches session pays
 * per match (default 1 / ½ / 0). Only these rules are stored, on the board;
 * results are worked out on every read. **The Overall ranks; it never governs
 * a round** — `governingBoard` skips it.
 *
 * Pure. The Overall's rows are built in lib/boardRows.ts (`overallRows`),
 * which is the one place that reads cards.
 */

import type { Leaderboard, Scoring, TeamFormat, Audience } from './leaderboards'

// ─── Match formats ─────────────────────────────────────────────

export type MatchFormat = 'singles' | 'fourball' | 'foursomes'

export const MATCH_FORMATS: {
  key: MatchFormat
  label: string
  hint: string
  /** How many players a side. */
  side: number
  /** Offered for picking. Foursomes is shown "Coming soon" until it is built (D43). */
  available: boolean
}[] = [
  { key: 'singles', label: 'Singles', hint: 'One against one.', side: 1, available: true },
  { key: 'fourball', label: 'Fourball', hint: 'Two against two, the better ball of each pair on every hole.', side: 2, available: true },
  { key: 'foursomes', label: 'Foursomes', hint: 'Two against two, one ball a side, hitting alternate shots. Off half the partners’ combined handicaps.', side: 2, available: true },
]

/**
 * Whether Matches can be picked for a session at all. Off until the match
 * card can score a session match (docs/sessions-plan.md, stage 5) — shown,
 * "Coming soon", so a Ryder Cup can be laid out before it can be played.
 */
export const MATCHES_READY = true

export const isMatchFormat = (v: unknown): v is MatchFormat =>
  MATCH_FORMATS.some(f => f.key === v)

/** How many players make one side of a match in this format. */
export function sideSize(format: MatchFormat): number {
  return MATCH_FORMATS.find(f => f.key === format)?.side ?? 1
}

/**
 * The usual allowance for a match format — WHS appendix C: 100% for singles
 * match play, 90% for fourball, 50% of the combined handicaps for foursomes
 * (`lib/handicapAllowance.ts` says why the foursomes figure is not a percentage
 * of each player's own). Only a starting point; the organiser may change it.
 */
export function defaultMatchAllowance(format: MatchFormat): number {
  return format === 'fourball' ? 90 : format === 'foursomes' ? 50 : 100
}

// ─── What a session plays ──────────────────────────────────────

/** A session's format as the wizard holds it, before any round id exists. */
export type SessionFormat =
  | {
      kind: 'stroke'
      audience: Audience
      scoring: Scoring
      teamFormat?: TeamFormat
      handicapAllowance?: number
    }
  | { kind: 'matches'; match: MatchFormat; handicapAllowance?: number }

export const isMatchesBoard = (lb: Pick<Leaderboard, 'competition'>) => lb.competition === 'matches'
export const isOverallBoard = (lb: Pick<Leaderboard, 'competition'>) => lb.competition === 'overall'
export const isSessionBoard = (lb: Pick<Leaderboard, 'session'>) => lb.session === true

/** The format a session board plays, read back as the wizard holds it. */
export function formatOfBoard(lb: Leaderboard): SessionFormat | null {
  if (lb.competition === 'matches' && lb.matchFormat) {
    return {
      kind: 'matches',
      match: lb.matchFormat,
      ...(lb.handicapAllowance != null ? { handicapAllowance: lb.handicapAllowance } : {}),
    }
  }
  if (lb.competition === 'league' && lb.scoring) {
    return {
      kind: 'stroke',
      audience: lb.audience,
      scoring: lb.scoring,
      ...(lb.audience === 'team' && lb.teamFormat ? { teamFormat: lb.teamFormat } : {}),
      ...(lb.handicapAllowance != null ? { handicapAllowance: lb.handicapAllowance } : {}),
    }
  }
  return null
}

/** Two formats the same, for "Same as Session 1" and the used-formats list. */
export function sameFormat(a: SessionFormat | null, b: SessionFormat | null): boolean {
  return formatKey(a) === formatKey(b)
}

export function formatKey(f: SessionFormat | null): string {
  if (!f) return 'tbc'
  if (f.kind === 'matches') return `m:${f.match}:${f.handicapAllowance ?? 100}`
  return `s:${f.audience}:${f.scoring}:${f.teamFormat ?? '-'}:${f.handicapAllowance ?? 100}`
}

/** A format's issue, or null when it can be played. */
export function formatIssue(f: SessionFormat | null): string | null {
  if (!f) return null
  if (f.kind === 'matches') {
    const known = MATCH_FORMATS.find(m => m.key === f.match)
    if (!known) return 'Pick a match format.'
    if (!MATCHES_READY || !known.available) return `${known.label} matches are coming soon.`
    return null
  }
  if (f.audience === 'team' && !f.teamFormat) return 'Pick how a team’s scores count.'
  if (f.audience === 'team' && f.scoring === 'quota') return 'Quota is for individuals.'
  return null
}

/**
 * The board a session plays, made from its format — scoped to its round
 * alone, so it is that session's own competition and nothing else's.
 * `teamSet` is the round's own day sheet for a team format: its pairs are
 * made on the tee sheet, session by session (lib/partnerships.ts).
 */
export function sessionBoard(format: SessionFormat, roundId: string, daySheet: string): Leaderboard {
  const allowance = format.handicapAllowance != null && format.handicapAllowance !== 100
    ? { handicapAllowance: format.handicapAllowance } : {}
  if (format.kind === 'matches') {
    // A match format's usual allowance unless the organiser set another.
    const pct = format.handicapAllowance ?? defaultMatchAllowance(format.match)
    const team = sideSize(format.match) > 1
    return {
      id: `lb-session-${roundId}`,
      audience: team ? 'team' : 'individual',
      competition: 'matches',
      matchFormat: format.match,
      ...(team ? { teamSet: daySheet } : {}),
      ...(pct !== 100 ? { handicapAllowance: pct } : {}),
      roundIds: [roundId],
      session: true,
    }
  }
  return {
    id: `lb-session-${roundId}`,
    audience: format.audience,
    competition: 'league',
    scoring: format.scoring,
    combine: 'total',
    ...(format.audience === 'team'
      ? { teamFormat: format.teamFormat ?? 'better_ball', teamSet: daySheet }
      : {}),
    ...allowance,
    roundIds: [roundId],
    session: true,
  }
}

/** "Fourball · Matches · 90% handicap" — a session's summary line, as facts. */
export function describeFormat(f: SessionFormat | null): string {
  if (!f) return 'Format TBC'
  const parts: string[] = []
  if (f.kind === 'matches') {
    parts.push(MATCH_FORMATS.find(m => m.key === f.match)?.label ?? 'Matches', 'Matches')
  } else {
    if (f.audience === 'team') {
      parts.push(f.teamFormat === 'better_ball' ? 'Team better ball'
        : f.teamFormat === 'hero' ? 'Team hero'
        : f.teamFormat === 'cut_dead_weight' ? 'Team cut the dead weight'
        : 'Team')
    } else {
      parts.push('Individual')
    }
    parts.push(f.scoring === 'stableford' ? 'Stableford' : f.scoring === 'strokes' ? 'Strokes' : 'Quota')
  }
  const pct = f.handicapAllowance ?? 100
  if (pct !== 100) parts.push(`${pct}% handicap`)
  return parts.join(' · ')
}

// ─── The wizard's sessions ─────────────────────────────────────

/** One session as the creation wizard holds it. */
export type SessionDraft = {
  key: string
  /** Which day of the event, from 0. */
  dayIndex: number
  courseId: string
  /** "Friday foursomes" — absent is "Session n". */
  name?: string
  /**
   * `same`: plays Session 1's format, whatever that becomes. `tbc`: not set
   * yet, counting nothing. Otherwise its own format.
   */
  format: SessionFormat | 'same' | 'tbc'
  /** A Matches session: how many matches it holds — the order of play's slots. */
  matches?: number
}

/** Each session's format as it will be stored — "same" resolved, TBC null. */
export function resolvedFormats(sessions: readonly SessionDraft[]): (SessionFormat | null)[] {
  const first = sessions[0]?.format
  const firstFormat = first && first !== 'same' && first !== 'tbc' ? first : null
  return sessions.map((s, i) => {
    if (s.format === 'tbc') return null
    if (s.format === 'same') return i === 0 ? null : firstFormat
    return s.format
  })
}

/** Every distinct format the sessions use, in first-use order — Change format's one-tap picks. */
export function usedFormats(sessions: readonly SessionDraft[]): SessionFormat[] {
  const out: SessionFormat[] = []
  for (const f of resolvedFormats(sessions)) {
    if (f && !out.some(o => sameFormat(o, f))) out.push(f)
  }
  return out
}

/** Why the sessions cannot be saved yet, or null. */
export function sessionsIssue(sessions: readonly SessionDraft[]): string | null {
  if (sessions.length === 0) return 'Add the first session.'
  if (sessions[0].format === 'same') return 'Pick Session 1’s format.'
  const missing = sessions.findIndex(s => !s.courseId)
  if (missing !== -1) return `Pick a venue for ${sessionLabel(sessions[missing], missing)}.`
  for (const [i, f] of resolvedFormats(sessions).entries()) {
    const issue = formatIssue(f)
    if (issue) return `${sessionLabel(sessions[i], i)}: ${issue}`
  }
  if (sessions.length > MAX_SESSIONS) return `An event can hold at most ${MAX_SESSIONS} sessions.`
  return null
}

/** Enough for any event; a Ryder Cup is five. */
export const MAX_SESSIONS = 12

/** "Session 3", or the name it was given. */
export function sessionLabel(s: { name?: string }, index: number): string {
  return s.name?.trim() || `Session ${index + 1}`
}

/** Sessions in running order: by day, then as listed. */
export function inRunningOrder<T extends { dayIndex: number }>(sessions: readonly T[]): T[] {
  return sessions.map((s, i) => [s, i] as const)
    .sort((a, b) => a[0].dayIndex - b[0].dayIndex || a[1] - b[1])
    .map(([s]) => s)
}

/** Every session plays one format — a normal leaderboard would do (the hint, never forced). */
export function allOneFormat(sessions: readonly SessionDraft[]): SessionFormat | null {
  const formats = resolvedFormats(sessions)
  if (formats.length < 2 || formats.some(f => !f)) return null
  return formats.every(f => sameFormat(f, formats[0])) ? formats[0] : null
}

// ─── The Overall ───────────────────────────────────────────────

/** What the Overall ranks. */
export type OverallRanks = 'tags' | 'individuals' | 'teams'

export const OVERALL_RANKS: { key: OverallRanks; label: string; hint: string }[] = [
  { key: 'tags', label: 'Tags', hint: 'The event’s sides, like Europe and USA.' },
  { key: 'individuals', label: 'Individuals', hint: 'Every player on their own.' },
  { key: 'teams', label: 'Teams', hint: 'Teams that last the whole event.' },
]

/** How one session feeds the Overall. */
export type SessionFeed =
  | { kind: 'position'; points: number[] }
  | { kind: 'match'; win: number; half: number; loss: number }
  | { kind: 'none' }

export type OverallRules = {
  ranks: OverallRanks
  /** Round id → how that session feeds. Absent is its format's default. */
  feeds?: Record<string, SessionFeed>
  /** Round id → the session's name. Absent is "Session n". */
  names?: Record<string, string>
  /** `ranks: 'tags'` — how many of a tag's cards count in a stroke session. Absent is 2. */
  tagCount?: number
  /**
   * Round id → how many matches a Matches session holds (Ross, 9 Nov 2026):
   * the order of play's slots and the points the face-off ticker counts.
   * Absent is the matches set so far.
   */
  slots?: Record<string, number>
}

export const DEFAULT_MATCH_FEED: SessionFeed = { kind: 'match', win: 1, half: 0.5, loss: 0 }
export const DEFAULT_TAG_CARDS = 2

/**
 * A stroke session's default points table: the field's size down to one, so
 * first of six pays 6 and last pays 1 — every place worth something, and
 * the gap between places the same. Two sides is 2 and 1.
 */
export function defaultPositionPoints(entrants: number): number[] {
  const n = Math.max(1, Math.min(entrants, 24))
  return Array.from({ length: n }, (_, i) => n - i)
}

/** What a session feeds, given its board (null for TBC). */
export function feedFor(
  rules: OverallRules,
  roundId: string,
  board: Leaderboard | null,
  entrants: number,
): SessionFeed {
  if (!board) return { kind: 'none' }
  const stored = rules.feeds?.[roundId]
  const matches = board.competition === 'matches'
  if (stored) {
    // A stored feed that no longer fits the session's format is read as the
    // format's default rather than half-honoured.
    if (stored.kind === 'none') return stored
    if (matches && stored.kind === 'match') return stored
    if (!matches && stored.kind === 'position') return stored
  }
  return matches ? DEFAULT_MATCH_FEED : { kind: 'position', points: defaultPositionPoints(entrants) }
}

/** The points one match pays a side. */
export function matchPoints(feed: SessionFeed, outcome: 'win' | 'half' | 'loss'): number {
  if (feed.kind !== 'match') return 0
  return outcome === 'win' ? feed.win : outcome === 'half' ? feed.half : feed.loss
}

/** "1 / ½ / 0 a match", "6, 5, 4… by position" — a feed in a few words. */
export function describeFeed(feed: SessionFeed): string {
  if (feed.kind === 'none') return 'Doesn’t count'
  if (feed.kind === 'match') return `${formatPoints(feed.win)} / ${formatPoints(feed.half)} / ${formatPoints(feed.loss)} a match`
  const shown = feed.points.slice(0, 3).map(formatPoints).join(', ')
  return `${shown}${feed.points.length > 3 ? '…' : ''} by position`
}

/** Points as golf writes them: 14½, never 14.5. */
export function formatPoints(n: number): string {
  const whole = Math.floor(n + 1e-9)
  const half = Math.abs(n - whole - 0.5) < 1e-9
  if (half) return whole === 0 ? '½' : `${whole}½`
  return String(Math.round(n * 100) / 100)
}

/**
 * "14½ to win" — shown only when every session is Matches with fixed points
 * and the Overall ranks two sides. Null otherwise: a target that a stroke
 * session's places could move is not a target.
 */
export function targetLine(
  sessionMatches: readonly { feed: SessionFeed; matches: number }[],
  sides: number,
): string | null {
  if (sides !== 2 || sessionMatches.length === 0) return null
  let total = 0
  for (const s of sessionMatches) {
    if (s.feed.kind === 'none') continue
    if (s.feed.kind !== 'match' || s.matches === 0) return null
    // Both sides' shares of a match, which is the same whatever the result
    // only when a win plus a loss is two halves.
    if (Math.abs(s.feed.win + s.feed.loss - 2 * s.feed.half) > 1e-9) return null
    total += s.matches * (s.feed.win + s.feed.loss)
  }
  if (total === 0) return null
  return `${formatPoints(total / 2 + 0.5)} to win`
}

// ─── A session match's result ─────────────────────────────────

/**
 * One match in a Matches session, as the Overall and the session's list read
 * it: the players on each side, and the result once the card is finalised —
 * `a`, `b` or `halved` (a session match may end halved, D44). `live` while
 * the card has a score and no result.
 */
export type SessionMatchResult = {
  id: string
  roundId: string
  /** Its tee time's or order-of-play position, from 0. */
  slot: number
  sideA: string[]
  sideB: string[]
  result: 'a' | 'b' | 'halved' | null
  /** "3&2", "1 UP", "A/S" — the margin once finished. */
  margin?: string | null
  /** A card with a score on it and no result yet. */
  live?: boolean
  /** While live: who is up, and by how much — "2 up thru 11", "All square thru 9". */
  leader?: 'a' | 'b' | null
  progress?: string | null
  /** While live: holes up (0 all square) and the furthest hole with a result. */
  up?: number
  thru?: number
}

/**
 * A match's line: "Europe won 3&2", "Halved", "USA 2 UP thru 11", "Not started".
 * `names` are each side's label — the tag where the side is one tag, else
 * its players.
 */
export function matchLine(m: SessionMatchResult, names: { a: string; b: string }): string {
  if (m.result === 'halved') return 'Halved'
  if (m.result === 'a' || m.result === 'b') {
    const who = m.result === 'a' ? names.a : names.b
    return m.margin ? `${who} won ${m.margin}` : `${who} won`
  }
  if (m.live) {
    if (!m.progress) return 'In play'
    if (m.leader) return `${m.leader === 'a' ? names.a : names.b} ${m.progress}`
    return m.progress
  }
  return 'Not started'
}

// ─── Setting a match's sides ──────────────────────────────────

/**
 * Why these sides cannot be a match in this session, or null. A side may be
 * part-filled while it is being set; `full` asks for the whole match.
 *
 * · a side holds at most the format's players (one, or a pair);
 * · nobody plays on both sides, or in two matches of one session;
 * · with tags in play a side is one tag (the tee sheet's gate, per side —
 *   `tagOf` gives a player's tag, null for none).
 */
export function matchSidesIssue(
  format: MatchFormat,
  sideA: readonly string[], sideB: readonly string[],
  others: readonly { sideA: readonly string[]; sideB: readonly string[] }[],
  tagOf: ((playerId: string) => string | null) | null,
  full = false,
): string | null {
  const size = sideSize(format)
  if (sideA.length > size || sideB.length > size) return size === 1 ? 'One player a side.' : 'Two players a side.'
  if (full && (sideA.length < size || sideB.length < size)) return 'Both sides need their players.'
  const here = [...sideA, ...sideB]
  if (new Set(here).size !== here.length) return 'A player can only play once in a match.'
  const elsewhere = new Set(others.flatMap(o => [...o.sideA, ...o.sideB]))
  if (here.some(id => elsewhere.has(id))) return 'That player already has a match in this session.'
  if (tagOf) {
    for (const side of [sideA, sideB]) {
      const tags = new Set(side.map(tagOf))
      if (tags.has(null)) return 'Every player needs a tag first.'
      if (tags.size > 1) return 'A side is one tag.'
    }
    if (sideA.length && sideB.length && tagOf(sideA[0]) === tagOf(sideB[0])) return 'The two sides are from the same tag.'
  }
  return null
}

/** Every match listed by slot, a gap left where none is set. */
export function bySlot<T extends { slot: number }>(matches: readonly T[]): T[] {
  return [...matches].sort((a, b) => a.slot - b.slot)
}

/** The next free slot in a session's order of play. */
export function nextSlot(matches: readonly { slot: number }[]): number {
  const used = new Set(matches.map(m => m.slot))
  let n = 0
  while (used.has(n)) n++
  return n
}

// ─── Storage ───────────────────────────────────────────────────

const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  // Halves are a real answer (a halved match), so round to the half.
  return Math.min(hi, Math.max(lo, Math.round(n * 2) / 2))
}

export function parseFeed(raw: unknown): SessionFeed | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.kind === 'none') return { kind: 'none' }
  if (r.kind === 'match') {
    const win = num(r.win, 0, 100), half = num(r.half, 0, 100), loss = num(r.loss, 0, 100)
    if (win == null || half == null || loss == null) return null
    return { kind: 'match', win, half, loss }
  }
  if (r.kind === 'position' && Array.isArray(r.points)) {
    const points = r.points.map(p => num(p, 0, 100)).filter((p): p is number => p != null).slice(0, 64)
    return points.length > 0 ? { kind: 'position', points } : null
  }
  return null
}

/** An Overall's stored rules, fail-soft: a bad feed or name is dropped, never the board. */
export function parseOverallRules(raw: unknown): OverallRules | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const ranks = OVERALL_RANKS.find(o => o.key === r.ranks)?.key
  if (!ranks) return null
  const out: OverallRules = { ranks }
  if (r.feeds && typeof r.feeds === 'object' && !Array.isArray(r.feeds)) {
    const feeds: Record<string, SessionFeed> = {}
    for (const [id, f] of Object.entries(r.feeds as Record<string, unknown>)) {
      const feed = parseFeed(f)
      if (id && feed) feeds[id] = feed
    }
    if (Object.keys(feeds).length > 0) out.feeds = feeds
  }
  if (r.names && typeof r.names === 'object' && !Array.isArray(r.names)) {
    const names: Record<string, string> = {}
    for (const [id, n] of Object.entries(r.names as Record<string, unknown>)) {
      if (id && typeof n === 'string' && n.trim()) names[id] = n.trim().slice(0, MAX_SESSION_NAME)
    }
    if (Object.keys(names).length > 0) out.names = names
  }
  if (r.slots && typeof r.slots === 'object' && !Array.isArray(r.slots)) {
    const slots: Record<string, number> = {}
    for (const [id, n] of Object.entries(r.slots as Record<string, unknown>)) {
      const v = Math.round(Number(n))
      if (id && Number.isFinite(v) && v >= 1) slots[id] = Math.min(MAX_MATCH_SLOTS, v)
    }
    if (Object.keys(slots).length > 0) out.slots = slots
  }
  if (ranks === 'tags' && Number.isFinite(Number(r.tagCount))) {
    const n = Math.min(12, Math.max(1, Math.round(Number(r.tagCount))))
    if (n !== DEFAULT_TAG_CARDS) out.tagCount = n
  }
  return out
}

export const MAX_SESSION_NAME = 40

/** Enough matches for any session; a Ryder Cup's singles are twelve. */
export const MAX_MATCH_SLOTS = 32

/**
 * A Matches session's usual count: everybody playing, one match for each
 * two sides' worth of players — twenty-four players are twelve singles or
 * six fourballs. Never fewer than one.
 */
export function defaultMatchSlots(fieldSize: number, format: MatchFormat): number {
  const n = Math.floor(Math.max(0, fieldSize) / (2 * sideSize(format)))
  return Math.min(MAX_MATCH_SLOTS, Math.max(1, n))
}

/**
 * The fewest matches a session can be cut to: one past the last with
 * anybody in it — taking a match away never takes its players with it.
 */
export function slotFloor(matches: readonly { slot: number; sideA: readonly string[]; sideB: readonly string[] }[]): number {
  const filled = matches.filter(m => m.sideA.length + m.sideB.length > 0).map(m => m.slot + 1)
  return Math.max(1, ...filled)
}

/** How many matches a session holds: the number set, else every match set so far. */
export function matchSlotsFor(
  rules: OverallRules | undefined, roundId: string, matches: readonly { roundId: string; slot: number }[],
): number {
  const set = rules?.slots?.[roundId]
  const own = matches.filter(m => m.roundId === roundId)
  const used = own.length ? Math.max(own.length, ...own.map(m => m.slot + 1)) : 0
  return Math.max(set ?? 0, used)
}

// ─── Reading an event's sessions ───────────────────────────────

/** The event's Overall, if it has one. One only — the first wins. */
export function overallOf(boards: readonly Leaderboard[]): Leaderboard | null {
  return boards.find(isOverallBoard) ?? null
}

/** The board a session plays — null is Format TBC. */
export function sessionBoardFor(boards: readonly Leaderboard[], roundId: string): Leaderboard | null {
  return boards.find(b => isSessionBoard(b) && b.roundIds?.length === 1 && b.roundIds[0] === roundId) ?? null
}

/** A session's name: the one it was given, else "Session n" by running order. */
export function sessionName(rules: OverallRules | undefined, roundId: string, roundNumber: number): string {
  return rules?.names?.[roundId] ?? `Session ${roundNumber}`
}

/**
 * The boards the leaderboard offers as tabs on an event with an Overall: the
 * Overall first, then every secondary board — never a session's own board,
 * which is reached through the Overall's session switch instead.
 */
export function overallTabs(boards: readonly Leaderboard[]): Leaderboard[] {
  const overall = overallOf(boards)
  if (!overall) return []
  return [overall, ...boards.filter(b => b !== overall && !isSessionBoard(b) && b.competition === 'league')]
}

/** Boards with the Overall and every session board taken out — turning it off, nothing else touched. */
export function withoutOverall(boards: readonly Leaderboard[]): Leaderboard[] {
  return boards.filter(b => !isOverallBoard(b))
}

/** The Overall board, made from its rules. */
export function overallBoard(rules: OverallRules): Leaderboard {
  return {
    id: 'lb-overall',
    audience: rules.ranks === 'individuals' ? 'individual' : 'team',
    competition: 'overall',
    ...(rules.ranks === 'tags' ? { teamSet: 'main' } : rules.ranks === 'teams' ? { teamSet: 'overall' } : {}),
    overall: rules,
  }
}

// ─── Changing an event's sessions after creation ───────────────
//
// The organiser area's Session formats page. Each returns the whole boards
// list with one thing changed, never touching a score: the Overall's points
// are worked out on every read, so a changed format re-tells them at once.

/** A session's format set — or, with null, made TBC (its board removed). */
export function withSessionFormat(
  boards: readonly Leaderboard[], roundId: string, format: SessionFormat | null, daySheet: string,
): Leaderboard[] {
  const rest = boards.filter(b => !(isSessionBoard(b) && b.roundIds?.length === 1 && b.roundIds[0] === roundId))
  if (!format) return rest
  const at = boards.findIndex(b => isSessionBoard(b) && b.roundIds?.[0] === roundId)
  const next = sessionBoard(format, roundId, daySheet)
  if (at === -1) return [...rest, next]
  const out = [...rest]
  out.splice(Math.min(at, out.length), 0, next)
  return out
}

/** The Overall's rules changed, the rest of the list as it was. */
export function withOverallRules(
  boards: readonly Leaderboard[], change: (rules: OverallRules) => OverallRules,
): Leaderboard[] {
  return boards.map(b => (isOverallBoard(b) && b.overall ? { ...overallBoard(change(b.overall)), id: b.id } : b))
}

/** A session's name: blank goes back to "Session n". */
export function withSessionName(boards: readonly Leaderboard[], roundId: string, name: string): Leaderboard[] {
  return withOverallRules(boards, rules => {
    const names = { ...(rules.names ?? {}) }
    const tidy = name.trim().slice(0, MAX_SESSION_NAME)
    if (tidy) names[roundId] = tidy
    else delete names[roundId]
    const { names: _drop, ...restRules } = rules
    void _drop
    return Object.keys(names).length > 0 ? { ...restRules, names } : restRules
  })
}

/** How many matches a Matches session holds. */
export function withSessionSlots(boards: readonly Leaderboard[], roundId: string, count: number): Leaderboard[] {
  const n = Math.min(MAX_MATCH_SLOTS, Math.max(1, Math.round(count)))
  return withOverallRules(boards, rules => ({ ...rules, slots: { ...(rules.slots ?? {}), [roundId]: n } }))
}

/** How a session feeds the Overall. */
export function withSessionFeed(boards: readonly Leaderboard[], roundId: string, feed: SessionFeed): Leaderboard[] {
  return withOverallRules(boards, rules => ({ ...rules, feeds: { ...(rules.feeds ?? {}), [roundId]: feed } }))
}

/**
 * Turning the Overall on for an event made with a primary board: every round
 * becomes a session playing the event's first stroke board's format (TBC
 * where there is none), and every existing board stays as a secondary one.
 * A round that already has a session board keeps it.
 */
export function withOverallOn(
  boards: readonly Leaderboard[], roundIds: readonly string[], ranks: OverallRanks,
  daySheetOf: (roundId: string) => string,
): Leaderboard[] {
  if (overallOf(boards)) return [...boards]
  const first = boards.find(b => b.competition === 'league' && !b.tagMode && !isSessionBoard(b))
  const base = first ? formatOfBoard({ ...first, handicapAllowance: first.handicapAllowance }) : null
  const sessions = roundIds
    .filter(id => !sessionBoardFor(boards, id))
    .flatMap(id => base ? [sessionBoard(base, id, daySheetOf(id))] : [])
  return [overallBoard({ ranks }), ...boards, ...sessions]
}

/**
 * Turning it off removes the Overall board and nothing else — no session's
 * board, no score. Its sessions' stroke boards read on as each day's own
 * format; turned back on, the Overall finds them again.
 */
export function withOverallOff(boards: readonly Leaderboard[]): Leaderboard[] {
  return withoutOverall(boards)
}

/**
 * The tee a session match player plays off when nobody has said: the one
 * the round recorded for them, else the middle of their own tees, hardest
 * first (`teesForPlayer`'s order) — the white of blue, white and yellow.
 */
export function defaultTeeIndex(count: number): number {
  return count <= 0 ? -1 : Math.floor((count - 1) / 2)
}
