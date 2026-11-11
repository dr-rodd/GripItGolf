/**
 * A hole entered on a phone, held until the server confirms it.
 *
 * ## Why this exists
 *
 * Score entry used to write each hole with a fire-and-forget upsert — the
 * request went out, the screen advanced to the next hole, and nothing ever
 * looked at the answer. Three `TODO(error-handling)` notes sat on those
 * lines. On a course with good signal that is invisible. On a course with
 * patchy signal the write fails, the card moves on as though it saved, and
 * the hole is simply gone; the group finds out on the eighteenth green, or
 * on the leaderboard that evening, and by then nobody can reconstruct it.
 *
 * So a hole is written **here** first, which cannot fail, and reaches the
 * server afterwards. Entry never waits for the network and never depends on
 * it: the card in the hand is the record until the server has it.
 *
 * ## The rules that make it safe
 *
 * **Keyed by player, round and hole**, which is the same key the upsert
 * conflicts on. A hole entered twice replaces its own pending entry rather
 * than queuing behind it, so what reaches the server is what is on the card
 * — never an older value arriving late and overwriting a correction.
 *
 * **A flush removes only what it actually sent.** Each entry carries a `seq`
 * stamped when it was queued; a send that succeeds drops an entry only if its
 * `seq` is still the one that went out. Re-entering a hole mid-flight leaves
 * the newer value queued instead of having it silently discarded by the
 * older send's success.
 *
 * **Nothing is repaired on the way in or out.** An entry that cannot be read
 * back out of storage is dropped, not guessed at — the same discipline the
 * stored leaderboard settings are read under. A half-parsed score is worse
 * than a missing one, because it looks like a real answer.
 *
 * **Entries expire.** A round takes about five hours; anything still queued
 * after `MAX_AGE_MS` is abandoned. This is the guard against the one genuinely
 * nasty case: a card voided or committed on another device while this phone
 * held pending holes, where a late upsert would resurrect a score somebody
 * deliberately erased. The commit path closes that window directly — it
 * flushes first and refuses to commit with anything outstanding — and this is
 * the backstop for everything else.
 *
 * Pure of Supabase and of the browser: `createOutbox` takes its writer and its
 * storage. `app/scoring/outbox.ts` is the one instance the app uses, and
 * `scripts/test-score-outbox.ts` drives this with neither.
 */

/** What gets written for one player's hole. Mirrors the `live_scores` row. */
export interface ScoreRow {
  player_id: string
  round_id: string
  hole_number: number
  gross_score: number
  stableford_points: number
  fairway_hit: boolean | null
  putts: number | null
  committed: boolean
}

/** A hole cleared from the card — the edit screen's "no score here" answer. */
export interface ClearTarget {
  player_id: string
  round_id: string
  hole_number: number
}

/**
 * One box on a match play card (stage 7; Ross, 11 Nov 2026: players scoring
 * may have bad signal). A knockout's card is `match_scores`, a session
 * match's `session_match_scores`; `gross` null is an NR, and `clear` takes
 * the box off the card. Same table, match, player and hole is the same box.
 */
export interface MatchCell {
  table: 'match_scores' | 'session_match_scores'
  match_id: string
  trip_id: string
  player_id: string
  hole_number: number
  gross: number | null
}

/**
 * `trip` is the event's code, stamped when the hole is queued (CLAUDE.md's
 * iron-clad rule: stamp at enqueue, never at flush) — so a phone whose
 * sign-in was lost knows which event to enter again before it retries.
 */
export type Entry =
  | { kind: 'save'; key: string; seq: number; at: number; trip?: string; row: ScoreRow }
  | { kind: 'clear'; key: string; seq: number; at: number; trip?: string; target: ClearTarget }
  | { kind: 'match'; key: string; seq: number; at: number; trip?: string; cell: MatchCell; clear: boolean }

/**
 * What a flush hands to whoever is doing the talking.
 *
 * Grouped rather than one call per hole: four players on a hole is one upsert,
 * and a phone that just came back into signal with a queue of holes behind it
 * should send them in one go rather than in a burst of forty requests.
 */
export interface Batch {
  saves: ScoreRow[]
  clears: ClearTarget[]
  /** Match play card boxes, in the order they were first entered. */
  match: { cell: MatchCell; clear: boolean }[]
}

/**
 * The server said no rather than the network failing (stage 6): a lost or
 * expired sign-in, a phone that is no longer a member, or a row-level
 * security refusal — which for an update or a delete arrives as "0 rows",
 * not as an error, and the sender turns into this. The outbox answers it by
 * asking `recover` to sign the phone back in and enter the event again, then
 * tries at once; the holes are never dropped for it.
 */
