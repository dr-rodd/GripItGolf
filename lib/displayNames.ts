// What a player is called on a leaderboard — the only copy, for every board.
//
// One rule, everywhere a board prints a person: the trip leaderboard, the
// in-play panel inside the scoring card, a round summary's result, and the
// matchplay tiles (whose `shortNames` in lib/matchplayEntrants.ts delegates
// here now rather than keeping a cousin of its own):
//
//   1. **A nickname, chosen by the player themselves** in the preferences
//      gear on the hub, wins outright. The stored player name never changes,
//      and every screen with room (the roster, the scorecard sheet, the join
//      list) keeps using it.
//
//   2. **Otherwise the first name, alone.** No initial for its own sake —
//      "Ross" is shorter than "Ross O" and just as clear until there are two
//      Rosses.
//
//   3. **A duplicated first name takes the start of the surname**, and the
//      clashing names grow *together* — "John Smi" against "John Smy", never
//      "John S" against "John Smy". The prefix respects how surnames are
//      built: an apostrophe name compacts ("O'Grady" → "OG", "D'Arcy" →
//      "DA"), and Mc/Mac stay whole ("McDonald" → "Mc", "MacArthur" →
//      "Mac"), so "John Mc" and "John Mac" read as the names they are and
//      never as a bare "John M" twice.
//
// Identical full names print in full, which is the honest answer.
//
// Pure — no I/O. Callers fetch `players.nickname` themselves, fail-soft,
// because naming the column in a shared select would break the page on a
// database that has not run migration 047.

export const MAX_NICKNAME = 12

/**
 * A typed nickname, cleaned: trimmed, inner whitespace folded, capped at
 * the limit the box types to. Empty means "no nickname" and is null —
 * which is also what clearing the box saves.
 */
export function normalizeNickname(text: string | null | undefined): string | null {
  const cleaned = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!cleaned) return null
  return cleaned.slice(0, MAX_NICKNAME).trim()
}

type Named = { name: string; nickname?: string | null }

const firstOf = (n: string) => n.trim().split(/\s+/)[0] ?? n
const surnameOf = (n: string) => {
  const parts = n.trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : ''
}

/** "O'Grady" → "OGrady": the form a prefix is cut from. */
const compactOf = (surname: string) => surname.replace(/['’]/g, '')

/**
 * The shortest prefix a surname may be cut to. An apostrophe name needs the
 * letter after the apostrophe ("OG", not "O"), and Mc/Mac are one unit —
 * cutting inside them leaves an "M" that names nobody.
 */
function minTakeOf(surname: string, compact: string): number {
  if (/^[A-Za-z]['’]/.test(surname)) return Math.min(2, compact.length)
  if (/^Mac./i.test(compact)) return Math.min(3, compact.length)
  if (/^Mc/i.test(compact)) return Math.min(2, compact.length)
  return 1
}

/**
 * Display names, in the order the entries arrived.
 *
 * Worked out over the whole field at once, because the default is relative:
 * whether "Ross" needs any surname at all depends on who else is called
 * Ross. A player with a nickname stands outside that question — their
 * default is never shown, so it cannot clash and causes no growth.
 */
export function shortDisplayNames(entries: readonly Named[]): string[] {
  type D = { i: number; first: string; sur: string; compact: string; minTake: number }
  const out: string[] = new Array(entries.length)
  const defaults: D[] = []

  entries.forEach((e, i) => {
    const nick = normalizeNickname(e.nickname)
    if (nick) { out[i] = nick; return }
    const first = firstOf(e.name)
    const sur = surnameOf(e.name)
    const compact = compactOf(sur)
    defaults.push({ i, first, sur, compact, minTake: minTakeOf(sur, compact) })
  })

  for (const d of defaults) {
    const rivals = defaults.filter(o =>
      o !== d && o.first.toLowerCase() === d.first.toLowerCase())

    // Alone on the first name — or with no surname to reach for — the first
    // name is the whole answer.
    if (rivals.length === 0 || !d.compact) { out[d.i] = d.first; continue }

    // One more letter than the longest run the compact surnames share, never
    // less than the surname's own natural unit, capped at the surname.
    let take = d.minTake
    for (const r of rivals) {
      const a = d.compact.toLowerCase()
      const b = r.compact.toLowerCase()
      let common = 0
      while (common < a.length && common < b.length && a[common] === b[common]) common++
      take = Math.max(take, Math.min(common + 1, d.compact.length))
    }
    // Grown to the whole surname, print the real one — apostrophe and all.
    out[d.i] = take >= d.compact.length
      ? `${d.first} ${d.sur}`
      : `${d.first} ${d.compact.slice(0, take)}`
  }

  return out
}

/** Player id → what the board prints. The Map shape most screens want. */
export function boardNames(
  players: readonly (Named & { id: string })[],
): Map<string, string> {
  const names = shortDisplayNames(players)
  return new Map(players.map((p, i) => [p.id, names[i]]))
}
