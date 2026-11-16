// Signing a card — what it writes to `scores`, the one copy (D176; stage
// (d3)). Pure: handed the card as it stands (`lib/liveScores.ts`'s `Card`,
// already reconciled with `live_scores`), the course's holes in order and
// each player's sex and full playing handicap, it answers the score rows —
// every hole for every player, a hole with nothing anywhere on it a no
// return at net double bogey off the full handicap.
//
// Two callers, one rule: the phone's commit in `LiveScoringFlow` (every
// event outside a club competition, exactly as before) and the server's
// `/api/card/sign` (a club competition's cards, whose `scores` only the
// server writes from migration 090). `test:card-commit` holds them to the
// same rows.

import { shotsReceived } from './handicap'
import type { Card } from './liveScores'

export interface CommitHole {
  id: string
  hole_number: number
  par: number
  stroke_index: number
  par_ladies?: number | null
  stroke_index_ladies?: number | null
}

export interface CommitPlayer {
  id: string
  /** 'M' or 'F' — the ladies' par and index where the hole has them. */
  gender: string
  /** The full course handicap the card is scored off, never an allowance. */
  playingHcp: number
}

export interface CommitScoreRow {
  player_id: string
  hole_id: string
  round_id: string
  gross_score: number
  no_return: boolean
  fairway_hit: string | null
  putts: number | null
}

export function effectivePar(hole: Pick<CommitHole, 'par' | 'par_ladies'>, gender: string): number {
  return gender === 'F' && hole.par_ladies ? hole.par_ladies : hole.par
}

export function effectiveSI(hole: Pick<CommitHole, 'stroke_index' | 'stroke_index_ladies'>, gender: string): number {
  return gender === 'F' && hole.stroke_index_ladies ? hole.stroke_index_ladies : hole.stroke_index
}

/**
 * The gross written for a hole no return: net double bogey off the full
 * handicap, so the same picked-up ball is the same gross whichever board is
 * showing when the card is signed — and scores zero on every one.
 */
export function nrGross(par: number, si: number, hcp: number): number {
  return par + 2 + shotsReceived(hcp, si)
}

/**
 * Every hole for every player. `card` is indexed by the hole's position in
 * `holes` (the order the card was played in).
 */
export function cardScoreRows(card: Card, holes: CommitHole[], players: CommitPlayer[], roundId: string): CommitScoreRow[] {
  const rows: CommitScoreRow[] = []
  for (const [hIdx, hole] of holes.entries()) {
    for (const player of players) {
      const hs = card[hIdx]?.[player.id]
      // An explicit pick-up is a no return, and so is a hole nothing
      // anywhere has a score for — the card is already reconciled, so
      // "absent" means genuinely absent.
      const noReturn = hs?.isNR === true || hs?.gross == null
      const p = effectivePar(hole, player.gender)
      const si = effectiveSI(hole, player.gender)
      const gross = noReturn ? nrGross(p, si, player.playingHcp) : (hs!.gross as number)
      // More putts than shots is a mis-tap, dropped here rather than refused
      // at the write — a commit failing on the eighteenth green is worse.
      const putts = noReturn || hs?.putts == null || hs.putts > gross ? null : hs.putts
      rows.push({
        player_id: player.id, hole_id: hole.id, round_id: roundId,
        gross_score: gross,
        no_return: noReturn,
        // A recorded fairway survives an explicit no return; an absent hole has none.
        fairway_hit: p < 4 ? null : (hs?.fairway ?? null),
        putts,
      })
    }
  }
  return rows
}
