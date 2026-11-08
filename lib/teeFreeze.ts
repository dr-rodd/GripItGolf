// A tee time frozen while one phone books it (Ross, 1 Nov 2026).
//
// Tapping a time opens it on that phone, and every other phone looking at
// the sheet sees it frozen straight away, saying only "Locked" — it does
// not matter whose phone, only that the time is being changed — so two
// people cannot fill the same seats differently and leave two versions of
// who plays with whom.
//
// A booking's lock lasts two minutes, counted down on the booker's phone,
// and then the booking closes and the time unlocks. An edit of your own
// time shows no countdown (Ross, 1 Nov 2026): its lock lasts while it is
// being changed, and lets go after two quiet minutes.
//
// The freezes travel as Supabase Realtime presence on one channel per
// event, never through the database: nothing to migrate, nothing to clean
// up, and a phone that closes mid-booking drops its freeze by itself.
// Every write to a time happens under its freeze, so a freeze lifting is
// also the signal for the other phones to read the sheet again.
//
// Presence is quick but not a lock, so two phones tapping the same time in
// the same instant are settled here — the earlier freeze wins, the same on
// every phone — and Save checks the database before writing anyway.
//
// Pure. `app/golf/[root]/[tripCode]/teesheet/useTeeFreeze.ts` is the wiring.

/** One phone's freeze on one tee time. */
export type Freeze = {
  /** The phone's presence key — a fresh one each time the sheet is opened. */
  key: string
  round: string
  slot: number
  /** When the freeze began, for which of two came first. */
  since: number
  /** When it lets go. */
  until: number
  /** A booking's lock, counted down on its phone — not an edit's. */
  timed?: boolean
}

/**
 * How long a lock lasts: a booking's from when it began, an edit's from its
 * last change. A phone left in a pocket with a time open lets go of it
 * after this; its Save still checks the database before writing anything.
 */
export const LOCK_MS = 2 * 60_000

/** Whether a freeze still holds at `now`. */
export const freezeLive = (f: Freeze, now: number) => now < f.until

/** What a booking's countdown reads — "1:42" — rounding up, so it says 0:00 only once it is over. */
export function lockClock(msLeft: number): string {
  const s = Math.max(0, Math.ceil(Math.min(msLeft, LOCK_MS) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Whether `a` came before `b` — the earlier, else the lower key, so every phone agrees. */
const firstOf = (a: Freeze, b: Freeze) => a.since < b.since || (a.since === b.since && a.key < b.key)

/** The tee times on a round other phones hold frozen. */
export function frozenSlots(freezes: readonly Freeze[], round: string, me: string, now: number): Set<number> {
  return new Set(freezes.filter(f => f.round === round && f.key !== me && freezeLive(f, now)).map(f => f.slot))
}

/**
 * Whether this phone's freeze lost the time to another phone's — two
 * tapped it together and theirs came first.
 */
export function beaten(freezes: readonly Freeze[], mine: Freeze, now: number): boolean {
  return freezes.some(f =>
    f.key !== mine.key && f.round === mine.round && f.slot === mine.slot && freezeLive(f, now) && firstOf(f, mine))
}

/** The rounds where another phone's freeze has gone — a time there may have changed. */
export function liftedRounds(before: readonly Freeze[], after: readonly Freeze[], me: string): string[] {
  const still = new Set(after.map(f => `${f.key}|${f.round}|${f.slot}`))
  return [...new Set(before
    .filter(f => f.key !== me && !still.has(`${f.key}|${f.round}|${f.slot}`))
    .map(f => f.round))]
}

/**
 * The freezes in a presence state, as Supabase hands it over — each phone's
 * key against what it last said. Anything malformed is dropped rather than
 * trusted: a freeze is somebody else's phone talking.
 */
export function readFreezes(state: Record<string, readonly unknown[]>): Freeze[] {
  const out: Freeze[] = []
  for (const [key, metas] of Object.entries(state)) {
    const m = metas[metas.length - 1] as Partial<Freeze> | undefined
    if (!m || typeof m.round !== 'string' || !Number.isInteger(m.slot) || (m.slot as number) < 0) continue
    if (typeof m.since !== 'number' || typeof m.until !== 'number') continue
    out.push({ key, round: m.round, slot: m.slot as number, since: m.since, until: m.until })
  }
  return out
}
