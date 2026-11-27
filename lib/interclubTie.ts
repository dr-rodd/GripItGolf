/**
 * An interclub tie — a match on the national draw played as a Green Dot
 * event — the only copy of its rules (D353–D362, Ross, 27 Nov 2026;
 * docs/interclub.md, stages 2 and 3). Pure: `app/api/interclub/` reads and
 * writes, this decides.
 *
 * A tie is the Ryder Cup model already built: the two clubs are the event's
 * two tags, one Matches session holds the matches, the Overall adds the
 * points and anybody with the link scores. What is the tie's own:
 *
 * - **who may do what** — a club's team captains (D358) fill their club's
 *   side; the captain who set it up fills the other while no captain of that
 *   club has taken it (`maySide`); either club's captains settle and start a
 *   playoff (`mayRun`);
 * - **what the competition plays** — read off its name (`competitionFormat`),
 *   only ever a suggestion the captain changes;
 * - **the result** — the matches' points, a playoff where they are level
 *   (D360, sudden death), and a captain's settling over all of it (D361);
 *   the Barton Shield's holes up beside the matches (D362).
 */

import { clubKey, sameClub } from './interclub'
import { daySheetId } from './teamSets'
import { overallBoard, sessionBoard, type MatchFormat, type OverallRules } from './sessions'
import type { Leaderboard } from './leaderboards'
import { PRESET_COLORS } from './teamColors'

// ─── What a competition plays ──────────────────────────────────

export type TieFormat = {
  match: MatchFormat
  /** How many matches make the tie. */
  matches: number
  /** A match level after 18: a half (most team events of pairs), or played on (the Senior and Junior Cups). */
  tie: 'half' | 'extra'
  /** The Barton Shield: holes up counted beside the matches (D362). */
  holes: boolean
}

export const MAX_TIE_MATCHES = 10

/**
 * Golf Ireland's 2026 allowances for inter-club match play (the captains'
 * briefing, Reg. 2.1): singles the full difference, four-ball 75% of the
 * difference from the low player, foursomes half the combined difference.
 */
export function interclubAllowance(match: MatchFormat): number {
  return match === 'fourball' ? 75 : match === 'foursomes' ? 50 : 100
}

/**
 * What a competition plays, from its name — the captains' briefing's
 * "Competition Formats" tables (team size, whether all matches finish on
 * 18). A suggestion only: the captain sees it and changes it before the tie
 * is made. A name it does not know is five singles, halved after 18.
 */
export function competitionFormat(name: string): TieFormat {
  const n = name.toLowerCase()
  const f = (match: MatchFormat, matches: number, tie: 'half' | 'extra' = 'half', holes = false): TieFormat => ({ match, matches, tie, holes })
  if (/barton/.test(n)) return f('foursomes', 2, 'half', true)
  if (/senior foursomes/.test(n)) return f('foursomes', 3, 'extra')
  if (/junior foursomes|boys foursomes/.test(n)) return f('foursomes', 2)
  if (/foursomes|jimmy bruen|pierce purcell|cecil ewing|connacht shield|jack o.?sullivan/.test(n)) return f('foursomes', 4)
  if (/four.?ball/.test(n)) return f('fourball', 4)
  if (/u16|under.?16|girls/.test(n)) return f('singles', 3, 'extra')
  if (/senior cup|junior cup|fred daly|u18|under.?18|connacht trophy|challenge trophy|boys/.test(n)) return f('singles', 5, 'extra')
  return f('singles', 5)
}

/** Why this format cannot make a tie — or null. */
export function formatIssue(f: TieFormat): string | null {
  if (!['singles', 'fourball', 'foursomes'].includes(f.match)) return 'Singles, fourball or foursomes.'
  if (!Number.isInteger(f.matches) || f.matches < 1 || f.matches > MAX_TIE_MATCHES) return `Between 1 and ${MAX_TIE_MATCHES} matches.`
  if (f.tie !== 'half' && f.tie !== 'extra') return 'A level match is a half, or played on.'
  return null
}

