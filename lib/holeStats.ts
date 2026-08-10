// What a hole says about how it was played.
//
// A gross score says how many shots. Two more answers — how many of them
// were putts, and which way the tee shot went — are enough for greens in
// regulation, fairway accuracy, a hole-difficulty order taken off real play
// rather than off the printed stroke index, and a comparison of one player
// against the rest of the field on the same holes.
//
// **This is the only copy of every rule below.** Greens in regulation is
// deliberately not a stored column: it needs the player's own par, and a
// ladies card and a men's disagree about the same hole. Par is asked for
// here, never restated — `effectivePar` and `effectiveSI` from ./boardRows
// are the same two functions the leaderboard and the Postgres trigger agree
// through, so a card and a stat cannot come apart.
//
// Pure. No I/O — the caller fetches and hands the rows in, the same split as
// lib/rowContext.ts.

import {
  effectivePar, effectiveSI,
  type RowHole, type RowPlayer, type ResolvedScore,
} from './boardRows'

export type Fairway = 'left' | 'fairway' | 'right'

// ─── The thresholds ────────────────────────────────────────────
//
// Exported constants rather than numbers buried in the arithmetic, because
// every one of them is a judgement somebody should be able to argue with in
// one place.

/**
 * How many *other* cards a hole needs before a gain off it means anything.
 *
 * Three. With one other player "the field" is one person having a bad hole,
 * and with two it is barely more. The comparison is across the whole round
 * rather than the group, so a trip of any size clears this easily — a
 * twelve-hander gives eleven.
 */
export const MIN_OTHERS = 3

/** Cards on a hole before its difficulty is settled rather than provisional. */
export const MIN_HOLE_SAMPLE = 8

/** Missed fairways before a left/right lean can be called at all. */
export const MIN_MISSES = 4

/**
 * How much of the misses have to go one way before it is a lean.
 *
 * Two thirds. A count threshold alone is not enough: twelve misses split
 * seven and five cleared `MIN_MISSES` comfortably and printed as "leaning
 * left", which is a coin toss described as a swing fault. Both tests have to
 * pass — enough misses, and enough of them one way.
 */
export const BIAS_SHARE = 2 / 3

// ─── One hole, everything derived ──────────────────────────────

/**
 * A hole with every rule already applied, so they are applied once rather
 * than once per statistic.
 */
export type HoleStat = {
  playerId: string
  roundId: string
  holeId: string
  holeNumber: number
  courseId: string
  /** This player's par for this hole. Never the card's, where they differ. */
  par: number
  strokeIndex: number
  gross: number
  /**
   * The hole's Stableford points, as stored beside the score.
   *
   * The handicap arrives here and nowhere else: every point was computed at
   * the competition's own allowances when the score was written, so a net
   * comparison built on points inherits exactly the handicaps the trip
   * plays off, without this module ever seeing one.
   */
  points: number
  /**
   * The playing handicap this round's card was scored off — the same
   * `round_handicaps` snapshot the Stableford trigger read, so the
   * apportioned-net figures below and the points on the card agree about
   * what the handicap was. Null when the caller had no snapshot to offer.
   */
  handicap: number | null
  /** Still on an open card. The charts read finalised holes only. */
  live: boolean
  putts: number | null
  fairway: Fairway | null
  /** `gross - putts`. Null when no putt count was recorded. */
  strokesToGreen: number | null
  /** `strokesToGreen <= par - 2`. Null when no putt count was recorded. */
  gir: boolean | null
  /** Whether the fairway question applies at all — par 4 and 5 only. */
  fairwayCounted: boolean
}

/** What the derivation needs: the same rows a board is built from. */
export type StatsContext = {
  /** Gender only — and membership, which is what keeps composites out. */
  players: readonly RowPlayer[]
  holes: readonly RowHole[]
  resolved: readonly ResolvedScore[]
  /**
   * Playing handicap keyed `${roundId}:${playerId}` — `RowContext.hcpFor`,
   * passed straight through. Optional because the write-path tests build a
   * bare context; without it every `handicap` is null and the net figures
   * simply have nothing to say.
   */
  hcpFor?: ReadonlyMap<string, number>
}

/** Shots to reach the green. Null when there is no putt count to subtract. */
export function strokesToGreen(gross: number | null, putts: number | null): number | null {
  if (gross == null || putts == null) return null
  return gross - putts
}

/**
 * On the green with two putts left for par.
 *
 * A chip-in is correctly *not* one: a par 4 holed in 3 with no putts took
 * three shots to reach the surface. The stat is about finding the green, not
 * about scoring well, and those come apart exactly here.
 */
export function isGreenInRegulation(
  gross: number | null, putts: number | null, par: number,
): boolean | null {
  const s = strokesToGreen(gross, putts)
  return s == null ? null : s <= par - 2
}

/** A par 3 has no fairway to find, which is not the same as missing one. */
export function countsForFairway(par: number): boolean {
  return par >= 4
}

/**
 * Every hole worth counting, with its rules applied.
 *
 * The rules, each of them a reason to drop a row rather than guess at it:
 *
 *  · a no return is out. The gross stored beside one is a computed maximum,
 *    not a hole anybody finished, and averaging it in would say somebody
 *    played badly when they picked up.
 *  · a hole whose player is not on the roster is out. Composite players get
 *    synthetic `scores` rows, and a synthetic card has no putting.
 *  · a hole not in the list is out — the same rule `resolveScores` applies.
 *  · more putts than shots is impossible, so the putt count is dropped and
 *    the hole is kept. The database deliberately does not refuse it; a
 *    commit that fails on the eighteenth green is the worse failure.
 *  · a fairway stored against a par 3 is dropped, because a course's par can
 *    be corrected after a card was signed.
 */
