// Reconciling a scorecard that is being committed with what was actually
// saved while it was being played.
//
// Every hole is written to `live_scores` as it is entered, so that table —
// not the component's state — is the record of what happened. The card in
// memory is a view of it, and a view can be incomplete: a resume that failed,
// a tab reloaded, a session opened on a second device.
//
// Commit used to trust memory alone, and treat a hole missing from it as a
// no return. Those two facts together were a data-loss bug: come back to a
// half-played card, re-enter three holes, commit, and holes 4–18 were written
// as NRs with a max score. This is the function that stops that.
//
// The rule: **a hole is only a no return when nothing anywhere has a score
// for it.** Memory wins when it has one, because it is the more recent
// answer; what was saved fills the gaps; only a genuine blank is an NR.
//
// Pure. No I/O — the caller fetches, this decides.

/** One hole for one player, as the scoring card holds it. */
export type HoleScore = {
  gross: number | null
  isNR: boolean
  stableford: number | null
}

/** A `live_scores` row, as it comes back from the database. */
export type SavedScore = {
  player_id: string
  hole_number: number
  gross_score: number | null
  stableford_points: number | null
}

/** The card: hole index → player id → what they scored. */
export type Card = Record<number, Record<string, HoleScore>>

/**
 * Whether this entry says anything at all.
 *
 * An explicit no return counts — somebody picked the ball up, and that is a
 * decision. An empty slot does not.
 */
export function isScored(hs: HoleScore | undefined): boolean {
  return hs != null && (hs.gross != null || hs.isNR)
}

/**
 * Fold what was saved into the card, without ever overwriting it.
 *
 * `holeNumbers` maps hole index → hole number, because the card is keyed by
 * position on the course and `live_scores` by the number on the flag. They
 * are the same for a full eighteen and are not assumed to be.
 */
export function mergeSaved(
  card: Card,
  saved: readonly SavedScore[],
  holeNumbers: readonly number[],
): Card {
  const indexOfHole = new Map(holeNumbers.map((n, i) => [n, i]))
  const merged: Card = {}
  for (const [idx, byPlayer] of Object.entries(card)) {
    merged[Number(idx)] = { ...byPlayer }
  }

  for (const row of saved) {
    const idx = indexOfHole.get(row.hole_number)
    if (idx === undefined) continue
    if (row.gross_score == null) continue
    // Memory is the more recent answer wherever it has one.
    if (isScored(merged[idx]?.[row.player_id])) continue
    merged[idx] = {
      ...merged[idx],
      [row.player_id]: {
        gross: row.gross_score,
        isNR: false,
        stableford: row.stableford_points,
      },
    }
  }

  return merged
}

/**
 * Whether a card has anything on it at all.
 *
 * A commit of an entirely blank card is never what somebody meant — it would
 * write eighteen no returns per player over whatever was there before. The
 * caller refuses rather than writes.
 */
export function anyScored(card: Card): boolean {
  return Object.values(card).some(byPlayer =>
    Object.values(byPlayer).some(isScored))
}

/** How many holes this player has a real answer for. */
export function holesScored(card: Card, playerId: string): number {
  return Object.values(card).filter(byPlayer => isScored(byPlayer[playerId])).length
}
