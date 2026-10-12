import { createAdminClient } from '@/lib/supabase-admin'
import { RUN_ACTIVITIES, type RunActivity } from '@/lib/runChallenge'
import type { BoardRun } from '@/lib/runBoards'

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

  const { data, error } = await admin
    .from('runs')
    .select('id, player_id, source, activity, run_date, distance_m, moving_s, created_at')
    .eq('trip_id', tripId)
    .order('run_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    const missing = /runs|relation|schema cache/i.test(error.message ?? '')
    if (!missing) console.error('fetchRuns failed:', error)
    return { ready: false, runs: [], reason: missing ? 'migration' : 'unavailable' }
  }

  return {
    ready: true,
    runs: (data ?? [])
      .filter(r => KNOWN.has(r.activity))
      .map(r => ({
        id: r.id as string,
        playerId: r.player_id as string,
        source: r.source === 'strava' ? 'strava' : 'manual',
        activity: r.activity as RunActivity,
        date: String(r.run_date).slice(0, 10),
        distanceM: r.distance_m as number,
        minutes: typeof r.moving_s === 'number' ? Math.round(r.moving_s / 60) : null,
        createdAt: r.created_at as string,
      })),
  }
}

/** What a page says when the runs could not be read. */
export function runsUnavailableMessage(reason: 'migration' | 'unavailable'): string {
  return reason === 'migration'
    ? 'Runs need a database update that has not been applied yet (migration 053).'
    : 'Runs could not be loaded just now — try again in a moment.'
}