export function holeStats(ctx: StatsContext): HoleStat[] {
  const holeById = new Map(ctx.holes.map(h => [h.id, h]))
  const genderOf = new Map(ctx.players.map(p => [p.id, p.gender]))
  const out: HoleStat[] = []

  for (const s of ctx.resolved) {
    if (s.noReturn || s.gross == null) continue
    const gender = genderOf.get(s.playerId)
    if (gender == null) continue
    const hole = holeById.get(s.holeId)
    if (!hole) continue

    const par = effectivePar(hole, gender)
    const fairwayCounted = countsForFairway(par)

    const raw = s.putts
    const putts = raw == null || !Number.isInteger(raw) || raw < 0 || raw > s.gross
      ? null
      : raw

    const toGreen = strokesToGreen(s.gross, putts)

    out.push({
      playerId: s.playerId,
      roundId: s.roundId,
      holeId: s.holeId,
      holeNumber: s.holeNumber,
      courseId: hole.course_id,
      par,
      strokeIndex: effectiveSI(hole, gender),
      gross: s.gross,
      points: s.points,
      handicap: ctx.hcpFor?.get(`${s.roundId}:${s.playerId}`) ?? null,
      live: s.live,
      putts,
      fairway: fairwayCounted ? (s.fairway ?? null) : null,
      strokesToGreen: toGreen,
      gir: toGreen == null ? null : toGreen <= par - 2,
      fairwayCounted,
    })
  }

  return out
}

// ─── Fairways ──────────────────────────────────────────────────

export type FairwayStats = {
  /** Par 4s and 5s with an answer against them. The denominator. */
  counted: number
  hit: number
  missedLeft: number
  missedRight: number
  /** 0–1, not a percentage. Null when nothing has been counted. */
  hitRate: number | null
  /**
   * Which way they miss when they miss.
   *
   * Null unless there are at least `MIN_MISSES` of them **and** at least
   * `BIAS_SHARE` of those went the same way. Two misses to one is not a
   * tendency, and neither is seven to five.
   */
  missBias: 'left' | 'right' | null
}

export function fairwayStats(stats: readonly HoleStat[]): FairwayStats {
  // A par 4 with no answer is out of the denominator too: an unanswered
  // question is not a missed fairway.
  const asked = stats.filter(s => s.fairwayCounted && s.fairway != null)
  const hit = asked.filter(s => s.fairway === 'fairway').length
  const missedLeft = asked.filter(s => s.fairway === 'left').length
  const missedRight = asked.filter(s => s.fairway === 'right').length
  const misses = missedLeft + missedRight

  return {
    counted: asked.length,
    hit,
    missedLeft,
    missedRight,
    hitRate: asked.length === 0 ? null : hit / asked.length,
    missBias: misses < MIN_MISSES
      ? null
      : missedLeft >= misses * BIAS_SHARE ? 'left'
      : missedRight >= misses * BIAS_SHARE ? 'right'
      : null,
  }
}

// ─── Putting and greens ────────────────────────────────────────

export type PuttingStats = {
  /** Holes with a putt count. */
  holes: number
  putts: number
  puttsPerHole: number | null
  /** `puttsPerHole × 18` — what a full round looks like at this rate. */
  puttsPer18: number | null
  greenHoles: number
  greensHit: number
  girRate: number | null
  /** Putts taken on the greens they actually hit. The putting figure. */
  puttsOnGreensHit: number
  puttsPerGreenHit: number | null
  /**
   * The distribution's two tails. A one-putt is a hole won on the green; a
   * three-putt is one given away there. The average hides both — 36 putts a
   * round can be eighteen twos or a coin toss between ones and threes, and
   * only one of those putters is in trouble.
   */
  onePutts: number
  threePuttsOrWorse: number
  onePuttRate: number | null
  threePuttRate: number | null
}

export function puttingStats(stats: readonly HoleStat[]): PuttingStats {
  const withPutts = stats.filter(s => s.putts != null)
  const putts = withPutts.reduce((n, s) => n + s.putts!, 0)
  const known = stats.filter(s => s.gir != null)
  const hit = known.filter(s => s.gir === true)
  const onHit = hit.reduce((n, s) => n + (s.putts ?? 0), 0)
  // `<= 1` on the ones, deliberately: a chip-in has zero putts and is a hole
  // that needed at most one, which is what the tail is measuring.
  const ones = withPutts.filter(s => s.putts! <= 1).length
  const threes = withPutts.filter(s => s.putts! >= 3).length

  return {
    holes: withPutts.length,
    putts,
    puttsPerHole: withPutts.length === 0 ? null : putts / withPutts.length,
    puttsPer18: withPutts.length === 0 ? null : (putts / withPutts.length) * 18,
    greenHoles: known.length,
    greensHit: hit.length,
    girRate: known.length === 0 ? null : hit.length / known.length,
    puttsOnGreensHit: onHit,
    puttsPerGreenHit: hit.length === 0 ? null : onHit / hit.length,
    onePutts: ones,
    threePuttsOrWorse: threes,
    onePuttRate: withPutts.length === 0 ? null : ones / withPutts.length,
    threePuttRate: withPutts.length === 0 ? null : threes / withPutts.length,
  }
}

// ─── Scoring, off the gross alone ──────────────────────────────
//
// These need no putt count and no fairway, so they cover every scored hole
// on the trip — including holes played before stats were switched on.