/** A format as stored or sent, read whole — or null. */
export function readFormat(v: unknown): TieFormat | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const f: TieFormat = {
    match: o.match as MatchFormat,
    matches: Number(o.matches),
    tie: o.tie === 'extra' ? 'extra' : 'half',
    holes: o.holes === true,
  }
  return formatIssue(f) ? null : f
}

/** "4 foursomes · halved after 18 · holes up beside". */
export function formatLine(f: TieFormat): string {
  const what = f.match === 'singles' ? 'singles' : f.match === 'fourball' ? 'fourballs' : 'foursomes'
  return [
    `${f.matches} ${f.matches === 1 ? what.replace(/s$/, '') : what}`,
    f.tie === 'half' ? 'halved after 18' : 'played on after 18',
    `${interclubAllowance(f.match)}% handicap`,
    f.holes ? 'holes up beside' : null,
  ].filter(Boolean).join(' · ')
}

// ─── Clubs and sides ───────────────────────────────────────────

export type Side = 'a' | 'b'
export const otherSide = (s: Side): Side => (s === 'a' ? 'b' : 'a')

/** How the draws spell a club: its own name for them, else its name. */
export function drawNameOf(club: { name: string; interclubName?: string | null }): string {
  return club.interclubName?.trim() || club.name
}

/** Why a club's name in the draws cannot be kept — or null. Blank is the club's own name. */
export function drawNameIssue(name: string): string | null {
  const t = name.trim()
  if (t.length > 80) return 'Keep it to 80 characters.'
  if (t && !clubKey(t)) return 'Give the name as the draws spell it.'
  return null
}

/** Which side of a draw match a club is, by its name in the draws — or null. */
export function clubSide(drawName: string, match: { a: string | null; b: string | null }): Side | null {
  const k = clubKey(drawName)
  const a = !!match.a && sameClub(k, clubKey(match.a))
  const b = !!match.b && sameClub(k, clubKey(match.b))
  return a && !b ? 'a' : b && !a ? 'b' : null
}

export type TieClubs = { clubA: string | null; clubB: string | null }

/** The club that has a side — null while nobody of it has taken it. */
export const clubOf = (t: TieClubs, s: Side): string | null => (s === 'a' ? t.clubA : t.clubB)

/**
 * Whether a team captain of these clubs may fill this side (D353, and Ross's
 * default for a club not on Green Dot): their own club's side; or the other
 * side while no captain of that club has taken it, so a tie against a club
 * not on Green Dot can still be filled and scored.
 */
export function maySide(t: TieClubs, captainOf: readonly string[], s: Side): boolean {
  const own = clubOf(t, s)
  if (own) return captainOf.includes(own)
  const other = clubOf(t, otherSide(s))
  return !!other && captainOf.includes(other)
}

/** Whether a team captain of these clubs runs the tie: settling it, a playoff (D360, D361). */
export function mayRun(t: TieClubs, captainOf: readonly string[]): boolean {
  return [t.clubA, t.clubB].some(c => !!c && captainOf.includes(c))
}

/** The side a captain of this club may take on a tie set up by the other — or null. */
export function takeableSide(t: TieClubs, names: { a: string; b: string }, club: { id: string; drawName: string }): Side | null {
  if (t.clubA === club.id || t.clubB === club.id) return null
  const s = clubSide(club.drawName, names)
  return s && !clubOf(t, s) ? s : null
}

// ─── The event ─────────────────────────────────────────────────

/** "Ballinrobe v Castlebar" — the event's name, the competition said beside it on screen. */
export function tieName(a: string, b: string): string {
  return `${a} v ${b}`.slice(0, 120)
}

/**
 * The tie's boards: the Overall ranking the two clubs (the tags), and one
 * Matches session at Golf Ireland's allowance for the format.
 */
export function tieBoards(f: TieFormat, roundId: string): Leaderboard[] {
  const rules: OverallRules = { ranks: 'tags', names: { [roundId]: 'Matches' }, slots: { [roundId]: f.matches } }
  return [
    overallBoard(rules),
    sessionBoard({ kind: 'matches', match: f.match, handicapAllowance: interclubAllowance(f.match), ...(f.tie === 'extra' ? { tie: 'extra' } : {}) }, roundId, daySheetId(roundId)),
  ]
}

