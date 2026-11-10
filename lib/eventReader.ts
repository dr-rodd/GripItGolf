// The server's reader for one event (row-level security, stage 2).
//
// Server pages used to read with `lib/supabase.ts` — the browser's own key.
// From stage 3 the trip tables answer that key only for a phone that is a
// member, and the server is nobody's phone, so every server read moves here:
// the service role, which row-level security never refuses. That is safe only
// because of the one rule this file exists to hold:
//
//   **A reader is built from one event's code, and every query it makes is
//   fixed to that event.** It cannot return another event's rows, whatever
//   the page asks for.
//
// How each table is fixed (`SCOPES`):
//
// * `trips` — to the row with this code.
// * a table with `trip_id` — to this event's id: looked up once, or taken
//   from the first `trips` row read through the reader, so a page that reads
//   its trip first pays nothing extra.
// * a table keyed by round (`scores`, `live_scores`, …) — to this event's
//   rounds: their ids read once, by the code, alongside the page's first
//   query rather than after it.
// * the platform's shared course tables — not event data; read as they are.
// * any other table — refused. A new table is one line in `SCOPES`, and
//   `test:event-reader` fails on a server read of one that is not there.
//
// **Read only.** `insert`, `update`, `upsert` and `delete` throw at once:
// server pages read, and the browser writes through its own client.
//
// `from()` hands back the same query builder type supabase-js does, so a page
// changes `supabase.from(…)` to `db.from(…)` and nothing else. Underneath it
// is a recording of the calls, replayed with the event's filter added the
// moment it is awaited. Server only: the service role key never reaches a
// browser (`test:client-boundary` holds that no client file imports this).

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from './supabase-admin'

export type Scope = 'trip-row' | 'trip' | 'round' | 'platform'

/** Every table a server page may read, and how it is fixed to the event. */
export const SCOPES = {
  trips: 'trip-row',

  players: 'trip',
  teams: 'trip',
  team_members: 'trip',
  rounds: 'trip',
  itinerary_items: 'trip',
  matchplay_matches: 'trip',
  tee_times: 'trip',
  tee_assignments: 'trip',
  event_messages: 'trip',
  match_scores: 'trip',
  match_concessions: 'trip',
  session_matches: 'trip',
  session_match_scores: 'trip',

  scores: 'round',
  live_scores: 'round',
  round_handicaps: 'round',
  live_rounds: 'round',
  composite_holes: 'round',

  courses: 'platform',
  holes: 'platform',
  tees: 'platform',
  hole_tee_yardages: 'platform',
} as const satisfies Record<string, Scope>

export type EventTable = keyof typeof SCOPES

export function scopeOf(table: string): Scope | null {
  return (SCOPES as Record<string, Scope>)[table] ?? null
}

/** The only thing a server page needs from a client: `from`, with supabase-js's own types. */
export type Reads = Pick<SupabaseClient, 'from'>

export interface EventReader extends Reads {
  /** The code the reader was built from, exactly as handed in. */
  readonly code: string
  /** This event's id, or null when no event has the code (or it could not be read). */
  id(): Promise<string | null>
}

const WRITES = new Set(['insert', 'update', 'upsert', 'delete'])

type Result = { data: unknown; error: unknown; count?: number | null; status?: number; statusText?: string }

/** The answer a query gets when the event it is fixed to does not exist. */
function noEvent(calls: [string, unknown[]][]): Result {
  const one = calls.some(([m]) => m === 'single' || m === 'maybeSingle')
  return { data: one ? null : [], error: null, count: 0, status: 200, statusText: 'OK' }
}

/**
 * Build the reader. `admin` is injectable so `test:event-reader` can run it
 * against a stand-in that records what was asked.
 */