export type ScoringCounts = {
  eaglesOrBetter: number
  birdies: number
  pars: number
  bogeys: number
  doublesOrWorse: number
  /**
   * A double or worse with the very next hole of the same round scored.
   *
   * Consecutive by hole number, strictly: a no return after a blow-up drops
   * the chance rather than promoting whatever came after it, because an NR
   * following a double reads more like the blow-up continuing than a clean
   * slate. The eighteenth can never be a chance — there is no next hole.
   */
  bounceBackChances: number
  /** Of those, the next hole was par or better. */
  bounceBacks: number
  bounceBackRate: number | null
}

export function scoringCounts(stats: readonly HoleStat[]): ScoringCounts {
  const toPar = (s: HoleStat) => s.gross - s.par

  const out = {
    eaglesOrBetter: stats.filter(s => toPar(s) <= -2).length,
    birdies: stats.filter(s => toPar(s) === -1).length,
    pars: stats.filter(s => toPar(s) === 0).length,
    bogeys: stats.filter(s => toPar(s) === 1).length,
    doublesOrWorse: stats.filter(s => toPar(s) >= 2).length,
    bounceBackChances: 0,
    bounceBacks: 0,
    bounceBackRate: null as number | null,
  }

  // Round by round, in the order the holes were played. The input is not
  // assumed sorted — it comes off a database in whatever order it comes.
  const byRound = new Map<string, HoleStat[]>()
  for (const s of stats) {
    const list = byRound.get(s.roundId)
    if (list) list.push(s)
    else byRound.set(s.roundId, [s])
  }
  for (const round of byRound.values()) {
    round.sort((a, b) => a.holeNumber - b.holeNumber)
    for (let i = 0; i < round.length - 1; i++) {
      if (toPar(round[i]) < 2) continue
      if (round[i + 1].holeNumber !== round[i].holeNumber + 1) continue
      out.bounceBackChances += 1
      if (toPar(round[i + 1]) <= 0) out.bounceBacks += 1
    }
  }

  out.bounceBackRate = out.bounceBackChances === 0
    ? null
    : out.bounceBacks / out.bounceBackChances
  return out
}

// ─── Scrambling ────────────────────────────────────────────────

export type Scrambling = {
  /** Greens missed — `gir === false`, so a putt count is already known. */
  chances: number
  /** Of those, the hole was still par or better. */
  saves: number
  rate: number | null
}

/**
 * The short game, in one number: how often a missed green still made par.
 *
 * A chip-in birdie on a missed green is a save — the best kind. The
 * denominator needs `gir` known, which needs a putt count, so a hole with a
 * gross alone is invisible here rather than guessed at.
 */
export function scrambling(stats: readonly HoleStat[]): Scrambling {
  const missed = stats.filter(s => s.gir === false)
  const saves = missed.filter(s => s.gross <= s.par).length
  return {
    chances: missed.length,
    saves,
    rate: missed.length === 0 ? null : saves / missed.length,
  }
}

// ─── Approach and tee to green ─────────────────────────────────

/** One side of the fairway split. */
export type FromWhere = {
  holes: number
  greensHit: number
  girRate: number | null
}

export type ApproachStats = {
  /**
   * Greens found from the fairway vs from a miss.
   *
   * Only holes with both a fairway answer and a putt count are in either
   * side. The gap between the two rates is what a wayward tee shot actually
   * costs — the closest this data comes to isolating the approach shot.
   */
  fromFairway: FromWhere
  fromMiss: FromWhere
  /**
   * `strokesToGreen − (par − 2)`, averaged over holes with a putt count.
   *
   * Regulation is par minus two putts, so 0.0 is finding greens on schedule
   * every time and +0.5 is half a shot of long-game leakage per hole. The
   * long-game twin of putts per hole.
   */
  vsRegulation: number | null
}

const fromWhere = (holes: readonly HoleStat[]): FromWhere => {
  const hit = holes.filter(s => s.gir === true).length
  return {
    holes: holes.length,
    greensHit: hit,
    girRate: holes.length === 0 ? null : hit / holes.length,
  }
}

export function approachStats(stats: readonly HoleStat[]): ApproachStats {
  const answered = stats.filter(s => s.fairway != null && s.gir != null)
  const withPutts = stats.filter(s => s.strokesToGreen != null)
  const leak = withPutts.reduce((n, s) => n + (s.strokesToGreen! - (s.par - 2)), 0)

  return {
    fromFairway: fromWhere(answered.filter(s => s.fairway === 'fairway')),
    fromMiss: fromWhere(answered.filter(s => s.fairway !== 'fairway')),
    vsRegulation: withPutts.length === 0 ? null : leak / withPutts.length,
  }
}

// ─── The same figures, par by par ──────────────────────────────

export type ParSplit = {
  par: number
  holes: number
  averageToPar: number
  girRate: number | null
  averagePutts: number | null
  vsRegulation: number | null
}

/**
 * Where the shots leak, by the kind of hole.
 *
 * Split on **the player's own par** — a hole that is a par 5 on the men's
 * card and a par 4 on the ladies' counts in each player's own column, which
 * is the same rule as everywhere else in this file.
 *
 * The par-3 row's `girRate` doubles as the iron-play figure: no fairway is
 * involved, so finding a par-3 green is the tee shot and nothing else.
 */
export function parSplits(stats: readonly HoleStat[]): ParSplit[] {
  return [3, 4, 5].map(par => {
    const mine = stats.filter(s => s.par === par)
    const known = mine.filter(s => s.gir != null)
    const withPutts = mine.filter(s => s.putts != null)
    const putts = withPutts.reduce((n, s) => n + s.putts!, 0)
    const leak = withPutts.reduce((n, s) => n + (s.strokesToGreen! - (s.par - 2)), 0)

    return {
      par,
      holes: mine.length,
      averageToPar: mine.length === 0
        ? 0
        : mine.reduce((n, s) => n + (s.gross - s.par), 0) / mine.length,
      girRate: known.length === 0
        ? null
        : known.filter(s => s.gir === true).length / known.length,
      averagePutts: withPutts.length === 0 ? null : putts / withPutts.length,
      vsRegulation: withPutts.length === 0 ? null : leak / withPutts.length,
    }
  }).filter(row => row.holes > 0)
}

