// Limits the trip creation form enforces.
//
// These are policy, not structure. Rounds, handicaps, scoring and the
// leaderboard all work off whatever number of rounds a trip actually has —
// nothing downstream has a fixed idea of how many there are. The cap exists so
// someone does not create a fifty-round trip by holding down a button, and
// raising it is a one-line change here.

export const MIN_ROUNDS = 1
export const MAX_ROUNDS = 6

/** Why this round count is not allowed, or null if it is fine. */
export function roundCountError(rounds: number): string | null {
  if (!Number.isFinite(rounds) || !Number.isInteger(rounds)) {
    return 'Number of rounds must be a whole number.'
  }
  if (rounds < MIN_ROUNDS) {
    return rounds === 0
      ? 'A trip needs at least one round.'
      : 'A trip needs at least one round.'
  }
  if (rounds > MAX_ROUNDS) {
    return `A trip can have at most ${MAX_ROUNDS} rounds. Reduce it to continue.`
  }
  return null
}

export function isRoundCountValid(rounds: number): boolean {
  return roundCountError(rounds) === null
}
