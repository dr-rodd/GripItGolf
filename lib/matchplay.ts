// Matchplay bracket generation.
//
// A bracket is always a power of two. Players are placed using the standard
// recursive seeding order, so the top seeds are spread across the draw: seeds
// 1 and 2 can only meet in the final, seeds 1–4 only in the semis, and so on.
// Any seed number above the actual player count is a BYE, and whoever draws
// one is recorded as the winner straight away and walks into the next round.
//
// Everything here is pure and deterministic — no dates, no randomness, no I/O
// — so the whole thing is unit-testable. See scripts/test-matchplay.ts.

export class MatchplayError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MatchplayError'
  }
}

export type BracketPlayer = { id: string; name: string }

export type BracketMatch = {
  id: string
  roundNumber: number        // 1 = the first round played
  roundName: string          // 'Quarter-Final', 'Round of 16', …
  slot: number               // 0-based position within the round
  seedA: number | null       // seed numbers, first round only
  seedB: number | null
  playerAId: string | null   // null + isBye = BYE; null alone = not yet decided
  playerBId: string | null
  playerAIsBye: boolean
  playerBIsBye: boolean
  winnerPlayerId: string | null
  nextMatchId: string | null // the match this winner feeds into (null for the final)
  nextSlot: 'A' | 'B' | null // which side of that match they occupy
}

export const MIN_PLAYERS = 2
export const MAX_BRACKET  = 32

// ─── Bracket shape ─────────────────────────────────────────────

/** Smallest power of two at or above n. 6 → 8, 11 → 16, 32 → 32. */
export function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1
  return 2 ** Math.ceil(Math.log2(n))
}

/**
 * Standard tournament seeding order for a bracket of the given size.
 *
 * Built by repeated doubling: start from [1], and at each doubling replace
 * every seed p with the pair (p, size + 1 − p). A bracket of 8 produces
 * [1, 8, 4, 5, 2, 7, 3, 6], which reads as the first-round matches
 * 1v8, 4v5, 2v7, 3v6.
 *
 * Works for any power-of-two size — there is no lookup table to outgrow.
 */
export function seedOrder(bracketSize: number): number[] {
  if (bracketSize < 1 || (bracketSize & (bracketSize - 1)) !== 0) {
    throw new MatchplayError(`Bracket size must be a power of two, got ${bracketSize}.`)
  }
  let order = [1]
  while (order.length < bracketSize) {
    const size = order.length * 2
    const next: number[] = []
    for (const p of order) next.push(p, size + 1 - p)
    order = next
  }
  return order
}

/** Rounds are named by how many players contest them. */
export function roundName(playersInRound: number): string {
  switch (playersInRound) {
    case 2:  return 'Final'
    case 4:  return 'Semi-Final'
    case 8:  return 'Quarter-Final'
    default: return `Round of ${playersInRound}`
  }
}

export type BracketShape = {
  playerCount: number
  bracketSize: number
  totalRounds: number
  byeCount: number
  /** Round names in playing order. */
  roundNames: string[]
}

/** What a bracket for this many players will look like, without building it. */
export function bracketShape(playerCount: number): BracketShape {
  assertPlayerCount(playerCount)
  const bracketSize = nextPowerOfTwo(playerCount)
  const totalRounds = Math.log2(bracketSize)
  return {
    playerCount,
    bracketSize,
    totalRounds,
    byeCount: bracketSize - playerCount,
    roundNames: Array.from({ length: totalRounds }, (_, i) =>
      roundName(bracketSize / 2 ** i)
    ),
  }
}

/**
 * Why a bracket cannot be drawn for this many players, or null if it can.
 * Pure, so the settings panel and the tests share one source of truth.
 */
export function bracketBlockedReason(playerCount: number): string | null {
  if (playerCount < MIN_PLAYERS) {
    return `Matchplay needs at least ${MIN_PLAYERS} players. This trip has ${playerCount}.`
  }
  if (playerCount > MAX_BRACKET) {
    return `Matchplay currently supports up to ${MAX_BRACKET} players. This trip has ${playerCount}.`
  }
  return null
}