export function makeEventReader(code: string, admin: Reads): EventReader {
  let knownId: string | null = null
  let idLookup: Promise<string | null> | null = null
  let tripsInFlight: Promise<unknown> | null = null
  let roundLookup: Promise<string[] | null> | null = null

  function harvest(data: unknown) {
    if (knownId) return
    const row = Array.isArray(data) ? data[0] : data
    const id = (row as { id?: unknown } | null)?.id
    if (typeof id === 'string' && id) knownId = id
  }

  async function id(): Promise<string | null> {
    if (knownId) return knownId
    if (tripsInFlight) {
      await tripsInFlight.catch(() => null)
      if (knownId) return knownId
    }
    idLookup ??= Promise.resolve(admin.from('trips').select('id').eq('trip_code', code).maybeSingle())
      .then(({ data, error }) => {
        if (error) { idLookup = null; return null }
        harvest(data)
        return knownId
      })
      .catch(() => { idLookup = null; return null })
    return idLookup
  }

  /** This event's round ids, by its code — no wait for its id. Null: could not be read. */
  function roundIds(): Promise<string[] | null> {
    roundLookup ??= Promise.resolve(admin.from('rounds')
      .select('id, trips!inner(trip_code)')
      .eq('trips.trip_code', code))
      .then(({ data, error }) => {
        if (error) { roundLookup = null; return null }
        return ((data ?? []) as { id: string }[]).map(r => r.id)
      })
      .catch(() => { roundLookup = null; return null })
    return roundLookup
  }

  function query(table: string) {
    const scope = scopeOf(table)
    if (!scope) {
      throw new Error(`The event reader does not read "${table}". Add it to SCOPES in lib/eventReader.ts, saying how it is fixed to one event.`)
    }
    const calls: [string, unknown[]][] = []
    let started: Promise<Result> | null = null

    async function execute(): Promise<Result> {
      if (calls[0]?.[0] !== 'select') {
        throw new Error(`The event reader reads only: a query on "${table}" must start with select().`)
      }
      // Kick the round ids off with the page's first query, not after it.
      if (scope === 'trip-row' || scope === 'round') void roundIds()

      let q = (admin.from(table) as unknown as { select: (...a: unknown[]) => unknown })
        .select(...calls[0][1]) as Record<string, (...a: unknown[]) => unknown>

      if (scope === 'trip-row') {
        q = q.eq('trip_code', code) as typeof q
      } else if (scope === 'trip') {
        const tripId = await id()
        if (!tripId) return noEvent(calls)
        q = q.eq('trip_id', tripId) as typeof q
      } else if (scope === 'round') {
        const ids = await roundIds()
        if (ids === null) return { data: null, error: { message: 'Could not read this event’s rounds.' }, count: null }
        q = q.in('round_id', ids) as typeof q
      }

      for (const [method, args] of calls.slice(1)) {
        const fn = q[method]
        if (typeof fn !== 'function') throw new Error(`The event reader cannot pass on .${method}().`)
        q = fn.apply(q, args) as typeof q
      }
      const res = (await (q as unknown as PromiseLike<Result>)) as Result
      if (scope === 'trip-row' && !res.error) harvest(res.data)
      return res
    }

    function run(): Promise<Result> {
      if (!started) {
        started = execute()
        if (scope === 'trip-row') tripsInFlight = started
      }
      return started
    }

    const recorder: unknown = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (ok?: (v: Result) => unknown, bad?: (e: unknown) => unknown) => run().then(ok, bad)
        }
        if (prop === 'catch') return (bad?: (e: unknown) => unknown) => run().catch(bad)
        if (prop === 'finally') return (f?: () => void) => run().finally(f)
        if (typeof prop !== 'string') return undefined
        if (WRITES.has(prop)) {
          return () => { throw new Error(`The event reader reads only — .${prop}() on "${table}" belongs to the browser's client.`) }
        }
        return (...args: unknown[]) => {
          if (started) throw new Error('The event reader cannot add to a query once it has been run.')
          calls.push([prop, args])
          return recorder
        }
      },
    })
    return recorder
  }

  return {
    code,
    id,
    from: query as unknown as SupabaseClient['from'],
  }
}

/**
 * The reader for one event, once per request: the layout, the page and every
 * helper they call share it, so the id and the round ids are read once.
 */
export const eventReader = cache((code: string): EventReader => makeEventReader(code, createAdminClient()))