/**
 * The boards with a playoff session added (D360): one match, sudden death,
 * worth nothing on the Overall — the tie's points stay what the matches
 * made them, and the playoff only says who goes through.
 */
export function withPlayoff(boards: readonly Leaderboard[], f: TieFormat, roundId: string): Leaderboard[] {
  return [
    ...boards.map(b => {
      if (b.competition !== 'overall' || !b.overall) return b
      const o = b.overall
      return {
        ...b,
        overall: {
          ...o,
          names: { ...(o.names ?? {}), [roundId]: 'Playoff' },
          slots: { ...(o.slots ?? {}), [roundId]: 1 },
          feeds: { ...(o.feeds ?? {}), [roundId]: { kind: 'none' as const } },
        },
      }
    }),
    { ...sessionBoard({ kind: 'matches', match: f.match, handicapAllowance: interclubAllowance(f.match) }, roundId, daySheetId(roundId)), matchTie: 'sudden' },
  ]
}

/** Who may do what on a tie's event: anybody with the link scores a match; the field adds nobody. */
export const TIE_PERMISSIONS = {
  score_session_matches: true,
  add_players: false,
  edit_scores: false,
  edit_handicaps: false,
  assign_tag: false,
} as const

/** The two clubs' colours: the team palette's first two, brick and cobalt — far apart (lib/matchSides.ts). */
export const TIE_COLOURS = [PRESET_COLORS[0], PRESET_COLORS[1]] as const

// ─── Players ───────────────────────────────────────────────────

export const MAX_SIDE_PLAYERS = 24

/** Why this player cannot go on a side — or null. Their interclub index is typed and changeable (D355). */
export function playerIssue(p: { name: string; index: number | null }): string | null {
  const n = p.name.trim()
  if (!n) return 'Give the player’s name.'
  if (n.length > 60) return 'Keep the name to 60 characters.'
  if (p.index !== null && (!Number.isFinite(p.index) || p.index < -10 || p.index > 54)) return 'An index between +10 and 54.'
  return null
}

/**
 * Why these players cannot be one side of a match — or null: the format's
 * number of them (or none, to empty it), all on this side, nobody twice in
 * the tie's matches.
 */
export function sideIssue(
  ids: readonly string[], format: MatchFormat, sidePlayers: ReadonlySet<string>,
  elsewhere: ReadonlySet<string>,
): string | null {
  const need = format === 'singles' ? 1 : 2
  if (ids.length !== 0 && ids.length !== need) return need === 1 ? 'One player a side.' : 'Two players a side.'
  if (new Set(ids).size !== ids.length) return 'A player once.'
  if (ids.some(id => !sidePlayers.has(id))) return 'Pick from this side’s players.'
  const twice = ids.find(id => elsewhere.has(id))
  if (twice) return 'That player is already in another match.'
  return null
}

// ─── The result ────────────────────────────────────────────────

export type TieMatch = {
  slot: number
  sideA: readonly string[]
  sideB: readonly string[]
  result: 'a' | 'b' | 'halved' | null
  margin: string | null
}

/**
 * How many holes a match was won by, off its margin: "3&2" and "3 up" are 3,
 * "at 19th" or a win in sudden death 1, a walkover or a decision none.
 */
export function holesUp(margin: string | null): number {
  if (!margin) return 0
  const m = margin.trim().toLowerCase()
  const lead = m.match(/^(\d+)\s*(?:&|and|up)/)
  if (lead) return Number(lead[1])
  if (/^at\s/.test(m)) return 1
  return 0
}

export type TieScore = {
  a: number
  b: number
  /** Matches with a result. */
  decided: number
  /** Holes up won by each side (the Barton Shield's figure, D362). */
  holesA: number
  holesB: number
}

/** The matches' points — a win one, a half each a half — and holes up beside. */
export function tieScore(matches: readonly TieMatch[]): TieScore {
  const s: TieScore = { a: 0, b: 0, decided: 0, holesA: 0, holesB: 0 }
  for (const m of matches) {
    if (!m.result) continue
    s.decided++
    if (m.result === 'halved') { s.a += 0.5; s.b += 0.5; continue }
    s[m.result] += 1
    if (m.result === 'a') s.holesA += holesUp(m.margin)
    else s.holesB += holesUp(m.margin)
  }
  return s
}