// ─── Gained on the field ───────────────────────────────────────

export type Gained = {
  playerId: string
  /** The field's average putts on the hole, minus theirs. Positive is better. */
  putting: number
  /** The field's average shots to the green, minus theirs. */
  toGreen: number
  /** The two added — and, by construction, the gain in gross shots. */
  total: number
  /** Holes that contributed. Zero means the three figures above are zero. */
  holes: number
}

/**
 * How each player did against everyone else, hole by hole.
 *
 * **Gross, on the shots played rather than the shots allowed.** No handicap
 * appears anywhere in this function. A net version would need the hole's strokes
 * to come off the long game only — shots are given for reaching the green,
 * not for putting — and that is a different statistic, not this one written
 * more carefully.
 *
 * **A player is excluded from their own field.** Including yourself damps
 * every gain by `1/n` and compares you partly against yourself. It also
 * costs the property that makes this checkable: with self-exclusion the
 * gains over a hole sum to exactly zero, because
 * `Σᵢ[(S − xᵢ)/(n − 1) − xᵢ] = (nS − S)/(n − 1) − S = 0`.
 *
 * Both halves are averaged over the **same** subset — the players on that
 * hole with a putt count — which is why `putting + toGreen` is exactly the
 * gain in gross shots and not merely close to it. A hole where the player
 * has no putt count contributes to none of the three.
 */
export function gainedOnField(stats: readonly HoleStat[]): Map<string, Gained> {
  const byHole = new Map<string, HoleStat[]>()
  for (const s of stats) {
    if (s.putts == null || s.strokesToGreen == null) continue
    const key = `${s.roundId}:${s.holeId}`
    const list = byHole.get(key)
    if (list) list.push(s)
    else byHole.set(key, [s])
  }

  const out = new Map<string, Gained>()
  const get = (id: string) => {
    let g = out.get(id)
    if (!g) { g = { playerId: id, putting: 0, toGreen: 0, total: 0, holes: 0 }; out.set(id, g) }
    return g
  }

  for (const played of byHole.values()) {
    if (played.length - 1 < MIN_OTHERS) continue

    const sumPutts = played.reduce((n, s) => n + s.putts!, 0)
    const sumToGreen = played.reduce((n, s) => n + s.strokesToGreen!, 0)
    const others = played.length - 1

    for (const s of played) {
      const g = get(s.playerId)
      g.putting += (sumPutts - s.putts!) / others - s.putts!
      g.toGreen += (sumToGreen - s.strokesToGreen!) / others - s.strokesToGreen!
      g.holes += 1
    }
  }

  for (const g of out.values()) g.total = g.putting + g.toGreen
  return out
}

// ─── Sharing the handicap out over the holes ───────────────────
//
// The apportioned-net model: turn the course handicap itself into a per-hole
// expectation and run the same field arithmetic on net strokes. Unlike the
// points comparison it does not saturate on a blow-up hole, and it can be
// split into putting and long game.

/**
 * How steeply the allocation tilts across the stroke index, per unit of
 * handicap. Calibrated so a 9-handicap runs 0.65 on SI 1 down to 0.35 on
 * SI 18 — the gap to scratch is wider on the hard holes than the easy ones.
 */
export const ALLOCATION_TILT = 0.15 / 9

/**
 * One hole's share of a course handicap.
 *
 * `CH/18` plus a straight-line tilt through zero at SI 9.5 — and because the
 * tilt is symmetric about the middle, pairing hole 1 with 18, 2 with 17,
 * cancels every pair, so the eighteen shares sum to exactly the handicap.
 *
 * **A plus handicap mirrors through SI 19 − i, never just a sign flip.** The
 * give-back lands on the easiest holes first, so the allocation must be most
 * negative at SI 18. Running the positive formula with a negative number
 * puts the biggest give-back on SI 1 — the wrong end. This is the same
 * mirror `shotsReceived` in lib/handicap.ts needs, the one that was written
 * out wrong five separate times before it was centralised; hence one copy,
 * here, beside the same warning.
 */
export function holeAllocation(courseHandicap: number, strokeIndex: number): number {
  if (courseHandicap < 0) return -holeAllocation(-courseHandicap, 19 - strokeIndex)
  return courseHandicap / 18
    + ALLOCATION_TILT * courseHandicap * (9.5 - strokeIndex) / 8.5
}

/**
 * How much of a hole's allocation belongs to putting.
 *
 * `fixed` — the default — gives putting a flat fifth: measured scoring says
 * the gap between handicaps lives mostly in the long game. `by-par` gives it
 * `2/par`, the regulation share of the hole's shots — half on a par 4 —
 * which reads naturally but over-credits putting. Both ship; the stats
 * page's advanced settings choose, and this is the one copy of each.
 */
export type PuttShareMode = 'fixed' | 'by-par'
export const FIXED_PUTT_SHARE = 0.2

export function puttShare(mode: PuttShareMode, par: number): number {
  return mode === 'by-par' ? 2 / par : FIXED_PUTT_SHARE
}

export type NetGained = {
  playerId: string
  /** Net putts vs the field's net putts on the same holes. Positive is better. */
  putting: number
  toGreen: number
  /** The two added — the gain in net strokes. */
  total: number
  holes: number
}