/** What a bracket would look like if built now, or null if it cannot be. */
export function previewBracket(playerCount: number): BracketShape | null {
  try {
    return bracketShape(playerCount)
  } catch {
    return null
  }
}

function assertPlayerCount(playerCount: number) {
  if (!Number.isInteger(playerCount)) {
    throw new MatchplayError(`Player count must be a whole number, got ${playerCount}.`)
  }
  if (playerCount < MIN_PLAYERS) {
    throw new MatchplayError(
      `A matchplay bracket needs at least ${MIN_PLAYERS} players — this trip has ${playerCount}.`
    )
  }
  if (nextPowerOfTwo(playerCount) > MAX_BRACKET) {
    throw new MatchplayError(
      `Matchplay currently supports up to ${MAX_BRACKET} players — this trip has ${playerCount}.`
    )
  }
}

// ─── Generation ────────────────────────────────────────────────

/**
 * Build the full bracket.
 *
 * `players` must arrive in seed order: index 0 is seed 1, index 1 is seed 2,
 * and so on.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ SEEDING RULE — placeholder                                          │
 * │                                                                     │
 * │ There is no seeding feature yet, so callers pass players in          │
 * │ registration order: first to claim a spot is seed 1. It is           │
 * │ deterministic and explainable, which is all it needs to be for now.  │
 * │                                                                     │
 * │ When real seeding arrives (a qualifier round, handicap order, a      │
 * │ manual draw), the only change needed is the order of the array       │
 * │ handed to this function. Nothing below depends on how that order     │
 * │ was decided. See sortPlayersBySeed() for the current rule.           │
 * └─────────────────────────────────────────────────────────────────────┘
 */
export function generateBracket(
  players: BracketPlayer[],
  opts: { makeId?: () => string } = {},
): BracketMatch[] {
  assertPlayerCount(players.length)

  const ids = new Set(players.map(p => p.id))
  if (ids.size !== players.length) {
    throw new MatchplayError('The same player appears twice in the bracket.')
  }

  const makeId      = opts.makeId ?? (() => crypto.randomUUID())
  const bracketSize = nextPowerOfTwo(players.length)
  const totalRounds = Math.log2(bracketSize)
  const order       = seedOrder(bracketSize)

  // 1. Lay out every round as empty matches
  const rounds: BracketMatch[][] = []
  for (let r = 1; r <= totalRounds; r++) {
    const playersInRound = bracketSize / 2 ** (r - 1)
    const name = roundName(playersInRound)
    rounds.push(
      Array.from({ length: playersInRound / 2 }, (_, slot) => ({
        id: makeId(),
        roundNumber: r,
        roundName: name,
        slot,
        seedA: null,
        seedB: null,
        playerAId: null,
        playerBId: null,
        playerAIsBye: false,
        playerBIsBye: false,
        winnerPlayerId: null,
        nextMatchId: null,
        nextSlot: null,
      } as BracketMatch))
    )
  }

  // 2. Wire advancement. Adjacent matches always feed one match in the next
  //    round: slots 0 and 1 feed slot 0, slots 2 and 3 feed slot 1. The
  //    even-numbered feeder takes side A, the odd one side B. Recording it
  //    here means declaring a winner later is a write, not a recalculation.
  for (let r = 0; r < rounds.length - 1; r++) {
    for (const match of rounds[r]) {
      match.nextMatchId = rounds[r + 1][Math.floor(match.slot / 2)].id
      match.nextSlot    = match.slot % 2 === 0 ? 'A' : 'B'
    }
  }

  // 3. Seat the first round from the seed order. Seeds beyond the player
  //    count have nobody behind them, so those slots become byes.
  const bySeed = new Map<number, BracketPlayer>()
  players.forEach((p, i) => bySeed.set(i + 1, p))

  rounds[0].forEach((match, slot) => {
    const seedA = order[slot * 2]
    const seedB = order[slot * 2 + 1]
    const a = bySeed.get(seedA) ?? null
    const b = bySeed.get(seedB) ?? null

    match.seedA = seedA
    match.seedB = seedB
    match.playerAId = a?.id ?? null
    match.playerBId = b?.id ?? null
    match.playerAIsBye = a === null
    match.playerBIsBye = b === null

    // Standard seeding always pairs a seed from the top half of the draw
    // with one from the bottom half, and the bracket is never more than
    // half empty, so both sides can never be byes. Fail loudly rather than
    // emit an unplayable match if that ever stops holding.
    if (match.playerAIsBye && match.playerBIsBye) {
      throw new MatchplayError(
        `Both sides of ${match.roundName} match ${slot + 1} are byes — bracket generation is broken.`
      )
    }
  })

  // 4. Award the byes and walk those players into the next round. Byes only
  //    ever occur in the first round, so a single forward pass settles it.
  const byId = new Map(rounds.flat().map(m => [m.id, m]))
  for (const match of rounds.flat()) {
    if (!match.playerAIsBye && !match.playerBIsBye) continue
    const winner = match.playerAIsBye ? match.playerBId : match.playerAId
    if (!winner) continue

    match.winnerPlayerId = winner
    if (match.nextMatchId) {
      const target = byId.get(match.nextMatchId)
      if (!target) {
        throw new MatchplayError(`Match ${match.id} advances to a match that does not exist.`)
      }
      if (match.nextSlot === 'A') target.playerAId = winner
      else                       target.playerBId = winner
    }
  }

  return rounds.flat()
}