/** A score as people say it: 2½. */
export function points(n: number): string {
  const whole = Math.floor(n)
  return n - whole === 0.5 ? (whole === 0 ? '½' : `${whole}½`) : String(n)
}

export type Settled = { winner: Side; note: string | null; byName: string; at: string }

/** Why a captain's result cannot be kept — or null (D361). */
export function settleIssue(winner: unknown, note: unknown): string | null {
  if (winner !== 'a' && winner !== 'b') return 'Pick the club that goes through.'
  if (note !== null && note !== undefined && (typeof note !== 'string' || note.length > 200)) return 'Keep the note to 200 characters.'
  return null
}

export type TieOutcome = {
  /** Who goes through — null until somebody does. */
  winner: Side | null
  state: 'to_play' | 'in_play' | 'level' | 'playoff' | 'won' | 'settled'
  /** One line: "Ballinrobe win 3½–1½", "All square — a playoff decides it", "Settled: Castlebar go through". */
  line: string
}

/**
 * Where a tie stands, in order of trust: a captain's result over everything
 * (D361); else the matches, once all are decided — the more points wins,
 * level goes to the playoff (D360), whose winner goes through; else in play.
 */
export function tieOutcome(o: {
  names: { a: string; b: string }
  score: TieScore
  matches: number
  settled: Settled | null
  /** The playoff's result, where one has been started. */
  playoff: 'a' | 'b' | 'open' | null
  holes: boolean
}): TieOutcome {
  const { names, score, settled } = o
  const line = `${points(score.a)}–${points(score.b)}`
  const holes = o.holes && (score.holesA || score.holesB) ? ` (holes ${score.holesA}–${score.holesB})` : ''
  if (settled) return { winner: settled.winner, state: 'settled', line: `Settled: ${names[settled.winner]} go through` }
  if (score.decided < o.matches) {
    return score.decided === 0 && score.a + score.b === 0
      ? { winner: null, state: 'to_play', line: 'To play' }
      : { winner: null, state: 'in_play', line: `${names.a} ${line} ${names.b}${holes}` }
  }
  if (score.a !== score.b) {
    const w: Side = score.a > score.b ? 'a' : 'b'
    const [hi, lo] = w === 'a' ? [score.a, score.b] : [score.b, score.a]
    return { winner: w, state: 'won', line: `${names[w]} win ${points(hi)}–${points(lo)}${holes}` }
  }
  if (o.playoff === 'a' || o.playoff === 'b') {
    return { winner: o.playoff, state: 'won', line: `${names[o.playoff]} win on the playoff (${line})` }
  }
  return {
    winner: null,
    state: o.playoff === 'open' ? 'playoff' : 'level',
    line: o.playoff === 'open' ? `All square ${line} — the playoff decides it` : `All square ${line} — pick the playoff`,
  }
}

/**
 * Why these sides cannot play the playoff — or null (D360): the tie level
 * with every match decided, no playoff already, each side the format's
 * number of players, every one of them having played in the tie, and a
 * pair having played together.
 */
export function playoffIssue(o: {
  level: boolean
  started: boolean
  format: MatchFormat
  a: readonly string[]
  b: readonly string[]
  matches: readonly TieMatch[]
}): string | null {
  if (o.started) return 'The playoff has started already.'
  if (!o.level) return 'A playoff is only for a tie level after every match.'
  const need = o.format === 'singles' ? 1 : 2
  if (o.a.length !== need || o.b.length !== need) return need === 1 ? 'Pick one player a side.' : 'Pick a pair a side.'
  const played = (s: Side) => o.matches.map(m => (s === 'a' ? m.sideA : m.sideB))
  for (const [s, ids] of [['a', o.a], ['b', o.b]] as const) {
    const sides = played(s)
    if (need === 1 && !ids.every(id => sides.some(x => x.includes(id)))) return 'Pick from those who played.'
    if (need === 2 && !sides.some(x => ids.every(id => x.includes(id)))) return 'A pair must have played together in the tie.'
  }
  return null
}