/**
 * Net gained on the field: subtract each player's per-hole allocation from
 * what they took, then run exactly the self-excluding machinery of
 * `gainedOnField` on what is left. The sums-to-zero identity survives
 * untouched — it is pure algebra and never cared what the numbers were.
 *
 * The allocation is split between the two halves by `puttShare`, off the
 * player's own par, so `putting + toGreen` is exactly `total` — the same
 * same-subset rule that makes the gross version reconcile.
 */
export function netGainedOnField(
  stats: readonly HoleStat[], mode: PuttShareMode = 'fixed',
): Map<string, NetGained> {
  const byHole = new Map<string, HoleStat[]>()
  for (const s of stats) {
    if (s.putts == null || s.strokesToGreen == null || s.handicap == null) continue
    const key = `${s.roundId}:${s.holeId}`
    const list = byHole.get(key)
    if (list) list.push(s)
    else byHole.set(key, [s])
  }

  const out = new Map<string, NetGained>()
  const get = (id: string) => {
    let g = out.get(id)
    if (!g) { g = { playerId: id, putting: 0, toGreen: 0, total: 0, holes: 0 }; out.set(id, g) }
    return g
  }

  for (const played of byHole.values()) {
    if (played.length - 1 < MIN_OTHERS) continue

    const share = (s: HoleStat) => puttShare(mode, s.par)
    const netPutts = (s: HoleStat) =>
      s.putts! - holeAllocation(s.handicap!, s.strokeIndex) * share(s)
    const netToGreen = (s: HoleStat) =>
      s.strokesToGreen! - holeAllocation(s.handicap!, s.strokeIndex) * (1 - share(s))

    const sumPutts = played.reduce((n, s) => n + netPutts(s), 0)
    const sumToGreen = played.reduce((n, s) => n + netToGreen(s), 0)
    const others = played.length - 1

    for (const s of played) {
      const g = get(s.playerId)
      g.putting += (sumPutts - netPutts(s)) / others - netPutts(s)
      g.toGreen += (sumToGreen - netToGreen(s)) / others - netToGreen(s)
      g.holes += 1
    }
  }

  for (const g of out.values()) g.total = g.putting + g.toGreen
  return out
}

export type NetVsPar = {
  playerId: string
  putting: number
  toGreen: number
  /** `(par + allocation) − gross`, summed. Positive is beating expectation. */
  total: number
  holes: number
}

/**
 * The same net figures against the course instead of the field: a hole's
 * expected score is `par + allocation`, split `2 + a·share` putts and
 * `(par − 2) + a·(1 − share)` to the green. Vs-par does not sum to zero
 * across the field — it is measured against the course, not against each
 * other — which is exactly why both framings are worth having.
 */
export function netVsPar(
  stats: readonly HoleStat[], mode: PuttShareMode = 'fixed',
): Map<string, NetVsPar> {
  const out = new Map<string, NetVsPar>()
  for (const s of stats) {
    if (s.putts == null || s.strokesToGreen == null || s.handicap == null) continue
    let g = out.get(s.playerId)
    if (!g) { g = { playerId: s.playerId, putting: 0, toGreen: 0, total: 0, holes: 0 }; out.set(s.playerId, g) }
    const a = holeAllocation(s.handicap, s.strokeIndex)
    const share = puttShare(mode, s.par)
    g.putting += (2 + a * share) - s.putts
    g.toGreen += (s.par - 2 + a * (1 - share)) - s.strokesToGreen
    g.holes += 1
  }
  for (const g of out.values()) g.total = g.putting + g.toGreen
  return out
}

// ─── Splitting the long game: driving and approach ─────────────

/**
 * Cards on one side of a hole's fairway split before that hole's own penalty
 * stands alone. Below it, the pool widens to every hole of the same par on
 * the course; below it there too, the hole pays no driving credit at all
 * rather than a made-up one.
 */
export const MIN_SIDE = 4

export type LongGameGained = {
  playerId: string
  /** `(hit − field hit rate) × the pool's penalty for missing`, summed. */
  driving: number
  /** The rest of the long game: `toGreen − driving`. Exact by construction. */
  approach: number
  /** The same tee-to-green gain `gainedOnField` reports. */
  toGreen: number
  /** Holes contributing to `toGreen`. */
  holes: number
  /** Of those, holes that could pay a driving credit. */
  drivingHoles: number
}

type FairwayPool = { toGreenHit: number[]; toGreenMiss: number[]; hits: number; cards: number }

/**
 * Tee-to-green gained, split into driving accuracy and approach.
 *
 * The algebra: add and subtract the field's average from where the drive
 * finished, and tee-to-green gained falls into two brackets — the value of
 * where the ball landed (driving), and everything after it (approach). The
 * driving bracket simplifies to a bet on the hole's own penalty:
 * `(hit − field hit rate) × (avg to-green from a miss − from the fairway)`.
 * Hitting a fairway everybody hits earns almost nothing; hitting one nobody
 * hits earns nearly the whole penalty. Approach is defined as the remainder,
 * which is what makes `driving + approach = toGreen` exact rather than
 * approximate — and a par 3's whole to-green is approach, which matches the
 * golf: the tee shot on a par 3 *is* the approach.
 *
 * `poolSource` is who the penalties and hit rates are learned from —
 * normally the same rows, but a per-round slice hands the full trip in so
 * one round's chart does not relearn the course from six cards. Pools are
 * per course hole across rounds; a course played twice is one set of
 * eighteen holes with twice the evidence.
 */
