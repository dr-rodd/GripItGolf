import { createAdminClient } from '@/lib/supabase-admin'
import { stravaConfig } from '@/lib/strava'
import { RUN_ACTIVITIES, type RunActivity } from '@/lib/runChallenge'
import type { BoardRun } from '@/lib/runBoards'
import { readAllRows } from '@/lib/allRows'

/**
 * A challenge's runs, read on the server — the only reader there is.
 *
 * The `runs` table is closed to the browser (migration 053: RLS on, no
 * policies), so this reads it on the service role and nothing else can.
 * Pages turn what comes back into totals before anything reaches a phone;
 * a runner's own runs are the only rows ever sent out whole, and only to
 * that runner (the Add tab).
 *
 * Never throws. `ready: false` with a reason when the runs cannot be read —
 * migration 053 not applied yet, or the server key missing (a preview
 * deploy without it) — so a page can say so once instead of showing a
 * board of zeroes as though nobody had run.
 */

export type StoredRun = BoardRun & {
  id: string
  source: 'manual' | 'strava'
  minutes: number | null
  createdAt: string
  /** What recorded a Strava run, when Strava said (migration 054). */
  deviceName: string | null
  /** Strava's own id for a Strava run — its "View on Strava" link. */
  stravaId: number | null
}

export type RunsRead =
  | { ready: true; runs: StoredRun[] }
  | { ready: false; runs: []; reason: 'migration' | 'unavailable' }

const KNOWN = new Set<string>(RUN_ACTIVITIES.map(a => a.key))

export async function fetchRuns(tripId: string): Promise<RunsRead> {
  let admin
  try {
    admin = createAdminClient()
  } catch {
    return { ready: false, runs: [], reason: 'unavailable' }
  }

  // device_name arrived with migration 054; until it runs, read without it
  // rather than lose the whole board to one missing column.
  //
  // Read whole, in pages (lib/allRows.ts). A single select stops at 1,000 —
  // thirty runners running daily for a month — and newest first, so it was
  // the *oldest* runs that went: totals stalling while people kept running,
  // and a frozen final result missing the first weeks. `id` ends the order
  // so it is total, which is what lets pages neither overlap nor skip.
  const read = (cols: string) => readAllRows<Record<string, unknown>>(
    () => admin.from('runs')
      .select(cols, { count: 'exact' })
      .eq('trip_id', tripId)
      .order('run_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }),
    r => String(r.id),
  )
  const BASE = 'id, player_id, source, activity, run_date, distance_m, moving_s, created_at, strava_activity_id'
  let { data, error } = await read(`${BASE}, device_name`)
  if (error && /device_name/i.test(error.message ?? '')) ({ data, error } = await read(BASE))

  if (error) {
    const missing = /runs|relation|schema cache/i.test(error.message ?? '')
    if (!missing) console.error('fetchRuns failed:', error)
    return { ready: false, runs: [], reason: missing ? 'migration' : 'unavailable' }
  }

  return {
    ready: true,
    runs: (data ?? [])
      .filter(r => KNOWN.has(String(r.activity)))
      .map(r => ({
        id: r.id as string,
        playerId: r.player_id as string,
        source: r.source === 'strava' ? 'strava' : 'manual',
        activity: r.activity as RunActivity,
        date: String(r.run_date).slice(0, 10),
        distanceM: r.distance_m as number,
        minutes: typeof r.moving_s === 'number' ? Math.round(r.moving_s / 60) : null,
        createdAt: r.created_at as string,
        deviceName: typeof r.device_name === 'string' ? r.device_name : null,
        stravaId: r.strava_activity_id === null || r.strava_activity_id === undefined
          ? null : Number(r.strava_activity_id),
      })),
  }
}

/** What a page says when the runs could not be read. */
export function runsUnavailableMessage(reason: 'migration' | 'unavailable'): string {
  return reason === 'migration'
    ? 'Runs need a database update that has not been applied yet (migration 053).'
    : 'Runs could not be loaded just now — try again in a moment.'
}

export type StravaStatus =
  | { state: 'off' }                       // Strava not set up on this site
  | { state: 'unready' }                   // migration 054 not applied yet
  | { state: 'disconnected' }
  | { state: 'connected'; lastSyncedAt: string | null }

/**
 * Whether this runner's Strava is connected in this challenge — read on the
 * server, because the links table is closed to the browser (migration 054).
 * Nothing about the connection beyond that leaves here; never a token.
 */
export async function fetchStravaStatus(tripId: string, playerId: string | null): Promise<StravaStatus> {
  if (!stravaConfig()) return { state: 'off' }
  if (!playerId) return { state: 'disconnected' }
  let admin
  try { admin = createAdminClient() } catch { return { state: 'off' } }
  const { data, error } = await admin.from('strava_links')
    .select('last_synced_at')
    .eq('player_id', playerId)
    .eq('trip_id', tripId)
    .maybeSingle()
  if (error) return { state: 'unready' }
  return data ? { state: 'connected', lastSyncedAt: data.last_synced_at ?? null } : { state: 'disconnected' }
}
