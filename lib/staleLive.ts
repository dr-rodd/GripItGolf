// Scorecards nobody came back to, and the rows they leave behind.
//
// A group opens a card, plays seven holes, and walks away — the phone dies,
// the round is abandoned, somebody starts again on a fresh card. Nothing in
// the app ever finishes that first card, and until now nothing ever would:
// the nightly job closes an active card only if **zero** scores were entered
// against it, so the moment a card has one hole on it, it is open for good.
//
// An open card is not inert. It is the definition of "in play":
//
//   · its part-played scores stand on the trip leaderboard, as a live round
//     that never settles — the phantom partial scores
//   · its players are locked into it, so they cannot be put on another card
//     for that round, and the round can never be scored properly
//   · the round shows as being played, on the hub and on the round summary
//
// So the rule that closes a card cannot be "it has no scores". It has to be
// "nobody has touched it for a long time" — and `live_scores.submitted_at`
// is what says when anybody last did.
//
// The second half is the rows themselves. `live_scores` is keyed by
// (player_id, round_id) with no reference to the card that wrote it, so once
// a card is gone its rows are unreachable — no screen reads them, and no
// screen can. They are also not quite harmless: a resume and a commit both
// read every row for a player and round, whichever card wrote it, so a
// leftover set could still be merged into a later card for the same round.
//
// Both decisions live here, pure, so they can be tested without a database.
// `app/api/cleanup/route.ts` does the fetching and the writing.

/** A scoring session, as `live_rounds` stores it. */
export type LiveCard = {
  id: string
  roundId: string
  /** 'active' | 'closed' | 'finalised' */
  status: string
  activatedAt: string
}

/** Who is on a card, as `live_player_locks` stores it. */
export type CardLock = {
  liveRoundId: string
  playerId: string
}

/** When a hole was last written, as `live_scores` stores it. */
export type ScoreActivity = {
  playerId: string
  roundId: string
  submittedAt: string
}

/**
 * How long a card with nothing on it stays open.
 *
 * Two hours, unchanged: this is the original rule, and it is about somebody
 * opening a card and never selecting a player. It is short because there is
 * nothing to lose — a card with no scores on it holds nothing.
 */
export const EMPTY_AFTER_HOURS = 2

/**
 * How long a part-played card stays open after the last hole entered.
 *
 * Twelve hours, so it crosses a night. A real interruption is measured in
 * minutes — a phone charged, a rain delay, a card handed to somebody else —
 * and a group that has not entered a hole since yesterday is not still out
 * on the course. Nothing is deleted at this point: the card is closed, which
 * takes it off the leaderboard and releases its players, and its scores are
 * still there to be looked at.
 */
export const ABANDONED_AFTER_HOURS = 12

/**
 * How long an unreachable row survives before it is deleted.
 *
 * Forty-eight hours from the last hole written, which is a day and a half
 * after the twelve-hour close at the earliest. That gap is deliberate: it is
 * the window in which a card closed by mistake can still be rescued by hand,
 * because the scores are all still in the table. After it, the rows are
 * removed for good.
 */
export const RESIDUE_AFTER_HOURS = 48

const hoursBetween = (later: Date, earlier: string): number =>
  (later.getTime() - Date.parse(earlier)) / 3_600_000

/** `${playerId}:${roundId}` — one player's card on one round. */
export const activityKey = (playerId: string, roundId: string): string =>
  `${playerId}:${roundId}`

/**
 * The last time anybody wrote a hole against this card.
 *
 * A card's activity is its locked players' rows on its round. `live_scores`
 * carries no card id, so this is the only join there is — and it is the same
 * one the original job used to ask whether a card had any scores at all.
 *
 * Null when nothing has ever been entered, which is a different state from
 * "entered a long time ago" and is treated differently below.
 */
export function lastActivity(
  card: LiveCard,
  locks: readonly CardLock[],
  activity: readonly ScoreActivity[],
): string | null {
  const players = new Set(
    locks.filter(l => l.liveRoundId === card.id).map(l => l.playerId),
  )
  if (players.size === 0) return null

  let latest: string | null = null
  for (const a of activity) {
    if (a.roundId !== card.roundId) continue
    if (!players.has(a.playerId)) continue
    if (latest === null || Date.parse(a.submittedAt) > Date.parse(latest)) {
      latest = a.submittedAt
    }
  }
  return latest
}

/**
 * The cards that should be closed, and why.
 *
 * Two reasons, and the reason is returned because the job reports them
 * separately — an empty card closing is routine, a part-played one closing
 * is a round somebody abandoned and is worth being able to count.
 *
 * Only active cards are considered. A finalised card is a signed scorecard
 * and a closed one is already closed.
 */
export function cardsToClose(
  cards: readonly LiveCard[],
  locks: readonly CardLock[],
  activity: readonly ScoreActivity[],
  now: Date,
): { id: string; reason: 'empty' | 'abandoned' }[] {
  const out: { id: string; reason: 'empty' | 'abandoned' }[] = []

  for (const card of cards) {
    if (card.status !== 'active') continue
    const last = lastActivity(card, locks, activity)

    if (last === null) {
      // Nothing was ever entered. The original rule, unchanged.
      if (hoursBetween(now, card.activatedAt) > EMPTY_AFTER_HOURS) {
        out.push({ id: card.id, reason: 'empty' })
      }
      continue
    }

    // Something was entered, and then nobody came back to it.
    if (hoursBetween(now, last) > ABANDONED_AFTER_HOURS) {
      out.push({ id: card.id, reason: 'abandoned' })
    }
  }

  return out
}

/**
 * The player-and-round pairs whose live rows no card can reach any more.
 *
 * A row is reachable while some card that still shows on a screen carries
 * that player on that round — an active one, which can be resumed, or a
 * finalised one, which keeps its locks so that unfinalising can reopen it.
 * Anything else is a row no code path will ever read again.
 *
 * Age is checked as well as reachability, so a card closed in error leaves
 * its scores recoverable for a day and a half rather than being erased in the
 * same job that closed it.
 *
 * `closingNow` is the set of cards this run is about to close. They are
 * treated as already closed — otherwise the first run after a card is
 * abandoned would count it as reachable and the rows would wait a further
 * whole day for no reason.
 */
export function deadScoreKeys(
  activity: readonly ScoreActivity[],
  cards: readonly LiveCard[],
  locks: readonly CardLock[],
  now: Date,
  closingNow: ReadonlySet<string> = new Set(),
): { playerId: string; roundId: string }[] {
  const reachable = new Set<string>()
  for (const card of cards) {
    if (closingNow.has(card.id)) continue
    if (card.status !== 'active' && card.status !== 'finalised') continue
    for (const lock of locks) {
      if (lock.liveRoundId !== card.id) continue
      reachable.add(activityKey(lock.playerId, card.roundId))
    }
  }

  // Newest submission per pair — a card is only residue once all of it is old.
  const newest = new Map<string, string>()
  for (const a of activity) {
    const key = activityKey(a.playerId, a.roundId)
    const seen = newest.get(key)
    if (!seen || Date.parse(a.submittedAt) > Date.parse(seen)) {
      newest.set(key, a.submittedAt)
    }
  }

  const out: { playerId: string; roundId: string }[] = []
  for (const [key, submittedAt] of newest) {
    if (reachable.has(key)) continue
    if (hoursBetween(now, submittedAt) <= RESIDUE_AFTER_HOURS) continue
    const [playerId, roundId] = key.split(':')
    out.push({ playerId, roundId })
  }
  return out
}