export function longGameGained(
  stats: readonly HoleStat[],
  poolSource: readonly HoleStat[] = stats,
): Map<string, LongGameGained> {
  // The pools: per course hole, and per par as the wider fallback.
  const pools = new Map<string, FairwayPool>()
  const pool = (key: string) => {
    let p = pools.get(key)
    if (!p) { p = { toGreenHit: [], toGreenMiss: [], hits: 0, cards: 0 }; pools.set(key, p) }
    return p
  }
  for (const s of poolSource) {
    if (!s.fairwayCounted || s.fairway == null || s.strokesToGreen == null) continue
    for (const key of [`${s.courseId}:h${s.holeNumber}`, `${s.courseId}:p${s.par}`]) {
      const p = pool(key)
      p.cards += 1
      if (s.fairway === 'fairway') { p.hits += 1; p.toGreenHit.push(s.strokesToGreen) }
      else p.toGreenMiss.push(s.strokesToGreen)
    }
  }

  const avg = (xs: number[]) => xs.reduce((n, x) => n + x, 0) / xs.length

  // The tee-to-green half is the one `gainedOnField` already reports — the
  // same figure, never a second derivation of it.
  const gained = gainedOnField(stats)

  const out = new Map<string, LongGameGained>()
  for (const [playerId, g] of gained) {
    out.set(playerId, {
      playerId, driving: 0, approach: 0,
      toGreen: g.toGreen, holes: g.holes, drivingHoles: 0,
    })
  }

  for (const s of stats) {
    if (!s.fairwayCounted || s.fairway == null || s.strokesToGreen == null) continue
    const mine = out.get(s.playerId)
    if (!mine) continue

    // The hole's own pool if both sides carry enough cards without this one;
    // the par pool behind it; nothing behind that.
    const chosen = [`${s.courseId}:h${s.holeNumber}`, `${s.courseId}:p${s.par}`]
      .map(k => pools.get(k))
      .find(p => {
        if (!p) return false
        const hit = s.fairway === 'fairway' ? 1 : 0
        return p.toGreenHit.length - hit >= MIN_SIDE
          && p.toGreenMiss.length - (1 - hit) >= MIN_SIDE
      })
    if (!chosen) continue

    // Self-excluded, both halves — a penalty partly made of your own card is
    // partly a comparison with yourself. Removing one element with your
    // value is numerically the same as removing your own card.
    const hit = s.fairway === 'fairway' ? 1 : 0
    const hitAvg = hit
      ? avg(chosen.toGreenHit.filter((_, i) => i !== chosen.toGreenHit.indexOf(s.strokesToGreen!)))
      : avg(chosen.toGreenHit)
    const missAvg = hit
      ? avg(chosen.toGreenMiss)
      : avg(chosen.toGreenMiss.filter((_, i) => i !== chosen.toGreenMiss.indexOf(s.strokesToGreen!)))
    const penalty = missAvg - hitAvg
    const fieldHitRate = (chosen.hits - hit) / (chosen.cards - 1)

    mine.driving += (hit - fieldHitRate) * penalty
    mine.drivingHoles += 1
  }

  for (const g of out.values()) g.approach = g.toGreen - g.driving
  return out
}

// ─── What missing the fairway costs ────────────────────────────

export type FairwaySide = { holes: number; averageToPar: number | null }

export type FairwayCost = {
  hit: FairwaySide
  missLeft: FairwaySide
  missRight: FairwaySide
  miss: FairwaySide
  /** Miss average minus hit average. Positive is the price of a miss. */
  costPerMiss: number | null
}

/**
 * The player's own scoring, split by where the tee shot went — the
 * plain-English companion to the driving figure. Left and right are kept
 * apart on purpose: a small, common miss right and a rare, destructive miss
 * left read as two very different numbers, where a combined figure blurs
 * them into one mild-looking penalty.
 */
export function fairwayCost(stats: readonly HoleStat[]): FairwayCost {
  const asked = stats.filter(s => s.fairwayCounted && s.fairway != null)
  const side = (list: readonly HoleStat[]): FairwaySide => ({
    holes: list.length,
    averageToPar: list.length === 0
      ? null
      : list.reduce((n, s) => n + (s.gross - s.par), 0) / list.length,
  })

  const hit = side(asked.filter(s => s.fairway === 'fairway'))
  const miss = side(asked.filter(s => s.fairway !== 'fairway'))

  return {
    hit,
    missLeft: side(asked.filter(s => s.fairway === 'left')),
    missRight: side(asked.filter(s => s.fairway === 'right')),
    miss,
    costPerMiss: hit.averageToPar == null || miss.averageToPar == null
      ? null
      : miss.averageToPar - hit.averageToPar,
  }
}

// ─── Form, round by round ──────────────────────────────────────

export type RoundForm = {
  roundId: string
  holes: number
  points: number
  /**
   * `points − 2 × holes` — how the round stands against playing to
   * handicap, which in Stableford is two points a hole. +3 is three points
   * better than the handicap promised; the sign every golfer already reads
   * off a Stableford board.
   */
  vsHandicap: number
}

/** In first-seen order — the caller puts rounds in playing order. */
export function roundForm(stats: readonly HoleStat[]): RoundForm[] {
  const rounds = new Map<string, RoundForm>()
  for (const s of stats) {
    let r = rounds.get(s.roundId)
    if (!r) { r = { roundId: s.roundId, holes: 0, points: 0, vsHandicap: 0 }; rounds.set(s.roundId, r) }
    r.holes += 1
    r.points += s.points
  }
  for (const r of rounds.values()) r.vsHandicap = r.points - 2 * r.holes
  return [...rounds.values()]
}

// ─── The miscellany ────────────────────────────────────────────
//
// Real figures that earned a box but not a headline. Bounce-backs live in
// `ScoringCounts` and are read alongside these.

