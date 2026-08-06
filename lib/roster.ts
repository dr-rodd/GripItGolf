// The trip's roster: who is on it, who has confirmed, and what their names
// are allowed to be.
//
// Three questions that used to be answered inline on four different screens,
// each one slightly differently. They are the same questions, so they get the
// same answers, and they are pure so the answers can be tested.
//
// **Confirmed is `players.claimed`.** There is no second column and there must
// not be one: `claimed` has meant "a real person has taken this slot" since
// migration 006, and the trip hub has printed it as the word "Confirmed" ever
// since migration 013 backfilled the lead players.

/** A row that knows whether it has been claimed. */
export type Claimable = { claimed?: boolean | null }

/** A row with a name, for the uniqueness rules. */
export type Named = { name: string }

// ─── Confirmed ─────────────────────────────────────────────

/**
 * Whether a real person has taken this slot.
 *
 * **`=== true`, always.** The column is nullable — every row written before
 * migration 006 has `NULL` there, not `false`. `!p.claimed` would call those
 * rows unconfirmed, which is right, but `.eq('claimed', false)` in a query
 * silently drops them, which is not. One test, everywhere, so the two can
 * never drift apart.
 */
export function isConfirmed(p: Claimable): boolean {
  return p.claimed === true
}

/** How many of them are in. */
export function confirmedCount(players: Claimable[]): number {
  return players.filter(isConfirmed).length
}

/**
 * The order the join list offers people in: everybody still to confirm
 * first, then everybody already in, alphabetical within each group.
 *
 * The unconfirmed are what the screen is for — somebody arriving to claim
 * their slot should find their own name without scrolling past nine people
 * who are already sorted out. The confirmed stay on the list rather than
 * disappearing from it, because that list is now also how a second device
 * gets linked.
 *
 * Returns a new array; the caller's is untouched.
 */
export function sortForClaiming<T extends Claimable & Named>(players: T[]): T[] {
  return [...players].sort((a, b) => {
    const ac = isConfirmed(a), bc = isConfirmed(b)
    if (ac !== bc) return ac ? 1 : -1
    return a.name.localeCompare(b.name)
  })
}

// ─── Names ─────────────────────────────────────────────────

/**
 * The form a name is compared in.
 *
 * Trimmed and case-folded, so "john smith" and "John Smith " are one person.
 * Internal spacing is left alone: "John  Smith" with two spaces is a
 * different key from "John Smith", which is a typo this will not catch. That
 * is deliberate — the rule the database constraint would have to enforce is
 * the rule stated here, and `lower(btrim(name))` is a rule Postgres can index.
 */
export function nameKey(name: string): string {
  return String(name ?? '').trim().toLowerCase()
}

/** Whether two names are the same person's, under that rule. */
export function sameName(a: string, b: string): boolean {
  const key = nameKey(a)
  return key !== '' && key === nameKey(b)
}

/**
 * The player on this trip already using that name, if there is one.
 *
 * `exceptId` is the player being renamed — without it, saving a name
 * unchanged would report the player as a duplicate of themselves.
 */
export function duplicateName<T extends Named & { id?: string }>(
  name: string,
  roster: T[],
  exceptId?: string | null,
): T | null {
  const key = nameKey(name)
  if (!key) return null
  return roster.find(p => p.id !== exceptId && nameKey(p.name) === key) ?? null
}

/**
 * The first entry in a list that repeats an earlier one, or -1.
 *
 * For the creation form, where nobody has an id yet and the whole roster is
 * a list of text boxes. Blanks are skipped — an empty row is not a name.
 */
export function firstDuplicateIndex(names: string[]): number {
  const seen = new Set<string>()
  for (let i = 0; i < names.length; i++) {
    const key = nameKey(names[i])
    if (!key) continue
    if (seen.has(key)) return i
    seen.add(key)
  }
  return -1
}

/** What to say about it. Plain, and it names the name. */
export function duplicateNameError(name: string): string {
  return `${name.trim()} is already on this trip. Use a different name.`
}
