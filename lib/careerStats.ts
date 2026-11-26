// A golfer's career in numbers — the only copy of the rules (Ross, 26 Nov
// 2026). The stats page on Home and in a club (`app/components/stats/`) and
// the card summary that feeds it (lib/cardSummary.ts) read it.
//
// **Strokes gained, measured against a benchmark golfer, never the field.**
// Across a season the field changes every round and most of it records no
// putts, so a field-relative figure would be blank for most club rounds and
// incomparable between the rest. Two benchmarks, each worked out from the
// player's own card alone:
//
//   - **Handicap** (the default): the hole's expected score is par plus the
//     player's share of their course handicap (`holeAllocation`, the stats
//     hub's apportioned-net model) — positive is beating your handicap.
//   - **Scratch**: the same with a handicap of nought — par is the target.
//
// The split is the stats hub's own (`netVsPar`): putting against two putts
// (plus the handicap's putting share), tee to green against the rest. Total
// counts every hole on the card, a no return at its committed maximum;
// putting and tee to green only when every hole finished carries a putt
// count, so the halves add to the whole. **Driving is the one figure that
// needs other cards**: a tee shot's bet on its hole's penalty for missing
// (`drivingBets`), learned from the round's field, and only where at least
// `MIN_OTHERS` other players in the round said where their drives went —
// otherwise driving and approach are left unsplit (a dash on screen).
// Driving reads the same against either benchmark; approach is the rest.
//
// Pure. The summary writer hands a round's holes in; the screen hands rows.

import {
  drivingBets, holeAllocation, netVsPar, MIN_OTHERS, type HoleStat,
} from './holeStats'
import type { SeasonRow } from './cardSummary'

export type Benchmark = 'handicap' | 'scratch'
export const BENCHMARKS: readonly { value: Benchmark; label: string }[] = [
  { value: 'handicap', label: 'Handicap' },
  { value: 'scratch', label: 'Scratch' },
]

/** One card against one benchmark, in strokes over the holes it covers. */
export interface CardGained {
  /** Holes the total is over — every hole on the card. */
  holes: number
  total: number
  /** Holes putting and tee to green are over; 0 when the card has no split. */
  splitHoles: number
  putting: number | null
  toGreen: number | null
  /** Holes driving paid a bet on; 0 when the round's field could not say. */
  drivingHoles: number
  driving: number | null
  approach: number | null
}

