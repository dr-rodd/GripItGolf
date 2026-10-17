import { unstable_cache, revalidateTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-admin'
import { stravaConfig, isGarmin, GARMIN_LIKE } from '@/lib/strava'
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
 * Two readers, for two jobs:
 *
 * - **`fetchBoardRuns`, for the screens.** Every board needs every run in
 *   the challenge, but only four things about each, so it asks for those —
 *   about half the bytes of a whole row, and data sent out of Supabase is
 *   what its free plan meters. The challenge's runs are then **kept on the
 *   server for a few minutes** (`BOARD_CACHE_SECONDS`), so a busy board is
 *   one database read every few minutes rather than one per look; the
 *   viewer's own runs are always read fresh and laid over the top, so a run
 *   somebody has just logged is on their own screens at once, and everybody
 *   else's within minutes.
 * - **`fetchRuns`, for the final result.** Whole rows, never cached: the
 *   freeze is for keeps, so it reads the database itself.
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

/** One run as a board reads it: whose, what, when, how far, and from where. */
export type BoardRunRow = BoardRun & { source: 'manual' | 'strava' }

export type BoardRunsRead =
  | {
      ready: true
      /** Everybody's runs — the viewer's freshly read, everyone else's from the server's copy. */
      runs: BoardRunRow[]
      /** Whether any Strava run here came off a Garmin (§4.4's credit line). */
      garmin: boolean
      /** The viewer's own runs, whole and fresh — the Add tab's list. */
      mine: StoredRun[]
    }
  | { ready: false; runs: []; garmin: false; mine: []; reason: 'migration' | 'unavailable' }

type Reason = 'migration' | 'unavailable'

/**
 * How long a board's copy of the runs is kept before the next look reads
 * again. Long enough that a busy challenge is a few reads an hour, short
 * enough that a run reaches everybody else's board within minutes.
 */
export const BOARD_CACHE_SECONDS = 300

/**
 * The oldest copy a board will ever show. Past `BOARD_CACHE_SECONDS` the
 * copy is refreshed behind the next look, which would otherwise show that
 * look whatever the copy held — after a quiet week, a week-old one. Past
 * this the look reads the database instead. It is also what keeps a Strava
 * run from outliving Strava's limits in the copy: deleted runs leave every
 * board within ten minutes, far inside §6.3's forty-eight hours, and no
 * copy is anywhere near §6.2's seven days.
 */
export const BOARD_MAX_AGE_MS = 10 * 60_000

/** The tag a challenge's board copy carries — cleared when a runner's data goes. */
export const runsCacheTag = (tripId: string) => `runs:${tripId}`

const KNOWN = new Set<string>(RUN_ACTIVITIES.map(a => a.key))

/** Whole runs, newest first — a challenge's, or one runner's in it. */
async function readStoredRuns(admin: SupabaseClient, tripId: string, playerId?: string): Promise<RunsRead> {
  // device_name arrived with migration 054; until it runs, read without it
  // rather than lose the whole board to one missing column.
  //
  // Read whole, in pages (lib/allRows.ts). A single select stops at 1,000 —
  // thirty runners running daily for a month — and newest first, so it was
  // the *oldest* runs that went: totals stalling while people kept running,
  // and a frozen final result missing the first weeks. `id` ends the order
  // so it is total, which is what lets pages neither overlap nor skip.
  const read = (cols: string) => readAllRows<Record<string, unknown>>(
    () => {
      const q = admin.from('runs')
        .select(cols, { count: 'exact' })
        .eq('trip_id', tripId)
      return (playerId ? q.eq('player_id', playerId) : q)
        .order('run_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
    },
    r => String(r.id),
  )
  const BASE = 'id, player_id, source, activity, run_date, distance_m, moving_s, created_at, strava_activity_id'
  let { data, error } = await read(`${BASE}, device_name`)
  if (error && /device_name/i.test(error.message ?? '')) ({ data, error } = await read(BASE))

  if (error) return failed(error)

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

function failed(error: { message?: string }): { ready: false; runs: []; reason: Reason } {
  const missing = /runs|relation|schema cache/i.test(error.message ?? '')
  if (!missing) console.error('runs read failed:', error)
  return { ready: false, runs: [], reason: missing ? 'migration' : 'unavailable' }
}

/** Every run in the challenge, whole and straight from the database — the final result's read. */
export async function fetchRuns(tripId: string): Promise<RunsRead> {
  let admin
  try {
    admin = createAdminClient()
  } catch {
    return { ready: false, runs: [], reason: 'unavailable' }
  }
  return readStoredRuns(admin, tripId)
}

/** A board's own read: four columns a run, and one count for the Garmin credit. */
async function readBoardRuns(
  admin: SupabaseClient, tripId: string,
): Promise<{ runs: BoardRunRow[]; garmin: boolean } | { reason: Reason }> {
  const [res, garminRes] = await Promise.all([
    readAllRows<Record<string, unknown>>(
      () => admin.from('runs')
        .select('id, player_id, source, activity, run_date, distance_m', { count: 'exact' })
        .eq('trip_id', tripId)
        .order('run_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
      r => String(r.id),
    ),
    // Whether, not which: a header-only count. Before migration 054 there is
    // no device column, the count fails, and the answer is simply no.
    admin.from('runs')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', tripId)
      .eq('source', 'strava')
      .ilike('device_name', GARMIN_LIKE),
  ])
  if (res.error) return { reason: failed(res.error).reason }
  return {
    runs: res.data
      .filter(r => KNOWN.has(String(r.activity)))
      .map(r => ({
        playerId: r.player_id as string,
        source: r.source === 'strava' ? 'strava' : 'manual',
        activity: r.activity as RunActivity,
        date: String(r.run_date).slice(0, 10),
        distanceM: r.distance_m as number,
      })),
    garmin: !garminRes.error && (garminRes.count ?? 0) > 0,
  }
}

/** Carries a failed read out of the cached function, so a failure is never what gets kept. */
class ReadFailed extends Error {
  constructor(readonly reason: Reason) { super(`runs read failed: ${reason}`) }
}

/** The challenge's runs as the server's copy holds them, or freshly when it cannot. */
async function sharedBoardRuns(
  admin: SupabaseClient, tripId: string,
): Promise<{ runs: BoardRunRow[]; garmin: boolean } | { reason: Reason }> {
  try {
    const copy = await unstable_cache(
      async () => {
        const r = await readBoardRuns(admin, tripId)
        if ('reason' in r) throw new ReadFailed(r.reason)
        return { at: Date.now(), ...r }
      },
      ['run-board-runs', tripId],
      { revalidate: BOARD_CACHE_SECONDS, tags: [runsCacheTag(tripId)] },
    )()
    if (Date.now() - copy.at <= BOARD_MAX_AGE_MS) return copy
  } catch (e) {
    if (e instanceof ReadFailed) return { reason: e.reason }
    // No cache to keep a copy in — a script, a test — so read as before.
  }
  return readBoardRuns(admin, tripId)
}

/**
 * Everybody's runs, with the viewer's own replaced by a fresh read of
 * them — the one rule for laying a runner's runs over the server's copy,
 * so a run just logged or removed is reflected for its runner at once,
 * and so is a Disconnect.
 */
export function withViewerRuns(
  shared: BoardRunRow[], viewerId: string | null, mine: StoredRun[],
): BoardRunRow[] {
  if (!viewerId) return shared
  return [
    ...shared.filter(r => r.playerId !== viewerId),
    ...mine.map(r => ({
      playerId: r.playerId, source: r.source, activity: r.activity, date: r.date, distanceM: r.distanceM,
    })),
  ]
}

/**
 * Drop a challenge's board copy now, so the next look anywhere reads the
 * database — for a runner taking their data away (Disconnect, Leave and
 * delete my data), whose runs should leave everybody's board at once, not
 * within `BOARD_MAX_AGE_MS`. Their own screens never needed it: those read
 * their runs fresh. Never throws — the data is already gone from the
 * database by the time this is called, and the copy cannot outlive ten
 * minutes whatever happens here.
 */
export function forgetBoardCopy(tripId: string): void {
  try {
    revalidateTag(runsCacheTag(tripId), { expire: 0 })
  } catch (e) {
    console.error('could not clear the run board copy:', e)
  }
}

/**
 * Every run a board needs — see the note at the top. `client` is for the
 * tests, which hand in an in-memory database; the pages leave it out.
 */
export async function fetchBoardRuns(
  tripId: string, viewerId: string | null, client?: SupabaseClient,
): Promise<BoardRunsRead> {
  let admin
  try {
    admin = client ?? createAdminClient()
  } catch {
    return { ready: false, runs: [], garmin: false, mine: [], reason: 'unavailable' }
  }
  const [shared, own] = await Promise.all([
    sharedBoardRuns(admin, tripId),
    viewerId ? readStoredRuns(admin, tripId, viewerId) : Promise.resolve<RunsRead>({ ready: true, runs: [] }),
  ])
  if ('reason' in shared) return { ready: false, runs: [], garmin: false, mine: [], reason: shared.reason }
  if (!own.ready) return { ready: false, runs: [], garmin: false, mine: [], reason: own.reason }
  return {
    ready: true,
    runs: withViewerRuns(shared.runs, viewerId, own.runs),
    garmin: shared.garmin || own.runs.some(r => r.source === 'strava' && isGarmin(r.deviceName)),
    mine: own.runs,
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