export class Refused extends Error {
  readonly refused = true
  constructor(message: string, readonly cause?: unknown) { super(message) }
}

export function isRefused(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { refused?: unknown }).refused === true
}

export interface OutboxStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface OutboxDeps {
  /** Sends one batch. Resolves on success; rejects or resolves false to retry. */
  send: (batch: Batch) => Promise<unknown>
  /** Where the queue survives a reload. Absent — a server render — means memory only. */
  storage?: OutboxStorage | null
  /** Injected so a test can move time without waiting for it. */
  now?: () => number
  /** Injected for the same reason. Returning a handle the outbox can cancel. */
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  /** Whether the device believes it has a connection. Absent means assume yes. */
  isOnline?: () => boolean
  /**
   * Sign the phone back in and enter these events again, after a send was
   * `Refused`. Resolves true when it did something worth retrying at once.
   * Absent: a refusal is retried on the backoff like any other failure.
   */
  recover?: (tripCodes: string[]) => Promise<boolean>
}

export const STORAGE_KEY = 'gdg.scoreOutbox.v1'

/**
 * How long a hole may sit unsent before it is abandoned.
 *
 * Longer than any round (about five hours, plus a long lunch and a phone left
 * in a bag overnight), short enough that a queue from a previous trip cannot
 * reappear against a card somebody has since voided.
 */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * The wait before each retry, in milliseconds.
 *
 * Climbing, then flat at thirty seconds. A phone in a dead spot must not
 * retry every second — the requests queue behind each other on the radio and
 * the one that matters, the hole just entered, ends up behind twenty that do
 * not. The `online` event and the screen coming back into view both flush
 * immediately, so the long waits only ever apply to a connection that is
 * present and failing rather than absent.
 */
export const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 10_000]

/**
 * A send that has not answered by then is a failure, not a wait. On a radio
 * that has just come back, a request opened on the dead one can hang for a
 * minute; without a limit the held holes sat behind it while the signal was
 * fine (Ross, 11 Nov 2026: "takes a while after being turned back on").
 */
export const SEND_TIMEOUT_MS = 6_000

/**
 * What a phone with scores waiting says, the one copy (Ross, 11 Nov 2026):
 * status, not a fault — "Weak signal · 3 scores pending submission". Nothing
 * is wrong and nothing needs doing, so no "failed", "error" or "could not".
 */
export function unsentLine(count: number): string {
  return `Weak signal · ${count === 1 ? '1 score' : `${count} scores`} pending submission`
}

export function keyOf(playerId: string, roundId: string, holeNumber: number): string {
  return `${playerId}:${roundId}:${holeNumber}`
}

export function matchKeyOf(c: Pick<MatchCell, 'table' | 'match_id' | 'player_id' | 'hole_number'>): string {
  return `m:${c.table}:${c.match_id}:${c.player_id}:${c.hole_number}`
}

/** After a refusal, at most one recovery this often — a phone the server keeps refusing backs off. */
export const RECOVER_GAP_MS = 60_000

/**
 * Fold new entries into a queue, newest answer per hole winning.
 *
 * In place where the key is already queued, appended where it is not — so the
 * order a phone sends in is the order the holes were first played, which is
 * the order they read in a log when something has gone wrong.
 */
export function mergeEntries(queue: Entry[], incoming: Entry[]): Entry[] {
  const out = queue.slice()
  for (const entry of incoming) {
    const at = out.findIndex(e => e.key === entry.key)
    if (at >= 0) out[at] = entry
    else out.push(entry)
  }
  return out
}

/**
 * Read a queue back out of storage, dropping anything that is not plainly a
 * whole entry. A partial row is not repaired into a guess — see the note at
 * the top of this file.
 */