/** What a card summary carries (migration 107, `card_summaries.sg`). */
export interface CardSg {
  /** Where the card finished in its round on points, ties shared — null alone or short. */
  place: number | null
  tied: boolean
  /** The cards it was placed among. */
  field: number
  handicap: CardGained | null
  scratch: CardGained | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * One player's card against a benchmark. `round` is the whole round's
 * finished holes, for the driving pools; the player's own are picked out.
 * Null when there is nothing to measure — no holes, or (against a handicap)
 * no handicap on the card.
 */
export function cardGained(round: readonly HoleStat[], playerId: string, benchmark: Benchmark): CardGained | null {
  const done = round.filter(s => !s.live)
  const mine = done.filter(s => s.playerId === playerId)
  if (mine.length === 0) return null
  const hcp = (s: HoleStat) => (benchmark === 'scratch' ? 0 : s.handicap)
  if (mine.some(s => hcp(s) == null)) return null

  const total = mine.reduce((n, s) => n + (s.par + holeAllocation(hcp(s)!, s.strokeIndex) - s.gross), 0)

  const played = mine.filter(s => !s.noReturn)
  const split = played.length > 0 && played.every(s => s.putts != null && s.strokesToGreen != null)
  let putting: number | null = null
  let toGreen: number | null = null
  if (split) {
    const v = netVsPar(played.map(s => ({ ...s, handicap: hcp(s) })), 'fixed').get(playerId)
    if (v) { putting = v.putting; toGreen = v.toGreen }
  }

  // Driving needs a field: other players in the round who said where their drives went.
  const others = new Set(done.filter(s => s.playerId !== playerId && s.fairwayCounted && s.fairway != null).map(s => s.playerId))
  let driving: number | null = null
  let drivingHoles = 0
  if (toGreen != null && others.size >= MIN_OTHERS) {
    const bet = drivingBets(played, done).get(playerId)
    if (bet && bet.holes > 0) { driving = bet.driving; drivingHoles = bet.holes }
  }

  return {
    holes: mine.length,
    total: round2(total),
    splitHoles: split ? played.length : 0,
    putting: putting == null ? null : round2(putting),
    toGreen: toGreen == null ? null : round2(toGreen),
    drivingHoles,
    driving: driving == null ? null : round2(driving),
    approach: driving == null || toGreen == null ? null : round2(toGreen - driving),
  }
}

/**
 * Where each card finished in its round, on Stableford points, level cards
 * sharing a place ("T3"). Only the cards with the round's most holes are
 * placed — a nine beside eighteens finished nowhere — and a round of one
 * card places nobody.
 */
export function roundPlaces(cards: readonly { playerId: string; holes: number; points: number }[]): Map<string, { place: number; tied: boolean; field: number }> {
  const most = Math.max(0, ...cards.map(c => c.holes))
  const placed = cards.filter(c => c.holes === most)
  const out = new Map<string, { place: number; tied: boolean; field: number }>()
  if (placed.length < 2) return out
  for (const c of placed) {
    const better = placed.filter(o => o.points > c.points).length
    const level = placed.filter(o => o.points === c.points).length
    out.set(c.playerId, { place: better + 1, tied: level > 1, field: placed.length })
  }
  return out
}

/** "T3", "1st"-free: a board's own way of writing a place. */
export function placeLabel(sg: Pick<CardSg, 'place' | 'tied'> | null | undefined): string {
  if (!sg || sg.place == null) return '–'
  return `${sg.tied ? 'T' : ''}${sg.place}`
}

// ─── The career, from the summary rows ─────────────────────────

/** A season row with what migration 107 adds, and whether it was a club competition. */
export type CareerRow = SeasonRow & {
  player_id?: string
  sg?: CardSg | null
  /** A club competition's round (`trips.competition = 'club'`): serious golf, marked as such. */
  competition?: boolean
}

export type RoundsFilter = 'all' | 'comps'
export const ROUND_FILTERS: readonly { value: RoundsFilter; label: string }[] = [
  { value: 'all', label: 'All rounds' },
  { value: 'comps', label: 'Comps' },
]

export function filterRounds<T extends CareerRow>(rows: readonly T[], f: RoundsFilter): T[] {
  return f === 'comps' ? rows.filter(r => r.competition) : [...rows]
}

/** The figures a round can be read for, each per eighteen holes. */
export type Metric = 'total' | 'toGreen' | 'driving' | 'approach' | 'putting' | 'points' | 'gross'
export const SG_METRICS: readonly { value: Metric; label: string; short: string }[] = [
  { value: 'total', label: 'Total', short: 'Total' },
  { value: 'toGreen', label: 'Tee to green', short: 'T2G' },
  { value: 'driving', label: 'Driving', short: 'Drive' },
  { value: 'approach', label: 'Approach', short: 'App' },
  { value: 'putting', label: 'Putting', short: 'Putt' },
]
export const METRICS: readonly { value: Metric; label: string }[] = [
  ...SG_METRICS.map(({ value, label }) => ({ value, label: `SG ${label}` })),
  { value: 'points', label: 'Points' },
  { value: 'gross', label: 'Gross' },
]

/** The holes a strokes-gained figure on a card is over. */
function holesFor(g: CardGained, m: Metric): number {
  return m === 'total' ? g.holes : m === 'driving' || m === 'approach' ? (g.driving == null ? 0 : g.splitHoles) : g.splitHoles
}

/** One card's figure as it stands on the card — null where it was not recorded. */
export function cardValue(r: CareerRow, m: Metric, b: Benchmark): number | null {
  if (m === 'points') return r.holes >= 18 ? r.points : null
  if (m === 'gross') return r.holes >= 18 ? r.gross : null
  const g = r.sg?.[b]
  if (!g) return null
  const v = g[m]
  return v == null || holesFor(g, m) === 0 ? null : v
}

/** One card's figure per eighteen holes, so a nine sits beside an eighteen honestly. */
export function per18(r: CareerRow, m: Metric, b: Benchmark): number | null {
  const v = cardValue(r, m, b)
  if (v == null) return null
  if (m === 'points' || m === 'gross') return v
  const g = r.sg![b]!
  return (v / holesFor(g, m)) * 18
}

/**
 * The average over a set of cards, per eighteen: strokes over holes for a
 * strokes-gained figure (a nine weighs half), a plain mean of eighteen-hole
 * cards for points and gross. Null with nothing to average.
 */
export function averageOf(rows: readonly CareerRow[], m: Metric, b: Benchmark): { value: number; rounds: number } | null {
  if (m === 'points' || m === 'gross') {
    const vs = rows.map(r => cardValue(r, m, b)).filter((v): v is number => v != null)
    return vs.length ? { value: vs.reduce((a, v) => a + v, 0) / vs.length, rounds: vs.length } : null
  }
  let sum = 0, holes = 0, rounds = 0
  for (const r of rows) {
    const v = cardValue(r, m, b)
    if (v == null) continue
    sum += v; holes += holesFor(r.sg![b]!, m); rounds++
  }
  return holes ? { value: (sum / holes) * 18, rounds } : null
}

/** Oldest first — the order a chart is read in. Rows come newest first. */
export function chronological<T extends CareerRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, c) => (a.played_on ?? '').localeCompare(c.played_on ?? '') || a.round_id.localeCompare(c.round_id))
}

