// Recording and correcting matchplay results.
//
// Changing a winner is not a local edit. The player being removed was sitting
// in a slot further up the bracket, and anything decided using them is now
// suspect. The walk below replaces that slot and then clears results forward
// — but only along matches that were genuinely decided, stopping the moment it
// reaches one that was not. A blunt "clear everything downstream" would wipe
// results that were never affected.
//
// Pure and deterministic, so the cascade can be tested exhaustively without a
// database. See scripts/test-matchplay-progress.ts.

export class ProgressError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProgressError'
  }
}

/** The fields a progression needs. A superset is fine — extras pass through. */
export type ProgressMatch = {
  id: string
  round_number: number
  slot: number
  player_a_id: string | null
  player_b_id: string | null
  player_a_is_bye: boolean
  player_b_is_bye: boolean
  winner_player_id: string | null
  result: string | null
  next_match_id: string | null
  next_slot: 'A' | 'B' | null
}

export type WinnerChange<T extends ProgressMatch> = {
  /** The whole bracket after the change. */
  matches: T[]
  /** Only the rows that actually differ — what needs writing. */
  changed: T[]
  /** Matches whose recorded winner the cascade had to clear. */
  clearedIds: string[]
}

/**
 * Whether a match can have a winner chosen for it.
 *
 * A bye is never decidable: the recipient was recorded as the winner when the
 * bracket was drawn, and there was no match to play. A match missing a player
 * is not decidable either — the round feeding it has not finished.
 */
export function isDecidable(match: ProgressMatch): boolean {
  if (match.player_a_is_bye || match.player_b_is_bye) return false
  return !!match.player_a_id && !!match.player_b_id
}

/**
 * Record a winner, cascading only as far as genuinely invalidated results.
 *
 * Walking forward from the changed match:
 *   · put the new winner into the slot they feed
 *   · if that match had no winner, stop — nothing downstream was affected
 *   · if it did, clear it (the result was reached against the wrong opponent),
 *     empty the slot it fed in turn, and repeat one level further up
 *
 * `result` is the margin, e.g. "3&2". It is cleared whenever the winner
 * changes, since a margin describes an outcome that no longer stands.
 */
/**
 * The forward walk shared by recording, correcting and voiding.
 *
 * Seats `incoming` in the slot this match feeds — a player when someone has
 * won it, null when nobody has — then clears results above it for as long as
 * they were genuinely decided, stopping at the first that was not.
 */
function cascade<T extends ProgressMatch>(
  working: Map<string, T>,
  from: T,
  incoming: string | null,
): string[] {
  const clearedIds: string[] = []
  let current = from
  let seat = incoming
  const guard = new Set<string>()

  while (current.next_match_id) {
    if (guard.has(current.id)) break     // a cycle would mean a corrupt bracket
    guard.add(current.id)

    const next = working.get(current.next_match_id)
    if (!next || !current.next_slot) break

    if (current.next_slot === 'A') next.player_a_id = seat
    else                           next.player_b_id = seat

    // Undecided: the slot change is the whole story, nothing to invalidate
    if (!next.winner_player_id) break

    // Decided against a player who should not have been there
    next.winner_player_id = null
    next.result = null
    clearedIds.push(next.id)

    current = next
    seat = null      // nobody advances out of a match that is now undecided
  }
  return clearedIds
}

function diff<T extends ProgressMatch>(before: Map<string, T>, after: T[]): T[] {
  return after.filter(m => {
    const was = before.get(m.id)!
    return (
      was.player_a_id      !== m.player_a_id ||
      was.player_b_id      !== m.player_b_id ||
      was.winner_player_id !== m.winner_player_id ||
      was.result           !== m.result
    )
  })
}

function open<T extends ProgressMatch>(matches: T[], matchId: string) {
  const original = new Map(matches.map(m => [m.id, m]))
  const working  = new Map(matches.map(m => [m.id, { ...m } as T]))
  const target = working.get(matchId)
  if (!target) throw new ProgressError('That match is not part of this bracket.')
  if (target.player_a_is_bye || target.player_b_is_bye) {
    throw new ProgressError('A bye has no match to decide — the player advances automatically.')
  }
  return { original, working, target }
}

/**
 * Record a winner, cascading only as far as genuinely invalidated results.
 *
 * `result` is the margin, e.g. "3&2". It is cleared when the winner changes,
 * since a margin describes an outcome that no longer stands — but it can be
 * set or amended freely while the winner stays the same, which is how a score
 * gets added to a match that was recorded without one.
 */
export function recordWinner<T extends ProgressMatch>(
  matches: T[],
  matchId: string,
  winnerPlayerId: string,
  opts: { result?: string | null } = {},
): WinnerChange<T> {
  const { original, working, target } = open(matches, matchId)

  if (winnerPlayerId !== target.player_a_id && winnerPlayerId !== target.player_b_id) {
    throw new ProgressError('That player is not in this match.')
  }

  const winnerChanged = target.winner_player_id !== winnerPlayerId

  target.winner_player_id = winnerPlayerId
  target.result = opts.result !== undefined
    ? opts.result
    : winnerChanged ? null : target.result

  // Nothing downstream moves unless the winner actually changed — the slot
  // above already holds this player.
  const clearedIds = winnerChanged ? cascade(working, target, winnerPlayerId) : []

  const all = matches.map(m => working.get(m.id)!)
  return { matches: all, changed: diff(original, all), clearedIds }
}

/**
 * Put a match back to unplayed.
 *
 * Used when a result was recorded against the wrong match, or entered by
 * mistake and the players have not finished. Whoever had advanced out of it is
 * taken back out of the round above, and the same forward walk clears anything
 * that had been decided using them.
 */
export function clearWinner<T extends ProgressMatch>(
  matches: T[],
  matchId: string,
): WinnerChange<T> {
  const { original, working, target } = open(matches, matchId)

  // Already unplayed — nothing to undo
  if (!target.winner_player_id) {
    const untouched = matches.map(m => working.get(m.id)!)
    return { matches: untouched, changed: [], clearedIds: [] }
  }

  target.winner_player_id = null
  target.result = null

  const clearedIds = cascade(working, target, null)

  const all = matches.map(m => working.get(m.id)!)
  return { matches: all, changed: diff(original, all), clearedIds }
}

// ─── Gesture rules ─────────────────────────────────────────────

export type PressOutcome = 'decide' | 'correct' | 'ignore'

/**
 * What a press on a match tile should do.
 *
 * Kept here rather than inline in the component so the rule can be tested:
 * an accidental tap must never rewrite a result someone already recorded.
 *
 *   · a bye, or a match still waiting on players — nothing at all
 *   · a press that travelled — a swipe, not a press
 *   · an undecided match — a tap records the winner
 *   · a decided match — only a deliberate hold reopens it; a tap does nothing
 */
export function pressOutcome(o: {
  decidable: boolean
  decided: boolean
  moved: boolean
  heldMs: number
  longPressMs: number
}): PressOutcome {
  if (!o.decidable) return 'ignore'
  if (o.moved) return 'ignore'
  if (!o.decided) return 'decide'
  return o.heldMs >= o.longPressMs ? 'correct' : 'ignore'
}