export function parseQueue(raw: string | null): Entry[] {
  if (!raw) return []
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(parsed)) return []

  const out: Entry[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const e = item as Record<string, unknown>
    if (typeof e.key !== 'string' || typeof e.seq !== 'number' || typeof e.at !== 'number') continue
    const trip = typeof e.trip === 'string' && e.trip ? { trip: e.trip } : {}

    if (e.kind === 'save') {
      const r = e.row as Record<string, unknown> | undefined
      if (!r || typeof r !== 'object') continue
      if (typeof r.player_id !== 'string' || typeof r.round_id !== 'string') continue
      if (typeof r.hole_number !== 'number' || typeof r.gross_score !== 'number') continue
      if (typeof r.stableford_points !== 'number') continue
      out.push({
        kind: 'save', key: e.key, seq: e.seq, at: e.at, ...trip,
        row: {
          player_id: r.player_id, round_id: r.round_id, hole_number: r.hole_number,
          gross_score: r.gross_score, stableford_points: r.stableford_points,
          fairway_hit: typeof r.fairway_hit === 'boolean' ? r.fairway_hit : null,
          putts: typeof r.putts === 'number' ? r.putts : null,
          committed: r.committed === true,
        },
      })
      continue
    }

    if (e.kind === 'clear') {
      const t = e.target as Record<string, unknown> | undefined
      if (!t || typeof t !== 'object') continue
      if (typeof t.player_id !== 'string' || typeof t.round_id !== 'string') continue
      if (typeof t.hole_number !== 'number') continue
      out.push({
        kind: 'clear', key: e.key, seq: e.seq, at: e.at, ...trip,
        target: { player_id: t.player_id, round_id: t.round_id, hole_number: t.hole_number },
      })
      continue
    }

    if (e.kind === 'match') {
      const c = e.cell as Record<string, unknown> | undefined
      if (!c || typeof c !== 'object') continue
      if (c.table !== 'match_scores' && c.table !== 'session_match_scores') continue
      if (typeof c.match_id !== 'string' || typeof c.trip_id !== 'string' || typeof c.player_id !== 'string') continue
      if (typeof c.hole_number !== 'number') continue
      if (c.gross !== null && typeof c.gross !== 'number') continue
      if (typeof e.clear !== 'boolean') continue
      out.push({
        kind: 'match', key: e.key, seq: e.seq, at: e.at, ...trip, clear: e.clear,
        cell: {
          table: c.table, match_id: c.match_id, trip_id: c.trip_id,
          player_id: c.player_id, hole_number: c.hole_number, gross: c.gross as number | null,
        },
      })
    }
  }
  return out
}

/** The batch a queue would send: saves together, clears together. */
export function batchOf(queue: Entry[]): Batch {
  return {
    saves: queue.filter((e): e is Extract<Entry, { kind: 'save' }> => e.kind === 'save').map(e => e.row),
    clears: queue.filter((e): e is Extract<Entry, { kind: 'clear' }> => e.kind === 'clear').map(e => e.target),
    match: queue.filter((e): e is Extract<Entry, { kind: 'match' }> => e.kind === 'match').map(e => ({ cell: e.cell, clear: e.clear })),
  }
}

export interface Outbox {
  /** Queue a hole (or several). Returns once it is safely stored, not once sent. `trip`: the event's code. */
  save(rows: ScoreRow[], trip?: string): void
  /** Queue the removal of a hole from the card. */
  clear(targets: ClearTarget[], trip?: string): void
  /** Queue one box on a match play card — a gross, an NR (null), or `clear` to take it off. */
  match(cell: MatchCell, clear: boolean, trip?: string): void
  /** How many holes are still waiting — all of them, or those `which` picks. */
  pending(which?: (e: Entry) => boolean): number
  /** The queue itself, for a caller that needs to know whose holes are waiting. */
  entries(): Entry[]
  /** Try now. Resolves to the number still waiting afterwards — 0 means clean. */
  flush(): Promise<number>
  /** The signal is back (or the phone woke): forget the backoff and send at once. */
  nudge(): Promise<number>
  /** Forget everything queued for this round, after it has been committed or voided. */
  discardRound(roundId: string, playerIds?: string[]): void
  /** Forget a match card's queued boxes, after it has been voided. */
  discardMatch(matchId: string): void
  /** Told whenever the pending count changes — of all, or those `which` picks — so a screen can show it. */
  subscribe(listener: (pending: number) => void, which?: (e: Entry) => boolean): () => void
  /** Stop the retry timer. For a component unmounting in a test. */
  stop(): void
}

