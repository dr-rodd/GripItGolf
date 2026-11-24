// Writing a round's card summaries — stage (f), migration 088. The rule is
// lib/cardSummary.ts; this reads a round's own rows through the event's
// reader, sums them up, and writes them on the service role.
//
// Handed its dependencies, so `test:card-summary` runs it on a stand-in.
// Called after a card is committed (`/api/stats/card`), after a void, after
// a card check re-scores a course, by the nightly backstop for any signed
// round still without rows, and by the backfill on /admin.

import type { HoleStat } from '@/lib/holeStats'
import { summariseRound, type CardSummary } from '@/lib/cardSummary'

export interface RoundRead {
  tripId: string
  roundId: string
  courseId: string | null
  playedOn: string | null
  stats: HoleStat[]
  teeOf: Map<string, string | null>
}

export interface SummaryDeps {
  /** The round's own rows, through its event's reader. Null when the round is not this event's. */
  readRound(tripCode: string, roundId: string): Promise<RoundRead | null>
  /** The verified club the event belongs to — null outside a club (or before 086/088). */
  verifiedClubOf(tripId: string): Promise<string | null>
  upsert(rows: CardSummary[]): Promise<void>
  /** Rows of this round for players no longer on a signed card (a void) let go. */
  removeOthers(roundId: string, keep: string[]): Promise<void>
  /**
   * Stage (d4): a club competition's round not yet certified — the season is
   * fed by certified rounds only, so it is summed up at Certify and not before.
   */
  held?(roundId: string): Promise<boolean>
  /** The feed's signed cards (D302), from the same holes — never in the way of the summary. */
  afterWrite?(read: RoundRead): Promise<void>
}

export type SummaryOutcome = { written: number } | { missing: true }

export async function writeRoundSummaries(tripCode: string, roundId: string, deps: SummaryDeps, now: Date): Promise<SummaryOutcome> {
  if (deps.held && await deps.held(roundId)) {
    await deps.removeOthers(roundId, [])
    return { written: 0 }
  }
  const read = await deps.readRound(tripCode, roundId)
  if (!read) return { missing: true }
  const clubId = await deps.verifiedClubOf(read.tripId)
  const rows = summariseRound(read.stats, {
    tripId: read.tripId, roundId: read.roundId, courseId: read.courseId, playedOn: read.playedOn,
    clubId, teeOf: read.teeOf, now,
  })
  if (rows.length) await deps.upsert(rows)
  await deps.removeOthers(read.roundId, rows.map(r => r.player_id))
  if (deps.afterWrite) await deps.afterWrite(read).catch(e => console.error('feed after summary failed:', e))
  return { written: rows.length }
}