/**
 * Current seeding rule — registration order, earliest first.
 *
 * This is the one-line swap point described above. Replace the comparator
 * when real seeding lands; generateBracket() needs no changes.
 */
export function sortPlayersBySeed<T extends object>(players: readonly T[]): T[] {
  // Read created_at if the row carries one. Rows without a timestamp keep
  // their given order, since localeCompare('', '') is 0 and sort is stable.
  const registeredAt = (p: T) => (p as { created_at?: string | null }).created_at ?? ''
  return [...players].sort((a, b) => registeredAt(a).localeCompare(registeredAt(b)))
}

// ─── Persistence ───────────────────────────────────────────────

export type MatchplayRow = {
  id: string
  trip_id: string
  round_number: number
  round_name: string
  slot: number
  player_a_id: string | null
  player_b_id: string | null
  player_a_is_bye: boolean
  player_b_is_bye: boolean
  seed_a: number | null
  seed_b: number | null
  winner_player_id: string | null
  next_match_id: string | null
  next_slot: 'A' | 'B' | null
}

export function bracketToRows(tripId: string, matches: BracketMatch[]): MatchplayRow[] {
  return matches.map(m => ({
    id: m.id,
    trip_id: tripId,
    round_number: m.roundNumber,
    round_name: m.roundName,
    slot: m.slot,
    player_a_id: m.playerAId,
    player_b_id: m.playerBId,
    player_a_is_bye: m.playerAIsBye,
    player_b_is_bye: m.playerBIsBye,
    seed_a: m.seedA,
    seed_b: m.seedB,
    winner_player_id: m.winnerPlayerId,
    next_match_id: m.nextMatchId,
    next_slot: m.nextSlot,
  }))
}

/**
 * Rows ordered so that every next_match_id target is inserted before the
 * matches pointing at it. The self-referencing foreign key is deferrable, so
 * this is belt and braces rather than strictly required — but it keeps a
 * plain non-deferred insert working too.
 */
export function rowsInInsertOrder(rows: MatchplayRow[]): MatchplayRow[] {
  return [...rows].sort((a, b) => b.round_number - a.round_number || a.slot - b.slot)
}
