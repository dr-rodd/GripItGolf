// A signed card summed up — the only copy of the rule (stage (f); D121,
// D122, D152; Ross, 14–15 Nov 2026).
//
// One row per player per signed round, so a golfer's season is a handful of
// rows, never a re-read of every hole of every event they played. Built from
// `lib/holeStats.ts`'s `HoleStat` rows — the same rules the stats hub applies
// (a no return keeps only its tee shot, an impossible putt count is dropped,
// a par 3 has no fairway) — so there is no second copy of greens in
// regulation, fairways or a birdie. **A player's own card only**: nothing
// here depends on the rest of the field, so the row never moves because
// somebody else signed later.
//
// `origin` (D122): a verified club's event is a **club** round; anything else
// is **self-claimed** — an open event's name is the player's own say-so, so
// it never feeds a handicap or a club honour. Points are the card's stored
// Stableford points, off the full handicap (an allowance is a board's).
//
// Pure: `app/api/stats/summaries.ts` reads, calls this, and writes.

import type { HoleStat } from './holeStats'

/** Bumped when a rule here changes, so the backfill rewrites every row once. */
export const CARD_SUMMARY_RULES = 1

export type CardOrigin = 'club' | 'self_claimed'

export interface CardSummary {
  round_id: string
  player_id: string
  trip_id: string
  course_id: string | null
  tee_id: string | null
  played_on: string | null
  holes: number
  no_returns: number
  gross: number | null
  par: number | null
  points: number
  course_handicap: number | null
  putts: number | null
  putts_holes: number
  fairways_hit: number
  fairways_tried: number
  gir: number
  gir_holes: number
  eagles: number
  birdies: number
  pars: number
  bogeys: number
  doubles: number
  origin: CardOrigin
  club_id: string | null
  rules_version: number
  written_at: string
}

export interface RoundFacts {
  tripId: string
  roundId: string
  courseId: string | null
  playedOn: string | null
  /** The club the event belongs to, when that club is verified — null otherwise. */
  clubId: string | null
  /** Each player's tee on this card (`round_handicaps.tee_id`). */
  teeOf: ReadonlyMap<string, string | null>
  now: Date
}

/**
 * Every signed card in a round, summed up. Holes still on an open card are
 * left out — a summary is of a card somebody signed — and a player with no
 * signed hole has no row.
 */
export function summariseRound(stats: readonly HoleStat[], facts: RoundFacts): CardSummary[] {
  const byPlayer = new Map<string, HoleStat[]>()
  for (const s of stats) {
    if (s.live || s.roundId !== facts.roundId) continue
    const list = byPlayer.get(s.playerId)
    if (list) list.push(s)
    else byPlayer.set(s.playerId, [s])
  }
  const origin: CardOrigin = facts.clubId ? 'club' : 'self_claimed'
  const out: CardSummary[] = []
  for (const [playerId, holes] of byPlayer) {
    const played = holes.filter(h => !h.noReturn)
    const toPar = (h: HoleStat) => h.gross - h.par
    const withPutts = played.filter(h => h.putts != null)
    const fairways = holes.filter(h => h.fairwayCounted && h.fairway != null)
    const girs = played.filter(h => h.gir != null)
    const complete = holes.length > 0 && holes.every(h => !h.noReturn)
    out.push({
      round_id: facts.roundId,
      player_id: playerId,
      trip_id: facts.tripId,
      course_id: facts.courseId,
      tee_id: facts.teeOf.get(playerId) ?? null,
      played_on: facts.playedOn,
      holes: holes.length,
      no_returns: holes.length - played.length,
      // A gross only for a card with every hole finished: a no return's
      // stored figure is a computed maximum, never a score anybody made.
      gross: complete ? played.reduce((a, h) => a + h.gross, 0) : null,
      par: holes.length ? holes.reduce((a, h) => a + h.par, 0) : null,
      // An NR is a real zero on the card, so its points (0) count.
      points: holes.reduce((a, h) => a + (h.points ?? 0), 0),
      course_handicap: holes.find(h => h.handicap != null)?.handicap ?? null,
      putts: withPutts.length ? withPutts.reduce((a, h) => a + (h.putts ?? 0), 0) : null,
      putts_holes: withPutts.length,
      fairways_hit: fairways.filter(h => h.fairway === 'fairway').length,
      fairways_tried: fairways.length,
      gir: girs.filter(h => h.gir === true).length,
      gir_holes: girs.length,
      eagles: played.filter(h => toPar(h) <= -2).length,
      birdies: played.filter(h => toPar(h) === -1).length,
      pars: played.filter(h => toPar(h) === 0).length,
      bogeys: played.filter(h => toPar(h) === 1).length,
      doubles: played.filter(h => toPar(h) >= 2).length,
      origin,
      club_id: facts.clubId,
      rules_version: CARD_SUMMARY_RULES,
      written_at: facts.now.toISOString(),
    })
  }
  return out.sort((a, b) => a.player_id.localeCompare(b.player_id))
}

// ─── A golfer's season (the club area's Your season, D143) ─────

/** What a season's rows carry to a screen: never anybody else's. */
export type SeasonRow = Pick<CardSummary, 'round_id' | 'trip_id' | 'played_on' | 'holes' | 'gross' | 'par' | 'points' | 'origin' | 'club_id' | 'course_id'>

export interface Season {
  /** Eighteen-hole rounds and shorter ones alike. */
  rounds: number
  /** Points over full eighteen-hole rounds only — a nine is not half a score. */
  averagePoints: number | null
  bestPoints: number | null
  /** Of the rounds, how many were in open events — said on the screen (D122). */
  selfClaimed: number
}

/** The season's three figures, from the year's rows. */
export function seasonOf(rows: readonly SeasonRow[]): Season {
  const full = rows.filter(r => r.holes >= 18)
  return {
    rounds: rows.length,
    averagePoints: full.length ? Math.round((full.reduce((a, r) => a + r.points, 0) / full.length) * 10) / 10 : null,
    bestPoints: full.length ? Math.max(...full.map(r => r.points)) : null,
    selfClaimed: rows.filter(r => r.origin === 'self_claimed').length,
  }
}

/** The self-claimed line under the tiles — null when every round was a club round. */
export function selfClaimedLine(season: Season, clubName: string): string | null {
  if (season.selfClaimed === 0) return null
  const n = season.selfClaimed
  return `${n} of these ${n === 1 ? 'is a round' : 'are rounds'} from open events, self-claimed — never counted for ${clubName} honours.`
}