export type SiBand = {
  /** "1–6", "7–12", "13–18" — the card's difficulty thirds. */
  band: string
  holes: number
  averageToPar: number
}

export type MiscStats = {
  /**
   * Scoring by stroke-index third, on the player's own card's index. The
   * question it answers: do the hard holes hurt you more than they should,
   * or is it the easy ones you give away.
   */
  siBands: SiBand[]
  frontNine: { holes: number; averageToPar: number } | null
  backNine: { holes: number; averageToPar: number } | null
  /** Doubles or worse, per 18 holes. */
  blowUpsPer18: number | null
  /**
   * The longest unbroken run of par-or-better holes within one round.
   * Consecutive by hole number, and a run never crosses a round — the walk
   * to the first tee the next morning resets everything, as it does.
   */
  longestParRun: number
}

export function miscStats(stats: readonly HoleStat[]): MiscStats {
  const avg = (list: readonly HoleStat[]) =>
    list.reduce((n, s) => n + (s.gross - s.par), 0) / list.length
  const half = (list: readonly HoleStat[]) =>
    list.length === 0 ? null : { holes: list.length, averageToPar: avg(list) }

  const bands: [string, (si: number) => boolean][] = [
    ['1–6', si => si <= 6],
    ['7–12', si => si >= 7 && si <= 12],
    ['13–18', si => si >= 13],
  ]

  // The longest run, per round, in hole order, broken by any gap — a hole
  // with no score in the middle is not evidence of a par.
  let longest = 0
  const byRound = new Map<string, HoleStat[]>()
  for (const s of stats) {
    const list = byRound.get(s.roundId)
    if (list) list.push(s)
    else byRound.set(s.roundId, [s])
  }
  for (const round of byRound.values()) {
    round.sort((a, b) => a.holeNumber - b.holeNumber)
    let run = 0
    let prev: HoleStat | null = null
    for (const s of round) {
      const parOrBetter = s.gross - s.par <= 0
      const consecutive = prev != null && s.holeNumber === prev.holeNumber + 1
      run = parOrBetter ? (consecutive ? run + 1 : 1) : 0
      if (run > longest) longest = run
      prev = s
    }
  }

  return {
    siBands: bands
      .map(([band, test]) => stats.filter(s => test(s.strokeIndex)))
      .map((list, i) => ({ band: bands[i][0], holes: list.length, averageToPar: list.length ? avg(list) : 0 }))
      .filter(b => b.holes > 0),
    frontNine: half(stats.filter(s => s.holeNumber <= 9)),
    backNine: half(stats.filter(s => s.holeNumber > 9)),
    blowUpsPer18: stats.length === 0
      ? null
      : (stats.filter(s => s.gross - s.par >= 2).length / stats.length) * 18,
    longestParRun: longest,
  }
}

// ─── How hard the holes actually played ────────────────────────

export type HoleDifficulty = {
  courseId: string
  holeNumber: number
  /** The men's par, for printing. The arithmetic uses each player's own. */
  par: number
  /** The card's own stroke index, so the order can be read against it. */
  strokeIndex: number
  cards: number
  /** Mean of `gross − that player's par`. Higher is harder. */
  averageToPar: number
  /** 1 is the hardest hole on this course. */
  rank: number
  /** `cards >= MIN_HOLE_SAMPLE`. Below that the order is still moving. */
  settled: boolean
  fairwaysCounted: number
  fairwaysHit: number
  greenHoles: number
  greensHit: number
}

/**
 * The holes of each course, hardest first.
 *
 * Pooled across every round played on that course — a course played twice is
 * one set of eighteen holes with twice the evidence, not two.
 *
 * Each card contributes `gross − its own player's par`, so a woman playing a
 * hole that is a par 5 on her card is not scored against the men's 4. The
 * printed `par` and `strokeIndex` are the men's, because a single column has
 * to say something and that is the card most readers are holding.
 *
 * A hole under `MIN_HOLE_SAMPLE` still gets a rank — there is no useful
 * alternative — and is flagged `settled: false` so a screen can say so
 * rather than present four cards as a verdict.
 */
export function holeDifficulty(
  stats: readonly HoleStat[],
  holes: readonly RowHole[],
): HoleDifficulty[] {
  const byHole = new Map<string, HoleStat[]>()
  for (const s of stats) {
    const key = `${s.courseId}:${s.holeNumber}`
    const list = byHole.get(key)
    if (list) list.push(s)
    else byHole.set(key, [s])
  }

  const cardFor = new Map(holes.map(h => [`${h.course_id}:${h.hole_number}`, h]))

  const rows = [...byHole.entries()].map(([key, played]) => {
    const card = cardFor.get(key)
    const [courseId, holeNumber] = [played[0].courseId, played[0].holeNumber]
    const toPar = played.reduce((n, s) => n + (s.gross - s.par), 0) / played.length
    const asked = played.filter(s => s.fairwayCounted && s.fairway != null)
    const known = played.filter(s => s.gir != null)

    return {
      courseId,
      holeNumber,
      par: card ? effectivePar(card, 'M') : played[0].par,
      strokeIndex: card ? effectiveSI(card, 'M') : played[0].strokeIndex,
      cards: played.length,
      averageToPar: toPar,
      rank: 0,
      settled: played.length >= MIN_HOLE_SAMPLE,
      fairwaysCounted: asked.length,
      fairwaysHit: asked.filter(s => s.fairway === 'fairway').length,
      greenHoles: known.length,
      greensHit: known.filter(s => s.gir === true).length,
    }
  })

  // Hardest first. A tie goes to the hole the card already calls harder,
  // which is the only tie-break that adds information rather than an
  // arbitrary order.
  rows.sort((a, b) =>
    b.averageToPar - a.averageToPar
    || a.strokeIndex - b.strokeIndex
    || a.holeNumber - b.holeNumber)

  // Ranked within each course: two courses do not share an order.
  const seen = new Map<string, number>()
  for (const r of rows) {
    const n = (seen.get(r.courseId) ?? 0) + 1
    seen.set(r.courseId, n)
    r.rank = n
  }

  return rows
}

