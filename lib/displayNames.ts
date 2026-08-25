// What a player is called on a leaderboard — the only copy.
//
// The board's name column is the tightest space in the app, and long names
// scroll (see ScrollingName). Two answers, in order:
//
//   1. **A nickname, chosen by the player themselves** in the preferences
//      gear on the hub. Their own choice for the tight columns — the stored
//      player name never changes, and every screen with room (the roster,
//      the scorecard sheet, the join list) keeps using it.
//
//   2. **First name plus the start of the last** — "Ross O". Always the
//      initial, so the column reads evenly, and on a tie the clashing names
//      take more of the surname *together*: "Ross O'G" against "Ross O'B",
//      never "Ross O" against "Ross O'B", which would read as one player
//      styled two ways.
//
// A cousin, not a copy, of `shortNames` in lib/matchplayEntrants.ts: the
// bracket writes bare first names ("Ross & Dave") and only reaches for a
// surname on a clash, because a pairing's tile carries two names and the
// ampersand is doing the separating. The board always carries the initial.
// Both grow the same way on ties; they differ on purpose about the start.
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

type Named = { id: string; name: string; nickname?: string | null }

const firstOf = (n: string) => n.trim().split(/\s+/)[0] ?? n
const surnameOf = (n: string) => {
  const parts = n.trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : ''
}

/**
 * Player id → what the board prints.
 *
 * Worked out over the whole field at once, because the default is relative:
 * how much surname "Ross" needs depends on who else is called Ross. A
 * player with a nickname stands outside that question — their default is
 * never shown, so it cannot clash.
 */
export function boardNames(players: readonly Named[]): Map<string, string> {
  const out = new Map<string, string>()
  const defaults: { id: string; first: string; sur: string }[] = []

  for (const p of players) {
    const nick = normalizeNickname(p.nickname)
    if (nick) out.set(p.id, nick)
    else defaults.push({ id: p.id, first: firstOf(p.name), sur: surnameOf(p.name) })
  }

  for (const p of defaults) {
    // One word is already as short as a name gets.
    if (!p.sur) { out.set(p.id, p.first); continue }

    // Everyone sharing the first name decides together how much surname the
    // initial has to become: one more letter than the longest run the
    // surnames share, capped at the surname itself. Identical names simply
    // print in full, which is the honest answer.
    let take = 1
    for (const rival of defaults) {
      if (rival === p || rival.first.toLowerCase() !== p.first.toLowerCase()) continue
      const a = p.sur.toLowerCase()
      const b = rival.sur.toLowerCase()
      let common = 0
      while (common < a.length && common < b.length && a[common] === b[common]) common++
      take = Math.max(take, Math.min(common + 1, p.sur.length))
    }
    out.set(p.id, `${p.first} ${p.sur.slice(0, take)}`)
  }

  return out
}