/**
 * The moving average (DataGolf's rolling line): at each card that recorded
 * the figure, the average of it and the `window − 1` before it that did —
 * fewer at the start, which the chart says. Cards without the figure are
 * skipped, never counted as nought.
 */
export function rollingAverage(rows: readonly CareerRow[], m: Metric, b: Benchmark, window: number): { row: CareerRow; value: number; n: number }[] {
  const seen: CareerRow[] = []
  const out: { row: CareerRow; value: number; n: number }[] = []
  for (const r of chronological(rows)) {
    if (cardValue(r, m, b) == null) continue
    seen.push(r)
    const last = seen.slice(-window)
    const a = averageOf(last, m, b)
    if (a) out.push({ row: r, value: a.value, n: last.length })
  }
  return out
}

export const ROLLING_WINDOWS = [5, 10, 20, 50] as const
export const DEFAULT_WINDOW = 10

/** The skill profile's five spokes (the stats hub's own order), per eighteen over the last `take` cards. */
export function skillProfile(rows: readonly CareerRow[], b: Benchmark, take: number | null): { key: Metric; label: string; value: number; rounds: number }[] | null {
  const recent = (list: CareerRow[]) => (take == null ? list : list.slice(-take))
  const ordered = chronological(rows)
  const axes = SG_METRICS.map(({ value: key, label }) => {
    const withIt = recent(ordered.filter(r => cardValue(r, key, b) != null))
    const a = averageOf(withIt, key, b)
    return a ? { key, label, value: a.value, rounds: a.rounds } : null
  })
  // The shape needs its split: without putts there is only a total, and a pentagon of one spoke is not one.
  if (axes.some(a => a == null)) return null
  return axes as { key: Metric; label: string; value: number; rounds: number }[]
}

/**
 * How strongly a strokes-gained cell is shaded (DataGolf's heat), 0 to 1:
 * three strokes a round either way is full strength. The sign says which
 * colour — emerald up, bark down (lib/resultTone.ts, never red).
 */
export function heatOf(v: number | null, full = 3): number {
  if (v == null || !Number.isFinite(v)) return 0
  return Math.min(1, Math.abs(v) / full)
}

/** A strokes-gained figure as a board writes it: signed, two places. */
export function formatSg(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '–'
  const r = Math.round(v * 100) / 100
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(2)}`
}