// ─── One player, and everyone ──────────────────────────────────

export type PlayerStats = {
  playerId: string
  holes: number
  rounds: number
  fairways: FairwayStats
  putting: PuttingStats
  gained: Gained
  scoring: ScoringCounts
  scrambling: Scrambling
  approach: ApproachStats
  /** Only pars actually played appear — no par-3 row on a course without one. */
  splits: ParSplit[]
  misc: MiscStats
  /** Net gained on the field, by handicap apportionment. */
  netGained: NetGained
  /** The same net figures against the course rather than the field. */
  netVsPar: NetVsPar
  /** Tee-to-green split into driving accuracy and approach. */
  longGame: LongGameGained
  /** Scoring by where the tee shot went, left and right kept apart. */
  cost: FairwayCost
  /** Rounds in first-seen order; the screen orders by the trip's rounds. */
  form: RoundForm[]
}

const NO_GAIN = (playerId: string): Gained =>
  ({ playerId, putting: 0, toGreen: 0, total: 0, holes: 0 })

/**
 * Everybody with a hole to their name.
 *
 * The gains are worked out once over the whole field and handed out, because
 * a gain is not a property of one player's card — it is the gap between
 * theirs and everyone else's, and computing it per player would rebuild the
 * same field average once for each of them.
 */
export function playerStats(
  stats: readonly HoleStat[], puttShareMode: PuttShareMode = 'fixed',
): PlayerStats[] {
  const gains = gainedOnField(stats)
  const apportioned = netGainedOnField(stats, puttShareMode)
  const vsPar = netVsPar(stats, puttShareMode)
  const long = longGameGained(stats)
  const byPlayer = new Map<string, HoleStat[]>()
  for (const s of stats) {
    const list = byPlayer.get(s.playerId)
    if (list) list.push(s)
    else byPlayer.set(s.playerId, [s])
  }

  return [...byPlayer.entries()].map(([playerId, mine]) => ({
    playerId,
    holes: mine.length,
    rounds: new Set(mine.map(s => s.roundId)).size,
    fairways: fairwayStats(mine),
    putting: puttingStats(mine),
    gained: gains.get(playerId) ?? NO_GAIN(playerId),
    scoring: scoringCounts(mine),
    scrambling: scrambling(mine),
    approach: approachStats(mine),
    splits: parSplits(mine),
    misc: miscStats(mine),
    netGained: apportioned.get(playerId)
      ?? { playerId, putting: 0, toGreen: 0, total: 0, holes: 0 },
    netVsPar: vsPar.get(playerId)
      ?? { playerId, putting: 0, toGreen: 0, total: 0, holes: 0 },
    longGame: long.get(playerId)
      ?? { playerId, driving: 0, approach: 0, toGreen: 0, holes: 0, drivingHoles: 0 },
    cost: fairwayCost(mine),
    form: roundForm(mine),
  }))
}

/** One player's line, or null if they have no tracked hole. */
export function statsFor(
  stats: readonly HoleStat[], playerId: string,
  puttShareMode: PuttShareMode = 'fixed',
): PlayerStats | null {
  return playerStats(stats, puttShareMode).find(p => p.playerId === playerId) ?? null
}

// ─── Is there anything to show ─────────────────────────────────

export type Coverage = {
  holes: number
  withPutts: number
  withFairway: number
  /**
   * `none` means say nothing at all — no heading, no empty state.
   *
   * A trip can have stats switched on and nothing entered yet, and a heading
   * over a row of dashes is the thing docs/features.md has been keeping the
   * hub clear of.
   */
  level: 'none' | 'thin' | 'good'
}

/** Enough holes to be worth a screen, and enough to be worth believing. */
export const THIN_UNTIL = 18

// ─── Saying them ───────────────────────────────────────────────
//
// Here rather than on a screen because the hub line and the stats lab print
// the same figures, and two spellings of "level" is how a number comes to
// look like two different numbers.

/**
 * A gain, to one decimal and always signed. Level is `E`, as everywhere.
 *
 * Rounded before the zero test, so −0.04 prints as `E` rather than as `-0.0`
 * — which is a real output of an average and reads as a mistake.
 */
export function formatGained(n: number): string {
  const r = Math.round(n * 10) / 10
  if (r === 0) return 'E'
  return r > 0 ? `+${r.toFixed(1)}` : r.toFixed(1)
}

/** A rate as a whole percentage. Null prints as a dash, never as 0%. */
export function formatRate(rate: number | null): string {
  return rate == null ? '—' : `${Math.round(rate * 100)}%`
}

/** An average to one decimal. Null prints as a dash. */
export function formatAverage(n: number | null): string {
  return n == null ? '—' : (Math.round(n * 10) / 10).toFixed(1)
}

export function coverage(stats: readonly HoleStat[]): Coverage {
  const withPutts = stats.filter(s => s.putts != null).length
  const withFairway = stats.filter(s => s.fairway != null).length

  return {
    holes: stats.length,
    withPutts,
    withFairway,
    level: withPutts === 0 && withFairway === 0 ? 'none'
      : Math.max(withPutts, withFairway) < THIN_UNTIL ? 'thin'
      : 'good',
  }
}