export function createOutbox(deps: OutboxDeps): Outbox {
  const now = deps.now ?? (() => Date.now())
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearTimer = deps.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const isOnline = deps.isOnline ?? (() => true)
  const storage = deps.storage ?? null

  let queue: Entry[] = fresh(parseQueue(storage?.getItem(STORAGE_KEY) ?? null))
  let seq = queue.reduce((n, e) => Math.max(n, e.seq), 0)
  let listeners: { fn: (pending: number) => void; which?: (e: Entry) => boolean }[] = []
  let lastRecover = -Infinity
  let timer: unknown = null
  let attempt = 0
  let flushing = false
  /** A flush asked for while one was in flight. Run once, after, not nested. */
  let again = false

  /** Everything still young enough to be worth sending. */
  function fresh(entries: Entry[]): Entry[] {
    const cutoff = now() - MAX_AGE_MS
    return entries.filter(e => e.at >= cutoff)
  }

  function persist() {
    if (!storage) return
    try {
      if (queue.length === 0) storage.removeItem(STORAGE_KEY)
      else storage.setItem(STORAGE_KEY, JSON.stringify(queue))
    } catch {
      // A full or disabled store is not a reason to lose the hole in memory:
      // the queue still flushes from this session. Nothing to tell the player
      // that they could act on, so nothing is said.
    }
  }

  const count = (which?: (e: Entry) => boolean) => (which ? queue.filter(which).length : queue.length)

  function announce() {
    for (const l of listeners) l.fn(count(l.which))
  }

  function changed() {
    persist()
    announce()
  }

  function schedule() {
    if (timer !== null) return
    const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]
    timer = setTimer(() => { timer = null; void flush() }, wait)
  }

  function cancel() {
    if (timer === null) return
    clearTimer(timer)
    timer = null
  }

  function enqueue(entries: Entry[]) {
    queue = mergeEntries(queue, entries)
    changed()
    // A fresh hole resets the climb: the last failure may have been a dead
    // spot the group has since walked out of, and the next hole should not
    // wait thirty seconds to find that out.
    attempt = 0
    cancel()
    void flush()
  }

  async function flush(): Promise<number> {
    if (flushing) { again = true; return queue.length }
    queue = fresh(queue)

    if (queue.length === 0) { changed(); return 0 }
    if (!isOnline()) { schedule(); return queue.length }

    flushing = true
    const sent = queue.slice()
    let retryNow = false
    try {
      // The limit uses the real clock, not the injected retry timers: it is
      // about the radio, and a test that walks the backoff by hand must not
      // fire it.
      let limit: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          deps.send(batchOf(sent)),
          new Promise<never>((_, reject) => { limit = setTimeout(() => reject(new Error('send timed out')), SEND_TIMEOUT_MS) }),
        ])
      } finally {
        clearTimeout(limit)
      }
      // Only what actually went, and only where it has not been answered
      // again since: a hole re-entered mid-flight keeps its newer value.
      const sentSeq = new Map(sent.map(e => [e.key, e.seq]))
      queue = queue.filter(e => sentSeq.get(e.key) !== e.seq)
      attempt = 0
      changed()
    } catch (e) {
      // Refused by the server, not lost on the radio: sign back in and enter
      // the events these holes belong to, then try again straight away —
      // at most once a minute, so a phone the server keeps refusing falls
      // back to the ordinary backoff and the holes simply wait.
      if (isRefused(e) && deps.recover && now() - lastRecover >= RECOVER_GAP_MS) {
        lastRecover = now()
        const trips = [...new Set(sent.map(x => x.trip).filter((t): t is string => !!t))]
        retryNow = await deps.recover(trips).catch(() => false)
      }
      if (!retryNow) {
        attempt++
        schedule()
      }
    } finally {
      flushing = false
    }

    if (retryNow) { again = false; return flush() }

    if (again) { again = false; return flush() }
    return queue.length
  }

  return {
    save(rows, trip) {
      if (rows.length === 0) return
      const at = now()
      enqueue(rows.map(row => ({
        kind: 'save' as const,
        key: keyOf(row.player_id, row.round_id, row.hole_number),
        seq: ++seq, at, ...(trip ? { trip } : {}), row,
      })))
    },
    clear(targets, trip) {
      if (targets.length === 0) return
      const at = now()
      enqueue(targets.map(target => ({
        kind: 'clear' as const,
        key: keyOf(target.player_id, target.round_id, target.hole_number),
        seq: ++seq, at, ...(trip ? { trip } : {}), target,
      })))
    },
    match(cell, clear, trip) {
      enqueue([{ kind: 'match', key: matchKeyOf(cell), seq: ++seq, at: now(), ...(trip ? { trip } : {}), cell, clear }])
    },
    nudge() {
      attempt = 0
      cancel()
      return flush()
    },
    pending: count,
    entries: () => queue.slice(),
    flush,
    discardRound(roundId, playerIds) {
      queue = queue.filter(e => {
        if (e.kind === 'match') return true
        const rid = e.kind === 'save' ? e.row.round_id : e.target.round_id
        const pid = e.kind === 'save' ? e.row.player_id : e.target.player_id
        if (rid !== roundId) return true
        return playerIds ? !playerIds.includes(pid) : false
      })
      changed()
    },
    discardMatch(matchId) {
      queue = queue.filter(e => !(e.kind === 'match' && e.cell.match_id === matchId))
      changed()
    },
    subscribe(listener, which) {
      const l = { fn: listener, which }
      listeners.push(l)
      listener(count(which))
      return () => { listeners = listeners.filter(x => x !== l) }
    },
    stop: cancel,
  }
}
