// A handicap, and the shots it is worth on a hole.
//
// A player better than scratch has a **plus** handicap: they give strokes back
// to the course rather than receiving them. It is written with a leading plus
// — "+1" — and stored here as a negative number, which is the only way one
// value can carry both directions.
//
// The two are mirror images, and the mirror is the part that was wrong:
//
//   handicap 1   receives a shot on the HARDEST hole, SI 1
//   handicap +1  gives one back on the EASIEST hole, SI 18
//
// So a +1 is level par by birdieing SI 18 and paring the other seventeen. The
// old formula tested `strokeIndex <= handicap % 18`, which for a negative
// handicap is `strokeIndex <= -1` — never true on any hole — so the whole
// part alone survived and a +1 gave a shot back on all eighteen. That asked a
// +1 to birdie every hole for level par, and made +1 and +2 identical.
//
// Pure. No I/O.

/**
 * Shots received on a hole. Negative for a plus handicap, which gives them.
 *
 * The whole part applies to every hole; the remainder picks the holes that get
 * one more. A handicap counts up from the hardest hole, a plus handicap counts
 * down from the easiest, and 18 holes is exactly one lap either way.
 *
 * Rounded before it is split. `round_handicaps` is whole by the time anything
 * scores off it, but an allowance can hand a fraction straight in, and
 * `Math.floor` on a fraction would put the extra shot on a different hole than
 * the remainder expects.
 */
export function shotsReceived(playingHandicap: number, strokeIndex: number): number {
  const hcp = Math.round(playingHandicap)
  if (hcp < 0) {
    // Given back, from the easiest hole down. `19 - remainder` is where the
    // extra one starts: with a remainder of 1 that is SI 18 alone, with 3 it
    // is SI 16, 17 and 18.
    const given = Math.abs(hcp)
    return -(Math.floor(given / 18) + (strokeIndex >= 19 - (given % 18) ? 1 : 0))
  }
  return Math.floor(hcp / 18) + (strokeIndex <= hcp % 18 ? 1 : 0)
}

// ─── Reading and writing one ───────────────────────────────────

/**
 * A handicap as golf writes it: "+1" better than scratch, "12" worse, "0" at.
 *
 * A minus sign never appears. Nobody has ever called themselves a minus one,
 * and printing the stored number raw is what made a course handicap of +1 read
 * as "-1" on the card.
 */
export function formatHandicap(h: number): string {
  // To one decimal, which is what the column holds. `String` drops a trailing
  // ".0" on its own, so 12 is "12" and 12.4 is "12.4".
  const rounded = Math.round(h * 10) / 10
  return rounded < 0 ? `+${-rounded}` : String(rounded)
}

/**
 * What somebody typed, as a number this app can store.
 *
 * "+1" is better than scratch and comes back as -1, which is the whole reason
 * this exists: `parseFloat('+1')` is 1, so a plus handicap typed into any of
 * the handicap fields used to be stored as an ordinary one and nothing
 * anywhere said otherwise.
 *
 * A leading minus is read the same way as a plus. Nobody means "worse than
 * scratch by minus one", and taking it as a plus handicap is the only reading
 * that is ever what they meant.
 *
 * Null for anything unreadable, so a caller can refuse rather than store a
 * zero it invented.
 */
export function parseHandicap(raw: string): number | null {
  const text = raw.trim()
  if (!text) return null

  const plus = text.startsWith('+') || text.startsWith('-')
  const digits = plus ? text.slice(1).trim() : text
  if (!/^\d*\.?\d+$/.test(digits)) return null

  const n = Number(digits)
  if (!Number.isFinite(n)) return null
  return plus ? -n : n
}

/**
 * What is said before a plus handicap is stored.
 *
 * A plus handicap is rare and it is the one entry on these forms that means
 * the opposite of what it looks like: "+2" is a better player than "2", and
 * it is stored as -2 and gives shots back rather than receiving them. Typed
 * or tapped by mistake, nothing downstream ever questions it — the trigger
 * scores the card, the board reads it, and the only sign is a leaderboard
 * that looks wrong for reasons nobody can find.
 *
 * So it is asked once, at the moment it is submitted. Every form that writes
 * a handicap shows this same sentence, from here, rather than four of its
 * own.
 */
export const PLUS_HANDICAP_WARNING =
  'Hold on there Cowboy! Did you mean to select (+) Handicap. ' +
  'This indicates handicaps better than scratch (0)'

/**
 * Whether a stored handicap is a plus one — better than scratch.
 *
 * The sign is the whole test, and it is worth a name because `h < 0` reads
 * as "worse than nothing" everywhere it appears and means the opposite.
 * Zero is scratch, not plus.
 */
export function isPlusHandicap(h: number | null | undefined): boolean {
  return h != null && h < 0
}

