/**
 * A short-lived copy of something the server reads, shared by every look —
 * the only copy of the rule. Pure: no Next, no database, a clock handed in,
 * so `test:board-copy` runs it with a fake clock and a counting reader.
 *
 * The golf leaderboard is its first user (`app/golf/[root]/[tripCode]/
 * leaderboard/boardCopy.ts`): every phone on a live board asks the server
 * for the whole board every fifteen seconds, and every one of those asks
 * used to be a full read of the event out of Supabase — data sent out of
 * Supabase being what its free plan meters. With a copy, a hundred phones
 * on one board are one read every few seconds, not a hundred.
 *
 * The rules, one per line of `look`:
 *
 * 1. **One copy per key** — the caller's key is the event, so two events
 *    can never share one.
 * 2. **A copy younger than `maxAgeMs` is shown and nothing is read.**
 * 3. **An older one is not shown.** The look reads, shows what it read, and
 *    that read becomes the copy. Never the old copy shown while a fresh one
 *    is fetched behind it — with one viewer polling every fifteen seconds
 *    that would show every look fifteen seconds late *and* still read every
 *    time — and never two reads for one look. (Next's `unstable_cache`
 *    does exactly the first, which is why this is not built on it.)
 *    Looks that arrive while a read is out wait for that read rather than
 *    starting their own.
 * 4. **A failed read is never kept.** The next look reads again. The look
 *    that failed is shown the copy it already had, if it had one younger
 *    than `holdMs` and `fallBackOn` allows it — a board a few seconds old
 *    rather than an empty one, which would read as nobody having scored —
 *    and is otherwise handed the failure.
 *
 * The copy lives in the server's memory, so it is shared by every look that
 * server serves. Vercel may run more than one at a busy moment; each keeps
 * its own copy, so a board is at most one read per `maxAgeMs` per server,
 * never one per phone. A copy nobody has looked at for `holdMs` is let go.
 */

export type Copy<T> = { at: number; value: T }

export type CopyKeeper<T> = {
  /** The copy for `key`, or a fresh read — see the rules above. */
  look(key: string, read: () => Promise<T>): Promise<T>
  /** What is held, for the tests. */
  held(key: string): Copy<T> | undefined
}

export function makeCopyKeeper<T>(opts: {
  maxAgeMs: number
  holdMs: number
  now?: () => number
  /** Whether a failure may be answered with the copy already held. Default: any. */
  fallBackOn?: (error: unknown) => boolean
}): CopyKeeper<T> {
  const now = opts.now ?? Date.now
  const copies = new Map<string, Copy<T>>()
  const reading = new Map<string, Promise<T>>()

  // Let go of copies nobody has needed for a while, so the memory an
  // event's board takes is given back once its round is over.
  const sweep = (t: number) => {
    for (const [k, c] of copies) if (t - c.at >= opts.holdMs) copies.delete(k)
  }

  return {
    held: key => copies.get(key),
    look(key, read) {
      const held = copies.get(key)
      if (held && now() - held.at < opts.maxAgeMs) return Promise.resolve(held.value)

      const out = reading.get(key)
      if (out) return out

      // Stamped when the read starts: the copy is the database as it stood
      // then, and its age counts from then.
      const started = now()
      const p = (async () => {
        try {
          const value = await read()
          sweep(started)
          copies.set(key, { at: started, value })
          return value
        } catch (e) {
          const fallBack = opts.fallBackOn ? opts.fallBackOn(e) : true
          if (fallBack && held && now() - held.at < opts.holdMs) return held.value
          throw e
        } finally {
          reading.delete(key)
        }
      })()
      reading.set(key, p)
      return p
    },
  }
}
