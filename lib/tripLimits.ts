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

// ── The trip description ──────────────────────────────────────

/**
 * Long enough for a paragraph about the stakes and the itinerary, short
 * enough that the hub is still a hub. The form caps typing at this, and
 * `normalizeDescription` holds the same line against anything pasted.
 */
export const MAX_TRIP_DESCRIPTION = 500

/**
 * A typed description as the row stores it: trimmed, capped, runs of blank
 * lines folded to one paragraph break, and null when there is nothing —
 * blank and absent mean the same thing everywhere it is read.
 */
export function normalizeDescription(input: string | null | undefined): string | null {
  const text = String(input ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TRIP_DESCRIPTION)
    .trim()
  return text || null
}