// ─── A handicap nobody has given yet ──────────────────────────

/**
 * Whether this handicap is **pending** — nobody has said what it is.
 *
 * Null, and null only. **Pending is not scratch**, and the whole reason this
 * has a name is that for a long time it was: the creation form let a
 * handicap box be left empty and wrote `parseHandicap(text) ?? 0`, so the
 * one player the lead player was least sure about was entered as the best
 * handicap on the trip. Zero is a real answer, it looks like a real answer,
 * and nothing downstream can tell it apart from one somebody meant.
 *
 * So a blank is stored as NULL (migration 051) and read through here. A
 * pending player is listed, joins, holds a team place and reads every screen
 * — they simply cannot be put on a scorecard until the figure exists, and
 * the person who knows it is asked for it as they claim their name.
 */
export function isHandicapPending(h: number | null | undefined): boolean {
  return h == null
}

/**
 * What a screen prints where a handicap would go.
 *
 * One phrase, so the hub, the roster and the picker cannot each invent
 * their own — "—", "TBC" and "not set" were three ways of saying it before
 * anything said it deliberately. Short because it sits in a number's column
 * on a phone, and prefixed because "Pending" alone already means *unclaimed*
 * on the hub's roster, two rows above.
 */
export const HANDICAP_PENDING_LABEL = 'HCP pending'

/**
 * The names on this card that have no handicap yet.
 *
 * **The one copy of "this player cannot be scored".** A card is opened, a
 * tee is picked and a course handicap is worked out from the player's index
 * — and a pending player has no index, so there is nothing to work it out
 * from. Every earlier answer to that was a silent `?? 0`, which is how a
 * pending handicap would arrive at the leaderboard as a scratch round.
 *
 * So the scoring screen refuses instead, by name: Start Round stays inert
 * and the line above it says who is missing one and where to fix it. The
 * fix is one tap on the join screen — claiming a name asks for the handicap
 * — or the organiser typing it into Trip Setup.
 *
 * Refusing is better than the alternatives here. Letting the card run and
 * leaving the points blank puts somebody on a leaderboard with no total and
 * no explanation, halfway through a round nobody can undo; scoring them off
 * scratch is the bug this whole thing exists to remove.
 */
export function pendingInCard<T extends { name: string; handicap: number | null | undefined }>(
  players: readonly T[],
): string[] {
  return players.filter(p => isHandicapPending(p.handicap)).map(p => p.name)
}

/**
 * "Ross has no handicap yet" / "Ross and Dave have no handicap yet" — what
 * the picker says above an inert Start Round, or null when nothing is
 * missing. Named rather than counted: on a fourball the group knows who.
 */
export function pendingCardReason(names: readonly string[]): string | null {
  if (names.length === 0) return null
  const who = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  const verb = names.length === 1 ? 'has' : 'have'
  return `${who} ${verb} no handicap yet. Set it on the join screen or in Trip Setup before starting this card.`
}

/**
 * What a handicap box means when it is read back.
 *
 *   a number    that handicap
 *   null        left blank — pending, and meant
 *   undefined   typed, but not a handicap: a half-finished "1." or a stray
 *               letter, which is a keystroke rather than an answer
 *
 * The middle and the last are the distinction this exists for. Both come
 * back as null from `parseHandicap`, which is right for a form that refuses
 * to submit and wrong for a field that saves as it is left: "cleared it on
 * purpose" and "mid-typing" cannot be the same instruction, or every
 * backspace through the last digit would wipe the stored figure.
 */
export function readHandicapField(raw: string | null | undefined): number | null | undefined {
  const text = String(raw ?? '').trim()
  if (!text) return null
  return parseHandicap(text) ?? undefined
}

/**
 * What the keyboard should offer.
 *
 * A decimal keypad, which is the right keyboard for 14.2 — and has no `+` on
 * it, on either platform. This was `inputMode: 'text'` for exactly that
 * reason, which fixed the plus handicap by giving every player a full QWERTY
 * keyboard to type two digits with. The sign is a button now, not a
 * character: see `app/components/HandicapField.tsx`, which is what these
 * props are spread onto. **Nothing should spread them onto a bare input** —
 * the keypad it asks for cannot produce a plus on its own.
 *
 * Still `type="text"` rather than `type="number"`: a number input rejects the
 * leading plus the button writes, and spinner arrows on a handicap are noise.
 */
export const HANDICAP_INPUT = {
  type: 'text',
  inputMode: 'decimal',
  // Digits and one decimal, optionally led by a sign. Loose on purpose: it
  // hints the keyboard rather than validating, and `parseHandicap` is what
  // actually decides.
  pattern: '[+-]?[0-9]*\\.?[0-9]*',
  autoComplete: 'off',
} as const
